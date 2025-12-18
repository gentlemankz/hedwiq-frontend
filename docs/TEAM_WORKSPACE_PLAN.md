# Team Workspace Implementation Plan

## Overview

Add team-based collaboration features to Hedwiq: team hierarchy in sidebar, team member management, and team-based meeting invitations for faster, organized collaboration.

---

## Current State Analysis

### Existing Architecture
- **User system**: Individual users with Better Auth (Google OAuth)
- **Folders**: Personal meeting organization (`meeting_folder` table, `userId` scoped)
- **Invitations**: Email-based (`meeting_invitee` table, individual emails)
- **Sidebar**: Home → Past Meetings (folders) → Integrations → Settings
- **Context pattern**: `SidebarContext` manages folder state + UI expansion

### Key Integration Points
- `lib/db/schema.ts`: Database schema (Drizzle ORM)
- `components/layout/dashboard-sidebar.tsx`: Sidebar navigation
- `contexts/sidebar-context.tsx`: State management pattern to follow
- `components/meetings/schedule-meeting-dialog.tsx`: Meeting creation with invitees
- `components/meetings/invitee-input.tsx`: Email-based invitation component

---

## Database Schema

### New Tables

**`team`** - Core team entity
- `id` (PK): Team identifier (`team-{creatorId}-{timestamp}`)
- `name`: Team name (3-50 chars)
- `description`: Optional description
- `color`: Hex color for UI display
- `icon`: Optional icon identifier
- `parentTeamId` (FK → team.id, nullable): For sub-teams hierarchy
- `createdBy` (FK → user.id): Team creator
- `orderIndex`: Display order within parent
- `createdAt`, `updatedAt`

**`team_member`** - User membership in teams
- `id` (PK): Membership identifier
- `teamId` (FK → team.id)
- `userId` (FK → user.id)
- `role`: `owner` | `admin` | `member`
- `invitedBy` (FK → user.id): Who invited this member
- `invitedAt`: Invitation timestamp
- `joinedAt`: When user accepted (null if pending)
- `status`: `pending` | `active` | `left`
- `createdAt`, `updatedAt`
- **Unique constraint**: (`teamId`, `userId`)

**`team_meeting`** - Link teams to meetings (for team-wide invites)
- `id` (PK)
- `teamId` (FK → team.id)
- `meetingId` (FK → meeting.id)
- `invitedBy` (FK → user.id)
- `invitedAt`
- **Unique constraint**: (`teamId`, `meetingId`)

**`pending_external_team_invitation`** - Invitations for non-registered users (Phase 7)
- `id` (PK): Invitation identifier (`peti-{timestamp}-{random}`)
- `teamId` (FK → team.id)
- `email`: Invitee's email (normalized lowercase)
- `role`: `admin` | `member`
- `invitedBy` (FK → user.id)
- `invitedAt`, `expiresAt`
- `token`: Secure acceptance token (32 chars)
- `status`: `pending` | `accepted` | `expired` | `cancelled`
- `acceptedAt`, `acceptedUserId` (FK → user.id, nullable)
- `createdAt`, `updatedAt`
- **Unique constraint**: (`teamId`, `email`) WHERE `status = 'pending'`

### Schema Relationships
```
user ─┬─< team_member >── team ──< team (sub-teams via parentTeamId)
      │                     │
      │                     ├──< team_meeting >── meeting
      │                     │
      └─< meeting_invitee   └──< pending_external_team_invitation (Phase 7)
```

### Indexes
- `team`: `parentTeamId`, `createdBy`, `(parentTeamId, orderIndex)`
- `team_member`: `teamId`, `userId`, `(teamId, status)`, `(userId, status)`
- `team_meeting`: `meetingId`, `teamId`
- `pending_external_team_invitation`: `email`, `token`, `(teamId, status)`, `expiresAt`

---

## API Routes

### Team CRUD (`/api/teams/`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/teams` | List user's teams (with member counts) |
| POST | `/api/teams` | Create team |
| GET | `/api/teams/[teamId]` | Get team details |
| PATCH | `/api/teams/[teamId]` | Update team (name, color, description) |
| DELETE | `/api/teams/[teamId]` | Delete team (owner only) |
| POST | `/api/teams/reorder` | Reorder teams within parent |

