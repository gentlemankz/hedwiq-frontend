/**
 * Agent Validation
 *
 * Validates and sanitizes agent creation and update requests.
 */

import type { AgentModel, AgentService, AgentScheduleType } from "@/types/agent";
import { AGENT_LIMITS } from "@/types/agent";

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valid agent models.
 */
const VALID_MODELS: AgentModel[] = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];

/**
 * Valid agent services with canonical casing.
 * Maps lowercase to the canonical capitalized form.
 */
const SERVICE_CANONICAL_MAP: Record<string, AgentService> = {
  gmail: "Gmail",
  calendar: "Calendar",
  slack: "Slack",
};

/**
 * Normalizes a service name to its canonical form.
 * Accepts any casing (gmail, Gmail, GMAIL) and returns the canonical form.
 * Returns null if the service is not recognized.
 */
export function normalizeServiceName(service: string): AgentService | null {
  const lowered = service.toLowerCase().trim();
  return SERVICE_CANONICAL_MAP[lowered] ?? null;
}

/**
 * Normalizes an array of service names to their canonical forms.
 * Filters out unrecognized services and removes duplicates.
 */
export function normalizeServices(services: string[]): AgentService[] {
  const normalized = new Set<AgentService>();
  for (const service of services) {
    const canonical = normalizeServiceName(service);
    if (canonical) {
      normalized.add(canonical);
    }
  }
  return Array.from(normalized);
}

// ============================================================================
// Sanitization Utilities
// ============================================================================

/**
 * Pattern for potentially dangerous control characters.
 * Excludes standard whitespace (space, tab, newline, carriage return).
 */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Pattern for null bytes specifically.
 */
const NULL_BYTE_PATTERN = /\x00/g;

/**
 * Sanitizes a text string by removing control characters and normalizing whitespace.
 * This prevents potential issues with:
 * - JSON serialization/parsing
 * - Database storage
 * - LLM processing
 *
 * @param text - The text to sanitize
 * @returns Sanitized text string
 */
export function sanitizeText(text: string): string {
  return text
    .replace(NULL_BYTE_PATTERN, "") // Remove null bytes
    .replace(CONTROL_CHAR_PATTERN, "") // Remove control characters
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\r/g, "\n"); // Convert remaining CR to LF
}

/**
 * Sanitizes a single-line text field (name, etc.).
 * Removes all newlines and normalizes whitespace.
 *
 * @param text - The text to sanitize
 * @returns Sanitized single-line text
 */
export function sanitizeSingleLineText(text: string): string {
  return sanitizeText(text)
    .replace(/[\n\r]/g, " ") // Replace newlines with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

/**
 * Checks if a string contains potentially problematic patterns.
 * Used for additional validation beyond basic sanitization.
 *
 * @param text - The text to check
 * @returns Object with validation result and reason
 */
export function checkForProblematicContent(text: string): {
  isClean: boolean;
  reason?: string;
} {
  // Check for excessive repetition (potential DoS or abuse)
  if (/(.)\1{50,}/.test(text)) {
    return { isClean: false, reason: "Text contains excessive character repetition" };
  }

  // Check for null bytes (should have been sanitized, but double-check)
  if (text.includes("\x00")) {
    return { isClean: false, reason: "Text contains invalid characters" };
  }

  return { isClean: true };
}

// ============================================================================
// Field Validators
// ============================================================================

/**
 * Validates and sanitizes an agent name.
 * Returns the sanitized value if valid.
 */
export function validateAgentName(name: unknown): ValidationResult & { sanitized?: string } {
  if (typeof name !== "string") {
    return { isValid: false, error: "Agent name must be a string" };
  }

  const sanitized = sanitizeSingleLineText(name);

  if (sanitized.length < AGENT_LIMITS.MIN_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Agent name must be at least ${AGENT_LIMITS.MIN_NAME_LENGTH} characters`,
    };
  }

  if (sanitized.length > AGENT_LIMITS.MAX_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Agent name must be ${AGENT_LIMITS.MAX_NAME_LENGTH} characters or less`,
    };
  }

  const contentCheck = checkForProblematicContent(sanitized);
  if (!contentCheck.isClean) {
    return { isValid: false, error: contentCheck.reason };
  }

  return { isValid: true, sanitized };
}

