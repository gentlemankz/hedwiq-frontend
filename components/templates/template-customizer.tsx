"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PlanningQuestionsForm, usePlanningAnswers } from "./planning-questions-form";
import {
  Clock,
  ListChecks,
  Target,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import type { TemplateWithItems } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { DURATION_OPTIONS } from "@/types/meeting";
import { categoryIcons } from "@/lib/templates/category-icons";

export interface TemplateCustomization {
  title: string;
  description: string;
  duration: number;
  meetingGoal: string;
  planningAnswers: Record<string, string>;
}

interface TemplateCustomizerProps {
  template: TemplateWithItems;
  onBack?: () => void;
  onApply: (customization: TemplateCustomization) => void;
  className?: string;
}

export function TemplateCustomizer({
  template,
  onBack,
  onApply,
  className,
}: TemplateCustomizerProps) {
  // Form state
  const [title, setTitle] = useState(template.name);
  const [description, setDescription] = useState(template.description || "");
  const [duration, setDuration] = useState(template.defaultDuration);
  const [meetingGoal, setMeetingGoal] = useState(template.defaultGoal || "");
  const { answers, handleAnswerChange, validateRequired, errorQuestionIds } = usePlanningAnswers();

  // Collapsible sections
  const [showAgenda, setShowAgenda] = useState(false);
  const [showQuestions, setShowQuestions] = useState(template.planningQuestions.length > 0);

  const categoryInfo = TEMPLATE_CATEGORIES[template.category];
  const hasQuestions = template.planningQuestions.length > 0;
  const hasAgendaItems = template.agendaItems.length > 0;

  // Calculate total agenda duration
  const totalAgendaDuration = useMemo(() => {
    return template.agendaItems.reduce((sum, item) => sum + item.estimatedDuration, 0);
  }, [template.agendaItems]);

  const handleApply = useCallback(() => {
    // Validate required planning questions
    if (hasQuestions && !validateRequired(template.planningQuestions)) {
      // Expand questions section so user can see the errors
      setShowQuestions(true);
      return;
    }

    onApply({
      title,
      description,
      duration,
      meetingGoal,
      planningAnswers: answers,
    });
  }, [title, description, duration, meetingGoal, answers, hasQuestions, validateRequired, template.planningQuestions, onApply]);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Header with back button */}
      <div className="flex items-start gap-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="gap-1">
              {categoryIcons[template.category]}
              {categoryInfo.label}
            </Badge>
            {template.scope === "system" && (
              <Badge variant="outline" className="text-muted-foreground">
                System Template
              </Badge>
            )}
          </div>
          <h3 className="text-lg font-semibold">{template.name}</h3>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
          )}
        </div>
      </div>

      {/* Basic details */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="meeting-title">Meeting Title</Label>
          <Input
            id="meeting-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter meeting title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="meeting-description">Description (optional)</Label>
          <Textarea
            id="meeting-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for this meeting"
            className="min-h-[60px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Select
              value={String(duration)}
              onValueChange={(v) => setDuration(Number(v))}
            >
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Template default: {template.defaultDuration} min
            </p>
          </div>

          {template.suggestedCadence && (
            <div className="space-y-2">
              <Label>Suggested Cadence</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50 text-sm">
                <Clock className="size-4 text-muted-foreground" />
                <span className="capitalize">
                  {template.suggestedCadence.replace("-", " ")}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Meeting Goal */}
        <div className="space-y-2">
          <Label htmlFor="meeting-goal">Meeting Goal</Label>
          <Textarea
            id="meeting-goal"
            value={meetingGoal}
            onChange={(e) => setMeetingGoal(e.target.value)}
            placeholder="What do you want to achieve in this meeting?"
            className="min-h-[60px]"
          />
          {template.defaultGoal && meetingGoal !== template.defaultGoal && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMeetingGoal(template.defaultGoal || "")}
            >
              Reset to template default
            </Button>
          )}
        </div>
      </div>

      {/* Agenda Items Preview */}
      {hasAgendaItems && (
        <Collapsible open={showAgenda} onOpenChange={setShowAgenda}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full items-center justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="size-4" />
                Agenda Items
                <span className="text-xs text-muted-foreground">
                  ({template.agendaItems.length} items, {totalAgendaDuration} min total)
                </span>
              </div>
              {showAgenda ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-2 rounded-lg border p-3">
              {template.agendaItems
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.title}</span>
                        {item.isRequired && (
                          <Badge variant="outline" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.estimatedDuration} min
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Planning Questions */}
      {hasQuestions && (
        <Collapsible open={showQuestions} onOpenChange={setShowQuestions}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full items-center justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="size-4" />
                Planning Questions
                <span className="text-xs text-muted-foreground">
                  ({template.planningQuestions.length} questions)
                </span>
              </div>
              {showQuestions ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <PlanningQuestionsForm
              questions={template.planningQuestions}
              answers={answers}
              onAnswerChange={handleAnswerChange}
              showCategoryHeaders={false}
              compact
              errorQuestionIds={errorQuestionIds}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Apply Button */}
      <Button onClick={handleApply} className="w-full">
        Use This Template
      </Button>
    </div>
  );
}
