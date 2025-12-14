-- Migration: Add calendar_integration table for Google Calendar OAuth
-- This table stores OAuth tokens for external calendar providers

CREATE TABLE IF NOT EXISTS "calendar_integration" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'google',
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT,
  "token_expires_at" TIMESTAMP,
  "scope" TEXT,
  "calendar_email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "last_synced_at" TIMESTAMP,
  "error_message" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_calendar_integration_user" ON "calendar_integration"("user_id");
-- Unique constraint: one provider per user
CREATE UNIQUE INDEX IF NOT EXISTS "idx_calendar_integration_user_provider" ON "calendar_integration"("user_id", "provider");

-- ============================================================================
-- RLS (Row Level Security) - DISABLED
-- ============================================================================
-- NOTE: This application uses Better Auth (not Supabase Auth), so we handle
-- authorization at the application layer in API routes instead of using RLS.
-- ============================================================================
