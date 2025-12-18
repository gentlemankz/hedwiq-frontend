"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  UserPlus,
  Trash2,
  Mail,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Users,
  Send,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { InviteeInput, type InviteeEntry } from "./invitee-input";
import { TeamInviteeSelector, type SelectedTeam } from "./team-invitee-selector";
import { TeamInviteBadge } from "./team-invite-badge";
import { useTeamContext } from "@/contexts/team-context";
import type { Meeting } from "@/types/meeting";
import type { MeetingInvitee, RSVPStatus, RSVPSummary } from "@/types/invitee";
import type { TeamMeetingInviteWithTeam } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface ManageInviteesDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The meeting to manage invitees for */
  meeting: Meeting;
  /** Callback when invitees are updated */
  onInviteesUpdated?: () => void;
}

// ============================================================================
// Status Config
// ============================================================================

const statusConfig: Record<
  RSVPStatus,
  { label: string; icon: typeof CheckCircle2; color: string; bgColor: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  accepted: {
    label: "Accepted",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  declined: {
    label: "Declined",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  tentative: {
    label: "Maybe",
    icon: HelpCircle,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
};

// ============================================================================
// Component
// ============================================================================

export function ManageInviteesDialog({
  open,
  onOpenChange,
  meeting,
  onInviteesUpdated,
}: ManageInviteesDialogProps) {
  // Team context
  const { teamHierarchy, teamsLoading } = useTeamContext();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitees, setInvitees] = useState<MeetingInvitee[]>([]);
  const [summary, setSummary] = useState<RSVPSummary | null>(null);
  const [newInvitees, setNewInvitees] = useState<InviteeEntry[]>([]);
  const [inviteeToRemove, setInviteeToRemove] = useState<MeetingInvitee | null>(
    null
  );
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);

  // Team invite state
  const [teamInvites, setTeamInvites] = useState<TeamMeetingInviteWithTeam[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<SelectedTeam[]>([]);
  const [inviteTab, setInviteTab] = useState<"email" | "teams">("email");
  const [teamToRemove, setTeamToRemove] = useState<TeamMeetingInviteWithTeam | null>(null);
  const [teamSendResult, setTeamSendResult] = useState<{
    teamsInvited: number;
    membersInvited: number;
  } | null>(null);

  // Fetch invitees and team invites
  const fetchInvitees = useCallback(async () => {
    if (!meeting.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch individual invitees and team invites in parallel
      const [inviteesResponse, teamInvitesResponse] = await Promise.all([
        fetch(`/api/meetings/${meeting.id}/invitees`),
        fetch(`/api/meetings/${meeting.id}/invite-team`),
      ]);

      const inviteesData = await inviteesResponse.json();
      const teamInvitesData = await teamInvitesResponse.json();

      if (!inviteesResponse.ok) {
        throw new Error(inviteesData.error || "Failed to load invitees");
      }

      setInvitees(inviteesData.invitees);
      setSummary(inviteesData.summary);

      // Team invites might fail if user is not the host - ignore that error
      if (teamInvitesResponse.ok) {
        setTeamInvites(teamInvitesData.invites || []);
      }
    } catch (err) {
      console.error("Fetch invitees error:", err);
      setError(err instanceof Error ? err.message : "Failed to load invitees");
    } finally {
      setIsLoading(false);
    }
  }, [meeting.id]);

  // Fetch on open
  useEffect(() => {
    if (open) {
      fetchInvitees();
      setNewInvitees([]);
      setSendResult(null);
      setSelectedTeams([]);
      setTeamSendResult(null);
      setInviteTab("email");
    }
  }, [open, fetchInvitees]);

  // Get already invited team IDs
  const alreadyInvitedTeamIds = new Set(teamInvites.map((inv) => inv.teamId));

  // Send invitations to new invitees
  const handleSendInvitations = async () => {
    if (newInvitees.length === 0) return;

    setIsSending(true);
    setError(null);
    setSendResult(null);

    try {
      const response = await fetch(`/api/meetings/${meeting.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: newInvitees.map((inv) => inv.email),
          names: newInvitees.reduce(
            (acc, inv) => {
              if (inv.name) acc[inv.email] = inv.name;
              return acc;
            },
            {} as Record<string, string>
          ),
          sendEmails: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitations");
      }

      setSendResult({
        sent: data.emailsSent || 0,
        failed: data.emailsFailed || 0,
      });

      // Clear new invitees and refresh list
      setNewInvitees([]);
      await fetchInvitees();
      onInviteesUpdated?.();
    } catch (err) {
      console.error("Send invitations error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to send invitations"
      );
    } finally {
      setIsSending(false);
    }
  };

  // Remove an invitee
  const handleRemoveInvitee = async (invitee: MeetingInvitee) => {
    setIsRemoving(invitee.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${meeting.id}/invitees?email=${encodeURIComponent(invitee.email)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove invitee");
      }

      // Refresh list
      await fetchInvitees();
      onInviteesUpdated?.();
    } catch (err) {
      console.error("Remove invitee error:", err);
      setError(err instanceof Error ? err.message : "Failed to remove invitee");
    } finally {
      setIsRemoving(null);
      setInviteeToRemove(null);
    }
  };

  // Send team invitations (in parallel for performance)
  const handleSendTeamInvitations = async () => {
    if (selectedTeams.length === 0) return;

    setIsSending(true);
    setError(null);
    setTeamSendResult(null);

    try {
      const invitePromises = selectedTeams.map(async (team) => {
        try {
          const response = await fetch(`/api/meetings/${meeting.id}/invite-team`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: team.teamId,
              sendEmails: true,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            return { success: true, membersInvited: data.membersInvited || 0 };
          }
          return { success: false, membersInvited: 0 };
        } catch {
          return { success: false, membersInvited: 0 };
        }
      });

      const results = await Promise.all(invitePromises);
      const teamsInvited = results.filter((r) => r.success).length;
      const membersInvited = results.reduce((sum, r) => sum + r.membersInvited, 0);

      setTeamSendResult({ teamsInvited, membersInvited });
      setSelectedTeams([]);
      await fetchInvitees();
      onInviteesUpdated?.();
    } catch (err) {
      console.error("Send team invitations error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to send team invitations"
      );
    } finally {
      setIsSending(false);
    }
  };

  // Remove a team invitation
  const handleRemoveTeamInvite = async (invite: TeamMeetingInviteWithTeam) => {
    setIsRemoving(invite.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/meetings/${meeting.id}/invite-team/${invite.teamId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove team invitation");
      }

      // Refresh list
      await fetchInvitees();
      onInviteesUpdated?.();
    } catch (err) {
      console.error("Remove team invite error:", err);
      setError(err instanceof Error ? err.message : "Failed to remove team invitation");
    } finally {
      setIsRemoving(null);
      setTeamToRemove(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Manage Invitees
            </DialogTitle>
            <DialogDescription>
              Add or remove invitees for &quot;{meeting.title}&quot;
            </DialogDescription>
          </DialogHeader>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Success Result */}
          {sendResult && sendResult.sent > 0 && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <Mail className="size-4" />
              {sendResult.sent} invitation{sendResult.sent !== 1 ? "s" : ""} sent
              successfully
              {sendResult.failed > 0 &&
                ` (${sendResult.failed} failed)`}
            </div>
          )}

          {/* Team Success Result */}
          {teamSendResult && teamSendResult.teamsInvited > 0 && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <UsersRound className="size-4" />
              {teamSendResult.teamsInvited} team{teamSendResult.teamsInvited !== 1 ? "s" : ""} invited
              ({teamSendResult.membersInvited} member{teamSendResult.membersInvited !== 1 ? "s" : ""})
            </div>
          )}

          {!isLoading && (
            <div className="space-y-4">
              {/* RSVP Summary */}
              {summary && summary.total > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {summary.total} invited:
                  </span>
                  {summary.accepted > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="size-4" />
                      {summary.accepted} accepted
                    </span>
                  )}
                  {summary.tentative > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <HelpCircle className="size-4" />
                      {summary.tentative} maybe
                    </span>
                  )}
                  {summary.declined > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="size-4" />
                      {summary.declined} declined
                    </span>
                  )}
                  {summary.pending > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-4" />
                      {summary.pending} pending
                    </span>
                  )}
                </div>
              )}

              <Separator />

              {/* Team Invites */}
              {teamInvites.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <UsersRound className="size-4" />
                    Invited Teams
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {teamInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center gap-1"
                      >
                        <TeamInviteBadge invite={invite} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => setTeamToRemove(invite)}
                          disabled={isRemoving === invite.id}
                        >
                          {isRemoving === invite.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Existing Invitees */}
              {invitees.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Individual Invitees</h4>
                  <ScrollArea className="h-[160px] rounded-md border">
                    <div className="p-2 space-y-1">
                      {invitees.map((invitee) => {
                        const status = statusConfig[invitee.status];
                        const StatusIcon = status.icon;

                        return (
                          <div
                            key={invitee.id}
                            className={cn(
                              "flex items-center justify-between rounded-md p-2",
                              status.bgColor
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <StatusIcon
                                className={cn("size-4 shrink-0", status.color)}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {invitee.name || invitee.email}
                                </p>
                                {invitee.name && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {invitee.email}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant="outline"
                                className={cn("text-xs", status.color)}
                              >
                                {status.label}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => setInviteeToRemove(invitee)}
                                disabled={isRemoving === invitee.id}
                              >
                                {isRemoving === invitee.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {invitees.length === 0 && teamInvites.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No invitees yet. Add some below.
                </p>
              )}

              <Separator />

              {/* Add New Invitees */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="size-4" />
                  Add New Invitees
                </h4>
                <Tabs value={inviteTab} onValueChange={(v) => setInviteTab(v as "email" | "teams")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="email" className="gap-1.5">
                      <Mail className="size-3.5" />
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="teams" className="gap-1.5">
                      <UsersRound className="size-3.5" />
                      Teams
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="email" className="mt-3">
                    <InviteeInput
                      invitees={newInvitees}
                      onChange={setNewInvitees}
                      disabled={isSending}
                      placeholder="Enter email to invite"
                    />
                  </TabsContent>
                  <TabsContent value="teams" className="mt-3">
                    <TeamInviteeSelector
                      teams={teamHierarchy}
                      selectedTeams={selectedTeams}
                      onChange={setSelectedTeams}
                      disabled={isSending}
                      loading={teamsLoading}
                      alreadyInvitedTeamIds={alreadyInvitedTeamIds}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              Close
            </Button>
            {newInvitees.length > 0 && inviteTab === "email" && (
              <Button
                onClick={handleSendInvitations}
                disabled={isSending || newInvitees.length === 0}
              >
                {isSending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Send {newInvitees.length} Invitation
                {newInvitees.length !== 1 ? "s" : ""}
              </Button>
            )}
            {selectedTeams.length > 0 && inviteTab === "teams" && (
              <Button
                onClick={handleSendTeamInvitations}
                disabled={isSending || selectedTeams.length === 0}
              >
                {isSending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Invite {selectedTeams.length} Team
                {selectedTeams.length !== 1 ? "s" : ""}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Invitee Confirmation Dialog */}
      <AlertDialog
        open={!!inviteeToRemove}
        onOpenChange={(open) => !open && setInviteeToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Invitee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{inviteeToRemove?.name || inviteeToRemove?.email}</strong>{" "}
              from this meeting? They will no longer be able to access the
              meeting through their invitation link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                inviteeToRemove && handleRemoveInvitee(inviteeToRemove)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Team Confirmation Dialog */}
      <AlertDialog
        open={!!teamToRemove}
        onOpenChange={(open) => !open && setTeamToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the team{" "}
              <strong>{teamToRemove?.team.name}</strong> from this meeting?
              Note: Individual invitees from this team will remain invited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                teamToRemove && handleRemoveTeamInvite(teamToRemove)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ManageInviteesDialog;
