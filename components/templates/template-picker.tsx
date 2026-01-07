"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { TemplateCard } from "./template-card";
import { useTemplates } from "@/hooks/use-templates";
import { Search, FileText, Users } from "lucide-react";
import type { TemplateWithItems, TemplateCategory } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { categoryIcons } from "@/lib/templates/category-icons";

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
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as FilterCategory)}
        >
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => (
              <TabsTrigger key={cat} value={cat} className="gap-1 text-xs">
                {categoryIcons[cat]}
                <span className="hidden sm:inline">{TEMPLATE_CATEGORIES[cat].label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={cn("grid gap-4", compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {/* Templates Grid */}
      {!isLoading && (
        <div className="space-y-6">
          {/* Start from scratch option - show when no search OR when there's an error (so users aren't blocked) */}
          {showScratchOption && categoryFilter === "all" && (!debouncedSearch || error) && (
            <div
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-all hover:border-primary/50 hover:bg-muted/50",
                selectedTemplateId === null && "border-primary ring-2 ring-primary/20"
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
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Start from scratch</p>
                <p className="text-sm text-muted-foreground">
                  Create a custom meeting without a template
                </p>
              </div>
            </div>
          )}

          {/* Error State - show error but allow continuing with scratch option */}
          {error && (
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

          {/* Empty State - only show when no error */}
          {!error && templates.length === 0 && !showScratchOption && (
            <Empty>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No templates found</EmptyTitle>
                <EmptyDescription>
                  {searchQuery
                    ? "Try adjusting your search query"
                    : "No templates available for this category"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* Team Templates Section - show at top when available */}
          {!error && teamTemplates.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                <Users className="size-4" />
                Team Templates
                <Badge variant="secondary" className="text-xs">
                  {teamTemplates.length}
                </Badge>
              </div>
              <div
                className={cn(
                  "grid gap-4",
                  compact
                    ? "grid-cols-2 md:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}
              >
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
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      {categoryIcons[category]}
                      {TEMPLATE_CATEGORIES[category].label}
                      <span className="text-xs">({categoryTemplates.length})</span>
                    </div>
                    <div
                      className={cn(
                        "grid gap-4",
                        compact
                          ? "grid-cols-2 md:grid-cols-3"
                          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      )}
                    >
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
              <div
                className={cn(
                  "grid gap-4",
                  compact
                    ? "grid-cols-2 md:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}
              >
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