/**
 * Validates and sanitizes an agent description.
 * Returns the sanitized value if valid.
 */
export function validateAgentDescription(
  description: unknown
): ValidationResult & { sanitized?: string | null } {
  if (description === null || description === undefined) {
    return { isValid: true, sanitized: null };
  }

  if (typeof description !== "string") {
    return { isValid: false, error: "Agent description must be a string" };
  }

  // Allow empty string to clear description
  if (description.trim() === "") {
    return { isValid: true, sanitized: null };
  }

  const sanitized = sanitizeText(description).trim();

  if (sanitized.length > AGENT_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      isValid: false,
      error: `Agent description must be ${AGENT_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`,
    };
  }

  const contentCheck = checkForProblematicContent(sanitized);
  if (!contentCheck.isClean) {
    return { isValid: false, error: contentCheck.reason };
  }

  return { isValid: true, sanitized };
}

/**
 * Validates and sanitizes agent instructions.
 * Returns the sanitized value if valid.
 */
export function validateAgentInstructions(
  instructions: unknown
): ValidationResult & { sanitized?: string } {
  if (typeof instructions !== "string") {
    return { isValid: false, error: "Agent instructions must be a string" };
  }

  const sanitized = sanitizeText(instructions).trim();

  if (sanitized.length === 0) {
    return { isValid: false, error: "Agent instructions are required" };
  }

  if (sanitized.length > AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH) {
    return {
      isValid: false,
      error: `Agent instructions must be ${AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH} characters or less`,
    };
  }

  const contentCheck = checkForProblematicContent(sanitized);
  if (!contentCheck.isClean) {
    return { isValid: false, error: contentCheck.reason };
  }

  return { isValid: true, sanitized };
}

/**
 * Validates an agent model.
 */
export function validateAgentModel(model: unknown): ValidationResult {
  if (model === null || model === undefined) {
    return { isValid: true };
  }

  if (typeof model !== "string") {
    return { isValid: false, error: "Agent model must be a string" };
  }

  if (!VALID_MODELS.includes(model as AgentModel)) {
    return {
      isValid: false,
      error: `Agent model must be one of: ${VALID_MODELS.join(", ")}`,
    };
  }

  return { isValid: true };
}

/**
 * Validates isActive field.
 */
export function validateAgentIsActive(isActive: unknown): ValidationResult {
  if (isActive === null || isActive === undefined) {
    return { isValid: true };
  }

  if (typeof isActive !== "boolean") {
    return { isValid: false, error: "isActive must be a boolean" };
  }

  return { isValid: true };
}

/**
 * Sanitized create agent data returned after validation.
 */
export interface SanitizedCreateAgentData {
  name: string;
  description: string | null;
  instructions: string;
  model?: AgentModel;
}

/**
 * Validates a create agent request.
 * Returns sanitized data if valid.
 */
export function validateCreateAgentRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedCreateAgentData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, description, instructions, model } = body as Record<
    string,
    unknown
  >;

  // Validate name (required)
  const nameValidation = validateAgentName(name);
  if (!nameValidation.isValid) {
    return { isValid: false, error: nameValidation.error };
  }

  // Validate description (optional)
  const descriptionValidation = validateAgentDescription(description);
  if (!descriptionValidation.isValid) {
    return { isValid: false, error: descriptionValidation.error };
  }

  // Validate instructions (required)
  const instructionsValidation = validateAgentInstructions(instructions);
  if (!instructionsValidation.isValid) {
    return { isValid: false, error: instructionsValidation.error };
  }

  // Validate model (optional)
  const modelValidation = validateAgentModel(model);
  if (!modelValidation.isValid) {
    return { isValid: false, error: modelValidation.error };
  }

  return {
    isValid: true,
    sanitized: {
      name: nameValidation.sanitized!,
      description: descriptionValidation.sanitized ?? null,
      instructions: instructionsValidation.sanitized!,
      model: model as AgentModel | undefined,
    },
  };
}

/**
 * Sanitized update agent data returned after validation.
 * Only includes fields that were provided in the request.
 */
export interface SanitizedUpdateAgentData {
  name?: string;
  description?: string | null;
  instructions?: string;
  model?: AgentModel;
  isActive?: boolean;
}

/**
 * Validates an update agent request.
 * Returns sanitized data if valid.
 */
