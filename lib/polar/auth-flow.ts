/**
 * Polar Auth Flow Utilities
 *
 * Shared utilities for handling Polar checkout flows during authentication.
 * Used by both sign-in and sign-up pages.
 */

import { authClient } from "@/lib/auth-client";
import { buildCheckoutSlug, consumePendingCheckout } from "./checkout";

/**
 * Handle post-authentication actions including pending checkout
 *
 * @param callbackURL - The URL to redirect to after checkout or if no pending checkout
 * @param router - Next.js router for navigation
 * @returns Promise that resolves when actions are complete
 */
export async function handlePostAuthCheckout(
  callbackURL: string,
  router: { push: (url: string) => void }
): Promise<void> {
  try {
    const pendingCheckout = consumePendingCheckout();

    if (pendingCheckout) {
      // Build the checkout slug and redirect to Polar checkout
      const slug = buildCheckoutSlug(pendingCheckout.plan, pendingCheckout.billing);

      if (slug) {
        // Trigger Polar checkout - this will redirect to Polar's checkout page
        await authClient.checkout({ slug });
        // Note: The checkout redirect happens automatically,
        // so we don't need to manually redirect here
        return;
      }

      // If slug building failed, log and continue to dashboard
      console.warn("[Auth Flow] Failed to build checkout slug, redirecting to dashboard");
    }

    // No pending checkout or invalid slug, just go to callback URL
    router.push(callbackURL);
  } catch (checkoutError) {
    console.error("[Auth Flow] Error during checkout:", checkoutError);
    // If checkout fails, still redirect to dashboard
    // User can upgrade later from the dashboard
    router.push(callbackURL);
  }
}

/**
 * Format a plan slug for display (capitalize first letter)
 *
 * @param planSlug - The plan slug (e.g., "pro", "business")
 * @returns Formatted plan name (e.g., "Pro", "Business")
 */
export function formatPlanName(planSlug: string): string {
  if (!planSlug) return "";
  return planSlug.charAt(0).toUpperCase() + planSlug.slice(1);
}

/**
 * Build callback URL for OAuth flows with checkout pending flag
 *
 * Preserves the original callback URL (including team_invite tokens, deep links, etc.)
 * and appends the checkout_pending flag when needed.
 *
 * @param baseCallbackURL - The base callback URL (may include query params like team_invite)
 * @param isPaidPlan - Whether this is a paid plan signup
 * @returns The final callback URL with checkout_pending appended if needed
 */
export function buildOAuthCallbackURL(
  baseCallbackURL: string,
  isPaidPlan: boolean
): string {
  if (!isPaidPlan) {
    return baseCallbackURL;
  }

  // Parse the URL to properly append the checkout_pending flag
  // Handle both absolute URLs and relative paths
  try {
    // Use a dummy base for relative URLs
    const isRelative = baseCallbackURL.startsWith("/");
    const url = new URL(baseCallbackURL, isRelative ? "http://localhost" : undefined);
    url.searchParams.set("checkout_pending", "true");

    // Return just the path + query for relative URLs, full URL otherwise
    return isRelative ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    // Fallback: simple string concatenation if URL parsing fails
    const separator = baseCallbackURL.includes("?") ? "&" : "?";
    return `${baseCallbackURL}${separator}checkout_pending=true`;
  }
}
