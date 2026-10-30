-- Preserve an OAuth evidence revocation receipt long enough for the caller to
-- recover from a lost response with the same idempotency key. Previous
-- Workers ignore this additive table, so Bridge rollback remains compatible.
CREATE TABLE IF NOT EXISTS oauth_evidence_revoke_results (
  refresh_token_hash TEXT PRIMARY KEY,
  idempotency_key_hash TEXT NOT NULL,
  receipt_jwt TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_evidence_revoke_results_expiry_idx
  ON oauth_evidence_revoke_results(expires_at);
