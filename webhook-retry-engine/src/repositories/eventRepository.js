const db = require('../db/connection');
const { log } = require('../utils/logger');

function nowIso() {
  return new Date().toISOString();
}

function deserializeEvent(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    type: row.type,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload),
    clientId: row.client_id,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findByEventId(eventId) {
  const row = db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId);
  return deserializeEvent(row);
}

function insertEvent({ eventId, type, occurredAt, payload, clientId }) {
  const timestamp = nowIso();
  const insertStmt = db.prepare(`
    INSERT INTO events (
      event_id, type, occurred_at, payload, client_id,
      status, attempt_count, next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
  `);

  try {
    insertStmt.run(
      eventId, type, occurredAt, JSON.stringify(payload), clientId,
      timestamp, timestamp, timestamp
    );
    log('event_ingested', { eventId, clientId, type });
    return { created: true, event: findByEventId(eventId) };
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      log('event_duplicate_ignored', { eventId, clientId });
      return { created: false, event: findByEventId(eventId) };
    }
    log('event_insert_error', { eventId, error: err.message });
    throw err;
  }
}

function markDelivering(eventId) {
  const result = db.prepare(`
    UPDATE events SET status = 'delivering', updated_at = ?
    WHERE event_id = ? AND status = 'pending'
  `).run(nowIso(), eventId);

  const claimSucceeded = result.changes === 1;
  log('event_claim_attempt', { eventId, claimSucceeded });
  return claimSucceeded;
}

function markDelivered(eventId) {
  db.prepare(`
    UPDATE events
    SET status = 'delivered', attempt_count = attempt_count + 1, updated_at = ?
    WHERE event_id = ?
  `).run(nowIso(), eventId);
  log('event_delivered', { eventId });
}

function markFailed(eventId) {
  db.prepare(`
    UPDATE events
    SET status = 'failed', attempt_count = attempt_count + 1, updated_at = ?
    WHERE event_id = ?
  `).run(nowIso(), eventId);
  log('event_failed_terminal', { eventId });
}

function scheduleRetry(eventId, nextAttemptAtIso) {
  db.prepare(`
    UPDATE events
    SET status = 'pending', attempt_count = attempt_count + 1,
        next_attempt_at = ?, updated_at = ?
    WHERE event_id = ?
  `).run(nextAttemptAtIso, nowIso(), eventId);
  log('event_retry_scheduled', { eventId, nextAttemptAtIso });
}

function findDueEvents({ perClientLimit, maxClients }) {
  const now = nowIso();

  const clientRows = db.prepare(`
    SELECT client_id, MIN(next_attempt_at) AS oldest_due
    FROM events
    WHERE status = 'pending' AND next_attempt_at <= ?
    GROUP BY client_id
    ORDER BY oldest_due ASC
    LIMIT ?
  `).all(now, maxClients);

  const perClientStmt = db.prepare(`
    SELECT * FROM events
    WHERE status = 'pending' AND next_attempt_at <= ? AND client_id = ?
    ORDER BY next_attempt_at ASC
    LIMIT ?
  `);

  const dueEvents = [];
  for (const { client_id } of clientRows) {
    const rows = perClientStmt.all(now, client_id, perClientLimit);
    dueEvents.push(...rows.map(deserializeEvent));
  }

  if(dueEvents.length>0){
    log('due_events_fetched', {
      distinctClients: clientRows.length,
      totalDueEvents: dueEvents.length,
    });
  }

  return dueEvents;
}

function findAll() {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  return rows.map(deserializeEvent);
}

module.exports = {
  findByEventId,
  insertEvent,
  markDelivering,
  markDelivered,
  markFailed,
  scheduleRetry,
  findDueEvents,
  findAll
};