/**
 * Agent Validation
 *
 * Validates and sanitizes agent creation and update requests.
 */

import type { AgentModel, AgentService, AgentScheduleType, AgentTriggerType } from "@/types/agent";
import { AGENT_LIMITS } from "@/types/agent";

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Valid agent models.
 */
const VALID_MODELS: AgentModel[] = ["gpt-4o", "gpt-4o-mini"];

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
 * Regex for datetime-local format: YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS
 */
const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Creates a Date in a specific timezone from datetime components.
 * Used for validation - mirrors the parseScheduledAtInTimezone logic in db/agent.ts
 */
function createDateInTimezoneForValidation(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Start with a rough estimate assuming the timezone is near UTC
  const estimate = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

  // Get the offset by checking what time it is in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(estimate);
  const partsMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const estHour = parseInt(partsMap.hour ?? "0", 10);
  const estMinute = parseInt(partsMap.minute ?? "0", 10);
  const estDay = parseInt(partsMap.day ?? "1", 10);

  // Calculate the difference in minutes
  const estimatedMinutes = estHour * 60 + estMinute;
  const targetMinutes = hour * 60 + minute;
  let diffMinutes = targetMinutes - estimatedMinutes;

  // Handle day boundary crossings
  if (estDay !== day) {
    if (estDay < day) {
      diffMinutes += 24 * 60;
    } else {
      diffMinutes -= 24 * 60;
    }
  }

  return new Date(estimate.getTime() + diffMinutes * 60 * 1000);
}

/**
 * Validates scheduledAt datetime string for one-time schedules.
 *
 * @param scheduledAt - Raw datetime-local string (e.g., "2024-01-15T09:00")
 * @param timezone - IANA timezone string to interpret the datetime in
 * @returns Validation result with the raw string (not converted to ISO)
 */
export function validateScheduledAt(
  scheduledAt: unknown,
  timezone: string = "UTC"
): ValidationResult & { value?: string } {
  if (scheduledAt === null || scheduledAt === undefined) {
    return { isValid: true };
  }

  if (typeof scheduledAt !== "string") {
    return { isValid: false, error: "Scheduled datetime must be a string" };
  }

  const trimmed = scheduledAt.trim();

  // Validate format: must be datetime-local format (YYYY-MM-DDTHH:MM)
  if (!DATETIME_LOCAL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: "Invalid datetime format. Use YYYY-MM-DDTHH:MM format (e.g., 2024-01-15T09:00)",
    };
  }

  // Parse components
  const [datePart, timePart] = trimmed.split("T");
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const [hourStr, minuteStr] = timePart.split(":");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  // Validate date components are reasonable
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { isValid: false, error: "Invalid date or time values" };
  }

  // Create the date in the specified timezone and check if it's in the future
  const dateInTimezone = createDateInTimezoneForValidation(year, month, day, hour, minute, timezone);

  if (dateInTimezone.getTime() <= Date.now()) {
    return { isValid: false, error: "Scheduled datetime must be in the future" };
  }

  // Return the raw string (not converted to ISO) - parseScheduledAtInTimezone will handle conversion
  return { isValid: true, value: trimmed };
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
      // Pass timezone for future validation in the correct timezone
      const scheduledAtValidation = validateScheduledAt(scheduledAt, sanitized.timezone);
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

  // Validate timezone FIRST (if provided) - needed for scheduledAt validation
  let effectiveTimezone = "UTC"; // Default for validation
  if (timezone !== undefined) {
    const validation = validateTimezone(timezone);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.timezone = validation.value;
    effectiveTimezone = validation.value ?? "UTC";
  }

  // Validate scheduledAt (if provided) - use effectiveTimezone for future validation
  if (scheduledAt !== undefined) {
    const validation = validateScheduledAt(scheduledAt, effectiveTimezone);
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

  // Validate isEnabled (if provided)
  if (isEnabled !== undefined) {
    if (typeof isEnabled !== "boolean") {
      return { isValid: false, error: "isEnabled must be a boolean" };
    }
    sanitized.isEnabled = isEnabled;
  }

  // When changing scheduleType, ensure required fields for the new type are provided.
  // This prevents creating broken schedules (e.g., "once" without scheduledAt).
  // Note: hour/minute/dayOfWeek/dayOfMonth have defaults in the database layer,
  // but "once" MUST have scheduledAt provided.
  if (sanitized.scheduleType !== undefined) {
    if (sanitized.scheduleType === "once" && sanitized.scheduledAt === undefined) {
      return {
        isValid: false,
        error: "scheduledAt is required when changing to a one-time schedule",
      };
    }
    // For weekly, warn if dayOfWeek not provided (will use existing or default to Monday)
    // For monthly, warn if dayOfMonth not provided (will use existing or default to 1st)
    // These are warnings - the DB layer handles defaults, but explicit is better for type changes
  }

  return { isValid: true, sanitized };
}

// ============================================================================
// Trigger Validation
// ============================================================================

/**
 * Valid trigger types.
 */
const VALID_TRIGGER_TYPES: AgentTriggerType[] = [
  "meeting_end",
  "meeting_start",
  "new_meeting_in_folder",
  "manual",
];

/**
 * Validates trigger type.
 */
