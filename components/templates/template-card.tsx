"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ListChecks, Calendar, Check } from "lucide-react";
import type { TemplateWithItems } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { categoryIcons } from "@/lib/templates/category-icons";

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

  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
        isSelected && "border-primary ring-2 ring-primary/20",
        compact && "py-4"
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
    >
      {isSelected && (
        <div className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </div>
      )}

      <CardHeader className={cn(compact && "pb-2")}>
        <div className="flex items-start gap-2">
          <Badge variant="secondary" className="gap-1">
            {categoryIcons[template.category]}
            {categoryInfo.label}
          </Badge>
          {template.scope === "system" && (
            <Badge variant="outline" className="text-muted-foreground">
              System
            </Badge>
          )}
        </div>
        <CardTitle className={cn("mt-2", compact ? "text-sm" : "text-base")}>
          {template.name}
        </CardTitle>
        {template.description && !compact && (
          <CardDescription className="line-clamp-2">
            {template.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className={cn("flex flex-wrap gap-3 text-xs text-muted-foreground", compact && "pt-0")}>
        <div className="flex items-center gap-1">
          <Clock className="size-3.5" />
          <span>{template.defaultDuration} min</span>
        </div>
        {agendaItemCount > 0 && (
          <div className="flex items-center gap-1">
            <ListChecks className="size-3.5" />
            <span>{agendaItemCount} {agendaItemCount === 1 ? "item" : "items"}</span>
          </div>
        )}
        {template.suggestedCadence && (
          <div className="flex items-center gap-1">
            <Calendar className="size-3.5" />
            <span className="capitalize">{template.suggestedCadence.replace("-", " ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
