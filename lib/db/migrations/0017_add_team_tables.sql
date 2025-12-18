-- Migration: Add Team Tables
-- Purpose: Enable team-based collaboration features
-- Created: Phase 1 of Team Workspace Implementation
--
-- This migration creates the team, team_member, and team_meeting tables.
-- Teams support hierarchy (sub-teams) and role-based access control.

-- ============================================================================
-- Team Table
-- ============================================================================
-- Core team entity with support for hierarchical sub-teams.

CREATE TABLE IF NOT EXISTS "team" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "parent_team_id" TEXT REFERENCES "team"("id") ON DELETE CASCADE,
    "created_by" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Team Indexes
-- ============================================================================

-- Index for listing sub-teams by parent
CREATE INDEX IF NOT EXISTS "idx_team_parent" ON "team" ("parent_team_id");

-- Index for listing teams created by a user
CREATE INDEX IF NOT EXISTS "idx_team_created_by" ON "team" ("created_by");

-- Index for ordering sub-teams within parent
CREATE INDEX IF NOT EXISTS "idx_team_parent_order" ON "team" ("parent_team_id", "order_index");

-- ============================================================================
-- Team Member Table
-- ============================================================================
-- User membership in teams with role-based access control.
-- Roles: owner, admin, member
-- Status: pending (invited), active (joined), left

CREATE TABLE IF NOT EXISTS "team_member" (
    "id" TEXT PRIMARY KEY,
    "team_id" TEXT NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invited_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "invited_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "joined_at" TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Team Member Indexes
-- ============================================================================

-- Index for listing members by team
CREATE INDEX IF NOT EXISTS "idx_team_member_team" ON "team_member" ("team_id");

-- Index for listing teams by user
CREATE INDEX IF NOT EXISTS "idx_team_member_user" ON "team_member" ("user_id");

-- Index for filtering by team and status
CREATE INDEX IF NOT EXISTS "idx_team_member_team_status" ON "team_member" ("team_id", "status");

-- Index for filtering by user and status (active teams for a user)
CREATE INDEX IF NOT EXISTS "idx_team_member_user_status" ON "team_member" ("user_id", "status");

-- Unique constraint: one membership per user per team
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_member_unique" ON "team_member" ("team_id", "user_id");

-- ============================================================================
-- Team Meeting Table
-- ============================================================================
-- Links teams to meetings for team-wide invitations.
-- When a team is invited, all active members get meeting access.

CREATE TABLE IF NOT EXISTS "team_meeting" (
    "id" TEXT PRIMARY KEY,
    "team_id" TEXT NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
    "meeting_id" TEXT NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "invited_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "invited_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Team Meeting Indexes
-- ============================================================================

-- Index for listing team invites by meeting
CREATE INDEX IF NOT EXISTS "idx_team_meeting_meeting" ON "team_meeting" ("meeting_id");

-- Index for listing meetings by team
CREATE INDEX IF NOT EXISTS "idx_team_meeting_team" ON "team_meeting" ("team_id");

-- Unique constraint: one invite per team per meeting
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_meeting_unique" ON "team_meeting" ("team_id", "meeting_id");

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "team" IS 'Teams for organizing users into collaborative groups';
COMMENT ON COLUMN "team"."parent_team_id" IS 'Reference to parent team for sub-team hierarchy (null for root teams)';
COMMENT ON COLUMN "team"."color" IS 'Optional hex color for team display (e.g., #3B82F6)';
COMMENT ON COLUMN "team"."icon" IS 'Optional icon identifier for team display';
COMMENT ON COLUMN "team"."order_index" IS 'Display order within parent team (lower = higher priority)';

COMMENT ON TABLE "team_member" IS 'User membership in teams with role-based access';
COMMENT ON COLUMN "team_member"."role" IS 'Member role: owner, admin, or member';
COMMENT ON COLUMN "team_member"."status" IS 'Membership status: pending, active, or left';
COMMENT ON COLUMN "team_member"."joined_at" IS 'When user accepted invitation (null if still pending)';

COMMENT ON TABLE "team_meeting" IS 'Team-wide meeting invitations';
COMMENT ON COLUMN "team_meeting"."invited_by" IS 'User who invited the team to the meeting';

-- ============================================================================
-- Performance Index for Case-Insensitive Name Uniqueness
-- ============================================================================

-- Index for case-insensitive team name queries within same parent
-- Used by teamNameExists function for duplicate checking
CREATE INDEX IF NOT EXISTS "idx_team_name_lower_parent" ON "team" (LOWER("name"), "parent_team_id");
