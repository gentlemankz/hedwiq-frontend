/**
 * Agent Executor Engine
 *
 * Executes agent instructions using the Vercel AI SDK with tool calling.
 * Tools provide access to meetings, transcripts, teams, and email functionality.
 */

import { generateText, tool, stepCountIs } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { z } from "zod";
import { getSecret, getSecretOrDefault } from "@/lib/secrets";
import { getMeetingById, listMeetingsForUser, isMeetingHost } from "@/lib/db/meeting";
import { getMeetingTranscriptionLimited } from "@/lib/db/meeting-data";
import { getTeamWithMemberCount, listTeamMembers, listTeamsForUser, isTeamMember } from "@/lib/db/team";
import { getValidGmailToken } from "@/lib/db/gmail";
import type {
  Agent,
  AgentExecution,
  AgentExecutionOutputResult,
  AgentToolCall,
  AgentTokenUsage,
  AgentEmailSent,
} from "@/types/agent";

// ============================================================================
// Constants
// ============================================================================

/** Maximum transcript size in characters to prevent memory issues */
const MAX_TRANSCRIPT_SIZE = 100_000; // ~100KB

/** Maximum transcript segments to include */
const MAX_TRANSCRIPT_SEGMENTS = 500;

/** Execution timeout in milliseconds (2 minutes) */
const EXECUTION_TIMEOUT_MS = 120_000;

// ============================================================================
// Types
// ============================================================================

export interface ExecutorContext {
  /** User ID who owns the agent */
  userId: string;
  /** User's email address */
  userEmail: string;
  /** User's name */
  userName: string;
  /** Optional meeting ID for context */
  meetingId?: string;
  /** Optional folder ID for context */
  folderId?: string;
}

export interface ExecutorResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output result for DB storage */
  outputResult: AgentExecutionOutputResult;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================================================
// Azure OpenAI Model Configuration
// ============================================================================

/**
 * Gets the Azure OpenAI model instance based on agent model selection.
 * Uses the same Azure OpenAI ecosystem as the Python agent.
 *
 * Secrets are read from files (production via Docker secrets) or env vars (development).
 * Required:
 * - AZURE_OPENAI_API_KEY: Azure OpenAI API key
 * - AZURE_OPENAI_ENDPOINT: Azure OpenAI endpoint URL (e.g., https://your-resource.openai.azure.com/)
 * Optional:
 * - AZURE_OPENAI_DEPLOYMENT: Deployment name for gpt-4o (defaults to "gpt-4o")
 * - AZURE_OPENAI_DEPLOYMENT_MINI: Deployment name for gpt-4o-mini (defaults to "gpt-4o-mini")
 */
function getModel(_modelId: Agent["model"]) {
  // Read secrets from files (production) or env vars (development)
  const apiKey = getSecret("AZURE_OPENAI_API_KEY");
  const endpoint = getSecret("AZURE_OPENAI_ENDPOINT");

  // Extract resource name from endpoint URL
  // Endpoint format: https://{resourceName}.openai.azure.com/
  const resourceNameMatch = endpoint.match(/https:\/\/([^.]+)\.openai\.azure\.com/);
  if (!resourceNameMatch) {
    throw new Error("Invalid Azure OpenAI endpoint format. Expected: https://{resourceName}.openai.azure.com/");
  }

  const azure = createAzure({
    resourceName: resourceNameMatch[1],
    apiKey,
  });

  // Use single deployment for all models (configured in Azure Key Vault)
  const deploymentName = getSecretOrDefault("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini");

  return azure(deploymentName);
}

// ============================================================================
// Gmail Email Sending
// ============================================================================

/**
 * Creates a MIME message for sending via Gmail API.
 */
