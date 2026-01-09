"use client";

import { useState } from "react";
import {
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Mail,
  Zap,
  Calendar,
  User,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type {
  AgentExecution,
  AgentExecutionStatus,
  AgentExecutionTriggeredBy,
} from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

interface AgentExecutionHistoryProps {
  executions: AgentExecution[];
  isLoading?: boolean;
  maxVisible?: number;
}

interface ExecutionItemProps {
  execution: AgentExecution;
  defaultExpanded?: boolean;
}

// ============================================================================
// Status Helpers
// ============================================================================

const STATUS_CONFIG: Record<
  AgentExecutionStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    iconColor: string;
    bgColor: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    iconColor: "text-muted-foreground",
    bgColor: "bg-muted",
    badgeVariant: "outline",
  },
  running: {
    label: "Running",
    icon: Loader2,
    iconColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-950",
    badgeVariant: "secondary",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    iconColor: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-950",
    badgeVariant: "default",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    iconColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-950",
    badgeVariant: "destructive",
  },
};

const TRIGGER_CONFIG: Record<
  AgentExecutionTriggeredBy,
  { label: string; icon: typeof User }
> = {
  manual: { label: "Manual", icon: User },
  schedule: { label: "Scheduled", icon: Calendar },
  trigger: { label: "Event", icon: Zap },
};

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatFullTimestamp(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString();
}

// ============================================================================
// Execution Item Component
// ============================================================================

function ExecutionItem({ execution, defaultExpanded = false }: ExecutionItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const statusConfig = STATUS_CONFIG[execution.status];
  const triggerConfig = TRIGGER_CONFIG[execution.triggeredBy];
  const StatusIcon = statusConfig.icon;
  const TriggerIcon = triggerConfig.icon;

  const hasDetails =
    execution.outputResult?.text ||
    execution.outputResult?.toolCalls?.length ||
    execution.outputResult?.emailsSent?.length ||
    execution.errorMessage;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="rounded-lg border bg-card">
        {/* Header */}
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center justify-between p-3 text-left transition-colors",
              hasDetails && "hover:bg-accent/50 cursor-pointer"
            )}
            disabled={!hasDetails}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  statusConfig.bgColor
                )}
              >
                <StatusIcon
                  className={cn(
                    "size-4",
                    statusConfig.iconColor,
                    execution.status === "running" && "animate-spin"
                  )}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Badge variant={statusConfig.badgeVariant} className="h-5 text-xs">
                    {statusConfig.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <TriggerIcon className="size-3" />
                    {triggerConfig.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(execution.completedAt || execution.startedAt || execution.createdAt)}
                  {execution.durationMs && ` · ${formatDuration(execution.durationMs)}`}
                </span>
              </div>
            </div>
            {hasDetails && (
              <div className="flex items-center gap-2 text-muted-foreground">
                {execution.outputResult?.toolCalls?.length ? (
                  <span className="text-xs flex items-center gap-1">
                    <Wrench className="size-3" />
                    {execution.outputResult.toolCalls.length}
                  </span>
                ) : null}
                {execution.outputResult?.emailsSent?.length ? (
                  <span className="text-xs flex items-center gap-1">
                    <Mail className="size-3" />
                    {execution.outputResult.emailsSent.length}
                  </span>
                ) : null}
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </div>
            )}
          </button>
        </CollapsibleTrigger>

        {/* Expanded Details */}
        <CollapsibleContent>
          <div className="border-t px-3 py-3 space-y-3 text-sm">
            {/* Error Message */}
            {execution.errorMessage && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-xs">Error</p>
                  <p className="text-xs text-red-700 dark:text-red-300">
                    {execution.errorMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Output Text */}
            {execution.outputResult?.text && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-2 max-h-32 overflow-y-auto">
                  {execution.outputResult.text}
                </p>
              </div>
            )}

            {/* Tool Calls */}
            {execution.outputResult?.toolCalls?.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Wrench className="size-3" />
                  Tool Calls ({execution.outputResult.toolCalls.length})
                </p>
                <div className="space-y-1">
                  {execution.outputResult.toolCalls.map((call, i) => (
                    <div
                      key={i}
                      className="text-xs bg-muted/50 rounded px-2 py-1.5 font-mono"
                    >
                      <span className="font-semibold">{call.name}</span>
                      <span className="text-muted-foreground">
                        ({Object.keys(call.arguments).join(", ")})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Emails Sent */}
            {execution.outputResult?.emailsSent?.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Mail className="size-3" />
                  Emails Sent ({execution.outputResult.emailsSent.length})
                </p>
                <div className="space-y-1">
                  {execution.outputResult.emailsSent.map((email, i) => (
                    <div
                      key={i}
                      className="text-xs bg-muted/50 rounded px-2 py-1.5"
                    >
                      <span className="font-medium">{email.subject}</span>
                      <span className="text-muted-foreground">
                        {" → "}{email.to.join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Token Usage */}
            {execution.outputResult?.usage && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Tokens: {execution.outputResult.usage.totalTokens.toLocaleString()}
                </span>
                <span>
                  (Prompt: {execution.outputResult.usage.promptTokens.toLocaleString()},
                  Completion: {execution.outputResult.usage.completionTokens.toLocaleString()})
                </span>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
              <span>Started: {formatFullTimestamp(execution.startedAt)}</span>
              <span>Completed: {formatFullTimestamp(execution.completedAt)}</span>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AgentExecutionHistory({
  executions,
  isLoading = false,
  maxVisible = 5,
}: AgentExecutionHistoryProps) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-muted p-3">
          <Play className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No executions yet. Run the agent to see results here.
        </p>
      </div>
    );
  }

  const visibleExecutions = showAll ? executions : executions.slice(0, maxVisible);
  const hasMore = executions.length > maxVisible;

  return (
    <div className="space-y-3">
      {visibleExecutions.map((execution, index) => (
        <ExecutionItem
          key={execution.id}
          execution={execution}
          defaultExpanded={index === 0 && execution.status !== "pending"}
        />
      ))}

      {hasMore && !showAll && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          Show {executions.length - maxVisible} more executions
        </Button>
      )}

      {showAll && hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setShowAll(false)}
        >
          Show less
        </Button>
      )}
    </div>
  );
}
