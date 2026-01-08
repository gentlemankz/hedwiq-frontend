"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TemplateCard } from "./template-card";
import { useTemplates } from "@/hooks/use-templates";
import { Search, FileText, Users, LayoutGrid, PenLine, Check, SearchX } from "lucide-react";
import type { TemplateWithItems, TemplateCategory } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { categoryIcons, categoryColors, categoryIconComponents } from "@/lib/templates/category-icons";

type FilterCategory = TemplateCategory | "all";

interface TemplatePickerProps {
  selectedTemplateId?: string | null;
  onSelectTemplate: (template: TemplateWithItems | null) => void;
  showScratchOption?: boolean;
  compact?: boolean;
  className?: string;
}

export function TemplatePicker({
  selectedTemplateId,
  onSelectTemplate,
  showScratchOption = true,
  compact = false,
  className,
}: TemplatePickerProps) {
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { templates, isLoading, error } = useTemplates({
    category: categoryFilter === "all" ? undefined : categoryFilter,
    search: debouncedSearch || undefined,
    sortBy: "usageCount",
    sortOrder: "desc",
  });

  // Separate team templates from other templates
  const { teamTemplates, otherTemplates } = useMemo(() => {
    const team: TemplateWithItems[] = [];
    const other: TemplateWithItems[] = [];

    for (const template of templates) {
      if (template.scope === "team") {
        team.push(template);
      } else {
        other.push(template);
      }
    }

    return { teamTemplates: team, otherTemplates: other };
  }, [templates]);

  // Group non-team templates by category for better organization
  const groupedTemplates = useMemo(() => {
    if (categoryFilter !== "all") {
      return { [categoryFilter]: otherTemplates };
    }

    const groups: Partial<Record<TemplateCategory, TemplateWithItems[]>> = {};
    for (const template of otherTemplates) {
      if (!groups[template.category]) {
        groups[template.category] = [];
      }
      groups[template.category]!.push(template);
    }
    return groups;
  }, [otherTemplates, categoryFilter]);

  const handleSelectTemplate = (template: TemplateWithItems) => {
    if (selectedTemplateId === template.id) {
      onSelectTemplate(null);
    } else {
      onSelectTemplate(template);
    }
  };

  const handleSelectScratch = () => {
    onSelectTemplate(null);
  };

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-4", className)}>
      {/* Search and Category Filter - Combined row in compact mode */}
      <div className={cn("flex items-center gap-2", compact ? "flex-wrap" : "flex-col gap-4")}>
        {/* Search */}
        <div className={cn("relative", compact ? "w-28 shrink-0" : "w-full")}>
          <Search className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground", compact ? "size-3.5" : "size-4")} />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(compact ? "h-8 pl-8 text-xs" : "pl-9")}
          />
        </div>

        {/* Category Filter Pills - Horizontal scroll in compact mode */}
        <div className={cn(
          compact
            ? "flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none"
            : "flex flex-wrap gap-2 w-full"
        )}>
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium transition-all whitespace-nowrap",
              compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm gap-1.5",
              categoryFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <LayoutGrid className={cn(compact ? "size-3" : "size-3.5")} />
            All
          </button>
          {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => {
            const Icon = categoryIconComponents[cat];
            const colors = categoryColors[cat];
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "inline-flex items-center rounded-full font-medium transition-all border whitespace-nowrap",
                  compact ? "px-2 py-1 text-xs gap-1" : "px-3 py-1.5 text-sm gap-1.5",
                  isActive
                    ? cn(colors.bg, colors.text, colors.border, "shadow-sm")
                    : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn(compact ? "size-3" : "size-3.5")} />
                {compact ? null : <span className="hidden xs:inline sm:inline">{TEMPLATE_CATEGORIES[cat].label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={cn("grid", compact ? "grid-cols-1 gap-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")}>
          {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
            <Skeleton key={i} className={cn(compact ? "h-14 rounded-lg" : "h-40 rounded-xl")} />
          ))}
        </div>
      )}

      {/* Templates Grid */}
      {!isLoading && (
        <div className={cn(compact ? "space-y-3" : "space-y-6")}>
          {/* Start from scratch option - show when no search OR when there's an error (so users aren't blocked) */}
          {showScratchOption && categoryFilter === "all" && (!debouncedSearch || error) && (
            <div
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-lg border-2 border-dashed transition-all duration-150",
                compact ? "p-2.5" : "p-4",
                selectedTemplateId === null
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              )}
              onClick={handleSelectScratch}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectScratch();
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={selectedTemplateId === null}
            >
              <div className={cn("flex items-center", compact ? "gap-3" : "gap-4")}>
                <div className={cn(
                  "flex items-center justify-center rounded-lg transition-colors",
                  compact ? "size-8" : "size-12 rounded-xl",
                  selectedTemplateId === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted group-hover:bg-primary/10"
                )}>
                  <PenLine className={cn(
                    "transition-colors",
                    compact ? "size-4" : "size-6",
                    selectedTemplateId === null ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-medium transition-colors",
                    compact ? "text-sm" : "font-semibold",
                    selectedTemplateId === null ? "text-primary" : "group-hover:text-foreground"
                  )}>
                    Start from scratch
                  </p>
                  {!compact && (
                    <p className="text-sm text-muted-foreground">
                      Create a custom meeting with your own agenda
                    </p>
                  )}
                </div>
                {selectedTemplateId === null && (
                  <div className={cn(
                    "flex items-center justify-center rounded-full bg-primary text-primary-foreground",
                    compact ? "size-5" : "size-6"
                  )}>
                    <Check className={cn(compact ? "size-3" : "size-4")} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error State - show error but allow continuing with scratch option */}
          {error && (
            <div className={cn(
              "flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/30 bg-destructive/5 text-center",
              compact ? "py-6" : "py-10"
            )}>
              <div className={cn(
                "flex items-center justify-center rounded-full bg-destructive/10 mb-3",
                compact ? "size-10" : "size-14 mb-4"
              )}>
                <FileText className={cn(compact ? "size-5" : "size-7", "text-destructive")} />
              </div>
              <h3 className={cn("font-semibold text-destructive", compact && "text-sm")}>Failed to load templates</h3>
              <p className={cn("mt-1 text-muted-foreground max-w-xs", compact ? "text-xs" : "text-sm")}>{error}</p>
            </div>
          )}

          {/* Empty State - only show when no error */}
          {!error && templates.length === 0 && !showScratchOption && (
            <div className={cn(
              "flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 text-center",
              compact ? "py-6" : "py-12"
            )}>
              <div className={cn(
                "flex items-center justify-center rounded-full bg-muted mb-3",
                compact ? "size-10" : "size-14 mb-4"
              )}>
                <SearchX className={cn(compact ? "size-5" : "size-7", "text-muted-foreground")} />
              </div>
              <h3 className={cn("font-semibold", compact && "text-sm")}>No templates found</h3>
              <p className={cn("mt-1 text-muted-foreground max-w-xs", compact ? "text-xs" : "text-sm")}>
                {searchQuery
                  ? "Try adjusting your search or category"
                  : "No templates available yet"}
              </p>
            </div>
          )}

          {/* Team Templates Section - show at top when available */}
          {!error && teamTemplates.length > 0 && (
            <div>
              <div className={cn(
                "flex items-center gap-2 font-medium text-primary",
                compact ? "mb-2 text-xs" : "mb-3 text-sm"
              )}>
                <Users className={cn(compact ? "size-3.5" : "size-4")} />
                Team Templates
                <Badge variant="secondary" className={cn(compact ? "text-[10px] h-4 px-1.5" : "text-xs")}>
                  {teamTemplates.length}
                </Badge>
              </div>
              <div className={cn(
                "grid",
                compact
                  ? "grid-cols-1 gap-2"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              )}>
                {teamTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplateId === template.id}
                    onSelect={handleSelectTemplate}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Templates by category - only show when no error */}
          {!error && (
            categoryFilter === "all" ? (
              (Object.entries(groupedTemplates) as [TemplateCategory, TemplateWithItems[]][]).map(
                ([category, categoryTemplates]) => (
                  <div key={category}>
                    <div className={cn(
                      "flex items-center gap-1.5 font-medium text-muted-foreground",
                      compact ? "mb-2 text-xs" : "mb-3 text-sm gap-2"
                    )}>
                      {categoryIcons[category]}
                      {TEMPLATE_CATEGORIES[category].label}
                      <span className={cn(compact ? "text-[10px]" : "text-xs")}>({categoryTemplates.length})</span>
                    </div>
                    <div className={cn(
                      "grid",
                      compact
                        ? "grid-cols-1 gap-2"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    )}>
                      {categoryTemplates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isSelected={selectedTemplateId === template.id}
                          onSelect={handleSelectTemplate}
                          compact={compact}
                        />
                      ))}
                    </div>
                  </div>
                )
              )
            ) : (
              <div className={cn(
                "grid",
                compact
                  ? "grid-cols-1 gap-2"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              )}>
                {otherTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplateId === template.id}
                    onSelect={handleSelectTemplate}
                    compact={compact}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
