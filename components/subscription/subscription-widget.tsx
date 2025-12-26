"use client";

import { useCallback } from "react";
import { Crown, Zap, Sparkles, Building2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSubscriptionContext,
  type SubscriptionTier,
} from "@/contexts/subscription-context";
import { isUnlimitedMinutes } from "@/lib/polar/constants";
import { cn } from "@/lib/utils";

// ============================================================================
// Tier Icon Component
// ============================================================================

interface TierIconProps {
  tier: SubscriptionTier;
  className?: string;
}

export function TierIcon({ tier, className }: TierIconProps) {
  const iconClass = cn("size-4", className);

  switch (tier) {
    case "enterprise":
      return <Building2 className={cn(iconClass, "text-purple-500")} />;
    case "business":
      return <Crown className={cn(iconClass, "text-amber-500")} />;
    case "pro":
      return <Sparkles className={cn(iconClass, "text-blue-500")} />;
    default:
      return <Zap className={cn(iconClass, "text-muted-foreground")} />;
  }
}

// ============================================================================
// Tier Badge Component
// ============================================================================

interface TierBadgeProps {
  tier: SubscriptionTier;
  showUpgrade?: boolean;
  className?: string;
}

export function TierBadge({ tier, showUpgrade = false, className }: TierBadgeProps) {
  // Style mapping based on tier - uses custom colors with appropriate variants
  const styleMap: Record<SubscriptionTier, { variant: "default" | "secondary" | "outline"; color: string }> = {
    enterprise: { variant: "default", color: "bg-purple-500 text-white border-purple-500" },
    business: { variant: "default", color: "bg-amber-500 text-white border-amber-500" },
    pro: { variant: "secondary", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
    free: { variant: "outline", color: "" },
  };

  const { variant, color } = styleMap[tier];

  return (
    <Badge variant={variant} className={cn(color, className)}>
      {showUpgrade && tier === "free" ? "Upgrade" : tier.charAt(0).toUpperCase() + tier.slice(1)}
    </Badge>
  );
}

// ============================================================================
// Subscription Widget Skeleton
// ============================================================================

export function SubscriptionWidgetSkeleton() {
  return (
    <div className="p-3 rounded-lg bg-sidebar-accent/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-24 mb-1" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

// ============================================================================
// Helper Functions (defined outside component to avoid recreating)
// ============================================================================

/**
 * Format minutes for display
 */
function formatMinutes(minutes: number): string {
  if (isUnlimitedMinutes(minutes)) return "Unlimited";
  return minutes.toLocaleString();
}

// ============================================================================
// Main Subscription Widget Component
// ============================================================================

interface SubscriptionWidgetProps {
  className?: string;
  compact?: boolean;
}

export function SubscriptionWidget({ className, compact = false }: SubscriptionWidgetProps) {
  const {
    tier,
    status,
    limits,
    usage,
    isLoading,
    isRefreshing,
    openCheckout,
    getUsagePercentage,
  } = useSubscriptionContext();

  // Computed values - getUsagePercentage is already stable from context
  const usagePercent = getUsagePercentage();
  const isNearLimit = usagePercent > 80;
  const isAtLimit = usagePercent >= 100;
  const hasUnlimited = isUnlimitedMinutes(limits.minutesPerMonth);

  // Handle upgrade click (memoized to prevent unnecessary re-renders)
  const handleUpgrade = useCallback(async () => {
    try {
      // Default to pro-annual for best value
      await openCheckout("pro-annual");
    } catch (error) {
      console.error("Failed to open checkout:", error);
    }
  }, [openCheckout]);

  // Show skeleton while loading
  if (isLoading) {
    return <SubscriptionWidgetSkeleton />;
  }

  return (
    <div
      className={cn(
        "p-3 rounded-lg bg-sidebar-accent/50 transition-colors",
        isAtLimit && "bg-destructive/10 border border-destructive/20",
        className
      )}
    >
      {/* Header: Tier and Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TierIcon tier={tier} />
          <span className="text-sm font-medium capitalize">
            {tier} Plan
          </span>
          {isRefreshing && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <TierBadge tier={tier} showUpgrade={tier === "free"} />
      </div>

      {/* Usage Progress (only for non-unlimited tiers) */}
      {!hasUnlimited && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {formatMinutes(usage.minutesUsed)} / {formatMinutes(limits.minutesPerMonth)} min
            </span>
            {!compact && (
              <span className={cn(isNearLimit && "text-amber-500", isAtLimit && "text-destructive")}>
                {Math.round(usagePercent)}%
              </span>
            )}
          </div>
          <Progress
            value={usagePercent}
            className={cn(
              "h-1.5",
              isNearLimit && "[&>[data-slot=progress-indicator]]:bg-amber-500",
              isAtLimit && "[&>[data-slot=progress-indicator]]:bg-destructive"
            )}
          />
        </>
      )}

      {/* Unlimited indicator for business/enterprise */}
      {hasUnlimited && !compact && (
        <div className="text-xs text-muted-foreground">
          Unlimited meeting minutes
        </div>
      )}

      {/* Status indicator for canceled subscriptions */}
      {status === "canceled" && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Subscription ends at period end
        </div>
      )}

      {/* Upgrade CTA for free tier */}
      {tier === "free" && !compact && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 h-8 text-xs"
          onClick={handleUpgrade}
        >
          <Zap className="size-3 mr-1" />
          Upgrade to Pro
        </Button>
      )}

      {/* Near limit warning */}
      {isNearLimit && !isAtLimit && tier === "free" && !compact && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Running low on minutes
        </p>
      )}

      {/* At limit warning */}
      {isAtLimit && tier === "free" && !compact && (
        <p className="text-xs text-destructive mt-2">
          Upgrade to continue meetings
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Compact Subscription Status (for collapsed sidebar)
// ============================================================================

export function SubscriptionStatusCompact() {
  const { tier, isLoading, getUsagePercentage } = useSubscriptionContext();

  if (isLoading) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  const usagePercent = getUsagePercentage();
  const isNearLimit = usagePercent > 80;

  return (
    <div
      className={cn(
        "size-8 rounded-full flex items-center justify-center",
        "bg-sidebar-accent/50",
        isNearLimit && tier === "free" && "bg-amber-500/20"
      )}
      title={`${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan - ${Math.round(usagePercent)}% used`}
    >
      <TierIcon tier={tier} className="size-4" />
    </div>
  );
}
