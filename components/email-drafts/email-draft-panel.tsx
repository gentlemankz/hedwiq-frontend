"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useEmailDraftsContext } from "@/contexts/email-drafts-context";
import { EmailDraftCardList } from "./email-draft-card";
import type { EmailDraft } from "@/types/email-draft";

/**
 * Props for EmailDraftPanel
 */
interface EmailDraftPanelProps {
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
 * A panel component that displays and manages email drafts.
 *
 * Features:
 * - Tabs for filtering drafts by status (Pending, Sent, Dismissed)
 * - Real-time updates via EmailDraftsContext
 * - Send and reject actions
 * - Gmail connection status
 *
 * @example
 * ```tsx
 * <EmailDraftPanel
 *   isGmailConnected={isConnected}
 *   onConnectGmail={handleConnectGmail}
 *   meetingId={meetingId}
 *   roomId={roomId}
 * />
 * ```
 */
export function EmailDraftPanel({
  className,
  isGmailConnected = false,
  onConnectGmail,
  // roomId kept for future meeting context features
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  roomId: _roomId,
}: EmailDraftPanelProps) {
  const {
    drafts,
    pendingDrafts,
    draftsByStatus,
    pendingCount,
    activeDraftId,
    setActiveDraft,
    updateDraft,
    updateDraftStatus,
    rejectDraft,
  } = useEmailDraftsContext();

  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "dismissed">(
    "pending"
  );
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Clear success/error messages after timeout
  useEffect(() => {
    if (sendSuccess) {
      const timer = setTimeout(() => setSendSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [sendSuccess]);

  useEffect(() => {
    if (sendError) {
      const timer = setTimeout(() => setSendError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [sendError]);

  // Get drafts for current tab
  const getTabDrafts = useCallback(() => {
    switch (activeTab) {
      case "pending":
        return pendingDrafts;
      case "sent":
        return draftsByStatus.sent ?? [];
      case "dismissed":
        return draftsByStatus.rejected ?? [];
      default:
        return [];
    }
  }, [activeTab, pendingDrafts, draftsByStatus]);

  // Handle draft editing
  const handleEdit = useCallback(
    (draftId: string, edits: { subject?: string; body?: string; to?: string[] }) => {
      updateDraft(draftId, edits);
    },
    [updateDraft]
  );

  // Handle draft rejection
  const handleReject = useCallback(
    (draftId: string) => {
      rejectDraft(draftId);
    },
    [rejectDraft]
  );

  // Handle sending email with proper cleanup
  const handleSend = useCallback(
    async (
      draft: EmailDraft,
      edits?: { to?: string[]; subject?: string; body?: string }
    ) => {
      setSendingDraftId(draft.id);
      setSendError(null);

      try {
        const response = await fetch("/api/gmail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftId: draft.id,
            override: edits,
          }),
        });

        // Check if component is still mounted before updating state
        if (!isMountedRef.current) return;

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to send email");
        }

        // Update local state (only if still mounted)
        updateDraftStatus(draft.id, "sent");
        setSendSuccess(`Email sent successfully!`);
      } catch (error) {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) return;

        console.error("Failed to send email:", error);
        setSendError(
          error instanceof Error ? error.message : "Failed to send email"
        );
        updateDraftStatus(draft.id, "failed");
      } finally {
        // Check if component is still mounted before updating state
        if (isMountedRef.current) {
          setSendingDraftId(null);
        }
      }
    },
    [updateDraftStatus]
  );

  const tabDrafts = getTabDrafts();
  const sentCount = draftsByStatus.sent?.length ?? 0;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Mail className="size-5" />
          <h3 className="font-semibold">Email Drafts</h3>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="rounded-full">
              {pendingCount}
            </Badge>
          )}
        </div>

        {/* Gmail connection status */}
        {!isGmailConnected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onConnectGmail}
            className="text-xs"
          >
            <ExternalLink className="size-3 mr-1" />
            Connect Gmail
          </Button>
        )}
      </div>

      {/* Status messages */}
      {sendSuccess && (
        <Alert className="mx-4 mt-2 bg-green-50 dark:bg-green-950/50 border-green-200">
          <CheckCircle2 className="size-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            {sendSuccess}
          </AlertDescription>
        </Alert>
      )}

      {sendError && (
        <Alert className="mx-4 mt-2 bg-destructive/10 border-destructive">
          <AlertCircle className="size-4 text-destructive" />
          <AlertDescription className="text-destructive">
            {sendError}
          </AlertDescription>
        </Alert>
      )}

      {/* Gmail not connected warning */}
      {!isGmailConnected && pendingCount > 0 && (
        <Alert className="mx-4 mt-2 bg-amber-50 dark:bg-amber-950/50 border-amber-200">
          <AlertCircle className="size-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
            Connect your Gmail account to send email drafts.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-3 mx-4 mt-2" style={{ width: "calc(100% - 2rem)" }}>
          <TabsTrigger value="pending" className="text-xs">
            Pending
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full text-xs px-1.5">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="text-xs">
            Sent
            {sentCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full text-xs px-1.5">
                {sentCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dismissed" className="text-xs">
            Dismissed
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="pending" className="p-4 m-0">
            <EmailDraftCardList
              drafts={tabDrafts}
              activeDraftId={activeDraftId}
              onToggleExpand={setActiveDraft}
              onSend={handleSend}
              onReject={handleReject}
              onEdit={handleEdit}
              sendingDraftId={sendingDraftId}
              isGmailConnected={isGmailConnected}
              emptyMessage="No pending drafts"
            />
          </TabsContent>

          <TabsContent value="sent" className="p-4 m-0">
            <EmailDraftCardList
              drafts={tabDrafts}
              activeDraftId={activeDraftId}
              onToggleExpand={setActiveDraft}
              isGmailConnected={isGmailConnected}
              emptyMessage="No sent emails"
            />
          </TabsContent>

          <TabsContent value="dismissed" className="p-4 m-0">
            <EmailDraftCardList
              drafts={tabDrafts}
              activeDraftId={activeDraftId}
              onToggleExpand={setActiveDraft}
              isGmailConnected={isGmailConnected}
              emptyMessage="No dismissed drafts"
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {drafts.length} total draft{drafts.length !== 1 ? "s" : ""}
          </span>
          {isGmailConnected && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-3" />
              Gmail Connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