export function validateTriggerType(
  triggerType: unknown
): ValidationResult & { value?: AgentTriggerType } {
  if (typeof triggerType !== "string") {
    return { isValid: false, error: "Trigger type must be a string" };
  }

  if (!VALID_TRIGGER_TYPES.includes(triggerType as AgentTriggerType)) {
    return {
      isValid: false,
      error: `Trigger type must be one of: ${VALID_TRIGGER_TYPES.join(", ")}`,
    };
  }

  return { isValid: true, value: triggerType as AgentTriggerType };
}

/**
 * Validates a scope ID (folder or team).
 * Must be a non-empty string if provided.
 */
export function validateScopeId(
  scopeId: unknown,
  fieldName: string
): ValidationResult & { value?: string | null } {
  if (scopeId === null || scopeId === undefined) {
    return { isValid: true, value: null };
  }

  if (typeof scopeId !== "string") {
    return { isValid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = scopeId.trim();
  if (trimmed.length === 0) {
    return { isValid: true, value: null };
  }

  // Basic validation: must be a reasonable ID format
  if (trimmed.length > 100) {
    return { isValid: false, error: `${fieldName} is too long` };
  }

  return { isValid: true, value: trimmed };
}

/**
 * Sanitized create trigger data returned after validation.
 */
export interface SanitizedCreateTriggerData {
  triggerType: AgentTriggerType;
  scopeFolderId: string | null;
  scopeTeamId: string | null;
}

/**
 * Validates a create trigger request.
 * Returns sanitized data if valid.
 */
export function validateCreateTriggerRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedCreateTriggerData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { triggerType, scopeFolderId, scopeTeamId } = body as Record<string, unknown>;

  // Validate triggerType (required)
  const triggerTypeValidation = validateTriggerType(triggerType);
  if (!triggerTypeValidation.isValid || !triggerTypeValidation.value) {
    return { isValid: false, error: triggerTypeValidation.error ?? "Trigger type is required" };
  }

  // Validate scopeFolderId (optional)
  const scopeFolderValidation = validateScopeId(scopeFolderId, "scopeFolderId");
  if (!scopeFolderValidation.isValid) {
    return { isValid: false, error: scopeFolderValidation.error };
  }

  // Validate scopeTeamId (optional)
  const scopeTeamValidation = validateScopeId(scopeTeamId, "scopeTeamId");
  if (!scopeTeamValidation.isValid) {
    return { isValid: false, error: scopeTeamValidation.error };
  }

  // For new_meeting_in_folder, scopeFolderId is required
  if (triggerTypeValidation.value === "new_meeting_in_folder" && !scopeFolderValidation.value) {
    return {
      isValid: false,
      error: "scopeFolderId is required for 'new_meeting_in_folder' trigger type",
    };
  }

  return {
    isValid: true,
    sanitized: {
      triggerType: triggerTypeValidation.value,
      scopeFolderId: scopeFolderValidation.value ?? null,
      scopeTeamId: scopeTeamValidation.value ?? null,
    },
  };
}

/**
 * Sanitized update trigger data returned after validation.
 */
export interface SanitizedUpdateTriggerData {
  triggerType?: AgentTriggerType;
  scopeFolderId?: string | null;
  scopeTeamId?: string | null;
  isEnabled?: boolean;
}

/**
 * Validates an update trigger request.
 * Returns sanitized data if valid.
 */
export function validateUpdateTriggerRequest(body: unknown): ValidationResult & {
  sanitized?: SanitizedUpdateTriggerData;
} {
  if (!body || typeof body !== "object") {
    return { isValid: false, error: "Invalid request body" };
  }

  const { triggerType, scopeFolderId, scopeTeamId, isEnabled } = body as Record<string, unknown>;

  // At least one field must be provided
  if (
    triggerType === undefined &&
    scopeFolderId === undefined &&
    scopeTeamId === undefined &&
    isEnabled === undefined
  ) {
    return { isValid: false, error: "At least one field must be provided" };
  }

  const sanitized: SanitizedUpdateTriggerData = {};

  // Validate triggerType (if provided)
  if (triggerType !== undefined) {
    const validation = validateTriggerType(triggerType);
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.triggerType = validation.value;
  }

  // Validate scopeFolderId (if provided)
  if (scopeFolderId !== undefined) {
    const validation = validateScopeId(scopeFolderId, "scopeFolderId");
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.scopeFolderId = validation.value;
  }

  // Validate scopeTeamId (if provided)
  if (scopeTeamId !== undefined) {
    const validation = validateScopeId(scopeTeamId, "scopeTeamId");
    if (!validation.isValid) {
      return { isValid: false, error: validation.error };
    }
    sanitized.scopeTeamId = validation.value;
  }

  // Validate isEnabled (if provided)
  if (isEnabled !== undefined) {
    if (typeof isEnabled !== "boolean") {
      return { isValid: false, error: "isEnabled must be a boolean" };
    }
    sanitized.isEnabled = isEnabled;
  }

  // If changing to new_meeting_in_folder and scopeFolderId is being set to null, reject
  if (sanitized.triggerType === "new_meeting_in_folder" && sanitized.scopeFolderId === null) {
    return {
      isValid: false,
      error: "scopeFolderId is required for 'new_meeting_in_folder' trigger type",
    };
  }

  return { isValid: true, sanitized };
}
