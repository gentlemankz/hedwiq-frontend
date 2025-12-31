-- Migration: Add usage deduplication fields to meeting_session
-- SECURITY FIX (Medium #12): Prevent double-billing from frontend and agent both reporting

-- Add field to track when usage was reported to Polar
ALTER TABLE meeting_session ADD COLUMN IF NOT EXISTS usage_reported_at TIMESTAMP;

-- Add field to track which source reported the usage (for audit trail)
ALTER TABLE meeting_session ADD COLUMN IF NOT EXISTS usage_reported_source TEXT;

-- Add field to track reported minutes (for reconciliation)
ALTER TABLE meeting_session ADD COLUMN IF NOT EXISTS usage_reported_minutes INTEGER;

-- Add index for finding sessions that haven't had usage reported
CREATE INDEX IF NOT EXISTS idx_meeting_session_usage_pending
ON meeting_session (user_id, left_at)
WHERE usage_reported_at IS NULL AND left_at IS NOT NULL;

-- Add comment explaining the deduplication logic
COMMENT ON COLUMN meeting_session.usage_reported_at IS 'Timestamp when usage was successfully reported to Polar. Used for deduplication.';
COMMENT ON COLUMN meeting_session.usage_reported_source IS 'Source that reported usage: "frontend" or "agent". For audit trail.';
COMMENT ON COLUMN meeting_session.usage_reported_minutes IS 'Minutes reported to Polar. For reconciliation if needed.';
