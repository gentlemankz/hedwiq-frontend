-- Migration: Add Gmail Integration Table
-- Purpose: Store OAuth tokens for Gmail API access (Real-Time Actions feature)
-- Created: Phase 2 of Real-Time Actions Implementation

-- ============================================================================
-- Gmail Integration Table
-- ============================================================================
-- Stores OAuth tokens for Gmail send access.
-- One integration per user (unique constraint on user_id).

CREATE TABLE IF NOT EXISTS "gmail_integration" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP,
    "scope" TEXT,
    "gmail_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "error_message" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: one Gmail integration per user
-- Note: unique index already provides index functionality, no separate index needed
CREATE UNIQUE INDEX IF NOT EXISTS "idx_gmail_integration_user_unique" ON "gmail_integration" ("user_id");

-- ============================================================================
-- Comments
-- ============================================================================
-- status values: 'connected', 'disconnected', 'error'
-- access_token: OAuth access token (short-lived, refreshed automatically)
-- refresh_token: OAuth refresh token (long-lived, used to get new access tokens)
-- token_expires_at: When the access token expires
-- scope: OAuth scopes granted (gmail.send, userinfo.email)
-- gmail_email: Email address of the connected Gmail account
-- error_message: Error details if status is 'error'
