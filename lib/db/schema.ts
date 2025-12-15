import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Room participants table for tracking who has joined which rooms.
 * Used for access control on room-scoped resources like documents.
 */
export const roomParticipant = pgTable("room_participant", {
  /** Composite primary key: odId + roomId */
  id: text("id").primaryKey(),
  /** User ID */
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** LiveKit room ID */
  roomId: text("room_id").notNull(),
  /** First time user joined this room */
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  /** Last time user accessed this room */
  lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
});

/**
 * Documents table for storing metadata about uploaded meeting documents.
 * Actual PDF files are stored in Supabase Storage.
 */
export const document = pgTable("document", {
  /** Unique document identifier (e.g., doc-1234567890-0) */
  id: text("id").primaryKey(),
  /** LiveKit room ID for scoping */
  roomId: text("room_id").notNull(),
  /** Original filename */
  filename: text("filename").notNull(),
  /** Document title (extracted from PDF or filename) */
  title: text("title").notNull(),
  /** Number of pages in the document */
  pageCount: integer("page_count").notNull().default(0),
  /** File size in bytes */
  fileSize: integer("file_size").notNull().default(0),
  /** Storage path in Supabase Storage (bucket/path format) */
  storagePath: text("storage_path").notNull(),
  /** Processing status: processing, ready, error */
  status: text("status").notNull().default("processing"),
  /** Error message if processing failed */
  errorMessage: text("error_message"),
  /** User ID who uploaded the document */
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Additional metadata (summary, segments count, etc.) */
  metadata: jsonb("metadata").$type<{
    summary?: string;
    segmentCount?: number;
  }>(),
  /** Unix timestamp when uploaded (milliseconds) */
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Meeting Agendas - One per room, created by the meeting organizer.
 * Used for automatic topic tracking during meetings.
 *
 * Agendas can be linked to rooms OR meetings:
 * - roomId: For instant meetings (agenda created in pre-join screen)
 * - meetingId: For scheduled meetings (agenda created during scheduling)
 */
export const agenda = pgTable(
  "agenda",
  {
    /** Unique agenda identifier (e.g., agenda-{roomId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** LiveKit room ID - unique constraint ensures one agenda per room */
    roomId: text("room_id").notNull().unique(),
    /** User who created the agenda */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Meeting ID - links agenda to a scheduled meeting (optional).
     * When set, this agenda was created during meeting scheduling.
     * Allows agenda to be preserved and shown in pre-join.
     */
    meetingId: text("meeting_id").references(() => meeting.id, {
      onDelete: "cascade",
    }),
    /** Meeting name/title (e.g., "Marketing Team. Production") */
    meetingName: text("meeting_name"),
    /** Scheduled meeting time (for display in header) */
    scheduledAt: timestamp("scheduled_at"),
    /** Total number of items (denormalized for quick access) */
    itemCount: integer("item_count").notNull().default(0),
    /** Overall status: draft, active, completed */
    status: text("status").notNull().default("draft"),
    /** Current active item index (0-based, null if not started) */
    currentItemIndex: integer("current_item_index"),
    /**
     * Version number - incremented on definition edits.
     * Used for cache invalidation and conflict detection.
     */
    version: integer("version").notNull().default(1),
    /** Meeting start time (when first item started) */
    meetingStartedAt: timestamp("meeting_started_at"),
    /** Meeting end time (when last item completed) */
    meetingEndedAt: timestamp("meeting_ended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agenda_room").on(table.roomId),
    index("idx_agenda_meeting").on(table.meetingId),
  ]
);

/**
 * Agenda Items - Individual topics within an agenda.
 * Tracks status, timing, and links to transcript segments.
 */
export const agendaItem = pgTable(
  "agenda_item",
  {
    /** Unique item identifier (e.g., item-{agendaId}-{index}) */
    id: text("id").primaryKey(),
    /** Parent agenda */
    agendaId: text("agenda_id")
      .notNull()
      .references(() => agenda.id, { onDelete: "cascade" }),
    /** Display order (0-based) */
    orderIndex: integer("order_index").notNull(),
    /** Topic title (required) */
    title: text("title").notNull(),
    /** Topic description (optional) */
    description: text("description"),
    /** Estimated duration in minutes (optional) */
    estimatedDuration: integer("estimated_duration"),
    /** Assigned presenter/leader (optional) */
    presenter: text("presenter"),
    /** Item status: pending, in_progress, completed, skipped */
    status: text("status").notNull().default("pending"),
    /** Actual start time */
    startedAt: timestamp("started_at"),
    /** Actual end time */
    completedAt: timestamp("completed_at"),
    /** Actual duration in seconds (calculated) */
    actualDuration: integer("actual_duration"),
    /** Transcript segment ID when topic started (for linking) */
    startTranscriptRef: text("start_transcript_ref"),
    /** Transcript segment ID when topic ended */
    endTranscriptRef: text("end_transcript_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agenda_item_agenda").on(table.agendaId),
    index("idx_agenda_item_order").on(table.agendaId, table.orderIndex),
  ]
);

// ============================================================================
// Calendar Integration Tables
// ============================================================================

/**
 * Calendar Integration - Stores OAuth tokens for external calendar providers.
 * One integration per user per provider (e.g., Google Calendar).
 */
export const calendarIntegration = pgTable(
  "calendar_integration",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** User who connected the calendar */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Calendar provider (e.g., "google") */
    provider: text("provider").notNull().default("google"),
    /** OAuth access token */
    accessToken: text("access_token").notNull(),
    /** OAuth refresh token */
    refreshToken: text("refresh_token"),
    /** Token expiry timestamp */
    tokenExpiresAt: timestamp("token_expires_at"),
    /** OAuth scopes granted */
    scope: text("scope"),
    /** Email associated with the calendar account */
    calendarEmail: text("calendar_email"),
    /** Connection status: connected, disconnected, error */
    status: text("status").notNull().default("connected"),
    /** Last sync timestamp */
    lastSyncedAt: timestamp("last_synced_at"),
    /** Error message if status is 'error' */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_integration_user").on(table.userId),
    // Unique constraint: one provider per user (matches migration)
    uniqueIndex("idx_calendar_integration_user_provider").on(
      table.userId,
      table.provider
    ),
  ]
);

// ============================================================================
// Meeting Scheduling Tables
// ============================================================================

// Import MeetingSettings from types to avoid duplication
// Re-export for backward compatibility if needed elsewhere
import type { MeetingSettings } from "@/types/meeting";
export type { MeetingSettings } from "@/types/meeting";

/**
 * Meetings table - both instant and scheduled meetings.
 * Links to roomId for LiveKit integration.
 */
export const meeting = pgTable(
  "meeting",
  {
    /** Unique meeting identifier (e.g., mtg-{timestamp}-{random}) */
    id: text("id").primaryKey(),
    /** LiveKit room ID (abc-defg-hij format) */
    roomId: text("room_id").notNull().unique(),
    /** User who created/hosts the meeting */
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Meeting details
    /** Meeting title/name */
    title: text("title").notNull(),
    /** Meeting description (optional) */
    description: text("description"),
    /** Meeting type: instant or scheduled */
    type: text("type").notNull().default("instant"),
    /** Meeting status: scheduled, live, ended, cancelled */
    status: text("status").notNull().default("scheduled"),

    // Scheduling
    /** Scheduled start time (null for instant meetings) */
    scheduledAt: timestamp("scheduled_at"),
    /** Expected duration in minutes */
    durationMinutes: integer("duration_minutes").default(60),
    /** User's timezone for display */
    timezone: text("timezone").default("UTC"),

    // Tracking
    /** Actual start time */
    startedAt: timestamp("started_at"),
    /** Actual end time */
    endedAt: timestamp("ended_at"),

    // Settings
    /** Meeting settings (transcription, insights, recording) */
    settings: jsonb("settings").$type<MeetingSettings>().default({}),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_host").on(table.hostId),
    index("idx_meeting_scheduled").on(table.scheduledAt),
    index("idx_meeting_status").on(table.status),
    // Note: room_id unique index is auto-created by .unique() constraint
    // Composite index for listing meetings by host with status filter
    index("idx_meeting_host_status").on(table.hostId, table.status),
  ]
);

// ============================================================================
// Calendar Event Sync Tables
// ============================================================================

/**
 * Calendar Event - Maps Hedwiq meetings to external calendar events.
 * Tracks sync status for each meeting-calendar pair.
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this event is synced to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Calendar integration this event belongs to */
    integrationId: text("integration_id")
      .notNull()
      .references(() => calendarIntegration.id, { onDelete: "cascade" }),

    // External calendar event details
    /** External provider's event ID (e.g., Google Calendar event ID) */
    providerEventId: text("provider_event_id").notNull(),
    /** Link to view the event in the external calendar */
    providerEventLink: text("provider_event_link"),

    // Sync tracking
    /** Sync status: synced, pending, failed, deleted */
    syncStatus: text("sync_status").notNull().default("synced"),
    /** Last successful sync timestamp */
    lastSyncedAt: timestamp("last_synced_at"),
    /** Error message if sync failed */
    syncError: text("sync_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_event_meeting").on(table.meetingId),
    index("idx_calendar_event_integration").on(table.integrationId),
    index("idx_calendar_event_sync_status").on(table.syncStatus),
    uniqueIndex("idx_calendar_event_meeting_integration").on(
      table.meetingId,
      table.integrationId
    ),
  ]
);

