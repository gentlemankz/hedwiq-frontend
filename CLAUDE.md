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
│   │   ├── gmail/                    # Gmail OAuth for Real-Time Actions
│   │   │   ├── connect/route.ts      # Start Gmail OAuth flow
│   │   │   ├── callback/route.ts     # OAuth callback handler
│   │   │   ├── status/route.ts       # Connection status for user
│   │   │   └── disconnect/route.ts   # Revoke Gmail connection
│   │   ├── livekit/token/route.ts    # LiveKit token generation endpoint
│   │   ├── meetings/                 # Meeting CRUD + invites + persistence
│   │   │   ├── route.ts              # List/create meetings
│   │   │   ├── history/route.ts      # User's past meetings list with stats
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
│   │   └── rsvp/[token]/route.ts     # Public RSVP status endpoint
│   ├── dashboard/                    # Dashboard shell + meeting loader
│   │   ├── dashboard-client.tsx
│   │   └── page.tsx
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
│   ├── documents/
│   │   ├── document-reference-badge.tsx
│   │   ├── document-upload.tsx
│   │   ├── document-viewer-modal.tsx
│   │   ├── pdf-viewer.tsx
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
│   │   ├── past-meeting-card.tsx     # Card for displaying past meeting summary
│   │   ├── past-meetings-list.tsx    # Paginated list of past meetings
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
│   ├── insights-context.tsx          # AI insights state management
│   └── meeting-persistence-context.tsx # Meeting data persistence (transcripts, insights, notes)
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
│   │   ├── gmail.ts                  # Gmail integration CRUD operations
│   │   ├── invitee.ts
│   │   ├── meeting.ts
│   │   ├── meeting-data.ts           # Meeting persistence (sessions, transcripts, insights, notes)
│   │   ├── room-access.ts
│   │   ├── schema.ts                 # Includes gmail_integration, meeting_session, transcription_segment, meeting_insight, document_reference, meeting_note tables
│   │   ├── index.ts
│   │   └── migrations/               # SQL + meta snapshots
│   │       ├── 0011_add_meeting_data_tables.sql  # Meeting data persistence tables
│   │       └── 0013_add_gmail_integration.sql    # Gmail OAuth integration table
│   ├── email/
│   │   ├── index.ts
│   │   └── templates/{meeting-invitation.tsx, meeting-updated.tsx, meeting-cancelled.tsx}
│   ├── supabase/{client.ts, server.ts, index.ts}
│   ├── utils.ts                      # Includes formatDurationCompact, formatMeetingDate, formatMeetingTime
│   ├── utils/meeting-form.ts
│   ├── validation.ts
│   └── validation/{agenda.ts, invitee.ts, meeting.ts}
├── types/
│   ├── agenda.ts
│   ├── calendar.ts
│   ├── document.ts
│   ├── gmail.ts                      # Gmail integration types + OAuth constants
│   ├── insight.ts
│   ├── invitee.ts
│   ├── meeting.ts
│   ├── meeting-history.ts            # Types for meeting history (sessions, transcripts, insights, notes, stats)
│   ├── persistence.ts                # Shared persistence types (TranscriptionEntry)
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

### Meeting Data Persistence

Meeting data (transcriptions, insights, document references, notes) is persisted to the database for post-meeting review.

#### Database Tables (schema.ts)

- `meeting_session` - Tracks user participation (join/leave times, duration)
- `transcription_segment` - Speech-to-text segments with speaker info
- `meeting_insight` - AI-detected insights (action items, decisions, questions)
- `document_reference` - AI-detected document mentions with page/section
- `meeting_note` - User-created notes (block-based with transcript references)

#### Persistence Context

