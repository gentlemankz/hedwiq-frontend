"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarStatusCard } from "@/components/calendar";
import { GmailStatusCard } from "@/components/gmail";
import { CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Derives initial feedback from URL search params.
 * This is a pure function that extracts feedback without side effects.
 */
function getInitialFeedback(searchParams: URLSearchParams): {
  type: "success" | "error";
  message: string;
} | null {
  const calendarConnected = searchParams.get("calendar_connected");
  const calendarError = searchParams.get("calendar_error");
  const gmailConnected = searchParams.get("gmail_connected");
  const gmailError = searchParams.get("gmail_error");

  if (calendarConnected === "true") {
    return { type: "success", message: "Google Calendar connected successfully!" };
  }
  if (calendarError) {
    return { type: "error", message: calendarError };
  }
  if (gmailConnected === "true") {
    return { type: "success", message: "Gmail connected successfully!" };
  }
  if (gmailError) {
    return { type: "error", message: gmailError };
  }
  return null;
}

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Track if we've already cleaned up URL params
  const hasCleanedUrl = useRef(false);

  // Initialize feedback directly from URL params (no effect needed for initial value)
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(() => getInitialFeedback(searchParams));

  // Clean up URL params once (side effect only, no setState)
  useEffect(() => {
    if (hasCleanedUrl.current) return;

    const hasFeedbackParams =
      searchParams.has("calendar_connected") ||
      searchParams.has("calendar_error") ||
      searchParams.has("gmail_connected") ||
      searchParams.has("gmail_error");

    if (hasFeedbackParams) {
      hasCleanedUrl.current = true;
      router.replace("/dashboard/integrations", { scroll: false });
    }
  }, [searchParams, router]);

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (!feedbackMessage) return;

    const timer = setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Connect external services to enhance your meeting experience
          </p>
        </div>

        {/* OAuth Feedback */}
        {feedbackMessage && (
          <Alert
            variant={feedbackMessage.type === "error" ? "destructive" : "default"}
            className={
              feedbackMessage.type === "success"
                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : undefined
            }
          >
            {feedbackMessage.type === "success" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>{feedbackMessage.message}</AlertDescription>
          </Alert>
        )}

        {/* Integration Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <CalendarStatusCard />
          <GmailStatusCard />
        </div>
      </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams (Next.js 13+ requirement)
export default function IntegrationsPage() {
  return (
    <Suspense fallback={<IntegrationsPageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsPageSkeleton() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-5 w-64 bg-muted animate-pulse rounded mt-2" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
