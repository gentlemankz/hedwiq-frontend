# Directory Structure

This document provides a comprehensive overview of the frontend project structure.

```
frontend/
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── AGENTS.md                         # Agent-specific instructions
├── CLAUDE.md                         # Claude Code guidance (this file)
├── README.md                         # Project README
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Auth route group
│   │   ├── layout.tsx                # Shared auth layout
│   │   ├── forgot-password/page.tsx  # Password reset request page
│   │   ├── reset-password/page.tsx   # Password reset confirmation page
│   │   ├── sign-in/page.tsx          # Sign-in page (handles team_invite token for external invites)
│   │   └── sign-up/page.tsx          # User registration page
│   ├── (public)/                     # Public route group (no auth required)
│   │   └── rsvp/[token]/page.tsx     # Public RSVP landing
│   ├── api/                          # API routes
│   │   ├── auth/[...all]/route.ts    # Better Auth catch-all handler
│   │   ├── calendar/                 # Google Calendar OAuth + sync
│   │   │   ├── callback/route.ts     # OAuth callback handler
│   │   │   ├── connect/route.ts      # Start OAuth flow
│   │   │   ├── disconnect/route.ts   # Revoke calendar connection
│   │   │   ├── events/route.ts       # Fetch calendar events for meetings
│   │   │   └── status/route.ts       # Connection status for user
│   │   ├── documents/                # Supabase Storage-backed documents
│   │   │   ├── route.ts              # List documents for a room
│   │   │   ├── upload/route.ts       # Upload PDF to Supabase
│   │   │   └── [documentId]/
│   │   │       ├── route.ts          # Get/delete a document
│   │   │       └── pdf/route.ts      # Serve signed URL to PDF
│   │   ├── email-drafts/             # AI-generated email draft management
│   │   │   ├── route.ts              # List/create email drafts
│   │   │   └── [draftId]/route.ts    # Get/update/delete email draft
│   │   ├── folders/                  # Meeting folder organization
│   │   │   ├── route.ts              # List/create folders
│   │   │   ├── reorder/route.ts      # Bulk reorder folders
│   │   │   └── [folderId]/route.ts   # Get/update/delete folder
│   │   ├── internal/                 # Internal service APIs (bearer token auth)
│   │   │   └── usage/route.ts        # Usage reporting for Python agent (POST report, GET status)
│   │   ├── gmail/                    # Gmail OAuth for Real-Time Actions
│   │   │   ├── callback/route.ts     # OAuth callback handler
│   │   │   ├── connect/route.ts      # Start Gmail OAuth flow
│   │   │   ├── disconnect/route.ts   # Revoke Gmail connection
│   │   │   ├── send/route.ts         # Send email via Gmail API
│   │   │   └── status/route.ts       # Connection status for user
│   │   ├── livekit/token/route.ts    # LiveKit token generation endpoint
│   │   ├── meetings/                 # Meeting CRUD + invites + persistence
│   │   │   ├── route.ts              # List/create meetings
│   │   │   ├── bulk-move/route.ts    # Bulk move meetings to folder
│   │   │   ├── history/route.ts      # User's past meetings list with stats
│   │   │   ├── usage-check/route.ts  # Pre-meeting usage limit check
│   │   │   └── [meetingId]/
│   │   │       ├── route.ts          # Get/update/delete a meeting
│   │   │       ├── calendar.ics/route.ts # ICS download
│   │   │       ├── data/route.ts     # Bulk save transcription/insights/refs
│   │   │       ├── history/route.ts  # Full meeting history with all data
│   │   │       ├── invite/route.ts   # Send individual invitations
│   │   │       ├── invite-team/      # Team invitation APIs
│   │   │       │   ├── route.ts      # POST: invite team, GET: list team invites
│   │   │       │   └── [teamId]/route.ts # DELETE: remove team invite
│   │   │       ├── invitees/route.ts # List/remove invitees
│   │   │       ├── notes/route.ts    # User notes CRUD
│   │   │       └── session/route.ts  # Session tracking (join/leave)
│   │   ├── rooms/[roomId]/           # Room-scoped APIs
│   │   │   ├── access/route.ts       # Record/check participant access
│   │   │   ├── meeting/route.ts      # Pre-join meeting metadata
│   │   │   └── agenda/               # Agenda draft/active lifecycle
│   │   │       ├── route.ts          # Get/upsert draft agenda (items inline)
│   │   │       ├── publish/route.ts  # Publish a draft agenda
│   │   │       ├── reorder/route.ts  # Reorder agenda items
│   │   │       └── items/[itemId]/   # Item-level updates
│   │   │           ├── route.ts      # Update/delete an agenda item
│   │   │           └── status/route.ts # Manual status override (fallback)
│   │   ├── rsvp/[token]/route.ts     # Public RSVP status endpoint
│   │   └── teams/                    # Team workspace APIs
│   │       ├── route.ts              # List/create teams
│   │       ├── check-emails/route.ts # Check if emails have accounts (for external invite detection)
│   │       ├── invitations/route.ts  # User's pending invitations (GET/POST accept/decline)
│   │       ├── reorder/route.ts      # Bulk reorder teams
│   │       ├── search/route.ts       # Team search with relevance scoring
│   │       ├── external-invites/     # External user invitation APIs
│   │       │   ├── accept/route.ts   # Accept external invitation via token
│   │       │   └── pending/route.ts  # Get pending external invitations for user
│   │       └── [teamId]/
│   │           ├── route.ts          # Get/update/delete team
│   │           ├── subteams/route.ts # List/create sub-teams
│   │           ├── external-invites/ # Team-scoped external invitation APIs
│   │           │   ├── route.ts      # List/create external invitations
│   │           │   └── [inviteId]/route.ts # Cancel/resend external invitation
│   │           └── members/
│   │               ├── route.ts      # List/invite team members (+ email notifications)
│   │               └── [memberId]/route.ts # Get/update/remove member
│   ├── dashboard/                    # Dashboard with sidebar navigation
│   │   ├── layout.tsx                # Dashboard layout with sidebar + auth check
│   │   ├── page.tsx                  # Home: Quick Actions + Upcoming Meetings
│   │   ├── dashboard-client.tsx      # Client component for home page
│   │   ├── integrations/
│   │   │   └── page.tsx              # Calendar + Gmail integration cards
│   │   ├── past-meetings/
│   │   │   ├── page.tsx              # All folders overview + meetings list
│   │   │   └── [folderId]/
│   │   │       └── page.tsx          # Single folder view with meetings
│   │   ├── settings/
│   │   │   └── page.tsx              # User preferences (stub)
│   │   └── teams/                    # Team workspace pages
│   │       ├── page.tsx              # Teams overview (handles accept_token for external invites)
│   │       └── [teamId]/
│   │           ├── page.tsx          # Team detail server component
│   │           └── team-detail-view.tsx # Team detail client view
│   ├── meetings/[roomId]/            # Dynamic room routes
│   │   ├── page.tsx                  # Room entry point
│   │   ├── meeting-room.tsx          # LiveKit room wrapper with providers
│   │   ├── pre-join-screen.tsx       # Pre-join flow + agenda builder
│   │   ├── components/
│   │   │   ├── media-controls.tsx
│   │   │   ├── meeting-layout.tsx    # Sidebar tabs + document viewer modal
│   │   │   ├── username-form.tsx
│   │   │   ├── video-preview.tsx
│   │   │   └── agenda-builder/
│   │   │       ├── index.ts
│   │   │       ├── add-topic-dialog.tsx
│   │   │       ├── agenda-builder.tsx
│   │   │       ├── agenda-item.tsx
│   │   │       └── sortable-list.tsx
│   │   └── history/                  # Meeting history view (post-meeting)
│   │       ├── page.tsx              # Server component with auth + data fetch
│   │       └── meeting-history-view.tsx # Client component with tabs UI
│   ├── favicon.ico                   # App favicon
│   ├── globals.css                   # Global styles with LiveKit theme integration
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Landing page
├── components/
│   ├── actions/                      # Action items UI components
│   │   ├── index.ts
│   │   ├── action-badge.tsx          # Status badge for action items
│   │   └── action-card.tsx           # Individual action item card
│   ├── agenda/
│   │   ├── index.ts
│   │   ├── agenda-progress-item.tsx
│   │   ├── agenda-progress.tsx
│   │   └── progress-indicator.tsx
│   ├── calendar/
│   │   ├── index.ts
│   │   └── calendar-status-card.tsx
│   ├── documents/
│   │   ├── index.ts
│   │   ├── document-reference-badge.tsx
│   │   ├── document-upload.tsx
│   │   ├── document-viewer-modal.tsx
│   │   └── pdf-viewer.tsx
│   ├── email-drafts/
│   │   ├── index.ts
│   │   ├── email-draft-card.tsx      # Collapsible email draft card with inline editing
│   │   └── email-draft-panel.tsx     # Email drafts panel with tabs (Pending/Sent/Dismissed)
│   ├── folders/                      # Meeting folder UI components
│   │   ├── index.ts
│   │   ├── delete-folder-dialog.tsx  # Confirmation dialog for folder deletion
│   │   ├── edit-folder-dialog.tsx    # Dialog for editing folder name/color
│   │   ├── folder-color-dot.tsx      # Reusable folder color indicator
│   │   └── folder-select.tsx         # Dropdown select for choosing folders
│   ├── gmail/
│   │   ├── index.ts
│   │   └── gmail-status-card.tsx
│   ├── icons/                        # Custom icon components
│   │   ├── index.ts
│   │   └── google-icon.tsx           # Google brand icon for auth buttons
│   ├── insights/
│   │   ├── index.ts
│   │   ├── insight-badge.tsx
│   │   ├── insight-card.tsx
│   │   └── insights-summary-panel.tsx
│   ├── layout/                       # Layout components
│   │   ├── index.ts
│   │   └── dashboard-sidebar.tsx     # Dashboard sidebar with folders + teams nav
│   ├── meeting/
│   │   ├── index.ts
│   │   ├── custom-control-bar.tsx
│   │   ├── meeting-info-header.tsx
│   │   └── meeting-notes-panel.tsx
│   ├── meetings/
│   │   ├── index.ts
│   │   ├── edit-meeting-dialog.tsx
│   │   ├── invitee-input.tsx
│   │   ├── manage-invitees-dialog.tsx  # Manage invitees + team invites dialog
│   │   ├── meeting-card.tsx            # Meeting card with team invite badges
│   │   ├── meeting-list.tsx
│   │   ├── meeting-type-selector.tsx
│   │   ├── move-meeting-to-folder-dialog.tsx # Dialog for single/bulk meeting move
│   │   ├── past-meeting-card.tsx       # Card with selection mode + move to folder action
│   │   ├── past-meetings-list.tsx      # Paginated list with bulk selection + move
│   │   ├── schedule-meeting-dialog.tsx # Schedule meeting with team invite support
│   │   ├── team-invite-badge.tsx       # Team invite badge + summary components
│   │   └── team-invitee-selector.tsx   # Team selection for meeting invitations
│   ├── participant/
│   │   ├── index.ts
│   │   ├── custom-participant-tile.tsx
│   │   ├── custom-video-conference.tsx
│   │   └── use-is-encrypted.ts
│   ├── subscription/                 # Subscription/billing UI components
│   │   ├── index.ts
│   │   └── subscription-widget.tsx   # Polar subscription widget component
│   ├── teams/                        # Team workspace UI components
│   │   ├── index.ts
│   │   ├── create-team-dialog.tsx    # Dialog for creating new teams
│   │   ├── delete-team-dialog.tsx    # Confirmation dialog with cascade impact
│   │   ├── edit-team-dialog.tsx      # Dialog for editing team name/color
│   │   ├── invite-team-member-input.tsx # Bulk email input with role selection + external indicators
│   │   ├── pending-team-invitations.tsx # Pending invitations banner/card component
│   │   ├── team-color-dot.tsx        # Reusable team color indicator
│   │   ├── team-members-dialog.tsx   # Dialog for managing team members + external invitations
│   │   ├── team-sidebar-item.tsx     # Individual team item in sidebar (memoized)
│   │   └── team-sidebar-section.tsx  # Teams section in sidebar with invitations
│   ├── transcript-notes/
│   │   ├── index.ts
│   │   ├── add-transcript-note-popover.tsx
│   │   └── transcript-note-card.tsx
│   ├── transcription/
│   │   ├── index.ts
│   │   ├── transcription-error-boundary.tsx
│   │   └── transcription-sidebar.tsx
│   └── ui/                           # shadcn/ui components (70+ primitives)
│       ├── accordion.tsx
│       ├── alert-dialog.tsx
│       ├── alert.tsx
│       ├── aspect-ratio.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── breadcrumb.tsx
│       ├── button-group.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── carousel.tsx
│       ├── chart.tsx
│       ├── checkbox.tsx
│       ├── collapsible.tsx
│       ├── color-dot.tsx             # Generic color indicator component
│       ├── command.tsx
│       ├── context-menu.tsx
│       ├── dialog.tsx
│       ├── drawer.tsx
│       ├── dropdown-menu.tsx
│       ├── empty.tsx                 # Empty state component
│       ├── field.tsx                 # Form field wrapper
│       ├── form.tsx
│       ├── hover-card.tsx
│       ├── input-group.tsx
│       ├── input-otp.tsx
│       ├── input.tsx
│       ├── item.tsx                  # List item component
│       ├── kbd.tsx                   # Keyboard shortcut display
│       ├── label.tsx
│       ├── menubar.tsx
│       ├── navigation-menu.tsx
│       ├── pagination.tsx
│       ├── popover.tsx
│       ├── progress.tsx
│       ├── radio-group.tsx
│       ├── resizable.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sidebar.tsx
│       ├── skeleton.tsx
│       ├── slider.tsx
│       ├── sonner.tsx
│       ├── spinner.tsx              # Loading spinner component
│       ├── switch.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       ├── toggle-group.tsx
│       ├── toggle.tsx
│       └── tooltip.tsx
├── contexts/
│   ├── index.ts                      # Barrel export
│   ├── actions-context.tsx           # Action items state management + LiveKit stream
│   ├── documents-context.tsx         # Document refs + deduplication + LiveKit stream
│   ├── email-drafts-context.tsx      # Email draft state management + LiveKit stream subscription
│   ├── insights-context.tsx          # AI insights state management
│   ├── meeting-persistence-context.tsx # Meeting data persistence (transcripts, insights, notes)
│   ├── sidebar-context.tsx           # Dashboard sidebar UI state + folders CRUD
│   ├── subscription-context.tsx      # Polar subscription state management
│   ├── team-context.tsx              # Team workspace state management + CRUD
│   └── agenda/
│       ├── index.ts                  # Barrel export for agenda context
│       ├── agenda-context.tsx        # Main provider orchestrating all hooks
│       ├── constants.ts              # Agent prefix, retry settings, debug flag
│       ├── types.ts                  # Context types + LiveKit interfaces
│       ├── validators.ts             # Type guards for events + state attributes
│       ├── use-agenda-api.ts         # API fetch with retry/backoff logic
│       ├── use-agenda-computed.ts    # Memoized computed values from state
│       ├── use-agenda-event-processor.ts  # LiveKit event processing logic
│       ├── use-agenda-late-joiner-sync.ts # Late joiner sync via agent attributes
│       └── use-agenda-livekit.ts     # LiveKit stream subscription handler
├── docs/                             # Project documentation
│   ├── PRD.md                        # Product Requirements Document
│   ├── startup-info.md               # Startup/project information
│   ├── better-auth-llm.txt           # Better Auth LLM context
│   ├── livekit-llm.txt               # LiveKit LLM context
│   ├── AGENDA_FEATURE_PLAN.md        # Agenda feature implementation plan
│   ├── CODE_REVIEW_INVITEE_FEATURE.md # Invitee feature code review
│   ├── CODE_REVIEW_TEAM_WORKSPACE.md # Team workspace code review
│   ├── DASHBOARD_SIDEBAR_FOLDERS_PLAN.md # Dashboard folders plan
│   ├── DIRECTORY_STRUCTURE.md        # This file
│   ├── DOCUMENT_REFERENCE_PLAN.md    # Document reference feature plan
│   ├── HIDDEN_AGENT_IMPLEMENTATION_PLAN.md # Hidden agent plan
│   ├── MEETING_SCHEDULING_CALENDAR_PLAN.md # Meeting scheduling plan
│   ├── PHASE2_INSIGHTS_PLAN.md       # Phase 2 insights plan
│   ├── REAL_TIME_ACTIONS_PLAN.md     # Real-time actions feature plan
│   └── TEAM_WORKSPACE_PLAN.md        # Team workspace feature plan
├── hooks/
│   ├── use-actions.ts                # Action items context consumer utilities
│   ├── use-agenda.ts                 # Agenda context consumer utilities
│   ├── use-block-notes.ts            # Block-based notes (text + transcript refs) w/ storage + migration
│   ├── use-folders.ts                # Folders context consumer utilities
│   ├── use-insights.ts               # Insights context consumer utilities
│   ├── use-media-devices.ts          # Media device selection utilities
│   ├── use-mobile.ts                 # Mobile detection hook
│   ├── use-notes-panel.ts            # Legacy notes panel state
│   └── use-subscription.ts           # Polar subscription hook
├── lib/
│   ├── auth.ts                       # Better Auth server configuration
│   ├── auth-client.ts                # Better Auth client configuration
│   ├── calendar-service.ts           # Calendar sync service layer
│   ├── calendar-sync.ts              # Google Calendar sync for meetings
│   ├── gmail-oauth.ts                # Gmail OAuth utilities (token exchange, refresh, revoke)
│   ├── google-calendar.ts            # Google Calendar API utilities (event creation, sync)
│   ├── google-oauth-base.ts          # Shared Google OAuth base utilities
│   ├── google-oauth.ts               # Google Calendar OAuth utilities
│   ├── utils.ts                      # Includes formatDurationCompact, formatMeetingDate, formatMeetingTime
│   ├── validation.ts                 # Shared validation utilities
│   ├── calendar/
│   │   ├── index.ts
│   │   ├── ics.ts                    # ICS file generation
│   │   ├── links.ts                  # Calendar link generation
│   │   └── utils.ts                  # Calendar utility functions
│   ├── db/                           # Drizzle ORM setup
│   │   ├── index.ts                  # Database connection + exports
│   │   ├── schema.ts                 # Includes team, team_member, team_meeting, external invitation tables
│   │   ├── agenda.ts                 # Agenda CRUD operations
│   │   ├── calendar.ts               # Calendar integration CRUD
│   │   ├── calendar-event.ts         # Calendar event CRUD
│   │   ├── email-draft.ts            # Email draft CRUD operations (upsert, update, send tracking)
│   │   ├── external-team-invitation.ts # External invitation CRUD (create, accept, cancel, resend)
│   │   ├── folder.ts                 # Meeting folder CRUD operations
│   │   ├── gmail.ts                  # Gmail integration CRUD operations
│   │   ├── invitee.ts                # Meeting invitee CRUD
│   │   ├── meeting.ts                # Meeting CRUD (includes folderId support)
│   │   ├── meeting-data.ts           # Meeting persistence (sessions, transcripts, insights, notes)
│   │   ├── room-access.ts            # Room access control
│   │   ├── team.ts                   # Team CRUD, members, hierarchy, permissions, inheritance
│   │   └── migrations/               # SQL migrations + meta snapshots
│   │       ├── 0000_shallow_freak.sql
│   │       ├── 0001_right_professor_monster.sql
│   │       ├── 0002_sleepy_redwing.sql
│   │       ├── 0003_flat_black_bolt.sql
│   │       ├── 0004_rls_agenda_tables.sql
│   │       ├── 0005_add_meeting_info.sql
│   │       ├── 0006_add_meeting_table.sql
│   │       ├── 0007_add_calendar_integration.sql
│   │       ├── 0008_add_calendar_event_table.sql
│   │       ├── 0009_add_agenda_meeting_id.sql
│   │       ├── 0010_add_meeting_invitee_table.sql
│   │       ├── 0011_add_meeting_data_tables.sql
│   │       ├── 0012_add_action_item_table.sql
│   │       ├── 0013_add_gmail_integration.sql
│   │       ├── 0014_add_email_draft_table.sql
│   │       ├── 0015_drop_email_draft_fk_constraints.sql
│   │       ├── 0016_add_meeting_folder_table.sql
│   │       ├── 0017_add_team_tables.sql
│   │       ├── 0018_add_external_team_invitation.sql
│   │       └── meta/
│   │           ├── _journal.json
│   │           ├── 0000_snapshot.json
│   │           ├── 0001_snapshot.json
│   │           ├── 0002_snapshot.json
│   │           └── 0003_snapshot.json
│   ├── email/
│   │   ├── index.ts                  # Email utilities + team/external invitation senders
│   │   ├── smtp.ts                   # SMTP transport configuration
│   │   └── templates/
│   │       ├── external-team-invitation.tsx # External invitation email (non-registered users)
│   │       ├── meeting-cancelled.tsx
│   │       ├── meeting-invitation.tsx
│   │       ├── meeting-updated.tsx
│   │       └── team-invitation.tsx   # Team invitation email template (existing users)
│   ├── polar/                        # Polar subscription integration
│   │   ├── index.ts                  # Polar client setup
│   │   ├── auth-flow.ts              # Post-auth checkout flow utilities
│   │   ├── checkout.ts               # Checkout slug building + pending checkout storage
│   │   ├── constants.ts              # Products, tier limits, helper functions
│   │   └── usage.ts                  # Usage tracking (minutes, drafts, storage) + limit checks
│   ├── supabase/
│   │   ├── index.ts
│   │   ├── client.ts                 # Browser Supabase client
│   │   └── server.ts                 # Server Supabase client
│   ├── utils/
│   │   └── meeting-form.ts           # Meeting form utilities
│   └── validation/
│       ├── agenda.ts                 # Agenda validation schemas
│       ├── folder.ts                 # Folder validation schemas
│       ├── invitee.ts                # Invitee validation schemas
│       ├── meeting.ts                # Meeting validation schemas
│       └── team.ts                   # Team validation schemas
├── types/
│   ├── action.ts                     # Action item types, status enum, priority levels
│   ├── agenda.ts                     # Agenda types
│   ├── calendar.ts                   # Calendar types
│   ├── document.ts                   # Document types
│   ├── email-draft.ts                # Email draft types, status config, helper functions
│   ├── folder.ts                     # Meeting folder types, colors, limits
│   ├── gmail.ts                      # Gmail integration types + OAuth constants
│   ├── insight.ts                    # Insight types
│   ├── invitee.ts                    # Invitee types
│   ├── meeting.ts                    # Meeting types (includes folderId)
│   ├── meeting-history.ts            # Types for meeting history (includes folderId, sessions, transcripts, insights, notes, stats)
│   ├── persistence.ts                # Shared persistence types (TranscriptionEntry)
│   ├── team.ts                       # Team types, roles, permissions, limits, external invitation types
│   ├── transcript-note.ts            # Transcript note types
│   └── user.ts                       # User types
├── tests/
│   ├── setup.ts                      # Vitest setup (jsdom, matchers)
│   ├── api/
│   │   └── rooms/
│   │       └── agenda.test.ts
│   ├── components/
│   │   ├── agenda/
│   │   │   └── agenda-progress.test.tsx
│   │   ├── agenda-builder/
│   │   │   └── agenda-builder.test.tsx
│   │   ├── meeting/
│   │   │   └── meeting-notes-panel.test.tsx
│   │   └── meeting-room/
│   │       └── join-sequencing.test.tsx
│   ├── hooks/
│   │   └── use-notes-panel.test.ts
│   ├── lib/
│   │   ├── utils.test.ts
│   │   ├── db/
│   │   │   ├── agenda.test.ts
│   │   │   └── agenda.integration.test.ts
│   │   └── validation/
│   │       └── agenda.test.ts
│   └── types/
│       └── agenda.test.ts
├── public/
│   ├── pdf.worker.min.mjs            # PDF.js worker for react-pdf
│   ├── blue_avatar.webp              # User avatar images
│   ├── green_avatar.webp
│   ├── orange_avatar.webp
│   ├── purple_avatar.webp
│   ├── red_avatar.webp
│   ├── image1.png
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg                      # Next.js logo
│   ├── vercel.svg
│   └── window.svg
├── components.json                   # shadcn/ui configuration
├── drizzle.config.ts                 # Drizzle ORM configuration
├── eslint.config.mjs                 # ESLint configuration
├── next-env.d.ts                     # Next.js TypeScript declarations
├── next.config.ts                    # Next.js configuration
├── package.json                      # Project dependencies
├── package-lock.json                 # Dependency lock file
├── postcss.config.mjs                # PostCSS configuration
├── proxy.ts                          # Next.js 16 route protection middleware
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Vitest test configuration (if exists)
```
