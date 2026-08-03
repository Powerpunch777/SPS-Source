ALTER TABLE authorization_codes ADD COLUMN consumption_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN consumption_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT;

-- Keep identity_replay_results intact while the previous Worker can still be
-- serving traffic. The previous schema uses response_json. The v2 Worker uses
-- only this additive table and can therefore be rolled back safely.
CREATE TABLE identity_replay_results_v2 (
  replay_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  consumption_id TEXT NOT NULL,
  response_ciphertext TEXT NOT NULL,
  family_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX identity_replay_results_v2_expires_at_idx
  ON identity_replay_results_v2 (expires_at);
CREATE INDEX identity_replay_results_v2_family_idx
  ON identity_replay_results_v2 (family_id);
CREATE INDEX refresh_tokens_family_idx
  ON refresh_tokens (family_id);
