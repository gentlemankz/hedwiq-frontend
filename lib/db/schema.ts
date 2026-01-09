import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  unique,
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
// Gmail Integration Tables
// ============================================================================

/**
 * Gmail Integration - Stores OAuth tokens for Gmail API access.
 * One integration per user (only Gmail provider supported).
 * Used for sending emails as part of Real-Time Actions feature.
 */
export const gmailIntegration = pgTable(
  "gmail_integration",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** User who connected Gmail */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** OAuth access token */
    accessToken: text("access_token").notNull(),
    /** OAuth refresh token */
    refreshToken: text("refresh_token"),
    /** Token expiry timestamp */
    tokenExpiresAt: timestamp("token_expires_at"),
    /** OAuth scopes granted */
    scope: text("scope"),
    /** Email associated with the Gmail account */
    gmailEmail: text("gmail_email"),
    /** Connection status: connected, disconnected, error */
    status: text("status").notNull().default("connected"),
    /** Error message if status is 'error' */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Unique constraint: one Gmail integration per user
    // Note: unique index already provides index functionality, no separate index needed
    uniqueIndex("idx_gmail_integration_user_unique").on(table.userId),
  ]
);

// ============================================================================
// Meeting Folder Tables
// ============================================================================

/**
 * Meeting Folder - Folders for organizing user's meetings.
 * Each user can have multiple folders, with one default "General" folder.
 */
export const meetingFolder = pgTable(
  "meeting_folder",
  {
    /** Unique folder identifier (e.g., folder-{userId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** User who owns this folder */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Folder name (e.g., "General", "Project Alpha") */
    name: text("name").notNull(),
    /** Optional hex color for folder display (e.g., #3B82F6) */
    color: text("color"),
    /** Optional icon identifier for folder display */
    icon: text("icon"),
    /** Display order (0-based, lower = higher priority) */
    orderIndex: integer("order_index").notNull().default(0),
    /** Whether this is the default "General" folder */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_folder_user").on(table.userId),
    index("idx_meeting_folder_order").on(table.userId, table.orderIndex),
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
    /** Optional folder for meeting organization */
    folderId: text("folder_id").references(() => meetingFolder.id, {
      onDelete: "set null",
    }),
    /** Template used to create this meeting (null if created without template) */
    templateId: text("template_id"),
    /** Meeting goal/purpose (may come from template or be custom) */
    meetingGoal: text("meeting_goal"),
    /** Answers to planning questions (JSONB: { questionId: answer }) */
    planningAnswers: jsonb("planning_answers")
      .$type<Record<string, string>>()
      .default({}),

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
    index("idx_meeting_folder").on(table.folderId),
    // Note: room_id unique index is auto-created by .unique() constraint
    // Composite index for listing meetings by host with status filter
    index("idx_meeting_host_status").on(table.hostId, table.status),
    // Index for finding meetings created from a template
    index("idx_meeting_template").on(table.templateId),
  ]
);

// ============================================================================
// Calendar Event Sync Tables
// ============================================================================

/**
 * Calendar Event - Maps Luframe meetings to external calendar events.
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
    /** When usage was reported to Polar (null if not yet reported) - SECURITY FIX Medium #12 */
    usageReportedAt: timestamp("usage_reported_at"),
    /** Source that reported usage ("frontend" or "agent") - for audit trail */
    usageReportedSource: text("usage_reported_source"),
    /** Minutes reported to Polar - for reconciliation */
    usageReportedMinutes: integer("usage_reported_minutes"),
    /** Billing status for fail-closed enforcement - SECURITY FIX #2 */
    billingStatus: text("billing_status").$type<"success" | "pending" | "failed">(),
    /** Error message if billing failed - for debugging/reconciliation */
    billingError: text("billing_error"),
    /** Reserved minutes for this session - SECURITY FIX #10 */
    reservedMinutes: integer("reserved_minutes"),
    /** Whether reserved minutes were released on early end */
    reservationReleased: boolean("reservation_released").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_session_meeting").on(table.meetingId),
    index("idx_meeting_session_user").on(table.userId),
    index("idx_meeting_session_room").on(table.roomId),
    index("idx_meeting_session_joined").on(table.joinedAt),
    // Index for billing reconciliation job to find pending sessions
    index("idx_meeting_session_billing_status").on(table.billingStatus),
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

