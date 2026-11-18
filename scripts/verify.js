/**
 * Read-only integrity check. Never writes to the database.
 * Usage: node scripts/verify.js
 * Exit code is non-zero only for structural problems (FAIL), not advisory notes (WARN).
 */
require('dotenv').config();

const mongoose = require('mongoose');

const results = [];
const record = (level, area, message) => {
    results.push({ level, area, message });
};

function countBy(rows, key) {
    return rows.reduce((acc, row) => {
        const value = row[key] === null || row[key] === undefined ? '(null)' : String(row[key]);
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set in the environment');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const users = await db.collection('users').find({}).toArray();
    const money = await db.collection('moneyadds').find({}).toArray();
    const expenses = await db.collection('vagetableexpenses').find({}).toArray();
    const ledgers = await db.collection('mealusers').find({}).toArray();

    const userIds = new Set(users.map(user => String(user._id)));
    const validRoles = new Set(['personal', 'admin', 'member']);

    /* ---------- users ---------- */
    record('INFO', 'users', `total ${users.length}`);
    const roleCounts = countBy(users, 'role');
    Object.entries(roleCounts).forEach(([role, count]) => record('INFO', 'users', `role ${role}: ${count}`));

    const verifiedCount = users.filter(user => user.isVerified).length;
    record('INFO', 'users', `verified ${verifiedCount}, unverified ${users.length - verifiedCount}`);

    users.filter(user => !validRoles.has(user.role)).forEach(user => {
        record('FAIL', 'users', `invalid role "${user.role}" for ${user.email}`);
    });

    users.filter(user => user.role === 'personal' && user.groupId).forEach(user => {
        record('FAIL', 'users', `personal account ${user.email} unexpectedly has groupId ${user.groupId}`);
    });

    users.filter(user => (user.role === 'admin' || user.role === 'member') && !user.groupId).forEach(user => {
        record('WARN', 'users', `mess role ${user.role} for ${user.email} has no groupId (cannot sign in to mess features)`);
    });

    const groupCounts = countBy(users.filter(user => user.groupId), 'groupId');
    Object.entries(groupCounts).forEach(([groupId, count]) => record('INFO', 'groups', `${groupId}: ${count} user(s)`));

    users.filter(user => user.groupId && !user.messName).forEach(user => {
        record('WARN', 'users', `mess account ${user.email} has no messName (run scripts/migrate-mess-name.js --apply to add one)`);
    });

    const emails = new Set();
    users.forEach(user => {
        const key = String(user.email || '').toLowerCase();
        if (emails.has(key)) record('FAIL', 'users', `duplicate email ${user.email}`);
        emails.add(key);
    });

    /* ---------- financial records ---------- */
    const orphanCheck = (collection, rows) => {
        record('INFO', collection, `total ${rows.length}`);
        rows.forEach(row => {
            if (!row.user || !userIds.has(String(row.user))) {
                record('FAIL', collection, `record ${row._id} references a missing user`);
            }
            if (!Number.isFinite(Number(row.entry_amount)) || Number(row.entry_amount) <= 0) {
                record('WARN', collection, `record ${row._id} has non-positive amount ${row.entry_amount}`);
            }
            if (!row.entry_date || Number.isNaN(new Date(row.entry_date).getTime())) {
                record('FAIL', collection, `record ${row._id} has an invalid entry_date`);
            }
        });
    };

    orphanCheck('moneyadds', money);
    orphanCheck('vagetableexpenses', expenses);

    record('INFO', 'mealusers', `ledgers ${ledgers.length}, meal entries ${ledgers.reduce((sum, row) => sum + (row.meals ? row.meals.length : 0), 0)}`);
    ledgers.forEach(row => {
        if (!row.user || !userIds.has(String(row.user))) {
            record('WARN', 'mealusers', `ledger ${row._id} references a missing user (kept for history)`);
        }
        (row.meals || []).forEach(meal => {
            if (!Number.isFinite(Number(meal.food_count)) || Number(meal.food_count) < 0) {
                record('WARN', 'mealusers', `ledger ${row._id} has invalid food_count ${meal.food_count}`);
            }
        });
    });

    /* ---------- isolation sanity ---------- */
    const messUserIds = new Set(users.filter(user => user.groupId).map(user => String(user._id)));
    const personalUserIds = new Set(users.filter(user => !user.groupId).map(user => String(user._id)));

    money.forEach(row => {
        const owner = String(row.user);
        if (row.groupId && personalUserIds.has(owner)) {
            record('WARN', 'isolation', `money record ${row._id} is group-scoped but owned by a personal user`);
        }
        if (!row.groupId && messUserIds.has(owner)) {
            record('WARN', 'isolation', `money record ${row._id} has no groupId but is owned by a mess user`);
        }
    });
    expenses.forEach(row => {
        const owner = String(row.user);
        if (row.groupId && personalUserIds.has(owner)) {
            record('WARN', 'isolation', `expense record ${row._id} is group-scoped but owned by a personal user`);
        }
        if (!row.groupId && messUserIds.has(owner)) {
            record('WARN', 'isolation', `expense record ${row._id} has no groupId but is owned by a mess user`);
        }
    });

    /* ---------- report ---------- */
    console.log(`\nCashBook integrity report — database "${db.databaseName}"\n`);
    results.forEach(row => {
        console.log(`${row.level.padEnd(5)} ${row.area.padEnd(17)} ${row.message}`);
    });

    const fails = results.filter(row => row.level === 'FAIL').length;
    const warns = results.filter(row => row.level === 'WARN').length;
    console.log(`\n${fails} failure(s), ${warns} warning(s). ${fails ? 'Review failures before deploying.' : 'No structural problems found.'}`);
    process.exitCode = fails ? 1 : 0;
}

main()
    .then(() => mongoose.disconnect())
    .catch(error => {
        console.error('Verification failed:', error.message);
        process.exitCode = 1;
        return mongoose.disconnect();
    });
