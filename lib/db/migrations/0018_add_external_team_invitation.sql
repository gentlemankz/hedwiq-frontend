-- Migration: Add pending_external_team_invitation table
-- Phase 7: External User Invitations
-- This table stores invitations for users who don't have accounts yet.

-- Create the pending_external_team_invitation table
CREATE TABLE IF NOT EXISTS "pending_external_team_invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "team_id" text NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "invited_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "invited_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "accepted_at" timestamp,
  "accepted_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for efficient lookups
-- Index for looking up invitations by email (for signup flow)
CREATE INDEX IF NOT EXISTS "idx_ext_team_invite_email" ON "pending_external_team_invitation"("email");

-- Index for looking up invitations by token (for direct link acceptance)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ext_team_invite_token" ON "pending_external_team_invitation"("token");

-- Index for team-scoped queries with status filter
CREATE INDEX IF NOT EXISTS "idx_ext_team_invite_team_status" ON "pending_external_team_invitation"("team_id", "status");

-- Index for cleanup of expired invitations
CREATE INDEX IF NOT EXISTS "idx_ext_team_invite_expires" ON "pending_external_team_invitation"("expires_at");

-- Unique constraint: only one pending invitation per email per team
-- This is a partial unique index that only applies when status = 'pending'
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ext_team_invite_unique_pending"
ON "pending_external_team_invitation"("team_id", "email")
WHERE "status" = 'pending';
