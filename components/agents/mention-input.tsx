"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import {
  getMentionQueryAtCursor,
  getMentionSuggestions,
  formatMentionForInsert,
  getEntityHexColor,
  getMentionableEntityIcon,
  type MentionableEntity,
  type ParserContext,
} from "@/lib/agents";

// ============================================================================
// Types
// ============================================================================

export interface MentionInputProps {
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Available entities for mentions */
  context: ParserContext;
  /** Placeholder text */
  placeholder?: string;
  /** Max length for input */
  maxLength?: number;
  /** Number of rows */
  rows?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
  /** Callback when a mention is inserted */
  onMentionInsert?: (entity: MentionableEntity) => void;
}

// ============================================================================
// Types for grouped suggestions
// ============================================================================

interface GroupedSuggestions {
  folders: MentionableEntity[];
  teams: MentionableEntity[];
  services: MentionableEntity[];
}

// ============================================================================
// Component
// ============================================================================

/**
 * MentionInput - Textarea with @ mention autocomplete support
 *
 * Features:
 * - Shows autocomplete popup when user types @
 * - Filters suggestions as user types
 * - Keyboard navigation (up/down/enter/escape)
 * - Inserts mention with proper formatting
 */
export const MentionInput = forwardRef<HTMLTextAreaElement, MentionInputProps>(
  function MentionInput(
    {
      value,
      onChange,
      context,
      placeholder = "Type @ to mention folders, teams, or services...",
      maxLength,
      rows = 6,
      disabled = false,
      className,
      onMentionInsert,
    },
    ref
  ) {
    const [isOpen, setIsOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<MentionableEntity[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Ref for blur timeout to prevent memory leaks and race conditions
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup blur timeout on unmount
    useEffect(() => {
      return () => {
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
        }
      };
    }, []);

    // Combine refs
    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    // Pre-compute grouped suggestions for better performance
    const groupedSuggestions = useMemo<GroupedSuggestions>(() => {
      return {
        folders: suggestions.filter((s) => s.type === "folder"),
        teams: suggestions.filter((s) => s.type === "team"),
        services: suggestions.filter((s) => s.type === "service"),
      };
    }, [suggestions]);

    // Pre-compute index mapping for keyboard navigation
    const indexMap = useMemo(() => {
      const map = new Map<string, number>();
      let index = 0;
      for (const entity of suggestions) {
        map.set(`${entity.type}-${entity.id}`, index);
        index++;
      }
      return map;
    }, [suggestions]);

    // Handle text change and check for @ mentions
    const handleChange = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;

        onChange(newValue);

        // Check if we're in a mention context
        const mentionQuery = getMentionQueryAtCursor(newValue, cursorPos);

        if (mentionQuery) {
          const newSuggestions = getMentionSuggestions(
            mentionQuery.query,
            context,
            8
          );
          setSuggestions(newSuggestions);
          setMentionStart(mentionQuery.startIndex);
          setSelectedIndex(0);
          setIsOpen(newSuggestions.length > 0);
        } else {
          setIsOpen(false);
          setMentionStart(null);
        }
      },
      [context, onChange]
    );

    // Insert a mention at the current cursor position
    const insertMention = useCallback(
      (entity: MentionableEntity) => {
        if (mentionStart === null || !textareaRef.current) return;

        const cursorPos = textareaRef.current.selectionStart;
        const beforeMention = value.slice(0, mentionStart);
        const afterMention = value.slice(cursorPos);
        const mentionText = formatMentionForInsert(entity.name);

        const newValue = beforeMention + mentionText + " " + afterMention;
        onChange(newValue);

        // Close popup
        setIsOpen(false);
        setMentionStart(null);

        // Move cursor after the inserted mention
        const newCursorPos = mentionStart + mentionText.length + 1;
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            textareaRef.current.focus();
          }
        });

        onMentionInsert?.(entity);
      },
      [mentionStart, value, onChange, onMentionInsert]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isOpen || suggestions.length === 0) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < suggestions.length - 1 ? prev + 1 : 0
            );
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : suggestions.length - 1
            );
            break;
          case "Enter":
          case "Tab":
            e.preventDefault();
            if (suggestions[selectedIndex]) {
              insertMention(suggestions[selectedIndex]);
            }
            break;
          case "Escape":
            e.preventDefault();
            setIsOpen(false);
            break;
        }
      },
      [isOpen, suggestions, selectedIndex, insertMention]
    );

    // Handle clicking on a suggestion
    const handleSuggestionClick = useCallback(
      (entity: MentionableEntity) => {
        insertMention(entity);
      },
      [insertMention]
    );

    // Close on blur with delay (to allow clicking suggestions)
    // Fixed: Uses ref for timeout and clears it properly
    const handleBlur = useCallback(() => {
      // Clear any existing timeout
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
      blurTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 200);
    }, []);

    // Cancel blur timeout on focus (fixes race condition)
    const handleFocus = useCallback(() => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    }, []);


    // Helper to get the actual index for an entity
    const getActualIndex = useCallback(
      (entity: MentionableEntity): number => {
        return indexMap.get(`${entity.type}-${entity.id}`) ?? -1;
      },
      [indexMap]
    );

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Textarea
              ref={setRefs}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={handleFocus}
              placeholder={placeholder}
              maxLength={maxLength}
              rows={rows}
              disabled={disabled}
              className={cn(
                "font-mono text-sm resize-none",
                className
              )}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="w-[280px] p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              {/* Folders Group */}
              {groupedSuggestions.folders.length > 0 && (
                <CommandGroup heading="Folders">
                  {groupedSuggestions.folders.map((entity) => {
                    const actualIndex = getActualIndex(entity);
                    return (
                      <CommandItem
                        key={`folder-${entity.id}`}
                        onSelect={() => handleSuggestionClick(entity)}
                        className={cn(
                          "cursor-pointer",
                          actualIndex === selectedIndex && "bg-accent"
                        )}
                      >
                        <div
                          className="size-3 rounded-sm"
                          style={{ backgroundColor: getEntityHexColor(entity) }}
                        />
                        <span>{entity.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {/* Teams Group */}
              {groupedSuggestions.teams.length > 0 && (
                <CommandGroup heading="Teams">
                  {groupedSuggestions.teams.map((entity) => {
                    const actualIndex = getActualIndex(entity);
                    return (
                      <CommandItem
                        key={`team-${entity.id}`}
                        onSelect={() => handleSuggestionClick(entity)}
                        className={cn(
                          "cursor-pointer",
                          actualIndex === selectedIndex && "bg-accent"
                        )}
                      >
                        <div
                          className="size-3 rounded-full"
                          style={{ backgroundColor: getEntityHexColor(entity) }}
                        />
                        <span>{entity.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {/* Services Group */}
              {groupedSuggestions.services.length > 0 && (
                <CommandGroup heading="Services">
                  {groupedSuggestions.services.map((entity) => {
                    const actualIndex = getActualIndex(entity);
                    return (
                      <CommandItem
                        key={`service-${entity.id}`}
                        onSelect={() => handleSuggestionClick(entity)}
                        className={cn(
                          "cursor-pointer",
                          actualIndex === selectedIndex && "bg-accent"
                        )}
                      >
                        {getMentionableEntityIcon(entity)}
                        <span>{entity.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);
