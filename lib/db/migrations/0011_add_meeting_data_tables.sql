-- Migration: Add Meeting Data Persistence Tables
-- This migration adds tables for storing meeting transcriptions, insights,
-- document references, and user notes.

-- ============================================================================
-- Meeting Session Table
-- ============================================================================
-- Tracks individual participation sessions in a meeting.
-- A user may have multiple sessions if they disconnect and rejoin.

CREATE TABLE IF NOT EXISTS "meeting_session" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    "joined_at" timestamp DEFAULT now() NOT NULL,
    "left_at" timestamp,
    "duration_seconds" integer,
    "is_host" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_meeting_session_meeting" ON "meeting_session" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_session_user" ON "meeting_session" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_session_room" ON "meeting_session" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_session_joined" ON "meeting_session" ("joined_at");

-- ============================================================================
-- Transcription Segment Table
-- ============================================================================
-- Stores transcribed speech from meetings.
-- Each segment represents a continuous piece of speech from one speaker.

CREATE TABLE IF NOT EXISTS "transcription_segment" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    "speaker_identity" text NOT NULL,
    "speaker_name" text NOT NULL,
    "text" text NOT NULL,
    "timestamp" timestamp NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "is_final" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_transcription_meeting" ON "transcription_segment" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_transcription_room" ON "transcription_segment" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_transcription_timestamp" ON "transcription_segment" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_transcription_order" ON "transcription_segment" ("meeting_id", "order_index");

-- ============================================================================
-- Meeting Insight Table
-- ============================================================================
-- Stores AI-detected insights from meeting conversations.
-- Linked to transcription segments for context.

CREATE TABLE IF NOT EXISTS "meeting_insight" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    "type" text NOT NULL,
    "content" text NOT NULL,
    "speaker_identity" text,
    "speaker_name" text,
    "confidence" integer DEFAULT 80 NOT NULL,
    "transcript_ref" text,
    "timestamp" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_insight_meeting" ON "meeting_insight" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_insight_room" ON "meeting_insight" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_insight_type" ON "meeting_insight" ("type");
CREATE INDEX IF NOT EXISTS "idx_insight_timestamp" ON "meeting_insight" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_insight_transcript" ON "meeting_insight" ("transcript_ref");

-- ============================================================================
-- Document Reference Table
-- ============================================================================
-- Stores AI-detected references to uploaded documents.
-- Links speech to specific locations in documents.

CREATE TABLE IF NOT EXISTS "document_reference" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    "document_id" text NOT NULL REFERENCES "document"("id") ON DELETE CASCADE,
    "section_id" text NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "section_title" text,
    "matched_text" text,
    "bbox" jsonb,
    "context" text NOT NULL,
    "confidence" integer DEFAULT 80 NOT NULL,
    "transcript_ref" text,
    "timestamp" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_doc_ref_meeting" ON "document_reference" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_doc_ref_room" ON "document_reference" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_doc_ref_document" ON "document_reference" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_doc_ref_transcript" ON "document_reference" ("transcript_ref");
CREATE INDEX IF NOT EXISTS "idx_doc_ref_timestamp" ON "document_reference" ("timestamp");

-- ============================================================================
-- Meeting Note Table
-- ============================================================================
-- Stores user notes created during meetings.
-- Uses JSONB to store the flexible block structure.

CREATE TABLE IF NOT EXISTS "meeting_note" (
    "id" text PRIMARY KEY NOT NULL,
    "meeting_id" text NOT NULL REFERENCES "meeting"("id") ON DELETE CASCADE,
    "room_id" text NOT NULL,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "transcript_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "version" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_meeting_note_meeting" ON "meeting_note" ("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_note_room" ON "meeting_note" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_note_user" ON "meeting_note" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_meeting_note_unique" ON "meeting_note" ("meeting_id", "user_id");
