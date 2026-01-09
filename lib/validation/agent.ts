/**
 * Agent Validation
 *
 * Validates and sanitizes agent creation and update requests.
 */

import type { AgentModel, AgentService } from "@/types/agent";
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
