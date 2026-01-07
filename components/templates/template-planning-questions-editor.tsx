"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  GripVertical,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Target,
  Users,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { TEMPLATE_LIMITS, type PlanningQuestionInput, type QuestionCategory } from "@/types/template";
import { useReorderableList, useStableItemIds } from "@/hooks/use-reorderable-list";

// Category configuration
const QUESTION_CATEGORIES: { value: QuestionCategory; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "goal", label: "Meeting Goal", icon: <Target className="size-4" />, description: "Define what you want to achieve" },
  { value: "attendees", label: "Attendees", icon: <Users className="size-4" />, description: "Consider who should attend" },
  { value: "preparation", label: "Preparation", icon: <BookOpen className="size-4" />, description: "What to prepare beforehand" },
  { value: "outcome", label: "Expected Outcome", icon: <CheckCircle2 className="size-4" />, description: "Define success criteria" },
];

const getCategoryIcon = (category: QuestionCategory): React.ReactNode => {
  const config = QUESTION_CATEGORIES.find((c) => c.value === category);
  return config?.icon ?? null;
};

const getCategoryLabel = (category: QuestionCategory): string => {
  const config = QUESTION_CATEGORIES.find((c) => c.value === category);
  return config?.label ?? category;
};

interface QuestionFormData {
  question: string;
  category: QuestionCategory;
  isRequired: boolean;
  placeholder: string;
}

const DEFAULT_QUESTION: QuestionFormData = {
  question: "",
  category: "goal",
  isRequired: false,
  placeholder: "",
};

interface TemplatePlanningQuestionsEditorProps {
  questions: PlanningQuestionInput[];
  onChange: (questions: PlanningQuestionInput[]) => void;
  error?: string;
  className?: string;
  maxQuestions?: number;
  /** When true, displays questions in read-only mode without editing controls */
  readOnly?: boolean;
}

