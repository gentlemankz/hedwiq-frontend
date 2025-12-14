-- Add meeting name and scheduled time to agenda table
ALTER TABLE "agenda" ADD COLUMN IF NOT EXISTS "meeting_name" text;
ALTER TABLE "agenda" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp;
