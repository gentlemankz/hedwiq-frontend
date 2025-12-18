"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Users,
  X,
  Crown,
  Shield,
  User,
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
import { getInitials } from "@/lib/utils";
import type {
  TeamWithSubteams,
  TeamMemberWithUser,
  TeamRole,
} from "@/types/team";
import { canChangeRole, canPerformAction } from "@/types/team";

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

const roleLabels: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

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

  // Fetch members when dialog opens
  useEffect(() => {
    if (open) {
      fetchMembers();
      setPendingInvites([]);
      setInviteError(null);
    }
  }, [open, fetchMembers]);

  // Handle bulk invite submission
  const handleInviteSubmit = async () => {
    if (pendingInvites.length === 0) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      // Group invites by role for batch processing
      const invitesByRole = pendingInvites.reduce((acc, inv) => {
        if (!acc[inv.role]) acc[inv.role] = [];
        acc[inv.role].push(inv.email);
        return acc;
      }, {} as Record<TeamRole, string[]>);

      let totalFailed: Array<{ identifier: string; reason: string }> = [];

      // Send invites for each role group
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

  // Separate active and pending members
  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

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

                  {/* Pending Members */}
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
}

function MemberRow({
  member,
  currentUserRole,
  currentUserId,
  canRemove,
  onRoleChange,
  onRemove,
  isPending,
}: MemberRowProps) {
  const RoleIcon = roleIcons[member.role];
  const isCurrentUser = member.userId === currentUserId;
  const canChangeThisRole = canChangeRole(
    currentUserRole,
    member.role,
    member.role
  );
  const canRemoveThis = canRemove && !isCurrentUser && member.role !== "owner";

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
                {roleLabels[member.role]}
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
    </div>
  );
}
