/**
 * Meeting Updated Email Template
 *
 * Sent to invitees when a meeting they're invited to has been rescheduled or updated.
 * Includes updated meeting details, what changed, and calendar links.
 */

import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { format } from "date-fns";

// ============================================================================
// Types
// ============================================================================

export interface MeetingUpdatedEmailProps {
  /** Invitee's name (optional) */
  inviteeName?: string;
  /** Host's name */
  hostName: string;
  /** Host's email */
  hostEmail: string;
  /** Meeting title */
  meetingTitle: string;
  /** Meeting description (optional) */
  meetingDescription?: string;
  /** New scheduled date/time (ISO string) */
  scheduledAt: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Direct meeting link */
  meetingLink: string;
  /** What changed in the meeting */
  changes: {
    /** Previous scheduled time (if rescheduled) */
    previousScheduledAt?: string;
    /** Previous duration (if changed) */
    previousDurationMinutes?: number;
    /** Previous title (if changed) */
    previousTitle?: string;
    /** Whether this is just a reschedule */
    isReschedule: boolean;
  };
  /** Calendar links */
  calendarLinks: {
    google: string;
    outlook: string;
    ics: string;
  };
  /** App URL */
  appUrl: string;
}

// ============================================================================
// Styles
// ============================================================================

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  borderRadius: "8px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
};

const box = {
  padding: "0 48px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const heading = {
  color: "#1f2937",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.25",
  marginBottom: "24px",
};

const subheading = {
  color: "#374151",
  fontSize: "16px",
  fontWeight: "600",
  marginTop: "24px",
  marginBottom: "12px",
};

const paragraph = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const detailRow = {
  marginBottom: "8px",
};

const detailLabel = {
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: "500",
  marginBottom: "2px",
};

const detailValue = {
  color: "#1f2937",
  fontSize: "14px",
  fontWeight: "500",
};

const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
  marginRight: "8px",
};

const outlineButton = {
  backgroundColor: "transparent",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  color: "#374151",
  fontSize: "13px",
  fontWeight: "500",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "8px 16px",
  marginRight: "8px",
  marginBottom: "8px",
};

const changeBox = {
  backgroundColor: "#fef3c7",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
  borderLeft: "4px solid #f59e0b",
};

const strikethrough = {
  textDecoration: "line-through",
  color: "#9ca3af",
};

const footer = {
  color: "#6b7280",
  fontSize: "12px",
  lineHeight: "20px",
  marginTop: "32px",
};

const link = {
  color: "#2563eb",
  textDecoration: "underline",
};

// ============================================================================
// Component
// ============================================================================

