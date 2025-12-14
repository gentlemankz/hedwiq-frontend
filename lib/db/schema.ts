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
  (table) => [index("idx_agenda_room").on(table.roomId)]
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
