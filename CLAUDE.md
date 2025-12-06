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
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group
│   │   └── sign-in/              # Sign-in page
│   ├── api/                      # API routes
│   │   ├── auth/[...all]/        # Better Auth catch-all handler
│   │   └── livekit/token/        # LiveKit token generation endpoint
│   ├── dashboard/                # Dashboard page with client component
│   ├── meetings/                 # Meeting pages
│   │   └── [roomId]/             # Dynamic room routes
│   │       ├── components/       # Room-specific components
│   │       │   ├── media-controls.tsx
│   │       │   ├── meeting-layout.tsx
│   │       │   ├── username-form.tsx
│   │       │   └── video-preview.tsx
│   │       ├── meeting-room.tsx
│   │       ├── page.tsx
│   │       └── pre-join-screen.tsx
│   ├── globals.css               # Global styles with LiveKit theme integration
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page
├── components/
│   ├── transcription/            # Real-time transcription components
│   │   ├── index.ts
│   │   ├── transcription-error-boundary.tsx
│   │   └── transcription-sidebar.tsx
│   └── ui/                       # shadcn/ui components (53 components)
├── hooks/                        # Custom React hooks
│   ├── use-media-devices.ts      # Camera/microphone device management
│   └── use-mobile.ts             # Mobile detection hook
├── lib/
│   ├── auth.ts                   # Better Auth server configuration
│   ├── auth-client.ts            # Better Auth client configuration
│   ├── db/                       # Drizzle ORM setup
│   │   ├── index.ts              # Database connection
│   │   ├── schema.ts             # Database schema definitions
│   │   └── migrations/           # SQL migrations
│   ├── utils.ts                  # Utility functions (cn helper, etc.)
│   └── validation.ts             # Zod validation schemas
├── types/                        # TypeScript type definitions
│   └── user.ts                   # User-related types
├── docs/                         # Project documentation
│   ├── PRD.md                    # Product Requirements Document
│   └── startup-info.md           # Startup context
├── public/                       # Static assets
└── proxy.ts                      # Next.js 16 route protection middleware
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
BETTER_AUTH_SECRET          # Auth secret key (openssl rand -base64 32)
BETTER_AUTH_URL             # App URL (http://localhost:3000)
BETTER_AUTH_TRUSTED_ORIGINS # Comma-separated trusted origins
NEXT_PUBLIC_APP_URL         # Public app URL for client
GOOGLE_CLIENT_ID            # Google OAuth client ID
GOOGLE_CLIENT_SECRET        # Google OAuth client secret
DATABASE_URL                # PostgreSQL connection string
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
