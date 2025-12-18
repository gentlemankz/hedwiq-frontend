"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Pencil } from "lucide-react";
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
  type UpdateTeamRequest,
} from "@/types/team";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLOR = TEAM_COLORS[7].value; // Indigo

/** Get effective color with fallback to default */
const getEffectiveColor = (teamColor: string | null): string =>
  teamColor || DEFAULT_COLOR;

// ============================================================================
// Types
// ============================================================================

interface EditTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamWithSubteams;
  updateTeam: (teamId: string, updates: UpdateTeamRequest) => Promise<Team | null>;
  onTeamUpdated?: (team: Team) => void;
}

// ============================================================================
// Component
// ============================================================================

export function EditTeamDialog({
  open,
  onOpenChange,
  team,
  updateTeam,
  onTeamUpdated,
}: EditTeamDialogProps) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [color, setColor] = useState<string>(() => getEffectiveColor(team.color));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when team changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(team.name);
      setDescription(team.description || "");
      setColor(getEffectiveColor(team.color));
      setError(null);
    }
  }, [open, team]);

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

    // Check if anything changed
    const originalColor = getEffectiveColor(team.color);
    const nameChanged = trimmedName !== team.name;
    const descriptionChanged = description.trim() !== (team.description || "");
    const colorChanged = color !== originalColor;

    if (!nameChanged && !descriptionChanged && !colorChanged) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updates: UpdateTeamRequest = {};
      if (nameChanged) updates.name = trimmedName;
      if (descriptionChanged) updates.description = description.trim() || null;
      if (colorChanged) updates.color = color;

      const updatedTeam = await updateTeam(team.id, updates);

      if (!mountedRef.current) return;

      if (updatedTeam) {
        onTeamUpdated?.(updatedTeam);
        onOpenChange(false);
      } else {
        setError("Failed to update team. Please try again.");
      }
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to update team:", err);
      setError(err instanceof Error ? err.message : "Failed to update team");
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
            <Pencil className="size-5" />
            Edit Team
          </DialogTitle>
          <DialogDescription>
            Update the team details.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Team Name */}
          <div className="grid gap-2">
            <Label htmlFor="edit-team-name">Team Name</Label>
            <Input
              id="edit-team-name"
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
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Team Description */}
          <div className="grid gap-2">
            <Label htmlFor="edit-team-description">Description (optional)</Label>
            <Textarea
              id="edit-team-description"
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
            <Label htmlFor="edit-team-color">Color</Label>
            <Select value={color} onValueChange={setColor} disabled={isSubmitting}>
              <SelectTrigger id="edit-team-color">
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
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