// ============================================================================
// Real-Time Actions Tables (Phase 1)
// ============================================================================

/**
 * Action Item - Stores classified action items from meeting insights.
 * Actions are enhanced action_items with classification and metadata.
 *
 * Classification Types:
 * - email_followup: "send email", "follow up with"
 * - email_share: "share with", "send to"
 * - email_schedule: "schedule meeting with"
 * - task_create: "create task", "add to backlog"
 * - calendar_event: "block time", "schedule"
 * - manual: Default fallback
 */
export const actionItem = pgTable(
  "action_item",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Meeting this action belongs to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Link to original insight */
    originalInsightId: text("original_insight_id").notNull(),
    /** Action content from the original insight */
    content: text("content").notNull(),
    /** Speaker's identity */
    speakerIdentity: text("speaker_identity"),
    /** Speaker's display name */
    speakerName: text("speaker_name"),
    /** Reference to transcript segment */
    transcriptRef: text("transcript_ref"),
    /** Classification type */
    actionType: text("action_type").notNull().default("manual"),
    /** Classification confidence (0-100 as integer) */
    classificationConfidence: integer("classification_confidence")
      .notNull()
      .default(80),
    /** Extracted metadata (JSONB) */
    metadata: jsonb("metadata")
      .notNull()
      .$type<{
        recipientHint?: string;
        subjectHint?: string;
        projectHint?: string;
        assigneeHint?: string;
        datetimeHint?: string;
        durationHint?: string;
        urgency: "low" | "normal" | "high" | "critical";
      }>()
      .default({ urgency: "normal" }),
    /** Lifecycle status */
    status: text("status").notNull().default("detected"),
    /** Whether this action requires email */
    requiresEmail: boolean("requires_email").notNull().default(false),
    /** When the action was detected */
    timestamp: timestamp("timestamp").notNull(),
    /** When classification completed */
    classifiedAt: timestamp("classified_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_action_item_meeting").on(table.meetingId),
    index("idx_action_item_room").on(table.roomId),
    index("idx_action_item_type").on(table.actionType),
    index("idx_action_item_status").on(table.status),
    index("idx_action_item_timestamp").on(table.timestamp),
    index("idx_action_item_original_insight").on(table.originalInsightId),
    // Ensure one action per insight per meeting (prevents duplicates)
    unique("uq_action_item_meeting_insight").on(
      table.meetingId,
      table.originalInsightId
    ),
  ]
);

// ============================================================================
// Email Draft Tables (Phase 3 - Real-Time Actions)
// ============================================================================

/**
 * Email Recipient structure for to_addresses and cc_addresses JSONB columns.
 */
export interface EmailRecipientDb {
  email: string | null;
  name: string;
  source: "inferred" | "explicit" | "participant";
}

/**
 * Meeting context structure for meeting_context JSONB column.
 */
export interface MeetingContextDb {
  meetingTitle?: string | null;
  meetingDate?: string | null;
  participants: string[];
  agendaTopics: string[];
  roomId?: string | null;
}

/**
 * Email Draft - Stores AI-generated email drafts from meeting action items.
 * Drafts can be edited by users before sending via Gmail.
 *
 * Status values:
 * - generating: Draft is being generated by LLM
 * - ready: Draft is ready for user review
 * - edited: User has edited the draft
 * - sent: Email has been sent via Gmail
 * - rejected: User rejected/dismissed the draft
 * - failed: Generation failed
 */
