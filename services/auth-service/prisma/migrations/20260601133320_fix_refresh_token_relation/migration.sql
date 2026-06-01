/*
  Warnings:

  - You are about to drop the column `authAccountId` on the `refresh_tokens` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_authAccountId_fkey";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "authAccountId";

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
