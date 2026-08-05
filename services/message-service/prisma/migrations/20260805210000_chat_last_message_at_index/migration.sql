-- Index for chat list ordering by last activity
CREATE INDEX IF NOT EXISTS "idx_chats_last_message_at" ON "chats" ("last_message_at" DESC NULLS LAST);
