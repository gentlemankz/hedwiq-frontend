"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, AlertTriangle, Users, FolderTree, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeamColorDot } from "./team-color-dot";
import type { TeamWithSubteams } from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface DeleteTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamWithSubteams;
  deleteTeam: (teamId: string) => Promise<boolean>;
  onTeamDeleted?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function DeleteTeamDialog({
  open,
  onOpenChange,
  team,
  deleteTeam,
  onTeamDeleted,
}: DeleteTeamDialogProps) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when dialog opens
  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  // Calculate cascade impact
  const cascadeImpact = useMemo(() => {
    // Count total sub-teams and members recursively
    const countAll = (
      t: TeamWithSubteams
    ): { subteams: number; members: number } => {
      if (!t.subteams || t.subteams.length === 0) {
        return { subteams: 0, members: 0 };
      }
      return t.subteams.reduce(
        (acc, sub) => {
          const subCounts = countAll(sub);
          return {
            subteams: acc.subteams + 1 + subCounts.subteams,
            members: acc.members + sub.memberCount + subCounts.members,
          };
        },
        { subteams: 0, members: 0 }
      );
    };

    const { subteams, members } = countAll(team);
    const totalMembers = team.memberCount + members;

    return {
      subteamsCount: subteams,
      totalMembers,
      hasSubteams: subteams > 0,
    };
  }, [team]);

  const { subteamsCount, totalMembers, hasSubteams } = cascadeImpact;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const success = await deleteTeam(team.id);

      if (!mountedRef.current) return;

      if (success) {
        onTeamDeleted?.();
        onOpenChange(false);
      } else {
        setError("Failed to delete team. Please try again.");
      }
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to delete team:", err);
      setError(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      if (mountedRef.current) {
        setIsDeleting(false);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Delete Team
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Team being deleted */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <TeamColorDot color={team.color} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{team.name}</p>
              {team.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {team.description}
                </p>
              )}
            </div>
          </div>

          {/* Cascade impact details */}
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg space-y-2">
            <p className="text-sm font-medium text-destructive">
              The following will be permanently deleted:
            </p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4 text-destructive/60" />
                <span>
                  {totalMembers} member{totalMembers !== 1 ? "s" : ""} will lose access
                </span>
              </div>
              {hasSubteams && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderTree className="size-4 text-destructive/60" />
                  <span>
                    {subteamsCount} sub-team{subteamsCount !== 1 ? "s" : ""} will be deleted
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4 text-destructive/60" />
                <span>All pending invitations will be cancelled</span>
              </div>
            </div>
          </div>

          {/* Additional warning for sub-teams */}
          {hasSubteams && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> All sub-teams and their members will be deleted.
                If you only want to delete this team, first move or reassign the sub-teams.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
