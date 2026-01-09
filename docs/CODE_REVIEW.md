### Reviwer1:

Phase 2 Code Review: @ Mention System

  Executive Summary

  Overall, the Phase 2 implementation is well-structured with good separation of concerns. However, I've identified several issues ranging from critical security concerns to minor optimizations.

  ---
  1. SECURITY ISSUES

  1.1 Critical: Regex ReDoS Vulnerability

  File: lib/agents/instruction-parser.ts:50

  const MENTION_REGEX = /@(?:"([^"]+)"|([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*))/g;

  Issue: The regex pattern (?:\s+[A-Za-z0-9_-]+)* can cause catastrophic backtracking with crafted input like @AAAAAAAAAAAAAAAAAAAAAAAAAAAA!. This is a potential Denial of Service (ReDoS) attack vector.

  Risk Level: High - Users can craft malicious input that freezes the browser.

  Recommendation: Add input length validation before regex execution or rewrite the regex to be non-backtracking:
  // Limit check before regex
  if (text.length > 10000) return [];

  // Or use possessive quantifier pattern
  const SAFE_MENTION_REGEX = /@(?:"([^"]{1,100})"|([A-Za-z0-9_-]{1,50}(?:\s[A-Za-z0-9_-]{1,50}){0,5}))/g;

  1.2 Medium: No Input Sanitization for Service Names

  File: lib/agents/instruction-parser.ts:91-106

  Service names from user input are directly compared but never sanitized. If AVAILABLE_SERVICES is ever modified to include special characters, this could cause issues.

  ---
  2. POTENTIAL BUGS

  2.1 Race Condition in Blur Handler

  File: components/agents/mention-input.tsx:253-257

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  Issue: If the user quickly focuses back on the input within 200ms, the popup will still close. This timeout is also not cleaned up on unmount, which could cause a memory leak or state update on unmounted component.

  Fix:
  const blurTimeoutRef = useRef<NodeJS.Timeout>();

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  2.2 Stale Closure in insertMention

  File: components/agents/mention-input.tsx:214-242

  const insertMention = useCallback(
    (entity: MentionableEntity) => {
      if (mentionStart === null || !textareaRef.current) return;
      const cursorPos = textareaRef.current.selectionStart;
      // ...
    },
    [mentionStart, value, onChange, onMentionInsert]
  );

  Issue: The handleKeyDown function depends on insertMention but insertMention is not in its dependency array. This creates a stale closure where old insertMention is called.

  Current (buggy):
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // ...
      if (suggestions[selectedIndex]) {
        insertMention(suggestions[selectedIndex]); // Stale!
      }
    },
    [isOpen, suggestions, selectedIndex] // Missing insertMention!
  );

  2.3 Index Calculation Bug in Command List

  File: components/agents/mention-input.tsx:302-306

  const actualIndex = suggestions.findIndex(
    (s) => s.id === entity.id && s.type === entity.type
  );

  Issue: This recalculates the index inside the map iteration, which is O(n²) and produces wrong results because it searches the full suggestions array, not the filtered one. The keyboard navigation highlight won't match the visual grouping.

  2.4 Missing Error State Handling in useMentionContext

  File: hooks/use-mention-context.ts

  The error state is set but never used in the consuming components. If API fails, users see no indication of the error.

  ---
  3. PERFORMANCE ISSUES

  3.1 Unnecessary Re-renders

  File: components/agents/agent-instructions-panel.tsx:89-98

  const parsedInstructions = useMemo<ParsedInstructions | null>(() => {
    if (!agent?.instructions) return null;
    return parseInstructions(agent.instructions, mentionContext);
  }, [agent?.instructions, mentionContext]);

  Issue: mentionContext changes on every re-render because it's a new object from the hook. This causes parsedInstructions to recalculate even when the data hasn't changed.

  Fix in hook:
  // In useMentionContext, memoize properly
  const context = useMemo<ParserContext>(
    () => ({
      folders,
      teams,
      services,
    }),
    [folders, teams, services] // Only change when data changes
  );

  3.2 Redundant Filtering in Suggestion Groups

  File: components/agents/mention-input.tsx:298-378

  The suggestions array is filtered 6 times (2x per type: once for .some() check and once for .filter()). This could be optimized:

  const grouped = useMemo(() => {
    const folders = suggestions.filter(s => s.type === "folder");
    const teams = suggestions.filter(s => s.type === "team");
    const services = suggestions.filter(s => s.type === "service");
    return { folders, teams, services };
  }, [suggestions]);

  3.3 New Array Creation on Every Render

  File: lib/agents/instruction-parser.ts:458-466

  const allEntities: MentionableEntity[] = [
    ...context.folders,
    ...context.teams,
    ...AVAILABLE_SERVICES.map(...)
  ];

  This creates new arrays on every call to getMentionSuggestions. Consider caching if called frequently.

  ---
  4. CODE DUPLICATION

  4.1 Duplicate Icon Logic

  Files: mention-input.tsx:64-85 and mention-tag.tsx:61-86

  Both files have nearly identical getEntityIcon / getIcon functions:

  // mention-input.tsx
  function getEntityIcon(entity: MentionableEntity) { ... }

  // mention-tag.tsx  
  function getIcon(reference: ParsedReference) { ... }

  Recommendation: Extract to a shared utility:
  // lib/agents/ui-helpers.ts
  export function getEntityIcon(type: string, name?: string): React.ReactNode { ... }

  4.2 Duplicate Color Logic

  Same pattern with getEntityColor and TYPE_COLORS constant. Both define blue for folders, violet for teams, emerald for services.

  ---
  5. ARCHITECTURE CONCERNS

  5.1 Single Responsibility Violation

  File: lib/agents/instruction-parser.ts

  This 550+ line file handles:
  1. Parsing logic
  2. Validation logic
  3. Autocomplete logic
  4. Reference extraction

  Recommendation: Split into separate modules:
  lib/agents/
  ├── parser.ts          # Core parsing
  ├── validator.ts       # Validation
  ├── autocomplete.ts    # Suggestion logic
  ├── references.ts      # Reference extraction helpers
  └── index.ts           # Re-exports

  5.2 Missing Abstraction for API Fetching

  File: hooks/use-mention-context.ts:46-59

  Direct fetch() calls without abstraction. Should use a shared API client:

  // Current
  const [foldersResponse, teamsResponse] = await Promise.all([
    fetch("/api/folders"),
    fetch("/api/teams"),
  ]);

  // Better - use existing api utilities if available
  const [folders, teams] = await Promise.all([
    api.folders.list(),
    api.teams.list(),
  ]);

  ---
  6. TYPE SAFETY ISSUES

  6.1 Unsafe Type Assertions

  File: hooks/use-mention-context.ts:173-175

  traverse(
    team.subteams as Array<{...}>
  );

  Using as cast on unknown data from API. If the shape changes, this silently fails.

  6.2 Missing Null Checks

  File: components/agents/mention-tag.tsx:72-73

  const serviceName = reference.name.toLowerCase();

  No null check on reference.name. If name is undefined, this throws.

  ---
  7. MEMORY LEAK POTENTIAL

  7.1 Timeout Not Cleaned Up

  File: components/agents/mention-input.tsx:253-257

  Already mentioned in bugs section - setTimeout without cleanup.

  7.2 Fetch Without Abort Controller

  File: hooks/use-mention-context.ts:44-97

  const fetchData = useCallback(async () => {
    const [foldersResponse, teamsResponse] = await Promise.all([
      fetch("/api/folders"),
      fetch("/api/teams"),
    ]);
    // ...
  }, []);

  If component unmounts during fetch, the state setters will be called on unmounted component.

  Fix:
  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      const [foldersRes, teamsRes] = await Promise.all([
        fetch("/api/folders", { signal: controller.signal }),
        fetch("/api/teams", { signal: controller.signal }),
      ]);
      // ...
    }

    fetchData();

    return () => controller.abort();
  }, []);

  ---
  8. EDGE CASES NOT HANDLED

  8.1 Empty Context Edge Case

  File: lib/agents/instruction-parser.ts:70-152

  If context.folders or context.teams is undefined (not empty array), buildNameMap will throw.

  8.2 Unicode/Emoji in Mentions

  The regex doesn't handle unicode characters in names. @Équipe or @チーム won't match.

  8.3 Very Long Mentions

  No length limit on quoted mentions: @"A very very very... (10000 chars)... long name" would pass.

  ---
  9. USABILITY ISSUES

  9.1 No Loading State for Context

  File: components/agents/mention-input.tsx

  When isMentionContextLoading is true, the component still shows the dropdown with empty results. Should show a loading indicator.

  9.2 Keyboard Selection Wrap-Around

  File: components/agents/mention-input.tsx:186-194

  Arrow navigation wraps from last to first, but the visual grouping (Folders/Teams/Services) doesn't align with the flat index, causing confusing UX.

  ---
  10. RECOMMENDATIONS SUMMARY
  ┌─────────────┬────────────────────────────────┬────────────────────────┬──────┐
  │  Priority   │             Issue              │          File          │ Line │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🔴 Critical │ ReDoS vulnerability            │ instruction-parser.ts  │ 50   │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🔴 High     │ Memory leak (setTimeout)       │ mention-input.tsx      │ 253  │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🔴 High     │ Stale closure in handleKeyDown │ mention-input.tsx      │ 210  │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟡 Medium   │ Race condition in blur         │ mention-input.tsx      │ 253  │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟡 Medium   │ Index calculation bug          │ mention-input.tsx      │ 302  │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟡 Medium   │ Missing AbortController        │ use-mention-context.ts │ 44   │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟢 Low      │ Code duplication (icons)       │ multiple               │ -    │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟢 Low      │ Performance (filtering)        │ mention-input.tsx      │ 298  │
  ├─────────────┼────────────────────────────────┼────────────────────────┼──────┤
  │ 🟢 Low      │ SRP violation                  │ instruction-parser.ts  │ -    │
  └─────────────┴────────────────────────────────┴────────────────────────┴──────┘
  ---
  11. POSITIVE OBSERVATIONS

  ✅ Clean separation between parsing logic and UI
  ✅ Proper use of TypeScript types
  ✅ Good JSDoc documentation
  ✅ Consistent code style and formatting
  ✅ Proper use of React hooks patterns (useCallback, useMemo)
  ✅ Accessibility-friendly Command component usage
  ✅ Dark mode support in MentionTag colors
  ✅ Good error display for unresolved references