// ============================================================================
// Meeting Invitee Tables
// ============================================================================

/**
 * Meeting Invitee - Tracks invitations sent for meetings.
 * Enables email invitations with RSVP tracking.
 */
export const meetingInvitee = pgTable(
  "meeting_invitee",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this invitation is for */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),

    // Invitee info
    /** Email address of the invitee */
    email: text("email").notNull(),
    /** Display name of the invitee (optional) */
    name: text("name"),

    // RSVP status: 'pending' | 'accepted' | 'declined' | 'tentative'
    /** Current RSVP status */
    status: text("status").notNull().default("pending"),
    /** When the invitee responded */
    respondedAt: timestamp("responded_at"),

    // Invitation tracking
    /** When the invitation was sent */
    invitedAt: timestamp("invited_at").notNull().defaultNow(),
    /** User who sent the invitation */
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id),

    // Email tracking
    /** When the email was sent */
    emailSentAt: timestamp("email_sent_at"),
    /** When the email was opened (if tracking enabled) */
    emailOpenedAt: timestamp("email_opened_at"),

    /** Token for RSVP without authentication */
    rsvpToken: text("rsvp_token").unique(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_invitee_meeting").on(table.meetingId),
    index("idx_meeting_invitee_email").on(table.email),
    index("idx_meeting_invitee_status").on(table.status),
    uniqueIndex("idx_meeting_invitee_unique").on(table.meetingId, table.email),
  ]
);

