/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts, before any other code.
 * It loads secrets from Docker secrets files (/run/secrets/) into process.env.
 *
 * Production flow:
 * 1. Azure Key Vault stores secrets
 * 2. fetch-secrets.sh downloads them to /run/secrets/ (tmpfs - RAM only)
 * 3. Docker Compose mounts /run/secrets/ into containers
 * 4. This instrumentation loads them into process.env at startup
 *
 * Development flow:
 * - Uses .env.local directly (no file-based secrets)
 */

import { readFileSync, existsSync } from 'fs'

export async function register() {
  // Only run on server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  // Skip in development (uses .env.local)
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  console.log('[instrumentation] Loading secrets from /run/secrets/...')

  // Map of environment variable names to their secret file paths
  const secretMappings: [string, string][] = [
    // Database
    ['DATABASE_URL', '/run/secrets/database_url'],

    // Better Auth
    ['BETTER_AUTH_SECRET', '/run/secrets/better_auth_secret'],
    ['BETTER_AUTH_URL', '/run/secrets/better_auth_url'],
    ['BETTER_AUTH_TRUSTED_ORIGINS', '/run/secrets/better_auth_trusted_origins'],

    // Google OAuth
    ['GOOGLE_CLIENT_ID', '/run/secrets/google_client_id'],
    ['GOOGLE_CLIENT_SECRET', '/run/secrets/google_client_secret'],

    // Polar Payments
    ['POLAR_ACCESS_TOKEN', '/run/secrets/polar_access_token'],
    ['POLAR_ENVIRONMENT', '/run/secrets/polar_environment'],
    ['POLAR_WEBHOOK_SECRET', '/run/secrets/polar_webhook_secret'],

    // LiveKit
    ['LIVEKIT_API_KEY', '/run/secrets/livekit_api_key'],
    ['LIVEKIT_API_SECRET', '/run/secrets/livekit_api_secret'],
    ['LIVEKIT_URL', '/run/secrets/livekit_url'],

    // Supabase
    ['SUPABASE_URL', '/run/secrets/supabase_url'],
    ['SUPABASE_ANON_KEY', '/run/secrets/supabase_anon_key'],
    ['SUPABASE_SERVICE_ROLE_KEY', '/run/secrets/supabase_service_role_key'],

    // Email
    ['RESEND_API_KEY', '/run/secrets/resend_api_key'],
  ]

  let loadedCount = 0

  for (const [envVar, filePath] of secretMappings) {
    // Skip if already set (allows override via env vars)
    if (process.env[envVar]) {
      continue
    }

    // Also check _FILE suffix pattern (Docker Compose convention)
    const fileEnvVar = `${envVar}_FILE`
    const customPath = process.env[fileEnvVar]
    const pathToRead = customPath || filePath

    if (existsSync(pathToRead)) {
      try {
        const value = readFileSync(pathToRead, 'utf8').trim()
        if (value) {
          process.env[envVar] = value
          loadedCount++
        }
      } catch (error) {
        console.error(`[instrumentation] Failed to read ${pathToRead}:`, error)
      }
    }
  }

  console.log(`[instrumentation] Loaded ${loadedCount} secrets from files`)
}
