/**
 * Shared category icons for template components.
 * Extracted to follow DRY principle - these icons were duplicated in:
 * - template-picker.tsx
 * - template-card.tsx
 * - template-customizer.tsx
 */

import {
  RefreshCw,
  BarChart3,
  Target,
  Users,
  Lightbulb,
  Scale,
  type LucideIcon,
} from "lucide-react";
import type { TemplateCategory } from "@/types/template";

export const categoryIcons: Record<TemplateCategory, React.ReactNode> = {
  sync: <RefreshCw className="size-4" />,
  tactical: <BarChart3 className="size-4" />,
  strategic: <Target className="size-4" />,
  one_on_one: <Users className="size-4" />,
  workshop: <Lightbulb className="size-4" />,
  decision: <Scale className="size-4" />,
};

export const categoryIconComponents: Record<TemplateCategory, LucideIcon> = {
  sync: RefreshCw,
  tactical: BarChart3,
  strategic: Target,
  one_on_one: Users,
  workshop: Lightbulb,
  decision: Scale,
};

export const categoryColors: Record<TemplateCategory, { bg: string; text: string; border: string }> = {
  sync: { bg: "bg-blue-50 dark:bg-blue-950/50", text: "text-blue-600 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  tactical: { bg: "bg-emerald-50 dark:bg-emerald-950/50", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" },
  strategic: { bg: "bg-purple-50 dark:bg-purple-950/50", text: "text-purple-600 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  one_on_one: { bg: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  workshop: { bg: "bg-orange-50 dark:bg-orange-950/50", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200 dark:border-orange-800" },
  decision: { bg: "bg-rose-50 dark:bg-rose-950/50", text: "text-rose-600 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800" },
};
