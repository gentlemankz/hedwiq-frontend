-- Migration: Add Meeting Folder Table
-- Purpose: Enable folder-based organization for past meetings
-- Created: Phase 1 of Dashboard Sidebar & Meeting Folders Implementation
--
-- This migration creates the meeting_folder table and adds folder_id to meetings.
-- Each user gets a default "General" folder for uncategorized meetings.

-- ============================================================================
-- Meeting Folder Table
-- ============================================================================
-- Stores folder definitions for organizing user's meetings.
-- Each user can have multiple folders, with one default "General" folder.

CREATE TABLE IF NOT EXISTS "meeting_folder" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Index for listing folders by user
CREATE INDEX IF NOT EXISTS "idx_meeting_folder_user" ON "meeting_folder" ("user_id");

-- Index for ordering folders
CREATE INDEX IF NOT EXISTS "idx_meeting_folder_order" ON "meeting_folder" ("user_id", "order_index");

-- Unique constraint: only one default folder per user
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_folder_default" ON "meeting_folder" ("user_id")
    WHERE "is_default" = TRUE;

-- Unique constraint: folder names must be unique per user (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_folder_name_unique" ON "meeting_folder" ("user_id", LOWER("name"));

-- ============================================================================
-- Add folder_id to Meeting Table
-- ============================================================================

ALTER TABLE "meeting"
ADD COLUMN IF NOT EXISTS "folder_id" TEXT REFERENCES "meeting_folder"("id") ON DELETE SET NULL;

-- Index for filtering meetings by folder
CREATE INDEX IF NOT EXISTS "idx_meeting_folder" ON "meeting" ("folder_id");

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "meeting_folder" IS 'Folders for organizing user meetings';
COMMENT ON COLUMN "meeting_folder"."is_default" IS 'Whether this is the default "General" folder for the user';
COMMENT ON COLUMN "meeting_folder"."color" IS 'Optional hex color for folder display (e.g., #3B82F6)';
COMMENT ON COLUMN "meeting_folder"."icon" IS 'Optional icon identifier for folder display';
COMMENT ON COLUMN "meeting_folder"."order_index" IS 'Display order for folder list (lower = higher priority)';
COMMENT ON COLUMN "meeting"."folder_id" IS 'Optional folder assignment for meeting organization';
