-- Indexes for refresh token cleanup and lookups
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");

-- Drop unused legacy tables
DROP TABLE IF EXISTS "user_tokens";
DROP TABLE IF EXISTS "verification_codes";
