/**
 * Agent Builder Types for Luframe Frontend
 *
 * These types support the Agent Builder feature for creating
 * custom AI agents that automate meeting-related workflows.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Agent schedule type - defines when an agent runs.
 * - once: Run once at a specific time
 * - hourly: Run every hour
 * - daily: Run once per day
 * - weekly: Run once per week
 * - monthly: Run once per month
 */
export type AgentScheduleType = "once" | "hourly" | "daily" | "weekly" | "monthly";

/**
 * Agent trigger type - defines what event triggers an agent.
 * - meeting_end: When a meeting session ends
 * - meeting_start: When a meeting session starts
 * - new_meeting_in_folder: When a new meeting is added to a folder
 * - manual: Only triggered by user clicking "Run Now"
 */
export type AgentTriggerType = "meeting_end" | "meeting_start" | "new_meeting_in_folder" | "manual";

/**
 * What triggered an agent execution.
 * - schedule: Triggered by a time-based schedule
 * - trigger: Triggered by an event (meeting end, etc.)
 * - manual: Triggered by user clicking "Run Now"
 */
export type AgentExecutionTriggeredBy = "schedule" | "trigger" | "manual";

/**
 * Agent execution status.
 * - pending: Execution queued but not started
 * - running: Currently executing
 * - completed: Finished successfully
 * - failed: Finished with error
 */
export type AgentExecutionStatus = "pending" | "running" | "completed" | "failed";

/**
 * Supported AI models for agent execution.
 * Using Azure OpenAI ecosystem (consistent with Python agent).
 */
export type AgentModel = "gpt-4o" | "gpt-4o-mini";

/**
 * Supported services that agents can reference.
 */
export type AgentService = "Gmail" | "Calendar" | "Slack";

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * An agent record from the database.
 */
export interface Agent {
  /** Unique agent identifier (e.g., agent-{userId}-{timestamp}) */
  id: string;
  /** User ID who owns this agent */
  userId: string;
  /** Agent name (3-100 chars) */
  name: string;
  /** Optional description of what this agent does */
  description: string | null;
  /** Natural language instructions with @ mentions */
  instructions: string;
  /** Referenced folder IDs (extracted from @ mentions) */
  referencedFolders: string[] | null;
  /** Referenced team IDs (extracted from @ mentions) */
  referencedTeams: string[] | null;
  /** Referenced services (extracted from @ mentions like @Gmail) */
  referencedServices: string[] | null;
  /** LLM model to use */
  model: AgentModel;
  /** Whether the agent is active and can be triggered */
  isActive: boolean;
  /**
   * Email domain allowlist for the sendEmail tool.
   * If null/empty, emails can be sent to any domain.
   * If set, only recipients with email addresses from these domains are allowed.
   * Example: ["company.com", "partner.org"]
   */
  emailDomainAllowlist: string[] | null;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Last update timestamp (ISO string) */
  updatedAt: string;
}

/**
 * An agent schedule record from the database.
 */
export interface AgentSchedule {
  /** Unique schedule identifier (e.g., sched-{agentId}-{timestamp}) */
  id: string;
  /** Parent agent ID */
  agentId: string;
  /** Schedule type: once, hourly, daily, weekly, monthly */
  scheduleType: AgentScheduleType;
  /** Specific datetime for one-time schedules */
  scheduledAt: string | null;
  /** Hour of day (0-23) for daily/weekly/monthly */
  hour: number | null;
  /** Minute of hour (0-59) */
  minute: number | null;
  /** Day of week (0=Sunday, 6=Saturday) for weekly schedules */
  dayOfWeek: number | null;
  /** Day of month (1-31) for monthly schedules */
  dayOfMonth: number | null;
  /** Timezone for schedule calculations (IANA format) */
  timezone: string;
  /** When the schedule last ran successfully */
  lastRunAt: string | null;
  /** Calculated next run time */
  nextRunAt: string | null;
  /** Whether this schedule is enabled */
  isEnabled: boolean;
  /** Creation timestamp (ISO string) */
  createdAt: string;
}

/**
 * An agent trigger record from the database.
 */
export interface AgentTrigger {
  /** Unique trigger identifier (e.g., trig-{agentId}-{timestamp}) */
  id: string;
  /** Parent agent ID */
  agentId: string;
  /** Event type that triggers the agent */
  triggerType: AgentTriggerType;
  /** Limit trigger to meetings in this folder (null = all) */
  scopeFolderId: string | null;
  /** Limit trigger to meetings involving this team (null = all) */
  scopeTeamId: string | null;
  /** Whether this trigger is enabled */
  isEnabled: boolean;
  /** Creation timestamp (ISO string) */
  createdAt: string;
}

