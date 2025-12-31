/**
 * External URL Configuration
 *
 * Centralized configuration for external URLs used across the application.
 * This allows easy updates and environment-specific overrides.
 */

// Base URL for the landing/marketing site
const LANDING_BASE_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "https://luframe.com";

/**
 * External URLs configuration object
 */
export const externalUrls = {
  /** Terms of Service page */
  terms: `${LANDING_BASE_URL}/terms`,

  /** Privacy Policy page */
  privacy: `${LANDING_BASE_URL}/privacy`,

  /** Contact page */
  contact: `${LANDING_BASE_URL}/contact`,

  /** Main landing page */
  home: LANDING_BASE_URL,
} as const;

export type ExternalUrlKey = keyof typeof externalUrls;
