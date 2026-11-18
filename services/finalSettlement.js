const MoneyAdd = require('../models/moneyAdd');
const VagetableExpense = require('../models/moneyExpenses');
const MealUser = require('../models/mealUser');

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function titleKey(value) {
    return String(value || '').trim().toLowerCase();
}

function createPeriod(month, year) {
    return {
        month,
        year,
        monthName: MONTH_NAMES[month - 1],
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 1),
        startDate: new Date(year, month - 1, 1),
        endDate: new Date(year, month, 1)
    };
}

function parseStrictPeriod(query = {}) {
    if (typeof query.month !== 'string' || !/^\d{1,2}$/.test(query.month)) return null;
    if (typeof query.year !== 'string' || !/^\d{4}$/.test(query.year)) return null;

    const month = Number(query.month);
    const year = Number(query.year);
    if (month < 1 || month > 12 || year < 1970 || year > 2100) return null;

    return createPeriod(month, year);
}

function calculateSettlement({ users, payments, expenseTotal: rawExpenseTotal, period }) {
    const expenseTotal = round2(rawExpenseTotal);
    let grandTotalFood = 0;
    const usersWithFood = users.map(entry => {
        const userFood = round2(entry.meals
            .filter(meal => {
                const date = new Date(meal.date);
                return date >= period.start && date < period.end;
            })
            .reduce((sum, meal) => sum + (Number(meal.food_count) || 0), 0));

        grandTotalFood += userFood;
        return { name: entry.name, userFood };
    });

    const perMealPrice = grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;
    const paymentMap = new Map();
    payments.forEach(payment => {
        if (!payment._id) return;
        paymentMap.set(titleKey(payment._id), round2(payment.totalPaid));
    });

    const totals = { paid: 0, payable: 0, receive: 0, due: 0 };
    const settlement = usersWithFood
        .filter(entry => entry.userFood > 0 || paymentMap.get(titleKey(entry.name)))
        .map(entry => {
            const paidAmount = round2(paymentMap.get(titleKey(entry.name)) || 0);
            const payableAmount = round2(entry.userFood * perMealPrice);
            const finalBalance = round2(paidAmount - payableAmount);

            totals.paid += paidAmount;
            totals.payable += payableAmount;
            if (finalBalance > 0) totals.receive += finalBalance;
            if (finalBalance < 0) totals.due += Math.abs(finalBalance);

            return {
                name: entry.name,
                foodCount: entry.userFood,
                paidAmount,
                payableAmount,
                finalBalance,
                status: finalBalance > 0 ? 'RECEIVE' : finalBalance < 0 ? 'DUE' : 'CLEAR'
            };
        })
        .sort((a, b) => b.payableAmount - a.payableAmount);

    return {
        settlement,
        perMealPrice: round2(perMealPrice),
        expenseTotal,
        grandTotalFood: round2(grandTotalFood),
        totals: {
            paid: round2(totals.paid),
            payable: round2(totals.payable),
            receive: round2(totals.receive),
            due: round2(totals.due)
        }
    };
}

async function getFinalSettlementData({ groupId, period, includeDetails = false }) {
    const dateRange = { $gte: period.start, $lt: period.end };
    const queries = [
        VagetableExpense.aggregate([
            { $match: { groupId, entry_date: dateRange } },
            { $group: { _id: null, total: { $sum: '$entry_amount' } } }
        ]),
        MealUser.find({ groupId }).sort({ name: 1 }).lean(),
        MoneyAdd.aggregate([
            { $match: { groupId, entry_date: dateRange } },
            { $group: { _id: '$entry_title', totalPaid: { $sum: '$entry_amount' } } }
        ])
    ];

    if (includeDetails) {
        queries.push(
            VagetableExpense.find({ groupId, entry_date: dateRange })
                .sort({ entry_date: 1, _id: 1 })
                .lean(),
            MoneyAdd.find({ groupId, entry_date: dateRange })
                .sort({ entry_date: 1, _id: 1 })
                .lean()
        );
    }

    const [expenseResult, users, payments, expenseDetails = [], paymentDetails = []] = await Promise.all(queries);
    const calculated = calculateSettlement({
        users,
        payments,
        expenseTotal: expenseResult[0]?.total || 0,
        period
    });

    return {
        ...calculated,
        period,
        expenseDetails,
        paymentDetails
    };
}

module.exports = {
    calculateSettlement,
    createPeriod,
    getFinalSettlementData,
    parseStrictPeriod,
    round2,
    titleKey
};
