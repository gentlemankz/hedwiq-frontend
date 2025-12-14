import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
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