### Code Reviewer2: 

 Findings from reviewing the Phase 2 uncommitted changes (agent instructions/mentions):

  - [High] lib/agents/instruction-parser.ts:55 – Services are matched only by id (gmail, calendar, slack), but MentionInput
    inserts the service display name (e.g., @"Google Calendar"). Calendar mentions will never resolve as services and end up
    flagged as unresolved folders, so referencedServices and downstream tool availability will be wrong.
  - [High] lib/agents/instruction-parser.ts:50 and lib/agents/instruction-parser.ts:498 – The mention regex and
    formatMentionForInsert don’t escape double quotes. Folder/team names are allowed to contain quotes, so inserting them
    produces invalid mention strings (e.g., @"Team "A"), and parsing will fail or misclassify those references.
  - [Medium] lib/agents/instruction-parser.ts:515 – When a user types a quoted multi-word mention (@"Sales …),
    getMentionQueryAtCursor returns a query that still includes the leading quote, so getMentionSuggestions yields no matches.
    Autocomplete effectively breaks for the quoted workflow, which is the format we encourage for multi-word names.
  - [Medium] hooks/use-mention-context.ts:40 and components/agents/agent-instructions-panel.tsx:88 – If fetching folders/teams
    fails (401/500), the hook returns empty context silently. The panel still parses and surfaces “Unresolved references,”
    implying user error when the data simply didn’t load. There’s no UI hint or retry gating, so users may save instructions
    with missing references.
  - [Low] components/agents/mention-tag.tsx:136 – Every mention tag instantiates its own TooltipProvider, creating many nested
    providers for long instruction bodies. This adds unnecessary providers/DOM nodes and can interfere with global tooltip
    behavior; prefer a single shared provider higher in the tree.