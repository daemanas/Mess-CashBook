const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const MoneyAdd = require('../models/moneyAdd');
const VagetableExpense = require('../models/moneyExpenses');
const MealUser = require('../models/mealUser');
const { buildExcel, buildPdf } = require('../util/settlementExports');
const {
    calculateSettlement,
    getFinalSettlementData,
    parseStrictPeriod
} = require('../services/finalSettlement');

test('calculates settlement from only the selected month using existing balance rules', () => {
    const period = parseStrictPeriod({ month: '2', year: '2026' });
    const data = calculateSettlement({
        period,
        expenseTotal: 60,
        users: [
            {
                name: 'Asha',
                meals: [
                    { date: new Date('2026-01-31T12:00:00'), food_count: 7 },
                    { date: new Date('2026-02-05T12:00:00'), food_count: 2 },
                    { date: new Date('2026-03-01T00:00:00'), food_count: 9 }
                ]
            },
            { name: 'Bina', meals: [{ date: new Date('2026-02-10T12:00:00'), food_count: 1 }] },
            { name: 'Cora', meals: [{ date: new Date('2026-02-11T12:00:00'), food_count: 1 }] },
            { name: 'Danu', meals: [{ date: new Date('2026-02-12T12:00:00'), food_count: 2 }] }
        ],
        payments: [
            { _id: 'Asha', totalPaid: 100 },
            { _id: 'Bina', totalPaid: 20 },
            { _id: 'Cora', totalPaid: 10 }
        ]
    });

    assert.equal(data.grandTotalFood, 6);
    assert.equal(data.perMealPrice, 10);
    assert.deepEqual(
        Object.fromEntries(data.settlement.map(row => [row.name, row.status])),
        { Asha: 'RECEIVE', Bina: 'RECEIVE', Cora: 'CLEAR', Danu: 'DUE' }
    );
    assert.deepEqual(data.totals, { paid: 130, payable: 60, receive: 90, due: 20 });
});

test('rejects invalid reporting periods instead of falling back to the current month', () => {
    assert.equal(parseStrictPeriod({ month: '13', year: '2026' }), null);
    assert.equal(parseStrictPeriod({ month: '2', year: '2026abc' }), null);
    assert.equal(parseStrictPeriod({ month: '2', year: '1969' }), null);
    assert.equal(parseStrictPeriod({ month: ['2'], year: '2026' }), null);
});

test('scopes settlement and detail queries to the authenticated group and selected month', async () => {
    const originals = {
        expenseAggregate: VagetableExpense.aggregate,
        expenseFind: VagetableExpense.find,
        mealFind: MealUser.find,
        paymentAggregate: MoneyAdd.aggregate,
        paymentFind: MoneyAdd.find
    };
    const calls = {};
    const queryResult = value => ({
        sort() { return this; },
        lean() { return Promise.resolve(value); }
    });

    VagetableExpense.aggregate = pipeline => {
        calls.expenseMatch = pipeline[0].$match;
        return Promise.resolve([]);
    };
    VagetableExpense.find = filter => {
        calls.expenseDetails = filter;
        return queryResult([]);
    };
    MealUser.find = filter => {
        calls.meals = filter;
        return queryResult([]);
    };
    MoneyAdd.aggregate = pipeline => {
        calls.paymentMatch = pipeline[0].$match;
        return Promise.resolve([]);
    };
    MoneyAdd.find = filter => {
        calls.paymentDetails = filter;
        return queryResult([]);
    };

    try {
        const period = parseStrictPeriod({ month: '2', year: '2026' });
        await getFinalSettlementData({ groupId: 'group-one', period, includeDetails: true });

        const expectedRange = {
            $gte: period.start.toISOString(),
            $lt: period.end.toISOString()
        };
        assert.equal(calls.meals.groupId, 'group-one');
        [calls.expenseMatch, calls.paymentMatch, calls.expenseDetails, calls.paymentDetails].forEach(filter => {
            assert.equal(filter.groupId, 'group-one');
            assert.deepEqual({
                $gte: filter.entry_date.$gte.toISOString(),
                $lt: filter.entry_date.$lt.toISOString()
            }, expectedRange);
        });
    } finally {
        VagetableExpense.aggregate = originals.expenseAggregate;
        VagetableExpense.find = originals.expenseFind;
        MealUser.find = originals.mealFind;
        MoneyAdd.aggregate = originals.paymentAggregate;
        MoneyAdd.find = originals.paymentFind;
    }
});

test('builds a paginated PDF and a four-sheet Excel workbook', async () => {
    const period = parseStrictPeriod({ month: '2', year: '2026' });
    const settlement = Array.from({ length: 50 }, (_, index) => ({
        name: `Member ${index + 1}`,
        foodCount: 1,
        paidAmount: 20,
        payableAmount: 10,
        finalBalance: 10,
        status: 'RECEIVE'
    }));
    const data = {
        period,
        settlement,
        expenseTotal: 500,
        grandTotalFood: 50,
        perMealPrice: 10,
        totals: { paid: 1000, payable: 500, receive: 500, due: 0 },
        expenseDetails: [{ entry_date: new Date('2026-02-01'), vag_name: 'Vegetables', entry_amount: 500 }],
        paymentDetails: [{ entry_date: new Date('2026-02-02'), entry_title: 'Member 1', entry_amount: 20 }]
    };

    const [pdf, excelBuffer] = await Promise.all([
        buildPdf({ data, groupName: 'Test Mess', adminName: 'Admin' }),
        buildExcel({ data, groupName: 'Test Mess' })
    ]);

    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1);
    assert.equal(excelBuffer.subarray(0, 2).toString(), 'PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excelBuffer);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), [
        'Monthly Summary',
        'Member Settlement',
        'Expense Details',
        'Money Added Details'
    ]);
    assert.equal(workbook.getWorksheet('Monthly Summary').getCell('B3').value, 'February 2026');
    assert.equal(workbook.getWorksheet('Member Settlement').rowCount, 51);
});
