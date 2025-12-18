# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Documentation Resources

### LiveKit Documentation

LiveKit Agents is a fast-evolving project, and the documentation is updated frequently. You should always refer to the latest documentation when working with this project. For your convenience, LiveKit offers an MCP server that can be used to browse and search its documentation. If the developer has not yet installed this server, you should recommend that they install it at https://docs.livekit.io/mcp.

### Better Auth Documentation

Better Auth is our authentication solution. An MCP server is available for Better Auth documentation. Use it to look up API references, configuration options, and best practices. Do NOT confuse Better Auth with NextAuth - they are completely different packages.

## Architecture

This is a Next.js 16 application using the App Router with React 19 and TypeScript.

### Directory Structure

```
frontend/
├── AGENTS.md                         # Agent-specific instructions
├── README.md                         # Project README
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Auth route group
│   │   ├── layout.tsx                # Shared auth layout
│   │   └── sign-in/page.tsx          # Sign-in page
│   ├── (public)/                     # Public route group (no auth required)
│   │   └── rsvp/[token]/page.tsx     # Public RSVP landing
│   ├── api/                          # API routes
│   │   ├── auth/[...all]/route.ts    # Better Auth catch-all handler
│   │   ├── calendar/                 # Google Calendar OAuth + sync
│   │   │   ├── connect/route.ts      # Start OAuth flow
│   │   │   ├── callback/route.ts     # OAuth callback handler
│   │   │   ├── status/route.ts       # Connection status for user
│   │   │   ├── events/route.ts       # Fetch calendar events for meetings
│   │   │   └── disconnect/route.ts   # Revoke calendar connection
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
│   │   ├── gmail/                    # Gmail OAuth for Real-Time Actions
│   │   │   ├── connect/route.ts      # Start Gmail OAuth flow
│   │   │   ├── callback/route.ts     # OAuth callback handler
│   │   │   ├── status/route.ts       # Connection status for user
│   │   │   ├── disconnect/route.ts   # Revoke Gmail connection
│   │   │   └── send/route.ts         # Send email via Gmail API
│   │   ├── livekit/token/route.ts    # LiveKit token generation endpoint
│   │   ├── meetings/                 # Meeting CRUD + invites + persistence
│   │   │   ├── route.ts              # List/create meetings
│   │   │   ├── history/route.ts      # User's past meetings list with stats
│   │   │   ├── bulk-move/route.ts    # Bulk move meetings to folder
│   │   │   └── [meetingId]/
│   │   │       ├── route.ts          # Get/update/delete a meeting
│   │   │       ├── calendar.ics/route.ts # ICS download
│   │   │       ├── invite/route.ts   # Send invitations
│   │   │       ├── invitees/route.ts # List/remove invitees
│   │   │       ├── session/route.ts  # Session tracking (join/leave)
│   │   │       ├── data/route.ts     # Bulk save transcription/insights/refs
│   │   │       ├── notes/route.ts    # User notes CRUD
│   │   │       └── history/route.ts  # Full meeting history with all data
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
│   │       ├── reorder/route.ts      # Bulk reorder teams
│   │       └── [teamId]/
│   │           ├── route.ts          # Get/update/delete team
│   │           ├── subteams/route.ts # List/create sub-teams
│   │           └── members/
│   │               ├── route.ts      # List/invite team members
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
│   │   └── settings/
│   │       └── page.tsx              # User preferences (stub)
│   ├── meetings/[roomId]/            # Dynamic room routes
│   │   ├── components/
│   │   │   ├── agenda-builder/
│   │   │   │   ├── add-topic-dialog.tsx
│   │   │   │   ├── agenda-builder.tsx
│   │   │   │   ├── agenda-item.tsx
│   │   │   │   ├── sortable-list.tsx
│   │   │   │   └── index.ts
│   │   │   ├── media-controls.tsx
│   │   │   ├── meeting-layout.tsx    # Sidebar tabs + document viewer modal
│   │   │   ├── username-form.tsx
│   │   │   └── video-preview.tsx
│   │   ├── history/                  # Meeting history view (post-meeting)
│   │   │   ├── page.tsx              # Server component with auth + data fetch
│   │   │   └── meeting-history-view.tsx # Client component with tabs UI
│   │   ├── meeting-room.tsx          # LiveKit room wrapper with providers
│   │   ├── pre-join-screen.tsx       # Pre-join flow + agenda builder
│   │   └── page.tsx
│   ├── globals.css                   # Global styles with LiveKit theme integration
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Landing page
├── components/
│   ├── agenda/
│   │   ├── agenda-progress-item.tsx
│   │   ├── agenda-progress.tsx
│   │   └── progress-indicator.tsx
│   ├── calendar/
│   │   ├── calendar-status-card.tsx
│   │   └── index.ts
│   ├── folders/                      # Meeting folder UI components
│   │   ├── delete-folder-dialog.tsx  # Confirmation dialog for folder deletion
│   │   ├── edit-folder-dialog.tsx    # Dialog for editing folder name/color
│   │   ├── folder-color-dot.tsx      # Reusable folder color indicator
│   │   ├── folder-select.tsx         # Dropdown select for choosing folders
│   │   └── index.ts
│   ├── layout/                       # Layout components
│   │   ├── dashboard-sidebar.tsx     # Dashboard sidebar with folders nav
│   │   └── index.ts
│   ├── documents/
│   │   ├── document-reference-badge.tsx
│   │   ├── document-upload.tsx
│   │   ├── document-viewer-modal.tsx
│   │   ├── pdf-viewer.tsx
│   │   └── index.ts
│   ├── email-drafts/
│   │   ├── email-draft-card.tsx    # Collapsible email draft card with inline editing
│   │   ├── email-draft-panel.tsx   # Email drafts panel with tabs (Pending/Sent/Dismissed)
│   │   └── index.ts
│   ├── gmail/
│   │   ├── gmail-status-card.tsx
│   │   └── index.ts
│   ├── insights/
│   │   ├── insight-badge.tsx
│   │   ├── insight-card.tsx
│   │   ├── insights-summary-panel.tsx
│   │   └── index.ts
│   ├── meeting/
│   │   ├── custom-control-bar.tsx
│   │   ├── meeting-info-header.tsx
│   │   ├── meeting-notes-panel.tsx
│   │   └── index.ts
│   ├── meetings/
│   │   ├── edit-meeting-dialog.tsx
│   │   ├── invitee-input.tsx
│   │   ├── manage-invitees-dialog.tsx
│   │   ├── meeting-card.tsx
│   │   ├── meeting-list.tsx
│   │   ├── meeting-type-selector.tsx
│   │   ├── schedule-meeting-dialog.tsx
│   │   ├── past-meeting-card.tsx     # Card with selection mode + move to folder action
│   │   ├── past-meetings-list.tsx    # Paginated list with bulk selection + move
│   │   ├── move-meeting-to-folder-dialog.tsx # Dialog for single/bulk meeting move
│   │   └── index.ts
│   ├── participant/
│   │   ├── custom-participant-tile.tsx
│   │   ├── custom-video-conference.tsx
│   │   ├── use-is-encrypted.ts
│   │   └── index.ts
│   ├── transcript-notes/
│   │   ├── add-transcript-note-popover.tsx
│   │   ├── transcript-note-card.tsx
│   │   └── index.ts
│   ├── transcription/
│   │   ├── transcription-error-boundary.tsx
│   │   ├── transcription-sidebar.tsx
│   │   └── index.ts
│   └── ui/                           # shadcn/ui components (50+ primitives)
├── contexts/
│   ├── index.ts                      # Barrel export
│   ├── agenda/
│   │   ├── agenda-context.tsx        # Main provider orchestrating all hooks
│   │   ├── constants.ts              # Agent prefix, retry settings, debug flag
│   │   ├── types.ts                  # Context types + LiveKit interfaces
│   │   ├── validators.ts             # Type guards for events + state attributes
│   │   ├── use-agenda-api.ts         # API fetch with retry/backoff logic
│   │   ├── use-agenda-computed.ts    # Memoized computed values from state
│   │   ├── use-agenda-event-processor.ts  # LiveKit event processing logic
│   │   ├── use-agenda-late-joiner-sync.ts # Late joiner sync via agent attributes
│   │   └── use-agenda-livekit.ts     # LiveKit stream subscription handler
│   ├── documents-context.tsx         # Document refs + deduplication + LiveKit stream
│   ├── email-drafts-context.tsx      # Email draft state management + LiveKit stream subscription
│   ├── insights-context.tsx          # AI insights state management
│   ├── meeting-persistence-context.tsx # Meeting data persistence (transcripts, insights, notes)
│   └── sidebar-context.tsx           # Dashboard sidebar UI state + folders CRUD
├── hooks/
│   ├── use-agenda.ts                 # Agenda context consumer utilities
│   ├── use-block-notes.ts            # Block-based notes (text + transcript refs) w/ storage + migration
│   ├── use-insights.ts
│   ├── use-media-devices.ts
│   ├── use-mobile.ts
│   └── use-notes-panel.ts            # Legacy notes panel state
├── lib/
│   ├── auth.ts / auth-client.ts      # Better Auth configuration
│   ├── calendar-service.ts           # Calendar sync service layer
│   ├── calendar-sync.ts              # Google Calendar sync for meetings
│   ├── calendar/ {ics.ts, links.ts, utils.ts, index.ts}
│   ├── gmail-oauth.ts                # Gmail OAuth utilities (token exchange, refresh, revoke)
│   ├── google-oauth.ts               # Google Calendar OAuth utilities
│   ├── db/                           # Drizzle ORM setup
│   │   ├── agenda.ts
│   │   ├── calendar-event.ts
│   │   ├── calendar.ts
│   │   ├── email-draft.ts            # Email draft CRUD operations (upsert, update, send tracking)
│   │   ├── folder.ts                 # Meeting folder CRUD operations
│   │   ├── gmail.ts                  # Gmail integration CRUD operations
│   │   ├── invitee.ts
│   │   ├── meeting.ts                # Meeting CRUD (includes folderId support)
│   │   ├── meeting-data.ts           # Meeting persistence (sessions, transcripts, insights, notes)
│   │   ├── room-access.ts
│   │   ├── team.ts                   # Team CRUD, members, hierarchy, permissions
│   │   ├── schema.ts                 # Includes team, team_member, team_meeting tables
│   │   ├── index.ts
│   │   └── migrations/               # SQL + meta snapshots
│   │       ├── 0011_add_meeting_data_tables.sql  # Meeting data persistence tables
│   │       ├── 0013_add_gmail_integration.sql    # Gmail OAuth integration table
│   │       ├── 0014_add_email_draft_table.sql    # Email draft + sent audit tables
│   │       ├── 0016_add_meeting_folder_table.sql # Meeting folder organization
│   │       └── 0017_add_team_tables.sql          # Team workspace tables
│   ├── email/
│   │   ├── index.ts
│   │   └── templates/{meeting-invitation.tsx, meeting-updated.tsx, meeting-cancelled.tsx}
│   ├── supabase/{client.ts, server.ts, index.ts}
│   ├── utils.ts                      # Includes formatDurationCompact, formatMeetingDate, formatMeetingTime
│   ├── utils/meeting-form.ts
│   ├── validation.ts
│   └── validation/{agenda.ts, folder.ts, invitee.ts, meeting.ts, team.ts}
├── types/
│   ├── agenda.ts
│   ├── calendar.ts
│   ├── document.ts
│   ├── email-draft.ts                # Email draft types, status config, helper functions
│   ├── folder.ts                     # Meeting folder types, colors, limits
│   ├── gmail.ts                      # Gmail integration types + OAuth constants
│   ├── insight.ts
│   ├── invitee.ts
│   ├── meeting.ts                    # Meeting types (includes folderId)
│   ├── meeting-history.ts            # Types for meeting history (includes folderId, sessions, transcripts, insights, notes, stats)
│   ├── persistence.ts                # Shared persistence types (TranscriptionEntry)
│   ├── team.ts                       # Team types, roles, permissions, limits, API request/response types
│   ├── transcript-note.ts
│   └── user.ts
├── docs/                             # Project documentation + reference notes
├── tests/
│   ├── setup.ts                      # Vitest setup (jsdom, matchers)
│   ├── api/rooms/agenda.test.ts
│   ├── components/agenda-builder/agenda-builder.test.tsx
│   ├── components/agenda/agenda-progress.test.tsx
│   ├── components/meeting-room/join-sequencing.test.tsx
│   ├── components/meeting/meeting-notes-panel.test.tsx
│   ├── hooks/use-notes-panel.test.ts
│   ├── lib/db/agenda.integration.test.ts
│   ├── lib/db/agenda.test.ts
│   ├── lib/utils.test.ts
│   ├── lib/validation/agenda.test.ts
│   └── types/agenda.test.ts
├── public/
│   ├── pdf.worker.min.mjs            # PDF.js worker for react-pdf
│   ├── blue_avatar.webp ... red_avatar.webp
│   ├── image1.png
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── proxy.ts                          # Next.js 16 route protection middleware
├── drizzle.config.ts                 # Drizzle ORM configuration
├── components.json                   # shadcn/ui configuration
├── next.config.ts                    # Next.js configuration
├── eslint.config.mjs                 # ESLint configuration
├── postcss.config.mjs                # PostCSS configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json                      # Project dependencies

```

