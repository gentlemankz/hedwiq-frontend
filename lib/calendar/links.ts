/**
 * Calendar Links Generation
 *
 * Generates "Add to Calendar" links for various calendar providers.
 * These links open the calendar app with the event pre-filled.
 */

import type { Meeting } from "@/types/meeting";
import type { AgendaWithItems } from "@/types/agenda";
import { formatICSDatetime, formatAgendaForDescription } from "./utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Calendar links for different providers.
 */
export interface CalendarLinks {
  /** Google Calendar add event link */
  google: string;
  /** Outlook.com (personal) add event link */
  outlook: string;
  /** Office 365 (work/school) add event link */
  office365: string;
  /** Yahoo Calendar add event link */
  yahoo: string;
  /** ICS file download endpoint */
  ics: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build full description with meeting link and agenda.
 */
function buildDescription(
  meeting: Meeting,
  meetingLink: string,
  agenda?: AgendaWithItems | null
): string {
  const agendaText = formatAgendaForDescription(agenda, {
    escapeNewlines: false,
    includeDescriptions: false,
  });
  const parts = [
    meeting.description || "",
    agendaText,
    `\n\nJoin Meeting: ${meetingLink}`,
  ].filter(Boolean);

  return parts.join("");
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate "Add to Calendar" links for a meeting.
 *
 * @param meeting - The meeting to generate links for
 * @param agenda - Optional agenda to include in description
 * @returns Object with links for each calendar provider
 *
 * @example
 * const links = generateCalendarLinks(meeting, agenda);
 *
 * <a href={links.google} target="_blank">Add to Google Calendar</a>
 * <a href={links.outlook} target="_blank">Add to Outlook</a>
 * <a href={links.ics} download>Download ICS</a>
 */
export function generateCalendarLinks(
  meeting: Meeting,
  agenda?: AgendaWithItems | null
): CalendarLinks {
  // Validate meeting has scheduled time
  if (!meeting.scheduledAt) {
    throw new Error("Cannot generate calendar links for meeting without scheduled time");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const meetingLink = `${appUrl}/meetings/${meeting.roomId}`;

  // Calculate times
  const startTime = new Date(meeting.scheduledAt);
  const endTime = new Date(
    startTime.getTime() + (meeting.durationMinutes || 60) * 60 * 1000
  );

  const description = buildDescription(meeting, meetingLink, agenda);

  // Google Calendar
  // https://calendar.google.com/calendar/render?action=TEMPLATE&...
  const googleParams = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${formatICSDatetime(startTime)}/${formatICSDatetime(endTime)}`,
    details: description,
    location: meetingLink,
  });
  const googleLink = `https://calendar.google.com/calendar/render?${googleParams}`;

  // Outlook.com (personal Microsoft accounts)
  // https://outlook.live.com/calendar/0/deeplink/compose?...
  const outlookParams = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: meeting.title,
    startdt: startTime.toISOString(),
    enddt: endTime.toISOString(),
    body: description.replace(/\n/g, "<br>"),
    location: meetingLink,
  });
  const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams}`;

  // Office 365 (work/school accounts)
  // https://outlook.office.com/calendar/0/deeplink/compose?...
  const office365Link = `https://outlook.office.com/calendar/0/deeplink/compose?${outlookParams}`;

  // Yahoo Calendar
  // https://calendar.yahoo.com/?v=60&...
  const durationMinutes = meeting.durationMinutes || 60;
  const durationHours = Math.floor(durationMinutes / 60);
  const durationMins = durationMinutes % 60;
  const yahooParams = new URLSearchParams({
    v: "60",
    title: meeting.title,
    st: formatICSDatetime(startTime),
    dur: `${durationHours.toString().padStart(2, "0")}${durationMins.toString().padStart(2, "0")}`,
    desc: description,
    in_loc: meetingLink,
  });
  const yahooLink = `https://calendar.yahoo.com/?${yahooParams}`;

  // ICS download endpoint
  const icsLink = `${appUrl}/api/meetings/${meeting.id}/calendar.ics`;

  return {
    google: googleLink,
    outlook: outlookLink,
    office365: office365Link,
    yahoo: yahooLink,
    ics: icsLink,
  };
}

/**
 * Generate calendar links for use in email templates.
 * Returns simplified links suitable for HTML emails.
 *
 * @param meeting - The meeting to generate links for
 * @param agenda - Optional agenda to include
 * @returns Object with Google Calendar link and ICS download link
 */
export function generateEmailCalendarLinks(
  meeting: Meeting,
  agenda?: AgendaWithItems | null
): Pick<CalendarLinks, "google" | "outlook" | "ics"> {
  const links = generateCalendarLinks(meeting, agenda);
  return {
    google: links.google,
    outlook: links.outlook,
    ics: links.ics,
  };
}
