"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplates } from "@/hooks/use-templates";
import { useSession } from "@/lib/auth-client";
import { categoryIconComponents, categoryColors } from "@/lib/templates/category-icons";
import {
  Search,
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
  LayoutGrid,
  SearchX,
  AlertCircle,
  X,
  Loader2,
  Sparkles,
  FolderOpen,
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

  // Reference to search input for focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-xl">{title}</DialogTitle>
                <DialogDescription className="text-sm">{description}</DialogDescription>
              </div>
              {showCreateButton && onCreate && (
                <Button onClick={onCreate} size="sm" className="shrink-0 gap-2">
                  <Plus className="size-4" />
                  New Template
                </Button>
              )}
            </div>

            {/* Search and Filters */}
            <div className="mt-5 space-y-4">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search by name, description, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-background border-muted-foreground/20 focus-visible:ring-primary/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                )}
                {isLoading && searchQuery && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Scope filter tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "system", "team", "personal"] as FilterScope[]).map((scope) => {
                  const isActive = scopeFilter === scope;
                  const icon = scope === "all" ? <LayoutGrid className="size-4" /> : scopeIcons[scope as TemplateScope];
                  const label = scope === "all" ? "All" : scopeLabels[scope as TemplateScope];

                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setScopeFilter(scope)}
                      className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5"
                      )}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category filter pills */}
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground mr-1">Categories:</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setCategoryFilter("all")}
                        className={cn(
                          "inline-flex items-center justify-center size-9 rounded-lg transition-all duration-200",
                          categoryFilter === "all"
                            ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                            : "bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5"
                        )}
                      >
                        <LayoutGrid className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>All Categories</p>
                    </TooltipContent>
                  </Tooltip>

                  <div className="w-px h-6 bg-border mx-1" />

                  {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => {
                    const Icon = categoryIconComponents[cat];
                    const colors = categoryColors[cat];
                    const isActive = categoryFilter === cat;
                    const catInfo = TEMPLATE_CATEGORIES[cat];

                    return (
                      <Tooltip key={cat}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setCategoryFilter(cat)}
                            className={cn(
                              "inline-flex items-center justify-center size-9 rounded-lg transition-all duration-200 border",
                              isActive
                                ? cn(colors.bg, colors.text, colors.border, "shadow-sm ring-2 ring-offset-1", colors.border.replace("border-", "ring-").replace("dark:", ""))
                                : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:bg-muted"
                            )}
                          >
                            <Icon className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{catInfo.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>
          </div>

          {/* Templates list */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">
              {/* Loading */}
              {isLoading && (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <TemplateCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {/* Error */}
              {error && !isLoading && (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-destructive/20 bg-destructive/5 py-16 text-center">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-5">
                    <AlertCircle className="size-8 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-destructive">Failed to load templates</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm">{error}</p>
                  <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-5 gap-2">
                    <Loader2 className="size-4" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* Empty */}
              {!isLoading && !error && templates.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-gradient-to-b from-muted/30 to-muted/10 py-16 text-center">
                  <div className="relative mb-5">
                    <div className="flex size-20 items-center justify-center rounded-2xl bg-muted shadow-sm">
                      {searchQuery ? (
                        <SearchX className="size-10 text-muted-foreground/70" />
                      ) : (
                        <FolderOpen className="size-10 text-muted-foreground/70" />
                      )}
                    </div>
                    {!searchQuery && (
                      <div className="absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Sparkles className="size-4" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold">
                    {searchQuery ? "No matching templates" : "No templates yet"}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                    {searchQuery
                      ? `No templates found matching "${searchQuery}". Try a different search term or browse all categories.`
                      : "Create your first template to streamline your meetings and save time."}
                  </p>
                  {searchQuery ? (
                    <Button onClick={handleClearSearch} variant="outline" size="sm" className="mt-5 gap-2">
                      <X className="size-4" />
                      Clear Search
                    </Button>
                  ) : showCreateButton && onCreate ? (
                    <Button onClick={onCreate} size="sm" className="mt-5 gap-2">
                      <Plus className="size-4" />
                      Create Your First Template
                    </Button>
                  ) : null}
                </div>
              )}

              {/* Templates by scope */}
              {!isLoading && !error && templates.length > 0 && (
                <div className="space-y-8">
                  {scopeOrder.map((scope) => {
                    const scopeTemplates = groupedTemplates[scope];
                    if (!scopeTemplates?.length) return null;

                    return (
                      <div key={scope}>
                        {scopeFilter === "all" && (
                          <div className="flex items-center gap-2 mb-4">
                            <div className={cn(
                              "flex items-center justify-center size-7 rounded-lg",
                              scope === "system" && "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
                              scope === "team" && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
                              scope === "personal" && "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                            )}>
                              {scopeIcons[scope]}
                            </div>
                            <span className="text-sm font-semibold">{scopeLabels[scope]} Templates</span>
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {scopeTemplates.length}
                            </Badge>
                          </div>
                        )}
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
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
            </div>
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
// Template Card Skeleton
// ============================================================================

function TemplateCardSkeleton() {
  return (
    <div className="relative flex flex-col rounded-xl border bg-card p-4 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      {/* Title and description */}
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
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
  const colors = categoryColors[template.category];
  const CategoryIcon = categoryIconComponents[template.category];
  const agendaItemCount = template.agendaItems?.length ?? 0;
  const hasActions = showActions && (onEdit || onDuplicate || onDelete);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card p-4 transition-all duration-200",
        "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5",
        isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5",
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
        <div className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-3.5" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <div className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border",
          colors.bg, colors.text, colors.border
        )}>
          <CategoryIcon className="size-3.5" />
          {categoryInfo.label}
        </div>
        {template.isArchived && (
          <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
            <Archive className="size-3" />
            Archived
          </Badge>
        )}
      </div>

      {/* Title and description */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[15px] truncate pr-8 group-hover:text-primary transition-colors">
          {template.name}
        </p>
        {template.description ? (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
            {template.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic mt-1">
            No description
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/60">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
            <Clock className="size-3.5" />
            {template.defaultDuration} min
          </span>
          {agendaItemCount > 0 && (
            <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <ListChecks className="size-3.5" />
              {agendaItemCount} {agendaItemCount === 1 ? "item" : "items"}
            </span>
          )}
          {template.suggestedCadence && (
            <span className="hidden sm:flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <Calendar className="size-3.5" />
              <span className="capitalize">
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
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