### Key Technologies

- **Styling**: Tailwind CSS v4 with CSS variables for theming (light/dark mode via OKLCH color space)
- **UI Components**: shadcn/ui built on Radix UI primitives with class-variance-authority (CVA) for variants
- **Forms**: react-hook-form with zod for validation
- **Fonts**: Geist Sans and Geist Mono via next/font
- **Authentication**: Better Auth with Google OAuth provider
- **Database**: PostgreSQL with Drizzle ORM

### Import Aliases

Use `@/*` to import from the project root (configured in tsconfig.json):
```typescript
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { signIn, signOut, useSession } from "@/lib/auth-client"
```

### Component Pattern

UI components follow the shadcn/ui pattern:
- Use CVA for defining component variants
- Use `cn()` utility to merge class names
- Support `asChild` prop via Radix Slot for composition
- Add `data-slot` attributes for styling hooks

### Authentication Pattern

Better Auth is configured with:
- Google OAuth social provider
- Drizzle adapter with PostgreSQL
- Session cookie caching (5 min)
- 7-day session expiration
- `nextCookies()` plugin for Next.js integration

#### Server-side session access
```typescript
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const session = await auth.api.getSession({
  headers: await headers()
})
```

#### Client-side session access
```typescript
import { useSession } from "@/lib/auth-client"

const { data: session, isPending } = useSession()
```

