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
