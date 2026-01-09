/**
 * Hook for fetching mention context (folders, teams, services).
 * Used by the MentionInput component in the Agent Builder.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { MentionableEntity, ParserContext } from "@/lib/agents";
import { AVAILABLE_SERVICES } from "@/types/agent";

// ============================================================================
// Types
// ============================================================================

interface UseMentionContextResult {
  /** Combined context for the instruction parser */
  context: ParserContext;
  /** Whether folders/teams are loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Whether data failed to load (distinguishes from loading state) */
  hasFetchError: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch folders and teams for @ mention autocomplete.
 * Combines them into a ParserContext for the instruction parser.
 */
export function useMentionContext(): UseMentionContextResult {
  const [folders, setFolders] = useState<MentionableEntity[]>([]);
  const [teams, setTeams] = useState<MentionableEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetchError, setHasFetchError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    setHasFetchError(false);

    try {
      // Fetch folders and teams in parallel with AbortSignal
      const [foldersResponse, teamsResponse] = await Promise.all([
        fetch("/api/folders", { signal }),
        fetch("/api/teams", { signal }),
      ]);

      if (!foldersResponse.ok) {
        throw new Error("Failed to fetch folders");
      }
      if (!teamsResponse.ok) {
        throw new Error("Failed to fetch teams");
      }

      const foldersData = await foldersResponse.json();
      const teamsData = await teamsResponse.json();

      // Transform folders to MentionableEntity
      const folderEntities: MentionableEntity[] = (
        foldersData.folders || []
      ).map((folder: { id: string; name: string; color: string | null }) => ({
        id: folder.id,
        name: folder.name,
        type: "folder" as const,
        color: folder.color,
      }));

      // Transform teams to MentionableEntity
      // Teams API can return either { teams } or { hierarchy }
      let teamEntities: MentionableEntity[] = [];
      if (teamsData.teams) {
        teamEntities = teamsData.teams.map(
          (team: { id: string; name: string; color: string | null }) => ({
            id: team.id,
            name: team.name,
            type: "team" as const,
            color: team.color,
          })
        );
      } else if (teamsData.hierarchy?.teams) {
        // Flatten hierarchy
        teamEntities = flattenTeamHierarchy(teamsData.hierarchy.teams);
      }

      setFolders(folderEntities);
      setTeams(teamEntities);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch mention context:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch mention context"
      );
      setHasFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount with AbortController cleanup
  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  // Manual refresh function (creates new AbortController)
  const refresh = useCallback(async () => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    await fetchData(controller.signal);
  }, [fetchData]);

  // Build services from AVAILABLE_SERVICES constant
  const services = useMemo<MentionableEntity[]>(
    () =>
      AVAILABLE_SERVICES.map((service) => ({
        id: service.id,
        name: service.name,
        type: "service" as const,
      })),
    []
  );

  // Build combined context
  const context = useMemo<ParserContext>(
    () => ({
      folders,
      teams,
      services,
    }),
    [folders, teams, services]
  );

  return {
    context,
    isLoading,
    error,
    hasFetchError,
    refresh,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Flatten a hierarchical team structure into a flat list.
 */
function flattenTeamHierarchy(
  teams: Array<{
    id: string;
    name: string;
    color: string | null;
    subteams?: Array<{
      id: string;
      name: string;
      color: string | null;
      subteams?: unknown[];
    }>;
  }>
): MentionableEntity[] {
  const result: MentionableEntity[] = [];

  function traverse(
    teamList: Array<{
      id: string;
      name: string;
      color: string | null;
      subteams?: unknown[];
    }>
  ) {
    for (const team of teamList) {
      result.push({
        id: team.id,
        name: team.name,
        type: "team",
        color: team.color,
      });
      if (team.subteams && Array.isArray(team.subteams)) {
        traverse(
          team.subteams as Array<{
            id: string;
            name: string;
            color: string | null;
            subteams?: unknown[];
          }>
        );
      }
    }
  }

  traverse(teams);
  return result;
}