#### Sign in with Google
```typescript
import { signIn } from "@/lib/auth-client"

await signIn.social({
  provider: "google",
  callbackURL: "/dashboard"
})
```

### Route Protection

The `proxy.ts` file (Next.js 16 convention, replaces deprecated `middleware.ts`) handles route protection:
- Protected routes: `/dashboard`, `/settings`, `/meetings`
- Auth routes: `/sign-in`, `/sign-up`
- Unauthenticated users are redirected to `/sign-in` with a callback URL
- Authenticated users are redirected away from auth pages

### Environment Variables

Required environment variables (see `.env.example`):
```
# Authentication (Better Auth)
BETTER_AUTH_SECRET          # Auth secret key (openssl rand -base64 32)
BETTER_AUTH_URL             # App URL (http://localhost:3000)
BETTER_AUTH_TRUSTED_ORIGINS # Comma-separated trusted origins
NEXT_PUBLIC_APP_URL         # Public app URL for client
GOOGLE_CLIENT_ID            # Google OAuth client ID
GOOGLE_CLIENT_SECRET        # Google OAuth client secret

# Database
DATABASE_URL                # PostgreSQL connection string

# Supabase Storage
NEXT_PUBLIC_SUPABASE_URL    # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  # Public anon key (browser client)
SUPABASE_SERVICE_ROLE_KEY   # Service role key (server-side storage ops)

# LiveKit
LIVEKIT_API_KEY             # LiveKit API key
LIVEKIT_API_SECRET          # LiveKit API secret
NEXT_PUBLIC_LIVEKIT_URL     # LiveKit WebSocket URL
```

### LiveKit Styling Integration

LiveKit React components use CSS variables prefixed with `--lk-`. These are overridden in `app/globals.css` to map to shadcn theme tokens:

```css
[data-lk-theme] {
  --lk-bg: var(--background);
  --lk-fg: var(--foreground);
  --lk-accent-bg: var(--primary);
  --lk-danger: var(--destructive);
  /* ... etc */
}
```

This ensures LiveKit components match the shadcn dark/light theme automatically.
