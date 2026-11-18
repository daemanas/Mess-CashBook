const User = require('../models/User');
const SettlementEmail = require('../models/SettlementEmail');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const MoneyAdd = require('../models/moneyAdd');
const VagetableExpense = require('../models/moneyExpenses');
const MealUser = require('../models/mealUser');
const {
    createPeriod,
    getFinalSettlementData,
    parseStrictPeriod,
    round2,
    titleKey
} = require('../services/finalSettlement');
const { buildExcel, buildPdf } = require('../util/settlementExports');
const { sendSettlementEmail, settlementEmailTemplate } = require('../util/mailer');
const {
    isMessAccount,
    getAccountScope,
    getRecordOwnership,
    accountId
} = require('../util/account');

/* =========================
   Small helpers
========================= */

function parsePeriod(query = {}, now = new Date()) {
    const requestedMonth = Number.parseInt(query.month, 10);
    const requestedYear = Number.parseInt(query.year, 10);

    const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : now.getMonth() + 1;

    const year = Number.isInteger(requestedYear) && requestedYear >= 1970 && requestedYear <= 2100
        ? requestedYear
        : now.getFullYear();

    return createPeriod(month, year);
}

function parseAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Math.round(amount * 100) / 100;
}

function parseDateInput(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value, max = 120) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
}

function dateKey(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Admin and every personal account may modify their own records; mess members may not. */
function canManageRecords(user) {
    return Boolean(user) && (!isMessAccount(user) || user.role === 'admin');
}

function deny(res, message, hint) {
    return res.status(403).render('host/error', {
        status: 403,
        title: 'Access denied',
        message,
        hint: hint || 'You do not have permission to perform this action.'
    });
}

function currentUser(req) {
    return req.session && req.session.user ? req.session.user : null;
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedGroupAdmin(req) {
    const sessionUser = currentUser(req);
    if (!sessionUser || sessionUser.role !== 'admin' || !sessionUser.groupId) return null;

    const admin = await User.findById(sessionUser.id)
        .select('name email role groupId messName')
        .lean();
    if (!admin || admin.role !== 'admin' || !admin.groupId
        || String(admin.groupId) !== String(sessionUser.groupId)) {
        return null;
    }
    return admin;
}

function invalidPeriodResponse(res) {
    return res.status(400).render('host/error', {
        status: 400,
        title: 'Invalid reporting period',
        message: 'Choose a valid month and year before requesting a settlement report.',
        hint: 'Month must be between 1 and 12, and year must be between 1970 and 2100.'
    });
}

function groupNameFor(admin) {
    return cleanText(admin.messName, 120) || 'Mess';
}

function redirectToSettlement(res, period, requestId) {
    const params = new URLSearchParams({
        month: String(period.month),
        year: String(period.year),
        emailRequestId: requestId
    });
    return res.redirect(`/final-settlement?${params.toString()}`);
}

function validSessionToken(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string'
        || actual.length !== expected.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function isEmail(value) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function settingsRedirect(res, key, message, edit) {
    const editQuery = edit ? `&edit=${encodeURIComponent(edit)}` : '';
    return res.redirect(`/settings?${key}=${encodeURIComponent(message)}${editQuery}`);
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => error ? reject(error) : resolve());
    });
}

function refreshSessionUser(req, user) {
    req.session.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        groupId: user.groupId,
        messName: user.messName || null
    };
}

function creationDateFromId(id) {
    return id && typeof id.getTimestamp === 'function' ? id.getTimestamp() : null;
}

/* =========================
   Dashboard
========================= */

