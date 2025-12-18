/**
 * Team Types for Hedwiq Frontend
 *
 * These types support the Team Workspace feature for organizing users
 * into collaborative groups with hierarchical sub-teams.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Team roles with increasing privileges.
 * - member: View team, see members, invite team to meetings
 * - admin: Manage members, create sub-teams, edit team
 * - owner: Full control, delete team, transfer ownership
 */
export type TeamRole = "owner" | "admin" | "member";

/**
 * Team membership status.
 * - pending: Invited but not yet accepted
 * - active: Accepted and participating
 * - left: User left or was removed
 */
export type TeamMemberStatus = "pending" | "active" | "left";

/**
 * A team record from the database.
 */
export interface Team {
  /** Unique team identifier (e.g., team-{creatorId}-{timestamp}) */
  id: string;
  /** Team name (3-50 chars) */
  name: string;
  /** Optional team description */
  description: string | null;
  /** Optional hex color for UI display */
  color: string | null;
  /** Optional icon identifier */
  icon: string | null;
  /** Parent team ID for sub-team hierarchy (null for root teams) */
  parentTeamId: string | null;
  /** User ID who created the team */
  createdBy: string;
  /** Display order within parent */
  orderIndex: number;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Last update timestamp (ISO string) */
  updatedAt: string;
}

/**
 * A team member record from the database.
 */
export interface TeamMember {
  /** Unique membership identifier */
  id: string;
  /** Team ID */
  teamId: string;
  /** User ID */
  userId: string;
  /** Member role: owner, admin, member */
  role: TeamRole;
  /** User ID who sent the invitation (null if inviter was deleted) */
  invitedBy: string | null;
  /** When the invitation was sent (ISO string) */
  invitedAt: string;
  /** When the user accepted/joined (ISO string, null if pending) */
  joinedAt: string | null;
  /** Membership status */
  status: TeamMemberStatus;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Last update timestamp (ISO string) */
  updatedAt: string;
}

/**
 * Team with member count for list views.
 */
export interface TeamWithMemberCount extends Team {
  /** Number of active members */
  memberCount: number;
}

/**
 * Team member with user details for display.
 */
