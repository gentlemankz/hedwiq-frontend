"use client";

import { useState, useEffect } from "react";
import { Mail, CheckCircle2, AlertCircle, Loader2, Link2Off, RefreshCw } from "lucide-react";
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
import type { GmailIntegrationPublic } from "@/types/gmail";

interface GmailStatusCardProps {
  initialConnected?: boolean;
  initialIntegration?: GmailIntegrationPublic | null;
  onConnectionChange?: (connected: boolean) => void;
}

export function GmailStatusCard({
  initialConnected = false,
  initialIntegration = null,
  onConnectionChange,
}: GmailStatusCardProps) {
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [integration, setIntegration] = useState<GmailIntegrationPublic | null>(
    initialIntegration
  );
  const [isLoading, setIsLoading] = useState(!initialIntegration && !initialConnected);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch status on mount if not provided
  useEffect(() => {
    if (initialIntegration !== undefined) {
      return;
    }

    // Use AbortController for cleanup on unmount
    const abortController = new AbortController();

    async function fetchStatus() {
      try {
        const response = await fetch("/api/gmail/status", {
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
        console.error("Failed to fetch Gmail status:", err);
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
  }, [initialIntegration]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/connect");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to initiate connection");
      }

      const { authUrl } = await response.json();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      console.error("Failed to connect Gmail:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/disconnect", {
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
      console.error("Failed to disconnect Gmail:", err);
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
            <Mail className="size-5" />
            Gmail
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
          <Mail className="size-5" />
          Gmail
        </CardTitle>
        <CardDescription>
          Send follow-up emails directly from meetings
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
                {integration.gmailEmail && (
                  <p className="text-sm text-muted-foreground">
                    {integration.gmailEmail}
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
                Reconnect Gmail
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
                  Disconnect Gmail
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the connection to your Gmail account. You won&apos;t
                    be able to send follow-up emails from meetings until you reconnect.
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
              Connect your Gmail account to send AI-drafted follow-up emails
              directly from your meetings.
            </p>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Mail className="mr-2 size-4" />
              )}
              Connect Gmail
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
