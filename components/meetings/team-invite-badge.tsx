"use client";

import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TeamColorDot } from "@/components/teams/team-color-dot";
import { cn } from "@/lib/utils";
import type { TeamMeetingInviteWithTeam } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamInviteBadgeProps {
  /** Team invitation with team details */
  invite: TeamMeetingInviteWithTeam;
  /** Whether to show compact view */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

interface TeamInvitesSummaryProps {
  /** List of team invitations */
  invites: TeamMeetingInviteWithTeam[];
  /** Maximum badges to show before collapsing */
  maxVisible?: number;
  /** Whether to show compact view */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Team Invite Badge Component
// ============================================================================

export function TeamInviteBadge({
  invite,
  compact = false,
  className,
}: TeamInviteBadgeProps) {
  const { team } = invite;
  const memberCount = team.memberCount ?? 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              "gap-1.5 cursor-default",
              compact && "px-1.5 py-0.5",
              className
            )}
          >
            <TeamColorDot color={team.color} size={compact ? "xs" : "sm"} />
            <span className={cn("max-w-[100px] truncate", compact && "text-xs")}>
              {team.name}
            </span>
            {!compact && (
              <span className="text-xs text-muted-foreground">
                ({memberCount})
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-sm">
            <p className="font-medium">{team.name}</p>
            <p className="text-muted-foreground">
              {memberCount} member{memberCount !== 1 ? "s" : ""} invited
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Team Invites Summary Component
// ============================================================================

export function TeamInvitesSummary({
  invites,
  maxVisible = 3,
  compact = false,
  className,
}: TeamInvitesSummaryProps) {
  if (invites.length === 0) {
    return null;
  }

  const visibleInvites = invites.slice(0, maxVisible);
  const hiddenCount = invites.length - maxVisible;
  const totalMembers = invites.reduce(
    (sum, inv) => sum + (inv.team.memberCount ?? 0),
    0
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <UsersRound className="size-4" />
        <span>
          {invites.length} team{invites.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {visibleInvites.map((invite) => (
          <TeamInviteBadge
            key={invite.id}
            invite={invite}
            compact={compact}
          />
        ))}
        {hiddenCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn("cursor-default", compact && "text-xs px-1.5 py-0.5")}
                >
                  +{hiddenCount} more
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-1">
                  {invites.slice(maxVisible).map((invite) => (
                    <div key={invite.id} className="flex items-center gap-1.5 text-sm">
                      <TeamColorDot color={invite.team.color} size="xs" />
                      <span>{invite.team.name}</span>
                      <span className="text-muted-foreground">
                        ({invite.team.memberCount ?? 0})
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        (~{totalMembers} members)
      </span>
    </div>
  );
}
