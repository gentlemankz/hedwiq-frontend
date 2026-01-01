# syntax=docker/dockerfile:1.7

# =============================================================================
# STAGE 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps

# Check https://github.com/nodejs/docker-node/tree/main#nodealpine
# for understanding why libc6-compat might be needed
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install dependencies with clean install (ci) for reproducibility
# Using --ignore-scripts to skip postinstall in deps stage
RUN npm ci --ignore-scripts

# =============================================================================
# STAGE 2: Builder
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run postinstall script (copies pdf.worker.min.mjs to public)
RUN npm run postinstall || true

# Build-time environment variables (public only - these are embedded in JS)
# These MUST be converted from ARG to ENV so Next.js can access them during build
ARG NEXT_PUBLIC_LIVEKIT_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Convert ARGs to ENVs - required for Next.js to embed them in the client bundle
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# =============================================================================
# STAGE 3: Runner (Production)
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security (MANDATORY for production)
# Using explicit UID/GID for consistency across rebuilds
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3000

# Set hostname to listen on all interfaces
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check - verify the app is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
