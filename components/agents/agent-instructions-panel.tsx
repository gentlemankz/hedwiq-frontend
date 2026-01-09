"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Loader2,
  Play,
  Pencil,
  Check,
  X,
  Sparkles,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AGENT_LIMITS } from "@/types/agent";
import type { AgentWithDetails } from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

interface AgentInstructionsPanelProps {
  agent: AgentWithDetails | null;
  isLoading: boolean;
  isLoadingAgent: boolean;
  onUpdate: (updates: Partial<AgentWithDetails>) => Promise<void>;
  onRunAgent?: () => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

/**
 * AgentInstructionsPanel - Main content panel for agent display and editing
 *
 * Features:
 * - Header with agent name
 * - Large editable title
 * - Run agent button
 * - Steps display (instructions parsed as steps)
 * - Activity log (execution history preview)
 */
export function AgentInstructionsPanel({
  agent,
  isLoading,
  isLoadingAgent,
  onUpdate,
  onRunAgent,
}: AgentInstructionsPanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [editedInstructions, setEditedInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when agent changes
  useEffect(() => {
    if (agent) {
      setEditedName(agent.name);
      setEditedInstructions(agent.instructions);
    }
  }, [agent]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (isEditingInstructions && instructionsRef.current) {
      instructionsRef.current.focus();
    }
  }, [isEditingInstructions]);

  // Save name handler
  const handleSaveName = useCallback(async () => {
    if (!agent || editedName.trim() === agent.name) {
      setIsEditingName(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdate({ name: editedName.trim() });
      setIsEditingName(false);
    } finally {
      setIsSaving(false);
    }
  }, [agent, editedName, onUpdate]);

  // Save instructions handler
  const handleSaveInstructions = useCallback(async () => {
    if (!agent || editedInstructions.trim() === agent.instructions) {
      setIsEditingInstructions(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdate({ instructions: editedInstructions.trim() });
      setIsEditingInstructions(false);
    } finally {
      setIsSaving(false);
    }
  }, [agent, editedInstructions, onUpdate]);

  // Cancel editing
  const handleCancelName = () => {
    setEditedName(agent?.name || "");
    setIsEditingName(false);
  };

  const handleCancelInstructions = () => {
    setEditedInstructions(agent?.instructions || "");
    setIsEditingInstructions(false);
  };

  // Run agent
  const handleRunAgent = async () => {
    if (!onRunAgent) return;
    setIsRunning(true);
    try {
      await onRunAgent();
    } finally {
      setIsRunning(false);
    }
  };

  // Memoize parsed steps to avoid recalculating on every render
  const steps = useMemo(() => {
    if (!agent?.instructions) return [];
    return parseSteps(agent.instructions);
  }, [agent?.instructions]);

  // Header component
  const renderHeader = () => (
    <header className="flex items-center justify-between border-b px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className={cn(
          "size-4",
          agent?.isActive ? "text-primary" : "text-muted-foreground"
        )} />
        <span className="font-medium">
          {agent?.name || "Select an agent"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {agent && (
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(agent.updatedAt, "Edited ")}
          </span>
        )}
      </div>
    </header>
  );

  // Loading state - initial load
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {renderHeader()}
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Empty state - no agent selected
  if (!agent && !isLoadingAgent) {
    return (
      <div className="flex h-full flex-col">
        {renderHeader()}
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Bot className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium">Select an Agent</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Choose an agent from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>
    );
  }

  // Loading state - loading selected agent
  if (isLoadingAgent) {
    return (
      <div className="flex h-full flex-col">
        {renderHeader()}
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {renderHeader()}

      {/* Main content */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl">
          {/* Title */}
          <div className="group relative">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={nameInputRef}
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  maxLength={AGENT_LIMITS.MAX_NAME_LENGTH}
                  className="text-3xl font-semibold h-auto py-1 px-2 -ml-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") handleCancelName();
                  }}
                  disabled={isSaving}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={handleSaveName}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={handleCancelName}
                  disabled={isSaving}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <h1
                className="text-3xl font-semibold cursor-pointer hover:text-primary/80 transition-colors inline-flex items-center gap-2"
                onClick={() => setIsEditingName(true)}
              >
                {agent?.name}
                <Pencil className="size-4 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h1>
            )}
          </div>

          {/* Run Agent Button */}
          <div className="mt-4">
            <Button
              onClick={handleRunAgent}
              disabled={!agent?.isActive || isRunning || !onRunAgent}
              className="gap-2"
            >
              {isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run agent
            </Button>
            {!agent?.isActive && (
              <p className="mt-2 text-xs text-muted-foreground">
                Activate this agent in settings to run it.
              </p>
            )}
          </div>

          {/* Steps/Instructions Section */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium">Steps</h2>
              {!isEditingInstructions && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIsEditingInstructions(true)}
                >
                  <Pencil className="size-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>

            {isEditingInstructions ? (
              <div className="space-y-3">
                <Textarea
                  ref={instructionsRef}
                  value={editedInstructions}
                  onChange={(e) => setEditedInstructions(e.target.value)}
                  maxLength={AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH}
                  rows={10}
                  className="font-mono text-sm resize-none"
                  placeholder="Describe what this agent should do..."
                  disabled={isSaving}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {editedInstructions.length}/{AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelInstructions}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveInstructions}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="size-4 animate-spin mr-1" />
                      ) : null}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : steps.length > 0 ? (
              <ul className="space-y-2">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No instructions defined yet. Click Edit to add steps.
              </p>
            )}
          </section>

          {/* Activity Section */}
          <section className="mt-10 pt-8 border-t">
            <h2 className="text-base font-medium mb-4">Activity</h2>
            <div className="space-y-3">
              {/* Creation activity */}
              {agent && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <Sparkles className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="text-muted-foreground">You created </span>
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatRelativeTime(agent.createdAt)}
                    </span>
                  </div>
                </div>
              )}

              {/* Recent executions would go here */}
              {agent?.recentExecutions && agent.recentExecutions.length > 0 && (
                agent.recentExecutions.slice(0, 3).map((execution) => (
                  <div key={execution.id} className="flex items-center gap-3 text-sm">
                    <div className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      execution.status === "completed" ? "bg-green-100 dark:bg-green-950" :
                      execution.status === "failed" ? "bg-red-100 dark:bg-red-950" :
                      "bg-muted"
                    )}>
                      <Play className={cn(
                        "size-4",
                        execution.status === "completed" ? "text-green-600 dark:text-green-400" :
                        execution.status === "failed" ? "text-red-600 dark:text-red-400" :
                        "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agent {execution.status}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {execution.completedAt ? formatRelativeTime(execution.completedAt) : "Running..."}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse instructions into steps by splitting on newlines and bullet points.
 * Also handles numbered lists (1., 2., 3.) and various bullet styles.
 */
function parseSteps(instructions: string): string[] {
  return instructions
    .split(/[\n•\-\*]|\d+\./)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Format a date as a relative time string.
 * @param date - The date to format
 * @param prefix - Optional prefix (e.g., "Edited " or empty string)
 */
function formatRelativeTime(date: Date | string, prefix: string = ""): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return `${prefix}today`;
  if (diffDays === 1) return `${prefix}yesterday`;
  if (diffDays < 7) return `${prefix}${diffDays} days ago`;
  if (diffDays < 30) return `${prefix}${Math.floor(diffDays / 7)} weeks ago`;
  return then.toLocaleDateString();
}
