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
│   │   ├── layout.tsx                # Auth pages layout
│   │   └── sign-in/
│   │       └── page.tsx              # Sign-in page
│   ├── (public)/                     # Public route group (no auth required)
│   │   └── rsvp/
│   │       └── [token]/
│   │           └── page.tsx          # Public RSVP page for email link responses
│   ├── api/                          # API routes
│   │   ├── auth/[...all]/
│   │   │   └── route.ts              # Better Auth catch-all handler
│   │   ├── documents/
│   │   │   ├── [documentId]/
│   │   │   │   ├── route.ts          # Get/delete document endpoint
│   │   │   │   └── pdf/
│   │   │   │       └── route.ts      # Serve PDF via Supabase signed URL
│   │   │   ├── route.ts              # List documents for a room
│   │   │   └── upload/
│   │   │       └── route.ts          # Document upload to Supabase Storage
│   │   ├── livekit/token/
│   │   │   └── route.ts              # LiveKit token generation endpoint
│   │   ├── meetings/                 # Meeting CRUD API (Phase 1 Scheduling)
│   │   │   ├── route.ts              # GET (list), POST (create) meetings
│   │   │   └── [meetingId]/
│   │   │       ├── route.ts          # GET, PATCH, DELETE single meeting
│   │   │       ├── calendar.ics/
│   │   │       │   └── route.ts      # ICS calendar file download endpoint
│   │   │       ├── invite/
│   │   │       │   └── route.ts      # POST: Send invitations to meeting
│   │   │       └── invitees/
│   │   │           └── route.ts      # GET: List invitees, DELETE: Remove invitee
│   │   ├── rooms/
│   │   │   └── [roomId]/
│   │   │       ├── access/
│   │   │       │   └── route.ts      # Room participation recording endpoint
│   │   │       ├── meeting/
│   │   │       │   └── route.ts      # Get meeting + agenda for pre-join screen
│   │   │       └── agenda/           # Meeting agenda lifecycle
│   │   │           ├── publish/
│   │   │           │   └── route.ts  # Publish draft agenda (locks items)
│   │   │           ├── reorder/
│   │   │           │   └── route.ts  # Reorder draft agenda items
│   │   │           └── route.ts      # Get/upsert agenda with items
│   │   └── rsvp/
│   │       └── [token]/
│   │           └── route.ts          # GET/POST: Public RSVP status endpoint
│   ├── dashboard/
│   │   ├── dashboard-client.tsx      # Dashboard client with meeting list
│   │   └── page.tsx                  # Dashboard page (fetches meetings)
│   ├── meetings/
│   │   └── [roomId]/                 # Dynamic room routes
│   │       ├── components/           # Room-specific components
│   │       │   ├── agenda-builder/   # Pre-join agenda creation (Phase 2)
│   │       │   │   ├── add-topic-dialog.tsx   # Modal form with validation
│   │       │   │   ├── agenda-builder.tsx     # Agenda list + stats + add button
│   │       │   │   ├── agenda-item.tsx        # Inline edit/delete + drag handle
│   │       │   │   ├── sortable-list.tsx      # dnd-kit wiring for reordering
│   │       │   │   └── index.ts               # Barrel export
│   │       │   ├── media-controls.tsx
│   │       │   ├── meeting-layout.tsx  # Sidebar tabs + document viewer modal
│   │       │   ├── username-form.tsx
│   │       │   └── video-preview.tsx
│   │       ├── meeting-room.tsx      # LiveKit room wrapper with providers
│   │       ├── page.tsx
│   │       └── pre-join-screen.tsx   # Pre-join flow + agenda builder
│   ├── globals.css                   # Global styles with LiveKit theme integration
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Landing page
├── components/
│   ├── documents/                    # Document reference components (Phase 3)
│   │   ├── index.ts                  # Barrel export
│   │   ├── document-upload.tsx       # PDF upload dialog component
│   │   ├── document-reference-badge.tsx  # Inline badge for transcript refs
│   │   ├── document-viewer-modal.tsx # PDF viewer modal with reference details
│   │   └── pdf-viewer.tsx            # react-pdf viewer with bbox/text highlighting
│   ├── insights/                     # AI insights display components
│   │   ├── index.ts                  # Barrel export
│   │   ├── insight-badge.tsx         # Badge for insight types
│   │   ├── insight-card.tsx          # Individual insight display card
│   │   └── insights-summary-panel.tsx # Collapsible insights panel
│   ├── meetings/                     # Meeting scheduling components (Phase 1)
│   │   ├── index.ts                  # Barrel export
│   │   ├── meeting-type-selector.tsx # Instant vs Scheduled picker
│   │   ├── schedule-meeting-dialog.tsx # Full scheduling dialog with agenda + invitees
│   │   ├── edit-meeting-dialog.tsx   # Edit meeting dialog with agenda editing
│   │   ├── meeting-card.tsx          # Meeting in list view with RSVP summary + actions
│   │   ├── meeting-list.tsx          # List of meetings (upcoming/past)
│   │   ├── invitee-input.tsx         # Email input for adding invitees
│   │   └── manage-invitees-dialog.tsx # Dialog for managing meeting invitees + RSVP
│   ├── transcription/                # Real-time transcription components
│   │   ├── index.ts                  # Barrel export
│   │   ├── transcription-error-boundary.tsx
│   │   └── transcription-sidebar.tsx # Shows transcripts + insight/doc badges
│   └── ui/                           # shadcn/ui components (53 components)
├── contexts/                         # React context providers
│   ├── index.ts                      # Barrel export
│   ├── agenda/                       # Agenda context module (modular architecture)
│   │   ├── index.ts                  # Barrel export for agenda context
│   │   ├── agenda-context.tsx        # Main provider orchestrating all hooks
│   │   ├── types.ts                  # Context types + LiveKit interfaces
│   │   ├── constants.ts              # Agent prefix, retry settings, debug flag
│   │   ├── validators.ts             # Type guards for events + state attributes
│   │   ├── use-agenda-api.ts         # API fetch with retry/backoff logic
│   │   ├── use-agenda-computed.ts    # Memoized computed values from state
│   │   ├── use-agenda-event-processor.ts  # LiveKit event processing logic
│   │   ├── use-agenda-late-joiner-sync.ts # Late joiner sync via agent attributes
│   │   └── use-agenda-livekit.ts     # LiveKit stream subscription handler
│   ├── documents-context.tsx         # Document refs + deduplication + LiveKit stream
│   └── insights-context.tsx          # AI insights state management
├── hooks/                            # Custom React hooks
│   ├── use-agenda.ts                 # Hook for consuming agenda context with utilities
│   ├── use-insights.ts               # Hook for consuming insights context
│   ├── use-media-devices.ts          # Camera/microphone device management
│   └── use-mobile.ts                 # Mobile detection hook
├── lib/
│   ├── auth.ts                       # Better Auth server configuration
│   ├── auth-client.ts                # Better Auth client configuration
│   ├── calendar/                     # Calendar utilities (ICS, provider links)
│   │   ├── index.ts                  # Barrel export
│   │   ├── ics.ts                    # ICS file generation for meetings
│   │   ├── links.ts                  # Add-to-calendar links (Google, Outlook, Yahoo)
│   │   └── utils.ts                  # Shared calendar formatting utilities
│   ├── calendar-sync.ts              # Google Calendar sync for meetings
│   ├── google-calendar.ts            # Google Calendar API integration
│   ├── db/                           # Drizzle ORM setup
│   │   ├── agenda.ts                 # Agenda CRUD + publish/reorder + meetingId lookup
│   │   ├── meeting.ts                # Meeting CRUD (Phase 1 scheduling)
│   │   ├── invitee.ts                # Meeting invitee CRUD + RSVP operations
│   │   ├── index.ts                  # Database connection
│   │   ├── schema.ts                 # Schema: user, session, account, verification,
│   │   │                             #         roomParticipant, document, agenda, meeting,
│   │   │                             #         meetingInvitee, calendarEvent
│   │   ├── room-access.ts            # Room participation CRUD utilities
│   │   └── migrations/               # SQL migrations
│   │       ├── 0000_shallow_freak.sql
│   │       ├── 0001_right_professor_monster.sql  # roomParticipant table
│   │       ├── 0002_sleepy_redwing.sql           # document table
│   │       ├── 0003_flat_black_bolt.sql          # agenda + agenda_item tables
│   │       ├── 0004_rls_agenda_tables.sql        # RLS policies for agenda tables
│   │       ├── 0006_add_meeting_table.sql        # meeting table (Phase 1)
│   │       ├── 0009_add_agenda_meeting_id.sql    # Link agenda to meeting
│   │       ├── 0010_add_meeting_invitee_table.sql # Meeting invitees + RSVP
│   │       └── meta/                 # Migration metadata
│   ├── email/                        # Email service (Resend integration)
│   │   ├── index.ts                  # Email sending functions + batch processing
│   │   └── templates/                # React Email templates
│   │       ├── meeting-invitation.tsx  # Invitation email with RSVP buttons
│   │       ├── meeting-updated.tsx     # Meeting reschedule/update notification
│   │       └── meeting-cancelled.tsx   # Meeting cancellation notification
│   ├── supabase/                     # Supabase Storage integration
│   │   ├── index.ts                  # Barrel export + STORAGE_BUCKETS/PATHS
│   │   ├── client.ts                 # Browser client (anon key)
│   │   └── server.ts                 # Server client + signed URLs, upload/download
│   ├── utils.ts                      # Utility functions (cn, formatDuration, etc.)
│   ├── utils/                        # Shared utility modules
│   │   └── meeting-form.ts           # Meeting form utilities (TIME_OPTIONS, agenda converters)
│   ├── validation.ts                 # Zod validation schemas
│   └── validation/                   # Validation utilities
│       ├── agenda.ts                 # Agenda input/field validation (shared UI + API)
│       ├── invitee.ts                # Invitee email/RSVP validation
│       └── meeting.ts                # Meeting input/field + meeting ID validation
├── types/                            # TypeScript type definitions
│   ├── agenda.ts                     # Agenda + agenda item + LiveKit event types
│   ├── document.ts                   # Document + DocumentReference + BoundingBox types
│   ├── insight.ts                    # AI insight types
│   ├── invitee.ts                    # Meeting invitee + RSVP types
│   ├── meeting.ts                    # Meeting types + constants (Phase 1 scheduling)
│   └── user.ts                       # User-related types
├── docs/                             # Project documentation
│   ├── AGENDA_FEATURE_PLAN.md        # Agenda UX + agent integration plan
│   ├── PRD.md                        # Product Requirements Document
│   ├── startup-info.md               # Startup context
│   ├── DOCUMENT_REFERENCE_PLAN.md    # Document feature plan
│   ├── PHASE2_INSIGHTS_PLAN.md       # AI insights implementation plan
│   ├── MEETING_SCHEDULING_CALENDAR_PLAN.md # Calendar sync + scheduling plan
│   ├── CODE_REVIEW_SCHEDULE_CALENDAR.md # Code review for schedule-calendar branch
│   ├── CODE_REVIEW_INVITEE_FEATURE.md # Code review for invitee/RSVP feature
│   ├── better-auth-llm.txt           # Better Auth reference docs
│   ├── livekit-llm.txt               # LiveKit reference docs
│   └── AGENDA_PHASE2_CODE_REVIEW.md  # Code review for Phase 2 agenda builder
├── tests/                            # Vitest coverage for agenda flows
│   ├── api/rooms/agenda.test.ts      # Agenda API route tests
│   ├── lib/db/agenda.integration.test.ts # Agenda DB integration tests
│   ├── lib/db/agenda.test.ts         # Agenda DB unit tests
│   ├── lib/validation/agenda.test.ts # Agenda validation tests
│   ├── types/agenda.test.ts          # Agenda types tests
│   ├── components/agenda-builder/agenda-builder.test.tsx # Agenda builder UI tests
│   ├── components/meeting-room/join-sequencing.test.tsx  # Join order + agenda metadata
│   └── setup.ts                      # Vitest setup
├── public/                           # Static assets
│   ├── pdf.worker.min.mjs            # PDF.js worker for react-pdf
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── proxy.ts                          # Next.js 16 route protection middleware
├── drizzle.config.ts                 # Drizzle ORM configuration
├── components.json                   # shadcn/ui configuration
├── tsconfig.json                     # TypeScript configuration
├── next.config.ts                    # Next.js configuration
├── eslint.config.mjs                 # ESLint configuration
├── postcss.config.mjs                # PostCSS configuration
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

