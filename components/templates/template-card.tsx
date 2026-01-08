"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ListChecks, Calendar, Check, Users } from "lucide-react";
import type { TemplateWithItems } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { categoryIcons, categoryColors } from "@/lib/templates/category-icons";

interface TemplateCardProps {
  template: TemplateWithItems;
  isSelected?: boolean;
  onSelect?: (template: TemplateWithItems) => void;
  compact?: boolean;
}

export function TemplateCard({
  template,
  isSelected = false,
  onSelect,
  compact = false,
}: TemplateCardProps) {
  const categoryInfo = TEMPLATE_CATEGORIES[template.category];
  const agendaItemCount = template.agendaItems?.length ?? 0;

  const handleClick = () => {
    onSelect?.(template);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(template);
    }
  };

  const colors = categoryColors[template.category];

  // Compact mode: streamlined horizontal layout
  if (compact) {
    return (
      <div
        className={cn(
          "group relative flex items-center gap-3 cursor-pointer rounded-lg border p-3 transition-all duration-150",
          isSelected
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "hover:border-primary/40 hover:bg-muted/30"
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-pressed={isSelected}
      >
        {/* Category Badge - Icon only */}
        <Badge
          variant="secondary"
          className={cn(
            "shrink-0 size-8 p-0 flex items-center justify-center border",
            colors.bg,
            colors.text,
            colors.border
          )}
        >
          {categoryIcons[template.category]}
        </Badge>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium text-sm truncate group-hover:text-primary transition-colors",
              isSelected && "text-primary"
            )}>
              {template.name}
            </span>
            {template.scope === "system" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                System
              </Badge>
            )}
            {template.scope === "team" && template.team && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 text-muted-foreground">
                <Users className="size-2.5" />
                {template.team.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/70">
            <span className="flex items-center gap-0.5">
              <Clock className="size-2.5" />
              {template.defaultDuration}m
            </span>
            {agendaItemCount > 0 && (
              <span className="flex items-center gap-0.5">
                <ListChecks className="size-2.5" />
                {agendaItemCount}
              </span>
            )}
            {template.suggestedCadence && (
              <span className="flex items-center gap-0.5">
                <Calendar className="size-2.5" />
                <span className="capitalize">{template.suggestedCadence.replace("-", " ")}</span>
              </span>
            )}
          </div>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <div className="shrink-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" />
          </div>
        )}
      </div>
    );
  }

  // Full mode: original card layout
  return (
    <Card
      className={cn(
        "group relative cursor-pointer transition-all duration-200 hover:shadow-lg",
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "hover:border-primary/40"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-3.5" />
        </div>
      )}

      <CardHeader>
        <div className="flex items-start gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className={cn(
              "gap-1.5 border transition-colors",
              colors.bg,
              colors.text,
              colors.border
            )}
          >
            {categoryIcons[template.category]}
            {categoryInfo.label}
          </Badge>
          {template.scope === "system" && (
            <Badge variant="outline" className="text-muted-foreground bg-muted/50">
              System
            </Badge>
          )}
          {template.scope === "team" && template.team && (
            <Badge variant="outline" className="gap-1 text-muted-foreground bg-muted/50">
              <Users className="size-3" />
              {template.team.name}
            </Badge>
          )}
        </div>
        <CardTitle className="mt-3 group-hover:text-primary transition-colors text-base font-semibold">
          {template.name}
        </CardTitle>
        {template.description && (
          <CardDescription className="line-clamp-2 mt-1">
            {template.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          <span>{template.defaultDuration} min</span>
        </div>
        {agendaItemCount > 0 && (
          <div className="flex items-center gap-1.5">
            <ListChecks className="size-3.5" />
            <span>{agendaItemCount} {agendaItemCount === 1 ? "item" : "items"}</span>
          </div>
        )}
        {template.suggestedCadence && (
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span className="capitalize">{template.suggestedCadence.replace("-", " ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
