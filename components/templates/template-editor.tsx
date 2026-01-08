"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { TemplateAgendaEditor } from "./template-agenda-editor";
import { TemplatePlanningQuestionsEditor } from "./template-planning-questions-editor";
import { categoryIcons } from "@/lib/templates/category-icons";
import {
  Save,
  ArrowLeft,
  Clock,
  Calendar,
  Target,
  FileText,
  AlertCircle,
} from "lucide-react";
import {
  TEMPLATE_LIMITS,
  TEMPLATE_CATEGORIES,
  CADENCE_OPTIONS,
  type TemplateCategory,
  type TemplateWithItems,
  type TemplateAgendaItemInput,
  type PlanningQuestionInput,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
} from "@/types/template";
import { DURATION_OPTIONS } from "@/types/meeting";
import {
  validateTemplateField,
  hasTemplateFieldErrors,
  type TemplateFieldErrors,
} from "@/lib/validation/template";

// ============================================================================
// Types
// ============================================================================

export interface TemplateEditorFormData {
  name: string;
  description: string;
  category: TemplateCategory;
  scope: "team" | "personal";
  teamId?: string;
  defaultDuration: number;
  suggestedCadence: string;
  defaultGoal: string;
  agendaItems: TemplateAgendaItemInput[];
  planningQuestions: PlanningQuestionInput[];
}

interface TemplateEditorProps {
  /** Existing template for editing, or undefined for creating */
  template?: TemplateWithItems;
  /** User's teams for scope selection */
  teams?: { id: string; name: string }[];
  /** Callback when form is submitted */
  onSubmit: (data: CreateTemplateRequest | UpdateTemplateRequest) => Promise<void>;
  /** Callback to go back */
  onBack?: () => void;
  /** Whether the form is in a loading state */
  isLoading?: boolean;
  /** Error message from server */
  serverError?: string;
  /** Whether the template is read-only (e.g., system templates) */
  readOnly?: boolean;
  /** Whether we're customizing a system template (allows editing, saves as personal copy) */
  isCustomizing?: boolean;
  /** Custom class name */
  className?: string;
  /** Default scope for new templates */
  defaultScope?: "team" | "personal";
  /** Default team ID for new team templates */
  defaultTeamId?: string;
  /** Hide the back button (useful in dialogs) */
  hideBackButton?: boolean;
  /** Hide the scope selector (useful when scope is predetermined) */
  hideScopeSelector?: boolean;
}

// ============================================================================
// Default values
// ============================================================================

const getDefaultFormData = (template?: TemplateWithItems): TemplateEditorFormData => {
  if (template) {
    return {
      name: template.name,
      description: template.description || "",
      category: template.category,
      scope: template.scope === "system" ? "personal" : template.scope,
      teamId: template.teamId || undefined,
      defaultDuration: template.defaultDuration,
      suggestedCadence: template.suggestedCadence || "",
      defaultGoal: template.defaultGoal || "",
      agendaItems: template.agendaItems.map((item) => ({
        title: item.title,
        description: item.description || undefined,
        estimatedDuration: item.estimatedDuration,
        isRequired: item.isRequired,
        presenterRole: item.presenterRole || undefined,
      })),
      planningQuestions: template.planningQuestions.map((q) => ({
        question: q.question,
        category: q.category,
        isRequired: q.isRequired,
        placeholder: q.placeholder,
      })),
    };
  }

  return {
    name: "",
    description: "",
    category: "sync",
    scope: "personal",
    teamId: undefined,
    defaultDuration: 30,
    suggestedCadence: "",
    defaultGoal: "",
    agendaItems: [],
    planningQuestions: [],
  };
};

// ============================================================================
// Component
// ============================================================================

