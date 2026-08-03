ALTER TABLE authorization_codes ADD COLUMN consumption_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN consumption_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT;

DROP INDEX IF EXISTS identity_replay_results_expires_at_idx;
DROP TABLE IF EXISTS identity_replay_results;

CREATE TABLE identity_replay_results (
  replay_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  consumption_id TEXT NOT NULL,
  response_ciphertext TEXT NOT NULL,
  family_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX identity_replay_results_expires_at_idx
  ON identity_replay_results (expires_at);
CREATE INDEX identity_replay_results_family_idx
  ON identity_replay_results (family_id);
CREATE INDEX refresh_tokens_family_idx
  ON refresh_tokens (family_id);
