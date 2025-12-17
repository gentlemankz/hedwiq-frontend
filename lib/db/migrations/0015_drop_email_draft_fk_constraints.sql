-- Migration: Drop Foreign Key Constraints on email_draft
-- Purpose: Allow email drafts to be created without requiring action_item or meeting records
-- Created: Fix for real-time email draft persistence
--
-- Background:
-- The email_draft table was designed with FK constraints to action_item and meeting tables.
-- However, in the current real-time flow:
-- 1. Actions are streamed via LiveKit and not stored in action_item table
-- 2. Email drafts use roomId as meetingId fallback when meeting record doesn't exist
--
-- This migration removes the FK constraints while keeping the columns for reference.

-- ============================================================================
-- Drop Foreign Key Constraints
-- ============================================================================

-- Drop the action_id foreign key constraint
-- The action_id column remains as a reference identifier (not enforced)
ALTER TABLE "email_draft" DROP CONSTRAINT IF EXISTS "email_draft_action_id_fkey";
ALTER TABLE "email_draft" DROP CONSTRAINT IF EXISTS "email_draft_action_id_action_item_id_fk";

-- Drop the meeting_id foreign key constraint
-- This allows using roomId as meetingId when a formal meeting record doesn't exist
ALTER TABLE "email_draft" DROP CONSTRAINT IF EXISTS "email_draft_meeting_id_fkey";
ALTER TABLE "email_draft" DROP CONSTRAINT IF EXISTS "email_draft_meeting_id_meeting_id_fk";

-- Also fix email_sent table if it has the same issue
ALTER TABLE "email_sent" DROP CONSTRAINT IF EXISTS "email_sent_meeting_id_fkey";
ALTER TABLE "email_sent" DROP CONSTRAINT IF EXISTS "email_sent_meeting_id_meeting_id_fk";

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN "email_draft"."action_id" IS 'Reference to source action (not FK enforced - actions may be transient)';
COMMENT ON COLUMN "email_draft"."meeting_id" IS 'Reference to meeting or roomId (not FK enforced - may use roomId as fallback)';
