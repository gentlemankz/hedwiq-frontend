/**
 * Terms and Privacy Links Component
 *
 * Reusable component for displaying Terms of Service and Privacy Policy
 * links with consistent styling across auth pages.
 */

import { externalUrls } from "@/lib/config/external-urls";

// ============================================================================
// Types
// ============================================================================

interface TermsPrivacyLinksProps {
  /** The action text (e.g., "signing in", "signing up", "continuing") */
  action?: "signing in" | "signing up" | "continuing";
  /** Additional CSS classes for the container */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Displays Terms of Service and Privacy Policy links with consistent styling.
 * Used in sign-in, sign-up, and other auth-related pages.
 */
export function TermsPrivacyLinks({
  action = "continuing",
  className = "",
}: TermsPrivacyLinksProps) {
  return (
    <p className={`text-center text-xs text-muted-foreground ${className}`}>
      By {action}, you agree to our{" "}
      <a
        href={externalUrls.terms}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        href={externalUrls.privacy}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        Privacy Policy
      </a>
    </p>
  );
}
