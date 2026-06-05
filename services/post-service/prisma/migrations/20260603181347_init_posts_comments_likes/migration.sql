-- CreateTable
CREATE TABLE "posts" (
    "id_post" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "title" VARCHAR(150),
    "content" TEXT NOT NULL,
    "image_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id_post")
);

-- CreateTable
CREATE TABLE "comments" (
    "id_comment" SERIAL NOT NULL,
    "id_post" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id_comment")
);

-- CreateTable
CREATE TABLE "likes" (
    "id_like" SERIAL NOT NULL,
    "id_post" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id_like")
);

-- CreateIndex
CREATE INDEX "idx_posts_user" ON "posts"("id_user");

-- CreateIndex
CREATE INDEX "idx_posts_published" ON "posts"("is_published");

-- CreateIndex
CREATE INDEX "idx_posts_created" ON "posts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_comments_post" ON "comments"("id_post");

-- CreateIndex
CREATE INDEX "idx_likes_post_user" ON "likes"("id_post", "id_user");

-- CreateIndex
CREATE UNIQUE INDEX "uq_like_post_user" ON "likes"("id_post", "id_user");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_id_post_fkey" FOREIGN KEY ("id_post") REFERENCES "posts"("id_post") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_id_post_fkey" FOREIGN KEY ("id_post") REFERENCES "posts"("id_post") ON DELETE CASCADE ON UPDATE CASCADE;
