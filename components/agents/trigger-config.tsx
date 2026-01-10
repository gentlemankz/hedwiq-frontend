"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Loader2,
  FolderIcon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TRIGGER_TYPE_LABELS,
  TRIGGER_TYPE_DESCRIPTIONS,
  AGENT_LIMITS,
  type AgentTriggerType,
  type AgentTriggerWithScope,
  type CreateAgentTriggerRequest,
} from "@/types/agent";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface TriggerConfigProps {
  agentId: string;
  triggers: AgentTriggerWithScope[];
  isLoading?: boolean;
  onCreateTrigger: (data: CreateAgentTriggerRequest) => Promise<void>;
  onUpdateTrigger: (triggerId: string, updates: Partial<AgentTriggerWithScope>) => Promise<void>;
  onDeleteTrigger: (triggerId: string) => Promise<void>;
}

interface FolderOption {
  id: string;
  name: string;
  color: string | null;
}

interface TeamOption {
  id: string;
  name: string;
}

// ============================================================================
// Trigger Form Component
// ============================================================================

interface TriggerFormProps {
  onSubmit: (data: CreateAgentTriggerRequest) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

function TriggerForm({ onSubmit, onClose, isSubmitting }: TriggerFormProps) {
  const [triggerType, setTriggerType] = useState<AgentTriggerType>("meeting_end");
  const [scopeFolderId, setScopeFolderId] = useState<string>("");
  const [scopeTeamId, setScopeTeamId] = useState<string>("");
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Fetch folders for scope selection with AbortController cleanup
  useEffect(() => {
    const controller = new AbortController();

    const fetchFolders = async () => {
      setLoadingFolders(true);
      try {
        const response = await fetch("/api/folders", { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setFolders(data.folders || []);
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Failed to fetch folders:", error);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingFolders(false);
        }
      }
    };
    fetchFolders();

    return () => controller.abort();
  }, []);

  // Fetch teams for scope selection with AbortController cleanup
  useEffect(() => {
    const controller = new AbortController();

    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        const response = await fetch("/api/teams", { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setTeams(data.teams || []);
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Failed to fetch teams:", error);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTeams(false);
        }
      }
    };
    fetchTeams();

    return () => controller.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateAgentTriggerRequest = {
      triggerType,
    };

    if (scopeFolderId) {
      data.scopeFolderId = scopeFolderId;
    }

    if (scopeTeamId) {
      data.scopeTeamId = scopeTeamId;
    }

    await onSubmit(data);
  };

  // Check if folder is required
  const isFolderRequired = triggerType === "new_meeting_in_folder";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Trigger Type */}
      <div className="space-y-2">
        <Label>Trigger Type</Label>
        <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AgentTriggerType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TRIGGER_TYPE_LABELS) as AgentTriggerType[]).map((type) => (
              <SelectItem key={type} value={type}>
                <div className="flex flex-col items-start">
                  <span>{TRIGGER_TYPE_LABELS[type]}</span>
                  <span className="text-xs text-muted-foreground">
                    {TRIGGER_TYPE_DESCRIPTIONS[type]}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scope - Folder */}
      {triggerType !== "manual" && (
        <div className="space-y-2">
          <Label>
            Scope to Folder
            {isFolderRequired && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select
            value={scopeFolderId}
            onValueChange={setScopeFolderId}
            disabled={loadingFolders}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingFolders ? "Loading..." : "All folders"} />
            </SelectTrigger>
            <SelectContent>
              {!isFolderRequired && (
                <SelectItem value="">All folders</SelectItem>
              )}
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="size-3 rounded-full"
                      style={{ backgroundColor: folder.color || "#808080" }}
                    />
                    <span>{folder.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {isFolderRequired
              ? "Select which folder to watch for new meetings"
              : "Leave empty to trigger for meetings in any folder"}
          </p>
        </div>
      )}

      {/* Scope - Team */}
      {triggerType !== "manual" && (
        <div className="space-y-2">
          <Label>Scope to Team</Label>
          <Select
            value={scopeTeamId}
            onValueChange={setScopeTeamId}
            disabled={loadingTeams}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingTeams ? "Loading..." : "All teams"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All teams</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Leave empty to trigger for meetings involving any team
          </p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || (isFolderRequired && !scopeFolderId)}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Trigger"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ============================================================================
// Trigger Item Component
// ============================================================================

interface TriggerItemProps {
  trigger: AgentTriggerWithScope;
  onToggle: (isEnabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

function TriggerItem({ trigger, onToggle, onDelete }: TriggerItemProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      await onToggle(checked);
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  // Get trigger description
  const triggerLabel = TRIGGER_TYPE_LABELS[trigger.triggerType];

  // Build scope description
  const getScopeDescription = (): string | null => {
    const parts: string[] = [];
    if (trigger.folder) {
      parts.push(`Folder: ${trigger.folder.name}`);
    }
    if (trigger.team) {
      parts.push(`Team: ${trigger.team.name}`);
    }
    return parts.length > 0 ? parts.join(" | ") : null;
  };

  const scopeDescription = getScopeDescription();

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Zap className={cn(
          "size-4 shrink-0",
          trigger.isEnabled ? "text-yellow-500" : "text-muted-foreground"
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{triggerLabel}</span>
          </div>
          {scopeDescription && (
            <div className="flex items-center gap-2 mt-0.5">
              {trigger.folder && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <FolderIcon className="size-3" />
                  {trigger.folder.name}
                </Badge>
              )}
              {trigger.team && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Users className="size-3" />
                  {trigger.team.name}
                </Badge>
              )}
            </div>
          )}
          {!scopeDescription && trigger.triggerType !== "manual" && (
            <p className="text-xs text-muted-foreground">All meetings</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={trigger.isEnabled}
          onCheckedChange={handleToggle}
          disabled={isToggling}
          className="data-[state=checked]:bg-green-500"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TriggerConfig({
  triggers,
  isLoading,
  onCreateTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
}: TriggerConfigProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTrigger = async (data: CreateAgentTriggerRequest) => {
    setIsCreating(true);
    try {
      await onCreateTrigger(data);
      setIsDialogOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const canAddMore = triggers.length < AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Triggers</h3>
        {triggers.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {triggers.length}/{AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {triggers.length > 0 && (
            <div className="space-y-2">
              {triggers.map((trigger) => (
                <TriggerItem
                  key={trigger.id}
                  trigger={trigger}
                  onToggle={(isEnabled) => onUpdateTrigger(trigger.id, { isEnabled })}
                  onDelete={() => onDeleteTrigger(trigger.id)}
                />
              ))}
            </div>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                disabled={!canAddMore}
              >
                <Plus className="size-4 mr-2" />
                {canAddMore
                  ? "Add trigger"
                  : `Maximum ${AGENT_LIMITS.MAX_TRIGGERS_PER_AGENT} triggers reached`}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Trigger</DialogTitle>
                <DialogDescription>
                  Configure when this agent should run automatically based on events.
                </DialogDescription>
              </DialogHeader>
              {/* Conditional render forces form state reset when dialog reopens */}
              {isDialogOpen && (
                <TriggerForm
                  onSubmit={handleCreateTrigger}
                  onClose={() => setIsDialogOpen(false)}
                  isSubmitting={isCreating}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
