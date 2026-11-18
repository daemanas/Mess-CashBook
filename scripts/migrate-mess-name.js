/**
 * Backward-compatible data completion for the optional `messName` field.
 *
 * - Default run is a dry run: it only lists mess admins that lack a mess name.
 * - `--apply` sets messName = "Mess <groupId>" ONLY on role "admin" accounts
 *   whose groupId exists and whose messName is still empty.
 *
 * It never changes emails, passwords, roles, group IDs or any financial record.
 * Take a backup first: node scripts/backup.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

const apply = process.argv.includes('--apply');

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set in the environment');

    await mongoose.connect(uri);

    const filter = {
        role: 'admin',
        groupId: { $type: 'string', $ne: '' },
        $or: [{ messName: null }, { messName: '' }, { messName: { $exists: false } }]
    };

    const pending = await User.find(filter).select('name email groupId messName').lean();
    console.log(`Mess admins without a messName: ${pending.length}`);

    pending.forEach(user => {
        console.log(`  ${user.email} (${user.groupId}) -> "Mess ${user.groupId}"`);
    });

    if (!pending.length) {
        console.log('Nothing to do.');
        return;
    }

    if (!apply) {
        console.log('\nDry run only. Re-run with --apply to write these names.');
        return;
    }

    let updated = 0;
    for (const user of pending) {
        const result = await User.updateOne(
            { _id: user._id, role: 'admin', groupId: user.groupId, messName: { $in: [null, ''] } },
            { $set: { messName: `Mess ${user.groupId}` } }
        );
        updated += result.modifiedCount;
    }
    console.log(`\nUpdated ${updated} account(s).`);
}

main()
    .then(() => mongoose.disconnect())
    .catch(error => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
        return mongoose.disconnect();
    });