### Supabase Storage Pattern

Documents (PDFs) are stored in Supabase Storage with the following architecture:

```typescript
// Bucket: "meeting-documents"
// Path format: {roomId}/{documentId}.pdf

import { uploadFile, getSignedUrl, downloadFile, deleteFiles } from "@/lib/supabase"
import { STORAGE_BUCKETS, STORAGE_PATHS } from "@/lib/supabase"

// Upload a document
const path = STORAGE_PATHS.document(roomId, documentId)
await uploadFile(STORAGE_BUCKETS.DOCUMENTS, path, fileBuffer)

// Get a signed URL for viewing (1 hour expiry)
const url = await getSignedUrl(STORAGE_BUCKETS.DOCUMENTS, path, 3600)
```

**Important**: The server uses the service role key for storage operations (upload, delete, signed URLs). The browser client uses the anon key but document access is controlled via signed URLs generated server-side.

### Room Access Control

Room participation is tracked to control access to room-scoped resources (documents):

```typescript
import { recordRoomParticipation, isRoomParticipant, validateRoomAccess } from "@/lib/db/room-access"

// Record when user visits a room (called from page.tsx or access API)
await recordRoomParticipation(userId, roomId)

// Check if user can access room resources
const hasAccess = await isRoomParticipant(userId, roomId)

// Validate and get error message (for API routes)
const error = await validateRoomAccess(userId, roomId)
if (error) return NextResponse.json({ error }, { status: 403 })
```

The `roomParticipant` table tracks which users have visited which rooms, enabling document upload authorization without requiring explicit room ownership.

### PDF Viewer Component

The `PdfViewer` component (`components/documents/pdf-viewer.tsx`) uses react-pdf with:
- Bounding box highlighting (coordinate-based, rotation-aware)
- Fuzzy text highlighting (fallback when no bbox)
- Page navigation, zoom, and rotation controls
- Local PDF.js worker (`public/pdf.worker.min.mjs`)

```tsx
import { PdfViewer } from "@/components/documents/pdf-viewer"

<PdfViewer
  file={pdfUrl}
  initialPage={1}
  bbox={{ x0: 100, y0: 200, x1: 400, y1: 250 }}  // Optional
  highlightText="search term"                      // Fallback
  highlightPage={3}
  onPageChange={(page) => console.log(page)}
/>
```
