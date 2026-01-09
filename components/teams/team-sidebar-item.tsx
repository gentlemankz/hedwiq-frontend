"use client";

import { memo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Plus,
} from "lucide-react";
import {
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamColorDot } from "./team-color-dot";
import type { TeamWithSubteams, TeamRole } from "@/types/team";
import { canPerformAction } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamSidebarItemProps {
  /** Team data with sub-teams */
  team: TeamWithSubteams;
  /** Current user's role in this team */
  userRole: TeamRole;
  /** Whether this team's sub-teams are expanded */
  isExpanded: boolean;
  /** Toggle expansion callback */
  onToggleExpand: (teamId: string) => void;
  /** Callback to open edit dialog */
  onEdit: (team: TeamWithSubteams) => void;
  /** Callback to open delete dialog */
  onDelete: (team: TeamWithSubteams) => void;
  /** Callback to open manage members dialog */
  onManageMembers: (team: TeamWithSubteams) => void;
  /** Callback to create sub-team */
  onCreateSubteam: (parentTeam: TeamWithSubteams) => void;
  /** Nesting depth for indentation */
  depth?: number;
  /** Set of expanded team IDs (for recursive rendering) */
  expandedTeams: Set<string>;
  /** Function to get user's role in a team */
  getUserRoleInTeam: (teamId: string, userId: string) => TeamRole;
  /** Current user's ID */
  userId: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Memoized team sidebar item for performance with large team hierarchies.
 * Only re-renders when team data, expansion state, or user role changes.
 */
export const TeamSidebarItem = memo(function TeamSidebarItem({
  team,
  userRole,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onManageMembers,
  onCreateSubteam,
  expandedTeams,
  depth = 0,
  getUserRoleInTeam,
  userId,
}: TeamSidebarItemProps) {
  const pathname = usePathname();
  const hasSubteams = team.subteams && team.subteams.length > 0;

  // Determine permissions
  const canEdit = canPerformAction(userRole, "canEditTeam");
  const canDeleteTeam = canPerformAction(userRole, "canDeleteTeam");
  const canCreateSubteam = canPerformAction(userRole, "canCreateSubteam");
  const canInviteMembers = canPerformAction(userRole, "canInviteMembers");

  // Check if this team's page is active
  const isActive = pathname === `/dashboard/teams/${team.id}`;

  if (hasSubteams) {
    // Render as collapsible with sub-teams
    return (
      <SidebarMenuSubItem className="group/team relative">
        <Collapsible
          open={isExpanded}
          onOpenChange={() => onToggleExpand(team.id)}
          className="group/team-collapsible"
        >
          <div className="flex items-center w-full">
            <CollapsibleTrigger asChild>
              <SidebarMenuSubButton
                className="flex-1 justify-start pr-8"
                isActive={isActive}
              >
                <ChevronRight
                  className={`size-3 shrink-0 transition-transform duration-200 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <TeamColorDot color={team.color} size="xs" />
                <span className="flex-1 truncate">{team.name}</span>
                <span className="text-xs text-muted-foreground">
                  {team.memberCount}
                </span>
              </SidebarMenuSubButton>
            </CollapsibleTrigger>

            {/* Context Menu */}
            <TeamContextMenu
              team={team}
              canEdit={canEdit}
              canDelete={canDeleteTeam}
              canCreateSubteam={canCreateSubteam}
              canInviteMembers={canInviteMembers}
              onEdit={onEdit}
              onDelete={onDelete}
              onManageMembers={onManageMembers}
              onCreateSubteam={onCreateSubteam}
            />
          </div>

          {/* Sub-teams */}
          <CollapsibleContent>
            <SidebarMenuSub className="ml-3 border-l border-sidebar-border pl-2">
              {team.subteams.map((subteam) => (
                <TeamSidebarItem
                  key={subteam.id}
                  team={subteam}
                  userRole={getUserRoleInTeam(subteam.id, userId)}
                  isExpanded={expandedTeams.has(subteam.id)}
                  onToggleExpand={onToggleExpand}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onManageMembers={onManageMembers}
                  onCreateSubteam={onCreateSubteam}
                  expandedTeams={expandedTeams}
                  depth={depth + 1}
                  getUserRoleInTeam={getUserRoleInTeam}
                  userId={userId}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuSubItem>
    );
  }

  // Render as simple item (no sub-teams)
  return (
    <SidebarMenuSubItem className="group/team relative">
      <SidebarMenuSubButton asChild isActive={isActive} className="pr-8">
        <Link href={`/dashboard/teams/${team.id}`}>
          <TeamColorDot color={team.color} size="xs" />
          <span className="flex-1 truncate">{team.name}</span>
          <span className="text-xs text-muted-foreground">
            {team.memberCount}
          </span>
        </Link>
      </SidebarMenuSubButton>

      {/* Context Menu */}
      <TeamContextMenu
        team={team}
        canEdit={canEdit}
        canDelete={canDeleteTeam}
        canCreateSubteam={canCreateSubteam}
        canInviteMembers={canInviteMembers}
        onEdit={onEdit}
        onDelete={onDelete}
        onManageMembers={onManageMembers}
        onCreateSubteam={onCreateSubteam}
      />
    </SidebarMenuSubItem>
  );
});

// Display name for debugging
TeamSidebarItem.displayName = "TeamSidebarItem";

// ============================================================================
// Context Menu Component
// ============================================================================

interface TeamContextMenuProps {
  team: TeamWithSubteams;
  canEdit: boolean;
  canDelete: boolean;
  canCreateSubteam: boolean;
  canInviteMembers: boolean;
  onEdit: (team: TeamWithSubteams) => void;
  onDelete: (team: TeamWithSubteams) => void;
  onManageMembers: (team: TeamWithSubteams) => void;
  onCreateSubteam: (team: TeamWithSubteams) => void;
}

const TeamContextMenu = memo(function TeamContextMenu({
  team,
  canEdit,
  canDelete,
  canCreateSubteam,
  canInviteMembers,
  onEdit,
  onDelete,
  onManageMembers,
  onCreateSubteam,
}: TeamContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/team:opacity-100 hover:bg-sidebar-accent transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right">
        {canInviteMembers && (
          <DropdownMenuItem onClick={() => onManageMembers(team)}>
            <Users className="mr-2 size-4" />
            Manage Members
          </DropdownMenuItem>
        )}
        {canCreateSubteam && (
          <DropdownMenuItem onClick={() => onCreateSubteam(team)}>
            <Plus className="mr-2 size-4" />
            Add Sub-team
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={() => onEdit(team)}>
            <Pencil className="mr-2 size-4" />
            Edit
          </DropdownMenuItem>
        )}
        {(canInviteMembers || canCreateSubteam || canEdit) && canDelete && (
          <DropdownMenuSeparator />
        )}
        {canDelete && (
          <DropdownMenuItem
            onClick={() => onDelete(team)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

TeamContextMenu.displayName = "TeamContextMenu";
