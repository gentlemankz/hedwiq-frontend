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
import type { Folder } from "@/types/folder";

// ============================================================================
// Types
// ============================================================================

interface SidebarContextValue {
  // Sidebar UI State
  expandedSections: Set<string>;
  toggleSection: (sectionId: string) => void;

  // Folders State
  folders: Folder[];
  foldersLoading: boolean;
  foldersError: string | null;
  refreshFolders: () => Promise<void>;

  // Folder Actions
  createFolder: (name: string, color?: string) => Promise<Folder | null>;
  updateFolder: (
    id: string,
    updates: { name?: string; color?: string | null }
  ) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  reorderFolders: (folderIds: string[]) => Promise<boolean>;

  // Helper
  defaultFolderId: string | null;
}

// ============================================================================
// Context
// ============================================================================

const SidebarContext = createContext<SidebarContextValue | null>(null);

// ============================================================================
// Storage Keys
// ============================================================================

const SIDEBAR_EXPANDED_SECTIONS_KEY = "hedwiq-sidebar-expanded-sections";

// ============================================================================
// Provider
// ============================================================================

interface SidebarProviderProps {
  children: ReactNode;
  initialFolders?: Folder[];
}

export function SidebarProvider({
  children,
  initialFolders = [],
}: SidebarProviderProps) {
  // ---------------------------------------------------------------------------
  // Sidebar UI State
  // ---------------------------------------------------------------------------

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(["past-meetings"])
  );

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    try {
      const savedExpanded = localStorage.getItem(SIDEBAR_EXPANDED_SECTIONS_KEY);
      if (savedExpanded) {
        const parsed = JSON.parse(savedExpanded);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setExpandedSections(new Set(parsed));
        }
      }
    } catch (err) {
      console.error("Failed to load sidebar state:", err);
    }
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      // Persist to localStorage
      try {
        localStorage.setItem(
          SIDEBAR_EXPANDED_SECTIONS_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch (err) {
        console.error("Failed to save sidebar expanded sections:", err);
      }

      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Folders State
  // ---------------------------------------------------------------------------

  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  // Fix: Only show loading if we need to fetch (no initial folders AND not yet loaded)
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  // Track if initial fetch has been done
  const initialFetchDone = useRef(initialFolders.length > 0);
  // Ref for current folders to avoid stale closures in reorderFolders
  const foldersRef = useRef<Folder[]>(initialFolders);

  // Compute default folder ID
  const defaultFolderId = useMemo(() => {
    const defaultFolder = folders.find((f) => f.isDefault);
    return defaultFolder?.id ?? null;
  }, [folders]);

  // Fetch folders
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

  // Keep foldersRef in sync with folders state
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  // Fetch folders on mount if not provided
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      refreshFolders();
    }
  }, [refreshFolders]);

  // ---------------------------------------------------------------------------
  // Folder Actions
  // ---------------------------------------------------------------------------

  const createFolder = useCallback(
    async (name: string, color?: string): Promise<Folder | null> => {
      try {
        const response = await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create folder");
        }

        const data = await response.json();
        const newFolder = data.folder as Folder;

        // Update local state
        setFolders((prev) => [...prev, newFolder]);

        return newFolder;
      } catch (err) {
        console.error("Failed to create folder:", err);
        setFoldersError(
          err instanceof Error ? err.message : "Failed to create folder"
        );
        return null;
      }
    },
    []
  );

  const updateFolder = useCallback(
    async (
      id: string,
      updates: { name?: string; color?: string | null }
    ): Promise<Folder | null> => {
      try {
        const response = await fetch(`/api/folders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update folder");
        }

        const data = await response.json();
        const updatedFolder = data.folder as Folder;

        // Update local state
        setFolders((prev) =>
          prev.map((f) => (f.id === id ? updatedFolder : f))
        );

        return updatedFolder;
      } catch (err) {
        console.error("Failed to update folder:", err);
        setFoldersError(
          err instanceof Error ? err.message : "Failed to update folder"
        );
        return null;
      }
    },
    []
  );

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/folders/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete folder");
      }

      // Update local state - remove the deleted folder
      setFolders((prev) => prev.filter((f) => f.id !== id));

      return true;
    } catch (err) {
      console.error("Failed to delete folder:", err);
      setFoldersError(
        err instanceof Error ? err.message : "Failed to delete folder"
      );
      return false;
    }
  }, []);

  const reorderFolders = useCallback(
    async (folderIds: string[]): Promise<boolean> => {
      // Use ref to get current folders (avoid stale closure)
      const currentFolders = foldersRef.current;
      const originalFolders = currentFolders;

      // Build a map for O(1) lookup instead of O(n) .find() calls
      const folderMap = new Map(currentFolders.map((f) => [f.id, f]));

      // Optimistic update with O(n) complexity
      const reorderedFolders = folderIds
        .map((id, index) => {
          const folder = folderMap.get(id);
          return folder ? { ...folder, orderIndex: index } : null;
        })
        .filter((f): f is Folder => f !== null);

      setFolders(reorderedFolders);

      try {
        const response = await fetch("/api/folders/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderIds }),
        });

        if (!response.ok) {
          // Revert on failure
          setFolders(originalFolders);
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to reorder folders");
        }

        return true;
      } catch (err) {
        console.error("Failed to reorder folders:", err);
        setFolders(originalFolders);
        setFoldersError(
          err instanceof Error ? err.message : "Failed to reorder folders"
        );
        return false;
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo<SidebarContextValue>(
    () => ({
      // Sidebar UI
      expandedSections,
      toggleSection,

      // Folders
      folders,
      foldersLoading,
      foldersError,
      refreshFolders,

      // Folder Actions
      createFolder,
      updateFolder,
      deleteFolder,
      reorderFolders,

      // Helper
      defaultFolderId,
    }),
    [
      expandedSections,
      toggleSection,
      folders,
      foldersLoading,
      foldersError,
      refreshFolders,
      createFolder,
      updateFolder,
      deleteFolder,
      reorderFolders,
      defaultFolderId,
    ]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebarContext must be used within a SidebarProvider");
  }
  return context;
}
