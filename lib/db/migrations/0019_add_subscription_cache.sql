-- Migration: Add subscription_cache and webhook_log tables for Polar integration
-- Phase 7: Database Schema Changes for Polar Payment Integration

-- ============================================================================
-- Subscription Cache Table
-- ============================================================================
-- Local cache of Polar subscription data for faster reads and offline access.
-- Source of truth is Polar, but this enables:
-- - Faster subscription checks without API calls
-- - Offline/fallback when Polar is unavailable
-- - Local usage tracking that syncs to Polar

CREATE TABLE IF NOT EXISTS "subscription_cache" (
  -- Identifiers
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,

  -- Polar identifiers
  "polar_customer_id" TEXT,
  "polar_subscription_id" TEXT,

  -- Subscription state
  "tier" TEXT NOT NULL DEFAULT 'free',  -- free, pro, business, enterprise
  "status" TEXT NOT NULL DEFAULT 'none', -- none, active, trialing, canceled, past_due
  "billing_interval" TEXT,              -- month, year, or null for free
  "current_period_end" TIMESTAMP,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tier limits (cached for quick access)
  -- -1 = unlimited
  "minutes_limit" INTEGER NOT NULL DEFAULT 300,
  "storage_limit_gb" INTEGER NOT NULL DEFAULT 0,
  "history_days" INTEGER NOT NULL DEFAULT 7,
  "email_drafts_limit" INTEGER NOT NULL DEFAULT 0,

  -- Current period usage
  "minutes_used" INTEGER NOT NULL DEFAULT 0,
  "email_drafts_used" INTEGER NOT NULL DEFAULT 0,
  "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,  -- BIGINT to support >2GB (Business tier allows 20GB)
  "usage_period_start" TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Sync metadata
  "last_synced_at" TIMESTAMP,
  "sync_error" TEXT,

  -- Timestamps
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for subscription_cache
CREATE INDEX IF NOT EXISTS "idx_subscription_cache_period" ON "subscription_cache" ("usage_period_start");
CREATE INDEX IF NOT EXISTS "idx_subscription_cache_polar_customer" ON "subscription_cache" ("polar_customer_id");
CREATE INDEX IF NOT EXISTS "idx_subscription_cache_tier" ON "subscription_cache" ("tier");
CREATE INDEX IF NOT EXISTS "idx_subscription_cache_status" ON "subscription_cache" ("status");

-- ============================================================================
-- Webhook Log Table
-- ============================================================================
-- Audit log for Polar webhook events.
-- Used for debugging webhook delivery issues and manual recovery.

CREATE TABLE IF NOT EXISTS "webhook_log" (
  "id" TEXT PRIMARY KEY,
  "event_id" TEXT NOT NULL UNIQUE,  -- Polar webhook event ID for idempotency
  "event_type" TEXT NOT NULL,       -- e.g., subscription.active, subscription.canceled
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "payload" JSONB,                  -- Raw payload for debugging (truncated)
  "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for webhook_log
CREATE INDEX IF NOT EXISTS "idx_webhook_log_event_type" ON "webhook_log" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_webhook_log_received" ON "webhook_log" ("received_at");
CREATE INDEX IF NOT EXISTS "idx_webhook_log_success" ON "webhook_log" ("success");

-- ============================================================================
-- RLS Policies
-- ============================================================================
-- NOTE: This project uses Better Auth (not Supabase Auth), so auth.uid() is unavailable.
-- Authorization is enforced at the API level via Better Auth session validation.
-- RLS is disabled for these tables - all access goes through authenticated API routes.

-- If using Supabase and need RLS, uncomment and adapt these policies:
-- ALTER TABLE "subscription_cache" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "webhook_log" ENABLE ROW LEVEL SECURITY;

-- For deployments using direct database access with RLS:
-- Consider using a custom JWT claim or application-level user context.
-- See: https://supabase.com/docs/guides/auth/row-level-security#using-custom-jwt-claims

-- ============================================================================
-- Helper function to update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_subscription_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscription_cache_updated_at
  BEFORE UPDATE ON "subscription_cache"
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_cache_updated_at();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE "subscription_cache" IS 'Local cache of Polar subscription data for faster reads and offline access';
COMMENT ON COLUMN "subscription_cache"."tier" IS 'Subscription tier: free, pro, business, enterprise';
COMMENT ON COLUMN "subscription_cache"."status" IS 'Subscription status: none, active, trialing, canceled, past_due';
COMMENT ON COLUMN "subscription_cache"."minutes_limit" IS 'Monthly meeting minutes limit (-1 for unlimited)';
COMMENT ON COLUMN "subscription_cache"."storage_limit_gb" IS 'Storage limit in GB (-1 for unlimited)';
COMMENT ON COLUMN "subscription_cache"."history_days" IS 'Meeting history retention in days (-1 for unlimited)';
COMMENT ON COLUMN "subscription_cache"."email_drafts_limit" IS 'Monthly email drafts limit (-1 for unlimited)';

COMMENT ON TABLE "webhook_log" IS 'Audit log for Polar webhook events';
COMMENT ON COLUMN "webhook_log"."event_id" IS 'Polar webhook event ID for idempotency checks';
