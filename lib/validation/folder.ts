/**
 * Folder Validation
 *
 * Validates folder creation and update requests.
 */

import { FOLDER_LIMITS } from "@/types/folder";

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a folder name.
 */
export function validateFolderName(name: unknown): ValidationResult {
  if (typeof name !== "string") {
    return { isValid: false, error: "Folder name must be a string" };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < FOLDER_LIMITS.MIN_NAME_LENGTH) {
    return { isValid: false, error: "Folder name is required" };
  }

  if (trimmedName.length > FOLDER_LIMITS.MAX_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Folder name must be ${FOLDER_LIMITS.MAX_NAME_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a folder color.
 */
export function validateFolderColor(color: unknown): ValidationResult {
  if (color === null || color === undefined) {
    return { isValid: true };
  }

  if (typeof color !== "string") {
    return { isValid: false, error: "Folder color must be a string" };
  }

  // Allow empty string to clear color
  if (color === "") {
    return { isValid: true };
  }

  // Validate hex color format
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexColorRegex.test(color)) {
    return {
      isValid: false,
      error: "Folder color must be a valid hex color (e.g., #3B82F6)",
    };
  }

  return { isValid: true };
}

/**
 * Validates a folder icon.
 * Only allows alphanumeric characters, hyphens, underscores, and colons
 * to prevent XSS through icon identifiers.
 */
export function validateFolderIcon(icon: unknown): ValidationResult {
  if (icon === null || icon === undefined) {
    return { isValid: true };
  }

  if (typeof icon !== "string") {
    return { isValid: false, error: "Folder icon must be a string" };
  }

  // Allow empty string to clear icon
  if (icon === "") {
    return { isValid: true };
  }

  // Icon should be a reasonable length
  if (icon.length > 50) {
    return { isValid: false, error: "Folder icon identifier too long" };
  }

  // Only allow safe characters (alphanumeric, hyphens, underscores, colons)
  // This prevents XSS through icon identifiers
  const safeIconPattern = /^[a-zA-Z0-9_:-]+$/;
  if (!safeIconPattern.test(icon)) {
    return {
      isValid: false,
      error: "Folder icon contains invalid characters",
    };
  }

  return { isValid: true };
}

/**
 * Validates a create folder request.
 */
export function validateCreateFolderRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, color, icon } = body as Record<string, unknown>;

  // Validate name (required)
  const nameValidation = validateFolderName(name);
  if (!nameValidation.isValid) {
    return nameValidation;
  }

  // Validate color (optional)
  const colorValidation = validateFolderColor(color);
  if (!colorValidation.isValid) {
    return colorValidation;
  }

  // Validate icon (optional)
  const iconValidation = validateFolderIcon(icon);
  if (!iconValidation.isValid) {
    return iconValidation;
  }

  return { isValid: true };
}

/**
 * Validates an update folder request.
 */
export function validateUpdateFolderRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, color, icon } = body as Record<string, unknown>;

  // At least one field must be provided
  if (name === undefined && color === undefined && icon === undefined) {
    return { isValid: false, error: "At least one field must be provided" };
  }

  // Validate name (if provided)
  if (name !== undefined) {
    const nameValidation = validateFolderName(name);
    if (!nameValidation.isValid) {
      return nameValidation;
    }
  }

  // Validate color (if provided)
  if (color !== undefined) {
    const colorValidation = validateFolderColor(color);
    if (!colorValidation.isValid) {
      return colorValidation;
    }
  }

  // Validate icon (if provided)
  if (icon !== undefined) {
    const iconValidation = validateFolderIcon(icon);
    if (!iconValidation.isValid) {
      return iconValidation;
    }
  }

  return { isValid: true };
}

/**
 * Validates a reorder folders request.
 */
export function validateReorderFoldersRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { folderIds } = body as Record<string, unknown>;

  if (!Array.isArray(folderIds)) {
    return { isValid: false, error: "folderIds must be an array" };
  }

  if (folderIds.length === 0) {
    return { isValid: false, error: "folderIds cannot be empty" };
  }

  // Check all IDs are strings
  for (const id of folderIds) {
    if (typeof id !== "string" || id.trim() === "") {
      return { isValid: false, error: "All folder IDs must be non-empty strings" };
    }
  }

  // Check for duplicates
  const uniqueIds = new Set(folderIds);
  if (uniqueIds.size !== folderIds.length) {
    return { isValid: false, error: "Duplicate folder IDs are not allowed" };
  }

  return { isValid: true };
}

/**
 * Parses a folderId from query parameter.
 * Returns:
 * - undefined: parameter not provided (no filter)
 * - null: parameter is "null" (filter for unassigned meetings)
 * - string: parameter is a folder ID
 */
export function parseFolderIdParam(
  param: string | null
): string | null | undefined {
  if (param === null) {
    return undefined;
  }
  return param === "null" ? null : param;
}
