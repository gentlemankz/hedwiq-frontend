"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
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

  // Count total sub-teams recursively
  const countSubteams = (t: TeamWithSubteams): number => {
    if (!t.subteams || t.subteams.length === 0) return 0;
    return t.subteams.reduce(
      (count, sub) => count + 1 + countSubteams(sub),
      0
    );
  };

  const subteamsCount = countSubteams(team);
  const hasSubteams = subteamsCount > 0;

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

        <div className="py-4">
          <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
            <TeamColorDot color={team.color} size="md" />
            <div>
              <p className="font-medium">{team.name}</p>
              <p className="text-sm text-muted-foreground">
                {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {hasSubteams && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> This team has {subteamsCount} sub-team
                {subteamsCount !== 1 ? "s" : ""} that will also be deleted.
              </p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Deleting this team will remove all team members and any pending invitations.
            Team meeting invitations will also be removed.
          </p>

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
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
