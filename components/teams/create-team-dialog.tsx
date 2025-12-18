"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Users, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { TeamColorDot } from "./team-color-dot";
import {
  TEAM_COLORS,
  TEAM_LIMITS,
  type Team,
  type TeamWithSubteams,
  type CreateTeamRequest,
} from "@/types/team";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLOR = TEAM_COLORS[7].value; // Indigo

// ============================================================================
// Types
// ============================================================================

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTeam: TeamWithSubteams | null;
  createTeam: (params: CreateTeamRequest) => Promise<Team | null>;
  onTeamCreated?: (team: Team) => void;
  /** Current depth of the parent team (for depth warning) */
  parentDepth?: number;
}

// ============================================================================
// Component
// ============================================================================

export function CreateTeamDialog({
  open,
  onOpenChange,
  parentTeam,
  createTeam,
  onTeamCreated,
  parentDepth,
}: CreateTeamDialogProps) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate if the new team will be at max depth (and won't be able to have sub-teams)
  const newTeamDepth = parentTeam ? (parentDepth ?? 0) + 1 : 0;
  const willBeAtMaxDepth = newTeamDepth >= TEAM_LIMITS.MAX_SUB_TEAM_DEPTH;
  const isNearMaxDepth = newTeamDepth === TEAM_LIMITS.MAX_SUB_TEAM_DEPTH - 1;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setColor(DEFAULT_COLOR);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Team name is required");
      return;
    }

    if (trimmedName.length < TEAM_LIMITS.MIN_NAME_LENGTH) {
      setError(`Team name must be at least ${TEAM_LIMITS.MIN_NAME_LENGTH} characters`);
      return;
    }

    if (trimmedName.length > TEAM_LIMITS.MAX_NAME_LENGTH) {
      setError(`Team name must be ${TEAM_LIMITS.MAX_NAME_LENGTH} characters or less`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTeam = await createTeam({
        name: trimmedName,
        description: description.trim() || undefined,
        color,
        parentTeamId: parentTeam?.id,
      });

      if (!mountedRef.current) return;

      if (newTeam) {
        onTeamCreated?.(newTeam);
        onOpenChange(false);
      } else {
        setError("Failed to create team. Please try again.");
      }
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to create team:", err);
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            {parentTeam ? "Create Sub-team" : "Create Team"}
          </DialogTitle>
          <DialogDescription>
            {parentTeam
              ? `Create a new sub-team under "${parentTeam.name}".`
              : "Create a new team to collaborate with others."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Depth Warning */}
          {parentTeam && willBeAtMaxDepth && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                This sub-team will be at the maximum hierarchy depth ({TEAM_LIMITS.MAX_SUB_TEAM_DEPTH} levels).
                You won&apos;t be able to create further sub-teams under it.
              </span>
            </div>
          )}

          {/* Near Max Depth Info */}
          {parentTeam && isNearMaxDepth && !willBeAtMaxDepth && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm">
              <Info className="size-4 shrink-0" />
              <span>
                This sub-team will be at depth {newTeamDepth} of {TEAM_LIMITS.MAX_SUB_TEAM_DEPTH}.
                One more level of sub-teams will be allowed.
              </span>
            </div>
          )}

          {/* Team Name */}
          <div className="grid gap-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              placeholder="e.g., Marketing Team"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              maxLength={TEAM_LIMITS.MAX_NAME_LENGTH}
              disabled={isSubmitting}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Team Description */}
          <div className="grid gap-2">
            <Label htmlFor="team-description">Description (optional)</Label>
            <Textarea
              id="team-description"
              placeholder="What is this team for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={TEAM_LIMITS.MAX_DESCRIPTION_LENGTH}
              disabled={isSubmitting}
              rows={2}
            />
          </div>

          {/* Team Color */}
          <div className="grid gap-2">
            <Label htmlFor="team-color">Color</Label>
            <Select value={color} onValueChange={setColor} disabled={isSubmitting}>
              <SelectTrigger id="team-color">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <TeamColorDot color={color} />
                    {TEAM_COLORS.find((c) => c.value === color)?.name || "Select color"}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TEAM_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <TeamColorDot color={c.value} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
