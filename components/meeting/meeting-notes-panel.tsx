"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TranscriptNoteCard } from "@/components/transcript-notes";
import type { NoteBlock, TextBlock, TranscriptNote } from "@/types/transcript-note";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";

// ============================================================================
// Types
// ============================================================================

export interface MeetingNotesPanelProps {
  /** Meeting title to display in the header */
  meetingTitle?: string;
  /** Controlled expanded state */
  isExpanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Ordered array of note blocks */
  blocks?: NoteBlock[];
  /** Map of transcript notes by ID */
  transcriptNotes?: Record<string, TranscriptNote>;
  /** Add a new text block. Returns the created block for optional chaining (e.g., auto-focus) */
  onAddTextBlock?: (content: string, afterBlockId?: string) => TextBlock | void;
  /** Update a text block */
  onUpdateTextBlock?: (id: string, content: string) => void;
  /** Delete a block */
  onDeleteBlock?: (id: string) => void;
  /** Move a block to a new position */
  onMoveBlock?: (blockId: string, newIndex: number) => void;
  /** Update a transcript note */
  onUpdateTranscriptNote?: (id: string, content: string) => void;
  /** Delete a transcript note */
  onDeleteTranscriptNote?: (id: string) => void;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Height when expanded (in pixels) */
const EXPANDED_HEIGHT = 400;
/** Height when collapsed */
const COLLAPSED_HEIGHT = 28;

// ============================================================================
// Sub-components
// ============================================================================

interface DragHandleProps {
  attributes: React.HTMLAttributes<HTMLButtonElement>;
  listeners: React.DOMAttributes<HTMLButtonElement> | undefined;
}

/** Reusable drag handle component to reduce duplication */
const BlockDragHandle = React.memo(function BlockDragHandle({
  dragHandleProps,
}: {
  dragHandleProps?: DragHandleProps;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded-md",
            "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50",
            "cursor-grab active:cursor-grabbing touch-none"
          )}
          {...dragHandleProps?.attributes}
          {...dragHandleProps?.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        Drag to reorder
      </TooltipContent>
    </Tooltip>
  );
});

interface TextBlockEditorProps {
  block: TextBlock;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  onAddAfter: () => void;
  isOnly: boolean;
  dragHandleProps?: DragHandleProps;
  /** Auto-focus the textarea on mount (used when creating first block from empty state) */
  autoFocus?: boolean;
}