exports.getIndex = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const accountScope = getAccountScope(user);
        const groupAccount = isMessAccount(user);
        const period = parsePeriod(req.query);
        const dateRange = { $gte: period.start, $lt: period.end };

        const trendMonths = [];
        for (let offset = 5; offset >= 0; offset -= 1) {
            const cursor = new Date(period.year, period.month - 1 - offset, 1);
            trendMonths.push({
                year: cursor.getFullYear(),
                month: cursor.getMonth() + 1,
                label: cursor.toLocaleDateString('en-IN', { month: 'short' })
            });
        }
        const trendRange = {
            $gte: new Date(trendMonths[0].year, trendMonths[0].month - 1, 1),
            $lt: period.end
        };

        const incomePromise = MoneyAdd.aggregate([
            { $match: { ...accountScope, entry_date: dateRange } },
            { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
        ]);

        const trendIncomePromise = MoneyAdd.aggregate([
            { $match: { ...accountScope, entry_date: trendRange } },
            {
                $group: {
                    _id: { year: { $year: '$entry_date' }, month: { $month: '$entry_date' } },
                    total: { $sum: '$entry_amount' }
                }
            }
        ]);

        const trendExpensePromise = VagetableExpense.aggregate([
            { $match: { ...accountScope, entry_date: trendRange } },
            {
                $group: {
                    _id: { year: { $year: '$entry_date' }, month: { $month: '$entry_date' } },
                    total: { $sum: '$entry_amount' }
                }
            }
        ]);

        const expensePromise = VagetableExpense.aggregate([
            { $match: { ...accountScope, entry_date: dateRange } },
            { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
        ]);

        const mealPromise = groupAccount
            ? MealUser.aggregate([
                { $match: { ...accountScope } },
                { $unwind: '$meals' },
                { $match: { 'meals.date': dateRange } },
                { $group: { _id: null, total: { $sum: '$meals.food_count' } } }
            ])
            : Promise.resolve([]);

        const memberPromise = groupAccount
            ? User.countDocuments({ groupId: user.groupId, isVerified: true })
            : Promise.resolve(0);

        const moneyLogsPromise = MoneyAdd.find({ ...accountScope, entry_date: dateRange })
            .populate('user', 'name')
            .sort({ entry_date: -1, createdAt: -1 })
            .limit(10)
            .lean();

        const expenseLogsPromise = VagetableExpense.find({ ...accountScope, entry_date: dateRange })
            .populate('user', 'name')
            .sort({ entry_date: -1, createdAt: -1 })
            .limit(10)
            .lean();

        const mealLogsPromise = groupAccount
            ? MealUser.find({ ...accountScope }).sort({ updatedAt: -1 }).limit(20).lean()
            : Promise.resolve([]);

        const [
            incomeResult,
            trendIncomeResult,
            trendExpenseResult,
            expenseResult,
            mealResult,
            memberCount,
            moneyLogs,
            expenseLogs,
            mealLogs
        ] = await Promise.all([
            incomePromise,
            trendIncomePromise,
            trendExpensePromise,
            expensePromise,
            mealPromise,
            memberPromise,
            moneyLogsPromise,
            expenseLogsPromise,
            mealLogsPromise
        ]);

        const incomeTotal = round2(incomeResult[0]?.total || 0);
        const incomeCount = incomeResult[0]?.count || 0;
        const expenseTotal = round2(expenseResult[0]?.total || 0);
        const expenseCount = expenseResult[0]?.count || 0;
        const availableBalance = round2(incomeTotal - expenseTotal);
        const grandTotalFood = round2(mealResult[0]?.total || 0);
        const perMealPrice = grandTotalFood > 0 ? round2(expenseTotal / grandTotalFood) : 0;

        const trendIncomeMap = new Map(
            trendIncomeResult.filter(row => row._id).map(row => [row._id.year * 100 + row._id.month, row.total])
        );
        const trendExpenseMap = new Map(
            trendExpenseResult.filter(row => row._id).map(row => [row._id.year * 100 + row._id.month, row.total])
        );
        const trend = trendMonths.map(month => {
            const key = month.year * 100 + month.month;
            const income = round2(trendIncomeMap.get(key) || 0);
            const expense = round2(trendExpenseMap.get(key) || 0);
            return { ...month, income, expense, balance: round2(income - expense) };
        });
        const trendMax = trend.reduce((max, row) => Math.max(max, row.income, row.expense), 1);

        const recentTransactions = [
            ...moneyLogs.map(item => ({
                date: item.entry_date,
                createdAt: item.createdAt,
                title: groupAccount ? 'Contribution' : (item.entry_title || 'Income'),
                detail: groupAccount
                    ? [
                        item.entry_title,
                        item.user?.name && titleKey(item.user.name) !== titleKey(item.entry_title)
                            ? `by ${item.user.name}`
                            : null
                    ].filter(Boolean).join(' · ')
                    : 'Income received',
                amount: Number(item.entry_amount) || 0,
                type: 'income'
            })),
            ...expenseLogs.map(item => ({
                date: item.entry_date,
                createdAt: item.createdAt,
                title: item.vag_name || 'Expense',
                detail: item.user?.name ? `by ${item.user.name}` : 'Expense paid',
                amount: Number(item.entry_amount) || 0,
                type: 'expense'
            })),
            ...mealLogs.flatMap(entry => entry.meals
                .filter(meal => {
                    const d = new Date(meal.date);
                    return d >= period.start && d < period.end;
                })
                .map(meal => ({
                    date: meal.date,
                    createdAt: meal.date,
                    title: `${entry.name} · meal`,
                    detail: 'Meal count',
                    amount: Number(meal.food_count) || 0,
                    type: 'meal'
                })))
        ]
            .sort((a, b) =>
                new Date(b.date) - new Date(a.date) ||
                new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
            .slice(0, 8);

        return res.render('host/index', {
            profile: user,
            isGroupAccount: groupAccount,
            period,
            month: period.month,
            year: period.year,
            periodLabel: period.label,
            incomeTotal,
            incomeCount,
            expenseTotal,
            expenseCount,
            availableBalance,
            grandTotalFood,
            perMealPrice,
            memberCount,
            transactionCount: incomeCount + expenseCount,
            recentTransactions,
            trend,
            trendMax
        });
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Income / contribution entry
========================= */

exports.getAddEntry = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const groupAccount = isMessAccount(user);
        let members = [];

        if (groupAccount) {
            const [moneyNames, mealNames] = await Promise.all([
                MoneyAdd.distinct('entry_title', { groupId: user.groupId }),
                MealUser.distinct('name', { groupId: user.groupId })
            ]);
            members = Array.from(new Set([...moneyNames, ...mealNames].filter(Boolean))).sort();
        }

        return res.render('host/Add-Entry', {
            title: cleanText(req.query.title, 60),
            members,
            isGroupAccount: groupAccount,
            entryDate: dateKey(new Date()),
            error: null,
            form: null
        });
    } catch (error) {
        return next(error);
    }
};

exports.postAddEntry = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const groupAccount = isMessAccount(user);
        const ownership = getRecordOwnership(user);

        const entryDate = parseDateInput(req.body.entry_date);
        const amount = parseAmount(req.body.entry_amount);
        const rawTitle = cleanText(req.body.entry_title, 80);

        const form = {
            entry_title: rawTitle,
            entry_amount: req.body.entry_amount,
            entry_date: req.body.entry_date
        };

        const errors = [];
        if (!entryDate) errors.push('Please choose a valid date.');
        if (amount === null) errors.push('Amount must be a number greater than zero.');
        if (groupAccount && !rawTitle) errors.push('Please enter the member name.');
        if (!groupAccount && !rawTitle) errors.push('Please enter an income source.');

        if (errors.length) {
            let members = [];
            if (groupAccount) {
                members = await MoneyAdd.distinct('entry_title', { groupId: user.groupId });
            }
            return res.status(400).render('host/Add-Entry', {
                title: rawTitle,
                members,
                isGroupAccount: groupAccount,
                entryDate: dateKey(entryDate || new Date()),
                error: errors[0],
                form
            });
        }

        const entryTitle = groupAccount ? titleKey(rawTitle) : rawTitle;

        await MoneyAdd.create({
            entry_title: entryTitle,
            entry_amount: amount,
            entry_date: entryDate,
            ...ownership
        });

        if (groupAccount) {
            const existingLedger = await MealUser.findOne({
                name: entryTitle,
                groupId: user.groupId
            });
            if (!existingLedger) {
                await MealUser.create({
                    name: entryTitle,
                    meals: [],
                    groupId: user.groupId,
                    user: ownership.user
                });
            }
        }

        return res.redirect('/moneyAdded?saved=1');
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Expenses
========================= */

exports.getAddExpense = (req, res) => {
    return res.render('host/AddExpense', {
        entryDate: dateKey(new Date()),
        error: null,
        form: null
    });
};

exports.postAddExpense = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const ownership = getRecordOwnership(user);

        const entryDate = parseDateInput(req.body.entry_date);
        const titles = toArray(req.body.vag_name);
        const amounts = toArray(req.body.entry_amount);

        const rows = [];
        const rowCount = Math.max(titles.length, amounts.length);
        for (let i = 0; i < rowCount; i += 1) {
            const name = cleanText(titles[i], 80);
            const rawAmount = amounts[i];
            if (!name && (rawAmount === undefined || rawAmount === '')) continue;
            rows.push({ name, rawAmount, amount: parseAmount(rawAmount) });
        }

        const errors = [];
        if (!entryDate) errors.push('Please choose a valid date.');
        if (!rows.length) errors.push('Add at least one expense item.');
        if (rows.some(row => !row.name)) errors.push('Every expense item needs a title.');
        if (rows.some(row => row.amount === null)) errors.push('Every amount must be greater than zero.');

        if (errors.length) {
            return res.status(400).render('host/AddExpense', {
                entryDate: dateKey(entryDate || new Date()),
                error: errors[0],
                form: { entry_date: req.body.entry_date, entries: rows }
            });
        }

        await VagetableExpense.insertMany(rows.map(row => ({
            entry_date: entryDate,
            vag_name: row.name,
            entry_amount: row.amount,
            ...ownership
        })));

        return res.redirect('/expentionAdded?saved=1');
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Meals (mess accounts only)
========================= */

exports.getAddMeal = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Meal management is only available for mess accounts.');
        }

        const members = await MoneyAdd.distinct('entry_title', { groupId: user.groupId });

        return res.render('host/AddMeal', {
            members: members.filter(Boolean).sort(),
            entryDate: dateKey(new Date()),
            error: null,
            form: null
        });
    } catch (error) {
        return next(error);
    }
};