// ============================================================================
// Meeting Data Persistence Tables
// ============================================================================

/**
 * Meeting Session - Tracks individual participation sessions in a meeting.
 * A user may have multiple sessions if they disconnect and rejoin.
 * This table links all meeting data (transcription, insights, notes) to a specific session.
 */
export const meetingSession = pgTable(
  "meeting_session",
  {
    /** Unique session identifier */
    id: text("id").primaryKey(),
    /** Meeting this session belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** User who participated in this session */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** LiveKit room ID for quick access */
    roomId: text("room_id").notNull(),
    /** When the user joined the meeting */
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    /** When the user left the meeting (null if still connected) */
    leftAt: timestamp("left_at"),
    /** Session duration in seconds (calculated on leave) */
    durationSeconds: integer("duration_seconds"),
    /** Whether this is the host's session */
    isHost: boolean("is_host").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_session_meeting").on(table.meetingId),
    index("idx_meeting_session_user").on(table.userId),
    index("idx_meeting_session_room").on(table.roomId),
    index("idx_meeting_session_joined").on(table.joinedAt),
  ]
);

/**
 * Transcription Segment - Stores transcribed speech from meetings.
 * Each segment represents a continuous piece of speech from one speaker.
 */
export const transcriptionSegment = pgTable(
  "transcription_segment",
  {
    /** Unique identifier (uses LiveKit segment ID) */
    id: text("id").primaryKey(),
    /** Meeting this transcription belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Speaker's identity (user ID or guest identifier) */
    speakerIdentity: text("speaker_identity").notNull(),
    /** Speaker's display name */
    speakerName: text("speaker_name").notNull(),
    /** Transcribed text content */
    text: text("text").notNull(),
    /** When this speech occurred (Unix timestamp ms) */
    timestamp: timestamp("timestamp").notNull(),
    /** Order within the meeting for sorting */
    orderIndex: integer("order_index").notNull().default(0),
    /** Whether this is the final version (vs interim) */
    isFinal: boolean("is_final").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_transcription_meeting").on(table.meetingId),
    index("idx_transcription_room").on(table.roomId),
    index("idx_transcription_timestamp").on(table.timestamp),
    index("idx_transcription_order").on(table.meetingId, table.orderIndex),
  ]
);

