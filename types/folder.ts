/**
 * Folder Types for Luframe Frontend
 *
 * These types support the Meeting Folders feature for organizing past meetings.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * A meeting folder record from the database.
 */
export interface Folder {
  /** Unique folder identifier (e.g., folder-{userId}-{timestamp}) */
  id: string;
  /** User who owns this folder */
  userId: string;
  /** Folder name (e.g., "General", "Project Alpha") */
  name: string;
  /** Optional hex color for folder display (e.g., #3B82F6) */
  color: string | null;
  /** Optional icon identifier for folder display */
  icon: string | null;
  /** Display order (0-based, lower = higher priority) */
  orderIndex: number;
  /** Whether this is the default "General" folder */
  isDefault: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Computed: Number of meetings in this folder (optional, for list views) */
  meetingCount?: number;
}

/**
 * Extended meeting type with folder information.
 * Use this with intersection: Meeting & MeetingWithFolder
 */
export interface MeetingWithFolder {
  folderId: string | null;
  /** Folder data when included via JOIN (optional) */
  folder?: Folder | null;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating a folder.
 */
export interface CreateFolderRequest {
  /** Folder name */
  name: string;
  /** Optional hex color */
  color?: string;
  /** Optional icon identifier */
  icon?: string;
}

/**
 * Request body for updating a folder.
 */
export interface UpdateFolderRequest {
  /** Folder name */
  name?: string;
  /** Hex color */
  color?: string | null;
  /** Icon identifier */
  icon?: string | null;
}

/**
 * Request body for reordering folders.
 */
export interface ReorderFoldersRequest {
  /** Array of folder IDs in the desired order */
  folderIds: string[];
}

/**
 * Response from creating a folder.
 */
export interface CreateFolderResponse {
  folder: Folder;
}

/**
 * Response from getting a single folder.
 */
export interface GetFolderResponse {
  folder: Folder | null;
}

/**
 * Response from listing folders.
 */
export interface ListFoldersResponse {
  folders: Folder[];
}

/**
 * Response from updating a folder.
 */
export interface UpdateFolderResponse {
  folder: Folder;
}

/**
 * Response from deleting a folder.
 */
export interface DeleteFolderResponse {
  success: boolean;
  /** Number of meetings moved to the default folder */
  meetingsMoved: number;
}

/**
 * Response from reordering folders.
 */
export interface ReorderFoldersResponse {
  success: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Predefined folder colors for the UI.
 */
export const FOLDER_COLORS = [
  { name: "Gray", value: "#6B7280" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F97316" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Green", value: "#22C55E" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
] as const;

/**
 * Default folder name.
 */
export const DEFAULT_FOLDER_NAME = "General";

/**
 * Validation and limit constants for folders.
 */
export const FOLDER_LIMITS = {
  /** Minimum name length */
  MIN_NAME_LENGTH: 1,
  /** Maximum name length */
  MAX_NAME_LENGTH: 50,
  /** Maximum folders per user */
  MAX_FOLDERS_PER_USER: 50,
} as const;