exports.postAddMeal = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Meal management is only available for mess accounts.');
        }

        const memberName = titleKey(req.body.name);
        const foodCount = parseAmount(req.body.food_count);
        const form = { name: req.body.name, food_count: req.body.food_count };

        const renderError = async (message, status = 400) => {
            const members = await MoneyAdd.distinct('entry_title', { groupId: user.groupId });
            return res.status(status).render('host/AddMeal', {
                members: members.filter(Boolean).sort(),
                entryDate: dateKey(new Date()),
                error: message,
                form
            });
        };

        if (!memberName) return renderError('Please choose a member.');
        if (foodCount === null) return renderError('Meal count must be greater than zero.');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let ledger = await MealUser.findOne({ name: memberName, groupId: user.groupId });
        if (!ledger) {
            ledger = await MealUser.create({
                name: memberName,
                meals: [],
                groupId: user.groupId,
                user: accountId(user)
            });
        }

        const alreadyAdded = ledger.meals.some(meal => dateKey(meal.date) === dateKey(today));
        if (alreadyAdded) {
            return renderError('A meal count for this member is already recorded today.');
        }

        ledger.meals.push({ date: today, food_count: foodCount });
        await ledger.save();

        return res.redirect('/AddedMeal?saved=1');
    } catch (error) {
        return next(error);
    }
};

exports.getAddedMeal = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Meal management is only available for mess accounts.');
        }

        const period = parsePeriod(req.query);
        const users = await MealUser.find({ groupId: user.groupId }).sort({ name: 1 });

        let grandTotalFood = 0;

        const usersWithTotal = users.map(entry => {
            const filteredMeals = entry.meals
                .filter(meal => {
                    const d = new Date(meal.date);
                    return d >= period.start && d < period.end;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const userTotal = round2(filteredMeals.reduce((sum, meal) => sum + (Number(meal.food_count) || 0), 0));
            grandTotalFood += userTotal;

            return {
                _id: entry._id,
                name: entry.name,
                meals: filteredMeals,
                userTotal
            };
        }).filter(entry => entry.meals.length > 0 || entry.userTotal > 0);

        return res.render('host/AddedMeal', {
            users: usersWithTotal,
            grandTotalFood: round2(grandTotalFood),
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label
        });
    } catch (error) {
        return next(error);
    }
};

exports.getMealBilling = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Meal billing is only available for mess accounts.');
        }

        const period = parsePeriod(req.query);
        const dateRange = { $gte: period.start, $lt: period.end };

        const [expenseResult, users] = await Promise.all([
            VagetableExpense.aggregate([
                { $match: { groupId: user.groupId, entry_date: dateRange } },
                { $group: { _id: null, total: { $sum: '$entry_amount' } } }
            ]),
            MealUser.find({ groupId: user.groupId }).sort({ name: 1 })
        ]);

        const expenseTotal = round2(expenseResult[0]?.total || 0);

        let grandTotalFood = 0;
        const billingUsers = users.map(entry => {
            const userTotalFood = round2(entry.meals
                .filter(meal => {
                    const d = new Date(meal.date);
                    return d >= period.start && d < period.end;
                })
                .reduce((sum, meal) => sum + (Number(meal.food_count) || 0), 0));

            grandTotalFood += userTotalFood;
            return { name: entry.name, userTotalFood };
        }).filter(entry => entry.userTotalFood > 0);

        const perMealPrice = grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;
        const finalBillingUsers = billingUsers.map(entry => ({
            ...entry,
            payableAmount: round2(entry.userTotalFood * perMealPrice)
        }));

        return res.render('host/MealBilling', {
            perMealPrice: round2(perMealPrice),
            billingUsers: finalBillingUsers,
            grandTotalFood: round2(grandTotalFood),
            expenseTotal,
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label
        });
    } catch (error) {
        return next(error);
    }
};

