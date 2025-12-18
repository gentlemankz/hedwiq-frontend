/**
 * Team Invitation Email Template
 *
 * Sent to users when they are invited to join a team.
 * Includes team details, inviter info, and accept/decline buttons.
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
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type TeamRole } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

export interface TeamInvitationEmailProps {
  /** Invitee's name (optional) */
  inviteeName?: string;
  /** Inviter's name */
  inviterName: string;
  /** Inviter's email */
  inviterEmail: string;
  /** Team name */
  teamName: string;
  /** Team description (optional) */
  teamDescription?: string;
  /** Team color (optional) */
  teamColor?: string;
  /** Role being assigned */
  role: TeamRole;
  /** Number of current team members */
  memberCount: number;
  /** Link to accept invitation (dashboard URL) */
  acceptLink: string;
  /** Link to decline invitation */
  declineLink: string;
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
  marginRight: "12px",
};

const declineButton = {
  backgroundColor: "#f3f4f6",
  borderRadius: "6px",
  color: "#374151",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
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

// NOTE: Using shared ROLE_LABELS and ROLE_DESCRIPTIONS from types/team.ts

// ============================================================================
// Component
// ============================================================================

export function TeamInvitationEmail({
  inviteeName,
  inviterName,
  inviterEmail,
  teamName,
  teamDescription,
  teamColor,
  role,
  memberCount,
  acceptLink,
  declineLink,
  appUrl,
}: TeamInvitationEmailProps) {
  const greeting = inviteeName ? `Hi ${inviteeName}` : "Hi there";
  const roleLabel = ROLE_LABELS[role] || "Member";
  const roleDescription = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.member;

  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {teamName} on Hedwiq
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Heading style={heading}>You&apos;re invited to join a team</Heading>

            <Text style={paragraph}>{greeting},</Text>
            <Text style={paragraph}>
              <strong>{inviterName}</strong> ({inviterEmail}) has invited you to
              join their team on Hedwiq.
            </Text>

            <Hr style={hr} />

            {/* Team Details */}
            <Section
              style={{
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                padding: "20px",
                marginBottom: "24px",
              }}
            >
              <Row style={{ marginBottom: "16px" }}>
                <Column>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    {teamColor && (
                      <div
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: teamColor,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Text
                      style={{
                        color: "#1f2937",
                        fontSize: "18px",
                        fontWeight: "600",
                        margin: "0",
                      }}
                    >
                      {teamName}
                    </Text>
                  </div>
                </Column>
              </Row>

              {teamDescription && (
                <Row style={detailRow}>
                  <Column>
                    <Text style={detailLabel}>Description</Text>
                    <Text style={{ ...detailValue, fontWeight: "400" }}>
                      {teamDescription}
                    </Text>
                  </Column>
                </Row>
              )}

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>Your Role</Text>
                  <Text style={detailValue}>{roleLabel}</Text>
                  <Text
                    style={{
                      color: "#6b7280",
                      fontSize: "12px",
                      margin: "4px 0 0",
                    }}
                  >
                    {roleDescription}
                  </Text>
                </Column>
              </Row>

              <Row style={detailRow}>
                <Column>
                  <Text style={detailLabel}>Current Members</Text>
                  <Text style={detailValue}>
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* Action Buttons */}
            <Section style={{ textAlign: "center", marginBottom: "24px" }}>
              <Button style={button} href={acceptLink}>
                Accept Invitation
              </Button>
              <Button style={declineButton} href={declineLink}>
                Decline
              </Button>
            </Section>

            <Hr style={hr} />

            {/* Benefits Section */}
            <Text
              style={{
                color: "#374151",
                fontSize: "14px",
                fontWeight: "600",
                marginBottom: "12px",
              }}
            >
              What you can do as a team member:
            </Text>
            <Text style={{ ...paragraph, paddingLeft: "16px" }}>
              • Collaborate with team members in meetings
            </Text>
            <Text style={{ ...paragraph, paddingLeft: "16px" }}>
              • Quickly invite the entire team to meetings
            </Text>
            <Text style={{ ...paragraph, paddingLeft: "16px" }}>
              • Stay organized with your team&apos;s shared workspace
            </Text>

            {/* Footer */}
            <Hr style={hr} />
            <Text style={footer}>
              This invitation was sent by{" "}
              <Link href={`mailto:${inviterEmail}`} style={link}>
                {inviterEmail}
              </Link>
            </Text>
            <Text style={footer}>
              If you don&apos;t want to join this team, you can safely ignore
              this email.
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

export default TeamInvitationEmail;