export function validateUpdateAgentRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedUpdateAgentData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { name, description, instructions, model, isActive } = body as Record<
    string,
    unknown
  >;

  // At least one field must be provided
  if (
    name === undefined &&
    description === undefined &&
    instructions === undefined &&
    model === undefined &&
    isActive === undefined
  ) {
    return { isValid: false, error: "At least one field must be provided" };
  }

  const sanitized: SanitizedUpdateAgentData = {};

  // Validate name (if provided)
  if (name !== undefined) {
    const nameValidation = validateAgentName(name);
    if (!nameValidation.isValid) {
      return { isValid: false, error: nameValidation.error };
    }
    sanitized.name = nameValidation.sanitized;
  }

  // Validate description (if provided)
  if (description !== undefined) {
    const descriptionValidation = validateAgentDescription(description);
    if (!descriptionValidation.isValid) {
      return { isValid: false, error: descriptionValidation.error };
    }
    sanitized.description = descriptionValidation.sanitized;
  }

  // Validate instructions (if provided)
  if (instructions !== undefined) {
    const instructionsValidation = validateAgentInstructions(instructions);
    if (!instructionsValidation.isValid) {
      return { isValid: false, error: instructionsValidation.error };
    }
    sanitized.instructions = instructionsValidation.sanitized;
  }

  // Validate model (if provided)
  if (model !== undefined) {
    const modelValidation = validateAgentModel(model);
    if (!modelValidation.isValid) {
      return { isValid: false, error: modelValidation.error };
    }
    sanitized.model = model as AgentModel;
  }

  // Validate isActive (if provided)
  if (isActive !== undefined) {
    const isActiveValidation = validateAgentIsActive(isActive);
    if (!isActiveValidation.isValid) {
      return { isValid: false, error: isActiveValidation.error };
    }
    sanitized.isActive = isActive as boolean;
  }

  return { isValid: true, sanitized };
}

// ============================================================================
// Schedule Validation
// ============================================================================

/**
 * Valid schedule types.
 */
const VALID_SCHEDULE_TYPES: AgentScheduleType[] = [
  "once",
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

/**
 * Validates schedule type.
 */
export function validateScheduleType(
  scheduleType: unknown
): ValidationResult & { value?: AgentScheduleType } {
  if (typeof scheduleType !== "string") {
    return { isValid: false, error: "Schedule type must be a string" };
  }

  if (!VALID_SCHEDULE_TYPES.includes(scheduleType as AgentScheduleType)) {
    return {
      isValid: false,
      error: `Schedule type must be one of: ${VALID_SCHEDULE_TYPES.join(", ")}`,
    };
  }

  return { isValid: true, value: scheduleType as AgentScheduleType };
}

/**
 * Validates hour value (0-23).
 */
export function validateHour(hour: unknown): ValidationResult & { value?: number } {
  if (hour === null || hour === undefined) {
    return { isValid: true };
  }

  if (typeof hour !== "number" || !Number.isInteger(hour)) {
    return { isValid: false, error: "Hour must be an integer" };
  }

  if (hour < 0 || hour > 23) {
    return { isValid: false, error: "Hour must be between 0 and 23" };
  }

  return { isValid: true, value: hour };
}

/**
 * Validates minute value (0-59).
 */
export function validateMinute(minute: unknown): ValidationResult & { value?: number } {
  if (minute === null || minute === undefined) {
    return { isValid: true };
  }

  if (typeof minute !== "number" || !Number.isInteger(minute)) {
    return { isValid: false, error: "Minute must be an integer" };
  }

  if (minute < 0 || minute > 59) {
    return { isValid: false, error: "Minute must be between 0 and 59" };
  }

  return { isValid: true, value: minute };
}

/**
 * Validates day of week (0=Sunday, 6=Saturday).
 */
export function validateDayOfWeek(dayOfWeek: unknown): ValidationResult & { value?: number } {
  if (dayOfWeek === null || dayOfWeek === undefined) {
    return { isValid: true };
  }

  if (typeof dayOfWeek !== "number" || !Number.isInteger(dayOfWeek)) {
    return { isValid: false, error: "Day of week must be an integer" };
  }

  if (dayOfWeek < 0 || dayOfWeek > 6) {
    return { isValid: false, error: "Day of week must be between 0 (Sunday) and 6 (Saturday)" };
  }

  return { isValid: true, value: dayOfWeek };
}

/**
 * Validates day of month (1-31).
 */
export function validateDayOfMonth(dayOfMonth: unknown): ValidationResult & { value?: number } {
  if (dayOfMonth === null || dayOfMonth === undefined) {
    return { isValid: true };
  }

  if (typeof dayOfMonth !== "number" || !Number.isInteger(dayOfMonth)) {
    return { isValid: false, error: "Day of month must be an integer" };
  }

  if (dayOfMonth < 1 || dayOfMonth > 31) {
    return { isValid: false, error: "Day of month must be between 1 and 31" };
  }

  return { isValid: true, value: dayOfMonth };
}

/**
 * Validates a timezone string (basic validation for IANA format).
 */
export function validateTimezone(timezone: unknown): ValidationResult & { value?: string } {
  if (timezone === null || timezone === undefined) {
    return { isValid: true, value: "UTC" };
  }

  if (typeof timezone !== "string") {
    return { isValid: false, error: "Timezone must be a string" };
  }

  const trimmed = timezone.trim();
  if (trimmed.length === 0) {
    return { isValid: true, value: "UTC" };
  }

  // Basic validation: try to create a date formatter with the timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return { isValid: true, value: trimmed };
  } catch {
    return { isValid: false, error: "Invalid timezone. Use IANA format (e.g., 'America/New_York')" };
  }
}

