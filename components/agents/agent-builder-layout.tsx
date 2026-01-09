"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface AgentBuilderLayoutProps {
  /** Main content area */
  mainPanel: ReactNode;
  /** Right panel content (configuration sidebar) */
  rightPanel: ReactNode;
  /** Optional className for the container */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * AgentBuilderLayout - Two-panel layout for the Agent Builder
 *
 * Simplified layout since dashboard already has a sidebar:
 * - Main panel (flexible): Agent details and instructions
 * - Right panel (320px): Configuration sidebar
 */
export function AgentBuilderLayout({
  mainPanel,
  rightPanel,
  className,
}: AgentBuilderLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full bg-background",
        className
      )}
    >
      {/* Main Panel - Content */}
      <main
        className={cn(
          "flex-1 min-w-0 flex flex-col"
        )}
        data-slot="agent-main-content"
      >
        {mainPanel}
      </main>

      {/* Right Panel - Configuration */}
      <aside
        className={cn(
          "flex flex-col flex-shrink-0",
          "w-[320px] border-l bg-muted/20"
        )}
        data-slot="agent-configuration"
      >
        {rightPanel}
      </aside>
    </div>
  );
}
