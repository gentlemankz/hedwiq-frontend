"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Delay between refresh attempts (increases with each retry)
const REFRESH_INTERVAL_MS = 2000;
const MAX_RETRIES = 5;
const AUTO_REDIRECT_DELAY_MS = 5000;

interface SubscriptionStatus {
  tier: string;
  status: string;
  billingInterval: string | null;
}

export function CheckoutSuccessClient() {
  const router = useRouter();

  const [verificationState, setVerificationState] = useState<"verifying" | "success">("verifying");
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionStatus | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  // Fetch subscription status from local API (uses database cache as fallback)
  const fetchSubscriptionStatus = useCallback(async (): Promise<SubscriptionStatus | null> => {
    try {
      setIsRefreshing(true);
      const response = await fetch("/api/subscription/status", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("[CheckoutSuccess] API error:", response.status);
        return null;
      }

      const data = await response.json();
      return {
        tier: data.tier,
        status: data.status,
        billingInterval: data.billingInterval,
      };
    } catch (error) {
      console.error("[CheckoutSuccess] Fetch error:", error);
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Verification loop
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let isCancelled = false;
    let currentRetry = 0;

    const verify = async () => {
      if (isCancelled) return;

      const status = await fetchSubscriptionStatus();

      if (isCancelled) return;

      if (status) {
        setSubscriptionData(status);

        // Check if subscription is now active (not free)
        if (status.tier !== "free" && (status.status === "active" || status.status === "trialing")) {
          setVerificationState("success");
          return;
        }
      }

      currentRetry++;
      setRetryCount(currentRetry);

      // Retry if not at max
      if (currentRetry < MAX_RETRIES) {
        retryTimeoutRef.current = setTimeout(verify, REFRESH_INTERVAL_MS * Math.min(currentRetry, 3));
      } else {
        // Max retries - show success anyway (webhook may be delayed, user can see dashboard)
        setVerificationState("success");
      }
    };

    // Start after initial delay for webhook processing
    retryTimeoutRef.current = setTimeout(verify, REFRESH_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchSubscriptionStatus]);

  // Auto-redirect to dashboard after success
  useEffect(() => {
    if (verificationState !== "success") return;

    redirectTimeoutRef.current = setTimeout(() => {
      router.push("/dashboard");
    }, AUTO_REDIRECT_DELAY_MS);

    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, [verificationState, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  const handleManualRefresh = async () => {
    const status = await fetchSubscriptionStatus();
    if (status) {
      setSubscriptionData(status);
      if (status.tier !== "free" && (status.status === "active" || status.status === "trialing")) {
        setVerificationState("success");
      }
    }
  };

  const isVerifying = verificationState === "verifying";
  const showSuccess = verificationState === "success";
  const tier = subscriptionData?.tier || "free";
  const tierDisplayName = tier.charAt(0).toUpperCase() + tier.slice(1);
  const isUpgraded = tier !== "free";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          {/* Animated success icon */}
          <div className="mx-auto mb-4">
            <div
              className={cn(
                "relative inline-flex items-center justify-center w-20 h-20 rounded-full",
                isVerifying
                  ? "bg-muted animate-pulse"
                  : "bg-green-100 dark:bg-green-900/30"
              )}
            >
              {isVerifying ? (
                <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
              ) : (
                <CheckCircle2
                  className={cn(
                    "w-12 h-12 text-green-600 dark:text-green-400",
                    "animate-in zoom-in-50 duration-500"
                  )}
                />
              )}
            </div>
          </div>

          <CardTitle className="text-2xl">
            {isVerifying ? "Processing your payment..." : "Payment Successful!"}
          </CardTitle>
          <CardDescription className="text-base mt-2">
            {isVerifying ? (
              "Please wait while we confirm your subscription..."
            ) : isUpgraded ? (
              <>
                Welcome to <span className="font-semibold text-foreground">{tierDisplayName}</span>!
                Your subscription is now active.
              </>
            ) : (
              "Your payment has been processed. Your subscription will be activated shortly."
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan details */}
          {showSuccess && isUpgraded && (
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Your Plan</p>
              <p className="text-xl font-semibold">{tierDisplayName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                All features are now unlocked
              </p>
            </div>
          )}

          {/* Loading indicator during verification */}
          {isVerifying && (
            <div className="text-center text-sm text-muted-foreground">
              <p>This usually takes a few seconds...</p>
              {retryCount > 2 && (
                <p className="mt-2 text-amber-600 dark:text-amber-400">
                  Taking longer than expected. Please wait...
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full"
              onClick={handleGoToDashboard}
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {showSuccess && (
              <p className="text-xs text-center text-muted-foreground">
                Redirecting to dashboard in a few seconds...
              </p>
            )}
          </div>

          {/* Manual refresh option */}
          {showSuccess && !isUpgraded && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Subscription not showing yet?
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Refresh Status"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
