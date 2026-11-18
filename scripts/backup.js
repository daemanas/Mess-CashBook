/**
 * Read-only export of every application collection to a timestamped folder.
 * Usage: node scripts/backup.js [--include-sessions]
 * Output: backups/<ISO timestamp>/manifest.json + one .json file per collection
 * (MongoDB Extended JSON, so ObjectId/Date types are preserved for restore tooling).
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('mongodb');

const INCLUDE_SESSIONS = process.argv.includes('--include-sessions');
// Session documents contain live login tokens, so they are skipped by default.
const SKIP = INCLUDE_SESSIONS ? [] : ['sessions'];

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set in the environment');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(__dirname, '..', 'backups', stamp);
    fs.mkdirSync(outDir, { recursive: true });

    const collections = (await db.listCollections().toArray())
        .map(info => info.name)
        .filter(name => !SKIP.includes(name) && !name.startsWith('system.'))
        .sort();

    const manifest = { database: db.databaseName, createdAt: new Date().toISOString(), collections: {} };

    for (const name of collections) {
        const docs = await db.collection(name).find({}).toArray();
        fs.writeFileSync(path.join(outDir, name + '.json'), EJSON.stringify(docs, { relaxed: false }, 2));
        manifest.collections[name] = docs.length;
        console.log(`exported ${String(docs.length).padStart(6)}  ${name}`);
    }

    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`\nBackup written to ${outDir}`);
}

main()
    .then(() => mongoose.disconnect())
    .catch(error => {
        console.error('Backup failed:', error.message);
        process.exitCode = 1;
        return mongoose.disconnect();
    });
