-- Migration: Add calendar_event table for syncing meetings with external calendars
-- This table maps Luframe meetings to Google Calendar events

CREATE TABLE IF NOT EXISTS "calendar_event" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
  "integration_id" TEXT NOT NULL REFERENCES "calendar_integration"("id") ON DELETE CASCADE,

  -- External calendar event details
  "provider_event_id" TEXT NOT NULL,
  "provider_event_link" TEXT,

  -- Sync tracking
  "sync_status" TEXT NOT NULL DEFAULT 'synced',  -- 'synced' | 'pending' | 'failed' | 'deleted'
  "last_synced_at" TIMESTAMP,
  "sync_error" TEXT,

  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_calendar_event_meeting" ON "calendar_event"("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_calendar_event_integration" ON "calendar_event"("integration_id");
CREATE INDEX IF NOT EXISTS "idx_calendar_event_sync_status" ON "calendar_event"("sync_status");

-- Unique constraint: one event per meeting per integration
CREATE UNIQUE INDEX IF NOT EXISTS "idx_calendar_event_meeting_integration" ON "calendar_event"("meeting_id", "integration_id");