/**
 * Validates scheduledAt datetime string for one-time schedules.
 */
export function validateScheduledAt(scheduledAt: unknown): ValidationResult & { value?: string } {
  if (scheduledAt === null || scheduledAt === undefined) {
    return { isValid: true };
  }

  if (typeof scheduledAt !== "string") {
    return { isValid: false, error: "Scheduled datetime must be a string" };
  }

  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) {
    return { isValid: false, error: "Invalid datetime format. Use ISO 8601 format" };
  }

  // Must be in the future
  if (date.getTime() <= Date.now()) {
    return { isValid: false, error: "Scheduled datetime must be in the future" };
  }

  return { isValid: true, value: date.toISOString() };
}

/**
 * Sanitized create schedule data returned after validation.
 */
export interface SanitizedCreateScheduleData {
  scheduleType: AgentScheduleType;
  scheduledAt?: string;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone: string;
}

/**
 * Validates a create schedule request.
 * Returns sanitized data if valid.
 */
export function validateCreateScheduleRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedCreateScheduleData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { scheduleType, scheduledAt, hour, minute, dayOfWeek, dayOfMonth, timezone } =
    body as Record<string, unknown>;

  // Validate scheduleType (required)
  const scheduleTypeValidation = validateScheduleType(scheduleType);
  if (!scheduleTypeValidation.isValid || !scheduleTypeValidation.value) {
    return { isValid: false, error: scheduleTypeValidation.error ?? "Schedule type is required" };
  }

  const type = scheduleTypeValidation.value;

  // Validate timezone
  const timezoneValidation = validateTimezone(timezone);
  if (!timezoneValidation.isValid) {
    return { isValid: false, error: timezoneValidation.error };
  }

  const sanitized: SanitizedCreateScheduleData = {
    scheduleType: type,
    timezone: timezoneValidation.value ?? "UTC",
  };

  // Type-specific validation
  switch (type) {
    case "once": {
      const scheduledAtValidation = validateScheduledAt(scheduledAt);
      if (!scheduledAtValidation.isValid) {
        return { isValid: false, error: scheduledAtValidation.error };
      }
      if (!scheduledAtValidation.value) {
        return { isValid: false, error: "scheduledAt is required for one-time schedules" };
      }
      sanitized.scheduledAt = scheduledAtValidation.value;
      break;
    }

    case "hourly": {
      const minuteValidation = validateMinute(minute);
      if (!minuteValidation.isValid) {
        return { isValid: false, error: minuteValidation.error };
      }
      sanitized.minute = minuteValidation.value ?? 0;
      break;
    }

    case "daily": {
      const hourValidation = validateHour(hour);
      if (!hourValidation.isValid) {
        return { isValid: false, error: hourValidation.error };
      }
      const minuteValidation = validateMinute(minute);
      if (!minuteValidation.isValid) {
        return { isValid: false, error: minuteValidation.error };
      }
      sanitized.hour = hourValidation.value ?? 9; // Default to 9 AM
      sanitized.minute = minuteValidation.value ?? 0;
      break;
    }

    case "weekly": {
      const hourValidation = validateHour(hour);
      if (!hourValidation.isValid) {
        return { isValid: false, error: hourValidation.error };
      }
      const minuteValidation = validateMinute(minute);
      if (!minuteValidation.isValid) {
        return { isValid: false, error: minuteValidation.error };
      }
      const dayOfWeekValidation = validateDayOfWeek(dayOfWeek);
      if (!dayOfWeekValidation.isValid) {
        return { isValid: false, error: dayOfWeekValidation.error };
      }
      sanitized.hour = hourValidation.value ?? 9;
      sanitized.minute = minuteValidation.value ?? 0;
      sanitized.dayOfWeek = dayOfWeekValidation.value ?? 1; // Default to Monday
      break;
    }

    case "monthly": {
      const hourValidation = validateHour(hour);
      if (!hourValidation.isValid) {
        return { isValid: false, error: hourValidation.error };
      }
      const minuteValidation = validateMinute(minute);
      if (!minuteValidation.isValid) {
        return { isValid: false, error: minuteValidation.error };
      }
      const dayOfMonthValidation = validateDayOfMonth(dayOfMonth);
      if (!dayOfMonthValidation.isValid) {
        return { isValid: false, error: dayOfMonthValidation.error };
      }
      sanitized.hour = hourValidation.value ?? 9;
      sanitized.minute = minuteValidation.value ?? 0;
      sanitized.dayOfMonth = dayOfMonthValidation.value ?? 1; // Default to 1st
      break;
    }
  }

  return { isValid: true, sanitized };
}

