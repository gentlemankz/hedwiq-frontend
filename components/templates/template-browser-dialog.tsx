"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplates } from "@/hooks/use-templates";
import { useSession } from "@/lib/auth-client";
import { categoryIcons } from "@/lib/templates/category-icons";
import {
  Search,
  FileText,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Clock,
  ListChecks,
  Calendar,
  User,
  Users,
  Building,
  Check,
  Archive,
} from "lucide-react";
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateScope,
  type TemplateWithItems,
} from "@/types/template";

// ============================================================================
// Types
// ============================================================================

type FilterScope = TemplateScope | "all";

interface TemplateBrowserDialogProps {
  /** Whether the dialog is open */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Trigger element (if not using controlled mode) */
  trigger?: React.ReactNode;
  /** Callback when a template is selected */
  onSelect?: (template: TemplateWithItems) => void;
  /** Callback when user wants to create a new template */
  onCreate?: () => void;
  /** Callback when user wants to edit a template */
  onEdit?: (template: TemplateWithItems) => void;
  /** Callback when user wants to duplicate a template */
  onDuplicate?: (template: TemplateWithItems) => void;
  /** Callback when user wants to delete a template */
  onDelete?: (template: TemplateWithItems) => void;
  /** Currently selected template ID */
  selectedTemplateId?: string | null;
  /** Whether to show actions (edit, duplicate, delete) */
  showActions?: boolean;
  /** Whether to show create button */
  showCreateButton?: boolean;
  /** Dialog title */
  title?: string;
  /** Dialog description */
  description?: string;
}

// ============================================================================
// Scope icons
// ============================================================================

const scopeIcons: Record<TemplateScope, React.ReactNode> = {
  system: <Building className="size-3.5" />,
  team: <Users className="size-3.5" />,
  personal: <User className="size-3.5" />,
};

const scopeLabels: Record<TemplateScope, string> = {
  system: "System",
  team: "Team",
  personal: "Personal",
};

// ============================================================================
// Component
// ============================================================================