### Team Members (`/api/teams/[teamId]/members/`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/teams/[teamId]/members` | List team members |
| POST | `/api/teams/[teamId]/members` | Invite members (by email or userId) |
| PATCH | `/api/teams/[teamId]/members/[memberId]` | Update role |
| DELETE | `/api/teams/[teamId]/members/[memberId]` | Remove member |

### Sub-teams (`/api/teams/[teamId]/subteams/`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/teams/[teamId]/subteams` | List sub-teams |
| POST | `/api/teams/[teamId]/subteams` | Create sub-team |

### Team Meeting Invitations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/meetings/[meetingId]/invite-team` | Invite entire team to meeting |
| GET | `/api/meetings/[meetingId]/team-invites` | List team invites for meeting |
| DELETE | `/api/meetings/[meetingId]/team-invites/[teamId]` | Remove team invite |

---

## Frontend Components

### Types (`types/team.ts`)

```
Team, TeamMember, TeamRole, TeamMemberStatus
TeamWithMembers, TeamWithSubteams, TeamHierarchy
CreateTeamRequest/Response, UpdateTeamRequest
InviteMembersRequest/Response, TeamInvite
TEAM_LIMITS, TEAM_COLORS, ROLE_PERMISSIONS
```

### Context (`contexts/team-context.tsx`)

**State:**
- `teams`: User's teams (flat list)
- `teamHierarchy`: Nested tree structure for sidebar
- `teamsLoading`, `teamsError`
- `expandedTeams`: Set of expanded team IDs in sidebar

**Actions:**
- `createTeam(name, color, parentTeamId?)`
- `updateTeam(id, updates)`
- `deleteTeam(id)`
- `reorderTeams(teamIds, parentTeamId)`
- `refreshTeams()`
- `toggleTeamExpanded(teamId)`

### Sidebar Components

**`components/teams/team-sidebar-section.tsx`**
- Collapsible "Teams" section in sidebar
- Renders team hierarchy recursively
- "Create Team" button at bottom
- Context menu: Edit, Add Sub-team, Manage Members, Delete

**`components/teams/team-sidebar-item.tsx`**
- Single team item with expand/collapse for sub-teams
- Shows team color dot, name, member count badge
- Hover actions: quick add sub-team, settings

### Team Management Components

**`components/teams/create-team-dialog.tsx`**
- Name input, color picker, optional parent team selector
- Validation: name 3-50 chars, unique within parent

**`components/teams/edit-team-dialog.tsx`**
- Edit name, color, description
- Move to different parent team option

**`components/teams/delete-team-dialog.tsx`**
- Confirmation with sub-team/member impact warning
- Option to transfer sub-teams to parent or delete all

**`components/teams/team-members-dialog.tsx`**
- List current members with roles
- Invite new members section
- Role management (owner/admin can change roles)
- Remove member action

**`components/teams/invite-team-member-input.tsx`**
- Email input with autocomplete from existing users
- Bulk invite via paste (like invitee-input.tsx)
- Shows pending invitations

### Team Page (`app/dashboard/teams/`)

**`app/dashboard/teams/page.tsx`**
- Full teams overview page
- Grid/list view of all teams
- Quick actions: create, manage members

**`app/dashboard/teams/[teamId]/page.tsx`**
- Single team detail page
- Members list with management
- Sub-teams section
- Team activity/stats (meetings held, etc.)

### Meeting Integration Components

**`components/meetings/team-invitee-selector.tsx`**
- Tabs: "Individual" | "Teams"
- Teams tab: checkbox list of user's teams
- Shows member preview on team hover
- "Invite entire team" button

**Updates to `schedule-meeting-dialog.tsx`**
- Add `TeamInviteeSelector` to invite section
- Track both `invitees` (individual) and `teamInvites` (teams)
- API call to `/api/meetings/[id]/invite-team` for team invites
- Display invited teams as badges with member count

**Updates to `invitee-input.tsx`**
- Add optional "Add from team" quick action
- Team selector dropdown integration

