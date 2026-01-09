-- Migration: Add Agent Builder Tables
-- Purpose: Enable Agent Builder feature for user-created AI agents
-- Created: Phase 1 of Agent Builder Implementation
--
-- This migration creates the agent, agent_schedule, agent_trigger, and
-- agent_execution tables. Agents automate meeting-related workflows using
-- natural language instructions with @ mentions.

-- ============================================================================
-- Agent Table
-- ============================================================================
-- Core entity for user-created AI agents that automate workflows.
-- Instructions use @ mentions: @General (folder), @Engineering (team), @Gmail (service)

CREATE TABLE IF NOT EXISTS "agent" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,

    -- Basic info
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,

    -- Parsed references (extracted from instructions for quick lookups)
    "referenced_folders" TEXT[],
    "referenced_teams" TEXT[],
    "referenced_services" TEXT[],

    -- Configuration
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "is_active" BOOLEAN NOT NULL DEFAULT FALSE,

    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent Indexes
-- ============================================================================

-- Index for listing agents by user
CREATE INDEX IF NOT EXISTS "idx_agent_user" ON "agent" ("user_id");

-- Index for filtering active agents by user
CREATE INDEX IF NOT EXISTS "idx_agent_active" ON "agent" ("user_id", "is_active");

-- ============================================================================
-- Agent Schedule Table
-- ============================================================================
-- Time-based scheduling for agent execution.
-- Supports: once, hourly, daily, weekly, monthly