function createMimeMessage(params: {
  from: string;
  to: string[];
  subject: string;
  body: string;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Sanitize email addresses to prevent header injection
  // Remove newlines, carriage returns, null bytes, and other control characters
  const sanitizeEmail = (email: string) =>
    email.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
  const sanitizedFrom = sanitizeEmail(params.from);
  const sanitizedTo = params.to.map(sanitizeEmail);
  // Sanitize subject - replace control characters with space
  const sanitizedSubject = params.subject
    .replace(/[\r\n\x00-\x1f\x7f]/g, " ")
    .trim();

  const headers = [
    `From: ${sanitizedFrom}`,
    `To: ${sanitizedTo.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(sanitizedSubject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
  ].join("\r\n");

  // Plain text version
  const plainText = params.body
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // HTML version
  const htmlBody = params.body.includes("<")
    ? params.body
    : `<p>${params.body.replace(/\n/g, "<br>")}</p>`;

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    plainText,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</body></html>`,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return headers + "\r\n" + body;
}

/**
 * Encodes the message for Gmail API (URL-safe base64).
 */
function encodeMessage(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sends an email via Gmail API using the user's connected Gmail account.
 */
async function sendGmailEmail(
  userId: string,
  to: string[],
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  // Get valid Gmail token for the user
  const tokenResult = await getValidGmailToken(userId);

  if (!tokenResult) {
    return {
      success: false,
      error: "Gmail not connected. Please connect your Gmail account to send emails.",
    };
  }

  const { accessToken, gmailEmail } = tokenResult;

  // Create MIME message
  const mimeMessage = createMimeMessage({
    from: gmailEmail,
    to,
    subject,
    body,
  });

  // Send via Gmail API
  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: encodeMessage(mimeMessage),
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error?.message || `Gmail API error: ${response.status}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email via Gmail",
    };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

interface AgentToolOptions {
  /** Email domain allowlist (null = allow all domains) */
  emailDomainAllowlist: string[] | null;
}

/**
 * Validates that all email recipients are from allowed domains.
 * Returns null if validation passes, or an error message if not.
 *
 * Note: Domains are normalized (trimmed, lowercased) when persisted to DB,
 * but we also handle it here as defense in depth.
 */
function validateEmailDomains(
  recipients: string[],
  allowlist: string[]
): string | null {
  // Normalize allowlist domains: trim whitespace and lowercase for comparison
  // (should already be normalized at persistence time, but handle it here too)
  const normalizedAllowlist = new Set(
    allowlist.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0)
  );

  if (normalizedAllowlist.size === 0) {
    // Empty allowlist after normalization means allow all
    return null;
  }

  const invalidRecipients: string[] = [];

  for (const email of recipients) {
    // Extract domain from email (everything after the @)
    const trimmedEmail = email.trim();
    const atIndex = trimmedEmail.lastIndexOf("@");
    if (atIndex === -1) {
      invalidRecipients.push(email);
      continue;
    }
    const domain = trimmedEmail.slice(atIndex + 1).toLowerCase().trim();
    if (!normalizedAllowlist.has(domain)) {
      invalidRecipients.push(email);
    }
  }

  if (invalidRecipients.length > 0) {
    return `Email recipients not in allowed domains: ${invalidRecipients.join(", ")}. Allowed domains: ${Array.from(normalizedAllowlist).join(", ")}`;
  }

  return null;
}

/**
 * Creates agent tools scoped to a specific user context.
 */
function createAgentTools(context: ExecutorContext, options: AgentToolOptions) {
  return {
    /**
     * Get meeting details by ID
     */
    getMeeting: tool({
      description: "Get details about a specific meeting by its ID",
      inputSchema: z.object({
        meetingId: z.string().describe("The meeting ID to look up"),
      }),
      execute: async (input) => {
        const { meetingId } = input;
        const meeting = await getMeetingById(meetingId);
        if (!meeting) {
          return { error: "Meeting not found" };
        }
        // Verify user has access to this meeting (is host)
        const isHost = await isMeetingHost(meetingId, context.userId);
        if (!isHost) {
          return { error: "Access denied: you do not have permission to view this meeting" };
        }
        return {
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          status: meeting.status,
          scheduledAt: meeting.scheduledAt,
          durationMinutes: meeting.durationMinutes,
          meetingGoal: meeting.meetingGoal,
        };
      },
    }),

    /**
     * List upcoming meetings for the user
     */
    listUpcomingMeetings: tool({
      description: "List the user's upcoming scheduled meetings",
      inputSchema: z.object({
        limit: z.number().optional().describe("Maximum number of meetings to return (default: 10)"),
      }),
      execute: async (input) => {
        const limit = input.limit ?? 10;
        const meetings = await listMeetingsForUser(
          { userId: context.userId, userEmail: context.userEmail },
          { status: "upcoming", limit }
        );
        return meetings.map((m) => ({
          id: m.id,
          title: m.title,
          scheduledAt: m.scheduledAt,
          durationMinutes: m.durationMinutes,
          status: m.status,
        }));
      },
    }),

    /**
     * List past meetings for the user
     */
    listPastMeetings: tool({
      description: "List the user's past meetings",
      inputSchema: z.object({
        limit: z.number().optional().describe("Maximum number of meetings to return (default: 10)"),
      }),
      execute: async (input) => {
        const limit = input.limit ?? 10;
        const meetings = await listMeetingsForUser(
          { userId: context.userId, userEmail: context.userEmail },
          { status: "past", limit }
        );
        return meetings.map((m) => ({
          id: m.id,
          title: m.title,
          scheduledAt: m.scheduledAt,
          endedAt: m.endedAt,
          status: m.status,
        }));
      },
    }),

    /**
     * Get meeting transcript
     */
    getMeetingTranscript: tool({
      description: "Get the transcript of a meeting. For very long meetings, the transcript may be truncated.",
      inputSchema: z.object({
        meetingId: z.string().describe("The meeting ID to get transcript for"),
      }),
      execute: async (input) => {
        const { meetingId } = input;
        // Verify user has access to this meeting (is host)
        const isHost = await isMeetingHost(meetingId, context.userId);
        if (!isHost) {
          return { error: "Access denied: you do not have permission to view this meeting's transcript" };
        }
        // Use DB-level limited query to avoid loading all rows into memory
        const { segments, totalCount, truncated: truncatedByDb } = await getMeetingTranscriptionLimited(
          meetingId,
          MAX_TRANSCRIPT_SEGMENTS
        );
        if (segments.length === 0) {
          return { error: "No transcript available for this meeting" };
        }
        // Format transcript as readable text
        let transcript = segments
          .map((s) => `[${s.speakerName}]: ${s.text}`)
          .join("\n");
        // Also limit by character count
        const truncatedBySize = transcript.length > MAX_TRANSCRIPT_SIZE;
        if (truncatedBySize) {
          transcript = transcript.slice(0, MAX_TRANSCRIPT_SIZE) + "\n\n[Transcript truncated due to size limits]";
        }
        return {
          meetingId,
          segmentCount: totalCount,
          includedSegments: segments.length,
          transcript,
          truncated: truncatedByDb || truncatedBySize,
        };
      },
    }),

    /**
     * Get team details
     */
    getTeam: tool({
      description: "Get details about a specific team by its ID. You must be a member of the team to view it.",
      inputSchema: z.object({
        teamId: z.string().describe("The team ID to look up"),
      }),
      execute: async (input) => {
        const { teamId } = input;
        // Verify user is a member of this team
        const isMember = await isTeamMember(teamId, context.userId);
        if (!isMember) {
          return { error: "Access denied: you are not a member of this team" };
        }
        const team = await getTeamWithMemberCount(teamId);
        if (!team) {
          return { error: "Team not found" };
        }
        return {
          id: team.id,
          name: team.name,
          description: team.description,
          memberCount: team.memberCount,
        };
      },
    }),

    /**
     * List team members
     */
    listTeamMembers: tool({
      description: "List all members of a specific team. You must be a member of the team to view its members.",
      inputSchema: z.object({
        teamId: z.string().describe("The team ID to list members for"),
      }),
      execute: async (input) => {
        const { teamId } = input;
        // Verify user is a member of this team
        const isMember = await isTeamMember(teamId, context.userId);
        if (!isMember) {
          return { error: "Access denied: you are not a member of this team" };
        }
        const members = await listTeamMembers(teamId);
        return members.map((m) => ({
          userId: m.userId,
          name: m.user?.name ?? "Unknown",
          email: m.user?.email ?? null,
          role: m.role,
          status: m.status,
        }));
      },
    }),

    /**
     * List user's teams
     */
    listMyTeams: tool({
      description: "List all teams the user is a member of",
      inputSchema: z.object({}),
      execute: async () => {
        const teams = await listTeamsForUser(context.userId);
        return teams.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          memberCount: t.memberCount,
        }));
      },
    }),

    /**
     * Send an email via Gmail
     */
    sendEmail: tool({
      description: "Send an email via Gmail to specified recipients. Use this to send meeting summaries, action items, or notifications. Requires the user to have connected their Gmail account.",
      inputSchema: z.object({
        to: z
          .array(z.string().email())
          .min(1, "At least one recipient is required")
          .max(50, "Maximum 50 recipients allowed")
          .describe("Array of recipient email addresses (1-50 recipients)"),
        subject: z.string().min(1, "Subject is required").max(998, "Subject too long").describe("Email subject line"),
        body: z.string().min(1, "Body is required").describe("Email body content (plain text or HTML)"),
      }),
      execute: async (input) => {
        const { to, subject, body } = input;

        // Validate recipients against domain allowlist (if configured)
        const allowlist = options.emailDomainAllowlist;
        if (allowlist && allowlist.length > 0) {
          const validationError = validateEmailDomains(to, allowlist);
          if (validationError) {
            return {
              success: false,
              error: validationError,
            };
          }
        }

        const result = await sendGmailEmail(context.userId, to, subject, body);

        if (result.success) {
          return {
            success: true,
            message: `Email sent via Gmail to ${to.length} recipient(s)`,
            recipients: to,
            messageId: result.messageId,
          };
        } else {
          return {
            success: false,
            error: result.error ?? "Failed to send email via Gmail",
          };
        }
      },
    }),
  };
}

// ============================================================================
// Executor
// ============================================================================

/**
 * Executes an agent with the given context.
 *
 * Uses Vercel AI SDK's generateText with tool calling to process
 * the agent's natural language instructions.
 */
export async function executeAgent(
  agent: Agent,
  execution: AgentExecution,
  context: ExecutorContext
): Promise<ExecutorResult> {
  const toolCalls: AgentToolCall[] = [];
  const emailsSent: AgentEmailSent[] = [];

  // Set up abort controller for timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, EXECUTION_TIMEOUT_MS);

  try {
    // Create tools scoped to this user context with agent options
    const tools = createAgentTools(context, {
      emailDomainAllowlist: agent.emailDomainAllowlist,
    });

    // Build the system prompt with context
    const systemPrompt = buildSystemPrompt(agent, context);

    // Execute with AI SDK (with timeout via AbortController)
    const result = await generateText({
      model: getModel(agent.model),
      system: systemPrompt,
      prompt: agent.instructions,
      tools,
      stopWhen: stepCountIs(10), // Allow up to 10 tool calls in sequence
      abortSignal: controller.signal,
    });

    // Extract tool calls from steps
    for (const step of result.steps) {
      // Get tool calls from step content
      const stepToolCalls = step.content.filter(
        (c): c is typeof c & { type: "tool-call" } => c.type === "tool-call"
      );
      const stepToolResults = step.content.filter(
        (c): c is typeof c & { type: "tool-result" } => c.type === "tool-result"
      );

      for (const tc of stepToolCalls) {
        const toolResult = stepToolResults.find((r) => r.toolCallId === tc.toolCallId);
        const toolCall: AgentToolCall = {
          name: tc.toolName,
          arguments: tc.input as Record<string, unknown>,
          result: toolResult?.output,
        };
        toolCalls.push(toolCall);

        // Track emails sent
        if (tc.toolName === "sendEmail" && toolCall.result) {
          const emailResult = toolCall.result as { success?: boolean; recipients?: string[] };
          if (emailResult.success && emailResult.recipients) {
            emailsSent.push({
              to: emailResult.recipients,
              subject: (tc.input as { subject?: string }).subject ?? "No subject",
            });
          }
        }
      }
    }

    // Extract token usage (AI SDK v6 uses inputTokens/outputTokens)
    const inputTokens = result.totalUsage?.inputTokens ?? 0;
    const outputTokens = result.totalUsage?.outputTokens ?? 0;
    const usage: AgentTokenUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };

    return {
      success: true,
      outputResult: {
        text: result.text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        emailsSent: emailsSent.length > 0 ? emailsSent : undefined,
      },
    };
  } catch (error) {
    console.error("Agent execution failed:", error);

    // Check if this was a timeout (abort) error
    let errorMessage: string;
    if (error instanceof Error && error.name === "AbortError") {
      errorMessage = `Execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds`;
    } else {
      errorMessage = error instanceof Error ? error.message : "Unknown execution error";
    }

    return {
      success: false,
      outputResult: {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      errorMessage,
    };
  } finally {
    // Always clear the timeout to prevent memory leaks
    clearTimeout(timeout);
  }
}

/**
 * Builds the system prompt for the agent execution.
 */
function buildSystemPrompt(agent: Agent, context: ExecutorContext): string {
  const parts = [
    "You are an AI assistant that helps automate meeting-related tasks.",
    "You have access to tools for retrieving meeting information, transcripts, team data, and sending emails.",
    "",
    "Current context:",
    `- User: ${context.userName} (${context.userEmail})`,
  ];

  // Add meeting context if provided
  if (context.meetingId) {
    parts.push(`- Current meeting ID: ${context.meetingId}`);
  }

  // Add folder context if provided
  if (context.folderId) {
    parts.push(`- Current folder ID: ${context.folderId}`);
  }

  // Add referenced entities from agent
  if (agent.referencedFolders && agent.referencedFolders.length > 0) {
    parts.push(`- Referenced folders: ${agent.referencedFolders.join(", ")}`);
  }

  if (agent.referencedTeams && agent.referencedTeams.length > 0) {
    parts.push(`- Referenced teams: ${agent.referencedTeams.join(", ")}`);
  }

  parts.push(
    "",
    "Guidelines:",
    "- Use the provided tools to gather information before taking action",
    "- When sending emails, ensure the content is professional and clear",
    "- Summarize meeting transcripts concisely when requested",
    "- Always confirm successful completion of tasks"
  );

  return parts.join("\n");
}
