/**
 * Hook for accessing actions from context.
 *
 * Provides convenient access to the ActionsContext with typed returns.
 *
 * @example
 * ```tsx
 * const { actions, emailActions, actionCount } = useActions();
 * ```
 */

import { useActionsContext, useActionForInsight } from "@/contexts/actions-context";

/**
 * Hook to access all actions state and functions.
 */
export function useActions() {
  return useActionsContext();
}

/**
 * Hook to get classified action for a specific insight.
 * Returns the action if the insight has been classified, undefined otherwise.
 *
 * @example
 * ```tsx
 * const action = useActionForInsight(insight.id);
 * if (action) {
 *   // Show action type badge
 * }
 * ```
 */
export { useActionForInsight };
