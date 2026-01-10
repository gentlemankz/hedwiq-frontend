"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Loader2,
  Pencil,
  Check,
  X,
  Sparkles,
  Bot,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AGENT_LIMITS } from "@/types/agent";
import type { AgentWithDetails, ParsedInstructions } from "@/types/agent";
import { MentionInput } from "./mention-input";
import { TextWithMentions } from "./mention-tag";
import { AgentExecutionHistory } from "./agent-execution-history";
import { useMentionContext } from "@/hooks/use-mention-context";
import {
  parseInstructions,
  getUnresolvedReferences,
} from "@/lib/agents";

// ============================================================================
// Types
// ============================================================================

interface AgentInstructionsPanelProps {
  agent: AgentWithDetails | null;
  isLoading: boolean;
  isLoadingAgent: boolean;
  onUpdate: (updates: Partial<AgentWithDetails>) => Promise<void>;
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
 * - Steps display (instructions parsed as steps)
 * - Activity log (execution history preview)
 */
export function AgentInstructionsPanel({
  agent,
  isLoading,
  isLoadingAgent,
  onUpdate,
}: AgentInstructionsPanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [editedInstructions, setEditedInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Fetch folders, teams, and services for @ mention autocomplete
  const {
    context: mentionContext,
    isLoading: isMentionContextLoading,
    hasFetchError: hasMentionContextError,
    refresh: refreshMentionContext,
  } = useMentionContext();

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

  // Parse instructions to extract @ mentions
  const parsedInstructions = useMemo<ParsedInstructions | null>(() => {
    if (!agent?.instructions) return null;
    return parseInstructions(agent.instructions, mentionContext);
  }, [agent?.instructions, mentionContext]);

  // Check for unresolved references
  const unresolvedRefs = useMemo(() => {
    if (!parsedInstructions) return [];
    return getUnresolvedReferences(parsedInstructions);
  }, [parsedInstructions]);

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

          {/* Steps/Instructions Section */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium">Instructions</h2>
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
                {/* Warning when mention context failed to load */}
                {hasMentionContextError && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
                    <AlertCircle className="size-4 shrink-0" />
                    <div className="flex-1">
                      <span>Failed to load folders and teams. @ mentions may not resolve correctly.</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
                      onClick={refreshMentionContext}
                    >
                      Retry
                    </Button>
                  </div>
                )}
                <MentionInput
                  value={editedInstructions}
                  onChange={setEditedInstructions}
                  context={mentionContext}
                  maxLength={AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH}
                  rows={10}
                  placeholder="Describe what this agent should do. Use @ to mention folders, teams, or services..."
                  disabled={isSaving || isMentionContextLoading}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {editedInstructions.length}/{AGENT_LIMITS.MAX_INSTRUCTIONS_LENGTH}
                    {isMentionContextLoading && " • Loading suggestions..."}
                    {hasMentionContextError && !isMentionContextLoading && " • Suggestions unavailable"}
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
            ) : agent?.instructions ? (
              <div className="space-y-4">
                {/* Render instructions with mention tags */}
                <div className="text-sm leading-relaxed">
                  {parsedInstructions ? (
                    <TextWithMentions
                      text={agent.instructions}
                      references={parsedInstructions.references}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{agent.instructions}</span>
                  )}
                </div>

                {/* Show warning for unresolved references (only after context is loaded successfully) */}
                {unresolvedRefs.length > 0 && !isMentionContextLoading && !hasMentionContextError && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Unresolved references</p>
                      <p className="text-amber-700 dark:text-amber-300">
                        The following mentions could not be found: {unresolvedRefs.join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Referenced entities summary */}
                {parsedInstructions && parsedInstructions.references.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    References: {parsedInstructions.folders.length} folder(s), {parsedInstructions.teams.length} team(s), {parsedInstructions.services.length} service(s)
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No instructions defined yet. Click Edit to add instructions.
              </p>
            )}
          </section>

          {/* Execution History Section */}
          <section className="mt-10 pt-8 border-t">
            <h2 className="text-base font-medium mb-4">Execution History</h2>
            <AgentExecutionHistory
              executions={agent?.recentExecutions ?? []}
              maxVisible={5}
            />
          </section>

          {/* Activity Section */}
          <section className="mt-8 pt-6 border-t">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Activity</h2>
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