```tsx
import { MeetingPersistenceProvider, useMeetingPersistence } from "@/contexts/meeting-persistence-context"

// Wrap your meeting room component
<MeetingPersistenceProvider meetingId={meetingId} enabled={true}>
  <MeetingRoom />
</MeetingPersistenceProvider>

// In child components, queue data for persistence
const { queueTranscription, queueInsights, queueDocumentReferences, saveNotes } = useMeetingPersistence()

// Queue transcription (auto-batched every 30s)
queueTranscription(transcriptionEntries)

// Queue insights
queueInsights(insights)

// Save notes (debounced)
saveNotes(blocks, transcriptNotes)
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings/[id]/session` | POST | Create session on join |
| `/api/meetings/[id]/session` | PATCH | End session on leave |
| `/api/meetings/[id]/data` | POST | Bulk save transcripts/insights/refs |
| `/api/meetings/[id]/notes` | POST | Save user notes |
| `/api/meetings/[id]/notes` | GET | Get user notes (or all with `?all=true`) |
| `/api/meetings/[id]/history` | GET | Full meeting history with all data |
| `/api/meetings/history` | GET | User's past meetings list |

#### Data Access Functions (lib/db/meeting-data.ts)

```typescript
import {
  createMeetingSession,
  endMeetingSession,
  saveTranscriptionSegments,
  saveInsights,
  saveDocumentReferences,
  saveMeetingNotes,
  getMeetingHistory,
  getUserMeetingHistory,
} from "@/lib/db/meeting-data"
```

#### Meeting History View

After a meeting ends, users can view the full history at `/meetings/[roomId]/history`:
- **Transcription tab**: Full searchable transcript
- **Insights tab**: Grouped by type (action items, decisions, etc.)
- **Documents tab**: Referenced documents with page/section links
- **Notes tab**: All participant notes (host sees all, others see their own)

### Gmail OAuth Integration (Real-Time Actions)

Gmail OAuth integration enables sending AI-drafted follow-up emails from meetings.

#### OAuth Flow

```typescript
import { getGmailIntegration, upsertGmailIntegration } from "@/lib/db/gmail"
import { buildGmailAuthUrl, exchangeGmailCodeForTokens } from "@/lib/gmail-oauth"

// Check connection status
const integration = await getGmailIntegration(userId)
const isConnected = integration?.status === "connected"

// Initiate OAuth flow
const authUrl = buildGmailAuthUrl(state, redirectUri)

// After callback, store tokens
await upsertGmailIntegration({
  userId,
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  tokenExpiresAt: calculateGmailTokenExpiry(tokens.expires_in),
  gmailEmail: userInfo.email,
})
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gmail/connect` | GET | Initiate Gmail OAuth flow |
| `/api/gmail/callback` | GET | Handle OAuth callback from Google |
| `/api/gmail/status` | GET | Get Gmail connection status |
| `/api/gmail/disconnect` | POST | Disconnect Gmail integration |

#### Gmail Scopes

Uses minimal scopes required for sending emails:
- `gmail.send` - Send emails on behalf of user
- `userinfo.email` - Get user's email address

**Note:** Does NOT use `gmail.compose` (restricted scope) - drafts are stored locally in our database.

#### UI Component

```tsx
import { GmailStatusCard } from "@/components/gmail"

<GmailStatusCard
  initialConnected={false}
  onConnectionChange={(connected) => console.log(connected)}
/>
```

#### Database Table: `gmail_integration`

- `id` - Unique identifier
- `user_id` - User who connected Gmail
- `access_token` - OAuth access token (encrypted at rest)
- `refresh_token` - OAuth refresh token (encrypted at rest)
- `token_expires_at` - Token expiry timestamp
- `gmail_email` - Email associated with the Gmail account
- `status` - Connection status (connected, disconnected, error)
- `error_message` - Error details if status is 'error'

#### Token Refresh

Tokens are automatically refreshed when expiring within 5 minutes:

```typescript
import { getValidGmailToken } from "@/lib/db/gmail"

// Gets valid token, refreshing if needed
const result = await getValidGmailToken(userId)
if (result) {
  const { accessToken, gmailEmail } = result
  // Use accessToken to send emails via Gmail API
}
```
