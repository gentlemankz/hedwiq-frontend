"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAgentContext } from "@/contexts/agent-context";
import { AgentBuilderLayout } from "@/components/agents/agent-builder-layout";
import { AgentInstructionsPanel } from "@/components/agents/agent-instructions-panel";
import { AgentSettingsPanel } from "@/components/agents/agent-settings-panel";
import type { AgentWithDetails } from "@/types/agent";

// UUID v4 regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Agents Dashboard Page
 *
 * Two-panel layout for the Agent Builder:
 * - Main: Instructions editor and execution history
 * - Right: Settings panel (status toggle, model, schedules, triggers)
 *
 * Agent selection and creation is handled via the sidebar (AgentSidebarSection)
 */
export default function AgentsPage() {
  const searchParams = useSearchParams();

  const {
    agentsLoading,
    selectedAgentId,
    selectedAgent,
    isLoadingAgent,
    selectAgent,
    updateAgent,
    refreshSelectedAgent,
    ensureAgentsFetched,
  } = useAgentContext();

  // Ensure agents are fetched when landing on this page directly
  useEffect(() => {
    ensureAgentsFetched();
  }, [ensureAgentsFetched]);

  // Handle agent update
  const handleUpdateAgent = async (updates: Partial<AgentWithDetails>) => {
    if (!selectedAgentId) return;
    await updateAgent(selectedAgentId, updates);
  };

  // Restore selection from URL on mount (with UUID validation)
  useEffect(() => {
    const agentId = searchParams.get("agentId");
    if (agentId && agentId !== selectedAgentId) {
      // Validate UUID format before making API call
      if (!UUID_REGEX.test(agentId)) {
        console.warn("Invalid agentId format in URL:", agentId);
        return;
      }
      selectAgent(agentId);
    }
  }, [searchParams, selectedAgentId, selectAgent]);

  return (
    <AgentBuilderLayout
      mainPanel={
        <AgentInstructionsPanel
          agent={selectedAgent}
          isLoading={agentsLoading}
          isLoadingAgent={isLoadingAgent}
          onUpdate={handleUpdateAgent}
        />
      }
      rightPanel={
        <AgentSettingsPanel
          agent={selectedAgent}
          isLoading={isLoadingAgent}
          onUpdate={handleUpdateAgent}
          onRefresh={refreshSelectedAgent}
        />
      }
    />
  );
}