exports.getFinalSettlement = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Final settlement is only available for mess accounts.');
        }

        const period = parsePeriod(req.query);
        const data = await getFinalSettlementData({ groupId: user.groupId, period });
        const isGroupAdmin = user.role === 'admin';
        let groupName = cleanText(user.messName, 120) || 'Mess';
        let groupMembers = [];
        let emailResult = null;
        let reportRequestId = null;

        if (isGroupAdmin) {
            const admin = await authenticatedGroupAdmin(req);
            if (admin) {
                groupName = groupNameFor(admin);
                reportRequestId = crypto.randomUUID();
                if (!req.session.settlementEmailCsrfToken) {
                    req.session.settlementEmailCsrfToken = crypto.randomBytes(32).toString('hex');
                }
                groupMembers = await User.find({ groupId: admin.groupId, role: 'member' })
                    .select('name email')
                    .sort({ name: 1 })
                    .lean();
                groupMembers = groupMembers.map(member => {
                    const email = normalizeEmail(member.email);
                    return {
                        name: member.name || 'Member',
                        email,
                        valid: EMAIL_PATTERN.test(email)
                    };
                });

                if (typeof req.query.emailRequestId === 'string'
                    && REQUEST_ID_PATTERN.test(req.query.emailRequestId)) {
                    emailResult = await SettlementEmail.findOne({
                        requestId: req.query.emailRequestId,
                        groupId: admin.groupId,
                        requestedBy: admin._id
                    }).lean();
                }
            }
        }

        return res.render('host/FinalSettlement', {
            ...data,
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label,
            isGroupAdmin: Boolean(isGroupAdmin && reportRequestId),
            groupName,
            groupMembers,
            reportRequestId,
            emailCsrfToken: req.session.settlementEmailCsrfToken || null,
            emailResult
        });
    } catch (error) {
        return next(error);
    }
};

