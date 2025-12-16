"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Mail,
  Send,
  X,
  Edit3,
  ChevronDown,
  ChevronUp,
  User,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { EmailDraft, DraftStatus } from "@/types/email-draft";
import {
  DRAFT_STATUS_CONFIG,
  DRAFT_CONFIDENCE_THRESHOLD,
  formatDraftTime,
  formatRecipients,
  truncateText,
  isDraftEditable,
  isDraftSendable,
} from "@/types/email-draft";

/**
 * Props for EmailDraftCard
 */
interface EmailDraftCardProps {
  /** The email draft to display */
  draft: EmailDraft;
  /** Additional CSS classes */
  className?: string;
  /** Whether this draft is currently expanded for editing */
  isExpanded?: boolean;
  /** Toggle expand/collapse */
  onToggleExpand?: () => void;
  /** Handler for sending the draft */
  onSend?: (draft: EmailDraft, edits?: { to?: string[]; subject?: string; body?: string }) => Promise<void>;
  /** Handler for rejecting/dismissing the draft */
  onReject?: (draftId: string) => void;
  /** Handler for editing the draft */
  onEdit?: (draftId: string, edits: { subject?: string; body?: string; to?: string[] }) => void;
  /** Whether the send operation is in progress */
  isSending?: boolean;
  /** Whether Gmail is connected */
  isGmailConnected?: boolean;
}

/**
 * Status icon mapping
 */
const STATUS_ICONS: Record<DraftStatus, typeof Mail> = {
  generating: Loader2,
  ready: Mail,
  edited: Edit3,
  sent: CheckCircle2,
  rejected: XCircle,
  failed: AlertCircle,
};

/**
 * A card component that displays an email draft with edit capabilities.
 *
 * Features:
 * - Collapsible view (collapsed: preview, expanded: full editor)
 * - Inline editing of subject, body, and recipients
 * - Send and reject actions
 * - Status indicators
 *
 * @example
 * ```tsx
 * <EmailDraftCard
 *   draft={draft}
 *   isExpanded={activeDraftId === draft.id}
 *   onToggleExpand={() => setActiveDraftId(draft.id)}
 *   onSend={handleSend}
 *   onReject={handleReject}
 *   isGmailConnected={true}
 * />
 * ```
 */
