/**
 * Standalone hook for fetching folders data.
 * Use this when you need folder data outside the SidebarProvider context
 * (e.g., in meeting pages that are not part of the dashboard layout).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Folder } from "@/types/folder";

interface UseFoldersResult {
  folders: Folder[];
  foldersLoading: boolean;
  foldersError: string | null;
  defaultFolderId: string | null;
  refreshFolders: () => Promise<void>;
}

/**
 * Hook to fetch folders independently.
 * Fetches on mount and provides refresh capability.
 */
export function useFolders(): UseFoldersResult {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const defaultFolderId = useMemo(() => {
    const defaultFolder = folders.find((f) => f.isDefault);
    return defaultFolder?.id ?? null;
  }, [folders]);

  const refreshFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFoldersError(null);

    try {
      const response = await fetch("/api/folders?includeCounts=true");
      if (!response.ok) {
        throw new Error("Failed to fetch folders");
      }
      const data = await response.json();
      setFolders(data.folders);
    } catch (err) {
      console.error("Failed to fetch folders:", err);
      setFoldersError(
        err instanceof Error ? err.message : "Failed to fetch folders"
      );
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  // Fetch folders on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    refreshFolders();
  }, [refreshFolders]);

  return {
    folders,
    foldersLoading,
    foldersError,
    defaultFolderId,
    refreshFolders,
  };
}
