-- Migration: Add meeting table for scheduled and instant meetings
-- This table stores meeting metadata and links to LiveKit rooms

CREATE TABLE IF NOT EXISTS "meeting" (
  "id" TEXT PRIMARY KEY,
  "room_id" TEXT NOT NULL UNIQUE,
  "host_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'instant',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "scheduled_at" TIMESTAMP,
  "duration_minutes" INTEGER DEFAULT 60,
  "timezone" TEXT DEFAULT 'UTC',
  "started_at" TIMESTAMP,
  "ended_at" TIMESTAMP,
  "settings" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_meeting_host" ON "meeting"("host_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_scheduled" ON "meeting"("scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_meeting_status" ON "meeting"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_room" ON "meeting"("room_id");
-- Composite index for common query pattern (listing meetings by host with status filter)
CREATE INDEX IF NOT EXISTS "idx_meeting_host_status" ON "meeting"("host_id", "status");

-- ============================================================================
-- RLS (Row Level Security) - DISABLED
-- ============================================================================
-- NOTE: This application uses Better Auth (not Supabase Auth), so we handle
-- authorization at the application layer in API routes instead of using RLS.
-- The API routes already check session.user.id === meeting.hostId before
-- allowing access. Keeping RLS disabled to avoid issues with the database
-- connection not having Supabase Auth context.
--
-- If you want to enable RLS in the future with Better Auth, you'll need to:
-- 1. Pass the user ID via a custom database role or session variable
-- 2. Create policies that check against that variable instead of auth.uid()
-- ============================================================================

-- DO NOT ENABLE RLS - application handles authorization
-- ALTER TABLE "meeting" ENABLE ROW LEVEL SECURITY;