export function TemplateBrowserDialog({
  open,
  onOpenChange,
  trigger,
  onSelect,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  selectedTemplateId,
  showActions = true,
  showCreateButton = true,
  title = "Browse Templates",
  description = "Select a template to use or manage your templates",
}: TemplateBrowserDialogProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [scopeFilter, setScopeFilter] = useState<FilterScope>("all");
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [deleteTemplate, setDeleteTemplate] = useState<TemplateWithItems | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch templates
  const { templates, isLoading, error, refetch } = useTemplates({
    scope: scopeFilter === "all" ? undefined : scopeFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    search: debouncedSearchQuery || undefined,
    sortBy: "usageCount",
    sortOrder: "desc",
  });

  // Group templates by scope
  const groupedTemplates = useMemo(() => {
    if (scopeFilter !== "all") {
      return { [scopeFilter]: templates };
    }

    const groups: Partial<Record<TemplateScope, TemplateWithItems[]>> = {};
    for (const template of templates) {
      if (!groups[template.scope]) {
        groups[template.scope] = [];
      }
      groups[template.scope]!.push(template);
    }
    return groups;
  }, [templates, scopeFilter]);

  // Handle template selection
  const handleSelect = useCallback(
    (template: TemplateWithItems) => {
      onSelect?.(template);
    },
    [onSelect]
  );

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTemplate || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteTemplate);
      refetch();
    } finally {
      setIsDeleting(false);
      setDeleteTemplate(null);
    }
  }, [deleteTemplate, onDelete, refetch]);

  // Check if user can edit/delete a template
  const canModifyTemplate = useCallback((template: TemplateWithItems) => {
    // System templates cannot be modified
    if (template.scope === "system") return false;

    // Personal templates can only be modified by their creator
    if (template.scope === "personal") {
      return template.createdBy === currentUserId;
    }

    // Team templates can be modified by team members (server validates this)
    // For UI purposes, we allow the action and let the server handle authorization
    return true;
  }, [currentUserId]);

  // Order for displaying scope groups
  const scopeOrder: TemplateScope[] = ["system", "team", "personal"];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {showCreateButton && onCreate && (
                <Button onClick={onCreate} className="shrink-0">
                  <Plus className="mr-2 size-4" />
                  New Template
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Scope filter */}
            <Tabs
              value={scopeFilter}
              onValueChange={(v) => setScopeFilter(v as FilterScope)}
            >
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="system" className="gap-1 text-xs">
                  {scopeIcons.system}
                  <span className="hidden sm:inline">System</span>
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-1 text-xs">
                  {scopeIcons.team}
                  <span className="hidden sm:inline">Team</span>
                </TabsTrigger>
                <TabsTrigger value="personal" className="gap-1 text-xs">
                  {scopeIcons.personal}
                  <span className="hidden sm:inline">Personal</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Category filter */}
          <Tabs
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as TemplateCategory | "all")}
          >
            <TabsList className="h-9 w-full justify-start overflow-x-auto">
              <TabsTrigger value="all" className="text-xs">
                All Categories
              </TabsTrigger>
              {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => (
                <TabsTrigger key={cat} value={cat} className="gap-1 text-xs shrink-0">
                  {categoryIcons[cat]}
                  <span className="hidden md:inline">{TEMPLATE_CATEGORIES[cat].label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Templates list */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {/* Loading */}
            {isLoading && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
              </div>
            )}

            {/* Error */}
            {error && !isLoading && (
              <Empty>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>Failed to load templates</EmptyTitle>
                  <EmptyDescription>{error}</EmptyDescription>
                </EmptyHeader>
                <Button onClick={() => refetch()} variant="outline" size="sm">
                  Try Again
                </Button>
              </Empty>
            )}

            {/* Empty */}
            {!isLoading && !error && templates.length === 0 && (
              <Empty>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No templates found</EmptyTitle>
                  <EmptyDescription>
                    {searchQuery
                      ? "Try adjusting your search or filters"
                      : "Create your first template to get started"}
                  </EmptyDescription>
                </EmptyHeader>
                {showCreateButton && onCreate && (
                  <Button onClick={onCreate} variant="outline" size="sm">
                    <Plus className="mr-2 size-4" />
                    Create Template
                  </Button>
                )}
              </Empty>
            )}

            {/* Templates by scope */}
            {!isLoading && !error && templates.length > 0 && (
              <div className="space-y-6 pb-4">
                {scopeOrder.map((scope) => {
                  const scopeTemplates = groupedTemplates[scope];
                  if (!scopeTemplates?.length) return null;

                  return (
                    <div key={scope}>
                      {scopeFilter === "all" && (
                        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                          {scopeIcons[scope]}
                          {scopeLabels[scope]} Templates
                          <span className="text-xs">({scopeTemplates.length})</span>
                        </div>
                      )}
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {scopeTemplates.map((template) => (
                          <TemplateListItem
                            key={template.id}
                            template={template}
                            isSelected={selectedTemplateId === template.id}
                            onSelect={handleSelect}
                            onEdit={canModifyTemplate(template) && onEdit ? onEdit : undefined}
                            onDuplicate={onDuplicate}
                            onDelete={canModifyTemplate(template) && onDelete ? () => setDeleteTemplate(template) : undefined}
                            showActions={showActions}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTemplate} onOpenChange={(open) => !open && setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTemplate?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Template List Item
// ============================================================================

interface TemplateListItemProps {
  template: TemplateWithItems;
  isSelected?: boolean;
  onSelect?: (template: TemplateWithItems) => void;
  onEdit?: (template: TemplateWithItems) => void;
  onDuplicate?: (template: TemplateWithItems) => void;
  onDelete?: () => void;
  showActions?: boolean;
}

function TemplateListItem({
  template,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  showActions,
}: TemplateListItemProps) {
  const categoryInfo = TEMPLATE_CATEGORIES[template.category];
  const agendaItemCount = template.agendaItems?.length ?? 0;
  const hasActions = showActions && (onEdit || onDuplicate || onDelete);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-lg border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-sm",
        isSelected && "border-primary ring-2 ring-primary/20",
        onSelect && "cursor-pointer"
      )}
      onClick={() => onSelect?.(template)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(template);
        }
      }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-pressed={isSelected}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <Badge variant="secondary" className="gap-1 shrink-0">
          {categoryIcons[template.category]}
          {categoryInfo.label}
        </Badge>
        {template.isArchived && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Archive className="size-3" />
            Archived
          </Badge>
        )}
      </div>

      {/* Title and description */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate pr-8">{template.name}</p>
        {template.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {template.description}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {template.defaultDuration} min
          </span>
          {agendaItemCount > 0 && (
            <span className="flex items-center gap-1">
              <ListChecks className="size-3" />
              {agendaItemCount}
            </span>
          )}
          {template.suggestedCadence && (
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              <span className="capitalize truncate max-w-[60px]">
                {template.suggestedCadence.replace("-", " ")}
              </span>
            </span>
          )}
        </div>

        {/* Actions */}
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(template)}>
                  <Pencil className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={() => onDuplicate(template)}>
                  <Copy className="mr-2 size-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {(onEdit || onDuplicate) && onDelete && <DropdownMenuSeparator />}
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Hook for template browser state
// ============================================================================

export interface UseTemplateBrowserOptions {
  /** Callback when template is deleted */
  onDeleted?: (templateId: string) => void;
}

export function useTemplateBrowser({ onDeleted }: UseTemplateBrowserOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDelete = useCallback(
    async (template: TemplateWithItems) => {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to delete template" }));
        throw new Error(error.error || "Failed to delete template");
      }

      onDeleted?.(template.id);
    },
    [onDeleted]
  );

  const handleDuplicate = useCallback(async (template: TemplateWithItems) => {
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/templates/${template.id}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to duplicate template" }));
        throw new Error(error.error || "Failed to duplicate template");
      }

      const result = await response.json();
      return result.template as TemplateWithItems;
    } finally {
      setIsDuplicating(false);
    }
  }, []);

  return {
    isOpen,
    setIsOpen,
    isDuplicating,
    handleDelete,
    handleDuplicate,
  };
}