export function MeetingUpdatedEmail({
  inviteeName,
  hostName,
  hostEmail,
  meetingTitle,
  meetingDescription,
  scheduledAt,
  durationMinutes,
  meetingLink,
  changes,
  calendarLinks,
  appUrl,
}: MeetingUpdatedEmailProps) {
  const meetingDate = new Date(scheduledAt);
  const endTime = new Date(meetingDate.getTime() + durationMinutes * 60 * 1000);

  const formattedDate = format(meetingDate, "EEEE, MMMM d, yyyy");
  const formattedTime = `${format(meetingDate, "h:mm a")} - ${format(endTime, "h:mm a")}`;
  const greeting = inviteeName ? `Hi ${inviteeName}` : "Hi there";

  const previousDate = changes.previousScheduledAt
    ? new Date(changes.previousScheduledAt)
    : null;
  const previousFormattedDate = previousDate
    ? format(previousDate, "EEEE, MMMM d, yyyy")
    : null;
  const previousFormattedTime = previousDate
    ? format(previousDate, "h:mm a")
    : null;

  const headerText = changes.isReschedule
    ? "Meeting has been rescheduled"
    : "Meeting has been updated";

  return (
    <Html>
      <Head />
      <Preview>
        {meetingTitle} has been {changes.isReschedule ? "rescheduled" : "updated"}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Heading style={heading}>{headerText}</Heading>

            <Text style={paragraph}>{greeting},</Text>
            <Text style={paragraph}>
              <strong>{hostName}</strong> has{" "}
              {changes.isReschedule ? "rescheduled" : "updated"} the following
              meeting:
            </Text>

            {/* What Changed */}
            <Section style={changeBox}>
              <Text
                style={{
                  color: "#92400e",
                  fontSize: "14px",
                  fontWeight: "600",
                  margin: "0 0 8px",
                }}
              >
                What changed:
              </Text>
              {changes.previousScheduledAt && (
                <Text style={{ color: "#92400e", fontSize: "13px", margin: "4px 0" }}>
                  Time:{" "}
                  <span style={strikethrough}>
                    {previousFormattedDate} at {previousFormattedTime}
                  </span>{" "}
                  &rarr; {formattedDate} at {format(meetingDate, "h:mm a")}
                </Text>
              )}
              {changes.previousTitle && changes.previousTitle !== meetingTitle && (
                <Text style={{ color: "#92400e", fontSize: "13px", margin: "4px 0" }}>
                  Title:{" "}
                  <span style={strikethrough}>{changes.previousTitle}</span>{" "}
                  &rarr; {meetingTitle}
                </Text>
              )}
              {changes.previousDurationMinutes &&
                changes.previousDurationMinutes !== durationMinutes && (
                  <Text style={{ color: "#92400e", fontSize: "13px", margin: "4px 0" }}>
                    Duration:{" "}
                    <span style={strikethrough}>
                      {changes.previousDurationMinutes} min
                    </span>{" "}
                    &rarr; {durationMinutes} min
                  </Text>
                )}
            </Section>

            <Hr style={hr} />

            {/* Updated Meeting Details */}
            <Section
              style={{
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                padding: "20px",
                marginBottom: "24px",
              }}
            >
              <Text
                style={{
                  color: "#1f2937",
                  fontSize: "18px",
                  fontWeight: "600",
                  margin: "0 0 16px",
                }}
              >
                {meetingTitle}
              </Text>

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>New Date</Text>
                  <Text style={detailValue}>{formattedDate}</Text>
                </Column>
              </Row>

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>New Time</Text>
                  <Text style={detailValue}>{formattedTime}</Text>
                </Column>
              </Row>

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>Duration</Text>
                  <Text style={detailValue}>
                    {durationMinutes >= 60
                      ? `${Math.floor(durationMinutes / 60)} hour${Math.floor(durationMinutes / 60) > 1 ? "s" : ""}${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60} min` : ""}`
                      : `${durationMinutes} minutes`}
                  </Text>
                </Column>
              </Row>

              {meetingDescription && (
                <Row style={{ marginTop: "12px" }}>
                  <Column>
                    <Text style={detailLabel}>Description</Text>
                    <Text style={{ ...detailValue, fontWeight: "400" }}>
                      {meetingDescription}
                    </Text>
                  </Column>
                </Row>
              )}
            </Section>

            {/* Join Meeting Button */}
            <Section style={{ textAlign: "center", marginBottom: "24px" }}>
              <Button style={button} href={meetingLink}>
                View Meeting
              </Button>
            </Section>

            <Hr style={hr} />

            {/* Update Calendar */}
            <Text style={subheading}>Update Your Calendar</Text>
            <Text style={{ ...paragraph, fontSize: "13px" }}>
              Please update your calendar with the new meeting time:
            </Text>
            <Section style={{ marginBottom: "24px" }}>
              <Link style={outlineButton} href={calendarLinks.google}>
                Google Calendar
              </Link>
              <Link style={outlineButton} href={calendarLinks.outlook}>
                Outlook
              </Link>
              <Link style={outlineButton} href={calendarLinks.ics}>
                Download .ics
              </Link>
            </Section>

            {/* Footer */}
            <Hr style={hr} />
            <Text style={footer}>
              Meeting link:{" "}
              <Link href={meetingLink} style={link}>
                {meetingLink}
              </Link>
            </Text>
            <Text style={footer}>
              This update was sent by{" "}
              <Link href={`mailto:${hostEmail}`} style={link}>
                {hostEmail}
              </Link>
            </Text>
            <Text style={footer}>
              Powered by{" "}
              <Link href={appUrl} style={link}>
                Luframe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MeetingUpdatedEmail;
