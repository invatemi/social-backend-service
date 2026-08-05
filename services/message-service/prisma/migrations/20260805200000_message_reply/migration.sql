-- AlterTable
ALTER TABLE "messages" ADD COLUMN "reply_to_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_messages_reply_to" ON "messages"("reply_to_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
