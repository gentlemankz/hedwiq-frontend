"use client";

import { useState, useCallback, useEffect } from "react";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, AlertCircle, Loader2, ListChecks, Target } from "lucide-react";
import type { TemplateWithItems, TemplateCategory } from "@/types/template";
import { TEMPLATE_CATEGORIES } from "@/types/template";
import { useTemplateValidation, validateTemplateFields } from "@/hooks/use-template-validation";
import { categoryIcons } from "@/lib/templates/category-icons";

interface DuplicateTemplateDialogProps {
  template: TemplateWithItems | null;
  teams?: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicate: (templateId: string, data: DuplicateTemplateData) => Promise<void>;
  className?: string;
}

export interface DuplicateTemplateData {
  name: string;
  description: string;
  category: TemplateCategory;
  teamId: string | null;
}

export function DuplicateTemplateDialog({
  template,
  teams = [],
  open,
  onOpenChange,
  onDuplicate,
  className,
}: DuplicateTemplateDialogProps) {
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("sync");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Reset form when template changes or dialog opens
  useEffect(() => {
    if (template && open) {
      setName(`${template.name} (Copy)`);
      setDescription(template.description || "");
      setCategory(template.category);
      setTeamId(null);
      setError(null);
      setHasAttemptedSubmit(false);
    }
  }, [template, open]);

  // Validation using shared hook
  const { nameError, descriptionError } = useTemplateValidation(name, description, hasAttemptedSubmit);

  const handleDuplicate = useCallback(async () => {
    if (!template) return;

    setHasAttemptedSubmit(true);
    setError(null);

    // Validate using shared function
    if (!validateTemplateFields(name, description)) {
      return;
    }

    setIsLoading(true);

    try {
      await onDuplicate(template.id, {
        name: name.trim(),
        description: description.trim(),
        category,
        teamId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate template");
    } finally {
      setIsLoading(false);
    }
  }, [template, name, description, category, teamId, onDuplicate, onOpenChange]);

  if (!template) return null;

  const categoryInfo = TEMPLATE_CATEGORIES[template.category];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[500px]", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="size-5" />
            Duplicate Template
          </DialogTitle>
          <DialogDescription>
            Create a copy of this template with your own customizations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Source template info */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                {categoryIcons[template.category]}
                {categoryInfo.label}
              </Badge>
              <span className="text-sm font-medium">{template.name}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ListChecks className="size-3" />
                {template.agendaItems.length} agenda items
              </span>
              <span className="flex items-center gap-1">
                <Target className="size-3" />
                {template.planningQuestions.length} questions
              </span>
            </div>
          </div>

          {/* New Template Name */}
          <div className="space-y-2">
            <Label htmlFor="duplicate-name">
              New Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="duplicate-name"
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
            <Label htmlFor="duplicate-description">Description</Label>
            <Textarea
              id="duplicate-description"
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
            <Label htmlFor="duplicate-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
              <SelectTrigger id="duplicate-category">
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
            <Label htmlFor="duplicate-scope">Save to</Label>
            <Select
              value={teamId ?? "personal"}
              onValueChange={(v) => setTeamId(v === "personal" ? null : v)}
            >
              <SelectTrigger id="duplicate-scope">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            <Copy className="mr-2 size-4" />
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing template duplication
 */
export function useDuplicateTemplate(options: {
  onSuccess?: (newTemplateId: string) => void;
  onError?: (error: Error) => void;
} = {}) {
  const [templateToDuplicate, setTemplateToDuplicate] = useState<TemplateWithItems | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const openDuplicateDialog = useCallback((template: TemplateWithItems) => {
    setTemplateToDuplicate(template);
  }, []);

  const closeDuplicateDialog = useCallback(() => {
    setTemplateToDuplicate(null);
  }, []);

  const handleDuplicate = useCallback(async (
    templateId: string,
    data: DuplicateTemplateData
  ): Promise<void> => {
    setIsDuplicating(true);

    try {
      const response = await fetch(`/api/templates/${templateId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to duplicate template");
      }

      const result = await response.json();
      options.onSuccess?.(result.template.id);
      setTemplateToDuplicate(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to duplicate template");
      options.onError?.(error);
      throw error;
    } finally {
      setIsDuplicating(false);
    }
  }, [options]);

  return {
    templateToDuplicate,
    isDialogOpen: templateToDuplicate !== null,
    isDuplicating,
    openDuplicateDialog,
    closeDuplicateDialog,
    handleDuplicate,
  };
}
