"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Target, Users, BookOpen, CheckCircle2 } from "lucide-react";
import type { PlanningQuestion, QuestionCategory } from "@/types/template";

const categoryConfig: Record<
  QuestionCategory,
  { label: string; icon: React.ReactNode; description: string }
> = {
  goal: {
    label: "Meeting Goal",
    icon: <Target className="size-4" />,
    description: "Define what you want to achieve",
  },
  attendees: {
    label: "Attendees",
    icon: <Users className="size-4" />,
    description: "Consider who should attend",
  },
  preparation: {
    label: "Preparation",
    icon: <BookOpen className="size-4" />,
    description: "What to prepare beforehand",
  },
  outcome: {
    label: "Expected Outcome",
    icon: <CheckCircle2 className="size-4" />,
    description: "Define success criteria",
  },
};

const categoryOrder: QuestionCategory[] = ["goal", "attendees", "preparation", "outcome"];

interface PlanningQuestionsFormProps {
  questions: PlanningQuestion[];
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, answer: string) => void;
  className?: string;
  showCategoryHeaders?: boolean;
  compact?: boolean;
  /** IDs of questions that have validation errors */
  errorQuestionIds?: Set<string>;
}

export function PlanningQuestionsForm({
  questions,
  answers,
  onAnswerChange,
  className,
  showCategoryHeaders = true,
  compact = false,
  errorQuestionIds,
}: PlanningQuestionsFormProps) {
  // Group questions by category and sort by orderIndex
  const groupedQuestions = useMemo(() => {
    const groups: Partial<Record<QuestionCategory, PlanningQuestion[]>> = {};

    for (const question of questions) {
      if (!groups[question.category]) {
        groups[question.category] = [];
      }
      groups[question.category]!.push(question);
    }

    // Sort within each category by orderIndex
    for (const category of Object.keys(groups) as QuestionCategory[]) {
      groups[category]!.sort((a, b) => a.orderIndex - b.orderIndex);
    }

    return groups;
  }, [questions]);

  // Get ordered categories that have questions
  const orderedCategories = useMemo(() => {
    return categoryOrder.filter((cat) => groupedQuestions[cat]?.length);
  }, [groupedQuestions]);

  if (questions.length === 0) {
    return null;
  }

  const renderQuestion = (question: PlanningQuestion) => {
    const hasError = errorQuestionIds?.has(question.id);
    return (
      <div key={question.id} className="space-y-2">
        <Label
          htmlFor={`question-${question.id}`}
          className="flex items-center gap-2"
        >
          {question.question}
          {question.isRequired && (
            <span className="text-destructive">*</span>
          )}
        </Label>
        <Textarea
          id={`question-${question.id}`}
          value={answers[question.id] || ""}
          onChange={(e) => onAnswerChange(question.id, e.target.value)}
          placeholder={question.placeholder || "Enter your answer..."}
          className={cn(
            compact ? "min-h-[60px]" : "min-h-[80px]",
            hasError && "border-destructive focus-visible:ring-destructive"
          )}
          required={question.isRequired}
          aria-invalid={hasError}
        />
        {hasError && (
          <p className="text-xs text-destructive">This field is required</p>
        )}
      </div>
    );
  };

  if (!showCategoryHeaders) {
    return (
      <div className={cn("space-y-4", className)}>
        {questions
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map(renderQuestion)}
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {orderedCategories.map((category) => {
        const config = categoryConfig[category];
        const categoryQuestions = groupedQuestions[category] || [];

        return (
          <div key={category} className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="flex size-6 items-center justify-center rounded-md bg-muted">
                {config.icon}
              </div>
              <span>{config.label}</span>
              <span className="text-xs text-muted-foreground">
                ({categoryQuestions.length})
              </span>
            </div>
            {compact ? (
              <p className="text-xs text-muted-foreground -mt-2 ml-8">
                {config.description}
              </p>
            ) : null}
            <div className={cn("space-y-4", compact && "ml-8")}>
              {categoryQuestions.map(renderQuestion)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Hook to manage planning question answers state.
 */
export function usePlanningAnswers(initialAnswers: Record<string, string> = {}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [errorQuestionIds, setErrorQuestionIds] = useState<Set<string>>(new Set());

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
    // Clear error for this question when user types
    if (errorQuestionIds.has(questionId)) {
      setErrorQuestionIds((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };

  const resetAnswers = () => {
    setAnswers({});
    setErrorQuestionIds(new Set());
  };

  const validateRequired = (questions: PlanningQuestion[]): boolean => {
    const invalidIds = new Set<string>();
    for (const q of questions) {
      if (q.isRequired && !answers[q.id]?.trim()) {
        invalidIds.add(q.id);
      }
    }
    setErrorQuestionIds(invalidIds);
    return invalidIds.size === 0;
  };

  const clearErrors = () => {
    setErrorQuestionIds(new Set());
  };

  return {
    answers,
    handleAnswerChange,
    resetAnswers,
    validateRequired,
    setAnswers,
    errorQuestionIds,
    clearErrors,
  };
}
