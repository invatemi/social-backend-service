-- Add hashed token columns and make legacy token column nullable for lazy migration.
ALTER TABLE "refresh_tokens" ADD COLUMN "token_lookup_hash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "token_hash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "token_salt" TEXT;

ALTER TABLE "refresh_tokens" ALTER COLUMN "token" DROP NOT NULL;

CREATE UNIQUE INDEX "refresh_tokens_token_lookup_hash_key" ON "refresh_tokens"("token_lookup_hash");
