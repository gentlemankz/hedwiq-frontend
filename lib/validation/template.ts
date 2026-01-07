/**
 * Template Validation Utilities
 *
 * Centralized validation logic for meeting templates.
 * Used by API routes AND frontend components to ensure consistent validation.
 */

import {
  TEMPLATE_LIMITS,
  type TemplateCategory,
  type TemplateScope,
  type QuestionCategory,
  type PresenterRole,
  type TemplateAgendaItemInput,
  type PlanningQuestionInput,
} from "@/types/template";

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Field-level validation errors for form display.
 */
export interface TemplateFieldErrors {
  name?: string;
  description?: string;
  category?: string;
  scope?: string;
  teamId?: string;
  defaultDuration?: string;
  suggestedCadence?: string;
  defaultGoal?: string;
  agendaItems?: string;
  planningQuestions?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_CATEGORIES: TemplateCategory[] = [
  "sync",
  "tactical",
  "strategic",
  "one_on_one",
  "workshop",
  "decision",
];

const VALID_SCOPES: TemplateScope[] = ["system", "team", "personal"];

const VALID_QUESTION_CATEGORIES: QuestionCategory[] = [
  "goal",
  "attendees",
  "preparation",
  "outcome",
];

const VALID_PRESENTER_ROLES: PresenterRole[] = ["host", "participant", "anyone"];

// ============================================================================
// Template ID Validation
// ============================================================================

/**
 * Template ID validation regex.
 * Format: tpl-{base36 timestamp (8-10 chars)}-{6 alphanumeric chars}
 * Or system templates: tpl-system-{name}
 */
export const TEMPLATE_ID_REGEX = /^tpl-(system-[a-z0-9-]+|[a-z0-9]{8,10}-[a-z0-9]{6})$/;

/**
 * Maximum template ID length to prevent abuse.
 */
export const MAX_TEMPLATE_ID_LENGTH = 40;

/**
 * Validate template ID format.
 */
export function isValidTemplateId(templateId: unknown): templateId is string {
  if (typeof templateId !== "string") return false;
  if (!templateId || templateId.length > MAX_TEMPLATE_ID_LENGTH) return false;
  return TEMPLATE_ID_REGEX.test(templateId);
}

/**
 * Validate template ID and return result with error message.
 */
export function validateTemplateId(templateId: unknown): ValidationResult {
  if (!templateId || typeof templateId !== "string") {
    return { isValid: false, error: "Template ID is required" };
  }

  if (templateId.length > MAX_TEMPLATE_ID_LENGTH) {
    return { isValid: false, error: "Invalid template ID" };
  }

  if (!TEMPLATE_ID_REGEX.test(templateId)) {
    return { isValid: false, error: "Invalid template ID format" };
  }

  return { isValid: true };
}

// ============================================================================
// Field Validation
// ============================================================================

/**
 * Validates a template name.
 */
export function validateTemplateName(name: unknown): ValidationResult {
  if (typeof name !== "string") {
    return { isValid: false, error: "name must be a string" };
  }

  const trimmed = name.trim();
  if (trimmed.length < TEMPLATE_LIMITS.MIN_NAME_LENGTH) {
    return {
      isValid: false,
      error: `name must be at least ${TEMPLATE_LIMITS.MIN_NAME_LENGTH} characters`,
    };
  }
  if (trimmed.length > TEMPLATE_LIMITS.MAX_NAME_LENGTH) {
    return {
      isValid: false,
      error: `name must be ${TEMPLATE_LIMITS.MAX_NAME_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a template description.
 */
export function validateTemplateDescription(description: unknown): ValidationResult {
  if (description === undefined || description === null || description === "") {
    return { isValid: true }; // Optional field
  }

  if (typeof description !== "string") {
    return { isValid: false, error: "description must be a string" };
  }

  if (description.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      isValid: false,
      error: `description must be ${TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a template category.
 */
export function validateTemplateCategory(category: unknown): ValidationResult {
  if (typeof category !== "string") {
    return { isValid: false, error: "category must be a string" };
  }
  if (!VALID_CATEGORIES.includes(category as TemplateCategory)) {
    return {
      isValid: false,
      error: `category must be one of: ${VALID_CATEGORIES.join(", ")}`,
    };
  }
  return { isValid: true };
}

/**
 * Validates a template scope.
 */
export function validateTemplateScope(scope: unknown): ValidationResult {
  if (typeof scope !== "string") {
    return { isValid: false, error: "scope must be a string" };
  }
  if (!VALID_SCOPES.includes(scope as TemplateScope)) {
    return {
      isValid: false,
      error: `scope must be one of: ${VALID_SCOPES.join(", ")}`,
    };
  }
  // System scope cannot be created via API
  if (scope === "system") {
    return { isValid: false, error: "Cannot create system templates via API" };
  }
  return { isValid: true };
}

/**
 * Validates template default duration.
 */
export function validateTemplateDuration(duration: unknown): ValidationResult {
  if (duration === undefined || duration === null) {
    return { isValid: true }; // Optional, will use default
  }

  if (typeof duration !== "number" || isNaN(duration)) {
    return { isValid: false, error: "defaultDuration must be a number" };
  }

  if (duration < TEMPLATE_LIMITS.MIN_DURATION_MINUTES) {
    return {
      isValid: false,
      error: `defaultDuration must be at least ${TEMPLATE_LIMITS.MIN_DURATION_MINUTES} minutes`,
    };
  }

  if (duration > TEMPLATE_LIMITS.MAX_DURATION_MINUTES) {
    return {
      isValid: false,
      error: `defaultDuration must be ${TEMPLATE_LIMITS.MAX_DURATION_MINUTES} minutes or less`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a single agenda item.
 */
export function validateAgendaItem(
  item: unknown,
  index: number
): ValidationResult {
  if (typeof item !== "object" || item === null) {
    return { isValid: false, error: `agendaItems[${index}] must be an object` };
  }

  const agendaItem = item as TemplateAgendaItemInput;

  // Title validation
  if (typeof agendaItem.title !== "string") {
    return { isValid: false, error: `agendaItems[${index}].title must be a string` };
  }

  const trimmedTitle = agendaItem.title.trim();
  if (trimmedTitle.length < TEMPLATE_LIMITS.MIN_ITEM_TITLE_LENGTH) {
    return { isValid: false, error: `agendaItems[${index}].title is required` };
  }
  if (trimmedTitle.length > TEMPLATE_LIMITS.MAX_ITEM_TITLE_LENGTH) {
    return {
      isValid: false,
      error: `agendaItems[${index}].title must be ${TEMPLATE_LIMITS.MAX_ITEM_TITLE_LENGTH} characters or less`,
    };
  }

  // Description validation (optional)
  if (agendaItem.description !== undefined && agendaItem.description !== null) {
    if (typeof agendaItem.description !== "string") {
      return {
        isValid: false,
        error: `agendaItems[${index}].description must be a string`,
      };
    }
    if (agendaItem.description.length > TEMPLATE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH) {
      return {
        isValid: false,
        error: `agendaItems[${index}].description must be ${TEMPLATE_LIMITS.MAX_ITEM_DESCRIPTION_LENGTH} characters or less`,
      };
    }
  }

  // Duration validation
  if (typeof agendaItem.estimatedDuration !== "number" || isNaN(agendaItem.estimatedDuration)) {
    return {
      isValid: false,
      error: `agendaItems[${index}].estimatedDuration must be a number`,
    };
  }
  if (agendaItem.estimatedDuration < 1 || agendaItem.estimatedDuration > 480) {
    return {
      isValid: false,
      error: `agendaItems[${index}].estimatedDuration must be between 1 and 480 minutes`,
    };
  }

  // Presenter role validation (optional)
  if (agendaItem.presenterRole !== undefined && agendaItem.presenterRole !== null) {
    if (!VALID_PRESENTER_ROLES.includes(agendaItem.presenterRole)) {
      return {
        isValid: false,
        error: `agendaItems[${index}].presenterRole must be one of: ${VALID_PRESENTER_ROLES.join(", ")}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates agenda items array.
 */
export function validateAgendaItems(items: unknown): ValidationResult {
  if (!Array.isArray(items)) {
    return { isValid: false, error: "agendaItems must be an array" };
  }

  if (items.length < TEMPLATE_LIMITS.MIN_AGENDA_ITEMS) {
    return {
      isValid: false,
      error: `agendaItems must have at least ${TEMPLATE_LIMITS.MIN_AGENDA_ITEMS} item`,
    };
  }

  if (items.length > TEMPLATE_LIMITS.MAX_AGENDA_ITEMS) {
    return {
      isValid: false,
      error: `agendaItems must have at most ${TEMPLATE_LIMITS.MAX_AGENDA_ITEMS} items`,
    };
  }

  for (let i = 0; i < items.length; i++) {
    const itemValidation = validateAgendaItem(items[i], i);
    if (!itemValidation.isValid) {
      return itemValidation;
    }
  }

  return { isValid: true };
}

/**
 * Validates a single planning question.
 */
export function validatePlanningQuestion(
  question: unknown,
  index: number
): ValidationResult {
  if (typeof question !== "object" || question === null) {
    return { isValid: false, error: `planningQuestions[${index}] must be an object` };
  }

  const q = question as PlanningQuestionInput;

  // Question text validation
  if (typeof q.question !== "string") {
    return {
      isValid: false,
      error: `planningQuestions[${index}].question must be a string`,
    };
  }

  const trimmedQuestion = q.question.trim();
  if (trimmedQuestion.length < 1) {
    return {
      isValid: false,
      error: `planningQuestions[${index}].question is required`,
    };
  }
  if (trimmedQuestion.length > TEMPLATE_LIMITS.MAX_QUESTION_LENGTH) {
    return {
      isValid: false,
      error: `planningQuestions[${index}].question must be ${TEMPLATE_LIMITS.MAX_QUESTION_LENGTH} characters or less`,
    };
  }

  // Category validation
  if (typeof q.category !== "string") {
    return {
      isValid: false,
      error: `planningQuestions[${index}].category must be a string`,
    };
  }
  if (!VALID_QUESTION_CATEGORIES.includes(q.category)) {
    return {
      isValid: false,
      error: `planningQuestions[${index}].category must be one of: ${VALID_QUESTION_CATEGORIES.join(", ")}`,
    };
  }

  // Placeholder validation (optional)
  if (q.placeholder !== undefined && q.placeholder !== null) {
    if (typeof q.placeholder !== "string") {
      return {
        isValid: false,
        error: `planningQuestions[${index}].placeholder must be a string`,
      };
    }
    if (q.placeholder.length > TEMPLATE_LIMITS.MAX_PLACEHOLDER_LENGTH) {
      return {
        isValid: false,
        error: `planningQuestions[${index}].placeholder must be ${TEMPLATE_LIMITS.MAX_PLACEHOLDER_LENGTH} characters or less`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates planning questions array.
 */
export function validatePlanningQuestions(questions: unknown): ValidationResult {
  if (questions === undefined || questions === null) {
    return { isValid: true }; // Optional field
  }

  if (!Array.isArray(questions)) {
    return { isValid: false, error: "planningQuestions must be an array" };
  }

  if (questions.length > TEMPLATE_LIMITS.MAX_PLANNING_QUESTIONS) {
    return {
      isValid: false,
      error: `planningQuestions must have at most ${TEMPLATE_LIMITS.MAX_PLANNING_QUESTIONS} questions`,
    };
  }

  for (let i = 0; i < questions.length; i++) {
    const questionValidation = validatePlanningQuestion(questions[i], i);
    if (!questionValidation.isValid) {
      return questionValidation;
    }
  }

  return { isValid: true };
}

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validates a complete create template request.
 */
export function validateCreateTemplateRequest(body: {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  scope?: unknown;
  teamId?: unknown;
  defaultDuration?: unknown;
  suggestedCadence?: unknown;
  defaultGoal?: unknown;
  defaultSettings?: unknown;
  agendaItems?: unknown;
  planningQuestions?: unknown;
}): ValidationResult {
  // Validate name (required)
  const nameValidation = validateTemplateName(body.name);
  if (!nameValidation.isValid) {
    return nameValidation;
  }

  // Validate description (optional)
  const descValidation = validateTemplateDescription(body.description);
  if (!descValidation.isValid) {
    return descValidation;
  }

  // Validate category (required)
  const categoryValidation = validateTemplateCategory(body.category);
  if (!categoryValidation.isValid) {
    return categoryValidation;
  }

  // Validate scope (required)
  const scopeValidation = validateTemplateScope(body.scope);
  if (!scopeValidation.isValid) {
    return scopeValidation;
  }

  // Validate teamId if scope is 'team'
  if (body.scope === "team") {
    if (!body.teamId || typeof body.teamId !== "string") {
      return { isValid: false, error: "teamId is required when scope is 'team'" };
    }
  }

  // Validate defaultDuration (required)
  if (body.defaultDuration === undefined || body.defaultDuration === null) {
    return { isValid: false, error: "defaultDuration is required" };
  }
  const durationValidation = validateTemplateDuration(body.defaultDuration);
  if (!durationValidation.isValid) {
    return durationValidation;
  }

  // Validate agendaItems (required)
  if (!body.agendaItems) {
    return { isValid: false, error: "agendaItems is required" };
  }
  const agendaValidation = validateAgendaItems(body.agendaItems);
  if (!agendaValidation.isValid) {
    return agendaValidation;
  }

  // Validate planningQuestions (optional)
  const questionsValidation = validatePlanningQuestions(body.planningQuestions);
  if (!questionsValidation.isValid) {
    return questionsValidation;
  }

  return { isValid: true };
}

/**
 * Validates a partial update template request.
 */
export function validateUpdateTemplateRequest(body: {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  defaultDuration?: unknown;
  suggestedCadence?: unknown;
  defaultGoal?: unknown;
  defaultSettings?: unknown;
  agendaItems?: unknown;
  planningQuestions?: unknown;
  isArchived?: unknown;
}): ValidationResult {
  // Validate name if provided
  if (body.name !== undefined) {
    const nameValidation = validateTemplateName(body.name);
    if (!nameValidation.isValid) {
      return nameValidation;
    }
  }

  // Validate description if provided
  if (body.description !== undefined) {
    const descValidation = validateTemplateDescription(body.description);
    if (!descValidation.isValid) {
      return descValidation;
    }
  }

  // Validate category if provided
  if (body.category !== undefined) {
    const categoryValidation = validateTemplateCategory(body.category);
    if (!categoryValidation.isValid) {
      return categoryValidation;
    }
  }

  // Validate defaultDuration if provided
  if (body.defaultDuration !== undefined) {
    const durationValidation = validateTemplateDuration(body.defaultDuration);
    if (!durationValidation.isValid) {
      return durationValidation;
    }
  }

  // Validate agendaItems if provided
  if (body.agendaItems !== undefined) {
    const agendaValidation = validateAgendaItems(body.agendaItems);
    if (!agendaValidation.isValid) {
      return agendaValidation;
    }
  }

  // Validate planningQuestions if provided
  if (body.planningQuestions !== undefined) {
    const questionsValidation = validatePlanningQuestions(body.planningQuestions);
    if (!questionsValidation.isValid) {
      return questionsValidation;
    }
  }

  // Validate isArchived if provided
  if (body.isArchived !== undefined && typeof body.isArchived !== "boolean") {
    return { isValid: false, error: "isArchived must be a boolean" };
  }

  return { isValid: true };
}

// ============================================================================
// Client-Side Field Validation (for React components)
// ============================================================================

/**
 * Validates a single template field.
 * Returns error message or undefined if valid.
 */
export function validateTemplateField(
  field: keyof TemplateFieldErrors,
  value: string | number | undefined | null
): string | undefined {
  switch (field) {
    case "name": {
      if (typeof value !== "string") return "Name is required";
      const trimmed = value.trim();
      if (trimmed.length < TEMPLATE_LIMITS.MIN_NAME_LENGTH) {
        return `Name must be at least ${TEMPLATE_LIMITS.MIN_NAME_LENGTH} characters`;
      }
      if (trimmed.length > TEMPLATE_LIMITS.MAX_NAME_LENGTH) {
        return `Name must be ${TEMPLATE_LIMITS.MAX_NAME_LENGTH} characters or less`;
      }
      return undefined;
    }

    case "description": {
      if (value === undefined || value === null || value === "") {
        return undefined; // Optional field
      }
      if (typeof value !== "string") {
        return "Description must be text";
      }
      if (value.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
        return `Description must be ${TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
      }
      return undefined;
    }

    case "defaultDuration": {
      if (value === undefined || value === null || value === "") {
        return "Duration is required";
      }
      const numValue = typeof value === "string" ? parseInt(value, 10) : value;
      if (typeof numValue !== "number" || isNaN(numValue)) {
        return "Duration must be a number";
      }
      if (numValue < TEMPLATE_LIMITS.MIN_DURATION_MINUTES) {
        return `Duration must be at least ${TEMPLATE_LIMITS.MIN_DURATION_MINUTES} minutes`;
      }
      if (numValue > TEMPLATE_LIMITS.MAX_DURATION_MINUTES) {
        return `Duration must be ${TEMPLATE_LIMITS.MAX_DURATION_MINUTES} minutes or less`;
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Validates all fields of a template at once.
 * Returns object with field-level errors for form display.
 */
export function getTemplateFieldErrors(input: {
  name?: string;
  description?: string;
  defaultDuration?: string | number;
}): TemplateFieldErrors {
  const errors: TemplateFieldErrors = {};

  const nameError = validateTemplateField("name", input.name);
  if (nameError) errors.name = nameError;

  const descError = validateTemplateField("description", input.description);
  if (descError) errors.description = descError;

  const durationError = validateTemplateField("defaultDuration", input.defaultDuration);
  if (durationError) errors.defaultDuration = durationError;

  return errors;
}

/**
 * Check if there are any validation errors.
 */
export function hasTemplateFieldErrors(errors: TemplateFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
