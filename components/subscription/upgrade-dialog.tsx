"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Sparkles, Crown, Zap, Building2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSubscriptionContext, type SubscriptionTier } from "@/contexts/subscription-context";
import {
  type Feature,
  getFeatureDisplayName,
  getTierDisplayName,
  isTierHigher,
} from "@/lib/feature-gates";

// ============================================================================
// Types
// ============================================================================

type BillingPeriod = "monthly" | "annual";

interface PlanDetails {
  tier: SubscriptionTier;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  monthlySlug: string;
  annualSlug: string;
  highlighted?: boolean;
  icon: React.ReactNode;
  features: string[];
}

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a specific tier */
  preselectedTier?: SubscriptionTier;
  /** Feature that triggered the upgrade prompt */
  triggerFeature?: Feature;
}

// ============================================================================
// Plan Configuration
// ============================================================================

const PLANS: PlanDetails[] = [
  {
    tier: "pro",
    name: "Pro",
    description: "For individuals and small teams",
    monthlyPrice: 16,
    annualPrice: 8,
    monthlySlug: "pro",
    annualSlug: "pro-annual",
    highlighted: true,
    icon: <Sparkles className="size-5 text-blue-500" />,
    features: [
      "3,000 meeting minutes/month",
      "10 GB storage",
      "30-day history",
      "Action items tracking",
      "Agenda tracking",
      "Email drafts (300/month)",
      "Document upload",
      "Meeting recordings",
    ],
  },
  {
    tier: "business",
    name: "Business",
    description: "For growing teams and organizations",
    monthlyPrice: 30,
    annualPrice: 19.99,
    monthlySlug: "business",
    annualSlug: "business-annual",
    icon: <Crown className="size-5 text-amber-500" />,
    features: [
      "Unlimited meeting minutes",
      "20 GB storage per user",
      "90-day history",
      "Everything in Pro",
      "Priority support",
      "Advanced analytics",
      "Email drafts (1,500/month)",
    ],
  },
];

// ============================================================================
// Helper Components
// ============================================================================

