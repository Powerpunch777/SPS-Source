-- Additive release-evidence metadata. Previous Workers ignore these nullable
-- columns, so migration-before-deploy and Bridge rollback remain compatible.
ALTER TABLE oauth_states ADD COLUMN oauth_evidence_nonce TEXT;
ALTER TABLE oauth_states ADD COLUMN oauth_evidence_deployment_id TEXT;
ALTER TABLE authorization_codes ADD COLUMN google_verified_at INTEGER;
ALTER TABLE authorization_codes ADD COLUMN oauth_evidence_nonce TEXT;
ALTER TABLE authorization_codes ADD COLUMN oauth_evidence_deployment_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN google_verified_at INTEGER;
ALTER TABLE refresh_tokens ADD COLUMN oauth_evidence_nonce TEXT;
ALTER TABLE refresh_tokens ADD COLUMN oauth_evidence_deployment_id TEXT;