exports.getFinalSettlementPdf = async (req, res, next) => {
    try {
        const admin = await authenticatedGroupAdmin(req);
        if (!admin) return deny(res, 'Only the current group admin can export the complete settlement report.');

        const period = parseStrictPeriod(req.query);
        if (!period) return invalidPeriodResponse(res);

        const data = await getFinalSettlementData({
            groupId: admin.groupId,
            period,
            includeDetails: true
        });
        const pdf = await buildPdf({
            data,
            groupName: groupNameFor(admin),
            adminName: admin.name || admin.email
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="messbook-settlement-${period.year}-${String(period.month).padStart(2, '0')}.pdf"`
        );
        return res.send(pdf);
    } catch (error) {
        return next(error);
    }
};

exports.getFinalSettlementExcel = async (req, res, next) => {
    try {
        const admin = await authenticatedGroupAdmin(req);
        if (!admin) return deny(res, 'Only the current group admin can export the complete settlement report.');

        const period = parseStrictPeriod(req.query);
        if (!period) return invalidPeriodResponse(res);

        const data = await getFinalSettlementData({
            groupId: admin.groupId,
            period,
            includeDetails: true
        });
        const workbook = await buildExcel({ data, groupName: groupNameFor(admin) });

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="messbook-settlement-${period.year}-${String(period.month).padStart(2, '0')}.xlsx"`
        );
        return res.send(Buffer.from(workbook));
    } catch (error) {
        return next(error);
    }
};

exports.postEmailFinalSettlement = async (req, res, next) => {
    let delivery;
    let period;
    try {
        const admin = await authenticatedGroupAdmin(req);
        if (!admin) return deny(res, 'Only the current group admin can email the group settlement report.');

        period = parseStrictPeriod(req.body);
        if (!period) return invalidPeriodResponse(res);
        if (typeof req.body.requestId !== 'string' || !REQUEST_ID_PATTERN.test(req.body.requestId)) {
            return res.status(400).render('host/error', {
                status: 400,
                title: 'Invalid report request',
                message: 'The report request could not be verified. Reopen the confirmation dialog and try again.'
            });
        }
        if (!validSessionToken(req.body.csrfToken, req.session.settlementEmailCsrfToken)) {
            return res.status(403).render('host/error', {
                status: 403,
                title: 'Request could not be verified',
                message: 'Reopen the settlement email confirmation and try again.'
            });
        }
        const format = req.body.format;
        if (format !== 'pdf' && format !== 'pdf-excel') {
            return res.status(400).render('host/error', {
                status: 400,
                title: 'Invalid report format',
                message: 'Choose either PDF or PDF + Excel attachments.'
            });
        }
        if (req.body.confirmSend !== 'yes') {
            return res.status(400).render('host/error', {
                status: 400,
                title: 'Confirmation required',
                message: 'Confirm the recipients and report format before sending.'
            });
        }

        const requestId = req.body.requestId;
        const groupId = admin.groupId;
        const existing = await SettlementEmail.findOne({ requestId }).lean();
        if (existing) {
            if (String(existing.groupId) !== String(groupId)
                || String(existing.requestedBy) !== String(admin._id)
                || existing.month !== period.month
                || existing.year !== period.year
                || existing.format !== format) {
                return deny(res, 'This report request does not belong to your group.');
            }
            return redirectToSettlement(res, period, requestId);
        }

        try {
            delivery = await SettlementEmail.create({
                requestId,
                groupId,
                month: period.month,
                year: period.year,
                requestedBy: admin._id,
                format,
                status: 'sending'
            });
        } catch (error) {
            if (error.code !== 11000) throw error;
            const duplicate = await SettlementEmail.findOne({ requestId }).lean();
            if (!duplicate || String(duplicate.groupId) !== String(groupId)
                || String(duplicate.requestedBy) !== String(admin._id)
                || duplicate.month !== period.month
                || duplicate.year !== period.year
                || duplicate.format !== format) {
                return deny(res, 'This report request does not belong to your group.');
            }
            return redirectToSettlement(res, period, requestId);
        }

        try {
            const members = await User.find({ groupId, role: 'member' })
                .select('name email')
                .sort({ name: 1 })
                .lean();
            const recipients = [];
            const skippedRecipients = [];

            members.forEach(member => {
                const email = normalizeEmail(member.email);
                if (!EMAIL_PATTERN.test(email)) {
                    skippedRecipients.push({
                        name: member.name || 'Member',
                        email,
                        reason: email ? 'Invalid email address' : 'Missing email address'
                    });
                    return;
                }
                recipients.push({ name: member.name || 'Member', email });
            });

            delivery.skippedRecipients = skippedRecipients;
            await delivery.save();
            if (!recipients.length) {
                delivery.status = 'failed';
                await delivery.save();
                return redirectToSettlement(res, period, requestId);
            }

            const data = await getFinalSettlementData({
                groupId,
                period,
                includeDetails: true
            });
            const groupName = groupNameFor(admin);
            const pdf = await buildPdf({
                data,
                groupName,
                adminName: admin.name || admin.email
            });
            const attachments = [{
                filename: `messbook-settlement-${period.year}-${String(period.month).padStart(2, '0')}.pdf`,
                content: pdf,
                contentType: 'application/pdf'
            }];
            if (format === 'pdf-excel') {
                const excel = await buildExcel({ data, groupName });
                attachments.push({
                    filename: `messbook-settlement-${period.year}-${String(period.month).padStart(2, '0')}.xlsx`,
                    content: Buffer.from(excel),
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }

            const safeGroupName = groupName.replace(/[\r\n]+/g, ' ').trim();
            const subject = `MESSBOOK – Monthly Final Settlement – ${period.label} – ${safeGroupName}`;
            for (const recipient of recipients) {
                const memberSettlement = data.settlement.find(
                    row => titleKey(row.name) === titleKey(recipient.name)
                ) || {
                    name: recipient.name,
                    foodCount: 0,
                    paidAmount: 0,
                    payableAmount: 0,
                    finalBalance: 0,
                    status: 'CLEAR'
                };
                try {
                    const info = await sendSettlementEmail({
                        to: recipient.email,
                        subject,
                        html: settlementEmailTemplate({
                            member: memberSettlement,
                            groupName,
                            periodLabel: period.label
                        }),
                        attachments
                    });
                    delivery.recipients.push({
                        name: recipient.name,
                        email: recipient.email,
                        status: 'sent',
                        messageId: info.messageId || null
                    });
                } catch (error) {
                    delivery.recipients.push({
                        name: recipient.name,
                        email: recipient.email,
                        status: 'failed',
                        error: cleanText(error.message, 240) || 'Email delivery failed'
                    });
                }
                await delivery.save();
            }

            const sentCount = delivery.recipients.filter(recipient => recipient.status === 'sent').length;
            delivery.status = sentCount === recipients.length
                ? 'sent'
                : sentCount > 0 ? 'partial' : 'failed';
            await delivery.save();
            return redirectToSettlement(res, period, requestId);
        } catch (error) {
            delivery.status = delivery.recipients.length ? 'partial' : 'failed';
            await delivery.save();
            throw error;
        }
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Lists
========================= */

exports.getMoneyAdded = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const period = parsePeriod(req.query);
        const groupAccount = isMessAccount(user);

        const entries = await MoneyAdd.find({
            ...getAccountScope(user),
            entry_date: { $gte: period.start, $lt: period.end }
        }).sort({ entry_date: -1, createdAt: -1 });

        const groupedData = new Map();
        let grandTotal = 0;

        entries.forEach(entry => {
            const title = entry.entry_title || 'Contribution';
            const amount = Number(entry.entry_amount) || 0;

            if (!groupedData.has(title)) {
                groupedData.set(title, { title, entries: [], total: 0 });
            }

            const group = groupedData.get(title);
            group.entries.push(entry);
            group.total += amount;
            grandTotal += amount;
        });

        const groups = Array.from(groupedData.values())
            .map(group => ({ ...group, total: round2(group.total) }))
            .sort((a, b) => b.total - a.total);

        return res.render('host/moneyAdded', {
            groups,
            grandTotal: round2(grandTotal),
            entryCount: entries.length,
            isGroupAccount: groupAccount,
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label
        });
    } catch (error) {
        return next(error);
    }
};

exports.getExpenseAdded = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const period = parsePeriod(req.query);

        const expenses = await VagetableExpense.find({
            ...getAccountScope(user),
            entry_date: { $gte: period.start, $lt: period.end }
        }).sort({ entry_date: -1, createdAt: -1 });

        const groupedByDate = new Map();
        let grandTotal = 0;

        expenses.forEach(item => {
            const key = dateKey(item.entry_date);

            if (!groupedByDate.has(key)) {
                groupedByDate.set(key, { key, date: item.entry_date, items: [], total: 0 });
            }

            const card = groupedByDate.get(key);
            card.items.push({
                _id: item._id,
                name: item.vag_name,
                amount: Number(item.entry_amount) || 0
            });
            card.total += Number(item.entry_amount) || 0;
            grandTotal += Number(item.entry_amount) || 0;
        });

        const expenseCards = Array.from(groupedByDate.values())
            .map(card => ({ ...card, total: round2(card.total) }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.render('host/AddedExpention', {
            expenseCards,
            grandTotal: round2(grandTotal),
            entryCount: expenses.length,
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label
        });
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Transactions
========================= */

exports.getTransactions = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const accountScope = getAccountScope(user);
        const period = parsePeriod(req.query);

        const parsedPage = Number.parseInt(req.query.page, 10);
        const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const limit = 12;

        const { from, to, type, search } = req.query;
        const validType = ['income', 'expense'].includes(type) ? type : '';

        let rangeStart = period.start;
        let rangeEnd = period.end;

        const fromDate = from ? parseDateInput(from) : null;
        const toDate = to ? parseDateInput(to) : null;
        if (fromDate && fromDate > rangeStart) rangeStart = fromDate;
        if (toDate) {
            const dayAfter = new Date(toDate);
            dayAfter.setDate(dayAfter.getDate() + 1);
            if (dayAfter < rangeEnd) rangeEnd = dayAfter;
        }

        const dateFilter = { $gte: rangeStart, $lt: rangeEnd };
        const searchTerm = cleanText(search, 60);
        const searchFilter = searchTerm ? { $regex: escapeRegex(searchTerm), $options: 'i' } : null;

        const incomeQuery = (!validType || validType === 'income')
            ? MoneyAdd.find({
                ...accountScope,
                entry_date: dateFilter,
                ...(searchFilter && { entry_title: searchFilter })
            }).lean()
            : Promise.resolve([]);

        const expenseQuery = (!validType || validType === 'expense')
            ? VagetableExpense.find({
                ...accountScope,
                entry_date: dateFilter,
                ...(searchFilter && { vag_name: searchFilter })
            }).lean()
            : Promise.resolve([]);

        const [incomes, expenses] = await Promise.all([incomeQuery, expenseQuery]);

        const transactions = [
            ...incomes.map(item => ({
                _id: item._id,
                date: item.entry_date,
                createdAt: item.createdAt,
                title: item.entry_title,
                category: 'Income',
                amount: Number(item.entry_amount) || 0,
                type: 'income'
            })),
            ...expenses.map(item => ({
                _id: item._id,
                date: item.entry_date,
                createdAt: item.createdAt,
                title: item.vag_name,
                category: 'Expense',
                amount: Number(item.entry_amount) || 0,
                type: 'expense'
            }))
        ].sort((a, b) =>
            new Date(b.date) - new Date(a.date) ||
            new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

        const totalIncome = round2(transactions
            .filter(item => item.type === 'income')
            .reduce((sum, item) => sum + item.amount, 0));
        const totalExpense = round2(transactions
            .filter(item => item.type === 'expense')
            .reduce((sum, item) => sum + item.amount, 0));

        const totalItems = transactions.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));
        const currentPage = Math.min(requestedPage, totalPages);
        const skip = (currentPage - 1) * limit;
        const paginatedTransactions = transactions.slice(skip, skip + limit);

        return res.render('host/Transactions', {
            transactions: paginatedTransactions,
            currentPage,
            totalPages,
            totalItems,
            filters: {
                from: from || '',
                to: to || '',
                type: validType,
                search: searchTerm
            },
            hasFilters: Boolean(from || to || validType || searchTerm),
            totalIncome,
            totalExpense,
            net: round2(totalIncome - totalExpense),
            month: period.month,
            year: period.year,
            period,
            periodLabel: period.label,
            isGroupAccount: isMessAccount(user)
        });
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Reports
========================= */

exports.getReports = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const accountScope = getAccountScope(user);
        const period = parsePeriod(req.query);
        const groupAccount = isMessAccount(user);
        const dateRange = { $gte: period.start, $lt: period.end };

        const [incomeResult, expenseResult, categoryRows, contributorRows, dailyRows, mealResult] = await Promise.all([
            MoneyAdd.aggregate([
                { $match: { ...accountScope, entry_date: dateRange } },
                { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ]),
            VagetableExpense.aggregate([
                { $match: { ...accountScope, entry_date: dateRange } },
                { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ]),
            VagetableExpense.aggregate([
                { $match: { ...accountScope, entry_date: dateRange } },
                { $group: { _id: '$vag_name', total: { $sum: '$entry_amount' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
                { $limit: 8 }
            ]),
            MoneyAdd.aggregate([
                { $match: { ...accountScope, entry_date: dateRange } },
                { $group: { _id: '$entry_title', total: { $sum: '$entry_amount' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
                { $limit: 10 }
            ]),
            VagetableExpense.aggregate([
                { $match: { ...accountScope, entry_date: dateRange } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$entry_date' } },
                        total: { $sum: '$entry_amount' }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            groupAccount
                ? MealUser.aggregate([
                    { $match: { ...accountScope } },
                    { $unwind: '$meals' },
                    { $match: { 'meals.date': dateRange } },
                    { $group: { _id: null, total: { $sum: '$meals.food_count' } } }
                ])
                : Promise.resolve([])
        ]);

        const incomeTotal = round2(incomeResult[0]?.total || 0);
        const expenseTotal = round2(expenseResult[0]?.total || 0);
        const grandTotalFood = round2(mealResult[0]?.total || 0);

        const categoryBreakdown = categoryRows.map(row => ({
            name: row._id || 'Uncategorised',
            amount: round2(row.total),
            count: row.count,
            share: expenseTotal > 0 ? round2((row.total / expenseTotal) * 100) : 0
        }));

        const contributors = contributorRows.map(row => ({
            name: row._id || (groupAccount ? 'Unknown' : 'Income'),
            amount: round2(row.total),
            count: row.count,
            share: incomeTotal > 0 ? round2((row.total / incomeTotal) * 100) : 0
        }));

        const dailyMap = new Map(dailyRows.map(row => [row._id, round2(row.total)]));
        const dailyExpense = [];
        const cursor = new Date(period.start);
        while (cursor < period.end) {
            const key = dateKey(cursor);
            dailyExpense.push({ key, amount: dailyMap.get(key) || 0 });
            cursor.setDate(cursor.getDate() + 1);
        }
        const peakDaily = dailyExpense.reduce((max, day) => Math.max(max, day.amount), 0);
        const dailyWithHeight = dailyExpense.map(day => ({
            ...day,
            height: peakDaily > 0 ? Math.max(2, Math.round((day.amount / peakDaily) * 100)) : 0
        }));

        return res.render('host/Reports', {
            period,
            month: period.month,
            year: period.year,
            periodLabel: period.label,
            isGroupAccount: groupAccount,
            incomeTotal,
            incomeCount: incomeResult[0]?.count || 0,
            expenseTotal,
            expenseCount: expenseResult[0]?.count || 0,
            balance: round2(incomeTotal - expenseTotal),
            categoryBreakdown,
            contributors,
            dailyWithHeight,
            peakDaily,
            grandTotalFood,
            perMealPrice: grandTotalFood > 0 ? round2(expenseTotal / grandTotalFood) : 0,
            expenseShare: incomeTotal > 0 ? round2((expenseTotal / incomeTotal) * 100) : 0
        });
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Year history
========================= */

exports.getYearHistory = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const accountScope = getAccountScope(user);

        const [incomeByYear, expenseByYear] = await Promise.all([
            MoneyAdd.aggregate([
                { $match: accountScope },
                { $group: { _id: { $year: '$entry_date' }, totalIncome: { $sum: '$entry_amount' } } }
            ]),
            VagetableExpense.aggregate([
                { $match: accountScope },
                { $group: { _id: { $year: '$entry_date' }, totalExpense: { $sum: '$entry_amount' } } }
            ])
        ]);

        const yearMap = new Map();
        incomeByYear.forEach(row => {
            if (!row._id) return;
            yearMap.set(row._id, { year: row._id, income: round2(row.totalIncome), expense: 0 });
        });
        expenseByYear.forEach(row => {
            if (!row._id) return;
            if (!yearMap.has(row._id)) {
                yearMap.set(row._id, { year: row._id, income: 0, expense: 0 });
            }
            yearMap.get(row._id).expense = round2(row.totalExpense);
        });

        const years = Array.from(yearMap.values())
            .map(row => ({ ...row, balance: round2(row.income - row.expense) }))
            .sort((a, b) => b.year - a.year);

        const totalIncome = round2(years.reduce((sum, row) => sum + row.income, 0));
        const totalExpense = round2(years.reduce((sum, row) => sum + row.expense, 0));

        return res.render('host/YearHistory', {
            years,
            totalIncome,
            totalExpense,
            balance: round2(totalIncome - totalExpense),
            currentYear: new Date().getFullYear()
        });
    } catch (error) {
        return next(error);
    }
};

exports.getYearDetails = async (req, res, next) => {
    try {
        const user = currentUser(req);
        const accountScope = getAccountScope(user);
        const year = Number.parseInt(req.params.year, 10);

        if (!Number.isInteger(year) || year < 1970 || year > 2100) {
            return res.redirect('/year-history');
        }

        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);

        const [incomeByMonth, expenseByMonth] = await Promise.all([
            MoneyAdd.aggregate([
                { $match: { ...accountScope, entry_date: { $gte: start, $lt: end } } },
                { $group: { _id: { $month: '$entry_date' }, income: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ]),
            VagetableExpense.aggregate([
                { $match: { ...accountScope, entry_date: { $gte: start, $lt: end } } },
                { $group: { _id: { $month: '$entry_date' }, expense: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ])
        ]);

        const incomeMap = new Map(incomeByMonth.map(row => [row._id, row]));
        const expenseMap = new Map(expenseByMonth.map(row => [row._id, row]));

        const months = MONTH_NAMES.map((name, index) => {
            const monthNumber = index + 1;
            const income = round2(incomeMap.get(monthNumber)?.income || 0);
            const expense = round2(expenseMap.get(monthNumber)?.expense || 0);

            return {
                month: monthNumber,
                monthName: name,
                income,
                expense,
                count: (incomeMap.get(monthNumber)?.count || 0) + (expenseMap.get(monthNumber)?.count || 0),
                balance: round2(income - expense)
            };
        });

        const totalIncome = round2(months.reduce((sum, row) => sum + row.income, 0));
        const totalExpense = round2(months.reduce((sum, row) => sum + row.expense, 0));

        return res.render('host/YearDetails', {
            year,
            months,
            totalIncome,
            totalExpense,
            balance: round2(totalIncome - totalExpense),
            currentMonth: year === new Date().getFullYear() ? new Date().getMonth() + 1 : null
        });
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Settings / members
========================= */

exports.getSetting = async (req, res, next) => {
    try {
        const sessionUser = currentUser(req);
        const user = await User.findById(sessionUser.id).select('name email role groupId messName').lean();
        if (!user) {
            return req.session.destroy(() => res.redirect('/login'));
        }
        user.id = String(user._id);
        const groupAccount = isMessAccount(user);
        const [incomeAgg, expenseAgg, memberCount, groupAdmin, firstGroupUser] = await Promise.all([
            MoneyAdd.aggregate([
                { $match: getAccountScope(user) },
                { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ]),
            VagetableExpense.aggregate([
                { $match: getAccountScope(user) },
                { $group: { _id: null, total: { $sum: '$entry_amount' }, count: { $sum: 1 } } }
            ]),
            groupAccount
                ? User.countDocuments({ groupId: user.groupId, isVerified: true })
                : Promise.resolve(1),
            groupAccount
                ? User.findOne({ groupId: user.groupId, role: 'admin', isVerified: true }).select('messName').lean()
                : Promise.resolve(null),
            groupAccount
                ? User.findOne({ groupId: user.groupId, isVerified: true }).sort({ _id: 1 }).select('_id').lean()
                : Promise.resolve(null)
        ]);

        return res.render('host/Settings', {
            profile: user,
            isGroupAccount: groupAccount,
            groupName: groupAccount ? (groupAdmin?.messName || user.messName || '') : '',
            accountCreatedAt: creationDateFromId(user._id),
            groupCreatedAt: firstGroupUser ? creationDateFromId(firstGroupUser._id) : null,
            isAdmin: groupAccount && user.role === 'admin',
            memberCount,
            incomeCount: incomeAgg[0]?.count || 0,
            expenseCount: expenseAgg[0]?.count || 0,
            lifetimeIncome: round2(incomeAgg[0]?.total || 0),
            lifetimeExpense: round2(expenseAgg[0]?.total || 0),
            notice: typeof req.query.notice === 'string' ? req.query.notice : null,
            error: typeof req.query.error === 'string' ? req.query.error : null,
            activeEdit: ['profile', 'group', 'password'].includes(req.query.edit)
                && (req.query.edit !== 'group' || (groupAccount && user.role === 'admin'))
                ? req.query.edit
                : null
        });
    } catch (error) {
        return next(error);
    }
};

exports.postUpdateProfile = async (req, res, next) => {
    try {
        const sessionUser = currentUser(req);
        const user = await User.findById(sessionUser.id);
        if (!user) return res.redirect('/login');

        const submittedName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (submittedName.length > 80) {
            return settingsRedirect(res, 'error', 'Your name must be 80 characters or fewer.', 'profile');
        }
        const name = cleanText(submittedName, 80);
        const email = normalizeEmail(req.body.email);
        if (!name) return settingsRedirect(res, 'error', 'Enter your name.', 'profile');
        if (!isEmail(email)) return settingsRedirect(res, 'error', 'Enter a valid email address.', 'profile');

        const duplicate = await User.findOne({
            _id: { $ne: user._id },
            email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        }).select('_id').lean();
        if (duplicate) return settingsRedirect(res, 'error', 'That email address is already in use.', 'profile');

        user.name = name;
        user.email = email;
        await user.save();
        refreshSessionUser(req, user);
        await saveSession(req);

        return settingsRedirect(res, 'notice', 'Your profile has been updated.');
    } catch (error) {
        if (error && error.code === 11000) {
            return settingsRedirect(res, 'error', 'That email address is already in use.', 'profile');
        }
        return next(error);
    }
};

exports.postUpdateGroup = async (req, res, next) => {
    try {
        const sessionUser = currentUser(req);
        const user = await User.findById(sessionUser.id);
        if (!user) return res.redirect('/login');
        if (!isMessAccount(user) || user.role !== 'admin') {
            return deny(res, 'Only the group admin can update group information.');
        }

        const submittedMessName = typeof req.body.messName === 'string' ? req.body.messName.trim() : '';
        if (submittedMessName.length > 100) {
            return settingsRedirect(res, 'error', 'The group name must be 100 characters or fewer.', 'group');
        }
        const messName = cleanText(submittedMessName, 100);
        if (!messName) return settingsRedirect(res, 'error', 'Enter a group name.', 'group');

        const result = await User.updateMany(
            { groupId: user.groupId, isVerified: true },
            { $set: { messName } }
        );
        if (!result.matchedCount) {
            return settingsRedirect(res, 'error', 'This group could not be found.', 'group');
        }

        user.messName = messName;
        refreshSessionUser(req, user);
        await saveSession(req);

        return settingsRedirect(res, 'notice', 'Group information has been updated.');
    } catch (error) {
        return next(error);
    }
};

exports.postChangePassword = async (req, res, next) => {
    try {
        const sessionUser = currentUser(req);
        const user = await User.findById(sessionUser.id);
        if (!user) return res.redirect('/login');

        const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
        const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
        const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
        if (!user.password || !await bcrypt.compare(currentPassword, user.password)) {
            return settingsRedirect(res, 'error', 'Your current password is incorrect.', 'password');
        }
        if (newPassword.length < 8) {
            return settingsRedirect(res, 'error', 'Your new password must be at least 8 characters long.', 'password');
        }
        if (newPassword !== confirmPassword) {
            return settingsRedirect(res, 'error', 'Your new passwords do not match.', 'password');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        return settingsRedirect(res, 'notice', 'Your password has been changed.');
    } catch (error) {
        return next(error);
    }
};

exports.getGroupMembers = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user)) {
            return deny(res, 'Group members are only available for mess accounts.');
        }

        const members = await User.find({ groupId: user.groupId, isVerified: true })
            .select('name email role createdAt')
            .sort({ role: 1, name: 1 })
            .lean();

        return res.render('host/groupMembers', {
            members,
            currentUser: user,
            adminCount: members.filter(member => member.role === 'admin').length
        });
    } catch (error) {
        return next(error);
    }
};

exports.makeAdmin = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user) || user.role !== 'admin') {
            return deny(res, 'Only the mess admin can change member roles.');
        }

        await User.updateOne(
            { _id: req.params.id, groupId: user.groupId, isVerified: true },
            { $set: { role: 'admin' } }
        );

        return res.redirect('/settings/members?updated=1');
    } catch (error) {
        return next(error);
    }
};

exports.removeMember = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user) || user.role !== 'admin') {
            return deny(res, 'Only the mess admin can remove members.');
        }

        const targetId = String(req.params.id);
        if (targetId === accountId(user).toString()) {
            return deny(res, 'You cannot remove your own admin account.', 'Ask another admin to remove you if needed.');
        }

        const target = await User.findOne({ _id: targetId, groupId: user.groupId, isVerified: true });
        if (!target) {
            return res.redirect('/settings/members');
        }

        if (target.role === 'admin') {
            const adminCount = await User.countDocuments({ groupId: user.groupId, role: 'admin', isVerified: true });
            if (adminCount <= 1) {
                return deny(res, 'The mess needs at least one admin.', 'Promote another member to admin before removing this one.');
            }
        }

        // Only the login is removed; financial history stays intact for audit.
        await User.deleteOne({ _id: target._id, groupId: user.groupId });

        return res.redirect('/settings/members?removed=1');
    } catch (error) {
        return next(error);
    }
};

/* =========================
   Deletes
========================= */

exports.deleteMoneyGroup = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!canManageRecords(user)) {
            return deny(res, 'Only admins can delete contribution cards.');
        }

        const filter = { ...getAccountScope(user) };
        filter.entry_title = isMessAccount(user) ? titleKey(req.params.title) : req.params.title;

        await MoneyAdd.deleteMany(filter);

        return res.redirect('/moneyAdded?deleted=1');
    } catch (error) {
        return next(error);
    }
};

exports.deleteExpenseByDate = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!canManageRecords(user)) {
            return deny(res, 'Only admins can delete a day of expenses.');
        }

        const dateParam = parseDateInput(req.params.date);
        if (!dateParam) {
            return res.redirect('/expentionAdded');
        }

        const start = new Date(dateParam);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        await VagetableExpense.deleteMany({
            ...getAccountScope(user),
            entry_date: { $gte: start, $lt: end }
        });

        return res.redirect('/expentionAdded?deleted=1');
    } catch (error) {
        return next(error);
    }
};

exports.deleteMealUser = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user) || user.role !== 'admin') {
            return deny(res, 'Only the mess admin can delete a member meal ledger.');
        }

        await MealUser.deleteOne({ _id: req.params.id, groupId: user.groupId });

        return res.redirect('/AddedMeal?deleted=1');
    } catch (error) {
        return next(error);
    }
};

exports.deleteSingleExpense = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!canManageRecords(user)) {
            return deny(res, 'You do not have permission to delete this expense.');
        }

        await VagetableExpense.deleteOne({
            _id: req.params.id,
            ...getAccountScope(user)
        });

        return res.redirect('/expentionAdded?deleted=1');
    } catch (error) {
        return next(error);
    }
};

exports.deleteSingleMoney = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!canManageRecords(user)) {
            return deny(res, 'You do not have permission to delete this entry.');
        }

        await MoneyAdd.deleteOne({
            _id: req.params.id,
            ...getAccountScope(user)
        });

        return res.redirect('/moneyAdded?deleted=1');
    } catch (error) {
        return next(error);
    }
};

exports.deleteSingleMeal = async (req, res, next) => {
    try {
        const user = currentUser(req);
        if (!isMessAccount(user) || user.role !== 'admin') {
            return deny(res, 'Only the mess admin can delete a meal entry.');
        }

        const { userId, mealId } = req.params;

        await MealUser.updateOne(
            { _id: userId, groupId: user.groupId },
            { $pull: { meals: { _id: mealId } } }
        );

        return res.redirect('/AddedMeal?deleted=1');
    } catch (error) {
        return next(error);
    }
};
