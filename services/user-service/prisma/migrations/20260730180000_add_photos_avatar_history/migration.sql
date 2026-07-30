-- CreateTable
CREATE TABLE "photos" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "object_key" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_likes" (
    "id" SERIAL NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_comments" (
    "id" SERIAL NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_photos_user_created" ON "photos"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_photo_user_url" ON "photos"("user_id", "url");

-- CreateIndex
CREATE INDEX "idx_photo_likes_photo" ON "photo_likes"("photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_photo_like" ON "photo_likes"("photo_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_photo_comments_photo" ON "photo_comments"("photo_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_likes" ADD CONSTRAINT "photo_likes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed current avatars into gallery history
INSERT INTO "photos" ("user_id", "url", "is_current", "created_at")
SELECT u."id_user", u."avatar_url", true, COALESCE(u."updated_at", CURRENT_TIMESTAMP)
FROM "users" u
WHERE u."avatar_url" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "photos" p
    WHERE p."user_id" = u."id_user"
      AND p."url" = u."avatar_url"
  );
