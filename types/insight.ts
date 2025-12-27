/**
 * Insight Types for Luframe Frontend
 *
 * These types match the backend schema and are used for real-time
 * insight display from the Luframe agent.
 */

/**
 * Types of insights that can be extracted from meeting conversations.
 */
export type InsightType =
  | "idea"
  | "problem"
  | "solution"
  | "risk"
  | "insight"
  | "hypothesis"
  | "action_item"
  | "open_question";

/**
 * Represents an insight extracted from meeting conversation.
 */
export interface Insight {
  /** Unique identifier for this insight */
  id: string;
  /** The category of insight */
  type: InsightType;
  /** The actual insight content (1-2 sentences max) */
  content: string;
  /** The identity of the speaker who mentioned this */
  speaker?: string;
  /** Display name of the speaker */
  speakerName?: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Reference to the transcript segment ID */
  transcriptRef?: string;
  /** Unix timestamp when the insight was detected */
  timestamp: number;
}

/**
 * Configuration for each insight type including display properties.
 */
export interface InsightTypeConfig {
  /** Lucide icon name */
  icon: string;
  /** Human-readable label */
  label: string;
  /** Text color class */
  color: string;
  /** Background color class */
  bgColor: string;
}

/**
 * Configuration mapping for all insight types.
 * Used for consistent styling across components.
 */
export const INSIGHT_CONFIG: Record<InsightType, InsightTypeConfig> = {
  idea: {
    icon: "Lightbulb",
    label: "Idea",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/50",
  },
  problem: {
    icon: "AlertTriangle",
    label: "Problem",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
  },
  solution: {
    icon: "CheckCircle",
    label: "Solution",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/50",
  },
  risk: {
    icon: "AlertCircle",
    label: "Risk",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/50",
  },
  insight: {
    icon: "Search",
    label: "Insight",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
  },
  hypothesis: {
    icon: "FlaskConical",
    label: "Hypothesis",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/50",
  },
  action_item: {
    icon: "ClipboardList",
    label: "Action Item",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/50",
  },
  open_question: {
    icon: "HelpCircle",
    label: "Question",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/50",
  },
};

/**
 * Order of insight types for display purposes.
 * Prioritizes actionable items and issues.
 */
export const INSIGHT_TYPE_ORDER: InsightType[] = [
  "action_item",
  "problem",
  "solution",
  "risk",
  "idea",
  "insight",
  "hypothesis",
  "open_question",
];