/**
 * Input context passed to an agent execution.
 */
export interface AgentExecutionInputContext {
  /** Meeting IDs that were processed */
  meetingIds?: string[];
  /** Folder IDs that were queried */
  folderIds?: string[];
  /** Team IDs that were involved */
  teamIds?: string[];
  /** Services that were used */
  services?: string[];
  /** Triggering event details */
  triggerEvent?: {
    type: string;
    meetingId?: string;
    folderId?: string;
  };
}

/**
 * Tool call made during agent execution.
 */
export interface AgentToolCall {
  /** Tool/function name */
  name: string;
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Result from the tool (if any) */
  result?: unknown;
}

/**
 * Token usage statistics for an execution.
 */
export interface AgentTokenUsage {
  /** Tokens used in the prompt */
  promptTokens: number;
  /** Tokens used in the completion */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
}

/**
 * Email sent during agent execution.
 */
export interface AgentEmailSent {
  /** Recipient email addresses */
  to: string[];
  /** Email subject */
  subject: string;
  /** Gmail message ID (if sent via Gmail) */
  gmailMessageId?: string;
}

/**
 * Output result from an agent execution.
 */
export interface AgentExecutionOutputResult {
  /** Text output from the agent */
  text?: string;
  /** Tool calls made during execution */
  toolCalls?: AgentToolCall[];
  /** Token usage statistics */
  usage?: AgentTokenUsage;
  /** Emails sent during execution */
  emailsSent?: AgentEmailSent[];
}

/**
 * An agent execution record from the database.
 */
export interface AgentExecution {
  /** Unique execution identifier (e.g., exec-{agentId}-{timestamp}) */
  id: string;
  /** Parent agent ID */
  agentId: string;
  /** What triggered this execution */
  triggeredBy: AgentExecutionTriggeredBy;
  /** Reference to schedule if triggered by schedule */
  scheduleId: string | null;
  /** Reference to trigger if triggered by trigger */
  triggerId: string | null;
  /** Current execution status */
  status: AgentExecutionStatus;
  /** What data was passed to the agent */
  inputContext: AgentExecutionInputContext | null;
  /** What the agent produced */
  outputResult: AgentExecutionOutputResult | null;
  /** Error message if execution failed */
  errorMessage: string | null;
  /** When execution started (ISO string) */
  startedAt: string | null;
  /** When execution completed (ISO string) */
  completedAt: string | null;
  /** Execution duration in milliseconds */
  durationMs: number | null;
  /** Creation timestamp (ISO string) */
  createdAt: string;
}

// ============================================================================
// Extended Types
// ============================================================================

/**
 * Agent with schedule and trigger counts for list views.
 */
export interface AgentWithCounts extends Agent {
  /** Number of schedules */
  scheduleCount: number;
  /** Number of triggers */
  triggerCount: number;
  /** Number of total executions */
  executionCount: number;
  /** Last execution time (ISO string) */
  lastExecutionAt: string | null;
}

/**
 * Agent with full schedule and trigger details.
 */
export interface AgentWithDetails extends Agent {
  /** Associated schedules */
  schedules: AgentSchedule[];
  /** Associated triggers */
  triggers: AgentTrigger[];
  /** Recent executions (last 10) */
  recentExecutions: AgentExecution[];
}

/**
 * Agent trigger with scope details for display.
 */
