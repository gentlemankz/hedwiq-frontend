/**
 * Google Calendar API Client
 *
 * Handles creating, updating, and deleting Google Calendar events.
 * Uses the Google Calendar API v3.
 */

import { refreshAccessToken, calculateTokenExpiry } from "@/lib/google-oauth";
import {
  getCalendarIntegration,
  updateCalendarTokens,
  setCalendarIntegrationError,
} from "@/lib/db/calendar";
import type { CalendarProvider } from "@/types/calendar";

// ============================================================================
// Constants
// ============================================================================

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// ============================================================================
// Types
// ============================================================================

/**
 * Agenda item for calendar event description.
 */
export interface CalendarAgendaItem {
  title: string;
  estimatedDuration?: number | null;
}

/**
 * Input for creating a Google Calendar event.
 */
export interface CreateGoogleEventInput {
  /** Event title/summary */
  summary: string;
  /** Event description */
  description?: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Timezone (IANA format, e.g., "America/New_York") */
  timezone?: string;
  /** Meeting link to include in the event */
  meetingLink: string;
  /** Meeting room ID for reference */
  roomId: string;
  /** Agenda items to include in description */
  agendaItems?: CalendarAgendaItem[];
}

/**
 * Input for updating a Google Calendar event.
 */
export interface UpdateGoogleEventInput {
  /** Event title/summary */
  summary?: string;
  /** Event description */
  description?: string;
  /** Start time */
  startTime?: Date;
  /** End time */
  endTime?: Date;
  /** Timezone */
  timezone?: string;
}

/**
 * Google Calendar event response.
 */
export interface GoogleCalendarEvent {
  /** Event ID */
  id: string;
  /** HTML link to the event */
  htmlLink: string;
  /** Event summary/title */
  summary: string;
  /** Event status */
  status: string;
}

/**
 * Google Calendar API error response.
 */
interface GoogleApiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Gets a valid access token, refreshing if necessary.
 * Updates the database with new tokens if refreshed.
 */
async function getValidAccessToken(
  userId: string,
  provider: CalendarProvider = "google"
): Promise<{ accessToken: string; integrationId: string } | null> {
  const integration = await getCalendarIntegration(userId, provider);

  if (!integration || integration.status !== "connected") {
    return null;
  }

  // Check if token is still valid (with 5-minute buffer)
  const now = Date.now();
  const tokenExpiry = integration.tokenExpiresAt
    ? new Date(integration.tokenExpiresAt).getTime()
    : 0;
  const bufferMs = 5 * 60 * 1000;

  if (tokenExpiry - bufferMs > now) {
    // Token still valid
    return {
      accessToken: integration.accessToken!,
      integrationId: integration.id,
    };
  }

  // Token expired or expiring soon - refresh it
  if (!integration.refreshToken) {
    // Can't refresh without refresh token
    await setCalendarIntegrationError(
      integration.id,
      "Refresh token missing. Please reconnect your calendar."
    );
    return null;
  }

  try {
    const tokens = await refreshAccessToken(integration.refreshToken);
    const newExpiry = calculateTokenExpiry(tokens.expires_in);

    await updateCalendarTokens(integration.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: newExpiry,
    });

    return {
      accessToken: tokens.access_token,
      integrationId: integration.id,
    };
  } catch (error) {
    console.error("Failed to refresh calendar token:", error);
    await setCalendarIntegrationError(
      integration.id,
      "Failed to refresh access token. Please reconnect your calendar."
    );
    return null;
  }
}

// ============================================================================
// API Request Helper
// ============================================================================

/**
 * Makes an authenticated request to the Google Calendar API.
 */
async function calendarApiRequest<T>(
  accessToken: string,
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", body } = options;

  const response = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = (await response.json()) as GoogleApiError;
    throw new Error(
      `Google Calendar API error: ${errorData.error?.message || response.statusText}`
    );
  }

  // Handle 204 No Content (for DELETE requests)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// Event Operations
// ============================================================================

/**
 * Creates a Google Calendar event for a meeting.
 *
 * @param userId - User ID to get calendar integration for
 * @param input - Event creation parameters
 * @returns Created event info or null if failed
 */
