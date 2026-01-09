/**
 * Agent Builder Utilities
 *
 * Library functions for the Agent Builder feature.
 */

export {
  // Core parsing
  parseInstructions,
  extractMentions,
  // Autocomplete support
  getMentionSuggestions,
  formatMentionForInsert,
  getMentionQueryAtCursor,
  // Validation
  validateInstructions,
  getUnresolvedReferences,
  hasValidReferences,
  // Reference extraction
  getReferencedFolderIds,
  getReferencedTeamIds,
  getReferencedServiceIds,
  // Types
  type MentionableEntity,
  type ParserContext,
  type MentionMatch,
  type InstructionValidationResult,
  type InstructionValidationOptions,
} from "./instruction-parser";

// UI helpers for consistent styling across mention components
export {
  ENTITY_COLORS,
  UNRESOLVED_COLORS,
  getEntityIcon,
  getServiceIcon,
  getEntityHexColor,
  getEntityColorClasses,
  getMentionableEntityIcon,
  getParsedReferenceIcon,
} from "./ui-helpers";
