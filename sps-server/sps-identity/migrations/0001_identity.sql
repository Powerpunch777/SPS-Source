CREATE TABLE IF NOT EXISTS identity_users (
  subject TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  desktop_redirect_uri TEXT NOT NULL,
  desktop_state TEXT NOT NULL,
  desktop_code_challenge TEXT NOT NULL,
  google_code_verifier TEXT NOT NULL,
  google_nonce TEXT NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS authorization_codes (
  code_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  device_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS authorization_codes_expires_at_idx ON authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_subject_idx ON refresh_tokens (subject);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
