"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamContext } from "@/contexts/team-context";
import {
  TeamColorDot,
  CreateTeamDialog,
  EditTeamDialog,
  DeleteTeamDialog,
  InviteTeamMemberInput,
  TeamTemplatesSection,
  type TeamInviteEntry,
} from "@/components/teams";
import { getInitials } from "@/lib/utils";
import {
  Users,
  ArrowLeft,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Crown,
  Shield,
  User,
  X,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Home,
  Mail,
} from "lucide-react";
import {
  canPerformAction,
  canChangeRole,
  ROLE_LABELS,
  type Team,
  type TeamMemberWithUser,
  type TeamWithSubteams,
  type TeamRole,
  type ExternalTeamInvitation,
} from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamDetailViewProps {
  team: Team;
  members: TeamMemberWithUser[];
  userId: string;
  /** Ancestor teams for breadcrumb navigation (parent first) */
  ancestors?: Team[];
  /** User's effective role considering inheritance */
  effectiveRole?: TeamRole;
  /** Whether the effective role comes from inheritance (not direct membership) */
  isInheritedRole?: boolean;
  /** Current team depth in hierarchy (0 = root) */
  currentDepth?: number;
  /** Maximum allowed sub-team depth */
  maxDepth?: number;
  /** Whether more sub-teams can be created under this team */
  canCreateMoreSubteams?: boolean;
}

// ============================================================================
// Role Configuration
// ============================================================================

const roleIcons: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

// NOTE: Using shared ROLE_LABELS from types/team.ts

const roleBadgeVariants: Record<TeamRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

// ============================================================================
// Main Component
// ============================================================================

