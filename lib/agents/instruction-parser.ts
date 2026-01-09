/**
 * Instruction Parser for Agent Builder
 *
 * Parses agent instructions to extract @ mention references
 * to folders, teams, and services.
 */

import type {
  ParsedReference,
  ParsedInstructions,
  AgentService,
} from "@/types/agent";
import { AVAILABLE_SERVICES } from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

export interface MentionableEntity {
  id: string;
  name: string;
  type: "folder" | "team" | "service";
  color?: string | null;
}

export interface ParserContext {
  folders: MentionableEntity[];
  teams: MentionableEntity[];
  services?: MentionableEntity[];
}

export interface MentionMatch {
  fullMatch: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum text length to process with regex.
 * Prevents ReDoS attacks with extremely long input.
 */
const MAX_TEXT_LENGTH = 10000;

/**
 * Maximum length for a single mention name.
 */
const MAX_MENTION_LENGTH = 100;

/**
 * Safe regex to match @ mentions.
 * Supports:
 * - @Name (single word, max 50 chars)
 * - @"Multi Word Name" (quoted for spaces, max 100 chars)
 * - @"Name with \"escaped\" quotes" (escaped quotes inside quoted strings)
 * - @Name123 (alphanumeric)
 *
 * This pattern is designed to prevent ReDoS by:
 * - Limiting repetition with explicit bounds
 * - Avoiding nested quantifiers
 * - Using non-capturing groups efficiently
 *
 * The quoted pattern matches either non-quote/non-backslash chars, or escaped quotes (\")
 */
const MENTION_REGEX = /@(?:"((?:[^"\\]|\\"){1,100})"|([A-Za-z0-9_-]{1,50}(?:\s[A-Za-z0-9_-]{1,50}){0,5}))/g;

/**
 * Service IDs for quick lookup (case-insensitive).
 * Reserved for potential future use in service validation.
 */
const _SERVICE_IDS = new Set(
  AVAILABLE_SERVICES.map((s) => s.id.toLowerCase())
);

/**
 * Service display names mapped to their IDs for matching by name.
 * Allows users to type @"Google Calendar" or @Gmail and have it resolve correctly.
 */
const SERVICE_NAME_TO_ID = new Map<string, string>(
  AVAILABLE_SERVICES.flatMap((s) => [
    [s.id.toLowerCase(), s.id],
    [s.name.toLowerCase(), s.id],
  ])
);

/**
 * Service names for quick lookup in content validation.
 */
const SERVICE_NAMES = new Set(
  AVAILABLE_SERVICES.map((s) => s.name.toLowerCase())
);

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse agent instructions to extract @ mention references.
 *
 * @param instructions - Raw instruction text with @ mentions
 * @param context - Available folders, teams, and services to match against
 * @returns Parsed instructions with extracted references
 */