const TextBlockEditor = React.memo(function TextBlockEditor({
  block,
  onUpdate,
  onDelete,
  onAddAfter,
  isOnly,
  dragHandleProps,
  autoFocus = false,
}: TextBlockEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  // Auto-focus when transitioning from empty state
  React.useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end of content
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 60)}px`;
    }
  }, [block.content]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate(e.target.value);
    },
    [onUpdate]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter at the end of content creates new block
      if (e.key === "Enter" && !e.shiftKey) {
        const textarea = e.currentTarget;
        const isAtEnd = textarea.selectionStart === textarea.value.length;
        if (isAtEnd && textarea.value.trim()) {
          e.preventDefault();
          onAddAfter();
        }
      }
      // Backspace on empty block deletes it
      if (e.key === "Backspace" && !block.content && !isOnly) {
        e.preventDefault();
        onDelete();
      }
    },
    [block.content, isOnly, onAddAfter, onDelete]
  );

  return (
    <div className={cn("group relative", isFocused && "z-10")}>
      {/* Drag handle */}
      <div
        className={cn(
          "absolute -left-8 top-1 flex items-center gap-0.5 opacity-0 transition-opacity",
          "group-hover:opacity-100",
          isFocused && "opacity-100"
        )}
      >
        <BlockDragHandle dragHandleProps={dragHandleProps} />
      </div>

      <Textarea
        ref={textareaRef}
        value={block.content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Type your notes here..."
        className={cn(
          "min-h-[60px] resize-none border-0 bg-transparent p-2 -ml-2",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
          "placeholder:text-muted-foreground/40 text-sm leading-relaxed",
          "hover:bg-muted/30 focus:bg-muted/30 rounded-md transition-colors"
        )}
      />

      {/* Delete button for non-empty blocks */}
      {block.content && !isOnly && (
        <div
          className={cn(
            "absolute -right-2 top-1 opacity-0 transition-opacity",
            "group-hover:opacity-100"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/50 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Delete block
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
});

interface TranscriptBlockRendererProps {
  transcriptNote: TranscriptNote;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  dragHandleProps?: DragHandleProps;
}

const TranscriptBlockRenderer = React.memo(function TranscriptBlockRenderer({
  transcriptNote,
  onUpdate,
  onDelete,
  dragHandleProps,
}: TranscriptBlockRendererProps) {
  return (
    <div className="group relative">
      {/* Drag handle */}
      <div
        className={cn(
          "absolute -left-8 top-3 flex items-center gap-0.5 opacity-0 transition-opacity",
          "group-hover:opacity-100"
        )}
      >
        <BlockDragHandle dragHandleProps={dragHandleProps} />
      </div>

      <TranscriptNoteCard
        note={transcriptNote}
        onUpdate={(id, content) => onUpdate(content)}
        onDelete={() => onDelete()}
      />
    </div>
  );
});

// ============================================================================
// Sortable Block Wrapper
// ============================================================================

interface SortableBlockProps {
  id: string;
  children: (dragHandleProps: DragHandleProps) => React.ReactNode;
}

function SortableBlock({ id, children }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

interface AddBlockButtonProps {
  onClick: () => void;
  className?: string;
}

const AddBlockButton = React.memo(function AddBlockButton({
  onClick,
  className,
}: AddBlockButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className={cn(
        "relative h-6 flex items-center justify-center",
        "opacity-0 hover:opacity-100 transition-opacity",
        isHovered && "opacity-100",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/50" />
      <Button
        variant="outline"
        size="sm"
        className="relative h-5 px-2 text-[10px] bg-background hover:bg-muted"
        onClick={onClick}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add text
      </Button>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

/**
 * A Notion-like block-based notes panel for taking meeting notes.
 *
 * Features:
 * - Unified block-based architecture
 * - Text blocks and transcript reference blocks in one flow
 * - Inline editing with auto-growing textareas
 * - Add text blocks anywhere in the flow
 */
export const MeetingNotesPanel = React.memo(function MeetingNotesPanel({
  meetingTitle = "Meeting Notes",
  isExpanded: controlledExpanded,
  onExpandedChange,
  blocks = [],
  transcriptNotes = {},
  onAddTextBlock,
  onUpdateTextBlock,
  onDeleteBlock,
  onMoveBlock,
  onUpdateTranscriptNote,
  onDeleteTranscriptNote,
  className,
}: MeetingNotesPanelProps) {
  // Internal state for uncontrolled usage
  const [internalExpanded, setInternalExpanded] = React.useState(false);

  // Track which block should be auto-focused (used when creating first block from empty state)
  const [autoFocusBlockId, setAutoFocusBlockId] = React.useState<string | null>(null);

  // Clear auto-focus flag after it's been applied
  React.useEffect(() => {
    if (autoFocusBlockId) {
      const timer = setTimeout(() => setAutoFocusBlockId(null), 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocusBlockId]);

  // Determine if we're in controlled mode
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  // Stable callback using refs
  const onExpandedChangeRef = React.useRef(onExpandedChange);

  React.useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  const handleSetExpanded = React.useCallback((value: boolean) => {
    if (onExpandedChangeRef.current) {
      onExpandedChangeRef.current(value);
    } else {
      setInternalExpanded(value);
    }
  }, []);

  const handleToggle = React.useCallback(() => {
    handleSetExpanded(!isExpanded);
  }, [handleSetExpanded, isExpanded]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  // Count content
  const textBlockCount = blocks.filter((b) => b.type === "text").length;
  const transcriptBlockCount = blocks.filter((b) => b.type === "transcript").length;
  const hasContent = blocks.length > 0;

  // Add a text block at the end
  const handleAddTextBlockAtEnd = React.useCallback(() => {
    onAddTextBlock?.("");
  }, [onAddTextBlock]);

  // Add a text block after a specific block
  const handleAddTextBlockAfter = React.useCallback(
    (afterBlockId: string) => {
      onAddTextBlock?.("", afterBlockId);
    },
    [onAddTextBlock]
  );

  // Drag and drop sensors - memoized to prevent recreation on every render
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // Note: useSensors already memoizes internally based on sensor configurations

  // Handle drag end
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          onMoveBlock?.(active.id as string, newIndex);
        }
      }
    },
    [blocks, onMoveBlock]
  );

  // Get block IDs for sortable context
  const blockIds = React.useMemo(() => blocks.map((b) => b.id), [blocks]);

  // Empty placeholder block - stable reference to avoid impure Date.now() calls during render
  const emptyPlaceholderBlock = React.useMemo<TextBlock>(
    () => ({
      type: "text",
      id: "empty-placeholder",
      content: "",
      createdAt: 0,
      updatedAt: 0,
    }),
    []
  );

  return (
    <div
      className={cn(
        "relative flex flex-col bg-background/95 backdrop-blur-sm border-t border-border",
        "transition-[height] duration-200 ease-out",
        className
      )}
      style={{
        height: isExpanded ? EXPANDED_HEIGHT + COLLAPSED_HEIGHT : COLLAPSED_HEIGHT,
      }}
    >
      {/* Grabber Handle */}
      <div
        className={cn(
          "flex items-center justify-center h-7 cursor-pointer group",
          "hover:bg-muted/50 transition-colors"
        )}
        onClick={handleToggle}
        role="button"
        aria-label={isExpanded ? "Collapse notes panel" : "Expand notes panel"}
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-10 h-1 rounded-full bg-muted-foreground/30 transition-colors",
              "group-hover:bg-muted-foreground/50"
            )}
          />
          {!isExpanded && (
            <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors flex items-center gap-1">
              <ChevronUp className="h-3 w-3" />
              Click to open notes
              {hasContent && (
                <span className="ml-1 text-[10px] text-muted-foreground/40">
                  ({textBlockCount > 0 ? `${textBlockCount} text` : ""}
                  {textBlockCount > 0 && transcriptBlockCount > 0 ? ", " : ""}
                  {transcriptBlockCount > 0 ? `${transcriptBlockCount} linked` : ""})
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Content Area */}
      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden px-4 pb-3">
          <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between py-2 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  {meetingTitle}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleSetExpanded(false)}
                aria-label="Collapse notes"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Block-based Content */}
            <ScrollArea className="flex-1 min-h-0">
              <TooltipProvider delayDuration={0}>
                <div className="py-3 pl-8 pr-2 space-y-1">
                  {blocks.length === 0 ? (
                    // Empty state - show a single text block
                    <TextBlockEditor
                      block={emptyPlaceholderBlock}
                      onUpdate={(content) => {
                        if (content && onAddTextBlock) {
                          // Create block and capture its ID for auto-focus
                          const newBlock = onAddTextBlock(content);
                          if (newBlock) {
                            setAutoFocusBlockId(newBlock.id);
                          }
                        }
                      }}
                      onDelete={() => {}}
                      onAddAfter={handleAddTextBlockAtEnd}
                      isOnly={true}
                    />
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                      <SortableContext
                        items={blockIds}
                        strategy={verticalListSortingStrategy}
                      >
                        {blocks.map((block, index) => (
                          <React.Fragment key={block.id}>
                            {/* Add button between blocks */}
                            {index > 0 && (
                              <AddBlockButton
                                onClick={() => handleAddTextBlockAfter(blocks[index - 1].id)}
                              />
                            )}

                            <SortableBlock id={block.id}>
                              {(dragHandleProps) =>
                                block.type === "text" ? (
                                  <TextBlockEditor
                                    block={block}
                                    onUpdate={(content) => onUpdateTextBlock?.(block.id, content)}
                                    onDelete={() => onDeleteBlock?.(block.id)}
                                    onAddAfter={() => handleAddTextBlockAfter(block.id)}
                                    isOnly={blocks.length === 1}
                                    dragHandleProps={dragHandleProps}
                                    autoFocus={block.id === autoFocusBlockId}
                                  />
                                ) : // Guard against missing transcript note (data integrity)
                                transcriptNotes[block.transcriptNoteId] ? (
                                  <TranscriptBlockRenderer
                                    transcriptNote={transcriptNotes[block.transcriptNoteId]}
                                    onUpdate={(content) =>
                                      onUpdateTranscriptNote?.(block.transcriptNoteId, content)
                                    }
                                    onDelete={() => onDeleteTranscriptNote?.(block.transcriptNoteId)}
                                    dragHandleProps={dragHandleProps}
                                  />
                                ) : null
                              }
                            </SortableBlock>
                          </React.Fragment>
                        ))}

                        {/* Add button at the end */}
                        <AddBlockButton
                          onClick={handleAddTextBlockAtEnd}
                          className="mt-2"
                        />
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </TooltipProvider>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
});
