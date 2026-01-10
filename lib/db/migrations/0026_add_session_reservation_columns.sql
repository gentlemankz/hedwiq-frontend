-- Migration: Add reservation tracking columns to meeting_session
-- These columns support the minute reservation system for billing
-- (SECURITY FIX #10 from previous schema update)

ALTER TABLE "meeting_session"
ADD COLUMN IF NOT EXISTS "reserved_minutes" integer;

ALTER TABLE "meeting_session"
ADD COLUMN IF NOT EXISTS "reservation_released" boolean DEFAULT false;

-- Add index for efficient queries on active reservations
CREATE INDEX IF NOT EXISTS "idx_meeting_session_active_reservations"
ON "meeting_session" ("user_id")
WHERE "left_at" IS NULL AND "reservation_released" = false;
