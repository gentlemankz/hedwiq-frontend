-- Add email domain allowlist column to agent table
-- This allows restricting which email domains an agent can send to via the sendEmail tool

ALTER TABLE "agent" ADD COLUMN "email_domain_allowlist" TEXT[];
