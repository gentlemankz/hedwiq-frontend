"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AgentWithCounts } from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

interface DeleteAgentDialogProps {
  /** The agent to delete, or null if dialog should be closed */
  agent: AgentWithCounts | null;
  /** Whether deletion is in progress */
  isDeleting: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback to confirm deletion */
  onConfirm: () => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Reusable confirmation dialog for deleting an agent.
 * Used by both the sidebar and any other agent list views.
 */
export function DeleteAgentDialog({
  agent,
  isDeleting,
  onClose,
  onConfirm,
}: DeleteAgentDialogProps) {
  return (
    <AlertDialog
      open={!!agent}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Agent</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{agent?.name}&quot;?
            This will also delete all schedules, triggers, and execution
            history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