export async function createGoogleCalendarEvent(
  userId: string,
  input: CreateGoogleEventInput
): Promise<{ event: GoogleCalendarEvent; integrationId: string } | null> {
  const tokenData = await getValidAccessToken(userId);
  if (!tokenData) {
    console.error("No valid calendar token for user:", userId);
    return null;
  }

  const { accessToken, integrationId } = tokenData;

  // Format agenda items if provided
  const agendaSection =
    input.agendaItems && input.agendaItems.length > 0
      ? [
          "",
          "Agenda:",
          ...input.agendaItems.map((item, index) => {
            const duration = item.estimatedDuration
              ? ` (${item.estimatedDuration} min)`
              : "";
            return `${index + 1}. ${item.title}${duration}`;
          }),
        ].join("\n")
      : "";

  // Build event description with meeting link and agenda
  const description = [
    input.description || "",
    agendaSection,
    "",
    "---",
    `Join Hedwiq Meeting: ${input.meetingLink}`,
    `Room ID: ${input.roomId}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const eventBody = {
    summary: input.summary,
    description,
    start: {
      dateTime: input.startTime.toISOString(),
      timeZone: input.timezone || "UTC",
    },
    end: {
      dateTime: input.endTime.toISOString(),
      timeZone: input.timezone || "UTC",
    },
    // Add meeting link as a source
    source: {
      title: "Hedwiq Meeting",
      url: input.meetingLink,
    },
    // Add transparency to show as busy
    transparency: "opaque",
    // Add reminder
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 10 },
        { method: "email", minutes: 30 },
      ],
    },
  };

  try {
    const event = await calendarApiRequest<GoogleCalendarEvent>(
      accessToken,
      "/calendars/primary/events",
      {
        method: "POST",
        body: eventBody,
      }
    );

    return { event, integrationId };
  } catch (error) {
    console.error("Failed to create Google Calendar event:", error);
    return null;
  }
}

/**
 * Updates a Google Calendar event.
 *
 * @param userId - User ID to get calendar integration for
 * @param eventId - Google Calendar event ID
 * @param input - Update parameters
 * @returns Updated event info or null if failed
 */
export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  input: UpdateGoogleEventInput
): Promise<GoogleCalendarEvent | null> {
  const tokenData = await getValidAccessToken(userId);
  if (!tokenData) {
    console.error("No valid calendar token for user:", userId);
    return null;
  }

  const { accessToken } = tokenData;

  // Build update body with only provided fields
  const updateBody: Record<string, unknown> = {};

  if (input.summary !== undefined) {
    updateBody.summary = input.summary;
  }

  if (input.description !== undefined) {
    updateBody.description = input.description;
  }

  if (input.startTime !== undefined) {
    updateBody.start = {
      dateTime: input.startTime.toISOString(),
      timeZone: input.timezone || "UTC",
    };
  }

  if (input.endTime !== undefined) {
    updateBody.end = {
      dateTime: input.endTime.toISOString(),
      timeZone: input.timezone || "UTC",
    };
  }

  try {
    const event = await calendarApiRequest<GoogleCalendarEvent>(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: updateBody,
      }
    );

    return event;
  } catch (error) {
    console.error("Failed to update Google Calendar event:", error);
    return null;
  }
}

/**
 * Deletes a Google Calendar event.
 *
 * @param userId - User ID to get calendar integration for
 * @param eventId - Google Calendar event ID
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  const tokenData = await getValidAccessToken(userId);
  if (!tokenData) {
    console.error("No valid calendar token for user:", userId);
    return false;
  }

  const { accessToken } = tokenData;

  try {
    await calendarApiRequest(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
      }
    );

    return true;
  } catch (error) {
    // If event is already deleted (404), consider it a success
    if (error instanceof Error && error.message.includes("404")) {
      return true;
    }
    console.error("Failed to delete Google Calendar event:", error);
    return false;
  }
}

/**
 * Checks if a user has a connected and valid calendar integration.
 *
 * @param userId - User ID to check
 * @returns true if user can sync to calendar
 */
export async function canSyncToCalendar(userId: string): Promise<boolean> {
  const integration = await getCalendarIntegration(userId, "google");
  return integration?.status === "connected";
}
