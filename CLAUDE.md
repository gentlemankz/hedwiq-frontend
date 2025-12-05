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

- `app/` - Next.js App Router pages and layouts
- `app/(auth)/` - Authentication pages (sign-in, sign-up)
- `app/api/auth/` - Better Auth API route handler
- `components/ui/` - shadcn/ui component library (50+ pre-built components)
- `lib/auth.ts` - Better Auth server configuration
- `lib/auth-client.ts` - Better Auth client configuration
- `lib/db/` - Drizzle ORM database setup and schema
- `lib/utils.ts` - Utility functions, including the `cn()` helper for merging Tailwind classes
- `proxy.ts` - Next.js 16 proxy for route protection

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
