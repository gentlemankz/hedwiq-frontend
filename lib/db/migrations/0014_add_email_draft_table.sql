-- Migration: Add Email Draft Table
-- Purpose: Store AI-generated email drafts from meeting action items
-- Created: Phase 3 of Real-Time Actions Implementation
--
-- Email drafts are generated when ActionClassifier identifies email-type actions
-- and EmailDraftGenerator creates AI-generated drafts for user review.

-- ============================================================================
-- Email Draft Table
-- ============================================================================
-- Stores AI-generated email drafts linked to action items.
-- Drafts can be edited by users before sending via Gmail.

CREATE TABLE IF NOT EXISTS "email_draft" (
    "id" TEXT PRIMARY KEY,
    -- Links to source action and meeting
    "action_id" TEXT NOT NULL REFERENCES "action_item"("id") ON DELETE CASCADE,
    "meeting_id" TEXT NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "room_id" TEXT NOT NULL,
    -- Link to original insight (denormalized for convenience)
    "original_insight_id" TEXT NOT NULL,
    -- Email content
    "to_addresses" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "cc_addresses" JSONB DEFAULT '[]'::jsonb,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- Context that generated this draft (preserved for reference)
    "meeting_context" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "transcript_context" TEXT,
    -- Source action data (denormalized for display without join)
    "action_content" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "speaker_name" TEXT,
    -- Draft metadata
    "status" TEXT NOT NULL DEFAULT 'ready',
    "generation_confidence" INTEGER DEFAULT 80 NOT NULL,
    -- Sending details (populated after send)
    "gmail_message_id" TEXT,
    "sent_at" TIMESTAMP,
    -- Error tracking
    "error_message" TEXT,
    -- Timestamps
    "generated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Common query patterns
CREATE INDEX IF NOT EXISTS "idx_email_draft_meeting" ON "email_draft" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_email_draft_user" ON "email_draft" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_email_draft_room" ON "email_draft" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_email_draft_action" ON "email_draft" ("action_id");
CREATE INDEX IF NOT EXISTS "idx_email_draft_status" ON "email_draft" ("status");
CREATE INDEX IF NOT EXISTS "idx_email_draft_generated_at" ON "email_draft" ("generated_at" DESC);

-- Partial index for finding pending drafts quickly
CREATE INDEX IF NOT EXISTS "idx_email_draft_pending" ON "email_draft" ("user_id", "status")
    WHERE "status" IN ('ready', 'edited');

-- Unique constraint: one draft per action per user (user can regenerate)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_draft_action_user_unique" ON "email_draft" ("action_id", "user_id");

-- ============================================================================
-- Email Sent Audit Log
-- ============================================================================
-- Separate table for audit trail of sent emails.
-- Preserved even if draft is deleted.

CREATE TABLE IF NOT EXISTS "email_sent" (
    "id" TEXT PRIMARY KEY,
    "draft_id" TEXT,
    "meeting_id" TEXT NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "room_id" TEXT NOT NULL,
    -- Email details (snapshot at time of send)
    "to_addresses" TEXT[] NOT NULL,
    "cc_addresses" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- Gmail tracking
    "gmail_message_id" TEXT NOT NULL,
    -- Metadata
    "sent_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS "idx_email_sent_meeting" ON "email_sent" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_email_sent_user" ON "email_sent" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_email_sent_sent_at" ON "email_sent" ("sent_at" DESC);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "email_draft" IS 'AI-generated email drafts from meeting action items';
COMMENT ON COLUMN "email_draft"."status" IS 'Draft status: generating, ready, edited, sent, rejected, failed';
COMMENT ON COLUMN "email_draft"."to_addresses" IS 'JSON array of { email?: string, name: string, source: string }';
COMMENT ON COLUMN "email_draft"."meeting_context" IS 'JSON: { meetingTitle?, meetingDate?, participants[], agendaTopics[], roomId? }';
COMMENT ON COLUMN "email_draft"."generation_confidence" IS 'LLM confidence in draft quality (0-100)';

COMMENT ON TABLE "email_sent" IS 'Audit log of emails sent via Gmail integration';
