"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Users,
  X,
  Crown,
  Shield,
  User,
  UserPlus,
  Mail,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TeamColorDot } from "./team-color-dot";
import { InviteTeamMemberInput, type TeamInviteEntry } from "./invite-team-member-input";
import { getInitials, formatRelativeTime } from "@/lib/utils";
import {
  canChangeRole,
  canPerformAction,
  ROLE_LABELS,
  type TeamWithSubteams,
  type TeamMemberWithUser,
  type TeamRole,
  type ExternalInvitationWithInviter,
} from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamWithSubteams;
  userId: string;
}

// ============================================================================
// Role Icons
// ============================================================================

const roleIcons: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

// NOTE: Using shared ROLE_LABELS from types/team.ts instead of local definition

// ============================================================================
// Component
// ============================================================================

export function TeamMembersDialog({
  open,
  onOpenChange,
  team,
  userId,
}: TeamMembersDialogProps) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // State
  const [members, setMembers] = useState<TeamMemberWithUser[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // External invitations state
  const [externalInvitations, setExternalInvitations] = useState<
    ExternalInvitationWithInviter[]
  >([]);
  const [externalLoading, setExternalLoading] = useState(false);

  // Invite state - using InviteTeamMemberInput for bulk support
  const [pendingInvites, setPendingInvites] = useState<TeamInviteEntry[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Get current user's role
  const currentUserMember = members.find((m) => m.userId === userId);
  const currentUserRole: TeamRole = currentUserMember?.role ?? "member";
  const canInvite = canPerformAction(currentUserRole, "canInviteMembers");
  const canRemove = canPerformAction(currentUserRole, "canRemoveMembers");

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/teams/${team.id}/members`);
      if (!response.ok) {
        throw new Error("Failed to fetch members");
      }
      const data = await response.json();

      if (!mountedRef.current) return;

      setMembers(data.members ?? []);
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to fetch members:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch members");
    } finally {
      if (mountedRef.current) {
        setMembersLoading(false);
      }
    }
  }, [team.id]);

  // Fetch external invitations
  const fetchExternalInvitations = useCallback(async () => {
    setExternalLoading(true);

    try {
      const response = await fetch(`/api/teams/${team.id}/external-invites`);
      if (!response.ok) {
        // Don't show error for external invites - may not have permission
        return;
      }
      const data = await response.json();

      if (!mountedRef.current) return;

      setExternalInvitations(data.invitations ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch external invitations:", err);
    } finally {
      if (mountedRef.current) {
        setExternalLoading(false);
      }
    }
  }, [team.id]);

  // Fetch members and external invitations when dialog opens
  useEffect(() => {
    if (open) {
      fetchMembers();
      fetchExternalInvitations();
      setPendingInvites([]);
      setInviteError(null);
    }
  }, [open, fetchMembers, fetchExternalInvitations]);

  // Handle bulk invite submission (both internal and external)
  const handleInviteSubmit = async () => {
    if (pendingInvites.length === 0) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      // Separate internal and external invites
      const internalInvites = pendingInvites.filter((inv) => !inv.isExternal);
      const externalInvites = pendingInvites.filter((inv) => inv.isExternal);

      let totalFailed: Array<{ identifier: string; reason: string }> = [];

      // Handle internal invites (existing users)
      if (internalInvites.length > 0) {
        // Group by role for batch processing
        const invitesByRole = internalInvites.reduce((acc, inv) => {
          if (!acc[inv.role]) acc[inv.role] = [];
          acc[inv.role].push(inv.email);
          return acc;
        }, {} as Record<TeamRole, string[]>);

        for (const [role, emails] of Object.entries(invitesByRole)) {
          const response = await fetch(`/api/teams/${team.id}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invites: emails.map((email) => ({ email })),
              role,
            }),
          });

          if (!mountedRef.current) return;

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to send invitations");
          }

          const data = await response.json();
          if (data.failed && data.failed.length > 0) {
            totalFailed = [...totalFailed, ...data.failed];
          }
        }
      }

      // Handle external invites (users without accounts)
      if (externalInvites.length > 0) {
        // Group by role
        const externalByRole = externalInvites.reduce((acc, inv) => {
          const role = inv.role === "owner" ? "member" : inv.role; // Can't assign owner to external
          if (!acc[role]) acc[role] = [];
          acc[role].push(inv.email);
          return acc;
        }, {} as Record<string, string[]>);

        for (const [role, emails] of Object.entries(externalByRole)) {
          const response = await fetch(`/api/teams/${team.id}/external-invites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails, role }),
          });

          if (!mountedRef.current) return;

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to send external invitations");
          }

          const data = await response.json();
          if (data.failed && data.failed.length > 0) {
            totalFailed = [...totalFailed, ...data.failed.map((f: { email: string; reason: string }) => ({
              identifier: f.email,
              reason: f.reason,
            }))];
          }
        }
      }

      if (totalFailed.length > 0) {
        setInviteError(
          `${totalFailed.length} invitation(s) failed: ${totalFailed
            .map((f) => f.reason)
            .join(", ")}`
        );
      }

      // Clear pending invites and refresh
      setPendingInvites([]);
      await fetchMembers();
      await fetchExternalInvitations();
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to invite members:", err);
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invitations"
      );
    } finally {
      if (mountedRef.current) {
        setIsInviting(false);
      }
    }
  };

  // Handle cancelling an external invitation
  const handleCancelExternalInvite = async (inviteId: string) => {
    try {
      const response = await fetch(
        `/api/teams/${team.id}/external-invites/${inviteId}`,
        { method: "DELETE" }
      );

      if (!mountedRef.current) return;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel invitation");
      }

      // Update local state
      setExternalInvitations((prev) =>
        prev.filter((inv) => inv.id !== inviteId)
      );
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to cancel external invitation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to cancel invitation"
      );
    }
  };

  // Handle resending an external invitation
  const handleResendExternalInvite = async (inviteId: string) => {
    try {
      const response = await fetch(
        `/api/teams/${team.id}/external-invites/${inviteId}`,
        { method: "PATCH" }
      );

      if (!mountedRef.current) return;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to resend invitation");
      }

      // Refresh external invitations
      await fetchExternalInvitations();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to resend external invitation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to resend invitation"
      );
    }
  };

  // Check if an email has an account (for external invite detection)
  // Note: Server-side now handles fallback to external invite automatically,
  // so this is mainly for UI indication purposes
  const checkEmailHasAccount = useCallback(async (email: string): Promise<boolean> => {
    try {
      // Check against existing members first (quick local check)
      const normalizedEmail = email.toLowerCase().trim();
      if (members.some((m) => m.user.email.toLowerCase() === normalizedEmail)) {
        return true;
      }

      // Check against pending external invitations
      if (externalInvitations.some((inv) => inv.email.toLowerCase() === normalizedEmail)) {
        return false; // Already has pending external invite
      }

      // Call API to check if email has an account
      const response = await fetch("/api/teams/check-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: [email] }),
      });

      if (!response.ok) {
        // On error, default to external (server will verify anyway)
        return false;
      }

      const data = await response.json();
      return data.results?.[email] ?? false;
    } catch {
      // On error, default to external (server will verify anyway)
      return false;
    }
  }, [members, externalInvitations]);

  // Get existing member emails for duplicate prevention
  const existingMemberEmails = members.map((m) => m.user.email);

  // Handle role change
  const handleRoleChange = async (memberId: string, newRole: TeamRole) => {
    try {
      const response = await fetch(
        `/api/teams/${team.id}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (!mountedRef.current) return;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update role");
      }

      // Update local state
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to update role:", err);
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  // Handle remove member
  const handleRemove = async (memberId: string) => {
    try {
      const response = await fetch(
        `/api/teams/${team.id}/members/${memberId}`,
        {
          method: "DELETE",
        }
      );

      if (!mountedRef.current) return;

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }

      // Update local state
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to remove member:", err);
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
      setInviteError(null);
    }
    onOpenChange(newOpen);
  };

  // Separate active, pending, and left members
  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");
  const leftMembers = members.filter((m) => m.status === "left");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Team Members
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <TeamColorDot color={team.color} size="sm" />
            {team.name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Invite Section */}
          {canInvite && (
            <div className="space-y-3">
              <InviteTeamMemberInput
                invites={pendingInvites}
                onChange={setPendingInvites}
                disabled={isInviting}
                existingMemberEmails={existingMemberEmails}
                checkEmailHasAccount={checkEmailHasAccount}
                showExternalIndicator={true}
              />
              {inviteError && (
                <p className="text-sm text-destructive">{inviteError}</p>
              )}
              {pendingInvites.length > 0 && (
                <Button
                  onClick={handleInviteSubmit}
                  disabled={isInviting}
                  className="w-full"
                >
                  {isInviting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    `Send ${pendingInvites.length} Invitation${pendingInvites.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <Label>
              Members ({activeMembers.length})
            </Label>
            {membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2 pr-4">
                  {/* Active Members */}
                  {activeMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      currentUserRole={currentUserRole}
                      currentUserId={userId}
                      canRemove={canRemove}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemove}
                    />
                  ))}

                  {/* Pending Members (internal invites) */}
                  {pendingMembers.length > 0 && (
                    <>
                      <div className="pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Pending Invitations
                      </div>
                      {pendingMembers.map((member) => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          currentUserRole={currentUserRole}
                          currentUserId={userId}
                          canRemove={canRemove}
                          onRoleChange={handleRoleChange}
                          onRemove={handleRemove}
                          isPending
                        />
                      ))}
                    </>
                  )}

                  {/* External Invitations (users without accounts) */}
                  {externalInvitations.length > 0 && (
                    <>
                      <div className="pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        External Invitations ({externalInvitations.length})
                      </div>
                      {externalLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        externalInvitations.map((invite) => (
                          <ExternalInviteRow
                            key={invite.id}
                            invitation={invite}
                            canManage={canInvite}
                            onCancel={() => handleCancelExternalInvite(invite.id)}
                            onResend={() => handleResendExternalInvite(invite.id)}
                          />
                        ))
                      )}
                    </>
                  )}

                  {/* Left/Removed Members - with re-invite option */}
                  {leftMembers.length > 0 && canInvite && (
                    <>
                      <div className="pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Former Members
                      </div>
                      {leftMembers.map((member) => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          currentUserRole={currentUserRole}
                          currentUserId={userId}
                          canRemove={false}
                          onRoleChange={handleRoleChange}
                          onRemove={handleRemove}
                          isLeft
                          onReInvite={async () => {
                            try {
                              const response = await fetch(`/api/teams/${team.id}/members`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  invites: [{ userId: member.userId }],
                                  role: member.role,
                                }),
                              });
                              if (!response.ok) {
                                throw new Error("Failed to re-invite member");
                              }
                              await fetchMembers();
                            } catch (err) {
                              console.error("Failed to re-invite:", err);
                              setError(err instanceof Error ? err.message : "Failed to re-invite");
                            }
                          }}
                        />
                      ))}
                    </>
                  )}

                  {members.length === 0 && !membersLoading && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No members found
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Member Row Component
// ============================================================================

interface MemberRowProps {
  member: TeamMemberWithUser;
  currentUserRole: TeamRole;
  currentUserId: string;
  canRemove: boolean;
  onRoleChange: (memberId: string, newRole: TeamRole) => void;
  onRemove: (memberId: string) => void;
  isPending?: boolean;
  isLeft?: boolean;
  onReInvite?: () => Promise<void>;
}

function MemberRow({
  member,
  currentUserRole,
  currentUserId,
  canRemove,
  onRoleChange,
  onRemove,
  isPending,
  isLeft,
  onReInvite,
}: MemberRowProps) {
  const [isReInviting, setIsReInviting] = useState(false);
  const RoleIcon = roleIcons[member.role];
  const isCurrentUser = member.userId === currentUserId;
  const canChangeThisRole = canChangeRole(
    currentUserRole,
    member.role,
    member.role
  );
  const canRemoveThis = canRemove && !isCurrentUser && member.role !== "owner";

  const handleReInvite = async () => {
    if (!onReInvite || isReInviting) return;
    setIsReInviting(true);
    try {
      await onReInvite();
    } finally {
      setIsReInviting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
      <Avatar className="size-8">
        <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
        <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{member.user.name}</span>
          {isCurrentUser && (
            <Badge variant="outline" className="text-xs">
              You
            </Badge>
          )}
          {isPending && (
            <Badge variant="secondary" className="text-xs">
              Pending
            </Badge>
          )}
          {isLeft && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Left
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {member.user.email}
        </p>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <RoleIcon className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {ROLE_LABELS[member.role]}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {member.role === "owner"
              ? "Team owner - full control"
              : member.role === "admin"
              ? "Admin - can manage members and settings"
              : "Member - can view and participate"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Role Selector (for admins/owners) */}
      {canChangeThisRole && !isCurrentUser && member.role !== "owner" && (
        <Select
          value={member.role}
          onValueChange={(v) => onRoleChange(member.id, v as TeamRole)}
        >
          <SelectTrigger className="w-[90px] h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Remove Button */}
      {canRemoveThis && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onRemove(member.id)}
        >
          <X className="size-4" />
        </Button>
      )}

      {/* Re-invite Button for left members */}
      {isLeft && onReInvite && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleReInvite}
          disabled={isReInviting}
        >
          {isReInviting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <>
              <UserPlus className="size-3 mr-1" />
              Re-invite
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// External Invite Row Component
// ============================================================================

interface ExternalInviteRowProps {
  invitation: ExternalInvitationWithInviter;
  canManage: boolean;
  onCancel: () => void;
  onResend: () => void;
}

function ExternalInviteRow({
  invitation,
  canManage,
  onCancel,
  onResend,
}: ExternalInviteRowProps) {
  const [isResending, setIsResending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Calculate days until expiration
  const expiresAt = new Date(invitation.expiresAt);
  const now = new Date();
  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const handleResend = async () => {
    setIsResending(true);
    try {
      await onResend();
    } finally {
      setIsResending(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      {/* Avatar placeholder with mail icon */}
      <div className="size-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
        <Mail className="size-4 text-amber-600 dark:text-amber-500" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{invitation.email}</span>
          <Badge
            variant="outline"
            className="text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
          >
            External
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {daysRemaining > 0
                    ? `Expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                    : "Expiring soon"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Invited {formatRelativeTime(new Date(invitation.invitedAt).getTime())}
                  {invitation.inviter && ` by ${invitation.inviter.name}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Role badge */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">
          {ROLE_LABELS[invitation.role as TeamRole] || "Member"}
        </span>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleResend}
                  disabled={isResending || isCancelling}
                >
                  {isResending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Resend invitation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleCancel}
                  disabled={isResending || isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <X className="size-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Cancel invitation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
