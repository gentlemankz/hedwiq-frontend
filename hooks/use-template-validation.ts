import { useMemo } from "react";
import { TEMPLATE_LIMITS } from "@/types/template";

/**
 * Shared validation errors type for template forms
 */
export interface TemplateValidationErrors {
  nameError: string | null;
  descriptionError: string | null;
}

/**
 * Hook to validate template name and description fields.
 * Used by save-as-template and duplicate-template dialogs.
 */
export function useTemplateValidation(
  name: string,
  description: string,
  hasAttemptedSubmit: boolean
): TemplateValidationErrors {
  const nameError = useMemo(() => {
    if (!hasAttemptedSubmit) return null;

    const trimmedName = name.trim();
    if (!trimmedName) {
      return "Name is required";
    }
    if (trimmedName.length < TEMPLATE_LIMITS.MIN_NAME_LENGTH) {
      return `Name must be at least ${TEMPLATE_LIMITS.MIN_NAME_LENGTH} characters`;
    }
    if (name.length > TEMPLATE_LIMITS.MAX_NAME_LENGTH) {
      return `Name must be ${TEMPLATE_LIMITS.MAX_NAME_LENGTH} characters or less`;
    }
    return null;
  }, [name, hasAttemptedSubmit]);

  const descriptionError = useMemo(() => {
    if (!hasAttemptedSubmit) return null;

    if (description.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
      return `Description must be ${TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH} characters or less`;
    }
    return null;
  }, [description, hasAttemptedSubmit]);

  return { nameError, descriptionError };
}

/**
 * Validates template name and description for form submission.
 * Returns true if valid, false otherwise.
 */
export function validateTemplateFields(
  name: string,
  description: string
): boolean {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length < TEMPLATE_LIMITS.MIN_NAME_LENGTH) {
    return false;
  }
  if (name.length > TEMPLATE_LIMITS.MAX_NAME_LENGTH) {
    return false;
  }
  if (description.length > TEMPLATE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return false;
  }
  return true;
}
