const db = require('../db/connection');
const { log } = require('../utils/logger');

function insertAttempt({ eventId, attemptNumber, outcome, httpStatus, errorMessage, durationMs }) {
  db.prepare(`
    INSERT INTO attempts (
      event_id, attempt_number, attempted_at, outcome,
      http_status, error_message, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    attemptNumber,
    new Date().toISOString(),
    outcome,
    httpStatus ?? null,
    errorMessage ?? null,
    durationMs ?? null
  );

  log('attempt_recorded', { eventId, attemptNumber, outcome, httpStatus, durationMs });
}

function findAttemptsByEventId(eventId) {
  const rows = db.prepare(`
    SELECT * FROM attempts WHERE event_id = ? ORDER BY attempt_number ASC
  `).all(eventId);

  return rows.map(row => ({
    attemptNumber: row.attempt_number,
    attemptedAt: row.attempted_at,
    outcome: row.outcome,
    httpStatus: row.http_status,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
  }));
}

module.exports = { insertAttempt, findAttemptsByEventId };