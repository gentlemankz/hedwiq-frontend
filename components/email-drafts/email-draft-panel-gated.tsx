"use client";

import { useFeature } from "@/hooks/use-subscription";
import { FeatureLockedCard } from "@/components/subscription";
import { EmailDraftPanel } from "./email-draft-panel";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Props for EmailDraftPanelGated
 */
interface EmailDraftPanelGatedProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether Gmail is connected (for send functionality) */
  isGmailConnected?: boolean;
  /** Handler to open Gmail connection flow */
  onConnectGmail?: () => void;
  /** Current room ID (for meeting context) */
  roomId?: string;
}

/**
 * Feature-gated wrapper for EmailDraftPanel.
 *
 * Shows a FeatureLockedCard if the user doesn't have access to email drafts.
 * Otherwise renders the full EmailDraftPanel.
 *
 * @example
 * ```tsx
 * <EmailDraftPanelGated
 *   isGmailConnected={isConnected}
 *   onConnectGmail={handleConnectGmail}
 *   roomId={roomId}
 * />
 * ```
 */
export function EmailDraftPanelGated({
  className,
  isGmailConnected,
  onConnectGmail,
  roomId,
}: EmailDraftPanelGatedProps) {
  const { enabled, promptUpgrade, isLoading, error } = useFeature("email_drafts");

  // Show loading state while checking subscription
  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Show error state if subscription loading failed
  if (error) {
    return (
      <div className={className}>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Unable to load subscription status. Please refresh the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show feature locked card if user doesn't have access
  if (!enabled) {
    return (
      <div className={className}>
        <FeatureLockedCard
          feature="email_drafts"
          onUpgrade={promptUpgrade}
          variant="default"
          showBackground
        />
      </div>
    );
  }

  // User has access, render the full panel
  return (
    <EmailDraftPanel
      className={className}
      isGmailConnected={isGmailConnected}
      onConnectGmail={onConnectGmail}
      roomId={roomId}
    />
  );
}