export const emailDraft = pgTable(
  "email_draft",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Link to source action (not FK enforced - actions may be transient) */
    actionId: text("action_id").notNull(),
    /** Meeting this draft belongs to (not FK enforced - may use roomId as fallback) */
    meetingId: text("meeting_id").notNull(),
    /** User who will send this email */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Link to original insight (denormalized) */
    originalInsightId: text("original_insight_id").notNull(),
    /** Recipient addresses (JSONB array of EmailRecipient) */
    toAddresses: jsonb("to_addresses")
      .notNull()
      .$type<EmailRecipientDb[]>()
      .default([]),
    /** CC addresses (JSONB array of EmailRecipient) */
    ccAddresses: jsonb("cc_addresses").$type<EmailRecipientDb[]>().default([]),
    /** Email subject line */
    subject: text("subject").notNull(),
    /** Email body content */
    body: text("body").notNull(),
    /** Meeting context used for generation */
    meetingContext: jsonb("meeting_context")
      .notNull()
      .$type<MeetingContextDb>()
      .default({ participants: [], agendaTopics: [] }),
    /** Transcript excerpt used for generation */
    transcriptContext: text("transcript_context"),
    /** Original action item content (denormalized) */
    actionContent: text("action_content").notNull(),
    /** Type of email action */
    actionType: text("action_type").notNull(),
    /** Speaker name (denormalized) */
    speakerName: text("speaker_name"),
    /** Draft status */
    status: text("status").notNull().default("ready"),
    /** LLM confidence in draft quality (0-100) */
    generationConfidence: integer("generation_confidence").notNull().default(80),
    /** Gmail message ID after sending */
    gmailMessageId: text("gmail_message_id"),
    /** When the email was sent */
    sentAt: timestamp("sent_at"),
    /** Error message if generation/sending failed */
    errorMessage: text("error_message"),
    /** When the draft was generated */
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_email_draft_meeting").on(table.meetingId),
    index("idx_email_draft_user").on(table.userId),
    index("idx_email_draft_room").on(table.roomId),
    index("idx_email_draft_action").on(table.actionId),
    index("idx_email_draft_status").on(table.status),
    index("idx_email_draft_generated_at").on(table.generatedAt),
    // Unique constraint: one draft per action per user
    uniqueIndex("idx_email_draft_action_user_unique").on(
      table.actionId,
      table.userId
    ),
  ]
);

/**
 * Email Sent - Audit log of emails sent via Gmail integration.
 * Preserved even if draft is deleted.
 */
export const emailSent = pgTable(
  "email_sent",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Reference to original draft (nullable - draft may be deleted) */
    draftId: text("draft_id"),
    /** Meeting this email relates to (not FK enforced - may use roomId as fallback) */
    meetingId: text("meeting_id").notNull(),
    /** User who sent the email */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Room ID for quick access */
    roomId: text("room_id").notNull(),
    /** Recipient addresses (snapshot at time of send) */
    toAddresses: text("to_addresses").array().notNull(),
    /** CC addresses (snapshot at time of send) */
    ccAddresses: text("cc_addresses").array(),
    /** Email subject (snapshot) */
    subject: text("subject").notNull(),
    /** Email body (snapshot) */
    body: text("body").notNull(),
    /** Gmail message ID for tracking */
    gmailMessageId: text("gmail_message_id").notNull(),
    /** When the email was sent */
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_email_sent_meeting").on(table.meetingId),
    index("idx_email_sent_user").on(table.userId),
    index("idx_email_sent_sent_at").on(table.sentAt),
  ]
);

// ============================================================================
// Team Workspace Tables
// ============================================================================

/**
 * Team - Core team entity for organizing users.
 * Supports hierarchical sub-teams via parentTeamId.
 * Teams enable group-based meeting invitations and collaboration.
 */
export const team = pgTable(
  "team",
  {
    /** Unique team identifier (e.g., team-{creatorId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** Team name (3-50 chars) */
    name: text("name").notNull(),
    /** Optional team description */
    description: text("description"),
    /** Optional hex color for UI display (e.g., #3B82F6) */
    color: text("color"),
    /** Optional icon identifier */
    icon: text("icon"),
    /** Parent team ID for sub-team hierarchy (null for root teams) */
    parentTeamId: text("parent_team_id"),
    /** User who created the team */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Display order within parent (0-based, lower = higher priority) */
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_team_parent").on(table.parentTeamId),
    index("idx_team_created_by").on(table.createdBy),
    index("idx_team_parent_order").on(table.parentTeamId, table.orderIndex),
  ]
);

