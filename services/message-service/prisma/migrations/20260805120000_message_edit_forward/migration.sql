-- AlterTable
ALTER TABLE "messages" ADD COLUMN "edited_at" TIMESTAMP(3),
ADD COLUMN "forwarded_from_id" INTEGER;