export interface AgentTriggerWithScope extends AgentTrigger {
  /** Folder details if scoped */
  folder?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  /** Team details if scoped */
  team?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

/**
 * Agent execution with agent name for list views.
 */
export interface AgentExecutionWithAgent extends AgentExecution {
  /** Agent name */
  agentName: string;
}

// ============================================================================
// Parsed Reference Types (for @ mention extraction)
// ============================================================================

/**
 * A parsed @ mention reference from agent instructions.
 */
export interface ParsedReference {
  /** Type of reference */
  type: "folder" | "team" | "service";
  /** Raw text as typed (e.g., "@General") */
  rawText: string;
  /** Resolved entity ID (if found) */
  entityId?: string;
  /** Display name */
  name: string;
  /** Entity color from database (hex color string, e.g., "#3b82f6") */
  color?: string | null;
}

/**
 * Result of parsing agent instructions for @ mentions.
 */
export interface ParsedInstructions {
  /** Clean instructions text (references replaced with placeholders) */
  cleanText: string;
  /** All parsed references */
  references: ParsedReference[];
  /** Folder references */
  folders: ParsedReference[];
  /** Team references */
  teams: ParsedReference[];
  /** Service references */
  services: ParsedReference[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating an agent.
 */
export interface CreateAgentRequest {
  /** Agent name (3-100 chars) */
  name: string;
  /** Optional description */
  description?: string;
  /** Natural language instructions */
  instructions: string;
  /** LLM model to use */
  model?: AgentModel;
  /** Email domain allowlist for the sendEmail tool (null = allow all domains) */
  emailDomainAllowlist?: string[] | null;
}

/**
 * Response from creating an agent.
 */
export interface CreateAgentResponse {
  agent: Agent;
}

/**
 * Request body for updating an agent.
 */
export interface UpdateAgentRequest {
  /** Agent name */
  name?: string;
  /** Description */
  description?: string | null;
  /** Natural language instructions */
  instructions?: string;
  /** LLM model to use */
  model?: AgentModel;
  /** Whether the agent is active */
  isActive?: boolean;
  /** Email domain allowlist for the sendEmail tool (null = allow all domains) */
  emailDomainAllowlist?: string[] | null;
}

/**
 * Response from updating an agent.
 */
export interface UpdateAgentResponse {
  agent: Agent;
}

/**
 * Response from getting a single agent.
 */
export interface GetAgentResponse {
  agent: AgentWithDetails | null;
}

/**
 * Response from listing agents.
 */
export interface ListAgentsResponse {
  agents: AgentWithCounts[];
}

/**
 * Response from deleting an agent.
 */
export interface DeleteAgentResponse {
  success: boolean;
}

/**
 * Response from executing an agent.
 */
export interface ExecuteAgentResponse {
  execution: AgentExecution;
}

// ============================================================================
// Schedule API Types
// ============================================================================

/**
 * Request body for creating an agent schedule.
 */
export interface CreateAgentScheduleRequest {
  /** Schedule type */
  scheduleType: AgentScheduleType;
  /** For 'once': specific datetime (ISO string) */
  scheduledAt?: string;
  /** Hour of day (0-23) */
  hour?: number;
  /** Minute of hour (0-59) */
  minute?: number;
  /** Day of week (0-6) for weekly */
  dayOfWeek?: number;
  /** Day of month (1-31) for monthly */
  dayOfMonth?: number;
  /** Timezone (IANA format) */
  timezone?: string;
}

/**
 * Response from creating a schedule.
 */
export interface CreateAgentScheduleResponse {
  schedule: AgentSchedule;
}

/**
 * Request body for updating a schedule.
 */
export interface UpdateAgentScheduleRequest {
  /** Schedule type */
  scheduleType?: AgentScheduleType;
  /** For 'once': specific datetime (ISO string) */
  scheduledAt?: string;
  /** Hour of day (0-23) */
  hour?: number;
  /** Minute of hour (0-59) */
  minute?: number;
  /** Day of week (0-6) */
  dayOfWeek?: number;
  /** Day of month (1-31) */
  dayOfMonth?: number;
  /** Timezone */
  timezone?: string;
  /** Whether enabled */
  isEnabled?: boolean;
}

/**
 * Response from updating a schedule.
 */
export interface UpdateAgentScheduleResponse {
  schedule: AgentSchedule;
}

/**
 * Response from listing schedules.
 */
export interface ListAgentSchedulesResponse {
  schedules: AgentSchedule[];
}

/**
 * Response from deleting a schedule.
 */
export interface DeleteAgentScheduleResponse {
  success: boolean;
}

// ============================================================================
// Trigger API Types
// ============================================================================

/**
 * Request body for creating an agent trigger.
 */
export interface CreateAgentTriggerRequest {
  /** Trigger type */
  triggerType: AgentTriggerType;
  /** Limit to specific folder */
  scopeFolderId?: string;
  /** Limit to specific team */
  scopeTeamId?: string;
}

/**
 * Response from creating a trigger.
 */
export interface CreateAgentTriggerResponse {
  trigger: AgentTrigger;
}

/**
 * Request body for updating a trigger.
 */
export interface UpdateAgentTriggerRequest {
  /** Trigger type */
  triggerType?: AgentTriggerType;
  /** Limit to specific folder */
  scopeFolderId?: string | null;
  /** Limit to specific team */
  scopeTeamId?: string | null;
  /** Whether enabled */
  isEnabled?: boolean;
}

/**
 * Response from updating a trigger.
 */
export interface UpdateAgentTriggerResponse {
  trigger: AgentTrigger;
}

/**
 * Response from listing triggers.
 */
export interface ListAgentTriggersResponse {
  triggers: AgentTriggerWithScope[];
}

/**
 * Response from deleting a trigger.
 */
export interface DeleteAgentTriggerResponse {
  success: boolean;
}

// ============================================================================
// Execution API Types
// ============================================================================

/**
 * Request body for manually running an agent.
 */
export interface RunAgentRequest {
  /** Optional meeting ID to process */
  meetingId?: string;
  /** Optional folder ID scope */
  folderId?: string;
}

/**
 * Response from running an agent.
 */
export interface RunAgentResponse {
  execution: AgentExecution;
}

/**
 * Response from listing executions.
 */
export interface ListAgentExecutionsResponse {
  executions: AgentExecution[];
  /** Total count for pagination */
  totalCount: number;
}

/**
 * Response from getting a single execution.
 */
export interface GetAgentExecutionResponse {
  execution: AgentExecution | null;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation and limit constants for agents.
 */
export const AGENT_LIMITS = {
  /** Minimum name length */
  MIN_NAME_LENGTH: 3,
  /** Maximum name length */
  MAX_NAME_LENGTH: 100,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Maximum instructions length */
  MAX_INSTRUCTIONS_LENGTH: 5000,
  /** Maximum agents per user */
  MAX_AGENTS_PER_USER: 10,
  /** Maximum schedules per agent */
  MAX_SCHEDULES_PER_AGENT: 5,
  /** Maximum triggers per agent */
  MAX_TRIGGERS_PER_AGENT: 10,
  /** Execution history retention days */
  EXECUTION_HISTORY_DAYS: 30,
} as const;

/**
 * Human-readable schedule type labels.
 */
export const SCHEDULE_TYPE_LABELS: Record<AgentScheduleType, string> = {
  once: "Once",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
} as const;

/**
 * Human-readable trigger type labels.
 */
export const TRIGGER_TYPE_LABELS: Record<AgentTriggerType, string> = {
  meeting_end: "When meeting ends",
  meeting_start: "When meeting starts",
  new_meeting_in_folder: "New meeting in folder",
  manual: "Manual only",
} as const;

/**
 * Trigger type descriptions for tooltips.
 */
export const TRIGGER_TYPE_DESCRIPTIONS: Record<AgentTriggerType, string> = {
  meeting_end: "Runs automatically when any meeting session ends",
  meeting_start: "Runs automatically when any meeting session starts",
  new_meeting_in_folder: "Runs when a new meeting is added to a specific folder",
  manual: "Only runs when you click 'Run Now'",
} as const;

/**
 * Human-readable execution status labels.
 */
export const EXECUTION_STATUS_LABELS: Record<AgentExecutionStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
} as const;

/**
 * Execution status colors for UI.
 */
export const EXECUTION_STATUS_COLORS: Record<AgentExecutionStatus, string> = {
  pending: "yellow",
  running: "blue",
  completed: "green",
  failed: "red",
} as const;

/**
 * Human-readable model labels.
 */
export const MODEL_LABELS: Record<AgentModel, string> = {
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini (Faster)",
} as const;

/**
 * Model descriptions for tooltips.
 */
export const MODEL_DESCRIPTIONS: Record<AgentModel, string> = {
  "gpt-4o": "Best balance of speed and capability",
  "gpt-4o-mini": "Faster and more cost-effective",
} as const;

/**
 * Available services for @ mentions.
 */
export const AVAILABLE_SERVICES: Array<{
  id: AgentService;
  name: string;
  icon: string;
  description: string;
}> = [
  {
    id: "Gmail",
    name: "Gmail",
    icon: "mail",
    description: "Send emails via your connected Gmail account",
  },
  {
    id: "Calendar",
    name: "Google Calendar",
    icon: "calendar",
    description: "Create and manage calendar events",
  },
  {
    id: "Slack",
    name: "Slack",
    icon: "message-square",
    description: "Send messages to Slack channels (coming soon)",
  },
] as const;

// ============================================================================
// Helper Functions (Re-exported from lib/utils for backward compatibility)
// ============================================================================

// Helper functions have been moved to @/lib/utils for proper separation of concerns.
// Import them directly from @/lib/utils in new code:
//   import { formatExecutionDuration, describeSchedule, isExecutionInProgress } from "@/lib/utils"
//
// Re-exports below maintain backward compatibility:
export {
  formatExecutionDuration,
  describeSchedule,
  isExecutionInProgress,
} from "@/lib/utils";

/**
 * @deprecated Use `formatExecutionDuration` from `@/lib/utils` instead.
 * This alias is kept for backward compatibility.
 */
export { formatExecutionDuration as formatDuration } from "@/lib/utils";
