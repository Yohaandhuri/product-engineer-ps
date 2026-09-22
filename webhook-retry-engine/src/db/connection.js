const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { log } = require('../utils/logger');

const dbPath = process.env.DB_PATH || './data/webhook-engine.db';

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
log('db_connected', { dbPath });

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);
log('db_schema_applied', { schemaPath });

const resetResult = db.prepare(`
  UPDATE events SET status = 'pending', updated_at = ?
  WHERE status = 'delivering'
`).run(new Date().toISOString());

if (resetResult.changes > 0) {
  log('startup_orphaned_events_reset', { count: resetResult.changes });
}

module.exports = db;