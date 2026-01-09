"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type {
  AgentWithCounts,
  AgentWithDetails,
  CreateAgentRequest,
  UpdateAgentRequest,
} from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

interface AgentContextValue {
  // Agents State
  agents: AgentWithCounts[];
  agentsLoading: boolean;
  agentsError: string | null;
  hasFetchedAgents: boolean;

  // Selected Agent State
  selectedAgentId: string | null;
  selectedAgent: AgentWithDetails | null;
  isLoadingAgent: boolean;

  // Actions
  selectAgent: (agentId: string | null) => void;
  createAgent: (params?: Partial<CreateAgentRequest>) => Promise<AgentWithCounts | null>;
  updateAgent: (agentId: string, updates: UpdateAgentRequest) => Promise<AgentWithDetails | null>;
  deleteAgent: (agentId: string) => Promise<boolean>;
  refreshAgents: () => Promise<void>;
  refreshSelectedAgent: () => Promise<void>;
  /** Fetch agents if not already fetched (lazy loading) */
  ensureAgentsFetched: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const AgentContext = createContext<AgentContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AgentProviderProps {
  children: ReactNode;
  initialAgents?: AgentWithCounts[];
}

export function AgentProvider({
  children,
  initialAgents = [],
}: AgentProviderProps) {
  // ---------------------------------------------------------------------------
  // Agents State
  // ---------------------------------------------------------------------------

  const [agents, setAgents] = useState<AgentWithCounts[]>(initialAgents);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [hasFetchedAgents, setHasFetchedAgents] = useState(initialAgents.length > 0);

  // ---------------------------------------------------------------------------
  // Selected Agent State
  // ---------------------------------------------------------------------------

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithDetails | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  // ---------------------------------------------------------------------------
  // Abort Controller for cancelling fetch requests
  // ---------------------------------------------------------------------------

  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch Agents
  // ---------------------------------------------------------------------------

  const refreshAgents = useCallback(async () => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setAgentsLoading(true);
    setAgentsError(null);

    try {
      const response = await fetch("/api/agents", {
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch agents");
      }

      const data = await response.json();
      setAgents(data.agents);
      setHasFetchedAgents(true);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Failed to fetch agents:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch agents";
      setAgentsError(errorMessage);
      toast.error("Failed to load agents", { description: errorMessage });
      // Don't set hasFetchedAgents true on error - allows retry on next navigation/expand
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  // Lazy loading helper - only fetch if not already fetched
  const ensureAgentsFetched = useCallback(async () => {
    if (!hasFetchedAgents && !agentsLoading) {
      await refreshAgents();
    }
  }, [hasFetchedAgents, agentsLoading, refreshAgents]);

  // ---------------------------------------------------------------------------
  // Fetch Selected Agent Details
  // ---------------------------------------------------------------------------

  const agentDetailAbortRef = useRef<AbortController | null>(null);

  const refreshSelectedAgent = useCallback(async () => {
    if (!selectedAgentId) {
      setSelectedAgent(null);
      return;
    }

    // Cancel any in-flight request for agent details
    agentDetailAbortRef.current?.abort();
    agentDetailAbortRef.current = new AbortController();

    setIsLoadingAgent(true);

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}`, {
        signal: agentDetailAbortRef.current.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch agent");
      }

      const data = await response.json();
      setSelectedAgent(data.agent);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Failed to fetch agent details:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch agent details";
      toast.error("Failed to load agent", { description: errorMessage });
      setSelectedAgent(null);
    } finally {
      setIsLoadingAgent(false);
    }
  }, [selectedAgentId]);

  // Fetch agent details when selection changes
  useEffect(() => {
    if (selectedAgentId) {
      refreshSelectedAgent();
    } else {
      setSelectedAgent(null);
    }
  }, [selectedAgentId, refreshSelectedAgent]);

  // ---------------------------------------------------------------------------
  // Agent Actions
  // ---------------------------------------------------------------------------

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const createAgent = useCallback(
    async (params?: Partial<CreateAgentRequest>): Promise<AgentWithCounts | null> => {
      try {
        const response = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: params?.name || "New Agent",
            instructions: params?.instructions || "Describe what this agent should do...",
            model: params?.model || "gpt-4o",
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create agent");
        }

        const data = await response.json();
        const newAgent = data.agent as AgentWithCounts;

        // Update local state
        setAgents((prev) => [...prev, newAgent]);

        // Select the new agent
        setSelectedAgentId(newAgent.id);

        toast.success("Agent created", { description: `"${newAgent.name}" has been created.` });

        return newAgent;
      } catch (err) {
        console.error("Failed to create agent:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to create agent";
        setAgentsError(errorMessage);
        toast.error("Failed to create agent", { description: errorMessage });
        return null;
      }
    },
    []
  );

  const updateAgent = useCallback(
    async (
      agentId: string,
      updates: UpdateAgentRequest
    ): Promise<AgentWithDetails | null> => {
      try {
        const response = await fetch(`/api/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update agent");
        }

        const data = await response.json();
        const updatedAgent = data.agent as AgentWithDetails;

        // Update agents list
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agentId
              ? { ...a, ...updatedAgent }
              : a
          )
        );

        // Update selected agent if it's the one being updated
        if (selectedAgentId === agentId) {
          setSelectedAgent((prev) =>
            prev ? { ...prev, ...updatedAgent } : updatedAgent
          );
        }

        return updatedAgent;
      } catch (err) {
        console.error("Failed to update agent:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to update agent";
        setAgentsError(errorMessage);
        toast.error("Failed to update agent", { description: errorMessage });
        return null;
      }
    },
    [selectedAgentId]
  );

  const deleteAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/agents/${agentId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete agent");
        }

        // Update local state
        setAgents((prev) => prev.filter((a) => a.id !== agentId));

        // Clear selection if the deleted agent was selected
        if (selectedAgentId === agentId) {
          setSelectedAgentId(null);
          setSelectedAgent(null);
        }

        toast.success("Agent deleted");

        return true;
      } catch (err) {
        console.error("Failed to delete agent:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to delete agent";
        setAgentsError(errorMessage);
        toast.error("Failed to delete agent", { description: errorMessage });
        return false;
      }
    },
    [selectedAgentId]
  );

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo<AgentContextValue>(
    () => ({
      // State
      agents,
      agentsLoading,
      agentsError,
      hasFetchedAgents,

      // Selected Agent
      selectedAgentId,
      selectedAgent,
      isLoadingAgent,

      // Actions
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      refreshAgents,
      refreshSelectedAgent,
      ensureAgentsFetched,
    }),
    [
      agents,
      agentsLoading,
      agentsError,
      hasFetchedAgents,
      selectedAgentId,
      selectedAgent,
      isLoadingAgent,
      selectAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      refreshAgents,
      refreshSelectedAgent,
      ensureAgentsFetched,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgentContext must be used within an AgentProvider");
  }
  return context;
}
