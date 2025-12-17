"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PastMeetingsList } from "@/components/meetings";
import { FolderColorDot, EditFolderDialog, DeleteFolderDialog } from "@/components/folders";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { FolderClosed, Plus, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { FOLDER_COLORS, FOLDER_LIMITS, type Folder } from "@/types/folder";

function PastMeetingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { folders, createFolder, updateFolder, deleteFolder, refreshFolders, foldersLoading } =
    useSidebarContext();

  // New folder dialog state
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(
    searchParams.get("newFolder") === "true"
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState<string>(FOLDER_COLORS[0].value);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Edit/Delete folder dialog state
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setFolderError("Folder name is required");
      return;
    }

    if (newFolderName.trim().length > FOLDER_LIMITS.MAX_NAME_LENGTH) {
      setFolderError(
        `Folder name must be ${FOLDER_LIMITS.MAX_NAME_LENGTH} characters or less`
      );
      return;
    }

    setIsCreatingFolder(true);
    setFolderError(null);

    const folder = await createFolder(newFolderName.trim(), newFolderColor);

    setIsCreatingFolder(false);

    if (folder) {
      setIsNewFolderDialogOpen(false);
      setNewFolderName("");
      setNewFolderColor(FOLDER_COLORS[0].value);
      // Clean up URL params
      router.replace("/dashboard/past-meetings", { scroll: false });
      // Context's createFolder already updates local state
    } else {
      setFolderError("Failed to create folder. Please try again.");
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsNewFolderDialogOpen(open);
    if (!open) {
      setNewFolderName("");
      setNewFolderColor(FOLDER_COLORS[0].value);
      setFolderError(null);
      // Clean up URL params
      if (searchParams.get("newFolder")) {
        router.replace("/dashboard/past-meetings", { scroll: false });
      }
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Past Meetings</h1>
            <p className="text-muted-foreground">
              View transcriptions, insights, and notes from your previous
              meetings
            </p>
          </div>
          <Button onClick={() => setIsNewFolderDialogOpen(true)} className="gap-2">
            <Plus className="size-4" />
            New Folder
          </Button>
        </div>

        {/* Folders Overview */}
        {!foldersLoading && folders.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((folder) => (
              <Card
                key={folder.id}
                className="group relative cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() =>
                  router.push(`/dashboard/past-meetings/${folder.id}`)
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderColorDot color={folder.color} />
                    <span className="flex-1 truncate">{folder.name}</span>
                    {folder.isDefault && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Default
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {folder.meetingCount ?? 0} meeting
                    {folder.meetingCount !== 1 ? "s" : ""}
                  </p>
                </CardContent>
                {/* Folder Actions Dropdown */}
                {!folder.isDefault && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder(folder);
                        }}
                      >
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingFolder(folder);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* All Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderClosed className="size-5" />
              All Meetings
            </CardTitle>
            <CardDescription>
              All your past meetings across all folders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PastMeetingsList
              pageSize={10}
              emptyMessage="No past meetings yet. Start a meeting to see it here after it ends."
              folders={folders}
              foldersLoading={foldersLoading}
              onFoldersRefresh={refreshFolders}
            />
          </CardContent>
        </Card>

        {/* New Folder Dialog */}
        <Dialog open={isNewFolderDialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <DialogDescription>
                Organize your meetings into folders for easier access.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="folderName">Folder Name</Label>
                <Input
                  id="folderName"
                  placeholder="e.g., Project Alpha"
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value);
                    setFolderError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isCreatingFolder) {
                      handleCreateFolder();
                    }
                  }}
                  maxLength={FOLDER_LIMITS.MAX_NAME_LENGTH}
                />
                {folderError && (
                  <p className="text-sm text-destructive">{folderError}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="folderColor">Color</Label>
                <Select
                  value={newFolderColor}
                  onValueChange={setNewFolderColor}
                >
                  <SelectTrigger id="folderColor">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <FolderColorDot color={newFolderColor} />
                        {FOLDER_COLORS.find((c) => c.value === newFolderColor)
                          ?.name || "Select color"}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FOLDER_COLORS.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <FolderColorDot color={color.value} />
                          {color.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={isCreatingFolder}>
                {isCreatingFolder ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Folder"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Folder Dialog */}
        {editingFolder && (
          <EditFolderDialog
            open={!!editingFolder}
            onOpenChange={(open) => !open && setEditingFolder(null)}
            folder={editingFolder}
            updateFolder={updateFolder}
            onFolderUpdated={() => {
              // Context's updateFolder already updates local state
              setEditingFolder(null);
            }}
          />
        )}

        {/* Delete Folder Dialog */}
        {deletingFolder && (
          <DeleteFolderDialog
            open={!!deletingFolder}
            onOpenChange={(open) => !open && setDeletingFolder(null)}
            folder={deletingFolder}
            deleteFolder={deleteFolder}
            onFolderDeleted={() => {
              // Context's deleteFolder already updates local state
              setDeletingFolder(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams (Next.js 13+ requirement)
export default function PastMeetingsPage() {
  return (
    <Suspense fallback={<PastMeetingsPageSkeleton />}>
      <PastMeetingsContent />
    </Suspense>
  );
}

function PastMeetingsPageSkeleton() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Folders grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        {/* Meetings card skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
