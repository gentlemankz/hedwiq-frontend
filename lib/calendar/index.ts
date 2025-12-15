/**
 * Calendar utilities for generating ICS files and "Add to Calendar" links.
 *
 * @example
 * import { generateICS, generateCalendarLinks } from "@/lib/calendar";
 *
 * // Generate ICS file content
 * const icsContent = generateICS(meeting, agenda);
 *
 * // Generate "Add to Calendar" links
 * const links = generateCalendarLinks(meeting, agenda);
 */

export {
  generateICS,
  generateICSDataUrl,
  getICSFilename,
  type ICSEventOptions,
} from "./ics";

export {
  generateCalendarLinks,
  generateEmailCalendarLinks,
  type CalendarLinks,
} from "./links";

export {
  formatICSDatetime,
  formatAgendaForDescription,
  escapeICSText,
  truncateText,
  ICS_LIMITS,
} from "./utils";
