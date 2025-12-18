/**
 * Team Validation
 *
 * Validates team creation, update, and member management requests.
 */

import { TEAM_LIMITS, type TeamRole } from "@/types/team";

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// ============================================================================
// Team Validation
// ============================================================================

/**
 * Validates a team name.
 */
export function validateTeamName(name: unknown): ValidationResult {
  if (typeof name !== "string") {
    return { isValid: false, error: "Team name must be a string" };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < TEAM_LIMITS.MIN_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Team name must be at least ${TEAM_LIMITS.MIN_NAME_LENGTH} characters`,
    };
  }

  if (trimmedName.length > TEAM_LIMITS.MAX_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Team name must be ${TEAM_LIMITS.MAX_NAME_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a team description.
 */
export function validateTeamDescription(description: unknown): ValidationResult {
  if (description === null || description === undefined) {
    return { isValid: true };
  }

  if (typeof description !== "string") {
    return { isValid: false, error: "Team description must be a string" };
  }

  if (description.length > TEAM_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      isValid: false,
      error: `Team description must be ${TEAM_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a team color.
 */
export function validateTeamColor(color: unknown): ValidationResult {
  if (color === null || color === undefined) {
    return { isValid: true };
  }

  if (typeof color !== "string") {
    return { isValid: false, error: "Team color must be a string" };
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
      error: "Team color must be a valid hex color (e.g., #3B82F6)",
    };
  }

  return { isValid: true };
}

/**
 * Validates a team icon.
 * Only allows alphanumeric characters, hyphens, underscores, and colons.
 */
export function validateTeamIcon(icon: unknown): ValidationResult {
  if (icon === null || icon === undefined) {
    return { isValid: true };
  }

  if (typeof icon !== "string") {
    return { isValid: false, error: "Team icon must be a string" };
  }

  // Allow empty string to clear icon
  if (icon === "") {
    return { isValid: true };
  }

  // Icon should be a reasonable length
  if (icon.length > 50) {
    return { isValid: false, error: "Team icon identifier too long" };
  }

  // Only allow safe characters
  const safeIconPattern = /^[a-zA-Z0-9_:-]+$/;
  if (!safeIconPattern.test(icon)) {
    return {
      isValid: false,
      error: "Team icon contains invalid characters",
    };
  }

  return { isValid: true };
}

/**
 * Validates a parent team ID.
 */
export function validateParentTeamId(parentTeamId: unknown): ValidationResult {
  if (parentTeamId === null || parentTeamId === undefined) {
    return { isValid: true };
  }

  if (typeof parentTeamId !== "string") {
    return { isValid: false, error: "Parent team ID must be a string" };
  }

  if (parentTeamId.trim() === "") {
    return { isValid: false, error: "Parent team ID cannot be empty" };
  }

  return { isValid: true };
}

/**
 * Validates a create team request.
 */
export function validateCreateTeamRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, description, color, icon, parentTeamId } = body as Record<
    string,
    unknown
  >;

  // Validate name (required)
  const nameValidation = validateTeamName(name);
  if (!nameValidation.isValid) {
    return nameValidation;
  }

  // Validate description (optional)
  const descriptionValidation = validateTeamDescription(description);
  if (!descriptionValidation.isValid) {
    return descriptionValidation;
  }

  // Validate color (optional)
  const colorValidation = validateTeamColor(color);
  if (!colorValidation.isValid) {
    return colorValidation;
  }

  // Validate icon (optional)
  const iconValidation = validateTeamIcon(icon);
  if (!iconValidation.isValid) {
    return iconValidation;
  }

  // Validate parentTeamId (optional)
  const parentValidation = validateParentTeamId(parentTeamId);
  if (!parentValidation.isValid) {
    return parentValidation;
  }

  return { isValid: true };
}

/**
 * Validates an update team request.
 */
export function validateUpdateTeamRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, description, color, icon } = body as Record<string, unknown>;

  // At least one field must be provided
  if (
    name === undefined &&
    description === undefined &&
    color === undefined &&
    icon === undefined
  ) {
    return { isValid: false, error: "At least one field must be provided" };
  }

  // Validate name (if provided)
  if (name !== undefined) {
    const nameValidation = validateTeamName(name);
    if (!nameValidation.isValid) {
      return nameValidation;
    }
  }

  // Validate description (if provided)
  if (description !== undefined) {
    const descriptionValidation = validateTeamDescription(description);
    if (!descriptionValidation.isValid) {
      return descriptionValidation;
    }
  }

  // Validate color (if provided)
  if (color !== undefined) {
    const colorValidation = validateTeamColor(color);
    if (!colorValidation.isValid) {
      return colorValidation;
    }
  }

  // Validate icon (if provided)
  if (icon !== undefined) {
    const iconValidation = validateTeamIcon(icon);
    if (!iconValidation.isValid) {
      return iconValidation;
    }
  }

  return { isValid: true };
}

