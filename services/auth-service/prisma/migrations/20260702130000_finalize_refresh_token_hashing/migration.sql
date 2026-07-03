-- Finalize hashed refresh tokens: drop legacy plaintext column.

-- Sessions without hashed fields cannot be validated after this migration.
DELETE FROM "refresh_tokens"
WHERE "token_lookup_hash" IS NULL
   OR "token_hash" IS NULL
   OR "token_salt" IS NULL;

DROP INDEX IF EXISTS "refresh_tokens_token_key";

ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "token";

ALTER TABLE "refresh_tokens" ALTER COLUMN "token_lookup_hash" SET NOT NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "token_salt" SET NOT NULL;
