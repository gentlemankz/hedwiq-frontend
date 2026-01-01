"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscriptionContext } from "@/contexts/subscription-context";
import { cn } from "@/lib/utils";

// Delay between refresh attempts (increases with each retry)
const REFRESH_INTERVAL_MS = 2000;
const MAX_RETRIES = 5;
const AUTO_REDIRECT_DELAY_MS = 8000;

export function CheckoutSuccessClient() {
  const router = useRouter();
  const { tier, status, refresh, isRefreshing } = useSubscriptionContext();

  const [verificationState, setVerificationState] = useState<"verifying" | "success" | "manual">("verifying");
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedRef = useRef(false);

  // Derive if subscription is upgraded
  const isSubscriptionActive = useMemo(() => {
    return tier !== "free" && status === "active";
  }, [tier, status]);

  // Verify subscription after checkout
  const verifySubscription = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      console.error("[CheckoutSuccess] Error refreshing subscription:", error);
    }
  }, [refresh]);

  // Handle verification completion
  const completeVerification = useCallback((state: "success" | "manual") => {
    setVerificationState(state);
  }, []);

  // Initial verification on mount
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    // Start verification after initial delay for webhook processing
    retryTimeoutRef.current = setTimeout(() => {
      verifySubscription().then(() => {
        setRetryCount(1);
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [verifySubscription]);

  // Handle subscription state changes after verification attempts
  useEffect(() => {
    if (retryCount === 0 || verificationState !== "verifying") return;

    // Schedule state transition based on current tier/status
    const timer = setTimeout(() => {
      if (isSubscriptionActive) {
        completeVerification("success");
      } else if (retryCount >= MAX_RETRIES) {
        // Max retries reached, show success anyway (webhook may be delayed)
        completeVerification("success");
      } else {
        // Schedule next retry
        retryTimeoutRef.current = setTimeout(() => {
          verifySubscription().then(() => {
            setRetryCount((prev) => prev + 1);
          });
        }, REFRESH_INTERVAL_MS * retryCount);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [retryCount, isSubscriptionActive, verificationState, verifySubscription, completeVerification]);

  // Auto-redirect to dashboard after success
  useEffect(() => {
    if (verificationState !== "success") return;

    redirectTimeoutRef.current = setTimeout(() => {
      router.push("/dashboard");
    }, AUTO_REDIRECT_DELAY_MS);

    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
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

  const handleManualRefresh = () => {
    setVerificationState("verifying");
    setRetryCount(0);
    hasCheckedRef.current = false;
    setTimeout(() => {
      verifySubscription().then(() => {
        setRetryCount(1);
      });
    }, 1000);
  };

  const isVerifying = verificationState === "verifying";
  const showSuccess = verificationState === "success";
  const tierDisplayName = tier.charAt(0).toUpperCase() + tier.slice(1);

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
            ) : (
              <>
                Welcome to <span className="font-semibold text-foreground">{tierDisplayName}</span>!
                {tier !== "free" && " Your subscription is now active."}
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Plan details */}
          {!isVerifying && tier !== "free" && (
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
              disabled={isVerifying}
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
          {!isVerifying && tier === "free" && (
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
