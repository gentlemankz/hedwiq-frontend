"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useTeamContext } from "@/contexts/team-context";
import { useSession } from "@/lib/auth-client";
import {
  TeamColorDot,
  CreateTeamDialog,
  EditTeamDialog,
  DeleteTeamDialog,
  TeamMembersDialog,
  PendingTeamInvitations,
} from "@/components/teams";
import {
  Users,
  UsersRound,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { TeamWithSubteams } from "@/types/team";
import { canPerformAction } from "@/types/team";

// ============================================================================
// Main Page Component
// ============================================================================

function TeamsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const {
    teamHierarchy,
    teamsLoading,
    createTeam,
    updateTeam,
    deleteTeam,
    getUserRoleInTeam,
    refreshTeams,
  } = useTeamContext();

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(
    searchParams.get("newTeam") === "true"
  );
  const [createParentTeam, setCreateParentTeam] = useState<TeamWithSubteams | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamWithSubteams | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamWithSubteams | null>(null);
  const [managingMembersTeam, setManagingMembersTeam] = useState<TeamWithSubteams | null>(null);

  // External invitation acceptance state
  const [acceptingInvitation, setAcceptingInvitation] = useState(false);
  // Use state + ref combination to prevent race conditions in React Strict Mode
  const [tokenProcessed, setTokenProcessed] = useState<string | null>(null);
  const processingRef = useRef(false);

  // Handle external invitation token from URL
  useEffect(() => {
    const acceptToken = searchParams.get("accept_token");

    // Skip if no token, already processed this token, currently processing, or no session
    if (
      !acceptToken ||
      tokenProcessed === acceptToken ||
      processingRef.current ||
      !session?.user?.id
    ) {
      return;
    }

    // Mark as processing immediately to prevent race conditions
    processingRef.current = true;

    const acceptInvitation = async () => {
      setAcceptingInvitation(true);
      try {
        const response = await fetch("/api/teams/external-invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: acceptToken }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          toast.success("Welcome to the team!", {
            description: `You've successfully joined ${data.team?.name || "the team"}.`,
          });
          // Refresh teams to show the new team
          await refreshTeams();
        } else {
          toast.error("Invitation failed", {
            description: data.error || "Unable to accept the invitation.",
          });
        }
      } catch (error) {
        console.error("Failed to accept invitation:", error);
        toast.error("Error", {
          description: "Failed to accept the invitation. Please try again.",
        });
      } finally {
        setAcceptingInvitation(false);
        // Mark this token as processed (prevents re-processing on re-renders)
        setTokenProcessed(acceptToken);
        processingRef.current = false;
        // Clean up URL (always, even on error, to prevent retry loops)
        router.replace("/dashboard/teams", { scroll: false });
      }
    };

    void acceptInvitation();
  }, [searchParams, session?.user?.id, router, refreshTeams, tokenProcessed]);

  // Flatten hierarchy for grid view (only show root-level teams in the grid)
  const rootTeams = teamHierarchy;

  // Memoized team and member counts for performance
  const { totalTeamCount, totalMemberCount } = useMemo(() => {
    const countAllTeams = (teams: TeamWithSubteams[]): number => {
      return teams.reduce(
        (count, team) => count + 1 + countAllTeams(team.subteams || []),
        0
      );
    };

    const countAllMembers = (teams: TeamWithSubteams[]): number => {
      return teams.reduce(
        (count, team) =>
          count + team.memberCount + countAllMembers(team.subteams || []),
        0
      );
    };

    return {
      totalTeamCount: countAllTeams(teamHierarchy),
      totalMemberCount: countAllMembers(teamHierarchy),
    };
  }, [teamHierarchy]);

  const handleCreateNewTeam = () => {
    setCreateParentTeam(null);
    setCreateDialogOpen(true);
  };

  const handleCreateSubteam = (parent: TeamWithSubteams) => {
    setCreateParentTeam(parent);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateParentTeam(null);
      // Clean up URL params
      if (searchParams.get("newTeam")) {
        router.replace("/dashboard/teams", { scroll: false });
      }
    }
  };

  // Show loading overlay when accepting an invitation
  if (acceptingInvitation) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Accepting invitation...</p>
            <p className="text-sm text-muted-foreground">
              Please wait while we add you to the team.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
            <p className="text-muted-foreground">
              Manage your teams and collaborate with others
            </p>
          </div>
          <Button onClick={handleCreateNewTeam} className="gap-2">
            <Plus className="size-4" />
            New Team
          </Button>
        </div>

        {/* Pending Invitations */}
        <PendingTeamInvitations />

        {/* Stats Overview */}
        {!teamsLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Teams
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <UsersRound className="size-5 text-primary" />
                  <span className="text-2xl font-bold">{totalTeamCount}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Root Teams
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  <span className="text-2xl font-bold">{rootTeams.length}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <UserPlus className="size-5 text-primary" />
                  <span className="text-2xl font-bold">{totalMemberCount}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Teams Grid */}
        {teamsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : rootTeams.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <UsersRound className="size-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Create your first team to start collaborating with others and
                easily invite team members to meetings.
              </p>
              <Button onClick={handleCreateNewTeam} className="gap-2">
                <Plus className="size-4" />
                Create Your First Team
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rootTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                userId={userId}
                getUserRoleInTeam={getUserRoleInTeam}
                onEdit={setEditingTeam}
                onDelete={setDeletingTeam}
                onManageMembers={setManagingMembersTeam}
                onCreateSubteam={handleCreateSubteam}
                onClick={() => router.push(`/dashboard/teams/${team.id}`)}
              />
            ))}
          </div>
        )}

        {/* Create Team Dialog */}
        <CreateTeamDialog
          open={createDialogOpen}
          onOpenChange={handleDialogClose}
          parentTeam={createParentTeam}
          createTeam={createTeam}
          onTeamCreated={() => {
            handleDialogClose(false);
          }}
        />

        {/* Edit Team Dialog */}
        {editingTeam && (
          <EditTeamDialog
            open={!!editingTeam}
            onOpenChange={(open) => !open && setEditingTeam(null)}
            team={editingTeam}
            updateTeam={updateTeam}
            onTeamUpdated={() => setEditingTeam(null)}
          />
        )}

        {/* Delete Team Dialog */}
        {deletingTeam && (
          <DeleteTeamDialog
            open={!!deletingTeam}
            onOpenChange={(open) => !open && setDeletingTeam(null)}
            team={deletingTeam}
            deleteTeam={deleteTeam}
            onTeamDeleted={() => setDeletingTeam(null)}
          />
        )}

        {/* Team Members Dialog */}
        {managingMembersTeam && userId && (
          <TeamMembersDialog
            open={!!managingMembersTeam}
            onOpenChange={(open) => !open && setManagingMembersTeam(null)}
            team={managingMembersTeam}
            userId={userId}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Team Card Component
// ============================================================================

interface TeamCardProps {
  team: TeamWithSubteams;
  userId: string;
  getUserRoleInTeam: (teamId: string, userId: string) => string;
  onEdit: (team: TeamWithSubteams) => void;
  onDelete: (team: TeamWithSubteams) => void;
  onManageMembers: (team: TeamWithSubteams) => void;
  onCreateSubteam: (team: TeamWithSubteams) => void;
  onClick: () => void;
}

function TeamCard({
  team,
  userId,
  getUserRoleInTeam,
  onEdit,
  onDelete,
  onManageMembers,
  onCreateSubteam,
  onClick,
}: TeamCardProps) {
  const userRole = getUserRoleInTeam(team.id, userId) as "owner" | "admin" | "member";
  const canEdit = canPerformAction(userRole, "canEditTeam");
  const canDeleteTeam = canPerformAction(userRole, "canDeleteTeam");
  const canCreateSubteam = canPerformAction(userRole, "canCreateSubteam");
  const canManageMembers = canPerformAction(userRole, "canInviteMembers");

  const hasSubteams = team.subteams && team.subteams.length > 0;

  return (
    <Card
      className="group relative cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TeamColorDot color={team.color} size="md" />
          <span className="flex-1 truncate">{team.name}</span>
          {userRole === "owner" && (
            <span className="text-xs font-normal text-muted-foreground">
              Owner
            </span>
          )}
        </CardTitle>
        {team.description && (
          <CardDescription className="line-clamp-2">
            {team.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="size-4" />
            <span>
              {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
            </span>
          </div>
          {hasSubteams && (
            <div className="flex items-center gap-1">
              <ChevronRight className="size-4" />
              <span>
                {team.subteams.length} sub-team{team.subteams.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManageMembers && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onManageMembers(team);
              }}
            >
              <UserPlus className="mr-2 size-4" />
              Manage Members
            </DropdownMenuItem>
          )}
          {canCreateSubteam && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onCreateSubteam(team);
              }}
            >
              <Plus className="mr-2 size-4" />
              Add Sub-team
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(team);
              }}
            >
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
          )}
          {(canManageMembers || canCreateSubteam || canEdit) && canDeleteTeam && (
            <DropdownMenuSeparator />
          )}
          {canDeleteTeam && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(team);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function TeamsPageSkeleton() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-5 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Stats skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        {/* Teams grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Export with Suspense
// ============================================================================

export default function TeamsPage() {
  return (
    <Suspense fallback={<TeamsPageSkeleton />}>
      <TeamsContent />
    </Suspense>
  );
}