---

## Implementation Phases

### Phase 1: Database & Core API
1. Create migration: `0017_add_team_tables.sql`
2. Add schema definitions to `lib/db/schema.ts`
3. Create `lib/db/team.ts` with CRUD operations
4. Implement team API routes: create, read, update, delete
5. Implement team member API routes

### Phase 2: Team Context & Sidebar
1. Create `types/team.ts` with all type definitions
2. Implement `contexts/team-context.tsx`
3. Update `SidebarProvider` to include team context (or create composite)
4. Create `team-sidebar-section.tsx` and `team-sidebar-item.tsx`
5. Add Teams section to `dashboard-sidebar.tsx`

### Phase 3: Team Management UI
1. Create team dialog components (create, edit, delete)
2. Create team members dialog
3. Create invite-team-member-input component
4. Implement teams dashboard pages
5. Add team management to sidebar context menu

### Phase 4: Meeting Integration
1. Create `team_meeting` table migration
2. Implement `/api/meetings/[id]/invite-team` routes
3. Create `team-invitee-selector.tsx` component
4. Update `schedule-meeting-dialog.tsx` with team invites
5. Update meeting cards to show team invitations
6. Add team invite badges to meeting detail views

### Phase 5: Sub-teams & Hierarchy
1. Implement sub-team creation in API
2. Add recursive rendering to sidebar
3. Create sub-team management UI
4. Handle permission inheritance (sub-team members)
5. Add depth limit (max 3 levels recommended)

### Phase 6: Polish & Edge Cases
1. Team invitation email notifications
2. Pending invitation handling
3. Member left/removed state handling
4. Team deletion cascade behavior
5. Performance optimization for large teams

### Phase 7: External User Invitations
**Goal**: Allow inviting users by email who don't have accounts yet. When they sign up, they automatically see/join their pending team invitations.

#### 7.1 Database Schema

