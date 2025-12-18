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
import type {
  Team,
  TeamWithMemberCount,
  TeamWithSubteams,
  CreateTeamRequest,
  UpdateTeamRequest,
  TeamRole,
} from "@/types/team";

// ============================================================================
// Types
// ============================================================================

interface TeamContextValue {
  // Teams State
  teams: TeamWithMemberCount[];
  teamHierarchy: TeamWithSubteams[];
  teamsLoading: boolean;
  teamsError: string | null;

  // Expanded Teams (for sidebar UI)
  expandedTeams: Set<string>;
  toggleTeamExpanded: (teamId: string) => void;

  // Role Helper
  /** Get user's role in a team. Checks createdBy for ownership. */
  getUserRoleInTeam: (teamId: string, userId: string) => TeamRole;

  // Team Actions
  createTeam: (params: CreateTeamRequest) => Promise<Team | null>;
  updateTeam: (
    teamId: string,
    updates: UpdateTeamRequest
  ) => Promise<Team | null>;
  deleteTeam: (teamId: string) => Promise<boolean>;
  reorderTeams: (
    teamIds: string[],
    parentTeamId: string | null
  ) => Promise<boolean>;
  refreshTeams: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const TeamContext = createContext<TeamContextValue | null>(null);

// ============================================================================
// Storage Keys
// ============================================================================

const TEAM_EXPANDED_KEY = "hedwiq-expanded-teams";

// ============================================================================
// Provider
// ============================================================================

interface TeamProviderProps {
  children: ReactNode;
  initialTeams?: TeamWithMemberCount[];
  initialHierarchy?: TeamWithSubteams[];
}

export function TeamProvider({
  children,
  initialTeams = [],
  initialHierarchy = [],
}: TeamProviderProps) {
  // ---------------------------------------------------------------------------
  // Teams State
  // ---------------------------------------------------------------------------

  const [teams, setTeams] = useState<TeamWithMemberCount[]>(initialTeams);
  const [teamHierarchy, setTeamHierarchy] =
    useState<TeamWithSubteams[]>(initialHierarchy);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  // Track if initial fetch has been done
  const initialFetchDone = useRef(initialTeams.length > 0);
  // Ref for hierarchy to use in optimistic updates without causing re-renders
  const hierarchyRef = useRef<TeamWithSubteams[]>(initialHierarchy);

  // ---------------------------------------------------------------------------
  // Expanded Teams State (for sidebar)
  // ---------------------------------------------------------------------------

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(
    () => new Set()
  );

  // Load expanded state from localStorage on mount
  useEffect(() => {
    try {
      const savedExpanded = localStorage.getItem(TEAM_EXPANDED_KEY);
      if (savedExpanded) {
        const parsed = JSON.parse(savedExpanded);
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string")
        ) {
          setExpandedTeams(new Set(parsed));
        }
      }
    } catch (err) {
      console.error("Failed to load expanded teams state:", err);
    }
  }, []);

