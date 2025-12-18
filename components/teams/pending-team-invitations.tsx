"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Check, X, Loader2, Users, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamColorDot } from "./team-color-dot";
import { formatDistanceToNow } from "date-fns";
import { useTeamContext } from "@/contexts/team-context";
import { ROLE_LABELS, type PendingTeamInvitation } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface PendingTeamInvitationsProps {
  /** Callback when an invitation is accepted */
  onAccept?: (teamId: string) => void;
  /** Callback when an invitation is declined */
  onDecline?: (teamId: string) => void;
  /** Compact mode for sidebar display */
  compact?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function PendingTeamInvitations({
  onAccept,
  onDecline,
  compact = false,
}: PendingTeamInvitationsProps) {
  const { refreshTeams } = useTeamContext();
  const [invitations, setInvitations] = useState<PendingTeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // RESOURCE MANAGEMENT: Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    try {
      const response = await fetch("/api/teams/invitations");
      if (!response.ok) {
        throw new Error("Failed to fetch invitations");
      }
      const data = await response.json();
      // RESOURCE MANAGEMENT: Only update state if component is still mounted
      if (mountedRef.current) {
        setInvitations(data.invitations ?? []);
        setError(null);
      }
    } catch (err) {
      console.error("Failed to fetch pending invitations:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load invitations");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  // Handle accept/decline
  const handleAction = async (
    teamId: string,
    action: "accept" | "decline",
    isExternal?: boolean
  ) => {
    // Optimistic UI update: add to processing immediately
    setProcessingIds((prev) => new Set([...prev, teamId]));

    try {
      const response = await fetch("/api/teams/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, action, isExternal }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} invitation`);
      }

      // RESOURCE MANAGEMENT: Only update state if mounted
      if (!mountedRef.current) return;

      // Remove from local state
      setInvitations((prev) => prev.filter((inv) => inv.teamId !== teamId));

      // Refresh teams list if accepted
      if (action === "accept") {
        await refreshTeams();
        onAccept?.(teamId);
      } else {
        onDecline?.(teamId);
      }
    } catch (err) {
      console.error(`Failed to ${action} invitation:`, err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : `Failed to ${action}`);
      }
    } finally {
      if (mountedRef.current) {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(teamId);
          return next;
        });
      }
    }
  };

  // Don't render if no invitations
  if (!loading && invitations.length === 0) {
    return null;
  }

  // Loading state
  if (loading) {
    if (compact) {
      return null; // Don't show loading in compact mode
    }
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use shared ROLE_LABELS from types/team.ts to avoid duplication

  // Compact mode for sidebar
  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
          <Mail className="size-3" />
          <span>Pending Invitations ({invitations.length})</span>
        </div>
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="mx-2 p-2 rounded-lg border bg-muted/30 space-y-2"
          >
            <div className="flex items-center gap-2">
              <TeamColorDot color={invitation.teamColor} size="sm" />
              <span className="text-sm font-medium truncate flex-1">
                {invitation.teamName}
              </span>
              <Badge variant="outline" className="text-xs shrink-0">
                {ROLE_LABELS[invitation.role] ?? invitation.role}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="default"
                className="h-7 flex-1 text-xs"
                onClick={() => handleAction(invitation.teamId, "accept", invitation.isExternal)}
                disabled={processingIds.has(invitation.teamId)}
              >
                {processingIds.has(invitation.teamId) ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <>
                    <Check className="size-3 mr-1" />
                    Accept
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 text-xs"
                onClick={() => handleAction(invitation.teamId, "decline", invitation.isExternal)}
                disabled={processingIds.has(invitation.teamId)}
              >
                <X className="size-3 mr-1" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Full card mode
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <CardTitle className="text-lg">Team Invitations</CardTitle>
        </div>
        <CardDescription>
          You have {invitations.length} pending team{" "}
          {invitations.length === 1 ? "invitation" : "invitations"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="p-4 rounded-lg border bg-card space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <TeamColorDot color={invitation.teamColor} size="md" />
                <div className="min-w-0">
                  <h4 className="font-semibold truncate">{invitation.teamName}</h4>
                  {invitation.teamDescription && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {invitation.teamDescription}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="secondary">
                {ROLE_LABELS[invitation.role] ?? invitation.role}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="size-3.5" />
                <span>{invitation.memberCount} members</span>
              </div>
              {invitation.inviterName && (
                <span>
                  Invited by {invitation.inviterName}
                </span>
              )}
              <span>
                {formatDistanceToNow(new Date(invitation.invitedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => handleAction(invitation.teamId, "accept", invitation.isExternal)}
                disabled={processingIds.has(invitation.teamId)}
              >
                {processingIds.has(invitation.teamId) ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Check className="size-4 mr-2" />
                )}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction(invitation.teamId, "decline", invitation.isExternal)}
                disabled={processingIds.has(invitation.teamId)}
              >
                <X className="size-4 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
