/**
 * ICS Calendar File Generation
 *
 * Generates .ics files for meeting invitations that can be imported
 * into any calendar application (Google Calendar, Apple Calendar, Outlook, etc.)
 */

import type { Meeting } from "@/types/meeting";
import type { AgendaWithItems } from "@/types/agenda";
import {
  formatICSDatetime,
  formatAgendaForDescription,
  escapeICSText,
  ICS_LIMITS,
} from "./utils";

// ============================================================================
// Types
// ============================================================================

export interface ICSEventOptions {
  /** Organizer name */
  organizerName?: string;
  /** Organizer email */
  organizerEmail?: string;
  /** Location (defaults to meeting link) */
  location?: string;
}

/**
 * Generate a unique UID for the calendar event.
 * Includes timestamp to avoid collisions when meeting is re-exported.
 */
function generateUID(meetingId: string): string {
  return `${meetingId}@hedwiq.com`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate an ICS calendar file content for a meeting.
 *
 * @param meeting - The meeting to generate ICS for
 * @param agenda - Optional agenda to include in description
 * @param options - Additional options (organizer info, etc.)
 * @returns ICS file content as a string
 *
 * @example
 * const icsContent = generateICS(meeting, agenda, {
 *   organizerName: "John Smith",
 *   organizerEmail: "john@example.com",
 * });
 *
 * // Serve as downloadable file:
 * res.setHeader("Content-Type", "text/calendar");
 * res.setHeader("Content-Disposition", `attachment; filename="${meeting.title}.ics"`);
 * res.send(icsContent);
 */
export function generateICS(
  meeting: Meeting,
  agenda?: AgendaWithItems | null,
  options: ICSEventOptions = {}
): string {
  // Validate meeting has scheduled time
  if (!meeting.scheduledAt) {
    throw new Error("Cannot generate ICS for meeting without scheduled time");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const meetingLink = `${appUrl}/meetings/${meeting.roomId}`;

  // Calculate times
  const startTime = new Date(meeting.scheduledAt);
  const endTime = new Date(
    startTime.getTime() + (meeting.durationMinutes || 60) * 60 * 1000
  );
  const now = new Date();

  // Build description with agenda
  const agendaText = formatAgendaForDescription(agenda, {
    escapeNewlines: true,
    includeDescriptions: true,
  });
  const descriptionParts = [
    meeting.description || "",
    agendaText,
    `\\n\\nJoin Meeting: ${meetingLink}`,
  ].filter(Boolean);
  // Apply length limit to description to prevent oversized ICS files
  const description = escapeICSText(
    descriptionParts.join(""),
    ICS_LIMITS.MAX_DESCRIPTION_LENGTH
  );

  // Build ICS content with length limits applied
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hedwiq//Meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${generateUID(meeting.id)}`,
    `DTSTAMP:${formatICSDatetime(now)}`,
    `DTSTART:${formatICSDatetime(startTime)}`,
    `DTEND:${formatICSDatetime(endTime)}`,
    `SUMMARY:${escapeICSText(meeting.title, ICS_LIMITS.MAX_SUMMARY_LENGTH)}`,
    `DESCRIPTION:${description}`,
    `URL:${meetingLink}`,
    `LOCATION:${escapeICSText(options.location || meetingLink, ICS_LIMITS.MAX_LOCATION_LENGTH)}`,
  ];

  // Add organizer if provided
  if (options.organizerEmail) {
    const organizerName = options.organizerName || "Meeting Organizer";
    lines.push(
      `ORGANIZER;CN=${escapeICSText(organizerName, ICS_LIMITS.MAX_ORGANIZER_NAME_LENGTH)}:mailto:${options.organizerEmail}`
    );
  }

  // Add status and transparency
  lines.push("STATUS:CONFIRMED");
  lines.push("TRANSP:OPAQUE");

  // Close event and calendar
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  // ICS files use CRLF line endings
  return lines.join("\r\n");
}

/**
 * Generate ICS content as a data URL for direct download links.
 *
 * @param meeting - The meeting to generate ICS for
 * @param agenda - Optional agenda to include
 * @param options - Additional options
 * @returns Data URL that can be used in an anchor href
 *
 * @example
 * const dataUrl = generateICSDataUrl(meeting, agenda);
 * <a href={dataUrl} download={`${meeting.title}.ics`}>Download ICS</a>
 */
export function generateICSDataUrl(
  meeting: Meeting,
  agenda?: AgendaWithItems | null,
  options: ICSEventOptions = {}
): string {
  const icsContent = generateICS(meeting, agenda, options);
  const encoded = encodeURIComponent(icsContent);
  return `data:text/calendar;charset=utf-8,${encoded}`;
}

/**
 * Get the filename for an ICS file based on meeting title.
 */
export function getICSFilename(meeting: Meeting): string {
  // Sanitize title for filename
  const sanitized = meeting.title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50);

  return `${sanitized || "meeting"}.ics`;
}
