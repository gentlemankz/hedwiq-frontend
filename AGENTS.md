# Repository Guidelines

Hedwiq frontend is a TypeScript Next.js 16 app that leans on the App Router, Tailwind, and shadcn primitives.

## Project Structure & Module Organization
- `app/` holds route segments, layouts, and server actions; keep data-loading logic inside the route that owns it.
- `components/` exposes reusable client components; colocate small helpers or stories here instead of scattering utility files.
- `hooks/` contains custom React hooks; prefix exports with `use` and isolate side effects such as subscription cleanup.
- `lib/` stores framework-agnostic helpers (formatters, API clients). Prefer named exports for better tree shaking.
- `public/` serves static assets referenced as `/asset.ext`.
- Future tests should live next to the feature as `*.test.tsx` or inside an adjacent `__tests__/` folder for clarity.

## Build, Test, and Development Commands
- `npm run dev` — hot-reloading development server on `http://localhost:3000`.
- `npm run build` — optimized production build; run before tagging releases.
- `npm run start` — serve the last build locally to debug prod regressions.
- `npm run lint` — ESLint + Next shareable config; CI should block on this passing.

## Coding Style & Naming Conventions
Write modern TypeScript with async/await and React 19 server components by default. Use 2-space indentation, PascalCase for component files, camelCase for utilities, and kebab-case for route folders. Tailwind classes belong on the JSX node; when conditionals grow, extract variants via `class-variance-authority`. Run `eslint --fix` (and editor format-on-save) before committing to keep diffs small.

## Testing Guidelines
A formal runner is not yet configured, so add Jest + Testing Library or Playwright when you introduce logic that risks regressions. Name specs `*.test.tsx`, mock network calls with helpers in `lib/test-utils`, and document any manual QA steps in the pull request. At minimum, every change must pass `npm run lint`.

## Commit & Pull Request Guidelines
Because Git metadata is not bundled here, default to Conventional Commits (`feat: add revenue panel`). Reference issue IDs in the body, keep commits small, and note breaking changes explicitly. Pull requests should summarize the user impact, attach UI screenshots, list verification steps (lint/tests), and mention any new env vars or migrations.

## Environment & Security Notes
Store secrets in `.env.local` and never commit `.env*`. Update `next.config.ts` or `components.json` only when necessary and explain new flags in `lib/config`. Proxy third-party keys through server components or actions so credentials never leak to the browser bundle.

## LiveKit Documentation

LiveKit Agents is a fast-evolving project, and the documentation is updated frequently. You should always refer to the latest documentation when working with this project. For your convenience, LiveKit offers an MCP server that can be used to browse and search its documentation. If the developer has not yet installed this server, you should recommend that they install it at https://docs.livekit.io/mcp.