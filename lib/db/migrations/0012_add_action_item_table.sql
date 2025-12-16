-- Migration: Add Action Item Table
-- This migration adds the action_item table for storing classified actions
-- from the Real-Time Actions feature (Phase 1).
--
-- Actions are enhanced action_items with:
-- - Classification type (email_followup, email_share, email_schedule, task_create, calendar_event, manual)
-- - Extracted metadata (recipient hints, subject hints, urgency, etc.)
-- - Status tracking through the action lifecycle

-- ============================================================================
-- Action Item Table
-- ============================================================================
-- Stores classified action items from meeting insights.
-- Each action is linked to an original insight and enriched with classification.

CREATE TABLE IF NOT EXISTS "action_item" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    -- Link to original insight
    "original_insight_id" text NOT NULL,
    -- Content from the original insight
    "content" text NOT NULL,
    "speaker_identity" text,
    "speaker_name" text,
    "transcript_ref" text,
    -- Classification results
    "action_type" text NOT NULL DEFAULT 'manual',
    "classification_confidence" integer DEFAULT 80 NOT NULL,
    -- Extracted metadata (JSONB for flexibility)
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- Status tracking: detected, drafting, draft_ready, sent, rejected
    "status" text NOT NULL DEFAULT 'detected',
    -- Convenience flag for email-related actions
    "requires_email" boolean DEFAULT false NOT NULL,
    -- Timestamps (stored as bigint for milliseconds, converted to timestamp for querying)
    "timestamp" timestamp NOT NULL,
    "classified_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_action_item_meeting" ON "action_item" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_action_item_room" ON "action_item" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_action_item_type" ON "action_item" ("action_type");
CREATE INDEX IF NOT EXISTS "idx_action_item_status" ON "action_item" ("status");
CREATE INDEX IF NOT EXISTS "idx_action_item_timestamp" ON "action_item" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_action_item_original_insight" ON "action_item" ("original_insight_id");
-- Index for finding email-related actions quickly
CREATE INDEX IF NOT EXISTS "idx_action_item_requires_email" ON "action_item" ("requires_email") WHERE "requires_email" = true;
-- Unique constraint to prevent duplicate actions for the same insight within a meeting
ALTER TABLE "action_item" ADD CONSTRAINT "uq_action_item_meeting_insight" UNIQUE ("meeting_id", "original_insight_id");

-- Add comment explaining the metadata JSONB structure
COMMENT ON COLUMN "action_item"."metadata" IS 'JSON structure: { recipientHint?: string, subjectHint?: string, projectHint?: string, assigneeHint?: string, datetimeHint?: string, durationHint?: string, urgency: "low" | "normal" | "high" | "critical" }';
COMMENT ON COLUMN "action_item"."action_type" IS 'Classification type: email_followup, email_share, email_schedule, task_create, calendar_event, manual';
COMMENT ON COLUMN "action_item"."status" IS 'Lifecycle status: detected, drafting, draft_ready, sent, rejected';
