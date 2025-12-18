"use client";

import { useState, useEffect } from "react";
import { Calendar, CheckCircle2, AlertCircle, Loader2, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { CalendarIntegrationPublic } from "@/types/calendar";

interface CalendarStatusCardProps {
  initialConnected?: boolean;
  initialIntegration?: CalendarIntegrationPublic | null;
  onConnectionChange?: (connected: boolean) => void;
}

export function CalendarStatusCard({
  initialConnected = false,
  initialIntegration = null,
  onConnectionChange,
}: CalendarStatusCardProps) {
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [integration, setIntegration] = useState<CalendarIntegrationPublic | null>(
    initialIntegration
  );
  const [isLoading, setIsLoading] = useState(!initialIntegration && !initialConnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch status on mount if not provided
  useEffect(() => {
    // Skip fetch only if initial data was explicitly provided
    // (initialIntegration is not null OR initialConnected is true)
    if (initialIntegration !== null || initialConnected) {
      setIsLoading(false);
      return;
    }

    // Use AbortController for cleanup on unmount
    const abortController = new AbortController();

    async function fetchStatus() {
      try {
        const response = await fetch("/api/calendar/status", {
          signal: abortController.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setIsConnected(data.connected);
          setIntegration(data.integration);
        }
      } catch (err) {
        // Ignore abort errors (expected on unmount)
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch calendar status:", err);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchStatus();

    // Cleanup: abort fetch on unmount
    return () => {
      abortController.abort();
    };
  }, [initialIntegration, initialConnected]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/connect");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to initiate connection");
      }

      const { authUrl } = await response.json();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      console.error("Failed to connect calendar:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to disconnect");
      }

      setIsConnected(false);
      setIntegration(null);
      onConnectionChange?.(false);
    } catch (err) {
      console.error("Failed to disconnect calendar:", err);
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="size-5" />
          Google Calendar
        </CardTitle>
        <CardDescription>
          Sync your meetings with Google Calendar
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isConnected && integration ? (
          <div className="space-y-4">
            {/* Connected Status */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              {integration.status === "connected" ? (
                <CheckCircle2 className="size-5 text-green-600" />
              ) : (
                <AlertCircle className="size-5 text-amber-600" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {integration.status === "connected" ? "Connected" : "Connection Issue"}
                </p>
                {integration.calendarEmail && (
                  <p className="text-sm text-muted-foreground">
                    {integration.calendarEmail}
                  </p>
                )}
                {integration.status === "error" && integration.errorMessage && (
                  <p className="text-sm text-destructive">
                    {integration.errorMessage}
                  </p>
                )}
              </div>
            </div>

            {/* Reconnect Button (shown when there's an error) */}
            {integration.status === "error" && (
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                variant="default"
                className="w-full"
              >
                {isConnecting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Reconnect Calendar
              </Button>
            )}

            {/* Disconnect Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Link2Off className="mr-2 size-4" />
                  )}
                  Disconnect Calendar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the connection to your Google Calendar. You can
                    reconnect at any time. Existing calendar events will not be
                    affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Google Calendar to automatically sync meeting events and
              get reminders.
            </p>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Calendar className="mr-2 size-4" />
              )}
              Connect Google Calendar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
