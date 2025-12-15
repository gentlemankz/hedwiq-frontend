/**
 * Meeting Cancelled Email Template
 *
 * Sent to invitees when a meeting they're invited to has been cancelled.
 */

import {
  Body,
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

export interface MeetingCancelledEmailProps {
  /** Invitee's name (optional) */
  inviteeName?: string;
  /** Host's name */
  hostName: string;
  /** Host's email */
  hostEmail: string;
  /** Meeting title */
  meetingTitle: string;
  /** Original scheduled date/time (ISO string) */
  scheduledAt: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Cancellation reason (optional) */
  cancellationReason?: string;
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
  color: "#dc2626",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.25",
  marginBottom: "24px",
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
  textDecoration: "line-through",
};

const cancelledBox = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  marginBottom: "24px",
  borderLeft: "4px solid #dc2626",
};

const reasonBox = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
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

export function MeetingCancelledEmail({
  inviteeName,
  hostName,
  hostEmail,
  meetingTitle,
  scheduledAt,
  durationMinutes,
  cancellationReason,
  appUrl,
}: MeetingCancelledEmailProps) {
  const meetingDate = new Date(scheduledAt);
  const endTime = new Date(meetingDate.getTime() + durationMinutes * 60 * 1000);

  const formattedDate = format(meetingDate, "EEEE, MMMM d, yyyy");
  const formattedTime = `${format(meetingDate, "h:mm a")} - ${format(endTime, "h:mm a")}`;
  const greeting = inviteeName ? `Hi ${inviteeName}` : "Hi there";

  return (
    <Html>
      <Head />
      <Preview>{meetingTitle} has been cancelled</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Heading style={heading}>Meeting Cancelled</Heading>

            <Text style={paragraph}>{greeting},</Text>
            <Text style={paragraph}>
              <strong>{hostName}</strong> has cancelled the following meeting:
            </Text>

            <Hr style={hr} />

            {/* Cancelled Meeting Details */}
            <Section style={cancelledBox}>
              <Text
                style={{
                  color: "#991b1b",
                  fontSize: "18px",
                  fontWeight: "600",
                  margin: "0 0 16px",
                  textDecoration: "line-through",
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
            </Section>

            {/* Cancellation Reason */}
            {cancellationReason && (
              <Section style={reasonBox}>
                <Text
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "600",
                    margin: "0 0 8px",
                  }}
                >
                  Reason for cancellation:
                </Text>
                <Text
                  style={{
                    color: "#4b5563",
                    fontSize: "14px",
                    margin: "0",
                    fontStyle: "italic",
                  }}
                >
                  {cancellationReason}
                </Text>
              </Section>
            )}

            {/* Info text */}
            <Text style={{ ...paragraph, color: "#6b7280", fontSize: "13px" }}>
              Please remove this meeting from your calendar if you added it
              previously. No further action is required from you.
            </Text>

            {/* Footer */}
            <Hr style={hr} />
            <Text style={footer}>
              This cancellation notice was sent by{" "}
              <Link href={`mailto:${hostEmail}`} style={link}>
                {hostEmail}
              </Link>
            </Text>
            <Text style={footer}>
              Powered by{" "}
              <Link href={appUrl} style={link}>
                Hedwiq
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MeetingCancelledEmail;