export function TemplatePlanningQuestionsEditor({
  questions,
  onChange,
  error,
  className,
  maxQuestions = TEMPLATE_LIMITS.MAX_PLANNING_QUESTIONS,
  readOnly = false,
}: TemplatePlanningQuestionsEditorProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<QuestionFormData>(DEFAULT_QUESTION);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof QuestionFormData, string>>>({});

  // Use WeakMap-based stable IDs for React reconciliation (prevents remounting on reorder)
  const questionIds = useStableItemIds(questions, "question");

  // Use shared reorderable list hook for move operations
  const { moveUp: handleMoveUp, moveDown: handleMoveDown } = useReorderableList(questions, onChange);

  // Validate form
  const validateForm = useCallback((data: QuestionFormData): boolean => {
    const errors: Partial<Record<keyof QuestionFormData, string>> = {};

    if (!data.question.trim()) {
      errors.question = "Question is required";
    } else if (data.question.length > TEMPLATE_LIMITS.MAX_QUESTION_LENGTH) {
      errors.question = `Question must be ${TEMPLATE_LIMITS.MAX_QUESTION_LENGTH} characters or less`;
    }

    if (data.placeholder && data.placeholder.length > TEMPLATE_LIMITS.MAX_PLACEHOLDER_LENGTH) {
      errors.placeholder = `Placeholder must be ${TEMPLATE_LIMITS.MAX_PLACEHOLDER_LENGTH} characters or less`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, []);

  // Add new question
  const handleAddQuestion = useCallback(() => {
    if (!validateForm(formData)) return;

    const newQuestion: PlanningQuestionInput = {
      question: formData.question.trim(),
      category: formData.category,
      isRequired: formData.isRequired,
      placeholder: formData.placeholder.trim() || undefined,
    };

    onChange([...questions, newQuestion]);
    setFormData(DEFAULT_QUESTION);
    setFormErrors({});
    setIsAddDialogOpen(false);
  }, [formData, questions, onChange, validateForm]);

  // Update existing question
  const handleUpdateQuestion = useCallback(() => {
    if (editingIndex === null || !validateForm(formData)) return;

    const updatedQuestions = [...questions];
    updatedQuestions[editingIndex] = {
      question: formData.question.trim(),
      category: formData.category,
      isRequired: formData.isRequired,
      placeholder: formData.placeholder.trim() || undefined,
    };

    onChange(updatedQuestions);
    setFormData(DEFAULT_QUESTION);
    setFormErrors({});
    setEditingIndex(null);
  }, [editingIndex, formData, questions, onChange, validateForm]);

  // Delete question
  const handleDeleteQuestion = useCallback(() => {
    if (deleteIndex === null) return;

    const updatedQuestions = questions.filter((_, i) => i !== deleteIndex);
    onChange(updatedQuestions);
    setDeleteIndex(null);
  }, [deleteIndex, questions, onChange]);

  // Open edit dialog
  const handleEditClick = useCallback((index: number) => {
    const question = questions[index];
    setFormData({
      question: question.question,
      category: question.category,
      isRequired: question.isRequired ?? false,
      placeholder: question.placeholder || "",
    });
    setFormErrors({});
    setEditingIndex(index);
  }, [questions]);

  // Reset form and close dialogs
  const handleCloseDialog = useCallback(() => {
    setFormData(DEFAULT_QUESTION);
    setFormErrors({});
    setIsAddDialogOpen(false);
    setEditingIndex(null);
  }, []);

  const canAddMore = questions.length < maxQuestions;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Planning Questions</Label>
          <p className="text-xs text-muted-foreground">
            {questions.length} {questions.length === 1 ? "question" : "questions"}
          </p>
        </div>
        {!readOnly && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAddMore}
                onClick={() => {
                  setFormData(DEFAULT_QUESTION);
                  setFormErrors({});
                }}
              >
                <Plus className="mr-1 size-4" />
                Add Question
              </Button>
            </DialogTrigger>
            <QuestionDialog
              title="Add Planning Question"
              description="Add a question to help plan meetings using this template."
              formData={formData}
              formErrors={formErrors}
              onFormChange={setFormData}
              onSubmit={handleAddQuestion}
              onClose={handleCloseDialog}
              submitLabel="Add Question"
            />
          </Dialog>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No planning questions yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add questions to help users prepare for meetings
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((question, index) => (
            <div
              key={questionIds[index]}
              className="flex items-start gap-2 rounded-lg border bg-card p-3 group"
            >
              {/* Drag handle / order indicator */}
              <div className="flex flex-col items-center gap-0.5 pt-0.5">
                <GripVertical className="size-4 text-muted-foreground/50" />
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
                  {getCategoryIcon(question.category)}
                </span>
              </div>

              {/* Question content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{question.question}</span>
                  {question.isRequired && (
                    <span className="shrink-0 text-xs text-orange-600 dark:text-orange-400">
                      Required
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{getCategoryLabel(question.category)}</span>
                  {question.placeholder && (
                    <>
                      <span>&middot;</span>
                      <span className="truncate max-w-[200px]">&quot;{question.placeholder}&quot;</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              {!readOnly && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === questions.length - 1}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-7">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditClick(index)}>
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteIndex(index)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Max questions warning */}
      {!canAddMore && (
        <p className="text-xs text-muted-foreground">
          Maximum of {maxQuestions} planning questions reached
        </p>
      )}

      {/* Edit Dialog */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && handleCloseDialog()}>
        <QuestionDialog
          title="Edit Planning Question"
          description="Update the planning question details."
          formData={formData}
          formErrors={formErrors}
          onFormChange={setFormData}
          onSubmit={handleUpdateQuestion}
          onClose={handleCloseDialog}
          submitLabel="Save Changes"
        />
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Planning Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this question? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuestion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Question Dialog Component
// ============================================================================

interface QuestionDialogProps {
  title: string;
  description: string;
  formData: QuestionFormData;
  formErrors: Partial<Record<keyof QuestionFormData, string>>;
  onFormChange: (data: QuestionFormData) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
}

function QuestionDialog({
  title,
  description,
  formData,
  formErrors,
  onFormChange,
  onSubmit,
  onClose,
  submitLabel,
}: QuestionDialogProps) {
  const handleFieldChange = <K extends keyof QuestionFormData>(
    field: K,
    value: QuestionFormData[K]
  ) => {
    onFormChange({ ...formData, [field]: value });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Question text */}
        <div className="space-y-2">
          <Label htmlFor="question-text">
            Question <span className="text-destructive">*</span>
          </Label>
          <Input
            id="question-text"
            value={formData.question}
            onChange={(e) => handleFieldChange("question", e.target.value)}
            placeholder="e.g., What is the main goal for this meeting?"
            className={cn(formErrors.question && "border-destructive")}
          />
          {formErrors.question && (
            <p className="text-xs text-destructive">{formErrors.question}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="question-category">Category</Label>
          <Select
            value={formData.category}
            onValueChange={(v) => handleFieldChange("category", v as QuestionCategory)}
          >
            <SelectTrigger id="question-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <div className="flex items-center gap-2">
                    {cat.icon}
                    <span>{cat.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {QUESTION_CATEGORIES.find((c) => c.value === formData.category)?.description}
          </p>
        </div>

        {/* Placeholder */}
        <div className="space-y-2">
          <Label htmlFor="question-placeholder">Placeholder Text</Label>
          <Input
            id="question-placeholder"
            value={formData.placeholder}
            onChange={(e) => handleFieldChange("placeholder", e.target.value)}
            placeholder="e.g., Enter your meeting goal..."
            className={cn(formErrors.placeholder && "border-destructive")}
          />
          {formErrors.placeholder && (
            <p className="text-xs text-destructive">{formErrors.placeholder}</p>
          )}
        </div>

        {/* Required toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="question-required" className="cursor-pointer">
              Required Question
            </Label>
            <p className="text-xs text-muted-foreground">
              Users must answer this question before using the template
            </p>
          </div>
          <Switch
            id="question-required"
            checked={formData.isRequired}
            onCheckedChange={(checked) => handleFieldChange("isRequired", checked)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSubmit}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================================
// Hook for managing planning questions state
// ============================================================================

export function usePlanningQuestionsEditor(initialQuestions: PlanningQuestionInput[] = []) {
  const [questions, setQuestions] = useState<PlanningQuestionInput[]>(initialQuestions);

  const resetQuestions = useCallback((newQuestions: PlanningQuestionInput[] = []) => {
    setQuestions(newQuestions);
  }, []);

  return {
    questions,
    setQuestions,
    resetQuestions,
  };
}
