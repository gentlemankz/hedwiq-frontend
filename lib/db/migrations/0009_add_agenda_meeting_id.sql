-- Migration: Add meeting_id to agenda table for linking scheduled meeting agendas
-- This allows agenda to be created during meeting scheduling (not just pre-join)

-- Add meeting_id column (nullable to support existing agendas that use room_id)
ALTER TABLE "agenda" ADD COLUMN IF NOT EXISTS "meeting_id" TEXT REFERENCES "meeting"("id") ON DELETE CASCADE;

-- Create index for querying agendas by meeting
CREATE INDEX IF NOT EXISTS "idx_agenda_meeting" ON "agenda"("meeting_id");

-- Add unique constraint to ensure one agenda per meeting
-- Using partial index to only enforce uniqueness where meeting_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS "idx_agenda_meeting_unique" ON "agenda"("meeting_id") WHERE "meeting_id" IS NOT NULL;

-- Note: Existing agendas use room_id (for instant meetings created in pre-join)
-- New scheduled meeting agendas will use meeting_id (created during scheduling)
-- Both can coexist - the agenda system checks both fields
