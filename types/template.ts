/**
 * Meeting Template Types for Luframe Frontend
 *
 * These types support the Meeting Templates feature.
 * Used for creating meetings from predefined structures.
 */

import type { MeetingSettings } from "./meeting";

// ============================================================================
// Enum Types
// ============================================================================

/**
 * Template category for grouping similar meeting types.
 */
export type TemplateCategory =
  | "sync" // Daily standups, check-ins
  | "tactical" // Weekly tactical, team meetings
  | "strategic" // Monthly/quarterly planning
  | "one_on_one" // 1-on-1 meetings
  | "workshop" // Brainstorms, retrospectives
  | "decision"; // Decision-focused meetings

/**
 * Template scope defines visibility and ownership.
 */
export type TemplateScope =
  | "system" // Built-in templates, read-only
  | "team" // Owned by a team, visible to team members
  | "personal"; // Owned by a user, private

/**
 * Planning question categories for meeting effectiveness.
 */
export type QuestionCategory = "goal" | "attendees" | "preparation" | "outcome";

/**
 * Presenter role for agenda items.
 */
export type PresenterRole = "host" | "participant" | "anyone";

// ============================================================================
// Core Types
// ============================================================================

/**
 * Planning question for meeting preparation.
 */
export interface PlanningQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  isRequired: boolean;
  placeholder?: string;
  orderIndex: number;
}

/**
 * Template agenda item structure.
 */
export interface TemplateAgendaItem {
  id: string;
  templateId: string;
  orderIndex: number;
  title: string;
  description?: string | null;
  estimatedDuration: number; // Minutes
  isRequired: boolean;
  presenterRole?: PresenterRole | null;
  createdAt: string;
}

/**
 * Meeting template record from the database.
 */
export interface MeetingTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: TemplateCategory;
  scope: TemplateScope;
  teamId?: string | null;
  createdBy?: string | null;
  defaultDuration: number; // Minutes
  suggestedCadence?: string | null;
  defaultGoal?: string | null;
  defaultSettings: MeetingSettings;
  isArchived: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Template with all related data loaded.
 */
export interface TemplateWithItems extends MeetingTemplate {
  agendaItems: TemplateAgendaItem[];
  planningQuestions: PlanningQuestion[];
  team?: {
    id: string;
    name: string;
  } | null;
  creator?: {
    id: string;
    name: string;
    image?: string | null;
  } | null;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Input for creating a template agenda item.
 */
export interface TemplateAgendaItemInput {
  title: string;
  description?: string;
  estimatedDuration: number;
  isRequired?: boolean;
  presenterRole?: PresenterRole;
}

/**
 * Input for creating a planning question.
 */
export interface PlanningQuestionInput {
  question: string;
  category: QuestionCategory;
  isRequired?: boolean;
  placeholder?: string;
}

/**
 * Request body for creating a template.
 */
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: TemplateCategory;
  scope: "team" | "personal"; // Can't create system templates via API
  teamId?: string; // Required if scope = 'team'
  defaultDuration: number;
  suggestedCadence?: string;
  defaultGoal?: string;
  defaultSettings?: MeetingSettings;
  agendaItems: TemplateAgendaItemInput[];
  planningQuestions?: PlanningQuestionInput[];
}

/**
 * Request body for updating a template.
 */
export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  defaultDuration?: number;
  suggestedCadence?: string;
  defaultGoal?: string;
  defaultSettings?: MeetingSettings;
  agendaItems?: TemplateAgendaItemInput[];
  planningQuestions?: PlanningQuestionInput[];
  isArchived?: boolean;
}

/**
 * Query parameters for listing templates.
 */
export interface ListTemplatesParams {
  scope?: TemplateScope | "all";
  category?: TemplateCategory;
  teamId?: string;
  includeArchived?: boolean;
  search?: string;
  sortBy?: "name" | "usageCount" | "createdAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from creating a template.
 */
export interface CreateTemplateResponse {
  template: TemplateWithItems;
}

/**
 * Response from getting a single template.
 */
export interface GetTemplateResponse {
  template: TemplateWithItems | null;
}

/**
 * Response from listing templates.
 */
export interface ListTemplatesResponse {
  templates: TemplateWithItems[];
  total: number;
}

/**
 * Response from updating a template.
 */
export interface UpdateTemplateResponse {
  template: TemplateWithItems;
}

/**
 * Response from deleting a template.
 */
export interface DeleteTemplateResponse {
  success: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation limits for templates.
 */
export const TEMPLATE_LIMITS = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MIN_DURATION_MINUTES: 5,
  MAX_DURATION_MINUTES: 480, // 8 hours
  MIN_AGENDA_ITEMS: 1,
  MAX_AGENDA_ITEMS: 20,
  MAX_PLANNING_QUESTIONS: 10,
  MIN_ITEM_TITLE_LENGTH: 1,
  MAX_ITEM_TITLE_LENGTH: 200,
  MAX_ITEM_DESCRIPTION_LENGTH: 500,
  MAX_QUESTION_LENGTH: 300,
  MAX_PLACEHOLDER_LENGTH: 200,
} as const;

/**
 * Category display information.
 */
export const TEMPLATE_CATEGORIES: Record<
  TemplateCategory,
  { label: string; description: string; icon: string }
> = {
  sync: {
    label: "Sync",
    description: "Daily standups and check-ins",
    icon: "RefreshCw",
  },
  tactical: {
    label: "Tactical",
    description: "Weekly tactical and team meetings",
    icon: "BarChart3",
  },
  strategic: {
    label: "Strategic",
    description: "Monthly/quarterly planning",
    icon: "Target",
  },
  one_on_one: {
    label: "1-on-1",
    description: "One-on-one meetings",
    icon: "Users",
  },
  workshop: {
    label: "Workshop",
    description: "Brainstorms and retrospectives",
    icon: "Lightbulb",
  },
  decision: {
    label: "Decision",
    description: "Decision-focused meetings",
    icon: "Scale",
  },
} as const;

/**
 * Cadence options for templates.
 */
export const CADENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "sprint-end", label: "Sprint End" },
  { value: "as-needed", label: "As Needed" },
] as const;
