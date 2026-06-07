-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "recipient_user_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_notifications_recipient_created" ON "notifications"("recipient_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_recipient_read" ON "notifications"("recipient_user_id", "read_at");