export function TeamDetailView({
  team,
  members: initialMembers,
  userId,
  ancestors = [],
  effectiveRole: serverEffectiveRole,
  isInheritedRole: serverIsInheritedRole = false,
  currentDepth = 0,
  maxDepth = 3,
  canCreateMoreSubteams = true,
}: TeamDetailViewProps) {
  const router = useRouter();
  const mountedRef = useRef(true);

  const {
    teamHierarchy,
    createTeam,
    updateTeam,
    deleteTeam,
    getUserRoleInTeam,
  } = useTeamContext();

  // Local state for members (allows updates without full page refresh)
  const [members, setMembers] = useState<TeamMemberWithUser[]>(initialMembers);
  const [membersLoading, setMembersLoading] = useState(false);

  // Dialog state
  const [createSubteamDialogOpen, setCreateSubteamDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Invite state
  const [pendingInvites, setPendingInvites] = useState<TeamInviteEntry[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // External invitations state (users without accounts)
  const [externalInvitations, setExternalInvitations] = useState<ExternalTeamInvitation[]>([]);
  const [_externalInvitationsLoading, setExternalInvitationsLoading] = useState(false);

  // Member operation error state
  const [memberError, setMemberError] = useState<string | null>(null);

  // Get team from hierarchy for subteams display - memoized for performance
  const teamWithSubteams = useMemo(() => {
    const findTeamInHierarchy = (
      teams: TeamWithSubteams[],
      id: string
    ): TeamWithSubteams | null => {
      for (const t of teams) {
        if (t.id === id) return t;
        const found = findTeamInHierarchy(t.subteams || [], id);
        if (found) return found;
      }
      return null;
    };
    return findTeamInHierarchy(teamHierarchy, team.id);
  }, [teamHierarchy, team.id]);

  const subteams = teamWithSubteams?.subteams || [];

  // Permission checks - use server-provided effective role if available
  const userRole = serverEffectiveRole ?? (getUserRoleInTeam(team.id, userId) as TeamRole);
  const canEdit = canPerformAction(userRole, "canEditTeam");
  // Only direct owner can delete (inherited admin cannot delete sub-teams they don't own)
  const canDeleteTeam = canPerformAction(userRole, "canDeleteTeam") && !serverIsInheritedRole;
  // Can create sub-team only if under depth limit
  const canCreateSubteam = canPerformAction(userRole, "canCreateSubteam") && canCreateMoreSubteams;
  const canInviteMembers = canPerformAction(userRole, "canInviteMembers");
  const canRemoveMembers = canPerformAction(userRole, "canRemoveMembers");
  const canChangeRoles = canPerformAction(userRole, "canChangeRoles");
  const canManageTemplates = canPerformAction(userRole, "canManageTemplates");

  // Active and pending members
  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");
  const existingMemberEmails = members.map((m) => m.user.email);

  // AbortController for fetch cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any ongoing fetch requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const refreshMembers = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMembersLoading(true);
    try {
      const response = await fetch(`/api/teams/${team.id}/members`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch members");
      const data = await response.json();
      if (mountedRef.current) {
        setMembers(data.members ?? []);
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to refresh members:", error);
    } finally {
      if (mountedRef.current) {
        setMembersLoading(false);
      }
    }
  }, [team.id]);

  // Fetch external invitations (users without accounts)
  const refreshExternalInvitations = useCallback(async () => {
    setExternalInvitationsLoading(true);
    try {
      const response = await fetch(`/api/teams/${team.id}/external-invites`);
      if (!response.ok) throw new Error("Failed to fetch external invitations");
      const data = await response.json();
      if (mountedRef.current) {
        setExternalInvitations(data.invitations ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch external invitations:", error);
    } finally {
      if (mountedRef.current) {
        setExternalInvitationsLoading(false);
      }
    }
  }, [team.id]);

  // Fetch external invitations on mount (if user has permission)
  useEffect(() => {
    if (canInviteMembers) {
      refreshExternalInvitations();
    }
  }, [canInviteMembers, refreshExternalInvitations]);

  // Handle invite submission - groups invites by role for batch processing
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

      setPendingInvites([]);
      await refreshMembers();
      await refreshExternalInvitations();
    } catch (error) {
      if (mountedRef.current) {
        setInviteError(
          error instanceof Error ? error.message : "Failed to send invitations"
        );
      }
    } finally {
      if (mountedRef.current) {
        setIsInviting(false);
      }
    }
  };

  // Handle role change
  const handleRoleChange = async (memberId: string, newRole: TeamRole) => {
    setMemberError(null);
    try {
      const response = await fetch(`/api/teams/${team.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update role");
      }

      // Update local state
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    } catch (error) {
      console.error("Failed to update role:", error);
      if (mountedRef.current) {
        setMemberError(
          error instanceof Error ? error.message : "Failed to update member role"
        );
      }
    }
  };

  // Handle member removal
  const handleRemoveMember = async (memberId: string) => {
    setMemberError(null);
    try {
      const response = await fetch(`/api/teams/${team.id}/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }

      // Update local state
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (error) {
      console.error("Failed to remove member:", error);
      if (mountedRef.current) {
        setMemberError(
          error instanceof Error ? error.message : "Failed to remove member"
        );
      }
    }
  };

  // Handle canceling external invitation
  const handleCancelExternalInvite = async (inviteId: string) => {
    setMemberError(null);
    try {
      const response = await fetch(`/api/teams/${team.id}/external-invites/${inviteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel invitation");
      }

      // Update local state
      setExternalInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
    } catch (error) {
      console.error("Failed to cancel external invitation:", error);
      if (mountedRef.current) {
        setMemberError(
          error instanceof Error ? error.message : "Failed to cancel invitation"
        );
      }
    }
  };

  // Total pending count (internal + external)
  const totalPendingCount = pendingMembers.length + externalInvitations.length;

  // Convert team to TeamWithSubteams for dialogs
  const teamAsSubteams: TeamWithSubteams = {
    ...team,
    memberCount: activeMembers.length,
    subteams: subteams,
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Breadcrumb Navigation */}
        {ancestors.length > 0 && (
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard/teams")}
              className="h-6 px-2 gap-1"
            >
              <Home className="size-3" />
              Teams
            </Button>
            {/* Reverse ancestors to show root first, then down to parent */}
            {[...ancestors].reverse().map((ancestor) => (
              <span key={ancestor.id} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/dashboard/teams/${ancestor.id}`)}
                  className="h-6 px-2 gap-1"
                >
                  <TeamColorDot color={ancestor.color} size="xs" />
                  {ancestor.name}
                </Button>
              </span>
            ))}
            <ChevronRight className="size-3" />
            <span className="flex items-center gap-1 font-medium text-foreground">
              <TeamColorDot color={team.color} size="xs" />
              {team.name}
            </span>
          </nav>
        )}

        {/* Depth Warning */}
        {!canCreateMoreSubteams && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Maximum hierarchy depth reached ({maxDepth} levels). No more sub-teams can be created under this team.
            </span>
          </div>
        )}

        {/* Back Button & Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/teams")}
              className="mt-1"
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <TeamColorDot color={team.color} size="md" />
                <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
                <Badge variant={roleBadgeVariants[userRole]}>
                  {ROLE_LABELS[userRole]}
                </Badge>
                {serverIsInheritedRole && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                          Inherited
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Role inherited from parent team ownership</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {team.description && (
                <p className="text-muted-foreground mt-1 ml-10">
                  {team.description}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          {(canEdit || canDeleteTeam || canCreateSubteam) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canCreateSubteam && (
                  <DropdownMenuItem onClick={() => setCreateSubteamDialogOpen(true)}>
                    <Plus className="mr-2 size-4" />
                    Add Sub-team
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                    <Pencil className="mr-2 size-4" />
                    Edit Team
                  </DropdownMenuItem>
                )}
                {(canCreateSubteam || canEdit) && canDeleteTeam && (
                  <DropdownMenuSeparator />
                )}
                {canDeleteTeam && (
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete Team
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <span className="text-2xl font-bold">{activeMembers.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Invites
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <User className="size-5 text-primary" />
                <span className="text-2xl font-bold">{totalPendingCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sub-teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ChevronRight className="size-5 text-primary" />
                <span className="text-2xl font-bold">{subteams.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hierarchy Depth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${currentDepth >= maxDepth ? "text-amber-600" : ""}`}>
                  {currentDepth}
                </span>
                <span className="text-sm text-muted-foreground">/ {maxDepth}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invite Members */}
        {canInviteMembers && (
          <Card>
            <CardHeader>
              <CardTitle>Invite Members</CardTitle>
              <CardDescription>
                Invite new people to join this team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                      Sending Invitations...
                    </>
                  ) : (
                    `Send ${pendingInvites.length} Invitation${pendingInvites.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
              {totalPendingCount > 0 &&
                `, ${totalPendingCount} pending`}
            </CardDescription>
            {memberError && (
              <p className="text-sm text-destructive mt-2">{memberError}</p>
            )}
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {/* Active Members */}
                  {activeMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      currentUserRole={userRole}
                      currentUserId={userId}
                      canChangeRoles={canChangeRoles}
                      canRemove={canRemoveMembers}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemoveMember}
                    />
                  ))}

                  {/* Pending Members (internal - users with accounts) */}
                  {pendingMembers.length > 0 && (
                    <>
                      <div className="pt-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Pending Invitations
                      </div>
                      {pendingMembers.map((member) => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          currentUserRole={userRole}
                          currentUserId={userId}
                          canChangeRoles={canChangeRoles}
                          canRemove={canRemoveMembers}
                          onRoleChange={handleRoleChange}
                          onRemove={handleRemoveMember}
                          isPending
                        />
                      ))}
                    </>
                  )}

                  {/* External Invitations (users without accounts yet) */}
                  {externalInvitations.length > 0 && (
                    <>
                      <div className="pt-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        External Invitations (Awaiting Sign-up)
                      </div>
                      {externalInvitations.map((invitation) => (
                        <div
                          key={invitation.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border"
                        >
                          <div className="flex items-center justify-center size-10 rounded-full bg-muted">
                            <Mail className="size-5 text-muted-foreground" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{invitation.email}</span>
                              <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                                External
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Awaiting sign-up • {ROLE_LABELS[invitation.role]}
                            </p>
                          </div>

                          {/* Cancel Button */}
                          {canRemoveMembers && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleCancelExternalInvite(invitation.id)}
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {members.length === 0 && externalInvitations.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No members found
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Parent Team */}
        {ancestors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeft className="size-5" />
                Parent Team
              </CardTitle>
              <CardDescription>
                This team is a sub-team of the following team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Card
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => router.push(`/dashboard/teams/${ancestors[0].id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TeamColorDot color={ancestors[0].color} />
                    <span className="truncate">{ancestors[0].name}</span>
                  </CardTitle>
                </CardHeader>
                {ancestors[0].description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground truncate">
                      {ancestors[0].description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </CardContent>
          </Card>
        )}

        {/* Sub-teams */}
        {subteams.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className="size-5" />
                Sub-teams
              </CardTitle>
              <CardDescription>
                {subteams.length} sub-team{subteams.length !== 1 ? "s" : ""} under
                this team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {subteams.map((subteam) => (
                  <Card
                    key={subteam.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => router.push(`/dashboard/teams/${subteam.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <TeamColorDot color={subteam.color} />
                        <span className="truncate">{subteam.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="size-4" />
                        <span>
                          {subteam.memberCount} member
                          {subteam.memberCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Templates */}
        <TeamTemplatesSection
          team={team}
          canManageTemplates={canManageTemplates}
        />

        {/* Dialogs */}
        <CreateTeamDialog
          open={createSubteamDialogOpen}
          onOpenChange={setCreateSubteamDialogOpen}
          parentTeam={teamAsSubteams}
          createTeam={createTeam}
          onTeamCreated={() => setCreateSubteamDialogOpen(false)}
          parentDepth={currentDepth}
        />

        <EditTeamDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          team={teamAsSubteams}
          updateTeam={updateTeam}
          onTeamUpdated={() => setEditDialogOpen(false)}
        />

        <DeleteTeamDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          team={teamAsSubteams}
          deleteTeam={async (id) => {
            const success = await deleteTeam(id);
            if (success) {
              router.push("/dashboard/teams");
            }
            return success;
          }}
          onTeamDeleted={() => {
            setDeleteDialogOpen(false);
            router.push("/dashboard/teams");
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Member Row Component
// ============================================================================

interface MemberRowProps {
  member: TeamMemberWithUser;
  currentUserRole: TeamRole;
  currentUserId: string;
  canChangeRoles: boolean;
  canRemove: boolean;
  onRoleChange: (memberId: string, newRole: TeamRole) => void;
  onRemove: (memberId: string) => void;
  isPending?: boolean;
}

function MemberRow({
  member,
  currentUserRole,
  currentUserId,
  canChangeRoles,
  canRemove,
  onRoleChange,
  onRemove,
  isPending,
}: MemberRowProps) {
  const RoleIcon = roleIcons[member.role];
  const isCurrentUser = member.userId === currentUserId;
  const canChangeThisRole =
    canChangeRoles &&
    canChangeRole(currentUserRole, member.role, member.role) &&
    !isCurrentUser &&
    member.role !== "owner";
  const canRemoveThis = canRemove && !isCurrentUser && member.role !== "owner";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border">
      <Avatar className="size-10">
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
        <p className="text-sm text-muted-foreground truncate">
          {member.user.email}
        </p>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <RoleIcon className="size-4" />
              <span className="text-sm">{ROLE_LABELS[member.role]}</span>
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

      {/* Role Selector */}
      {canChangeThisRole && (
        <Select
          value={member.role}
          onValueChange={(v) => onRoleChange(member.id, v as TeamRole)}
        >
          <SelectTrigger className="w-[100px] h-8">
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
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(member.id)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
