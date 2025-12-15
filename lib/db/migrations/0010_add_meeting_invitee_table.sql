-- Migration: Add meeting_invitee table for email invitations
-- This enables sending meeting invitations and tracking RSVP responses

CREATE TABLE IF NOT EXISTS "meeting_invitee" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,

  -- Invitee info (email required, name optional)
  "email" TEXT NOT NULL,
  "name" TEXT,

  -- RSVP status: 'pending' | 'accepted' | 'declined' | 'tentative'
  "status" TEXT NOT NULL DEFAULT 'pending',
  "responded_at" TIMESTAMP,

  -- Invitation tracking
  "invited_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "invited_by" TEXT NOT NULL REFERENCES "user"("id"),

  -- Email tracking
  "email_sent_at" TIMESTAMP,
  "email_opened_at" TIMESTAMP,

  -- Token for RSVP without requiring authentication
  "rsvp_token" TEXT UNIQUE,

  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_meeting_invitee_meeting" ON "meeting_invitee"("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_invitee_email" ON "meeting_invitee"("email");
CREATE INDEX IF NOT EXISTS "idx_meeting_invitee_status" ON "meeting_invitee"("status");

-- Unique constraint: one invitation per email per meeting
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_invitee_unique" ON "meeting_invitee"("meeting_id", "email");
