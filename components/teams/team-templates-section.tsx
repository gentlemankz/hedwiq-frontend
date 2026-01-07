"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useTemplates } from "@/hooks/use-templates";
import { TemplateEditor, useTemplateEditor } from "@/components/templates";
import {
  FileText,
  Plus,
  Clock,
  ListChecks,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { TemplateWithItems } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { categoryIcons } from "@/lib/templates/category-icons";
import type { Team } from "@/types/team";

interface TeamTemplatesSectionProps {
  team: Team;
  canManageTemplates: boolean;
}

export function TeamTemplatesSection({
  team,
  canManageTemplates,
}: TeamTemplatesSectionProps) {
  // Fetch team templates
  const {
    templates,
    isLoading,
    error,
    refetch: refetchTemplates,
  } = useTemplates({
    scope: "team",
    teamId: team.id,
  });

  // Mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Dialog states
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithItems | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateWithItems | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Template editor hook
  const templateEditor = useTemplateEditor({
    template: editingTemplate || undefined,
    onSuccess: () => {
      refetchTemplates();
      setEditorDialogOpen(false);
      setEditingTemplate(null);
    },
  });

  // Handle create new template
  const handleCreateNew = useCallback(() => {
    setEditingTemplate(null);
    setEditorDialogOpen(true);
  }, []);

  // Handle edit template
  const handleEdit = useCallback((template: TemplateWithItems) => {
    setEditingTemplate(template);
    setEditorDialogOpen(true);
  }, []);

  // Handle delete request
  const handleDeleteRequest = useCallback((template: TemplateWithItems) => {
    setDeletingTemplate(template);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }, []);

  // Handle confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTemplate) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete template");
      }

      await refetchTemplates();
      if (mountedRef.current) {
        setDeleteDialogOpen(false);
        setDeletingTemplate(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = error instanceof Error ? error.message : "Failed to delete template";
        setDeleteError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsDeleting(false);
      }
    }
  }, [deletingTemplate, refetchTemplates]);

  // Handle dialog close
  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setEditorDialogOpen(false);
      setEditingTemplate(null);
    }
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-5" />
                Team Templates
              </CardTitle>
              <CardDescription>
                {templates.length} template{templates.length !== 1 ? "s" : ""} shared with this team
              </CardDescription>
            </div>
            {canManageTemplates && (
              <Button size="sm" onClick={handleCreateNew}>
                <Plus className="mr-2 size-4" />
                Create Template
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <Empty>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Failed to load templates</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* Empty State */}
          {!isLoading && !error && templates.length === 0 && (
            <Empty>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No team templates yet</EmptyTitle>
                <EmptyDescription>
                  {canManageTemplates
                    ? "Create templates to share with your team members."
                    : "No templates have been created for this team yet."}
                </EmptyDescription>
              </EmptyHeader>
              {canManageTemplates && (
                <Button onClick={handleCreateNew} className="mt-4">
                  <Plus className="mr-2 size-4" />
                  Create First Template
                </Button>
              )}
            </Empty>
          )}

          {/* Templates Grid */}
          {!isLoading && !error && templates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {templates.map((template) => (
                <TeamTemplateCard
                  key={template.id}
                  template={template}
                  canManage={canManageTemplates}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Editor Dialog */}
      <Dialog open={editorDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Team Template" : "Create Team Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update this template for your team."
                : "Create a new template to share with your team members."}
            </DialogDescription>
          </DialogHeader>
          <TemplateEditor
            template={editingTemplate || undefined}
            teams={[{ id: team.id, name: team.name }]}
            onSubmit={templateEditor.handleSubmit}
            onBack={() => handleDialogClose(false)}
            isLoading={templateEditor.isLoading}
            serverError={templateEditor.serverError}
            defaultScope="team"
            defaultTeamId={team.id}
            hideBackButton
            hideScopeSelector
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingTemplate?.name}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Team Template Card Component
// ============================================================================

interface TeamTemplateCardProps {
  template: TemplateWithItems;
  canManage: boolean;
  onEdit: (template: TemplateWithItems) => void;
  onDelete: (template: TemplateWithItems) => void;
}

function TeamTemplateCard({
  template,
  canManage,
  onEdit,
  onDelete,
}: TeamTemplateCardProps) {
  const categoryInfo = TEMPLATE_CATEGORIES[template.category];
  const agendaItemCount = template.agendaItems?.length ?? 0;

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="gap-1 text-xs">
                {categoryIcons[template.category]}
                {categoryInfo.label}
              </Badge>
            </div>
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
            {template.description && (
              <CardDescription className="line-clamp-2 mt-1">
                {template.description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="size-3.5" />
              <span>{template.defaultDuration} min</span>
            </div>
            <div className="flex items-center gap-1">
              <ListChecks className="size-3.5" />
              <span>{agendaItemCount} items</span>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onEdit(template)}
                aria-label={`Edit template "${template.name}"`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(template)}
                aria-label={`Delete template "${template.name}"`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
