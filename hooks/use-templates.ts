/**
 * Hook for fetching meeting templates.
 * Supports filtering by scope, category, and search.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  TemplateWithItems,
  TemplateCategory,
  TemplateScope,
  ListTemplatesParams,
} from "@/types/template";

interface UseTemplatesResult {
  templates: TemplateWithItems[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseTemplatesOptions extends ListTemplatesParams {
  enabled?: boolean;
}

/**
 * Hook to fetch templates with optional filtering.
 */
export function useTemplates(options: UseTemplatesOptions = {}): UseTemplatesResult {
  const {
    scope = "all",
    category,
    teamId,
    includeArchived = false,
    search,
    sortBy = "usageCount",
    sortOrder = "desc",
    limit = 50,
    offset = 0,
    enabled = true,
  } = options;

  const [templates, setTemplates] = useState<TemplateWithItems[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!enabled) return;

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (scope !== "all") params.set("scope", scope);
      if (category) params.set("category", category);
      if (teamId) params.set("teamId", teamId);
      if (includeArchived) params.set("includeArchived", "true");
      if (search) params.set("search", search);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortOrder) params.set("sortOrder", sortOrder);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const response = await fetch(`/api/templates?${params.toString()}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        // Try to parse error message from API response
        let errorMessage = "Failed to fetch templates";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setTemplates(data.templates);
      setTotal(data.total);
    } catch (err) {
      // Don't set error state if request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to fetch templates");
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [enabled, scope, category, teamId, includeArchived, search, sortBy, sortOrder, limit, offset]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchTemplates();

    // Cleanup: abort request on unmount or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchTemplates]);

  return {
    templates,
    total,
    isLoading,
    error,
    refetch: fetchTemplates,
  };
}

/**
 * Hook to fetch a single template by ID.
 */
export function useTemplate(id: string | null): {
  template: TemplateWithItems | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [template, setTemplate] = useState<TemplateWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplate = useCallback(async () => {
    if (!id) {
      setTemplate(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/templates/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setTemplate(null);
          return;
        }
        throw new Error("Failed to fetch template");
      }

      const data = await response.json();
      setTemplate(data.template);
    } catch (err) {
      console.error("Failed to fetch template:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch template");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  return {
    template,
    isLoading,
    error,
    refetch: fetchTemplate,
  };
}
