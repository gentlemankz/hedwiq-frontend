"use client";

import { useState, useCallback, useMemo } from "react";
import { Users, ChevronRight, Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TeamColorDot } from "@/components/teams/team-color-dot";
import type { TeamWithMemberCount, TeamWithSubteams } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

export interface SelectedTeam {
  teamId: string;
  teamName: string;
  memberCount: number;
  color: string | null;
}

interface TeamInviteeSelectorProps {
  /** Teams available for selection (hierarchy) */
  teams: TeamWithSubteams[];
  /** Currently selected teams */
  selectedTeams: SelectedTeam[];
  /** Callback when selection changes */
  onChange: (teams: SelectedTeam[]) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Whether teams are currently loading */
  loading?: boolean;
  /** Teams that are already invited to the meeting (read-only) */
  alreadyInvitedTeamIds?: Set<string>;
}

// ============================================================================
// Helper Components
// ============================================================================

interface TeamItemProps {
  team: TeamWithSubteams;
  isSelected: boolean;
  isAlreadyInvited: boolean;
  onToggle: (team: TeamWithMemberCount) => void;
  disabled: boolean;
  depth: number;
  selectedTeamIds: Set<string>;
  alreadyInvitedTeamIds: Set<string>;
}

function TeamItem({
  team,
  isSelected,
  isAlreadyInvited,
  onToggle,
  disabled,
  depth,
  selectedTeamIds,
  alreadyInvitedTeamIds,
}: TeamItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSubteams = team.subteams && team.subteams.length > 0;

  // Calculate how many subteams are selected
  const selectedSubteamsCount = useMemo(() => {
    if (!hasSubteams) return 0;
    return team.subteams.filter((sub) => selectedTeamIds.has(sub.id)).length;
  }, [hasSubteams, team.subteams, selectedTeamIds]);

  const handleToggle = useCallback(() => {
    if (!isAlreadyInvited && !disabled) {
      onToggle(team);
    }
  }, [isAlreadyInvited, disabled, onToggle, team]);

  return (
    <div className={cn("select-none", depth > 0 && "ml-6")}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
          !isAlreadyInvited && !disabled && "hover:bg-muted/50 cursor-pointer",
          isSelected && "bg-primary/10",
          isAlreadyInvited && "opacity-60"
        )}
        onClick={handleToggle}
      >
        {/* Expand button for teams with subteams */}
        {hasSubteams ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 rounded hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "size-4 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* Checkbox */}
        <Checkbox
          checked={isSelected || isAlreadyInvited}
          disabled={disabled || isAlreadyInvited}
          onCheckedChange={handleToggle}
          onClick={(e) => e.stopPropagation()}
          className={cn(isAlreadyInvited && "cursor-not-allowed")}
        />

        {/* Team color and name */}
        <TeamColorDot color={team.color} size="sm" />
        <span className="flex-1 text-sm font-medium truncate">{team.name}</span>

        {/* Member count */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3" />
              <span>{team.memberCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>
              {team.memberCount ?? 0} member{team.memberCount !== 1 ? "s" : ""}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Already invited indicator */}
        {isAlreadyInvited && (
          <Badge variant="secondary" className="text-xs">
            <Check className="size-3 mr-1" />
            Invited
          </Badge>
        )}

        {/* Subteams selected indicator */}
        {hasSubteams && selectedSubteamsCount > 0 && !isExpanded && (
          <Badge variant="outline" className="text-xs">
            +{selectedSubteamsCount} sub
          </Badge>
        )}
      </div>

      {/* Subteams */}
      {hasSubteams && isExpanded && (
        <div className="mt-1">
          {team.subteams.map((subteam) => (
            <TeamItem
              key={subteam.id}
              team={subteam}
              isSelected={selectedTeamIds.has(subteam.id)}
              isAlreadyInvited={alreadyInvitedTeamIds.has(subteam.id)}
              onToggle={onToggle}
              disabled={disabled}
              depth={depth + 1}
              selectedTeamIds={selectedTeamIds}
              alreadyInvitedTeamIds={alreadyInvitedTeamIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TeamInviteeSelector({
  teams,
  selectedTeams,
  onChange,
  disabled = false,
  loading = false,
  alreadyInvitedTeamIds = new Set(),
}: TeamInviteeSelectorProps) {
  // Track which teams are selected
  const selectedTeamIds = useMemo(
    () => new Set(selectedTeams.map((t) => t.teamId)),
    [selectedTeams]
  );

  // Handle team selection toggle
  const handleToggle = useCallback(
    (team: TeamWithMemberCount) => {
      const isCurrentlySelected = selectedTeamIds.has(team.id);

      if (isCurrentlySelected) {
        // Remove team
        onChange(selectedTeams.filter((t) => t.teamId !== team.id));
      } else {
        // Add team
        onChange([
          ...selectedTeams,
          {
            teamId: team.id,
            teamName: team.name,
            memberCount: team.memberCount,
            color: team.color,
          },
        ]);
      }
    },
    [selectedTeamIds, selectedTeams, onChange]
  );

  // Remove a selected team
  const handleRemove = useCallback(
    (teamId: string) => {
      onChange(selectedTeams.filter((t) => t.teamId !== teamId));
    },
    [selectedTeams, onChange]
  );

  // Calculate total members that will be invited
  const totalMembers = useMemo(() => {
    return selectedTeams.reduce((sum, team) => sum + team.memberCount, 0);
  }, [selectedTeams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        <span className="text-sm">Loading teams...</span>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Users className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No teams available</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a team to invite its members
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Selected teams summary */}
        {selectedTeams.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedTeams.length} team{selectedTeams.length !== 1 ? "s" : ""}{" "}
                selected
              </span>
              <span className="text-xs text-muted-foreground">
                ~{totalMembers} member{totalMembers !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTeams.map((team) => (
                <Badge
                  key={team.teamId}
                  variant="secondary"
                  className="gap-1.5 py-1 pr-1"
                >
                  <TeamColorDot color={team.color} size="xs" />
                  <span className="max-w-[150px] truncate">{team.teamName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({team.memberCount})
                  </span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(team.teamId)}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <span className="sr-only">Remove {team.teamName}</span>
                      <svg
                        className="size-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Team list */}
        <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-1">
          {teams.map((team) => (
            <TeamItem
              key={team.id}
              team={team}
              isSelected={selectedTeamIds.has(team.id)}
              isAlreadyInvited={alreadyInvitedTeamIds.has(team.id)}
              onToggle={handleToggle}
              disabled={disabled}
              depth={0}
              selectedTeamIds={selectedTeamIds}
              alreadyInvitedTeamIds={alreadyInvitedTeamIds}
            />
          ))}
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          All active members of selected teams will receive meeting invitations
        </p>
      </div>
    </TooltipProvider>
  );
}
