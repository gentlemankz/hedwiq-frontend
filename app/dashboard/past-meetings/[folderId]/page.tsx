"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PastMeetingsList } from "@/components/meetings";
import { FolderColorDot } from "@/components/folders";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { Pencil, Trash2, Loader2, FolderClosed } from "lucide-react";
import { FOLDER_COLORS, FOLDER_LIMITS } from "@/types/folder";

export default function FolderPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.folderId as string;

  const { folders, updateFolder, deleteFolder, refreshFolders, foldersLoading } =
    useSidebarContext();

  // Find the current folder
  const folder = useMemo(
    () => folders.find((f) => f.id === folderId),
    [folders, folderId]
  );

  // Edit dialog state - initialize empty, sync when opening dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(FOLDER_COLORS[0].value);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenEditDialog = () => {
    if (folder) {
      setEditName(folder.name);
      setEditColor(folder.color || FOLDER_COLORS[0].value);
      setEditError(null);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdateFolder = async () => {
    if (!editName.trim()) {
      setEditError("Folder name is required");
      return;
    }

    if (editName.trim().length > FOLDER_LIMITS.MAX_NAME_LENGTH) {
      setEditError(
        `Folder name must be ${FOLDER_LIMITS.MAX_NAME_LENGTH} characters or less`
      );
      return;
    }

    setIsEditing(true);
    setEditError(null);

    const updated = await updateFolder(folderId, {
      name: editName.trim(),
      color: editColor,
    });

    setIsEditing(false);

    if (updated) {
      setIsEditDialogOpen(false);
      refreshFolders();
    } else {
      setEditError("Failed to update folder. Please try again.");
    }
  };

  const handleDeleteFolder = async () => {
    setIsDeleting(true);

    const success = await deleteFolder(folderId);

    setIsDeleting(false);

    if (success) {
      setIsDeleteDialogOpen(false);
      router.push("/dashboard/past-meetings");
    }
  };

  // Loading state
  if (foldersLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Folder not found
  if (!folder) {
    return (
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderClosed className="size-12 text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-semibold mb-2">Folder Not Found</h2>
              <p className="text-sm text-muted-foreground mb-4">
                This folder may have been deleted or you don&apos;t have access
                to it.
              </p>
              <Button asChild>
                <Link href="/dashboard/past-meetings">Back to All Meetings</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/past-meetings">
                Past Meetings
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-2">
                <FolderColorDot color={folder.color} size="xs" />
                {folder.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderColorDot color={folder.color} size="md" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{folder.name}</h1>
              <p className="text-muted-foreground">
                {folder.meetingCount ?? 0} meeting
                {folder.meetingCount !== 1 ? "s" : ""} in this folder
              </p>
            </div>
          </div>
          {!folder.isDefault && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleOpenEditDialog}>
                <Pencil className="mr-2 size-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Meetings List */}
        <Card>
          <CardHeader>
            <CardTitle>Meetings</CardTitle>
            <CardDescription>
              All meetings in the &quot;{folder.name}&quot; folder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PastMeetingsList
              pageSize={10}
              folderId={folderId}
              emptyMessage={`No meetings in "${folder.name}" yet. Meetings will appear here after they end.`}
              folders={folders}
              foldersLoading={foldersLoading}
              onFoldersRefresh={refreshFolders}
            />
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Folder</DialogTitle>
              <DialogDescription>
                Update the folder name and color.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="editFolderName">Folder Name</Label>
                <Input
                  id="editFolderName"
                  placeholder="e.g., Project Alpha"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isEditing) {
                      handleUpdateFolder();
                    }
                  }}
                  maxLength={FOLDER_LIMITS.MAX_NAME_LENGTH}
                />
                {editError && (
                  <p className="text-sm text-destructive">{editError}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editFolderColor">Color</Label>
                <Select value={editColor} onValueChange={setEditColor}>
                  <SelectTrigger id="editFolderColor">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <FolderColorDot color={editColor} />
                        {FOLDER_COLORS.find((c) => c.value === editColor)
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
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateFolder} disabled={isEditing}>
                {isEditing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the &quot;{folder.name}&quot;
                folder? All meetings in this folder will be moved to the General
                folder. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteFolder}
                disabled={isDeleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Folder"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
