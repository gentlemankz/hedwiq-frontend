import { readFileSync, existsSync } from 'fs'

/**
 * Reads a secret from a file path or falls back to environment variable.
 * This supports both Docker secrets (file-based) and traditional env vars (dev).
 *
 * Production flow:
 * 1. Azure Key Vault stores secrets
 * 2. fetch-secrets.sh downloads them to /run/secrets/ (tmpfs - RAM only)
 * 3. Docker Compose mounts /run/secrets/ into containers
 * 4. This function reads from those files
 *
 * Development flow:
 * - Uses .env.local directly via process.env
 */
export function getSecret(name: string): string {
  // Convert env var name to file path (e.g., DATABASE_URL -> /run/secrets/database_url)
  const fileEnvVar = `${name}_FILE`
  const filePath = process.env[fileEnvVar]

  // Try file-based secret first (production with Key Vault)
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, 'utf8').trim()
  }

  // Check standard Docker secrets path
  const standardPath = `/run/secrets/${name.toLowerCase()}`
  if (existsSync(standardPath)) {
    return readFileSync(standardPath, 'utf8').trim()
  }

  // Fall back to environment variable (development)
  const value = process.env[name]
  if (value) {
    return value
  }

  throw new Error(`Secret ${name} not found. Set ${name} env var or ${fileEnvVar} file path.`)
}

/**
 * Gets a secret with an optional default value.
 * Returns the default if the secret is not found instead of throwing.
 */
export function getSecretOrDefault(name: string, defaultValue: string): string {
  try {
    return getSecret(name)
  } catch {
    return defaultValue
  }
}

/**
 * Checks if a secret exists without throwing an error.
 */
export function hasSecret(name: string): boolean {
  try {
    getSecret(name)
    return true
  } catch {
    return false
  }
}

// Pre-loaded secrets for use across the application
// These are loaded lazily to avoid errors at import time
let _secrets: Record<string, string> | null = null

export function getSecrets() {
  if (_secrets) {
    return _secrets
  }

  _secrets = {
    // Better Auth
    betterAuthSecret: getSecret('BETTER_AUTH_SECRET'),
    betterAuthUrl: getSecretOrDefault('BETTER_AUTH_URL', 'http://localhost:3000'),
    betterAuthTrustedOrigins: getSecretOrDefault('BETTER_AUTH_TRUSTED_ORIGINS', 'http://localhost:3000'),

    // Google OAuth
    googleClientId: getSecret('GOOGLE_CLIENT_ID'),
    googleClientSecret: getSecret('GOOGLE_CLIENT_SECRET'),

    // Database
    databaseUrl: getSecret('DATABASE_URL'),

    // LiveKit
    livekitUrl: getSecret('LIVEKIT_URL'),
    livekitApiKey: getSecret('LIVEKIT_API_KEY'),
    livekitApiSecret: getSecret('LIVEKIT_API_SECRET'),

    // Supabase
    supabaseUrl: getSecretOrDefault('SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
    supabaseAnonKey: getSecretOrDefault('SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
    supabaseServiceRoleKey: getSecret('SUPABASE_SERVICE_ROLE_KEY'),

    // Internal Services
    agentServiceUrl: getSecretOrDefault('AGENT_SERVICE_URL', 'http://localhost:8000'),
    internalServiceToken: getSecret('INTERNAL_SERVICE_TOKEN'),

    // Polar Payments
    polarAccessToken: getSecret('POLAR_ACCESS_TOKEN'),
    polarWebhookSecret: getSecret('POLAR_WEBHOOK_SECRET'),
    polarEnvironment: getSecretOrDefault('POLAR_ENVIRONMENT', 'sandbox'),

    // Email
    resendApiKey: getSecretOrDefault('RESEND_API_KEY', ''),
    emailFrom: getSecretOrDefault('EMAIL_FROM', ''),
    smtpHost: getSecretOrDefault('SMTP_HOST', 'smtp.gmail.com'),
    smtpPort: getSecretOrDefault('SMTP_PORT', '587'),
    smtpUser: getSecretOrDefault('SMTP_USER', ''),
    smtpPass: getSecretOrDefault('SMTP_PASS', ''),
    smtpFrom: getSecretOrDefault('SMTP_FROM', ''),
    smtpFromName: getSecretOrDefault('SMTP_FROM_NAME', 'Luframe'),
  }

  return _secrets
}
