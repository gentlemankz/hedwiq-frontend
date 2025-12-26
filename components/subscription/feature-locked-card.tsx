"use client";

import { Lock, Sparkles, Crown, Zap } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Feature } from "@/lib/feature-gates";
import {
  getFeatureDisplayName,
  getFeatureDescription,
  getMinimumTier,
  getTierDisplayName,
} from "@/lib/feature-gates";
import type { SubscriptionTier } from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

interface FeatureLockedCardProps {
  /** The feature that is locked */
  feature: Feature;
  /** Custom title override */
  title?: string;
  /** Custom description override */
  description?: string;
  /** Handler for upgrade button click */
  onUpgrade?: () => void;
  /** Whether the upgrade action is loading */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Visual variant */
  variant?: "default" | "compact" | "inline";
  /** Show decorative background */
  showBackground?: boolean;
}

interface FeatureLockedInlineProps {
  /** The feature that is locked */
  feature: Feature;
  /** Handler for upgrade button click */
  onUpgrade?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

function TierUpgradeIcon({ tier }: { tier: SubscriptionTier }) {
  switch (tier) {
    case "business":
    case "enterprise":
      return <Crown className="size-5 text-amber-500" />;
    case "pro":
      return <Sparkles className="size-5 text-blue-500" />;
    default:
      return <Zap className="size-5 text-muted-foreground" />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Card displayed when a feature requires upgrade.
 *
 * @example
 * ```tsx
 * const { enabled, promptUpgrade } = useFeature("email_drafts");
 *
 * if (!enabled) {
 *   return (
 *     <FeatureLockedCard
 *       feature="email_drafts"
 *       onUpgrade={promptUpgrade}
 *     />
 *   );
 * }
 * ```
 */
export function FeatureLockedCard({
  feature,
  title,
  description,
  onUpgrade,
  isLoading = false,
  className,
  variant = "default",
  showBackground = true,
}: FeatureLockedCardProps) {
  const featureName = title ?? getFeatureDisplayName(feature);
  const featureDescription = description ?? getFeatureDescription(feature);
  const requiredTier = getMinimumTier(feature);
  const tierName = getTierDisplayName(requiredTier);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg",
          "bg-muted/50 border border-dashed",
          className
        )}
      >
        <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Lock className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{featureName}</p>
          <p className="text-xs text-muted-foreground">
            Requires {tierName}
          </p>
        </div>
        {onUpgrade && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUpgrade}
            disabled={isLoading}
            className="shrink-0"
          >
            Upgrade
          </Button>
        )}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <FeatureLockedInline
        feature={feature}
        onUpgrade={onUpgrade}
        className={className}
      />
    );
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        showBackground && "bg-gradient-to-br from-muted/30 to-muted/10",
        className
      )}
    >
      {/* Decorative background pattern */}
      {showBackground && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Lock className="size-32" />
          </div>
        </div>
      )}

      <CardHeader className="relative">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Lock className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">{featureName}</CardTitle>
            <CardDescription>{featureDescription}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-background/50 border">
          <TierUpgradeIcon tier={requiredTier} />
          <div>
            <p className="text-sm font-medium">
              Unlock with {tierName}
            </p>
            <p className="text-xs text-muted-foreground">
              Get access to {featureName.toLowerCase()} and more
            </p>
          </div>
        </div>
      </CardContent>

      {onUpgrade && (
        <CardFooter className="relative">
          <Button
            onClick={onUpgrade}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              "Loading..."
            ) : (
              <>
                <Zap className="size-4 mr-2" />
                Upgrade to {tierName}
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ============================================================================
// Inline Variant (for use within existing UI)
// ============================================================================

/**
 * Inline feature locked indicator for embedding in existing UI.
 * More subtle than the full card variant.
 */
export function FeatureLockedInline({
  feature,
  onUpgrade,
  className,
}: FeatureLockedInlineProps) {
  const featureName = getFeatureDisplayName(feature);
  const requiredTier = getMinimumTier(feature);
  const tierName = getTierDisplayName(requiredTier);

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 p-4 text-center",
        "rounded-lg border border-dashed bg-muted/30",
        className
      )}
    >
      <Lock className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground">
        {featureName} requires{" "}
        <button
          onClick={onUpgrade}
          className="text-primary hover:underline font-medium"
        >
          {tierName} plan
        </button>
      </span>
    </div>
  );
}

// ============================================================================
// Banner Variant (for page-level notifications)
// ============================================================================

interface FeatureLockedBannerProps {
  /** The feature that is locked */
  feature: Feature;
  /** Handler for upgrade button click */
  onUpgrade?: () => void;
  /** Handler for dismiss */
  onDismiss?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Banner displayed at the top of a page when a feature is locked.
 * Useful for showing feature restrictions without blocking content.
 */
export function FeatureLockedBanner({
  feature,
  onUpgrade,
  onDismiss,
  className,
}: FeatureLockedBannerProps) {
  const featureName = getFeatureDisplayName(feature);
  const requiredTier = getMinimumTier(feature);
  const tierName = getTierDisplayName(requiredTier);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        "rounded-lg bg-muted/50 border",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
          <TierUpgradeIcon tier={requiredTier} />
        </div>
        <div>
          <p className="text-sm font-medium">
            Upgrade to unlock {featureName}
          </p>
          <p className="text-xs text-muted-foreground">
            Available with {tierName} plan
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onUpgrade && (
          <Button size="sm" onClick={onUpgrade}>
            Upgrade
          </Button>
        )}
        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="text-muted-foreground"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Overlay Variant (for blocking content)
// ============================================================================

interface FeatureLockedOverlayProps {
  /** The feature that is locked */
  feature: Feature;
  /** Handler for upgrade button click */
  onUpgrade?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Children to render behind the overlay (preview content) */
  children?: React.ReactNode;
}

/**
 * Overlay that blocks content with a feature locked message.
 * Shows a blurred preview of the content behind.
 */
export function FeatureLockedOverlay({
  feature,
  onUpgrade,
  className,
  children,
}: FeatureLockedOverlayProps) {
  const featureName = getFeatureDisplayName(feature);
  const requiredTier = getMinimumTier(feature);
  const tierName = getTierDisplayName(requiredTier);

  return (
    <div className={cn("relative", className)}>
      {/* Blurred content preview */}
      {children && (
        <div className="blur-sm pointer-events-none select-none opacity-50">
          {children}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="text-center p-6 max-w-sm">
          <div className="size-12 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <Lock className="size-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">{featureName}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upgrade to {tierName} to access this feature
          </p>
          {onUpgrade && (
            <Button onClick={onUpgrade}>
              <Zap className="size-4 mr-2" />
              Upgrade Now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
