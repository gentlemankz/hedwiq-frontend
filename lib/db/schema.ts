import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
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
