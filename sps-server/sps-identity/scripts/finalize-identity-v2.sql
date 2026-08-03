DELETE FROM refresh_tokens WHERE family_id IS NULL AND consumed_at IS NOT NULL;
DELETE FROM identity_replay_results;