/**
 * Validates a reorder teams request.
 */
export function validateReorderTeamsRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { teamIds, parentTeamId } = body as Record<string, unknown>;

  if (!Array.isArray(teamIds)) {
    return { isValid: false, error: "teamIds must be an array" };
  }

  if (teamIds.length === 0) {
    return { isValid: false, error: "teamIds cannot be empty" };
  }

  // Check all IDs are strings
  for (const id of teamIds) {
    if (typeof id !== "string" || id.trim() === "") {
      return {
        isValid: false,
        error: "All team IDs must be non-empty strings",
      };
    }
  }

  // Check for duplicates
  const uniqueIds = new Set(teamIds);
  if (uniqueIds.size !== teamIds.length) {
    return { isValid: false, error: "Duplicate team IDs are not allowed" };
  }

  // Validate parentTeamId if provided
  if (parentTeamId !== undefined && parentTeamId !== null) {
    const parentValidation = validateParentTeamId(parentTeamId);
    if (!parentValidation.isValid) {
      return parentValidation;
    }
  }

  return { isValid: true };
}

// ============================================================================
// Team Member Validation
// ============================================================================

const VALID_ROLES: TeamRole[] = ["owner", "admin", "member"];

/**
 * Validates a team role.
 */
export function validateTeamRole(role: unknown): ValidationResult {
  if (role === undefined) {
    return { isValid: true }; // Optional, defaults to 'member'
  }

  if (typeof role !== "string") {
    return { isValid: false, error: "Role must be a string" };
  }

  if (!VALID_ROLES.includes(role as TeamRole)) {
    return {
      isValid: false,
      error: `Role must be one of: ${VALID_ROLES.join(", ")}`,
    };
  }

  return { isValid: true };
}

/**
 * Validates an email address.
 */
export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== "string") {
    return { isValid: false, error: "Email must be a string" };
  }

  const trimmedEmail = email.trim().toLowerCase();

  if (trimmedEmail.length === 0) {
    return { isValid: false, error: "Email is required" };
  }

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, error: "Invalid email format" };
  }

  return { isValid: true };
}

/**
 * Validates an invite members request.
 */
export function validateInviteMembersRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { invites, role } = body as Record<string, unknown>;

  if (!Array.isArray(invites)) {
    return { isValid: false, error: "invites must be an array" };
  }

  if (invites.length === 0) {
    return { isValid: false, error: "At least one invite is required" };
  }

  if (invites.length > TEAM_LIMITS.MAX_PENDING_INVITES) {
    return {
      isValid: false,
      error: `Maximum of ${TEAM_LIMITS.MAX_PENDING_INVITES} invites at once`,
    };
  }

  // Validate each invite
  for (const invite of invites) {
    if (!invite || typeof invite !== "object") {
      return { isValid: false, error: "Each invite must be an object" };
    }

    const { email, userId } = invite as Record<string, unknown>;

    // Must have either email or userId
    if (!email && !userId) {
      return {
        isValid: false,
        error: "Each invite must have either email or userId",
      };
    }

    // Validate email if provided
    if (email !== undefined) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return emailValidation;
      }
    }

    // Validate userId if provided
    if (userId !== undefined && typeof userId !== "string") {
      return { isValid: false, error: "userId must be a string" };
    }
  }

  // Validate role if provided
  const roleValidation = validateTeamRole(role);
  if (!roleValidation.isValid) {
    return roleValidation;
  }

  // Cannot invite as owner
  if (role === "owner") {
    return {
      isValid: false,
      error: "Cannot invite members as owner. Use transfer ownership instead.",
    };
  }

  return { isValid: true };
}

/**
 * Validates an update member role request.
 */
export function validateUpdateMemberRoleRequest(
  body: unknown
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { role } = body as Record<string, unknown>;

  if (role === undefined) {
    return { isValid: false, error: "Role is required" };
  }

  const roleValidation = validateTeamRole(role);
  if (!roleValidation.isValid) {
    return roleValidation;
  }

  return { isValid: true };
}

// ============================================================================
// Team Meeting Validation
// ============================================================================

/**
 * Validates an invite team to meeting request.
 */
export function validateInviteTeamToMeetingRequest(
  body: unknown
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { teamId } = body as Record<string, unknown>;

  if (!teamId) {
    return { isValid: false, error: "teamId is required" };
  }

  if (typeof teamId !== "string") {
    return { isValid: false, error: "teamId must be a string" };
  }

  if (teamId.trim() === "") {
    return { isValid: false, error: "teamId cannot be empty" };
  }

  return { isValid: true };
}