/**
 * Team Member - User membership in teams.
 * Tracks role (owner/admin/member) and status (pending/active/left).
 */
export const teamMember = pgTable(
  "team_member",
  {
    /** Unique membership identifier */
    id: text("id").primaryKey(),
    /** Team this membership belongs to */
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    /** User who is a member */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Role: owner, admin, member */
    role: text("role").notNull().default("member"),
    /** User who sent the invitation (nullable if inviter is deleted) */
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** When the invitation was sent */
    invitedAt: timestamp("invited_at").notNull().defaultNow(),
    /** When the user accepted/joined (null if pending) */
    joinedAt: timestamp("joined_at"),
    /** Status: pending, active, left */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_team_member_team").on(table.teamId),
    index("idx_team_member_user").on(table.userId),
    index("idx_team_member_team_status").on(table.teamId, table.status),
    index("idx_team_member_user_status").on(table.userId, table.status),
    uniqueIndex("idx_team_member_unique").on(table.teamId, table.userId),
  ]
);

/**
 * Team Meeting - Links teams to meetings for team-wide invitations.
 * When a team is invited, all active members get access to the meeting.
 */
export const teamMeeting = pgTable(
  "team_meeting",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Team invited to the meeting */
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    /** Meeting the team is invited to */
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** User who invited the team (nullable if inviter is deleted) */
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** When the team was invited */
    invitedAt: timestamp("invited_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_team_meeting_meeting").on(table.meetingId),
    index("idx_team_meeting_team").on(table.teamId),
    uniqueIndex("idx_team_meeting_unique").on(table.teamId, table.meetingId),
  ]
);

/**
 * Pending External Team Invitation - Invitations for non-registered users.
 * When a user is invited to a team but doesn't have an account, this stores the invitation.
 * When they sign up with the matching email, the invitation is auto-accepted.
 */
