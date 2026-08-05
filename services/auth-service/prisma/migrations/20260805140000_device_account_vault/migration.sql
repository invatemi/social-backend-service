-- CreateTable
CREATE TABLE "device_sessions" (
    "id" SERIAL NOT NULL,
    "token_lookup_hash" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_salt" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_session_accounts" (
    "id" SERIAL NOT NULL,
    "device_session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "refresh_token_id" INTEGER NOT NULL,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_session_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_token_lookup_hash_key" ON "device_sessions"("token_lookup_hash");

-- CreateIndex
CREATE UNIQUE INDEX "device_session_accounts_refresh_token_id_key" ON "device_session_accounts"("refresh_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_session_accounts_device_session_id_user_id_key" ON "device_session_accounts"("device_session_id", "user_id");

-- AddForeignKey
ALTER TABLE "device_session_accounts" ADD CONSTRAINT "device_session_accounts_device_session_id_fkey" FOREIGN KEY ("device_session_id") REFERENCES "device_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_session_accounts" ADD CONSTRAINT "device_session_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_session_accounts" ADD CONSTRAINT "device_session_accounts_refresh_token_id_fkey" FOREIGN KEY ("refresh_token_id") REFERENCES "refresh_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
