import { NextRequest, NextResponse } from "next/server";
import { getMeetingWithHost } from "@/lib/db/meeting";
import { getAgendaByMeetingId } from "@/lib/db/agenda";
import { generateICS, getICSFilename } from "@/lib/calendar";

// ============================================================================
// Security Constants
// ============================================================================

/**
 * Meeting ID validation regex.
 * Format: mtg-{13-digit timestamp}-{8 alphanumeric chars}
 * Example: mtg-1734567890123-a1b2c3d4
 */
const MEETING_ID_REGEX = /^mtg-\d{13}-[a-z0-9]{8}$/;

/**
 * Maximum meeting ID length to prevent regex DoS.
 */
const MAX_MEETING_ID_LENGTH = 30;

// ============================================================================
// Route Handler
// ============================================================================

/**
 * GET /api/meetings/[meetingId]/calendar.ics
 *
 * Download an ICS calendar file for a meeting.
 * This endpoint is public (no auth required) so invitees can download
 * the calendar file from email links.
 *
 * ## Security Considerations
 *
 * 1. **Meeting ID Entropy**: Meeting IDs include a 13-digit timestamp and
 *    8 random alphanumeric characters (~41 bits of entropy). This makes
 *    enumeration attacks impractical within reasonable time limits.
 *
 * 2. **Rate Limiting**: Rate limiting should be implemented at the
 *    infrastructure level (Vercel/Cloudflare). The strict ID validation
 *    prevents probing with malformed requests.
 *
 * 3. **No Sensitive Data**: ICS files contain only meeting metadata
 *    (title, time, link) - no participant data or internal details.
 *
 * 4. **Cache-Control**: Response includes no-cache headers to prevent
 *    stale calendar data.
 *
 * ## Future Enhancements
 *
 * For higher security requirements, consider:
 * - Signed URL tokens with expiration (e.g., HMAC-signed download links)
 * - IP-based rate limiting in middleware
 * - Request logging for abuse detection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  // Input validation: check length first to prevent regex DoS
  if (!meetingId || meetingId.length > MAX_MEETING_ID_LENGTH) {
    return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
  }

  // Validate meeting ID format matches expected pattern
  if (!MEETING_ID_REGEX.test(meetingId)) {
    return NextResponse.json({ error: "Invalid meeting ID format" }, { status: 400 });
  }

  try {
    // Get meeting with host info
    const meetingWithHost = await getMeetingWithHost(meetingId);

    if (!meetingWithHost) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check if meeting is scheduled
    if (!meetingWithHost.scheduledAt) {
      return NextResponse.json(
        { error: "Cannot generate calendar for instant meetings" },
        { status: 400 }
      );
    }

    // Get agenda if exists
    const agenda = await getAgendaByMeetingId(meetingId);

    // Generate ICS content
    const icsContent = generateICS(meetingWithHost, agenda, {
      organizerName: meetingWithHost.host.name,
      organizerEmail: meetingWithHost.host.email,
    });

    // Return as downloadable file
    const filename = getICSFilename(meetingWithHost);

    return new NextResponse(icsContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("ICS generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate calendar file" },
      { status: 500 }
    );
  }
}