export function EmailDraftCard({
  draft,
  className,
  isExpanded = false,
  onToggleExpand,
  onSend,
  onReject,
  onEdit,
  isSending = false,
  isGmailConnected = false,
}: EmailDraftCardProps) {
  // Local state for editable fields
  // Note: Parent component should pass key={draft.id} to reset state when draft changes
  const [localSubject, setLocalSubject] = useState(draft.subject);
  const [localBody, setLocalBody] = useState(draft.body);
  const [localTo, setLocalTo] = useState(
    draft.suggestedTo
      .filter((r) => r.email)
      .map((r) => r.email as string)
      .join(", ")
  );
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  const statusConfig = DRAFT_STATUS_CONFIG[draft.status];
  const StatusIcon = STATUS_ICONS[draft.status];

  const canEdit = isDraftEditable(draft.status) && !isSending;
  const canSend = isDraftSendable(draft.status) && isGmailConnected && !isSending;

  // Handle local edits
  const handleSubjectChange = useCallback(
    (value: string) => {
      setLocalSubject(value);
      setHasLocalEdits(true);
      onEdit?.(draft.id, { subject: value });
    },
    [draft.id, onEdit]
  );

  const handleBodyChange = useCallback(
    (value: string) => {
      setLocalBody(value);
      setHasLocalEdits(true);
      onEdit?.(draft.id, { body: value });
    },
    [draft.id, onEdit]
  );

  const handleToChange = useCallback(
    (value: string) => {
      setLocalTo(value);
      setHasLocalEdits(true);
      const emails = value.split(",").map((e) => e.trim()).filter(Boolean);
      onEdit?.(draft.id, { to: emails });
    },
    [draft.id, onEdit]
  );

  // Handle send
  const handleSend = useCallback(async () => {
    if (!onSend) return;

    const edits = hasLocalEdits
      ? {
          to: localTo.split(",").map((e) => e.trim()).filter(Boolean),
          subject: localSubject,
          body: localBody,
        }
      : undefined;

    await onSend(draft, edits);
  }, [draft, onSend, hasLocalEdits, localTo, localSubject, localBody]);

  // Handle reject
  const handleReject = useCallback(() => {
    onReject?.(draft.id);
  }, [draft.id, onReject]);

  // Collapsed view
  const CollapsedContent = (
    <div className="flex items-start gap-3">
      {/* Status Icon */}
      <div
        className={cn(
          "p-2 rounded-full shrink-0",
          statusConfig.bgColor
        )}
      >
        <StatusIcon
          className={cn(
            "size-4",
            statusConfig.color,
            draft.status === "generating" && "animate-spin"
          )}
        />
      </div>

      {/* Content Preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className="text-xs">
            {draft.actionType.replace("_", " ")}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-xs", statusConfig.color)}
          >
            {statusConfig.label}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDraftTime(draft.generatedAt)}
          </span>
        </div>

        <p className="text-sm font-medium truncate">{draft.subject}</p>

        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <User className="size-3" />
          <span className="truncate">
            {formatRecipients(draft.suggestedTo)}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {truncateText(draft.body, 100)}
        </p>
      </div>

      {/* Expand indicator */}
      <div className="shrink-0">
        {isExpanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );

  // Expanded editor view
  const ExpandedContent = (
    <div className="space-y-4 pt-4 border-t">
      {/* Recipients */}
      <div className="space-y-2">
        <Label htmlFor={`to-${draft.id}`} className="text-sm font-medium">
          To
        </Label>
        <Input
          id={`to-${draft.id}`}
          value={localTo}
          onChange={(e) => handleToChange(e.target.value)}
          placeholder="email@example.com, another@example.com"
          disabled={!canEdit}
          className="text-sm"
        />
        {draft.suggestedTo.length > 0 &&
          draft.suggestedTo.some((r) => !r.email) && (
            <p className="text-xs text-muted-foreground">
              Suggested:{" "}
              {draft.suggestedTo
                .filter((r) => !r.email)
                .map((r) => r.name)
                .join(", ")}
            </p>
          )}
      </div>

      {/* Subject */}
      <div className="space-y-2">
        <Label htmlFor={`subject-${draft.id}`} className="text-sm font-medium">
          Subject
        </Label>
        <Input
          id={`subject-${draft.id}`}
          value={localSubject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          disabled={!canEdit}
          className="text-sm"
        />
      </div>

      {/* Body */}
      <div className="space-y-2">
        <Label htmlFor={`body-${draft.id}`} className="text-sm font-medium">
          Message
        </Label>
        <Textarea
          id={`body-${draft.id}`}
          value={localBody}
          onChange={(e) => handleBodyChange(e.target.value)}
          disabled={!canEdit}
          rows={6}
          className="text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {localBody.length} / 5000 characters
        </p>
      </div>

      {/* Confidence indicator (if low) */}
      {draft.generationConfidence < DRAFT_CONFIDENCE_THRESHOLD && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-3" />
          <span>
            Low confidence draft ({Math.round(draft.generationConfidence * 100)}
            %). Please review carefully.
          </span>
        </div>
      )}

      {/* Context info */}
      {draft.meetingContext.meetingTitle && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">From meeting:</span>{" "}
          {draft.meetingContext.meetingTitle}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2">
        {canSend && (
          <Button
            onClick={handleSend}
            disabled={isSending || !localTo.trim()}
            className="flex-1"
            size="sm"
          >
            {isSending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="size-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        )}

        {!isGmailConnected && isDraftSendable(draft.status) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="flex-1" disabled>
                <Mail className="size-4 mr-2" />
                Connect Gmail to Send
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Connect your Gmail account in settings to send emails</p>
            </TooltipContent>
          </Tooltip>
        )}

        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReject}
            disabled={isSending}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Error message */}
      {draft.status === "failed" && draft.errorMessage && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
          <AlertCircle className="size-3 shrink-0" />
          <span>{draft.errorMessage}</span>
        </div>
      )}
    </div>
  );

  return (
    <Card
      className={cn(
        "transition-all",
        draft.status === "sent" && "opacity-60",
        draft.status === "rejected" && "opacity-40",
        className
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-3 cursor-pointer hover:bg-muted/50">
            {CollapsedContent}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-3 pb-3">{ExpandedContent}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * A list of email draft cards.
 */
export function EmailDraftCardList({
  drafts,
  className,
  activeDraftId,
  onToggleExpand,
  onSend,
  onReject,
  onEdit,
  sendingDraftId,
  isGmailConnected = false,
  emptyMessage = "No email drafts",
}: {
  drafts: EmailDraft[];
  className?: string;
  activeDraftId?: string | null;
  onToggleExpand?: (draftId: string | null) => void;
  onSend?: (draft: EmailDraft, edits?: { to?: string[]; subject?: string; body?: string }) => Promise<void>;
  onReject?: (draftId: string) => void;
  onEdit?: (draftId: string, edits: { subject?: string; body?: string; to?: string[] }) => void;
  sendingDraftId?: string | null;
  isGmailConnected?: boolean;
  emptyMessage?: string;
}) {
  if (drafts.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground"
        role="status"
      >
        <Mail className="mb-2 size-8 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
        <p className="text-xs">
          Email drafts will appear here when actions are detected
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} role="list">
      {drafts.map((draft) => (
        <EmailDraftCard
          key={draft.id}
          draft={draft}
          isExpanded={activeDraftId === draft.id}
          onToggleExpand={() =>
            onToggleExpand?.(activeDraftId === draft.id ? null : draft.id)
          }
          onSend={onSend}
          onReject={onReject}
          onEdit={onEdit}
          isSending={sendingDraftId === draft.id}
          isGmailConnected={isGmailConnected}
        />
      ))}
    </div>
  );
}
