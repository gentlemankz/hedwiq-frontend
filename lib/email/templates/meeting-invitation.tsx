/**
 * Meeting Invitation Email Template
 *
 * Sent to invitees when they are invited to a meeting.
 * Includes meeting details, agenda, calendar links, and RSVP buttons.
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

export interface MeetingInvitationEmailProps {
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
  /** Scheduled date/time (ISO string) */
  scheduledAt: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Meeting room ID */
  roomId: string;
  /** Direct meeting link */
  meetingLink: string;
  /** Agenda items (optional) */
  agendaItems?: Array<{
    title: string;
    estimatedDuration?: number | null;
    description?: string | null;
  }>;
  /** Calendar links */
  calendarLinks: {
    google: string;
    outlook: string;
    ics: string;
  };
  /** RSVP links */
  rsvpLinks: {
    accept: string;
    decline: string;
    tentative: string;
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

const secondaryButton = {
  ...button,
  backgroundColor: "#f3f4f6",
  color: "#374151",
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

const agendaItem = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "12px 16px",
  marginBottom: "8px",
};

const agendaItemTitle = {
  color: "#1f2937",
  fontSize: "14px",
  fontWeight: "500",
  margin: "0",
};

const agendaItemDuration = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "4px 0 0",
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

export function MeetingInvitationEmail({
  inviteeName,
  hostName,
  hostEmail,
  meetingTitle,
  meetingDescription,
  scheduledAt,
  durationMinutes,
  roomId,
  meetingLink,
  agendaItems,
  calendarLinks,
  rsvpLinks,
  appUrl,
}: MeetingInvitationEmailProps) {
  const meetingDate = new Date(scheduledAt);
  const endTime = new Date(meetingDate.getTime() + durationMinutes * 60 * 1000);

  const formattedDate = format(meetingDate, "EEEE, MMMM d, yyyy");
  const formattedTime = `${format(meetingDate, "h:mm a")} - ${format(endTime, "h:mm a")}`;
  const greeting = inviteeName ? `Hi ${inviteeName}` : "Hi there";

  return (
    <Html>
      <Head />
      <Preview>
        {hostName} invited you to: {meetingTitle}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Heading style={heading}>You&apos;re invited to a meeting</Heading>

            <Text style={paragraph}>
              {greeting},
            </Text>
            <Text style={paragraph}>
              <strong>{hostName}</strong> ({hostEmail}) has invited you to join a
              meeting on Luframe.
            </Text>

            <Hr style={hr} />

            {/* Meeting Details */}
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
                  <Text style={detailLabel}>Date</Text>
                  <Text style={detailValue}>{formattedDate}</Text>
                </Column>
              </Row>

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>Time</Text>
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
                Join Meeting
              </Button>
            </Section>

            {/* Agenda */}
            {agendaItems && agendaItems.length > 0 && (
              <>
                <Text style={subheading}>Meeting Agenda</Text>
                {agendaItems.map((item, index) => (
                  <Section key={index} style={agendaItem}>
                    <Text style={agendaItemTitle}>
                      {index + 1}. {item.title}
                    </Text>
                    {item.estimatedDuration && (
                      <Text style={agendaItemDuration}>
                        {item.estimatedDuration} min
                      </Text>
                    )}
                    {item.description && (
                      <Text
                        style={{
                          ...agendaItemDuration,
                          color: "#4b5563",
                        }}
                      >
                        {item.description}
                      </Text>
                    )}
                  </Section>
                ))}
              </>
            )}

            <Hr style={hr} />

            {/* Add to Calendar */}
            <Text style={subheading}>Add to Calendar</Text>
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

            <Hr style={hr} />

            {/* RSVP */}
            <Text style={subheading}>Will you attend?</Text>
            <Section style={{ marginBottom: "24px" }}>
              <Button
                style={{
                  ...button,
                  backgroundColor: "#22c55e",
                  marginRight: "8px",
                }}
                href={rsvpLinks.accept}
              >
                Yes
              </Button>
              <Button
                style={{
                  ...button,
                  backgroundColor: "#f59e0b",
                  marginRight: "8px",
                }}
                href={rsvpLinks.tentative}
              >
                Maybe
              </Button>
              <Button
                style={{
                  ...button,
                  backgroundColor: "#ef4444",
                }}
                href={rsvpLinks.decline}
              >
                No
              </Button>
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
              This invitation was sent by{" "}
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

export default MeetingInvitationEmail;
