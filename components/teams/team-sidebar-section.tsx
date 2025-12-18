"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Users,
  UsersRound,
  ChevronRight,
  Plus,
  Loader2,
} from "lucide-react";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { useTeamContext } from "@/contexts/team-context";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TeamSidebarItem } from "./team-sidebar-item";
import { CreateTeamDialog } from "./create-team-dialog";
import { EditTeamDialog } from "./edit-team-dialog";
import { DeleteTeamDialog } from "./delete-team-dialog";
import { TeamMembersDialog } from "./team-members-dialog";
import type { TeamWithSubteams } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamSidebarSectionProps {
  /** Current user's ID for determining roles */
  userId: string;
}

// ============================================================================
// Component
// ============================================================================

export function TeamSidebarSection({ userId }: TeamSidebarSectionProps) {
  const pathname = usePathname();
  const { expandedSections, toggleSection } = useSidebarContext();
  const {
    teamHierarchy,
    teamsLoading,
    expandedTeams,
    toggleTeamExpanded,
    updateTeam,
    deleteTeam,
    createTeam,
    getUserRoleInTeam,
  } = useTeamContext();

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentTeam, setCreateParentTeam] = useState<TeamWithSubteams | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamWithSubteams | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamWithSubteams | null>(null);
  const [managingMembersTeam, setManagingMembersTeam] = useState<TeamWithSubteams | null>(null);

  const isTeamsExpanded = expandedSections.has("teams");
  const isTeamsActive = pathname.startsWith("/dashboard/teams");

  // Handlers
  const handleEdit = (team: TeamWithSubteams) => {
    setEditingTeam(team);
  };

  const handleDelete = (team: TeamWithSubteams) => {
    setDeletingTeam(team);
  };

  const handleManageMembers = (team: TeamWithSubteams) => {
    setManagingMembersTeam(team);
  };

  const handleCreateSubteam = (parentTeam: TeamWithSubteams) => {
    setCreateParentTeam(parentTeam);
    setCreateDialogOpen(true);
  };

  const handleCreateNewTeam = () => {
    setCreateParentTeam(null);
    setCreateDialogOpen(true);
  };

  return (
    <>
      <Collapsible
        open={isTeamsExpanded}
        onOpenChange={() => toggleSection("teams")}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={isTeamsActive}
              tooltip="Teams"
            >
              {isTeamsExpanded ? <UsersRound /> : <Users />}
              <span>Teams</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {/* Loading State */}
              {teamsLoading ? (
                <SidebarMenuSubItem>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    <span>Loading teams...</span>
                  </div>
                </SidebarMenuSubItem>
              ) : (
                <>
                  {/* Team Hierarchy */}
                  {teamHierarchy.length === 0 ? (
                    <SidebarMenuSubItem>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No teams yet
                      </div>
                    </SidebarMenuSubItem>
                  ) : (
                    teamHierarchy.map((team) => (
                      <TeamSidebarItem
                        key={team.id}
                        team={team}
                        userRole={getUserRoleInTeam(team.id, userId)}
                        isExpanded={expandedTeams.has(team.id)}
                        onToggleExpand={toggleTeamExpanded}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onManageMembers={handleManageMembers}
                        onCreateSubteam={handleCreateSubteam}
                        expandedTeams={expandedTeams}
                        getUserRoleInTeam={getUserRoleInTeam}
                        userId={userId}
                      />
                    ))
                  )}

                  {/* New Team Button */}
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      onClick={handleCreateNewTeam}
                      className="cursor-pointer"
                    >
                      <Plus className="size-3" />
                      <span>New Team</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </>
              )}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>

      {/* Create Team Dialog */}
      <CreateTeamDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentTeam={createParentTeam}
        createTeam={createTeam}
        onTeamCreated={() => {
          setCreateDialogOpen(false);
          setCreateParentTeam(null);
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
      {managingMembersTeam && (
        <TeamMembersDialog
          open={!!managingMembersTeam}
          onOpenChange={(open) => !open && setManagingMembersTeam(null)}
          team={managingMembersTeam}
          userId={userId}
        />
      )}
    </>
  );
}