/**
 * Meeting Insight - Stores AI-detected insights from meeting conversations.
 * Linked to transcription segments for context.
 */
export const meetingInsight = pgTable(
  "meeting_insight",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this insight belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Type of insight: idea, problem, solution, risk, insight, hypothesis, action_item, open_question */
    type: text("type").notNull(),
    /** The actual insight content */
    content: text("content").notNull(),
    /** Speaker's identity who mentioned this */
    speakerIdentity: text("speaker_identity"),
    /** Speaker's display name */
    speakerName: text("speaker_name"),
    /** Confidence score from 0.0 to 1.0 */
    confidence: integer("confidence").notNull().default(80),
    /** Reference to the transcription segment ID */
    transcriptRef: text("transcript_ref"),
    /** When the insight was detected (Unix timestamp ms) */
    timestamp: timestamp("timestamp").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_insight_meeting").on(table.meetingId),
    index("idx_insight_room").on(table.roomId),
    index("idx_insight_type").on(table.type),
    index("idx_insight_timestamp").on(table.timestamp),
    index("idx_insight_transcript").on(table.transcriptRef),
  ]
);

/**
 * Document Reference - Stores AI-detected references to uploaded documents.
 * Links speech to specific locations in documents.
 */
export const documentReference = pgTable(
  "document_reference",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this reference belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Referenced document */
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** Section ID for deduplication */
    sectionId: text("section_id").notNull(),
    /** Page number in the document (1-indexed) */
    pageNumber: integer("page_number").notNull().default(1),
    /** Title of the section if available */
    sectionTitle: text("section_title"),
    /** Evidence span from the document */
    matchedText: text("matched_text"),
    /** Bounding box for highlighting (JSON) */
    bbox: jsonb("bbox").$type<{
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }>(),
    /** Brief explanation of why this is a match */
    context: text("context").notNull(),
    /** Confidence score (0-100 as integer for DB) */
    confidence: integer("confidence").notNull().default(80),
    /** Reference to the transcription segment ID */
    transcriptRef: text("transcript_ref"),
    /** When the reference was detected (Unix timestamp ms) */
    timestamp: timestamp("timestamp").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_doc_ref_meeting").on(table.meetingId),
    index("idx_doc_ref_room").on(table.roomId),
    index("idx_doc_ref_document").on(table.documentId),
    index("idx_doc_ref_transcript").on(table.transcriptRef),
    index("idx_doc_ref_timestamp").on(table.timestamp),
  ]
);

/**
 * Meeting Note - Stores user notes created during meetings.
 * Uses JSONB to store the flexible block structure.
 */
export const meetingNote = pgTable(
  "meeting_note",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this note belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** User who created the note */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Ordered array of note blocks (text and transcript references) */
    blocks: jsonb("blocks")
      .notNull()
      .$type<
        Array<
          | {
              type: "text";
              id: string;
              content: string;
              createdAt: number;
              updatedAt: number;
            }
          | {
              type: "transcript";
              id: string;
              transcriptNoteId: string;
              createdAt: number;
            }
        >
      >()
      .default([]),
    /** Map of transcript notes by ID */
    transcriptNotes: jsonb("transcript_notes")
      .notNull()
      .$type<
        Record<
          string,
          {
            id: string;
            content: string;
            reference: {
              transcriptId: string;
              participantIdentity: string;
              participantName: string;
              transcriptText: string;
              transcriptTimestamp: number;
            };
            createdAt: number;
            updatedAt: number;
          }
        >
      >()
      .default({}),
    /** Storage version for migrations */
    version: integer("version").notNull().default(2),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_note_meeting").on(table.meetingId),
    index("idx_meeting_note_room").on(table.roomId),
    index("idx_meeting_note_user").on(table.userId),
    uniqueIndex("idx_meeting_note_unique").on(
      table.meetingId,
      table.userId
    ),
  ]
);
