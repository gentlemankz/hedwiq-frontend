/**
 * Shared UI helpers for Agent Builder components
 *
 * Centralizes icon and color logic used across MentionInput, MentionTag,
 * and other mention-related components.
 */

import * as React from "react";
import { Folder, Users, Mail, Calendar, MessageSquare, AlertCircle } from "lucide-react";
import type { MentionableEntity } from "./instruction-parser";
import type { ParsedReference } from "@/types/agent";

// ============================================================================
// Color Constants
// ============================================================================

/**
 * Type-based colors for mention entities.
 * Used for both hex colors (inline styles) and Tailwind classes.
 */
export const ENTITY_COLORS = {
  folder: {
    hex: "#3b82f6", // blue-500
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  team: {
    hex: "#8b5cf6", // violet-500
    bg: "bg-violet-100 dark:bg-violet-950",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
  },
  service: {
    hex: "#10b981", // emerald-500
    bg: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
  },
} as const;

export const UNRESOLVED_COLORS = {
  hex: "#f59e0b", // amber-500
  bg: "bg-amber-100 dark:bg-amber-950",
  text: "text-amber-700 dark:text-amber-300",
  border: "border-amber-200 dark:border-amber-800",
};

// ============================================================================
// Icon Helpers
// ============================================================================

/**
 * Get the appropriate icon for an entity type and name.
 * Works with both MentionableEntity and ParsedReference.
 */
export function getEntityIcon(
  type: "folder" | "team" | "service",
  name?: string,
  isResolved: boolean = true
): React.ReactNode {
  const iconClass = "size-4";
  const smallIconClass = "size-3";

  if (!isResolved) {
    return <AlertCircle className={smallIconClass} />;
  }

  switch (type) {
    case "folder":
      return <Folder className={iconClass} />;
    case "team":
      return <Users className={iconClass} />;
    case "service":
      return getServiceIcon(name || "", iconClass);
    default:
      return <Folder className={iconClass} />;
  }
}

/**
 * Get the appropriate icon for a service by name.
 */
export function getServiceIcon(name: string, className: string = "size-4"): React.ReactNode {
  const nameLower = name.toLowerCase();

  if (nameLower === "gmail" || nameLower.includes("mail")) {
    return <Mail className={className} />;
  }
  if (nameLower === "calendar" || nameLower.includes("calendar") || nameLower === "google calendar") {
    return <Calendar className={className} />;
  }
  if (nameLower === "slack") {
    return <MessageSquare className={className} />;
  }

  // Default service icon
  return <Mail className={className} />;
}

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Get the hex color for an entity.
 * Used for inline styles (e.g., colored dots in autocomplete).
 */
export function getEntityHexColor(entity: MentionableEntity): string {
  // Use custom color if provided
  if (entity.color) {
    return entity.color;
  }

  return ENTITY_COLORS[entity.type]?.hex || "#6b7280"; // gray-500 fallback
}

/**
 * Get Tailwind classes for an entity type.
 * Used for MentionTag styling.
 */
export function getEntityColorClasses(
  type: "folder" | "team" | "service",
  isResolved: boolean = true
): { bg: string; text: string; border: string } {
  if (!isResolved) {
    return UNRESOLVED_COLORS;
  }

  return ENTITY_COLORS[type] || {
    bg: "bg-gray-100 dark:bg-gray-950",
    text: "text-gray-700 dark:text-gray-300",
    border: "border-gray-200 dark:border-gray-800",
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get icon for a MentionableEntity (used in MentionInput).
 */
export function getMentionableEntityIcon(entity: MentionableEntity): React.ReactNode {
  return getEntityIcon(entity.type, entity.name, true);
}

/**
 * Get icon for a ParsedReference (used in MentionTag).
 */
export function getParsedReferenceIcon(reference: ParsedReference): React.ReactNode {
  return getEntityIcon(reference.type, reference.name, !!reference.entityId);
}