export function TemplateEditor({
  template,
  teams = [],
  onSubmit,
  onBack,
  isLoading = false,
  serverError,
  readOnly = false,
  isCustomizing = false,
  className,
  defaultScope,
  defaultTeamId,
  hideBackButton = false,
  hideScopeSelector = false,
}: TemplateEditorProps) {
  const isEditing = !!template && !isCustomizing;
  // When customizing, we allow editing (not disabled) but treat it as creating a new template
  const isDisabled = isLoading || (readOnly && !isCustomizing);
  const [formData, setFormData] = useState<TemplateEditorFormData>(() => {
    const data = getDefaultFormData(template);
    // Apply defaults for new templates
    if (!template) {
      if (defaultScope) data.scope = defaultScope;
      if (defaultTeamId) data.teamId = defaultTeamId;
    }
    return data;
  });
  const [fieldErrors, setFieldErrors] = useState<TemplateFieldErrors>({});
  const [agendaError, setAgendaError] = useState<string>();
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Reset form when template changes (track by ID for stability)
  useEffect(() => {
    const data = getDefaultFormData(template);
    // Apply defaults for new templates (when no template is provided)
    if (!template) {
      if (defaultScope) data.scope = defaultScope;
      if (defaultTeamId) data.teamId = defaultTeamId;
    }
    setFormData(data);
    setFieldErrors({});
    setAgendaError(undefined);
    setHasSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, defaultScope, defaultTeamId]);

  // Validate on change after first submit
  const validateField = useCallback(
    (field: keyof TemplateFieldErrors, value: string | number | undefined | null) => {
      if (!hasSubmitted) return;
      const error = validateTemplateField(field, value);
      setFieldErrors((prev) => {
        if (error) return { ...prev, [field]: error };
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    },
    [hasSubmitted]
  );

  // Update form field
  const handleFieldChange = useCallback(
    <K extends keyof TemplateEditorFormData>(field: K, value: TemplateEditorFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));

      // Validate specific fields
      if (field === "name" || field === "description" || field === "defaultDuration") {
        validateField(field as keyof TemplateFieldErrors, value as string | number);
      }

      // Clear team ID if scope changes to personal
      if (field === "scope" && value === "personal") {
        setFormData((prev) => ({ ...prev, teamId: undefined }));
      }
    },
    [validateField]
  );

  // Handle agenda items change
  const handleAgendaChange = useCallback((items: TemplateAgendaItemInput[]) => {
    setFormData((prev) => ({ ...prev, agendaItems: items }));
    if (hasSubmitted && items.length >= TEMPLATE_LIMITS.MIN_AGENDA_ITEMS) {
      setAgendaError(undefined);
    }
  }, [hasSubmitted]);

  // Handle planning questions change
  const handleQuestionsChange = useCallback((questions: PlanningQuestionInput[]) => {
    setFormData((prev) => ({ ...prev, planningQuestions: questions }));
  }, []);

  // Full form validation
  const validateForm = useCallback((): boolean => {
    const errors: TemplateFieldErrors = {};

    // Validate basic fields
    const nameError = validateTemplateField("name", formData.name);
    if (nameError) errors.name = nameError;

    const descError = validateTemplateField("description", formData.description);
    if (descError) errors.description = descError;

    const durationError = validateTemplateField("defaultDuration", formData.defaultDuration);
    if (durationError) errors.defaultDuration = durationError;

    // Validate team selection for team scope
    if (formData.scope === "team" && !formData.teamId) {
      errors.teamId = "Please select a team";
    }

    setFieldErrors(errors);

    // Validate agenda items
    if (formData.agendaItems.length < TEMPLATE_LIMITS.MIN_AGENDA_ITEMS) {
      setAgendaError(`At least ${TEMPLATE_LIMITS.MIN_AGENDA_ITEMS} agenda item is required`);
      return false;
    }
    setAgendaError(undefined);

    return !hasTemplateFieldErrors(errors);
  }, [formData]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    setHasSubmitted(true);

    if (!validateForm()) {
      return;
    }

    const requestData: CreateTemplateRequest | UpdateTemplateRequest = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      category: formData.category,
      defaultDuration: formData.defaultDuration,
      suggestedCadence: formData.suggestedCadence || undefined,
      defaultGoal: formData.defaultGoal.trim() || undefined,
      agendaItems: formData.agendaItems,
      planningQuestions: formData.planningQuestions.length > 0 ? formData.planningQuestions : undefined,
    };

    // Add scope and teamId only for create
    if (!isEditing) {
      (requestData as CreateTemplateRequest).scope = formData.scope;
      if (formData.scope === "team") {
        (requestData as CreateTemplateRequest).teamId = formData.teamId;
      }
    }

    await onSubmit(requestData);
  }, [formData, isEditing, onSubmit, validateForm]);

  // Calculate total agenda duration
  const totalAgendaDuration = useMemo(() => {
    return formData.agendaItems.reduce((sum, item) => sum + item.estimatedDuration, 0);
  }, [formData.agendaItems]);

  const selectedCategory = TEMPLATE_CATEGORIES[formData.category];
  const canSelectTeam = teams.length > 0;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && !hideBackButton && (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} disabled={isLoading}>
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="flex-1">
          <h2 className="text-xl font-semibold">
            {readOnly && !isCustomizing
              ? "View Template"
              : isCustomizing
                ? "Customize Template"
                : isEditing
                  ? "Edit Template"
                  : "Create Template"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {readOnly && !isCustomizing
              ? "Viewing system template details"
              : isCustomizing
                ? "Customize this template and save it as your own"
                : isEditing
                  ? "Update your meeting template"
                  : "Create a reusable meeting template"}
          </p>
        </div>
        {(!readOnly || isCustomizing) && (
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Spinner className="mr-2 size-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" />
                {isCustomizing ? "Save as My Template" : isEditing ? "Save Changes" : "Create Template"}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Server Error */}
      {serverError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {serverError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Basic Details
              </CardTitle>
              <CardDescription>
                Set the name, description, and category for your template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="template-name">
                  Template Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="template-name"
                  value={formData.name}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                  placeholder="e.g., Weekly Team Sync"
                  className={cn(fieldErrors.name && "border-destructive")}
                  disabled={isDisabled}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={formData.description}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  placeholder="Describe the purpose of this template..."
                  className={cn("min-h-[80px]", fieldErrors.description && "border-destructive")}
                  disabled={isDisabled}
                />
                {fieldErrors.description && (
                  <p className="text-xs text-destructive">{fieldErrors.description}</p>
                )}
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => handleFieldChange("category", v as TemplateCategory)}
                  disabled={isDisabled}
                >
                  <SelectTrigger id="template-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          {categoryIcons[cat]}
                          <span>{TEMPLATE_CATEGORIES[cat].label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{selectedCategory.description}</p>
              </div>

              {/* Scope (only for new templates, hidden when hideScopeSelector) */}
              {!isEditing && !hideScopeSelector && (
                <div className="space-y-2">
                  <Label htmlFor="template-scope">Visibility</Label>
                  <Select
                    value={formData.scope}
                    onValueChange={(v) => handleFieldChange("scope", v as "team" | "personal")}
                    disabled={isDisabled}
                  >
                    <SelectTrigger id="template-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal (Only you)</SelectItem>
                      {canSelectTeam && <SelectItem value="team">Team</SelectItem>}
                    </SelectContent>
                  </Select>

                  {/* Team selector */}
                  {formData.scope === "team" && canSelectTeam && (
                    <div className="pt-2">
                      <Select
                        value={formData.teamId}
                        onValueChange={(v) => handleFieldChange("teamId", v)}
                        disabled={isDisabled}
                      >
                        <SelectTrigger className={cn(fieldErrors.teamId && "border-destructive")}>
                          <SelectValue placeholder="Select a team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.teamId && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.teamId}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Duration & Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4" />
                Duration & Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Default Duration */}
                <div className="space-y-2">
                  <Label htmlFor="template-duration">Default Duration</Label>
                  <Select
                    value={String(formData.defaultDuration)}
                    onValueChange={(v) => handleFieldChange("defaultDuration", Number(v))}
                    disabled={isDisabled}
                  >
                    <SelectTrigger id="template-duration">
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
                </div>

                {/* Suggested Cadence */}
                <div className="space-y-2">
                  <Label htmlFor="template-cadence">Suggested Cadence</Label>
                  <Select
                    value={formData.suggestedCadence || "none"}
                    onValueChange={(v) => handleFieldChange("suggestedCadence", v === "none" ? "" : v)}
                    disabled={isDisabled}
                  >
                    <SelectTrigger id="template-cadence">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {CADENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Meeting Goal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4" />
                Default Meeting Goal
              </CardTitle>
              <CardDescription>
                Set a default goal that can be customized when using this template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.defaultGoal}
                onChange={(e) => handleFieldChange("defaultGoal", e.target.value)}
                placeholder="e.g., Align team on weekly priorities and blockers"
                className="min-h-[80px]"
                disabled={isDisabled}
              />
            </CardContent>
          </Card>

          {/* Agenda Items */}
          <Card>
            <CardHeader>
              <CardTitle>Agenda Items</CardTitle>
              <CardDescription>
                Define the structure of meetings using this template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateAgendaEditor
                items={formData.agendaItems}
                onChange={handleAgendaChange}
                error={agendaError}
                readOnly={readOnly && !isCustomizing}
              />
            </CardContent>
          </Card>

          {/* Planning Questions */}
          <Card>
            <CardHeader>
              <CardTitle>Planning Questions</CardTitle>
              <CardDescription>
                Help users prepare for meetings with these questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplatePlanningQuestionsEditor
                questions={formData.planningQuestions}
                onChange={handleQuestionsChange}
                readOnly={readOnly && !isCustomizing}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Preview */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Category badge */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  {categoryIcons[formData.category]}
                  {selectedCategory.label}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {formData.scope}
                </Badge>
              </div>

              {/* Name */}
              <div>
                <p className="font-medium">
                  {formData.name || "Untitled Template"}
                </p>
                {formData.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {formData.description}
                  </p>
                )}
              </div>

              <Separator />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-3.5" />
                  <span>{formData.defaultDuration} min</span>
                </div>
                {formData.suggestedCadence && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="size-3.5" />
                    <span className="capitalize">
                      {formData.suggestedCadence.replace("-", " ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Agenda summary */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  AGENDA ({formData.agendaItems.length} items, {totalAgendaDuration} min)
                </p>
                <div className="space-y-1">
                  {formData.agendaItems.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                        {i + 1}
                      </span>
                      <span className="truncate">{item.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.estimatedDuration}m
                      </span>
                    </div>
                  ))}
                  {formData.agendaItems.length > 5 && (
                    <p className="text-xs text-muted-foreground pl-7">
                      +{formData.agendaItems.length - 5} more
                    </p>
                  )}
                </div>
              </div>

              {/* Questions summary */}
              {formData.planningQuestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    PLANNING QUESTIONS ({formData.planningQuestions.length})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formData.planningQuestions.filter((q) => q.isRequired).length} required
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Hook for template editor state management
// ============================================================================

export interface UseTemplateEditorOptions {
  template?: TemplateWithItems;
  onSuccess?: (template: TemplateWithItems) => void;
}

export function useTemplateEditor({ template, onSuccess }: UseTemplateEditorOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const handleSubmit = useCallback(
    async (data: CreateTemplateRequest | UpdateTemplateRequest) => {
      setIsLoading(true);
      setServerError(undefined);

      try {
        const url = template ? `/api/templates/${template.id}` : "/api/templates";
        const method = template ? "PUT" : "POST";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Failed to save template" }));
          throw new Error(error.error || "Failed to save template");
        }

        const result = await response.json();
        onSuccess?.(result.template);
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    },
    [template, onSuccess]
  );

  return {
    isLoading,
    serverError,
    handleSubmit,
  };
}