export const pendingExternalTeamInvitation = pgTable(
  "pending_external_team_invitation",
  {
    /** Unique identifier (e.g., peti-{timestamp}-{random}) */
    id: text("id").primaryKey(),
    /** Team this invitation is for */
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    /** Invitee's email (normalized lowercase) */
    email: text("email").notNull(),
    /** Role to be assigned: admin or member (not owner) */
    role: text("role").notNull().default("member"),
    /** User who sent the invitation */
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** When the invitation was sent */
    invitedAt: timestamp("invited_at").notNull().defaultNow(),
    /** When the invitation expires */
    expiresAt: timestamp("expires_at").notNull(),
    /** Secure token for direct-link acceptance (32 chars) */
    token: text("token").notNull(),
    /** Status: pending, accepted, expired, cancelled */
    status: text("status").notNull().default("pending"),
    /** When the user accepted (null if not accepted) */
    acceptedAt: timestamp("accepted_at"),
    /** User ID who accepted (null if not accepted) */
    acceptedUserId: text("accepted_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Index for looking up invitations by email (for signup flow)
    index("idx_ext_team_invite_email").on(table.email),
    // Unique index for token lookup
    uniqueIndex("idx_ext_team_invite_token").on(table.token),
    // Index for team-scoped queries with status filter
    index("idx_ext_team_invite_team_status").on(table.teamId, table.status),
    // Index for cleanup of expired invitations
    index("idx_ext_team_invite_expires").on(table.expiresAt),
    // Note: Partial unique index (team_id, email WHERE status='pending')
    // is created in the migration file as Drizzle doesn't support partial indexes directly
  ]
);

// ============================================================================
// Meeting Template Tables (Meeting Templates Feature)
// ============================================================================

/**
 * Meeting Template - Reusable structures for creating meetings.
 * Three scopes: system (built-in), team (shared), personal (private).
 * Templates include default settings, agenda items, and planning questions.
 */
export const meetingTemplate = pgTable(
  "meeting_template",
  {
    /** Unique template identifier (e.g., tpl-{timestamp}-{random}) */
    id: text("id").primaryKey(),
    /** Template name (3-100 chars) */
    name: text("name").notNull(),
    /** Template description (optional, up to 500 chars) */
    description: text("description"),
    /** Category: sync, tactical, strategic, one_on_one, workshop, decision */
    category: text("category").notNull().default("tactical"),
    /** Scope: system, team, personal */
    scope: text("scope").notNull().default("personal"),
    /** Team ID (required if scope = 'team') */
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    /** User who created the template (null for system templates) */
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Default meeting duration in minutes */
    defaultDuration: integer("default_duration").notNull().default(60),
    /** Suggested cadence (daily, weekly, biweekly, monthly, quarterly, etc.) */
    suggestedCadence: text("suggested_cadence"),
    /** Default meeting goal/purpose */
    defaultGoal: text("default_goal"),
    /** Default meeting settings (transcription, insights, recording) */
    defaultSettings: jsonb("default_settings")
      .$type<MeetingSettings>()
      .default({}),
    /** Whether this template is archived */
    isArchived: boolean("is_archived").notNull().default(false),
    /** Number of times this template has been used */
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_template_scope").on(table.scope),
    index("idx_meeting_template_category").on(table.category),
    index("idx_meeting_template_team").on(table.teamId),
    index("idx_meeting_template_creator").on(table.createdBy),
    index("idx_meeting_template_archived").on(table.isArchived),
    // Composite index for listing templates by scope and category
    index("idx_meeting_template_scope_category").on(table.scope, table.category),
  ]
);

/**
 * Template Agenda Item - Predefined agenda structure for templates.
 * When creating a meeting from a template, these become actual agenda items.
 */
export const templateAgendaItem = pgTable(
  "template_agenda_item",
  {
    /** Unique item identifier */
    id: text("id").primaryKey(),
    /** Parent template */
    templateId: text("template_id")
      .notNull()
      .references(() => meetingTemplate.id, { onDelete: "cascade" }),
    /** Display order (0-based) */
    orderIndex: integer("order_index").notNull(),
    /** Topic title (required, 1-200 chars) */
    title: text("title").notNull(),
    /** Topic description (optional, up to 500 chars) */
    description: text("description"),
    /** Estimated duration in minutes */
    estimatedDuration: integer("estimated_duration").notNull().default(5),
    /** Whether this item is required in meetings using this template */
    isRequired: boolean("is_required").notNull().default(false),
    /** Presenter role: host, participant, anyone */
    presenterRole: text("presenter_role"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_agenda_item_template").on(table.templateId),
    index("idx_template_agenda_item_order").on(
      table.templateId,
      table.orderIndex
    ),
  ]
);

/**
 * Template Planning Question - Questions to answer before starting a meeting.
 * Helps meeting organizers prepare effectively.
 */
export const templatePlanningQuestion = pgTable(
  "template_planning_question",
  {
    /** Unique question identifier */
    id: text("id").primaryKey(),
    /** Parent template */
    templateId: text("template_id")
      .notNull()
      .references(() => meetingTemplate.id, { onDelete: "cascade" }),
    /** Display order (0-based) */
    orderIndex: integer("order_index").notNull(),
    /** The question text (up to 300 chars) */
    question: text("question").notNull(),
    /** Question category: goal, attendees, preparation, outcome */
    category: text("category").notNull().default("preparation"),
    /** Whether an answer is required before starting */
    isRequired: boolean("is_required").notNull().default(false),
    /** Placeholder text for the answer input */
    placeholder: text("placeholder"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_planning_question_template").on(table.templateId),
    index("idx_template_planning_question_order").on(
      table.templateId,
      table.orderIndex
    ),
  ]
);

// ============================================================================
// Polar Subscription Cache Tables (Phase 7 - Polar Integration)
// ============================================================================

/**
 * Subscription tier type for type safety across the application.
 */
export type SubscriptionTier = "free" | "pro" | "business" | "enterprise";

/**
 * Subscription status type.
 */
export type SubscriptionStatus = "none" | "active" | "trialing" | "canceled" | "past_due";

/**
 * Subscription Cache - Local cache of Polar subscription data for faster reads.
 * The source of truth is Polar, but this table enables:
 * - Faster subscription status checks without API calls
 * - Offline/fallback access when Polar is unavailable
 * - Local usage tracking that syncs to Polar
 *
 * Updated via:
 * - Polar webhooks (subscription.active, subscription.canceled, etc.)
 * - Manual sync endpoint for support
 * - Periodic reconciliation job
 */
export const subscriptionCache = pgTable(
  "subscription_cache",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** User this subscription belongs to (one subscription per user) */
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // Subscription identifiers
    /** Polar customer ID for API calls */
    polarCustomerId: text("polar_customer_id"),
    /** Polar subscription ID for API calls */
    polarSubscriptionId: text("polar_subscription_id"),

    // Subscription state
    /** Current subscription tier: free, pro, business, enterprise */
    tier: text("tier").notNull().default("free"),
    /** Subscription status: none, active, trialing, canceled, past_due */
    status: text("status").notNull().default("none"),
    /** Billing interval: month or year (null for free tier) */
    billingInterval: text("billing_interval"),
    /** End of current billing period */
    currentPeriodEnd: timestamp("current_period_end"),
    /** Whether subscription will cancel at period end */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    // Tier limits (cached from tier for quick access)
    /** Monthly meeting minutes limit (-1 for unlimited) */
    minutesLimit: integer("minutes_limit").notNull().default(300),
    /** Storage limit in GB (-1 for unlimited) */
    storageLimitGb: integer("storage_limit_gb").notNull().default(0),
    /** History retention in days (-1 for unlimited) */
    historyDays: integer("history_days").notNull().default(7),
    /** Monthly email drafts limit (-1 for unlimited) */
    emailDraftsLimit: integer("email_drafts_limit").notNull().default(0),

    // Current period usage (reset monthly by Polar meters)
    /** Meeting minutes used this period */
    minutesUsed: integer("minutes_used").notNull().default(0),
    /** Email drafts generated this period */
    emailDraftsUsed: integer("email_drafts_used").notNull().default(0),
    /** Storage used in bytes (bigint to support >2GB - Business tier allows 20GB) */
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
    /** Start of current usage period (for display) */
    usagePeriodStart: timestamp("usage_period_start").notNull().defaultNow(),

    // Idempotency tracking for deduplication (separate keys for each usage type)
    /** Last idempotency key for minutes increments (prevents duplicate reports on retry) */
    lastMinutesIdempotencyKey: text("last_minutes_idempotency_key"),
    /** Last idempotency key for email drafts increments */
    lastDraftsIdempotencyKey: text("last_drafts_idempotency_key"),

    // Metadata
    /** Last time this cache was synced with Polar */
    lastSyncedAt: timestamp("last_synced_at"),
    /** Error message if last sync failed */
    syncError: text("sync_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Primary lookup by user ID (unique constraint provides index)
    index("idx_subscription_cache_period").on(table.usagePeriodStart),
    index("idx_subscription_cache_polar_customer").on(table.polarCustomerId),
    index("idx_subscription_cache_tier").on(table.tier),
    index("idx_subscription_cache_status").on(table.status),
  ]
);

/**
 * Webhook Log - Audit log for Polar webhook events.
 * Used for debugging webhook delivery issues and manual recovery.
 */
export const webhookLog = pgTable(
  "webhook_log",
  {
    /** Unique identifier */
    id: text("id").primaryKey(),
    /** Polar webhook event ID (for idempotency) */
    eventId: text("event_id").notNull().unique(),
    /** Event type (e.g., subscription.active, subscription.canceled) */
    eventType: text("event_type").notNull(),
    /** Whether the webhook was processed successfully */
    success: boolean("success").notNull(),
    /** Error message if processing failed */
    error: text("error"),
    /** Raw payload for debugging (truncated for large payloads) */
    payload: jsonb("payload"),
    /** When the webhook was received */
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_webhook_log_event_type").on(table.eventType),
    index("idx_webhook_log_received").on(table.receivedAt),
    index("idx_webhook_log_success").on(table.success),
  ]
);

// ============================================================================
// Agent Builder Tables (Phase 1 - Agent Builder Feature)
// ============================================================================

/**
 * Agent schedule type - defines when an agent runs.
 */
export type AgentScheduleType = "once" | "hourly" | "daily" | "weekly" | "monthly";

/**
 * Agent trigger type - defines what event triggers an agent.
 */
export type AgentTriggerType = "meeting_end" | "meeting_start" | "new_meeting_in_folder" | "manual";

/**
 * Agent execution triggered by type.
 */
export type AgentExecutionTriggeredBy = "schedule" | "trigger" | "manual";

/**
 * Agent execution status.
 */
export type AgentExecutionStatus = "pending" | "running" | "completed" | "failed";

/**
 * Agent - Core entity for user-created AI agents.
 * Agents automate meeting-related workflows using natural language instructions
 * with @ mentions to reference folders, teams, and services.
 *
 * Example instruction:
 * "Check latest meeting from @General folder, summarize key points,
 *  send to @Engineering team via @Gmail"
 */
export const agent = pgTable(
  "agent",
  {
    /** Unique agent identifier (e.g., agent-{userId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** User who owns this agent */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Basic info
    /** Agent name (3-100 chars) */
    name: text("name").notNull(),
    /** Optional description of what this agent does */
    description: text("description"),
    /** Natural language instructions with @ mentions */
    instructions: text("instructions").notNull(),

    // Parsed references (extracted from instructions for quick lookups)
    /** Referenced folder IDs (extracted from @ mentions like @General) */
    referencedFolders: text("referenced_folders").array(),
    /** Referenced team IDs (extracted from @ mentions like @Marketing) */
    referencedTeams: text("referenced_teams").array(),
    /** Referenced services (extracted from @ mentions like @Gmail, @Calendar) */
    referencedServices: text("referenced_services").array(),

    // Configuration
    /** LLM model to use: gpt-4o (default) */
    model: text("model").notNull().default("gpt-4o"),
    /** Whether the agent is active and can be triggered */
    isActive: boolean("is_active").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agent_user").on(table.userId),
    index("idx_agent_active").on(table.userId, table.isActive),
  ]
);

/**
 * Agent Schedule - Time-based scheduling for agent execution.
 * Supports one-time and recurring schedules (hourly, daily, weekly, monthly).
 */
export const agentSchedule = pgTable(
  "agent_schedule",
  {
    /** Unique schedule identifier (e.g., sched-{agentId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** Parent agent */
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    // Schedule type
    /** Type: once, hourly, daily, weekly, monthly */
    scheduleType: text("schedule_type").notNull(),

    // For 'once': specific datetime
    /** Specific datetime for one-time schedules */
    scheduledAt: timestamp("scheduled_at"),

    // For recurring: cron-like config
    /** Hour of day (0-23) for daily/weekly/monthly */
    hour: integer("hour"),
    /** Minute of hour (0-59) */
    minute: integer("minute"),
    /** Day of week (0=Sunday, 6=Saturday) for weekly schedules */
    dayOfWeek: integer("day_of_week"),
    /** Day of month (1-31) for monthly schedules */
    dayOfMonth: integer("day_of_month"),
    /** Timezone for schedule calculations (IANA format) */
    timezone: text("timezone").default("UTC"),

    // Tracking
    /** When the schedule last ran successfully */
    lastRunAt: timestamp("last_run_at"),
    /** Calculated next run time (updated after each run) */
    nextRunAt: timestamp("next_run_at"),
    /** Whether this schedule is enabled */
    isEnabled: boolean("is_enabled").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agent_schedule_agent").on(table.agentId),
    index("idx_agent_schedule_next_run").on(table.nextRunAt),
    index("idx_agent_schedule_enabled").on(table.isEnabled, table.nextRunAt),
  ]
);

/**
 * Agent Trigger - Event-based triggers for agent execution.
 * Agents can be triggered by meeting events or run manually.
 *
 * Trigger types:
 * - meeting_end: When a meeting session ends
 * - meeting_start: When a meeting session starts
 * - new_meeting_in_folder: When a new meeting is added to a folder
 * - manual: Only triggered by user clicking "Run Now"
 */
export const agentTrigger = pgTable(
  "agent_trigger",
  {
    /** Unique trigger identifier (e.g., trig-{agentId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** Parent agent */
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    // Trigger type
    /** Event type that triggers the agent */
    triggerType: text("trigger_type").notNull(),

    // Optional: scope trigger to specific folder/team
    /** Limit trigger to meetings in this folder (null = all folders) */
    scopeFolderId: text("scope_folder_id").references(() => meetingFolder.id, {
      onDelete: "set null",
    }),
    /** Limit trigger to meetings involving this team (null = all teams) */
    scopeTeamId: text("scope_team_id").references(() => team.id, {
      onDelete: "set null",
    }),

    /** Whether this trigger is enabled */
    isEnabled: boolean("is_enabled").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agent_trigger_agent").on(table.agentId),
    index("idx_agent_trigger_type").on(table.triggerType),
    index("idx_agent_trigger_folder").on(table.scopeFolderId),
    index("idx_agent_trigger_team").on(table.scopeTeamId),
    index("idx_agent_trigger_enabled_type").on(table.isEnabled, table.triggerType),
  ]
);

/**
 * Agent Execution input context structure.
 * What data was passed to the agent for execution.
 */
export interface AgentExecutionInputContext {
  /** Meeting IDs that were processed */
  meetingIds?: string[];
  /** Folder IDs that were queried */
  folderIds?: string[];
  /** Team IDs that were involved */
  teamIds?: string[];
  /** Services that were used */
  services?: string[];
  /** Triggering event details */
  triggerEvent?: {
    type: string;
    meetingId?: string;
    folderId?: string;
  };
}

/**
 * Agent Execution output result structure.
 * What the agent produced during execution.
 */
export interface AgentExecutionOutputResult {
  /** Text output from the agent */
  text?: string;
  /** Tool calls made during execution */
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Emails sent during execution */
  emailsSent?: Array<{
    to: string[];
    subject: string;
    gmailMessageId?: string;
  }>;
}

/**
 * Agent Execution - Tracks individual agent runs.
 * Records context, results, and timing for audit and debugging.
 */
export const agentExecution = pgTable(
  "agent_execution",
  {
    /** Unique execution identifier (e.g., exec-{agentId}-{timestamp}) */
    id: text("id").primaryKey(),
    /** Parent agent */
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),

    // Execution context
    /** What triggered this execution: schedule, trigger, or manual */
    triggeredBy: text("triggered_by").notNull(),
    /** Reference to schedule if triggered by schedule */
    scheduleId: text("schedule_id").references(() => agentSchedule.id, {
      onDelete: "set null",
    }),
    /** Reference to trigger if triggered by trigger */
    triggerId: text("trigger_id").references(() => agentTrigger.id, {
      onDelete: "set null",
    }),

    // Status
    /** Current execution status */
    status: text("status").notNull().default("pending"),

    // Results
    /** What data was passed to the agent */
    inputContext: jsonb("input_context").$type<AgentExecutionInputContext>(),
    /** What the agent produced */
    outputResult: jsonb("output_result").$type<AgentExecutionOutputResult>(),
    /** Error message if execution failed */
    errorMessage: text("error_message"),

    // Timing
    /** When execution started */
    startedAt: timestamp("started_at"),
    /** When execution completed */
    completedAt: timestamp("completed_at"),
    /** Execution duration in milliseconds */
    durationMs: integer("duration_ms"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_agent_execution_agent").on(table.agentId),
    index("idx_agent_execution_status").on(table.status),
    index("idx_agent_execution_triggered_by").on(table.triggeredBy),
    index("idx_agent_execution_created").on(table.createdAt),
    // Composite index for listing recent executions by agent
    index("idx_agent_execution_agent_created").on(table.agentId, table.createdAt),
  ]
);
