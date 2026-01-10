"use client";

import { useState } from "react";
import {
  Loader2,
  Plus,
  X,
  Settings2,
  Hammer,
  ChevronDown,
  Mail,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  MODEL_LABELS,
  type AgentModel,
  type AgentService,
  type AgentWithDetails,
  type AgentSchedule,
  type CreateAgentScheduleRequest,
  type AgentTriggerWithScope,
  type CreateAgentTriggerRequest,
} from "@/types/agent";
import { ScheduleConfig } from "@/components/agents/schedule-config";
import { TriggerConfig } from "@/components/agents/trigger-config";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface AgentSettingsPanelProps {
  agent: AgentWithDetails | null;
  isLoading: boolean;
  onUpdate: (updates: Partial<AgentWithDetails>) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

// Model icons/labels for display
const MODEL_DISPLAY: Record<AgentModel, { label: string; icon: string }> = {
  "gpt-4o": { label: "GPT-4o", icon: "🌟" },
  "gpt-4o-mini": { label: "GPT-4o Mini", icon: "⚡" },
  "gpt-4-turbo": { label: "GPT-4 Turbo", icon: "🚀" },
};

// Available integrations for display (ids must match AgentService type)
const INTEGRATIONS: Array<{
  id: AgentService;
  label: string;
  icon: typeof Mail;
  color: string;
}> = [
  { id: "Gmail", label: "Gmail", icon: Mail, color: "text-red-500" },
  { id: "Calendar", label: "Google Calendar", icon: Calendar, color: "text-blue-500" },
];

// ============================================================================
// Component
// ============================================================================

export function AgentSettingsPanel({
  agent,
  isLoading,
  onUpdate,
  onRefresh,
}: AgentSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"configuration" | "builder">("configuration");
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  /**
   * Generic API call helper that handles fetch, error parsing, and toast notifications.
   * Swallows errors after showing toast to prevent unhandled rejections.
   */
  const apiCall = async (
    url: string,
    options: RequestInit | undefined,
    successMessage: string,
    errorContext: string
  ): Promise<void> => {
    if (!agent) return;
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${errorContext}`);
      }
      toast.success(successMessage);
      await onRefresh?.();
    } catch (err) {
      console.error(`Failed to ${errorContext}:`, err);
      const message = err instanceof Error ? err.message : `Failed to ${errorContext}`;
      toast.error(message);
    }
  };

  // Schedule handlers
  const handleCreateSchedule = (data: CreateAgentScheduleRequest) =>
    apiCall(
      `/api/agents/${agent?.id}/schedules`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
      "Schedule created",
      "create schedule"
    );

  const handleUpdateSchedule = (scheduleId: string, updates: Partial<AgentSchedule>) =>
    apiCall(
      `/api/agents/${agent?.id}/schedules/${scheduleId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) },
      updates.isEnabled !== undefined
        ? (updates.isEnabled ? "Schedule enabled" : "Schedule disabled")
        : "Schedule updated",
      "update schedule"
    );

  const handleDeleteSchedule = (scheduleId: string) =>
    apiCall(
      `/api/agents/${agent?.id}/schedules/${scheduleId}`,
      { method: "DELETE" },
      "Schedule deleted",
      "delete schedule"
    );

  // Trigger handlers
  const handleCreateTrigger = (data: CreateAgentTriggerRequest) =>
    apiCall(
      `/api/agents/${agent?.id}/triggers`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
      "Trigger created",
      "create trigger"
    );

  const handleUpdateTrigger = (triggerId: string, updates: Partial<AgentTriggerWithScope>) =>
    apiCall(
      `/api/agents/${agent?.id}/triggers/${triggerId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) },
      updates.isEnabled !== undefined
        ? (updates.isEnabled ? "Trigger enabled" : "Trigger disabled")
        : "Trigger updated",
      "update trigger"
    );

  const handleDeleteTrigger = (triggerId: string) =>
    apiCall(
      `/api/agents/${agent?.id}/triggers/${triggerId}`,
      { method: "DELETE" },
      "Trigger deleted",
      "delete trigger"
    );

  // Handle model change
  const handleModelChange = async (model: AgentModel) => {
    if (!agent || model === agent.model) return;
    setIsUpdatingModel(true);
    try {
      await onUpdate({ model });
    } finally {
      setIsUpdatingModel(false);
    }
  };

  // Handle active toggle
  const handleActiveToggle = async (isActive: boolean) => {
    if (!agent) return;
    setIsUpdatingStatus(true);
    try {
      await onUpdate({ isActive });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Get referenced services from agent
  const getActiveIntegrations = () => {
    if (!agent?.referencedServices) return [];
    return INTEGRATIONS.filter((int) =>
      agent.referencedServices?.includes(int.id)
    );
  };

  // Empty state
  if (!agent && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="rounded-full bg-muted p-4">
          <Settings2 className="size-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">Configuration</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Select an agent to configure its model, schedules, and integrations.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeIntegrations = getActiveIntegrations();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3">
        <h2 className="text-base font-medium">Overview</h2>
      </header>

      {/* Tabs */}
      <div className="px-4 pt-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "configuration" | "builder")}>
          <TabsList className="w-full">
            <TabsTrigger value="configuration" className="flex-1 gap-2">
              <Settings2 className="size-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="builder" className="flex-1 gap-2">
              <Hammer className="size-4" />
              Builder
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {activeTab === "configuration" ? (
            <>
              {/* Model Section */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Model</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-auto py-2"
                      disabled={isUpdatingModel}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {MODEL_DISPLAY[agent?.model || "gpt-4o"].icon}
                        </span>
                        <span>{MODEL_DISPLAY[agent?.model || "gpt-4o"].label}</span>
                      </div>
                      {isUpdatingModel ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {(Object.keys(MODEL_LABELS) as AgentModel[]).map((model) => (
                      <DropdownMenuItem
                        key={model}
                        onClick={() => handleModelChange(model)}
                        className={cn(
                          "gap-2",
                          agent?.model === model && "bg-accent"
                        )}
                      >
                        <span className="text-base">{MODEL_DISPLAY[model].icon}</span>
                        <span>{MODEL_DISPLAY[model].label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </section>

              {/* Status Toggle */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "size-2 rounded-full",
                      agent?.isActive ? "bg-green-500" : "bg-muted-foreground"
                    )} />
                    <span className="text-sm">
                      {agent?.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <Switch
                    checked={agent?.isActive ?? false}
                    onCheckedChange={handleActiveToggle}
                    disabled={isUpdatingStatus}
                  />
                </div>
              </section>

              {/* Schedules Section */}
              {agent && (
                <ScheduleConfig
                  agentId={agent.id}
                  schedules={agent.schedules ?? []}
                  onCreateSchedule={handleCreateSchedule}
                  onUpdateSchedule={handleUpdateSchedule}
                  onDeleteSchedule={handleDeleteSchedule}
                />
              )}

              {/* Triggers Section */}
              {agent && (
                <TriggerConfig
                  agentId={agent.id}
                  triggers={agent.triggers ?? []}
                  onCreateTrigger={handleCreateTrigger}
                  onUpdateTrigger={handleUpdateTrigger}
                  onDeleteTrigger={handleDeleteTrigger}
                />
              )}

              {/* Integrations Section */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Integrations
                </h3>
                <div className="flex flex-wrap gap-2">
                  {activeIntegrations.length > 0 ? (
                    activeIntegrations.map((integration) => (
                      <Badge
                        key={integration.id}
                        variant="secondary"
                        className="gap-1.5 px-2.5 py-1"
                      >
                        <integration.icon className={cn("size-3.5", integration.color)} />
                        <span>{integration.label}</span>
                        <button
                          className="ml-1 hover:text-destructive transition-colors"
                          disabled // Phase 2
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No integrations connected. Use @ mentions in instructions to add them.
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  disabled // Phase 2
                >
                  <Plus className="size-4 mr-2" />
                  Add tool
                </Button>
              </section>

              {/* Knowledge Section - Placeholder for future */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Knowledge
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  disabled // Future feature
                >
                  <Plus className="size-4 mr-2" />
                  Add knowledge
                </Button>
              </section>
            </>
          ) : (
            /* Builder Tab - Placeholder */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <Hammer className="size-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-sm font-medium">Visual Builder</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">
                Visual workflow builder coming in a future update.
              </p>
            </div>
          )}

          {/* Agent Info - Moved to bottom */}
          {agent && activeTab === "configuration" && (
            <section className="pt-4 border-t space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-medium">Created:</span>{" "}
                {new Date(agent.createdAt).toLocaleDateString()}
              </p>
              <p>
                <span className="font-medium">Updated:</span>{" "}
                {new Date(agent.updatedAt).toLocaleDateString()}
              </p>
              <p className="truncate">
                <span className="font-medium">ID:</span> {agent.id}
              </p>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
