"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { authClient, useSession } from "@/lib/auth-client";
import {
  type SubscriptionTier,
  type BillingInterval,
  type TierLimits,
  TIER_LIMITS,
  getTierFromProductId,
  getIntervalFromProductId,
  isUnlimitedMinutes,
  isValidProductSlug,
} from "@/lib/polar/constants";

// ============================================================================
// Types
// ============================================================================

export type SubscriptionStatus = "active" | "trialing" | "canceled" | "past_due" | "none";

export interface UsageStats {
  minutesUsed: number;
  storageUsedGb: number;
  emailDraftsSent: number;
}

export interface SubscriptionInfo {
  id: string;
  productId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionState {
  // Subscription tier derived from active subscription
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;

  // Current subscription details
  subscription: SubscriptionInfo | null;

  // Limits based on tier
  limits: TierLimits;

  // Current period usage
  usage: UsageStats;

  // Loading and error states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  openCheckout: (productSlug: string) => Promise<void>;
  openPortal: () => Promise<void>;

  // Helper methods
  canUseFeature: (minutesNeeded?: number) => boolean;
  getRemainingMinutes: () => number;
  getUsagePercentage: () => number;
  hasUnlimitedMinutes: () => boolean;
}

// Re-export types from polar constants for convenience
export type { SubscriptionTier, BillingInterval, TierLimits };
export { TIER_LIMITS, isUnlimitedMinutes };

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USAGE: UsageStats = {
  minutesUsed: 0,
  storageUsedGb: 0,
  emailDraftsSent: 0,
};

// Debounce delay for refresh operations (ms)
const REFRESH_DEBOUNCE_MS = 1000;

// Delay after checkout success before refreshing (allows webhook processing)
const CHECKOUT_SUCCESS_DELAY_MS = 2000;

// ============================================================================
// Context
// ============================================================================

const SubscriptionContext = createContext<SubscriptionState | null>(null);

// ============================================================================
// API Response Type Guards
// ============================================================================

interface CustomerStateSubscription {
  id: string;
  productId?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

interface CustomerStateMeter {
  slug?: string;
  balance?: number;
}

interface CustomerStateResponse {
  activeSubscriptions?: CustomerStateSubscription[];
  meters?: CustomerStateMeter[];
}

/**
 * Type guard for customer state response
 */
function isValidCustomerStateResponse(data: unknown): data is CustomerStateResponse {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  // activeSubscriptions is optional but if present must be an array
  if (obj.activeSubscriptions !== undefined && !Array.isArray(obj.activeSubscriptions)) {
    return false;
  }

  // meters is optional but if present must be an array
  if (obj.meters !== undefined && !Array.isArray(obj.meters)) {
    return false;
  }

  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map Polar subscription status to our status type
 */
function mapSubscriptionStatus(status: string | undefined): SubscriptionStatus {
  if (!status) return "none";

  const normalizedStatus = status.toLowerCase();
  switch (normalizedStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    default:
      return "none";
  }
}

/**
 * Safely parse a date value (string or Date)
 */
function safeParseDate(dateValue: string | Date | undefined | null): Date | null {
  if (!dateValue) return null;

  // If already a Date, validate it
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }

  // Parse string to Date
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// Provider Component
// ============================================================================

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const { data: session } = useSession();

  // State
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [status, setStatus] = useState<SubscriptionStatus>("none");
  const [billingInterval, setBillingInterval] = useState<BillingInterval | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageStats>(DEFAULT_USAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup and debouncing
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<number>(0);
  const checkoutRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derived limits based on tier
  const limits = useMemo(() => TIER_LIMITS[tier], [tier]);

  /**
   * Fetch customer state from Polar
   */
  const fetchCustomerState = useCallback(async (isRefresh = false) => {
    // Check if user is logged in
    if (!session?.user) {
      setTier("free");
      setStatus("none");
      setBillingInterval(null);
      setSubscription(null);
      setUsage(DEFAULT_USAGE);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Get customer state from Polar via Better Auth client
      const { data: customerState, error: stateError } = await authClient.customer.state();

      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      if (stateError) {
        // Gracefully fall back to free tier when Polar state cannot be fetched
        console.warn("[SubscriptionContext] Failed to fetch customer state:", stateError);
        setTier("free");
        setStatus("none");
        setBillingInterval(null);
        setSubscription(null);
        setUsage(DEFAULT_USAGE);
        setError(stateError.message || "Failed to fetch customer state");
        return;
      }

      // Validate response structure
      if (!isValidCustomerStateResponse(customerState)) {
        console.warn("[SubscriptionContext] Invalid customer state response structure");
        // Fall back to free tier rather than throwing
        setTier("free");
        setStatus("none");
        setBillingInterval(null);
        setSubscription(null);
        setUsage(DEFAULT_USAGE);
        return;
      }

      // Find active subscription
      const activeSubscription = customerState.activeSubscriptions?.find(
        (sub) => sub.status === "active" || sub.status === "trialing"
      );

      if (activeSubscription) {
        const productId = activeSubscription.productId || "";

        setTier(getTierFromProductId(productId));
        setStatus(mapSubscriptionStatus(activeSubscription.status));
        setBillingInterval(getIntervalFromProductId(productId));
        setSubscription({
          id: activeSubscription.id,
          productId: productId,
          status: activeSubscription.status || "active",
          currentPeriodStart: safeParseDate(activeSubscription.currentPeriodStart),
          currentPeriodEnd: safeParseDate(activeSubscription.currentPeriodEnd),
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd || false,
        });
      } else {
        // No active subscription = free tier
        setTier("free");
        setStatus("none");
        setBillingInterval(null);
        setSubscription(null);
      }

      // Extract usage from meters if available
      if (customerState.meters && Array.isArray(customerState.meters)) {
        const meetingMinutesMeter = customerState.meters.find(
          (m) => m.slug === "meeting-minutes"
        );
        const emailDraftsMeter = customerState.meters.find(
          (m) => m.slug === "email-drafts"
        );
        const storageMeter = customerState.meters.find(
          (m) => m.slug === "storage-bytes"
        );

        setUsage({
          minutesUsed: meetingMinutesMeter?.balance ?? 0,
          emailDraftsSent: emailDraftsMeter?.balance ?? 0,
          storageUsedGb: storageMeter ? (storageMeter.balance ?? 0) / (1024 * 1024 * 1024) : 0,
        });
      } else {
        setUsage(DEFAULT_USAGE);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      console.error("[SubscriptionContext] Error fetching customer state:", err);
      setError(err instanceof Error ? err.message : "Failed to load subscription");
      // Default to free tier on error
      setTier("free");
      setStatus("none");
    } finally {
      // Don't update loading state if request was aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally depend only on user ID to avoid re-fetching on every session update
  }, [session?.user?.id]);

  /**
   * Refresh subscription state (debounced)
   */
  const refresh = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;

    // If we recently refreshed, debounce the call
    if (timeSinceLastRefresh < REFRESH_DEBOUNCE_MS) {
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      // Schedule refresh after debounce period
      return new Promise<void>((resolve) => {
        refreshTimeoutRef.current = setTimeout(async () => {
          lastRefreshRef.current = Date.now();
          await fetchCustomerState(true);
          resolve();
        }, REFRESH_DEBOUNCE_MS - timeSinceLastRefresh);
      });
    }

    lastRefreshRef.current = now;
    await fetchCustomerState(true);
  }, [fetchCustomerState]);

  /**
   * Open Polar checkout for a product
   */
  const openCheckout = useCallback(async (productSlug: string) => {
    // Validate product slug before attempting checkout
    if (!isValidProductSlug(productSlug)) {
      const validSlugs = ["pro", "pro-annual", "business", "business-annual"];
      throw new Error(
        `Invalid product slug: "${productSlug}". Valid slugs are: ${validSlugs.join(", ")}`
      );
    }

    try {
      await authClient.checkout({ slug: productSlug });
    } catch (err) {
      console.error("[SubscriptionContext] Checkout error:", err);
      throw err;
    }
  }, []);

  /**
   * Open Polar customer portal
   */
  const openPortal = useCallback(async () => {
    try {
      await authClient.customer.portal();
    } catch (err) {
      console.error("[SubscriptionContext] Portal error:", err);
      throw err;
    }
  }, []);

  /**
   * Check if user has unlimited minutes
   */
  const hasUnlimitedMinutes = useCallback(() => {
    return isUnlimitedMinutes(limits.minutesPerMonth);
  }, [limits.minutesPerMonth]);

  /**
   * Check if user can use a feature (based on remaining minutes)
   */
  const canUseFeature = useCallback(
    (minutesNeeded = 0) => {
      if (isUnlimitedMinutes(limits.minutesPerMonth)) return true;
      return usage.minutesUsed + minutesNeeded <= limits.minutesPerMonth;
    },
    [limits.minutesPerMonth, usage.minutesUsed]
  );

  /**
   * Get remaining minutes for the current period
   */
  const getRemainingMinutes = useCallback(() => {
    if (isUnlimitedMinutes(limits.minutesPerMonth)) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, limits.minutesPerMonth - usage.minutesUsed);
  }, [limits.minutesPerMonth, usage.minutesUsed]);

  /**
   * Get usage percentage (0-100)
   */
  const getUsagePercentage = useCallback(() => {
    if (isUnlimitedMinutes(limits.minutesPerMonth)) return 0;
    return Math.min(100, (usage.minutesUsed / limits.minutesPerMonth) * 100);
  }, [limits.minutesPerMonth, usage.minutesUsed]);

  // Fetch customer state when user changes
  useEffect(() => {
    fetchCustomerState();
  }, [fetchCustomerState]);

  // Handle checkout success from URL params
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");

    if (checkoutStatus === "success") {
      // Clean up URL first to prevent re-triggering
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());

      // Refresh subscription state with retry logic
      // Webhooks may take time to process, so we retry a few times
      let retryCount = 0;
      const maxRetries = 3;
      let isCancelled = false;

      const attemptRefresh = async () => {
        if (isCancelled) return;

        await refresh();

        // Fetch fresh state to avoid stale closure
        // We need to re-check via fetchCustomerState since tier state may be stale
        // If still on free tier after checkout success, retry
        if (!isCancelled && retryCount < maxRetries) {
          retryCount++;
          checkoutRetryTimeoutRef.current = setTimeout(attemptRefresh, CHECKOUT_SUCCESS_DELAY_MS * retryCount);
        }
      };

      // Initial delay to allow webhook processing
      checkoutRetryTimeoutRef.current = setTimeout(attemptRefresh, CHECKOUT_SUCCESS_DELAY_MS);

      return () => {
        isCancelled = true;
        if (checkoutRetryTimeoutRef.current) {
          clearTimeout(checkoutRetryTimeoutRef.current);
          checkoutRetryTimeoutRef.current = null;
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally run only on mount to check URL params once
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any pending refresh timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      // Clear any pending checkout retry timeout
      if (checkoutRetryTimeoutRef.current) {
        clearTimeout(checkoutRetryTimeoutRef.current);
      }
    };
  }, []);

  // Context value - memoized to prevent unnecessary re-renders
  const value = useMemo<SubscriptionState>(
    () => ({
      tier,
      status,
      billingInterval,
      subscription,
      limits,
      usage,
      isLoading,
      isRefreshing,
      error,
      refresh,
      openCheckout,
      openPortal,
      canUseFeature,
      getRemainingMinutes,
      getUsagePercentage,
      hasUnlimitedMinutes,
    }),
    [
      tier,
      status,
      billingInterval,
      subscription,
      limits,
      usage,
      isLoading,
      isRefreshing,
      error,
      refresh,
      openCheckout,
      openPortal,
      canUseFeature,
      getRemainingMinutes,
      getUsagePercentage,
      hasUnlimitedMinutes,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access subscription context.
 * Throws if used outside of SubscriptionProvider.
 */
export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscriptionContext must be used within a SubscriptionProvider");
  }
  return context;
}

/**
 * Optional hook that returns null if used outside provider.
 * Useful for components that may or may not be wrapped in the provider.
 */
export function useSubscriptionOptional() {
  return useContext(SubscriptionContext);
}
