-- Migration: Add separate idempotency keys to subscription_cache for usage deduplication
-- SECURITY FIX: Prevents duplicate usage increments on retries (e.g., network errors during reporting)
-- Uses SEPARATE columns for minutes and email drafts to avoid cross-contamination

-- Add idempotency key column for meeting minutes
ALTER TABLE subscription_cache ADD COLUMN IF NOT EXISTS last_minutes_idempotency_key TEXT;

-- Add idempotency key column for email drafts
ALTER TABLE subscription_cache ADD COLUMN IF NOT EXISTS last_drafts_idempotency_key TEXT;

-- Add comments explaining the purpose
COMMENT ON COLUMN subscription_cache.last_minutes_idempotency_key IS 'Last idempotency key for minutes usage increments. Prevents duplicate reports on retry.';
COMMENT ON COLUMN subscription_cache.last_drafts_idempotency_key IS 'Last idempotency key for email drafts usage increments. Prevents duplicate reports on retry.';
