-- Give every still-active pre-v2 refresh token its own safe family root.
-- The old Worker ignores this additive column, while the v2 Worker can rotate
-- the session without logging the user out. Consumed legacy rows are retained
-- for the old Worker's short replay window and cleaned only at finalization.
UPDATE refresh_tokens
SET family_id = 'legacy-root:' || token_hash
WHERE family_id IS NULL AND consumed_at IS NULL;
