"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookmarkPlus, AlertCircle, Loader2 } from "lucide-react";
import type { TemplateWithItems, TemplateCategory } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { useTemplateValidation, validateTemplateFields } from "@/hooks/use-template-validation";
import type { TemplateCustomization } from "./template-customizer";

interface SaveAsTemplateData {
  name: string;
  description: string;
  category: TemplateCategory;
  teamId: string | null;
  defaultDuration: number;
  defaultGoal: string;
  agendaItems: TemplateWithItems["agendaItems"];
  planningQuestions: TemplateWithItems["planningQuestions"];
}

interface SaveAsTemplateDialogProps {
  baseTemplate: TemplateWithItems;
  customization: TemplateCustomization;
  teams?: { id: string; name: string }[];
  onSave: (data: SaveAsTemplateData) => Promise<void>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function SaveAsTemplateDialog({
  baseTemplate,
  customization,
  teams = [],
  onSave,
  trigger,
  open: controlledOpen,
  onOpenChange,
  className,
}: SaveAsTemplateDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Form state
  const [name, setName] = useState(`${customization.title} (Custom)`);
  const [description, setDescription] = useState(customization.description);
  const [category, setCategory] = useState<TemplateCategory>(baseTemplate.category);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Validation using shared hook
  const { nameError, descriptionError } = useTemplateValidation(name, description, hasAttemptedSubmit);

  const resetForm = useCallback(() => {
    setName(`${customization.title} (Custom)`);
    setDescription(customization.description);
    setCategory(baseTemplate.category);
    setTeamId(null);
    setError(null);
    setHasAttemptedSubmit(false);
  }, [customization.title, customization.description, baseTemplate.category]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      resetForm();
    }
    setOpen(newOpen);
  }, [resetForm, setOpen]);

  const handleSave = useCallback(async () => {
    setHasAttemptedSubmit(true);
    setError(null);

    // Validate using shared function
    if (!validateTemplateFields(name, description)) {
      return;
    }

    setIsLoading(true);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        category,
        teamId,
        defaultDuration: customization.duration,
        defaultGoal: customization.meetingGoal,
        agendaItems: baseTemplate.agendaItems,
        planningQuestions: baseTemplate.planningQuestions,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setIsLoading(false);
    }
  }, [name, description, category, teamId, customization, baseTemplate, onSave, setOpen]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn("sm:max-w-[500px]", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="size-5" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save your customized settings as a reusable template for future meetings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter template name"
              className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this template"
              className={cn(
                "min-h-[80px]",
                descriptionError && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {descriptionError && (
              <p className="text-sm text-destructive">{descriptionError}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
              <SelectTrigger id="template-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATE_CATEGORIES).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope (Personal vs Team) */}
          <div className="space-y-2">
            <Label htmlFor="template-scope">Save to</Label>
            <Select
              value={teamId ?? "personal"}
              onValueChange={(v) => setTeamId(v === "personal" ? null : v)}
            >
              <SelectTrigger id="template-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">My Personal Templates</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name} (Team)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {teamId
                ? "Team members will be able to use this template"
                : "Only you will be able to use this template"}
            </p>
          </div>

          {/* Info about what's being saved */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium">Template will include:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Duration: {customization.duration} minutes</li>
              {customization.meetingGoal && <li>• Default goal</li>}
              <li>• {baseTemplate.agendaItems.length} agenda items</li>
              <li>• {baseTemplate.planningQuestions.length} planning questions</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing "Save as Template" functionality
 */
export function useSaveAsTemplate(options: {
  onSuccess?: (templateId: string) => void;
  onError?: (error: Error) => void;
} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async (data: SaveAsTemplateData): Promise<void> => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          category: data.category,
          teamId: data.teamId,
          defaultDuration: data.defaultDuration,
          defaultGoal: data.defaultGoal || null,
          suggestedCadence: null,
          agendaItems: data.agendaItems.map((item, index) => ({
            title: item.title,
            description: item.description || null,
            estimatedDuration: item.estimatedDuration,
            isRequired: item.isRequired,
            presenterRole: item.presenterRole || null,
            orderIndex: index,
          })),
          planningQuestions: data.planningQuestions.map((q, index) => ({
            question: q.question,
            placeholder: q.placeholder || null,
            category: q.category,
            isRequired: q.isRequired,
            orderIndex: index,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create template");
      }

      const result = await response.json();
      options.onSuccess?.(result.template.id);
      setIsOpen(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to save template");
      options.onError?.(error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [options]);

  return {
    isOpen,
    setIsOpen,
    isSaving,
    handleSave,
  };
}