CREATE TABLE IF NOT EXISTS "agent_schedule" (
    "id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL REFERENCES "agent"("id") ON DELETE CASCADE,

    -- Schedule type: once, hourly, daily, weekly, monthly
    "schedule_type" TEXT NOT NULL,

    -- For 'once': specific datetime
    "scheduled_at" TIMESTAMP,

    -- For recurring: cron-like config
    "hour" INTEGER,
    "minute" INTEGER,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "timezone" TEXT DEFAULT 'UTC',

    -- Tracking
    "last_run_at" TIMESTAMP,
    "next_run_at" TIMESTAMP,
    "is_enabled" BOOLEAN NOT NULL DEFAULT TRUE,

    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent Schedule Indexes
-- ============================================================================

-- Index for listing schedules by agent
CREATE INDEX IF NOT EXISTS "idx_agent_schedule_agent" ON "agent_schedule" ("agent_id");

-- Index for finding schedules due to run
CREATE INDEX IF NOT EXISTS "idx_agent_schedule_next_run" ON "agent_schedule" ("next_run_at");

-- Index for finding enabled schedules due to run
CREATE INDEX IF NOT EXISTS "idx_agent_schedule_enabled" ON "agent_schedule" ("is_enabled", "next_run_at");

-- ============================================================================
-- Agent Trigger Table
-- ============================================================================
-- Event-based triggers for agent execution.
-- Trigger types:
--   - meeting_end: When a meeting session ends
--   - meeting_start: When a meeting session starts
--   - new_meeting_in_folder: When a new meeting is added to a folder
--   - manual: Only triggered by user clicking "Run Now"

CREATE TABLE IF NOT EXISTS "agent_trigger" (
    "id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL REFERENCES "agent"("id") ON DELETE CASCADE,

    -- Event type that triggers the agent
    "trigger_type" TEXT NOT NULL,

    -- Optional: scope trigger to specific folder/team
    "scope_folder_id" TEXT REFERENCES "meeting_folder"("id") ON DELETE SET NULL,
    "scope_team_id" TEXT REFERENCES "team"("id") ON DELETE SET NULL,

    "is_enabled" BOOLEAN NOT NULL DEFAULT TRUE,

    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent Trigger Indexes
-- ============================================================================

-- Index for listing triggers by agent
CREATE INDEX IF NOT EXISTS "idx_agent_trigger_agent" ON "agent_trigger" ("agent_id");

-- Index for finding triggers by type
CREATE INDEX IF NOT EXISTS "idx_agent_trigger_type" ON "agent_trigger" ("trigger_type");

-- Index for finding triggers by folder scope
CREATE INDEX IF NOT EXISTS "idx_agent_trigger_folder" ON "agent_trigger" ("scope_folder_id");

-- Index for finding triggers by team scope
CREATE INDEX IF NOT EXISTS "idx_agent_trigger_team" ON "agent_trigger" ("scope_team_id");

-- Index for finding enabled triggers by type
CREATE INDEX IF NOT EXISTS "idx_agent_trigger_enabled_type" ON "agent_trigger" ("is_enabled", "trigger_type");

-- ============================================================================
-- Agent Execution Table
-- ============================================================================
-- Tracks individual agent runs with context, results, and timing.
-- Used for audit trail and debugging.

CREATE TABLE IF NOT EXISTS "agent_execution" (
    "id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL REFERENCES "agent"("id") ON DELETE CASCADE,

    -- What triggered this execution: schedule, trigger, or manual
    "triggered_by" TEXT NOT NULL,
    "schedule_id" TEXT REFERENCES "agent_schedule"("id") ON DELETE SET NULL,
    "trigger_id" TEXT REFERENCES "agent_trigger"("id") ON DELETE SET NULL,

    -- Status: pending, running, completed, failed
    "status" TEXT NOT NULL DEFAULT 'pending',

    -- Results (JSONB for flexible structure)
    "input_context" JSONB,
    "output_result" JSONB,
    "error_message" TEXT,

    -- Timing
    "started_at" TIMESTAMP,
    "completed_at" TIMESTAMP,
    "duration_ms" INTEGER,

    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Agent Execution Indexes
-- ============================================================================

-- Index for listing executions by agent
CREATE INDEX IF NOT EXISTS "idx_agent_execution_agent" ON "agent_execution" ("agent_id");

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS "idx_agent_execution_status" ON "agent_execution" ("status");

-- Index for filtering by trigger type
CREATE INDEX IF NOT EXISTS "idx_agent_execution_triggered_by" ON "agent_execution" ("triggered_by");

-- Index for sorting by creation time
CREATE INDEX IF NOT EXISTS "idx_agent_execution_created" ON "agent_execution" ("created_at");

-- Composite index for listing recent executions by agent
CREATE INDEX IF NOT EXISTS "idx_agent_execution_agent_created" ON "agent_execution" ("agent_id", "created_at");

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "agent" IS 'User-created AI agents that automate meeting workflows using natural language instructions';
COMMENT ON COLUMN "agent"."instructions" IS 'Natural language instructions with @ mentions for folders, teams, and services';
COMMENT ON COLUMN "agent"."referenced_folders" IS 'Parsed folder IDs from @ mentions (e.g., @General)';
COMMENT ON COLUMN "agent"."referenced_teams" IS 'Parsed team IDs from @ mentions (e.g., @Engineering)';
COMMENT ON COLUMN "agent"."referenced_services" IS 'Parsed service names from @ mentions (e.g., @Gmail, @Calendar)';
COMMENT ON COLUMN "agent"."model" IS 'LLM model to use: gpt-4o (default)';
COMMENT ON COLUMN "agent"."is_active" IS 'Whether agent can be triggered (false = disabled)';

COMMENT ON TABLE "agent_schedule" IS 'Time-based scheduling for agent execution';
COMMENT ON COLUMN "agent_schedule"."schedule_type" IS 'Type: once, hourly, daily, weekly, monthly';
COMMENT ON COLUMN "agent_schedule"."scheduled_at" IS 'Specific datetime for one-time schedules';
COMMENT ON COLUMN "agent_schedule"."timezone" IS 'IANA timezone for schedule calculations';
COMMENT ON COLUMN "agent_schedule"."next_run_at" IS 'Calculated next execution time (updated after each run)';

COMMENT ON TABLE "agent_trigger" IS 'Event-based triggers for agent execution';
COMMENT ON COLUMN "agent_trigger"."trigger_type" IS 'Event type: meeting_end, meeting_start, new_meeting_in_folder, manual';
COMMENT ON COLUMN "agent_trigger"."scope_folder_id" IS 'Limit trigger to meetings in this folder (null = all)';
COMMENT ON COLUMN "agent_trigger"."scope_team_id" IS 'Limit trigger to meetings involving this team (null = all)';

COMMENT ON TABLE "agent_execution" IS 'Audit log of individual agent runs with context and results';
COMMENT ON COLUMN "agent_execution"."triggered_by" IS 'What triggered execution: schedule, trigger, or manual';
COMMENT ON COLUMN "agent_execution"."status" IS 'Execution status: pending, running, completed, failed';
COMMENT ON COLUMN "agent_execution"."input_context" IS 'JSONB: meeting IDs, folder IDs, teams, services, trigger event details';
COMMENT ON COLUMN "agent_execution"."output_result" IS 'JSONB: text output, tool calls, token usage, emails sent';
COMMENT ON COLUMN "agent_execution"."duration_ms" IS 'Execution duration in milliseconds';