/**
 * Sanitized update schedule data returned after validation.
 */
export interface SanitizedUpdateScheduleData {
  scheduleType?: AgentScheduleType;
  scheduledAt?: string;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone?: string;
  isEnabled?: boolean;
}

/**
 * Validates an update schedule request.
 * Returns sanitized data if valid.
 */
export function validateUpdateScheduleRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedUpdateScheduleData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { scheduleType, scheduledAt, hour, minute, dayOfWeek, dayOfMonth, timezone, isEnabled } =
    body as Record<string, unknown>;

  // At least one field must be provided
  if (
    scheduleType === undefined &&
    scheduledAt === undefined &&
    hour === undefined &&
    minute === undefined &&
    dayOfWeek === undefined &&
    dayOfMonth === undefined &&
    timezone === undefined &&
    isEnabled === undefined
  ) {
    return { isValid: false, error: "At least one field must be provided" };
  }

  const sanitized: SanitizedUpdateScheduleData = {};

  // Validate scheduleType (if provided)
  if (scheduleType !== undefined) {
    const validation = validateScheduleType(scheduleType);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.scheduleType = validation.value;
  }

  // Validate scheduledAt (if provided)
  if (scheduledAt !== undefined) {
    const validation = validateScheduledAt(scheduledAt);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.scheduledAt = validation.value;
  }

  // Validate hour (if provided)
  if (hour !== undefined) {
    const validation = validateHour(hour);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.hour = validation.value;
  }

  // Validate minute (if provided)
  if (minute !== undefined) {
    const validation = validateMinute(minute);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.minute = validation.value;
  }

  // Validate dayOfWeek (if provided)
  if (dayOfWeek !== undefined) {
    const validation = validateDayOfWeek(dayOfWeek);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.dayOfWeek = validation.value;
  }

  // Validate dayOfMonth (if provided)
  if (dayOfMonth !== undefined) {
    const validation = validateDayOfMonth(dayOfMonth);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.dayOfMonth = validation.value;
  }

  // Validate timezone (if provided)
  if (timezone !== undefined) {
    const validation = validateTimezone(timezone);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.timezone = validation.value;
  }

  // Validate isEnabled (if provided)
  if (isEnabled !== undefined) {
    if (typeof isEnabled !== "boolean") {
      return { isValid: false, error: "isEnabled must be a boolean" };
    }
    sanitized.isEnabled = isEnabled;
  }

  return { isValid: true, sanitized };
}