export function parseInstructions(
  instructions: string,
  context: ParserContext
): ParsedInstructions {
  const references: ParsedReference[] = [];
  const folders: ParsedReference[] = [];
  const teams: ParsedReference[] = [];
  const services: ParsedReference[] = [];

  // Build lookup maps for efficient matching
  const folderMap = buildNameMap(context.folders);
  const teamMap = buildNameMap(context.teams);

  // Find all mentions
  const mentions = extractMentions(instructions);

  for (const mention of mentions) {
    const mentionName = mention.name;
    const mentionNameLower = mentionName.toLowerCase();

    // Check if it's a service (by ID or display name)
    const serviceId = SERVICE_NAME_TO_ID.get(mentionNameLower);
    if (serviceId) {
      const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
      if (service) {
        const ref: ParsedReference = {
          type: "service",
          rawText: mention.fullMatch,
          entityId: service.id,
          name: service.name,
        };
        references.push(ref);
        services.push(ref);
        continue;
      }
    }

    // Check if it's a folder
    const folder = folderMap.get(mentionNameLower);
    if (folder) {
      const ref: ParsedReference = {
        type: "folder",
        rawText: mention.fullMatch,
        entityId: folder.id,
        name: folder.name,
      };
      references.push(ref);
      folders.push(ref);
      continue;
    }

    // Check if it's a team
    const team = teamMap.get(mentionNameLower);
    if (team) {
      const ref: ParsedReference = {
        type: "team",
        rawText: mention.fullMatch,
        entityId: team.id,
        name: team.name,
      };
      references.push(ref);
      teams.push(ref);
      continue;
    }

    // Unknown reference - still include it but without entityId
    const ref: ParsedReference = {
      type: guessReferenceType(mentionName),
      rawText: mention.fullMatch,
      name: mentionName,
    };
    references.push(ref);
  }

  return {
    cleanText: instructions,
    references,
    folders,
    teams,
    services,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract all @ mentions from text.
 *
 * @param text - The text to extract mentions from
 * @returns Array of mention matches
 */
export function extractMentions(text: string): MentionMatch[] {
  // Guard against extremely long input (ReDoS protection)
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn(
      `[extractMentions] Text exceeds max length (${MAX_TEXT_LENGTH}), truncating`
    );
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  const matches: MentionMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    // Group 1 = quoted name (may contain escaped quotes), Group 2 = unquoted name
    let name = match[1] || match[2];

    // Unescape quotes in quoted mentions: \" -> "
    if (match[1]) {
      name = name.replace(/\\"/g, '"');
    }

    const trimmedName = name.trim();

    // Skip mentions that are too long
    if (trimmedName.length > MAX_MENTION_LENGTH) {
      continue;
    }

    matches.push({
      fullMatch: match[0],
      name: trimmedName,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Build a lowercase name -> entity map for efficient lookup.
 */
function buildNameMap(
  entities: MentionableEntity[]
): Map<string, MentionableEntity> {
  const map = new Map<string, MentionableEntity>();
  for (const entity of entities) {
    map.set(entity.name.toLowerCase(), entity);
  }
  return map;
}

/**
 * Guess the reference type for an unresolved mention.
 */
function guessReferenceType(name: string): "folder" | "team" | "service" {
  const nameLower = name.toLowerCase();

  // Check service names (both IDs and display names)
  if (SERVICE_NAME_TO_ID.has(nameLower)) {
    return "service";
  }

  // Common team-related words
  if (
    nameLower.includes("team") ||
    nameLower.includes("group") ||
    nameLower.includes("squad")
  ) {
    return "team";
  }

  // Default to folder
  return "folder";
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Instruction validation result.
 */
export interface InstructionValidationResult {
  /** Whether the instructions are valid (no errors) */
  isValid: boolean;
  /** Critical errors that prevent saving */
  errors: string[];
  /** Non-critical warnings */
  warnings: string[];
}

/**
 * Validation options for instructions.
 */
export interface InstructionValidationOptions {
  /** Minimum instruction length (default: 10) */
  minLength?: number;
  /** Maximum instruction length (default: 5000) */
  maxLength?: number;
  /** Whether at least one reference is required (default: false) */
  requireReference?: boolean;
  /** Whether to validate references against context (default: true) */
  validateReferences?: boolean;
}

const DEFAULT_VALIDATION_OPTIONS: Required<InstructionValidationOptions> = {
  minLength: 10,
  maxLength: 5000,
  requireReference: false,
  validateReferences: true,
};

/**
 * Validate agent instructions.
 *
 * @param instructions - Raw instruction text
 * @param context - Available entities for reference validation
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validateInstructions(
  instructions: string,
  context?: ParserContext,
  options?: InstructionValidationOptions
): InstructionValidationResult {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = instructions.trim();

  // Check for empty instructions
  if (!trimmed) {
    errors.push("Instructions cannot be empty");
    return { isValid: false, errors, warnings };
  }

  // Check minimum length
  if (trimmed.length < opts.minLength) {
    errors.push(
      `Instructions must be at least ${opts.minLength} characters long`
    );
  }

  // Check maximum length
  if (trimmed.length > opts.maxLength) {
    errors.push(
      `Instructions must not exceed ${opts.maxLength} characters`
    );
  }

  // Parse and validate references if context is provided
  if (context && opts.validateReferences) {
    const parsed = parseInstructions(trimmed, context);
    const unresolved = getUnresolvedReferences(parsed);

    // Unresolved references are warnings, not errors
    if (unresolved.length > 0) {
      warnings.push(
        `Unresolved references: ${unresolved.join(", ")}. These mentions could not be matched to existing folders, teams, or services.`
      );
    }

    // Check if at least one reference is required
    if (opts.requireReference && parsed.references.length === 0) {
      errors.push(
        "Instructions must include at least one @ mention (folder, team, or service)"
      );
    }
  } else if (opts.requireReference) {
    // Check for mentions even without context validation
    const mentions = extractMentions(trimmed);
    if (mentions.length === 0) {
      errors.push(
        "Instructions must include at least one @ mention (folder, team, or service)"
      );
    }
  }

  // Check for potential issues in instruction content
  const contentWarnings = checkInstructionContent(trimmed);
  warnings.push(...contentWarnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check instruction content for potential issues.
 */
function checkInstructionContent(instructions: string): string[] {
  const warnings: string[] = [];

  // Check for very long lines (might indicate formatting issues)
  const lines = instructions.split("\n");
  const longLines = lines.filter((line) => line.length > 500);
  if (longLines.length > 0) {
    warnings.push(
      "Some lines are very long. Consider breaking them into smaller steps for clarity."
    );
  }

  // Check for incomplete mentions (@ at end of line without name)
  if (/@\s*$/.test(instructions) || /@\s*\n/.test(instructions)) {
    warnings.push("Incomplete @ mention detected. Did you mean to reference something?");
  }

  // Check for potentially unquoted multi-word mentions
  const unquotedMultiWord = /@([A-Za-z]+)\s+([A-Za-z]+)(?!\s*[A-Za-z])/g;
  let match;
  while ((match = unquotedMultiWord.exec(instructions)) !== null) {
    // Only warn if it looks like it should be a multi-word name
    const possibleName = `${match[1]} ${match[2]}`;
    if (
      !SERVICE_NAMES.has(match[1].toLowerCase()) &&
      possibleName.length < 30
    ) {
      // This might be intentional, so just a soft check
      // Only add warning once
      if (!warnings.some((w) => w.includes("multi-word"))) {
        warnings.push(
          "Multi-word names should be quoted: @\"Multi Word Name\""
        );
      }
      break;
    }
  }

  return warnings;
}

/**
 * Validate that all references in instructions can be resolved.
 *
 * @param instructions - Parsed instructions
 * @returns Array of unresolved reference names
 */
export function getUnresolvedReferences(
  instructions: ParsedInstructions
): string[] {
  return instructions.references
    .filter((ref) => !ref.entityId)
    .map((ref) => ref.name);
}

/**
 * Check if instructions have valid references.
 */
export function hasValidReferences(instructions: ParsedInstructions): boolean {
  return getUnresolvedReferences(instructions).length === 0;
}

/**
 * Get unique folder IDs from parsed instructions.
 */
export function getReferencedFolderIds(
  instructions: ParsedInstructions
): string[] {
  return [...new Set(
    instructions.folders
      .filter((f) => f.entityId)
      .map((f) => f.entityId as string)
  )];
}

/**
 * Get unique team IDs from parsed instructions.
 */
export function getReferencedTeamIds(
  instructions: ParsedInstructions
): string[] {
  return [...new Set(
    instructions.teams
      .filter((t) => t.entityId)
      .map((t) => t.entityId as string)
  )];
}

/**
 * Get unique service IDs from parsed instructions.
 */
export function getReferencedServiceIds(
  instructions: ParsedInstructions
): AgentService[] {
  return [...new Set(
    instructions.services
      .filter((s) => s.entityId)
      .map((s) => s.entityId as AgentService)
  )];
}

// ============================================================================
// Autocomplete Support
// ============================================================================

/**
 * Get suggestions for autocomplete based on partial input.
 *
 * @param query - Partial text after @ symbol
 * @param context - Available entities
 * @param maxResults - Maximum suggestions to return
 * @returns Filtered and sorted suggestions
 */
export function getMentionSuggestions(
  query: string,
  context: ParserContext,
  maxResults: number = 10
): MentionableEntity[] {
  const queryLower = query.toLowerCase().trim();

  // Combine all entities
  const allEntities: MentionableEntity[] = [
    ...context.folders,
    ...context.teams,
    ...AVAILABLE_SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      type: "service" as const,
    })),
  ];

  // If no query, return first N items prioritized by type
  if (!queryLower) {
    return allEntities.slice(0, maxResults);
  }

  // Filter by query match
  const filtered = allEntities.filter((entity) => {
    const nameLower = entity.name.toLowerCase();
    return (
      nameLower.includes(queryLower) ||
      nameLower.startsWith(queryLower)
    );
  });

  // Sort by relevance (starts with > contains)
  filtered.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);

    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    return aName.localeCompare(bName);
  });

  return filtered.slice(0, maxResults);
}

/**
 * Format an entity name for insertion (add quotes if has spaces or special chars).
 * Escapes double quotes in the name with backslash (\" inside quoted strings).
 *
 * @param name - The entity name to format
 * @returns Formatted mention string (e.g., @Name or @"Multi Word Name" or @"Name with \"quotes\"")
 */
export function formatMentionForInsert(name: string): string {
  // Check if we need quoting (spaces or quotes in name)
  const needsQuotes = name.includes(" ") || name.includes('"');

  if (needsQuotes) {
    // Escape double quotes with backslash for quoted mentions
    const escapedName = name.replace(/"/g, '\\"');
    return `@"${escapedName}"`;
  }
  return `@${name}`;
}

/**
 * Get the mention query from cursor position.
 * Returns null if cursor is not in a mention context.
 *
 * @param text - Full text
 * @param cursorPosition - Current cursor position
 * @returns Query text after @ (with leading quote stripped if present) or null
 */
export function getMentionQueryAtCursor(
  text: string,
  cursorPosition: number
): { query: string; startIndex: number; isQuoted: boolean } | null {
  // Look backwards from cursor for @
  let start = cursorPosition - 1;
  let isQuoted = false;

  while (start >= 0) {
    const char = text[start];

    // Found @, extract query
    if (char === "@") {
      let query = text.slice(start + 1, cursorPosition);

      // Don't suggest if there's a space right after @
      if (query.startsWith(" ")) return null;

      // Check if this is a quoted mention (strip the leading quote for matching)
      if (query.startsWith('"')) {
        isQuoted = true;
        query = query.slice(1); // Remove leading quote for suggestion matching
      }

      return { query, startIndex: start, isQuoted };
    }

    // Stop at whitespace (except in quoted strings)
    if (char === " " || char === "\n" || char === "\t") {
      // Check if we're inside quotes
      const beforeChar = text.slice(0, start + 1);
      const atIndex = beforeChar.lastIndexOf("@");
      if (atIndex >= 0) {
        const afterAt = text.slice(atIndex + 1, cursorPosition);
        // If there's an opening quote without closing quote, continue
        if (afterAt.startsWith('"') && !afterAt.slice(1).includes('"')) {
          start--;
          continue;
        }
      }
      return null;
    }

    start--;
  }

  return null;
}
