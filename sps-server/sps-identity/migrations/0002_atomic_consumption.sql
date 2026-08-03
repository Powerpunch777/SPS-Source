ALTER TABLE authorization_codes ADD COLUMN consumed_at INTEGER;
ALTER TABLE authorization_codes ADD COLUMN replay_key TEXT;
ALTER TABLE refresh_tokens ADD COLUMN consumed_at INTEGER;
ALTER TABLE refresh_tokens ADD COLUMN replay_key TEXT;

CREATE TABLE IF NOT EXISTS identity_replay_results (
  replay_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS identity_replay_results_expires_at_idx
  ON identity_replay_results (expires_at);
