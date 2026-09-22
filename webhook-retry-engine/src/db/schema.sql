CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  client_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'delivered', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  attempted_at TEXT NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'failed_retryable', 'failed_terminal')),
  http_status INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  FOREIGN KEY (event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_events_lookup
  ON events(status, client_id, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_attempts_event_id
  ON attempts(event_id);