-- Migration: Add Meeting Template Tables
-- Purpose: Enable reusable meeting templates with predefined agendas and planning questions
-- Created: Phase 1 of Meeting Templates Feature Implementation
--
-- This migration creates:
-- 1. meeting_template - Core template definitions
-- 2. template_agenda_item - Predefined agenda structure for templates
-- 3. template_planning_question - Pre-meeting planning questions
-- 4. New columns on meeting table for template linking

-- ============================================================================
-- Meeting Template Table
-- ============================================================================
-- Reusable structures for creating meetings with predefined settings.
-- Scopes: system (built-in), team (shared), personal (private)
-- Categories: sync, tactical, strategic, one_on_one, workshop, decision

CREATE TABLE IF NOT EXISTS "meeting_template" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'tactical',
    "scope" TEXT NOT NULL DEFAULT 'personal',
    "team_id" TEXT REFERENCES "team"("id") ON DELETE CASCADE,
    "created_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
    "default_duration" INTEGER NOT NULL DEFAULT 60,
    "suggested_cadence" TEXT,
    "default_goal" TEXT,
    "default_settings" JSONB DEFAULT '{}',
    "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Meeting Template Indexes
-- ============================================================================

-- Index for listing templates by scope (system, team, personal)
CREATE INDEX IF NOT EXISTS "idx_meeting_template_scope" ON "meeting_template" ("scope");

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS "idx_meeting_template_category" ON "meeting_template" ("category");

-- Index for listing team templates
CREATE INDEX IF NOT EXISTS "idx_meeting_template_team" ON "meeting_template" ("team_id");

-- Index for listing user's personal templates
CREATE INDEX IF NOT EXISTS "idx_meeting_template_creator" ON "meeting_template" ("created_by");

-- Index for filtering archived templates
CREATE INDEX IF NOT EXISTS "idx_meeting_template_archived" ON "meeting_template" ("is_archived");

-- Composite index for efficient scope + category queries
CREATE INDEX IF NOT EXISTS "idx_meeting_template_scope_category" ON "meeting_template" ("scope", "category");

-- ============================================================================
-- Template Agenda Item Table
-- ============================================================================
-- Predefined agenda structure for templates.
-- When creating a meeting from a template, these become actual agenda items.

CREATE TABLE IF NOT EXISTS "template_agenda_item" (
    "id" TEXT PRIMARY KEY,
    "template_id" TEXT NOT NULL REFERENCES "meeting_template"("id") ON DELETE CASCADE,
    "order_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_duration" INTEGER NOT NULL DEFAULT 5,
    "is_required" BOOLEAN NOT NULL DEFAULT FALSE,
    "presenter_role" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Template Agenda Item Indexes
-- ============================================================================

-- Index for listing agenda items by template
CREATE INDEX IF NOT EXISTS "idx_template_agenda_item_template" ON "template_agenda_item" ("template_id");

-- Index for ordering items within a template
CREATE INDEX IF NOT EXISTS "idx_template_agenda_item_order" ON "template_agenda_item" ("template_id", "order_index");

-- ============================================================================
-- Template Planning Question Table
-- ============================================================================
-- Questions to answer before starting a meeting.
-- Categories: goal, attendees, preparation, outcome

CREATE TABLE IF NOT EXISTS "template_planning_question" (
    "id" TEXT PRIMARY KEY,
    "template_id" TEXT NOT NULL REFERENCES "meeting_template"("id") ON DELETE CASCADE,
    "order_index" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'preparation',
    "is_required" BOOLEAN NOT NULL DEFAULT FALSE,
    "placeholder" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Template Planning Question Indexes
-- ============================================================================

-- Index for listing questions by template
CREATE INDEX IF NOT EXISTS "idx_template_planning_question_template" ON "template_planning_question" ("template_id");

-- Index for ordering questions within a template
CREATE INDEX IF NOT EXISTS "idx_template_planning_question_order" ON "template_planning_question" ("template_id", "order_index");

-- ============================================================================
-- Meeting Table Alterations
-- ============================================================================
-- Add template-related columns to the meeting table

-- Template reference (nullable - meetings can be created without templates)
ALTER TABLE "meeting" ADD COLUMN IF NOT EXISTS "template_id" TEXT;

-- Meeting goal/purpose (may come from template or be custom)
ALTER TABLE "meeting" ADD COLUMN IF NOT EXISTS "meeting_goal" TEXT;

-- Answers to planning questions (JSONB: { questionId: answer })
ALTER TABLE "meeting" ADD COLUMN IF NOT EXISTS "planning_answers" JSONB DEFAULT '{}';

-- Index for finding meetings created from a specific template
CREATE INDEX IF NOT EXISTS "idx_meeting_template" ON "meeting" ("template_id");

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "meeting_template" IS 'Reusable meeting templates with predefined structure and settings';
COMMENT ON COLUMN "meeting_template"."scope" IS 'Template visibility: system (built-in), team (shared), personal (private)';
COMMENT ON COLUMN "meeting_template"."category" IS 'Meeting category: sync, tactical, strategic, one_on_one, workshop, decision';
COMMENT ON COLUMN "meeting_template"."default_duration" IS 'Default meeting duration in minutes';
COMMENT ON COLUMN "meeting_template"."suggested_cadence" IS 'Recommended meeting frequency: daily, weekly, biweekly, monthly, quarterly, etc.';
COMMENT ON COLUMN "meeting_template"."default_settings" IS 'Default MeetingSettings JSON (transcription, insights, recording flags)';
COMMENT ON COLUMN "meeting_template"."usage_count" IS 'Number of meetings created from this template';

COMMENT ON TABLE "template_agenda_item" IS 'Predefined agenda items for meeting templates';
COMMENT ON COLUMN "template_agenda_item"."presenter_role" IS 'Who presents: host, participant, or anyone';
COMMENT ON COLUMN "template_agenda_item"."is_required" IS 'Whether this item must be included in meetings using this template';

COMMENT ON TABLE "template_planning_question" IS 'Pre-meeting planning questions for templates';
COMMENT ON COLUMN "template_planning_question"."category" IS 'Question category: goal, attendees, preparation, outcome';
COMMENT ON COLUMN "template_planning_question"."is_required" IS 'Whether an answer is required before starting the meeting';

COMMENT ON COLUMN "meeting"."template_id" IS 'Reference to the template used to create this meeting (null if created without template)';
COMMENT ON COLUMN "meeting"."meeting_goal" IS 'Meeting goal/purpose (may come from template default_goal or be custom)';
COMMENT ON COLUMN "meeting"."planning_answers" IS 'JSONB map of planning question ID to user answer';
