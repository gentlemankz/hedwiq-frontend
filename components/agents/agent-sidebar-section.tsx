"use client";

import { useState, memo, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Plus,
  Loader2,
  MoreHorizontal,
  Trash2,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { useAgentContext } from "@/contexts/agent-context";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteAgentDialog } from "./delete-agent-dialog";
import { cn } from "@/lib/utils";
import type { AgentWithCounts } from "@/types/agent";

// ============================================================================
// Component
// ============================================================================

export function AgentSidebarSection() {
  const pathname = usePathname();
  const router = useRouter();
  const { expandedSections, toggleSection } = useSidebarContext();
  const {
    agents,
    agentsLoading,
    agentsError,
    selectedAgentId,
    selectAgent,
    createAgent,
    deleteAgent,
    ensureAgentsFetched,
    refreshAgents,
  } = useAgentContext();

  // Local state
  const [isCreating, setIsCreating] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<AgentWithCounts | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAgentsExpanded = expandedSections.has("agents");
  const isAgentsActive = pathname.startsWith("/dashboard/agents");

  // Lazy load agents when section is expanded
  useEffect(() => {
    if (isAgentsExpanded) {
      ensureAgentsFetched();
    }
  }, [isAgentsExpanded, ensureAgentsFetched]);

  // Handlers
  const handleCreateAgent = async () => {
    setIsCreating(true);
    try {
      const newAgent = await createAgent();
      if (newAgent) {
        // Navigate to agents page with the new agent selected
        router.push(`/dashboard/agents?agentId=${newAgent.id}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectAgent = (agentId: string) => {
    selectAgent(agentId);
    router.push(`/dashboard/agents?agentId=${agentId}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAgent) return;
    setIsDeleting(true);
    try {
      await deleteAgent(deletingAgent.id);
    } finally {
      setIsDeleting(false);
      setDeletingAgent(null);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        <Collapsible
          open={isAgentsExpanded}
          onOpenChange={() => toggleSection("agents")}
          className="group/collapsible"
        >
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={isAgentsActive}
              tooltip="Agents"
            >
              <Bot />
              <span>Agents</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {/* Loading State */}
              {agentsLoading ? (
                <SidebarMenuSubItem>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    <span>Loading agents...</span>
                  </div>
                </SidebarMenuSubItem>
              ) : agentsError ? (
                <SidebarMenuSubItem>
                  <div className="flex flex-col gap-1 px-2 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="size-3" />
                      <span>Failed to load</span>
                    </div>
                    <button
                      onClick={refreshAgents}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RefreshCw className="size-3" />
                      <span>Retry</span>
                    </button>
                  </div>
                </SidebarMenuSubItem>
              ) : (
                <>
                  {/* Agent List */}
                  {agents.length === 0 ? (
                    <SidebarMenuSubItem>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No agents yet
                      </div>
                    </SidebarMenuSubItem>
                  ) : (
                    agents.map((agent) => (
                      <AgentSidebarItem
                        key={agent.id}
                        agent={agent}
                        isSelected={agent.id === selectedAgentId}
                        onSelect={() => handleSelectAgent(agent.id)}
                        onDelete={() => setDeletingAgent(agent)}
                      />
                    ))
                  )}

                  {/* New Agent Button */}
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild>
                      <button
                        onClick={handleCreateAgent}
                        disabled={isCreating}
                        className="cursor-pointer w-full"
                      >
                        {isCreating ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        <span>New Agent</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </>
              )}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>

      {/* Delete Agent Dialog */}
      <DeleteAgentDialog
        agent={deletingAgent}
        isDeleting={isDeleting}
        onClose={() => setDeletingAgent(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

// ============================================================================
// Agent Sidebar Item (Memoized for performance)
// ============================================================================

interface AgentSidebarItemProps {
  agent: AgentWithCounts;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const AgentSidebarItem = memo(function AgentSidebarItem({
  agent,
  isSelected,
  onSelect,
  onDelete,
}: AgentSidebarItemProps) {
  return (
    <SidebarMenuSubItem className="group/agent">
      <SidebarMenuSubButton
        onClick={onSelect}
        isActive={isSelected}
        className="pr-6 cursor-pointer"
      >
        <Sparkles
          className={cn(
            "size-3",
            agent.isActive ? "text-primary" : "text-muted-foreground"
          )}
        />
        <span className="flex-1 truncate">{agent.name}</span>
      </SidebarMenuSubButton>

      {/* Agent Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/agent:opacity-100 hover:bg-sidebar-accent transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuSubItem>
  );
});