function PlanCard({
  plan,
  billingPeriod,
  isCurrentPlan,
  isLoading,
  onSelect,
}: {
  plan: PlanDetails;
  billingPeriod: BillingPeriod;
  isCurrentPlan: boolean;
  isLoading: boolean;
  onSelect: () => void;
}) {
  const price = billingPeriod === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const savings =
    billingPeriod === "annual"
      ? Math.round(((plan.monthlyPrice - plan.annualPrice) / plan.monthlyPrice) * 100)
      : 0;

  return (
    <div
      className={cn(
        "relative flex flex-col p-5 rounded-xl border-2 transition-all",
        plan.highlighted
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border hover:border-primary/50",
        isCurrentPlan && "opacity-60"
      )}
    >
      {/* Popular badge */}
      {plan.highlighted && (
        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
          Most Popular
        </Badge>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
          {plan.icon}
        </div>
        <div>
          <h3 className="font-semibold">{plan.name}</h3>
          <p className="text-xs text-muted-foreground">{plan.description}</p>
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">${price}</span>
          <span className="text-muted-foreground">/mo</span>
        </div>
        {billingPeriod === "annual" && savings > 0 && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Save {savings}% with annual billing
          </p>
        )}
        {billingPeriod === "annual" && (
          <p className="text-xs text-muted-foreground mt-1">
            Billed ${(price * 12).toFixed(2)}/year
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-2 mb-4 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="size-4 text-green-500 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Button
        onClick={onSelect}
        disabled={isCurrentPlan || isLoading}
        variant={plan.highlighted ? "default" : "outline"}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : isCurrentPlan ? (
          "Current Plan"
        ) : (
          <>
            <Zap className="size-4 mr-2" />
            Upgrade to {plan.name}
          </>
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Dialog for comparing plans and upgrading subscription.
 *
 * @example
 * ```tsx
 * const [showUpgrade, setShowUpgrade] = useState(false);
 *
 * <UpgradeDialog
 *   open={showUpgrade}
 *   onOpenChange={setShowUpgrade}
 *   triggerFeature="email_drafts"
 * />
 * ```
 */
export function UpgradeDialog({
  open,
  onOpenChange,
  preselectedTier,
  triggerFeature,
}: UpgradeDialogProps) {
  const { tier: currentTier, openCheckout } = useSubscriptionContext();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Refs for preselected tier scrolling
  const planRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filter out plans that are lower than current tier
  const availablePlans = PLANS.filter(
    (plan) => plan.tier === currentTier || isTierHigher(plan.tier, currentTier)
  );

  // Validate preselectedTier is in available plans
  // If it's filtered out (e.g., user already on higher tier), ignore it
  const validPreselectedTier = preselectedTier &&
    availablePlans.some((plan) => plan.tier === preselectedTier)
      ? preselectedTier
      : undefined;

  // Handle case where user is on highest self-serve plan (Business)
  const hasNoUpgradePlans = availablePlans.length === 0 ||
    (availablePlans.length === 1 && availablePlans[0].tier === currentTier);

  // Scroll to preselected tier when dialog opens (only if valid)
  useEffect(() => {
    if (open && validPreselectedTier && planRefs.current[validPreselectedTier]) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => {
        planRefs.current[validPreselectedTier]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, validPreselectedTier]);

  // Warn in development if invalid preselectedTier was passed
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && preselectedTier && !validPreselectedTier) {
      console.warn(
        `[UpgradeDialog] preselectedTier "${preselectedTier}" is not available for current tier "${currentTier}". ` +
        `It may have been filtered out. Available tiers: ${availablePlans.map(p => p.tier).join(", ")}`
      );
    }
  }, [preselectedTier, validPreselectedTier, currentTier, availablePlans]);

  const handleSelectPlan = useCallback(
    async (plan: PlanDetails) => {
      const slug = billingPeriod === "annual" ? plan.annualSlug : plan.monthlySlug;
      setLoadingPlan(plan.tier);

      try {
        await openCheckout(slug);
        // Dialog will close when user is redirected to checkout
      } catch (error) {
        console.error("Failed to open checkout:", error);
        setLoadingPlan(null);
      }
    },
    [billingPeriod, openCheckout]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {triggerFeature
              ? `Upgrade to unlock ${getFeatureDisplayName(triggerFeature)}`
              : "Upgrade Your Plan"}
          </DialogTitle>
          <DialogDescription>
            {triggerFeature
              ? `${getFeatureDisplayName(triggerFeature)} is available on Pro and higher plans.`
              : "Choose the plan that best fits your needs."}
          </DialogDescription>
        </DialogHeader>

        {/* Billing Period Toggle */}
        <div className="flex justify-center mb-6">
          <Tabs
            value={billingPeriod}
            onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}
          >
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="annual" className="relative">
                Annual
                <Badge
                  variant="secondary"
                  className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  Save 50%
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Plan Cards */}
        {hasNoUpgradePlans ? (
          // User is on highest self-serve plan
          <div className="text-center py-8">
            <Crown className="size-12 mx-auto mb-4 text-amber-500" />
            <h3 className="font-semibold text-lg mb-2">
              You&apos;re on our highest self-serve plan!
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Contact us for Enterprise features like SSO, custom contracts, and
              dedicated support.
            </p>
            <Button variant="outline" asChild>
              <a href="mailto:sales@luframe.com">Contact Sales</a>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {availablePlans.map((plan) => (
              <div
                key={plan.tier}
                ref={(el) => {
                  planRefs.current[plan.tier] = el;
                }}
                className={cn(
                  validPreselectedTier === plan.tier &&
                    "ring-2 ring-primary ring-offset-2 rounded-xl"
                )}
              >
                <PlanCard
                  plan={plan}
                  billingPeriod={billingPeriod}
                  isCurrentPlan={plan.tier === currentTier}
                  isLoading={loadingPlan === plan.tier}
                  onSelect={() => handleSelectPlan(plan)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Current Plan Info */}
        {currentTier !== "free" && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center text-sm text-muted-foreground">
            You&apos;re currently on the{" "}
            <span className="font-medium text-foreground">
              {getTierDisplayName(currentTier)}
            </span>{" "}
            plan
          </div>
        )}

        {/* Enterprise CTA */}
        <div className="mt-4 p-4 rounded-lg border border-dashed text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="size-5 text-purple-500" />
            <span className="font-medium">Need Enterprise features?</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            SSO, custom contracts, dedicated support, and more.
          </p>
          <Button variant="outline" asChild>
            <a href="mailto:sales@luframe.com">Contact Sales</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Hook for Upgrade Dialog State
// ============================================================================

/**
 * Props for the upgrade dialog returned by the hook.
 * Spread these props onto an UpgradeDialog component.
 */
export interface UpgradeDialogHookProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerFeature?: Feature;
  preselectedTier?: SubscriptionTier;
}

/**
 * Hook to manage upgrade dialog state.
 *
 * Returns dialog props to spread onto UpgradeDialog, rather than returning
 * a component directly (which causes unnecessary re-renders).
 *
 * @example
 * ```tsx
 * const { dialogProps, openUpgrade, closeUpgrade } = useUpgradeDialog();
 *
 * <Button onClick={() => openUpgrade("email_drafts")}>Upgrade</Button>
 * <UpgradeDialog {...dialogProps} />
 * ```
 */
export function useUpgradeDialog() {
  const [state, setState] = useState<{
    open: boolean;
    triggerFeature?: Feature;
    preselectedTier?: SubscriptionTier;
  }>({ open: false });

  const openUpgrade = useCallback(
    (feature?: Feature, tier?: SubscriptionTier) => {
      setState({
        open: true,
        triggerFeature: feature,
        preselectedTier: tier,
      });
    },
    []
  );

  const closeUpgrade = useCallback(() => {
    setState({ open: false });
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setState({ open: false });
    }
  }, []);

  // Return props for the dialog instead of the component itself
  const dialogProps: UpgradeDialogHookProps = {
    open: state.open,
    onOpenChange: handleOpenChange,
    triggerFeature: state.triggerFeature,
    preselectedTier: state.preselectedTier,
  };

  return {
    isOpen: state.open,
    openUpgrade,
    closeUpgrade,
    triggerFeature: state.triggerFeature,
    dialogProps,
    // Legacy: Keep UpgradeDialogComponent for backwards compatibility
    // but mark it as deprecated
    /** @deprecated Use dialogProps instead and render UpgradeDialog directly */
    UpgradeDialogComponent: () => <UpgradeDialog {...dialogProps} />,
  };
}