export interface TeamMemberWithUser extends TeamMember {
  /** User details */
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  /** Inviter details */
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Team with full member details.
 */
export interface TeamWithMembers extends Team {
  /** Team members with user info */
  members: TeamMemberWithUser[];
}

/**
 * Team with sub-teams for hierarchy display.
 */
export interface TeamWithSubteams extends TeamWithMemberCount {
  /** Sub-teams */
  subteams: TeamWithSubteams[];
}

/**
 * Hierarchical team structure for sidebar.
 */
export interface TeamHierarchy {
  /** Root level teams */
  teams: TeamWithSubteams[];
}

/**
 * Team meeting invitation record.
 */
export interface TeamMeetingInvite {
  /** Unique identifier */
  id: string;
  /** Team ID */
  teamId: string;
  /** Meeting ID */
  meetingId: string;
  /** User ID who invited the team (null if inviter was deleted) */
  invitedBy: string | null;
  /** When the team was invited (ISO string) */
  invitedAt: string;
  /** Creation timestamp (ISO string) */
  createdAt: string;
}

/**
 * Team meeting invite with team details for display.
 */
export interface TeamMeetingInviteWithTeam extends TeamMeetingInvite {
  /** Team details */
  team: TeamWithMemberCount;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating a team.
 */
export interface CreateTeamRequest {
  /** Team name (3-50 chars) */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional hex color */
  color?: string;
  /** Optional icon identifier */
  icon?: string;
  /** Parent team ID for creating sub-teams */
  parentTeamId?: string;
}

/**
 * Response from creating a team.
 */
export interface CreateTeamResponse {
  team: Team;
  /** Membership record for the creator (owner) */
  membership: TeamMember;
}

/**
 * Request body for updating a team.
 */
export interface UpdateTeamRequest {
  /** Team name */
  name?: string;
  /** Team description */
  description?: string | null;
  /** Hex color */
  color?: string | null;
  /** Icon identifier */
  icon?: string | null;
}

/**
 * Response from updating a team.
 */
export interface UpdateTeamResponse {
  team: Team;
}

/**
 * Response from getting a single team.
 */
export interface GetTeamResponse {
  team: TeamWithMembers | null;
}

/**
 * Response from listing teams.
 */
export interface ListTeamsResponse {
  teams: TeamWithMemberCount[];
}

/**
 * Response from getting team hierarchy.
 */
export interface GetTeamHierarchyResponse {
  hierarchy: TeamHierarchy;
}

/**
 * Request body for reordering teams.
 */
export interface ReorderTeamsRequest {
  /** Array of team IDs in desired order */
  teamIds: string[];
  /** Parent team ID (null for root level) */
  parentTeamId?: string | null;
}

/**
 * Response from reordering teams.
 */
export interface ReorderTeamsResponse {
  success: boolean;
}

/**
 * Response from deleting a team.
 */
export interface DeleteTeamResponse {
  success: boolean;
  /** Number of sub-teams also deleted */
  subteamsDeleted: number;
}

// ============================================================================
// Team Member API Types
// ============================================================================

/**
 * Request body for inviting members to a team.
 * Can invite by email or userId.
 */
export interface InviteMembersRequest {
  /** Array of email addresses or user IDs */
  invites: Array<{
    email?: string;
    userId?: string;
  }>;
  /** Role for new members (default: member) */
  role?: TeamRole;
}

/**
 * Response from inviting members.
 */
export interface InviteMembersResponse {
  /** Successfully created invitations */
  invited: TeamMember[];
  /** Emails/userIds that failed */
  failed: Array<{
    identifier: string;
    reason: string;
  }>;
}

/**
 * Request body for updating a member's role.
 */
export interface UpdateMemberRoleRequest {
  role: TeamRole;
}

/**
 * Response from updating a member.
 */
export interface UpdateMemberResponse {
  member: TeamMember;
}

/**
 * Response from listing team members.
 */
export interface ListMembersResponse {
  members: TeamMemberWithUser[];
}

/**
 * Response from removing a member.
 */
export interface RemoveMemberResponse {
  success: boolean;
}

// ============================================================================
// Team Meeting API Types
// ============================================================================

/**
 * Request body for inviting a team to a meeting.
 */
export interface InviteTeamToMeetingRequest {
  teamId: string;
}

/**
 * Response from inviting a team to a meeting.
 */
export interface InviteTeamToMeetingResponse {
  invite: TeamMeetingInvite;
  /** Number of individual invites created for team members */
  membersInvited: number;
  /** Number of invitation emails successfully sent */
  emailsSent: number;
}

/**
 * Response from listing team invites for a meeting.
 */
export interface ListTeamInvitesResponse {
  invites: TeamMeetingInviteWithTeam[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Predefined team colors for the UI.
 * Same palette as folder colors for consistency.
 */
export const TEAM_COLORS = [
  { name: "Gray", value: "#6B7280" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F97316" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Green", value: "#22C55E" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
] as const;

/**
 * Validation and limit constants for teams.
 */
export const TEAM_LIMITS = {
  /** Minimum name length */
  MIN_NAME_LENGTH: 3,
  /** Maximum name length */
  MAX_NAME_LENGTH: 50,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Maximum members per team */
  MAX_MEMBERS_PER_TEAM: 100,
  /** Maximum teams a user can own/create */
  MAX_TEAMS_PER_USER: 20,
  /** Maximum sub-team nesting depth */
  MAX_SUB_TEAM_DEPTH: 3,
  /** Maximum pending invites per team */
  MAX_PENDING_INVITES: 50,
} as const;

/**
 * Role-based permissions.
 */
export const ROLE_PERMISSIONS = {
  owner: {
    canViewTeam: true,
    canSeeMembers: true,
    canInviteToMeeting: true,
    canInviteMembers: true,
    canEditTeam: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canCreateSubteam: true,
    canDeleteTeam: true,
    canTransferOwnership: true,
  },
  admin: {
    canViewTeam: true,
    canSeeMembers: true,
    canInviteToMeeting: true,
    canInviteMembers: true,
    canEditTeam: true,
    canRemoveMembers: true,
    canChangeRoles: true, // Can only demote to member or promote members to admin
    canCreateSubteam: true,
    canDeleteTeam: false,
    canTransferOwnership: false,
  },
  member: {
    canViewTeam: true,
    canSeeMembers: true,
    canInviteToMeeting: true,
    canInviteMembers: false,
    canEditTeam: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canCreateSubteam: false,
    canDeleteTeam: false,
    canTransferOwnership: false,
  },
} as const;

/**
 * Helper to check if a role can perform an action.
 */
export function canPerformAction(
  role: TeamRole,
  action: keyof (typeof ROLE_PERMISSIONS)["owner"]
): boolean {
  return ROLE_PERMISSIONS[role][action];
}

/**
 * Helper to check if a role change is allowed.
 * Owners can change any role, admins can only promote members to admin or demote admins to member.
 */
export function canChangeRole(
  currentUserRole: TeamRole,
  targetCurrentRole: TeamRole,
  targetNewRole: TeamRole
): boolean {
  // Only owners and admins can change roles
  if (currentUserRole === "member") return false;

  // Owners can do anything
  if (currentUserRole === "owner") return true;

  // Admins cannot change owner role
  if (targetCurrentRole === "owner" || targetNewRole === "owner") return false;

  // Admins can change admin <-> member
  return true;
}