**`pending_external_team_invitation`** - Invitations for non-registered users
- `id` (PK): Invitation identifier (`peti-{timestamp}-{random}`)
- `teamId` (FK → team.id): Target team
- `email`: Invitee's email (normalized lowercase)
- `role`: `admin` | `member` (not owner - can't pre-assign ownership)
- `invitedBy` (FK → user.id): Who sent the invitation
- `invitedAt`: When invitation was created
- `expiresAt`: Invitation expiration (default: 30 days)
- `token`: Secure token for direct-link acceptance
- `status`: `pending` | `accepted` | `expired` | `cancelled`
- `acceptedAt`: When user signed up and accepted
- `acceptedUserId` (FK → user.id, nullable): The user who accepted
- `createdAt`, `updatedAt`
- **Unique constraint**: (`teamId`, `email`, `status='pending'`) - one pending invite per email per team
- **Index**: `email` for signup lookup, `token` for direct acceptance

#### 7.2 API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/teams/[teamId]/external-invites` | List pending external invites for team |
| POST | `/api/teams/[teamId]/external-invites` | Create external invitation (sends email) |
| DELETE | `/api/teams/[teamId]/external-invites/[inviteId]` | Cancel/revoke external invite |
| POST | `/api/teams/external-invites/accept` | Accept invite via token (for logged-in users) |
| GET | `/api/auth/pending-invitations` | Get pending invitations for current user's email |

#### 7.3 Invitation Flow

**Inviting a non-registered user:**
```
1. Admin enters email in invite input
2. System checks: Does user exist?
   - YES → Create team_member (existing flow)
   - NO → Create pending_external_team_invitation
3. Send invitation email with:
   - Team details (name, description, member count)
   - Inviter info
   - "Join Team" button → signup page with token
   - Direct link: /sign-up?team_invite={token}
4. Show in UI as "Pending (external)" with email
```

**User signs up with pending invitation:**
```
1. User completes Google OAuth signup
2. After auth callback, system checks pending_external_team_invitation
   - Query: WHERE email = {user.email} AND status = 'pending' AND expiresAt > NOW()
3. For each pending invitation:
   - Create team_member record (status: 'pending' or 'active' based on setting)
   - Update invitation: status = 'accepted', acceptedUserId = user.id
4. Redirect to dashboard with toast: "You have X team invitations"
```

**Direct link acceptance (already logged in):**
```
1. User clicks link in email while logged in
2. /sign-up?team_invite={token} redirects to /dashboard/teams?accept_token={token}
3. System validates token and user's email matches
4. Creates team_member, updates invitation status
5. Shows success message
```

#### 7.4 Implementation Tasks

**Database:**
1. Create migration: `0018_add_external_team_invitation.sql`
2. Add schema to `lib/db/schema.ts`
3. Create `lib/db/external-team-invitation.ts` with CRUD operations:
   - `createExternalInvitation(teamId, email, role, invitedBy)`
   - `getExternalInvitationByToken(token)`
   - `getExternalInvitationsForTeam(teamId)`
   - `getPendingInvitationsForEmail(email)`
   - `acceptExternalInvitation(token, userId)`
   - `cancelExternalInvitation(inviteId)`
   - `expireOldInvitations()` (cleanup job)

**API Routes:**
1. `POST /api/teams/[teamId]/members` - Update to handle external invites
2. `GET /api/teams/[teamId]/external-invites` - List external invites
3. `DELETE /api/teams/[teamId]/external-invites/[inviteId]` - Cancel invite
4. `POST /api/teams/external-invites/accept` - Accept via token

**Auth Integration:**
1. Update Better Auth callback/signup hook
2. Add `checkPendingTeamInvitations(userId, email)` function
3. Auto-process invitations on signup

**Email Template:**
1. Create `lib/email/templates/external-team-invitation.tsx`
   - Different from internal invite (includes signup CTA)
   - Signup link with token parameter
   - Expiration notice

**Frontend Components:**
1. Update `invite-team-member-input.tsx`:
   - Show "Will send signup invitation" for unknown emails
   - Different visual treatment for external invites
2. Update `team-members-dialog.tsx`:
   - New section: "Pending External Invitations"
   - Show email, invited date, expiration, resend/cancel actions
3. Add signup redirect handling in auth flow

#### 7.5 Email Template Content

```
Subject: {inviterName} invited you to join {teamName} on Hedwiq

Hi there,

{inviterName} ({inviterEmail}) has invited you to join their team "{teamName}" on Hedwiq.

[Team Details Box]
- Team: {teamName}
- Your Role: {role}
- Members: {memberCount}
- Description: {description}

To join this team, create your Hedwiq account:

[Create Account & Join Team] → /sign-up?team_invite={token}

This invitation expires in {daysRemaining} days.

---
If you already have a Hedwiq account with a different email,
you can ask {inviterName} to re-send the invitation to your account email.
```

#### 7.6 Security Considerations

1. **Token security**: Use cryptographically secure random tokens (32+ chars)
2. **Email verification**: Token is tied to specific email; user must sign up with that email
3. **Expiration**: Default 30 days, configurable per organization
4. **Rate limiting**: Max 10 external invites per team per hour
5. **Spam prevention**: Don't reveal if email exists in system
6. **Token single-use**: Mark as accepted immediately, prevent replay

#### 7.7 UI States

**In Team Members Dialog:**
```
Members (5)
├── John Doe (Owner) - john@example.com
├── Jane Smith (Admin) - jane@example.com
└── Bob Wilson (Member) - bob@example.com

Pending Invitations (2)
├── alice@example.com (Member) - Invited 2 days ago [Resend] [Cancel]
└── External: charlie@newuser.com (Admin) - Expires in 28 days [Resend] [Cancel]
```

**In Invite Input:**
```
[Email input: "newperson@gmail.com"]
ℹ️ This person doesn't have a Hedwiq account yet.
   They'll receive an invitation to sign up and join your team.
[Send Invitation]
```

#### 7.8 Constants

```typescript
EXTERNAL_INVITE_LIMITS = {
  DEFAULT_EXPIRATION_DAYS: 30,
  MAX_PENDING_PER_TEAM: 50,
  MAX_INVITES_PER_HOUR: 10,
  TOKEN_LENGTH: 32,
  MIN_RESEND_INTERVAL_HOURS: 24,
}
```

#### 7.9 Testing Checklist

- [ ] Create external invitation for non-existent email
- [ ] Email sent with correct signup link
- [ ] User signs up → auto-joins team
- [ ] User signs up with different email → no auto-join
- [ ] Expired invitation → rejected on signup
- [ ] Cancel invitation → user can't join
- [ ] Resend invitation → new token, reset expiration
- [ ] Rate limiting works
- [ ] Direct link acceptance for logged-in users
- [ ] Multiple pending invitations processed on signup

---

## Permission Model

### Roles
- **Owner**: Full control, can delete team, transfer ownership
- **Admin**: Manage members, create sub-teams, edit team
- **Member**: View team, see members, no management actions

### Actions by Role

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View team | ✓ | ✓ | ✓ |
| See members | ✓ | ✓ | ✓ |
| Invite to meeting | ✓ | ✓ | ✓ |
| Invite members | ✓ | ✓ | ✗ |
| Edit team info | ✓ | ✓ | ✗ |
| Remove members | ✓ | ✓ | ✗ |
| Change roles | ✓ | Admin→Member | ✗ |
| Create sub-team | ✓ | ✓ | ✗ |
| Delete team | ✓ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ |

### Sub-team Inheritance
- Sub-team members do NOT automatically join parent team
- Parent team admins can view/manage sub-teams
- Owner of parent team is implicit admin of all sub-teams

---

## UI/UX Specifications

### Sidebar Layout
```
Home
Teams                    ← NEW SECTION
├── Marketing (5)        ← Team with member count
│   ├── Content (3)      ← Sub-team (indented)
│   └── Design (4)
├── Engineering (12)
│   ├── Frontend (4)
│   └── Backend (6)
└── + New Team           ← Create action
Past Meetings
├── All Meetings
├── General (15)
└── ...
Integrations
Settings
```

### Team Colors
Use same palette as folders: Gray, Red, Orange, Amber, Green, Teal, Blue, Indigo, Purple, Pink

### Meeting Invite Flow
1. Click "Invite Participants" section
2. See tabs: "Email" | "Teams"
3. Teams tab shows checkboxes for each team
4. Selecting team shows "X members will be invited"
5. Can expand to see/exclude individual members
6. Submit creates `team_meeting` record + individual `meeting_invitee` for each member

### Team Invite Badge Display
- In meeting card: "Marketing (5 members)" badge with team color
- Hover shows member names
- Click expands to show full list

---

## Constants & Limits

```typescript
TEAM_LIMITS = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 50,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_MEMBERS_PER_TEAM: 100,
  MAX_TEAMS_PER_USER: 20,
  MAX_SUB_TEAM_DEPTH: 3,
  MAX_PENDING_INVITES: 50,
}
```

---

## Migration Strategy

### Data Migration
- No existing data to migrate (new feature)
- Create default team prompt on first visit (optional)

### Rollout
1. Feature flag: `FEATURE_TEAMS_ENABLED`
2. Soft launch to subset of users
3. Monitor performance with large teams
4. Full rollout

---

## Testing Checklist

### Unit Tests
- Team CRUD operations
- Permission checks for each role
- Sub-team hierarchy validation
- Team invite deduplication

### Integration Tests
- Create team → add members → invite to meeting flow
- Sub-team creation and navigation
- Team deletion with cascade behavior

### E2E Tests
- Complete team creation flow
- Meeting scheduling with team invites
- Sidebar team expansion/collapse
- Member management dialogs

---

## Performance Considerations

1. **Team hierarchy query**: Single query with recursive CTE, cache in context
2. **Member counts**: Denormalize or compute in aggregation query
3. **Sidebar rendering**: Virtualize if >50 teams
4. **Meeting invites**: Batch insert for team members
5. **Team search**: Add search endpoint for large organizations

---

## Future Enhancements (Out of Scope)

- Team chat/messaging integration
- Team-level meeting folders
- Team calendar view
- Team analytics dashboard
- Cross-organization team sharing (external team collaboration)
- Team templates (pre-configured sub-teams)
- SSO team provisioning (SCIM)
- Organization-level team management
- Team activity audit logs