  const toggleTeamExpanded = useCallback((teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }

      // Persist to localStorage
      try {
        localStorage.setItem(TEAM_EXPANDED_KEY, JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error("Failed to save expanded teams state:", err);
      }

      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch Teams
  // ---------------------------------------------------------------------------

  const refreshTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError(null);

    try {
      // Fetch hierarchy (includes all teams nested)
      const response = await fetch("/api/teams?hierarchy=true");
      if (!response.ok) {
        throw new Error("Failed to fetch teams");
      }
      const data = await response.json();

      // Set hierarchy from response
      const hierarchy: TeamWithSubteams[] = data.hierarchy?.teams ?? [];
      setTeamHierarchy(hierarchy);

      // Flatten hierarchy to get flat teams list
      const flatTeams = flattenTeamHierarchy(hierarchy);
      setTeams(flatTeams);
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      setTeamsError(
        err instanceof Error ? err.message : "Failed to fetch teams"
      );
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Role Helper
  // ---------------------------------------------------------------------------

  /**
   * Get user's role in a team.
   * Uses createdBy to determine ownership. For other roles,
   * the actual membership should be fetched from the API.
   * This is a client-side approximation for UI rendering.
   */
  const getUserRoleInTeam = useCallback(
    (teamId: string, userId: string): TeamRole => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return "member";

      // If user created the team, they're the owner
      if (team.createdBy === userId) return "owner";

      // Default to member - proper role checking requires API call
      // which is done in TeamMembersDialog for actual operations
      return "member";
    },
    [teams]
  );

  // Keep hierarchyRef in sync for optimistic updates
  useEffect(() => {
    hierarchyRef.current = teamHierarchy;
  }, [teamHierarchy]);

  // Fetch teams on mount if not provided
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      refreshTeams();
    }
  }, [refreshTeams]);

  // ---------------------------------------------------------------------------
  // Team Actions
  // ---------------------------------------------------------------------------

  const createTeam = useCallback(
    async (params: CreateTeamRequest): Promise<Team | null> => {
      try {
        const response = await fetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create team");
        }

        const data = await response.json();
        const newTeam: Team = data.team;

        // Refresh to get updated hierarchy
        await refreshTeams();

        return newTeam;
      } catch (err) {
        console.error("Failed to create team:", err);
        setTeamsError(
          err instanceof Error ? err.message : "Failed to create team"
        );
        return null;
      }
    },
    [refreshTeams]
  );

  const updateTeam = useCallback(
    async (
      teamId: string,
      updates: UpdateTeamRequest
    ): Promise<Team | null> => {
      try {
        const response = await fetch(`/api/teams/${teamId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update team");
        }

        const data = await response.json();
        const updatedTeam: Team = data.team;

        // Update local state
        setTeams((prev) =>
          prev.map((t) =>
            t.id === teamId
              ? { ...t, ...updatedTeam, memberCount: t.memberCount }
              : t
          )
        );

        // Update hierarchy
        setTeamHierarchy((prev) =>
          updateTeamInHierarchy(prev, teamId, updatedTeam)
        );

        return updatedTeam;
      } catch (err) {
        console.error("Failed to update team:", err);
        setTeamsError(
          err instanceof Error ? err.message : "Failed to update team"
        );
        return null;
      }
    },
    []
  );

  const deleteTeam = useCallback(
    async (teamId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/teams/${teamId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete team");
        }

        // Refresh to get updated hierarchy (sub-teams may have been deleted)
        await refreshTeams();

        return true;
      } catch (err) {
        console.error("Failed to delete team:", err);
        setTeamsError(
          err instanceof Error ? err.message : "Failed to delete team"
        );
        return false;
      }
    },
    [refreshTeams]
  );

  const reorderTeams = useCallback(
    async (
      teamIds: string[],
      parentTeamId: string | null
    ): Promise<boolean> => {
      // Capture current hierarchy for rollback using ref to avoid stale closure
      const originalHierarchy = hierarchyRef.current;

      // Update hierarchy optimistically
      setTeamHierarchy((prev) =>
        reorderTeamsInHierarchy(prev, teamIds, parentTeamId)
      );

      try {
        const response = await fetch("/api/teams/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds, parentTeamId }),
        });

        if (!response.ok) {
          // Revert on failure
          setTeamHierarchy(originalHierarchy);
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to reorder teams");
        }

        return true;
      } catch (err) {
        console.error("Failed to reorder teams:", err);
        setTeamHierarchy(originalHierarchy);
        setTeamsError(
          err instanceof Error ? err.message : "Failed to reorder teams"
        );
        return false;
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo<TeamContextValue>(
    () => ({
      // State
      teams,
      teamHierarchy,
      teamsLoading,
      teamsError,

      // Expanded Teams
      expandedTeams,
      toggleTeamExpanded,

      // Role Helper
      getUserRoleInTeam,

      // Actions
      createTeam,
      updateTeam,
      deleteTeam,
      reorderTeams,
      refreshTeams,
    }),
    [
      teams,
      teamHierarchy,
      teamsLoading,
      teamsError,
      expandedTeams,
      toggleTeamExpanded,
      getUserRoleInTeam,
      createTeam,
      updateTeam,
      deleteTeam,
      reorderTeams,
      refreshTeams,
    ]
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useTeamContext() {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error("useTeamContext must be used within a TeamProvider");
  }
  return context;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Flattens a team hierarchy into a flat array.
 */
function flattenTeamHierarchy(
  hierarchy: TeamWithSubteams[]
): TeamWithMemberCount[] {
  const result: TeamWithMemberCount[] = [];

  function traverse(teams: TeamWithSubteams[]) {
    for (const team of teams) {
      // Add team without subteams property
      const { subteams, ...teamData } = team;
      result.push(teamData);

      // Recursively add sub-teams
      if (subteams && subteams.length > 0) {
        traverse(subteams);
      }
    }
  }

  traverse(hierarchy);
  return result;
}

/**
 * Updates a team within the hierarchy.
 */
function updateTeamInHierarchy(
  hierarchy: TeamWithSubteams[],
  teamId: string,
  updates: Partial<Team>
): TeamWithSubteams[] {
  return hierarchy.map((team) => {
    if (team.id === teamId) {
      return { ...team, ...updates };
    }
    if (team.subteams && team.subteams.length > 0) {
      return {
        ...team,
        subteams: updateTeamInHierarchy(team.subteams, teamId, updates),
      };
    }
    return team;
  });
}

/**
 * Reorders teams within the hierarchy at a specific level.
 */
function reorderTeamsInHierarchy(
  hierarchy: TeamWithSubteams[],
  teamIds: string[],
  parentTeamId: string | null
): TeamWithSubteams[] {
  if (parentTeamId === null) {
    // Reordering root level teams
    const teamMap = new Map(hierarchy.map((t) => [t.id, t]));
    const reorderedTeams = teamIds
      .map((id, index) => {
        const team = teamMap.get(id);
        return team ? { ...team, orderIndex: index } : null;
      })
      .filter((t): t is TeamWithSubteams => t !== null);

    // Include any teams not in the reorder list
    const reorderedIds = new Set(teamIds);
    const remainingTeams = hierarchy.filter((t) => !reorderedIds.has(t.id));

    return [...reorderedTeams, ...remainingTeams];
  }

  // Reordering within a parent team
  return hierarchy.map((team) => {
    if (team.id === parentTeamId) {
      const subteamMap = new Map(team.subteams.map((t) => [t.id, t]));
      const reorderedSubteams = teamIds
        .map((id, index) => {
          const subteam = subteamMap.get(id);
          return subteam ? { ...subteam, orderIndex: index } : null;
        })
        .filter((t): t is TeamWithSubteams => t !== null);

      // Include any subteams not in the reorder list
      const reorderedIds = new Set(teamIds);
      const remainingSubteams = team.subteams.filter(
        (t) => !reorderedIds.has(t.id)
      );

      return { ...team, subteams: [...reorderedSubteams, ...remainingSubteams] };
    }

    // Recursively search in subteams
    if (team.subteams && team.subteams.length > 0) {
      return {
        ...team,
        subteams: reorderTeamsInHierarchy(team.subteams, teamIds, parentTeamId),
      };
    }

    return team;
  });
}
