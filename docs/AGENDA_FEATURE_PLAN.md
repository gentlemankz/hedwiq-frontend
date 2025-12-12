# Meeting Agenda Builder & Automatic Progress Feature Plan

## Executive Summary

This document outlines the comprehensive implementation plan for adding a Meeting Agenda Builder and Automatic Agenda Progress tracking feature to Hedwiq. The feature enables users to create meeting agendas in the PreJoin screen, which are then tracked automatically by the AI agent during the meeting, showing real-time progress and topic completion in the meeting sidebar.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [User Flow](#2-user-flow)
3. [Technical Architecture](#3-technical-architecture)
4. [Database Design](#4-database-design)
5. [Frontend Implementation](#5-frontend-implementation)
6. [Agent Implementation](#6-agent-implementation)
7. [Data Flow & Communication](#7-data-flow--communication)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Risks & Mitigation](#9-risks--mitigation)
10. [Testing Strategy](#10-testing-strategy)
11. [Implementation Phases](#11-implementation-phases)

---

## 1. Feature Overview

### 1.1 Core Capabilities

**Agenda Builder (PreJoin)**
- Add agenda items with title and optional description
- Edit existing items (title, description)
- Delete items
- Reorder items via drag-and-drop
- Optional: Estimated duration per item

**Agenda Progress (Meeting)**
- Display agenda in sidebar alongside transcription
- Visual progress indicators (circles, connecting lines)
- Automatic topic detection via AI agent
- Real-time start/complete marking without user intervention
- Time tracking per topic
- Current topic highlighting

### 1.2 Key Principles

1. **Fully Automatic**: No manual "start topic" or "complete topic" buttons - the AI handles everything
2. **Non-Intrusive**: Agenda tracking should not interfere with natural conversation flow
3. **Graceful Degradation**: Meeting should work normally if agenda detection fails
4. **Real-Time Feedback**: Users see progress updates as they happen

---

## 1.3 Late Joiner Strategy (Critical)

**Problem**: LiveKit text streams are NOT replayed to participants who join after a stream starts. Relying only on text-stream events causes state loss for late joiners.

**Solution (Recommended): Agent Participant Attributes as Source of Truth**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     LATE JOINER SYNC STRATEGY                           │
│                                                                          │
│  Agent maintains agenda state in its participant attributes/metadata     │
│  (low-frequency updates, only on meaningful state changes)               │
│                                                                          │
│  ┌──────────────┐                      ┌──────────────────────┐         │
│  │    Agent     │  updates attributes  │   LiveKit Server     │         │
│  │  (hedwiq)    │─────────────────────►│  (auto-syncs to all) │         │
│  └──────────────┘                      └──────────────────────┘         │
│                                                 │                        │
│                                                 ▼                        │
│                                    ┌───────────────────────┐            │
│                                    │   All Participants    │            │
│                                    │   (including late     │            │
│                                    │    joiners)           │            │
│                                    └───────────────────────┘            │
│                                                                          │
│  Text streams (hedwiq.agenda) remain useful for:                        │
│  - Instant event animations (topic changed)                             │
│  - Fine-grained event details                                           │
│  But are NOT required for correctness                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Alternative Approaches** (for reference):

| Approach | Pros | Cons |
|----------|------|------|
| **Option 1: Participant Attributes** (Recommended) | Auto-synced by LiveKit; simple; no extra DB writes | Size limits (~16KB); not suitable for sensitive data |
| **Option 2: DB Persistence** | Full audit trail; works for post-meeting analysis | Higher complexity; agent needs DB write path |
| **Option 3: Direct Send on Join** | Targeted; immediate | Requires participant_connected handling; still needs fallback |

**Hybrid Approach** (Best of Both):
1. Agent updates participant attributes with compact state (IDs + status only)
2. Agent optionally writes events to DB for audit/replay
3. Frontend fetches full agenda definition from DB, uses attributes for live state

---

## 2. User Flow

### 2.1 PreJoin Phase - Agenda Creation

```
User opens meeting room
         │
         ▼
┌─────────────────────────────────────────┐
│           PreJoin Screen                │
│  ┌───────────────────────────────────┐  │
│  │         Video Preview              │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │         Media Controls             │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │    📋 Meeting Agenda (NEW)         │  │ ◄── Collapsible section
│  │    ├─ Add Topic Button             │  │
│  │    ├─ [Topic 1] ✏️ 🗑️ ↕️           │  │
│  │    ├─ [Topic 2] ✏️ 🗑️ ↕️           │  │
│  │    └─ [Topic 3] ✏️ 🗑️ ↕️           │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │    Reference Documents             │  │ ◄── Existing
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │    Username + Join Button          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**User Actions:**
1. Click "Meeting Agenda" to expand section
2. Click "Add Topic" to create new item
3. Enter title (required) and description (optional)
4. Optionally set estimated duration
5. Drag to reorder topics
6. Edit or delete as needed
7. Click "Join Meeting" - triggers join sequencing (see below)

### 2.1.1 Join Sequencing (Critical)

**The join flow MUST execute in this exact order to prevent the agent from missing the agenda:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      JOIN MEETING SEQUENCE                               │
│                                                                          │
│   User clicks "Join Meeting"                                            │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────────────────────────┐                               │
│   │ 1. SAVE AGENDA (PUT /api/rooms/     │                               │
│   │    [roomId]/agenda)                 │ ──► If fails: Show error,     │
│   │    - Creates draft or updates       │     DO NOT proceed            │
│   └─────────────────────────────────────┘                               │
│            │ Success                                                     │
│            ▼                                                             │
│   ┌─────────────────────────────────────┐                               │
│   │ 2. PUBLISH AGENDA (POST /api/rooms/ │                               │
│   │    [roomId]/agenda/publish)         │ ──► If fails: Show error,     │
│   │    - Transitions draft → active     │     DO NOT proceed            │
│   │    - Locks agenda definition        │                               │
│   └─────────────────────────────────────┘                               │
│            │ Success                                                     │
│            ▼                                                             │
│   ┌─────────────────────────────────────┐                               │
│   │ 3. REQUEST TOKEN (POST /api/livekit │                               │
│   │    /token)                          │ ──► If fails: Show error,     │
│   │    - Gets LiveKit access token      │     DO NOT proceed            │
│   └─────────────────────────────────────┘                               │
│            │ Success                                                     │
│            ▼                                                             │
│   ┌─────────────────────────────────────┐                               │
│   │ 4. CONNECT TO LIVEKIT               │                               │
│   │    - room.connect(token)            │                               │
│   │    - Agent joins and fetches agenda │                               │
│   └─────────────────────────────────────┘                               │
│                                                                          │
│   WHY THIS ORDER MATTERS:                                               │
│   - Agent fetches agenda immediately on room connect                    │
│   - If agenda isn't published before token request, agent may           │
│     fetch empty/stale data                                              │
│   - This sequencing guarantees agenda is ready before agent reads it    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation in PreJoin:**

```typescript
async function handleJoinMeeting() {
  setIsJoining(true);

  try {
    // Step 1: Save agenda (if items exist)
    if (agendaItems.length > 0) {
      const saveResult = await fetch(`/api/rooms/${roomId}/agenda`, {
        method: 'PUT',
        body: JSON.stringify({ items: agendaItems }),
      });
      if (!saveResult.ok) {
        throw new Error('Failed to save agenda');
      }

      // Step 2: Publish agenda (lock it in)
      const publishResult = await fetch(`/api/rooms/${roomId}/agenda/publish`, {
        method: 'POST',
      });
      if (!publishResult.ok) {
        throw new Error('Failed to publish agenda');
      }
    }

    // Step 3: Request token (only after agenda is published)
    const tokenResult = await fetch(`/api/livekit/token`, {
      method: 'POST',
      body: JSON.stringify({ roomId, username }),
    });
    if (!tokenResult.ok) {
      throw new Error('Failed to get token');
    }
    const { token } = await tokenResult.json();

    // Step 4: Connect to LiveKit
    onJoin({ token, username });

  } catch (error) {
    setError(error.message);
    // User stays on PreJoin screen - can retry
  } finally {
    setIsJoining(false);
  }
}
```

### 2.2 Meeting Phase - Agenda Progress

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Meeting Room                                  │
│ ┌────────────────────────────────────────┬───────────────────────────┐ │
│ │                                        │      Combined Sidebar     │ │
│ │                                        │  ┌─────────┬───────────┐  │ │
│ │                                        │  │ Agenda  │Transcript │  │ │ ◄── Wider sidebar
│ │          Video Conference              │  ├─────────┴───────────┤  │ │
│ │                                        │  │ ┌─────┬───────────┐ │  │ │
│ │                                        │  │ │AGND │  TRANS    │ │  │ │
│ │                                        │  │ │     │           │ │  │ │
│ │                                        │  │ │ ○─  │ [Message] │ │  │ │
│ │                                        │  │ │ │   │ [Message] │ │  │ │
│ │                                        │  │ │ ●─  │ [Message] │ │  │ │ ◄── Current topic
│ │                                        │  │ │ │   │ [Message] │ │  │ │     highlighted
│ │                                        │  │ │ ○   │ [Message] │ │  │ │
│ │                                        │  │ │     │           │ │  │ │
│ │                                        │  │ └─────┴───────────┘ │  │ │
│ │                                        │  └─────────────────────┘  │ │
│ └────────────────────────────────────────┴───────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

Agenda Panel Detail:
┌──────────────────────────────────┐
│ Meeting Agenda        Progress   │
│ ────────────────────  4/6        │
│ ▓▓▓▓▓▓▓▓▓░░░░░░                  │
│                                  │
│ ✓ Introduction                   │  ◄── Completed (green check)
│   5 min • Led by Sarah           │
│ │                                │
│ ✓ Technical Requirements         │  ◄── Completed
│   15 min • Led by Mike           │
│ │                                │
│ ● Design System Updates          │  ◄── CURRENT (highlighted, pulsing)
│   10 min • Led by Emma           │
│ │                                │
│ ○ Action Items & Next Steps      │  ◄── Pending (grey circle)
│   5 min • Led by Sarah           │
│                                  │
│ Est. remaining: 5 min            │
└──────────────────────────────────┘
```

**Visual States:**
- `✓` Completed - Green checkmark, full opacity
- `●` In Progress - Blue filled circle, subtle pulse animation
- `○` Pending - Grey outline circle

**Automatic Updates (No User Action Required):**
1. Agent detects topic transition from transcription
2. Publishes agenda event to LiveKit topic
3. Frontend receives and updates UI
4. Time tracking automatically records duration

---

## 3. Technical Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND                                      │
│                                                                          │
│  PreJoin ────────► Supabase DB ◄──────── Meeting Room                   │
│     │                  │                      ▲                          │
│     │                  │                      │                          │
│  AgendaBuilder    agenda table          AgendaContext                    │
│     │                  │                      │                          │
│     └──────────────────┼──────────────────────┘                          │
│                        │                      │                          │
│                        │              LiveKit Room                       │
│                        │           (hedwiq.agenda topic)                 │
└────────────────────────┼──────────────────────┼──────────────────────────┘
                         │                      │
                         ▼                      │
┌────────────────────────────────────────────────────────────────────────┐
│                              AGENT                                      │
│                                                                         │
│  ┌──────────────────┐      ┌────────────────────┐                      │
│  │ HedwiqAgent      │      │ AgendaTracker      │                      │
│  │                  │      │                    │                      │
│  │ - transcription  │─────►│ - load agenda      │                      │
│  │ - insights       │      │ - analyze speech   │                      │
│  │ - doc refs       │      │ - detect topics    │                      │
│  │ + agenda tracking│      │ - publish updates  │                      │
│  └──────────────────┘      └────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Diagram

```
Frontend Components:
├── app/meetings/[roomId]/
│   ├── pre-join-screen.tsx
│   │   └── components/
│   │       └── agenda-builder.tsx (NEW)
│   │           ├── agenda-item.tsx
│   │           ├── add-topic-dialog.tsx
│   │           └── sortable-list.tsx
│   └── components/
│       └── agenda-progress.tsx (NEW)
│           ├── agenda-item-progress.tsx
│           └── progress-indicator.tsx
│
├── contexts/
│   └── agenda-context.tsx (NEW)
│
├── types/
│   └── agenda.ts (NEW)
│
└── lib/db/
    ├── schema.ts (ADD agenda, agendaItem tables)
    └── agenda.ts (NEW - CRUD operations)

Agent Components:
├── hedwiq_agent.py (ADD AgendaTracker integration)
├── agenda_tracker.py (NEW)
│   ├── AgendaTracker class
│   ├── Topic detection logic
│   └── LiveKit publishing
├── prompts/
│   └── agenda_detection.py (NEW)
└── schemas/
    └── agenda.py (NEW)
```

---

## 4. Database Design

### 4.1 Schema Additions

```typescript
// lib/db/schema.ts

/**
 * Meeting Agendas - One per room, created by the meeting organizer
 */
export const agenda = pgTable("agenda", {
  /** Unique agenda identifier */
  id: text("id").primaryKey(),  // "agenda-{roomId}-{timestamp}"

  /** LiveKit room ID - unique constraint ensures one agenda per room */
  roomId: text("room_id").notNull().unique(),

  /** User who created the agenda */
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  /** Total number of items (denormalized for quick access) */
  itemCount: integer("item_count").notNull().default(0),

  /** Overall status: draft, active, completed */
  status: text("status").notNull().default("draft"),

  /** Current active item index (0-based, null if not started) */
  currentItemIndex: integer("current_item_index"),

  /**
   * Version number - incremented on definition edits.
   * Used for cache invalidation and conflict detection.
   * Agent can compare its cached version to detect if agenda changed mid-meeting.
   */
  version: integer("version").notNull().default(1),

  /** Meeting start time (when first item started) */
  meetingStartedAt: timestamp("meeting_started_at"),

  /** Meeting end time (when last item completed) */
  meetingEndedAt: timestamp("meeting_ended_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Agenda Items - Individual topics within an agenda
 */
export const agendaItem = pgTable("agenda_item", {
  /** Unique item identifier */
  id: text("id").primaryKey(),  // "item-{agendaId}-{index}"

  /** Parent agenda */
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agenda.id, { onDelete: "cascade" }),

  /** Display order (0-based) */
  orderIndex: integer("order_index").notNull(),

  /** Topic title (required) */
  title: text("title").notNull(),

  /** Topic description (optional) */
  description: text("description"),

  /** Estimated duration in minutes (optional) */
  estimatedDuration: integer("estimated_duration"),

  /** Assigned presenter/leader (optional) */
  presenter: text("presenter"),

  /** Item status: pending, in_progress, completed, skipped */
  status: text("status").notNull().default("pending"),

  /** Actual start time */
  startedAt: timestamp("started_at"),

  /** Actual end time */
  completedAt: timestamp("completed_at"),

  /** Actual duration in seconds (calculated) */
  actualDuration: integer("actual_duration"),

  /** Transcript segment ID when topic started (for linking) */
  startTranscriptRef: text("start_transcript_ref"),

  /** Transcript segment ID when topic ended */
  endTranscriptRef: text("end_transcript_ref"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Indices for efficient queries
// CREATE INDEX idx_agenda_room ON agenda(room_id);
// CREATE INDEX idx_agenda_item_agenda ON agenda_item(agenda_id);
// CREATE INDEX idx_agenda_item_order ON agenda_item(agenda_id, order_index);
```

### 4.2 Database Operations

```typescript
// lib/db/agenda.ts

export async function createAgenda(
  roomId: string,
  createdBy: string,
  items: { title: string; description?: string; estimatedDuration?: number; presenter?: string }[]
): Promise<{ agendaId: string; items: AgendaItem[] }>;

export async function getAgendaByRoomId(roomId: string): Promise<Agenda | null>;

export async function getAgendaWithItems(roomId: string): Promise<AgendaWithItems | null>;

export async function updateAgendaItem(
  itemId: string,
  updates: Partial<Pick<AgendaItem, 'title' | 'description' | 'estimatedDuration' | 'orderIndex'>>
): Promise<void>;

export async function deleteAgendaItem(itemId: string): Promise<void>;

export async function reorderAgendaItems(
  agendaId: string,
  itemIds: string[]  // In new order
): Promise<void>;

export async function updateAgendaItemStatus(
  itemId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'skipped',
  transcriptRef?: string
): Promise<void>;

export async function startAgendaItem(
  itemId: string,
  transcriptRef: string
): Promise<void>;

export async function completeAgendaItem(
  itemId: string,
  transcriptRef: string
): Promise<void>;
```

### 4.3 Data Integrity Considerations

**Race Conditions:**
- Multiple users editing agenda simultaneously → Use optimistic locking with `updatedAt`
- Agent updating while frontend modifying → Separate concerns (agent only updates status/times)
- Multiple agent instances → Should not happen (one agent per room), but add idempotency checks

**Orphaned Data:**
- Room deleted → Cascade delete agenda and items
- User deleted → Cascade delete, but agenda remains (created by different user issue)

**Migration Strategy:**
1. Create new tables with proper indices
2. No data migration needed (new feature)
3. Add RLS policies in Supabase for direct database access (if needed)

---

## 5. Frontend Implementation

### 5.1 Type Definitions

```typescript
// types/agenda.ts

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  estimatedDuration?: number;  // minutes
  presenter?: string;
  orderIndex: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  startedAt?: number;  // timestamp
  completedAt?: number;
  actualDuration?: number;  // seconds
  startTranscriptRef?: string;
  endTranscriptRef?: string;
}

export interface Agenda {
  id: string;
  roomId: string;
  createdBy: string;
  itemCount: number;
  status: 'draft' | 'active' | 'completed';
  currentItemIndex: number | null;
  meetingStartedAt?: number;
  meetingEndedAt?: number;
  items: AgendaItem[];
}

export interface AgendaProgressEvent {
  type: 'topic_started' | 'topic_completed' | 'topic_skipped' | 'meeting_started' | 'meeting_ended';
  itemId: string;
  itemIndex: number;
  timestamp: number;
  transcriptRef?: string;
  confidence: number;
  reason?: string;  // Why agent made this decision
}

// For PreJoin - before saving to DB
export interface DraftAgendaItem {
  id: string;  // Temporary client ID
  title: string;
  description?: string;
  estimatedDuration?: number;
  presenter?: string;
}
```

### 5.2 Agenda Builder Component (PreJoin)

**Key Implementation Decisions:**

1. **State Management**: Local state in PreJoin, saved to DB on join
   - Simpler than context for draft state
   - Only persists when user commits (joins meeting)
   - Allows "discard changes" by simply leaving

2. **Drag-and-Drop**: Use `@dnd-kit/core` (already used by shadcn)
   - Accessible drag-and-drop
   - Touch support
   - Keyboard navigation

3. **Validation**:
   - Title required, 1-100 characters
   - Description optional, max 500 characters
   - Duration optional, 1-120 minutes
   - Maximum 20 items per agenda

4. **UX Patterns**:
   - Inline editing (click to edit, blur to save)
   - Confirmation for delete
   - Visual feedback on reorder
   - Empty state with example suggestions

```typescript
// Conceptual structure
interface AgendaBuilderProps {
  roomId: string;
  initialItems?: DraftAgendaItem[];
  onChange: (items: DraftAgendaItem[]) => void;
}

// Integration in PreJoin:
// - AgendaBuilder renders in collapsible section
// - On "Join Meeting", items passed via UserChoices
// - meeting-room.tsx creates agenda in DB before connecting
```

### 5.3 Agenda Context (Meeting)

```typescript
// contexts/agenda-context.tsx

interface AgendaContextValue {
  // State
  agenda: Agenda | null;
  isLoading: boolean;
  error: string | null;

  // Computed
  currentItem: AgendaItem | null;
  completedItems: AgendaItem[];
  pendingItems: AgendaItem[];
  progressPercentage: number;
  estimatedRemainingTime: number;  // minutes

  // For linking transcript messages to topics
  getTopicForTranscript: (transcriptRef: string) => AgendaItem | null;

  // Manual overrides (if needed - should be rare)
  forceStartItem: (itemId: string) => Promise<void>;
  forceCompleteItem: (itemId: string) => Promise<void>;
  forceSkipItem: (itemId: string) => Promise<void>;
}
```

**LiveKit Topic Subscription:**

```typescript
const AGENDA_TOPIC = "hedwiq.agenda";

// In AgendaProvider:
useEffect(() => {
  if (!room) return;

  room.registerTextStreamHandler(AGENDA_TOPIC, handleAgendaStream);

  return () => {
    room.unregisterTextStreamHandler(AGENDA_TOPIC);
  };
}, [room]);

const handleAgendaStream = async (reader, participantInfo) => {
  const data = JSON.parse(await reader.readAll());
  const event = data as AgendaProgressEvent;

  switch (event.type) {
    case 'topic_started':
      updateItemStatus(event.itemId, 'in_progress', event.timestamp);
      break;
    case 'topic_completed':
      updateItemStatus(event.itemId, 'completed', event.timestamp);
      advanceToNextItem();
      break;
    // ... etc
  }
};
```

### 5.4 Agenda Progress Component (Sidebar)

**Layout Changes:**

Current sidebar: `w-96` (384px)
New sidebar: `w-[520px]` or flexible with min-width

```
┌──────────────────────────────────────────────────────────┐
│  Tabs: [Transcript] [Insights]                     [X]   │
├────────────────────┬─────────────────────────────────────┤
│   Agenda Progress  │        Transcription                │
│   (180px fixed)    │        (flex-1)                     │
├────────────────────┼─────────────────────────────────────┤
│  6/6 ▓▓▓▓▓▓▓▓▓▓   │  [Avatar] Speaker Name              │
│                    │  "Message text here..."             │
│  ✓ Topic 1         │  [insight badge]                    │
│    5m • Sarah      │                                     │
│  │                 │  [Avatar] Speaker Name              │
│  ● Topic 2  ←NOW   │  "Another message..."               │
│    10m • Mike      │                                     │
│  │                 │                                     │
│  ○ Topic 3         │                                     │
│    5m • Emma       │                                     │
│                    │                                     │
│  Est: 5m left      │                                     │
└────────────────────┴─────────────────────────────────────┘
```

**Visual Design Specifications:**

```css
/* Progress line connecting items */
.agenda-connector {
  position: absolute;
  left: 12px;  /* Center of circle */
  width: 2px;
  background: linear-gradient(to bottom, var(--completed-color), var(--pending-color));
}

/* Status circles */
.status-pending {
  @apply border-2 border-muted-foreground bg-transparent;
}
.status-in-progress {
  @apply bg-primary animate-pulse;
}
.status-completed {
  @apply bg-green-500;
}

/* Current topic highlight */
.current-topic {
  @apply bg-primary/10 border-l-2 border-primary;
}
```

### 5.5 Error States & Loading

**Loading States:**
1. Agenda loading on room join → Skeleton UI
2. Waiting for agent connection → "Connecting to AI assistant..."
3. Topic detection pending → Normal state (no indicator needed)

**Error States:**
1. Agenda failed to load → Show error with retry button
2. Agent not connected → Show warning, allow manual control
3. Topic detection confidence low → Optional: show "AI uncertain" indicator

**No Agenda State:**
- If room has no agenda → Don't show agenda panel
- Optional: "Add agenda" button to create mid-meeting

---

## 6. Agent Implementation

### 6.1 AgendaTracker Class

```python
# agent/agenda_tracker.py

@dataclass
class AgendaItem:
    id: str
    title: str
    description: Optional[str]
    order_index: int
    status: str  # pending, in_progress, completed, skipped
    keywords: List[str]  # Extracted from title/description for matching

@dataclass
class AgendaTracker:
    room: rtc.Room
    room_id: str
    llm: LLM

    # State
    agenda: Optional[Agenda] = None
    current_item_index: int = -1  # -1 = not started

    # Buffers
    recent_transcripts: List[TranscriptEntry] = field(default_factory=list)

    # Analysis control
    analysis_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_analysis_time: float = 0

    async def start(self):
        """Initialize tracker - load agenda from database."""
        self.agenda = await self._load_agenda_from_db()
        if self.agenda:
            logger.info(f"Loaded agenda with {len(self.agenda.items)} items")

    async def process_transcript(self, entry: TranscriptEntry):
        """Called for each final transcript segment."""
        if not self.agenda or not entry.is_final:
            return

        self.recent_transcripts.append(entry)

        # Keep buffer reasonable
        if len(self.recent_transcripts) > 20:
            self.recent_transcripts = self.recent_transcripts[-20:]

        # Debounced analysis
        await self._maybe_analyze()

    async def _maybe_analyze(self):
        """Analyze transcripts for topic changes."""
        now = time.time()
        if now - self.last_analysis_time < 5.0:  # 5 second debounce
            return

        async with self.analysis_lock:
            self.last_analysis_time = now
            await self._detect_topic_change()

    async def _detect_topic_change(self):
        """Use LLM to detect if topic has changed."""
        # Implementation below
        pass

    async def _publish_event(self, event: AgendaProgressEvent):
        """Publish agenda event to LiveKit."""
        await self.room.local_participant.send_text(
            json.dumps(asdict(event)),
            topic="hedwiq.agenda",
            attributes={
                "event_type": event.type,
                "item_id": event.item_id,
            }
        )
```

### 6.2 Topic Detection Strategy

**Stability/Hysteresis Requirements (Critical for Preventing Thrashing):**

To prevent rapid, incorrect topic switching, the agent must enforce stability requirements:

```python
# Stability Constants
STABILITY_CONSECUTIVE_K = 2       # Require K consecutive predictions of same topic
STABILITY_TIME_THRESHOLD = 10.0   # OR require T seconds of consistent prediction
SWITCH_CONFIDENCE_THRESHOLD = 0.75  # Minimum confidence to consider a switch
HYSTERESIS_COOLDOWN = 15.0        # Minimum seconds between topic switches

# State tracking
last_switch_time: float = 0
consecutive_predictions: int = 0
last_predicted_topic: str | None = None

def should_commit_topic_switch(predicted_topic: str, confidence: float) -> bool:
    """Determine if we should commit to switching topics."""
    now = time.time()

    # Hysteresis: don't switch too soon after last switch
    if now - last_switch_time < HYSTERESIS_COOLDOWN:
        return False

    # Confidence check
    if confidence < SWITCH_CONFIDENCE_THRESHOLD:
        return False

    # Stability check: same prediction K times in a row
    if predicted_topic == last_predicted_topic:
        consecutive_predictions += 1
    else:
        consecutive_predictions = 1
        last_predicted_topic = predicted_topic

    # Require either K consecutive OR T seconds of stability
    time_stable = (now - first_prediction_time) >= STABILITY_TIME_THRESHOLD
    count_stable = consecutive_predictions >= STABILITY_CONSECUTIVE_K

    return time_stable or count_stable
```

**Multi-Signal Approach:**

The agent uses multiple signals to detect topic transitions, not just LLM analysis:

```
Signal 1: Explicit Mentions (Highest Confidence)
├── "Let's move to [topic name]"
├── "Next on the agenda is..."
├── "Moving on to..."
├── "That covers [previous topic], now..."
└── Confidence: 0.95+

Signal 2: Keyword Matching (Medium Confidence)
├── Topic title words appearing in speech
├── Topic description words appearing
├── N-gram matching with fuzzy tolerance
└── Confidence: 0.7-0.85

Signal 3: LLM Analysis (Variable Confidence)
├── Semantic understanding of conversation
├── Context from previous segments
├── Returns confidence score
└── Confidence: 0.6-0.95 (from LLM)

Signal 4: Time-Based Heuristics (Low Confidence, Fallback)
├── Estimated duration exceeded by 50%
├── Long silence followed by new speaker
├── Meeting nearing end with items remaining
└── Confidence: 0.5-0.6
```

**Topic Detection Algorithm:**

```python
async def _detect_topic_change(self):
    if self.current_item_index == -1:
        # Meeting not started - check for meeting start signals
        await self._check_meeting_start()
        return

    current_item = self.agenda.items[self.current_item_index]
    next_item = self._get_next_pending_item()

    if not next_item:
        # All items done - check for meeting end
        await self._check_meeting_end()
        return

    # Combine recent transcripts
    recent_text = " ".join([t.text for t in self.recent_transcripts[-10:]])

    # Signal 1: Explicit transition phrases
    explicit_score = self._check_explicit_transitions(recent_text, next_item)
    if explicit_score > 0.9:
        await self._transition_to_item(next_item, confidence=explicit_score, reason="explicit_mention")
        return

    # Signal 2: Keyword matching
    keyword_score = self._check_keyword_match(recent_text, next_item)

    # Signal 3: LLM analysis (only if signals 1-2 inconclusive)
    if keyword_score > 0.5 or self._should_run_llm_check():
        llm_result = await self._llm_topic_analysis(recent_text, current_item, next_item)

        # Combine signals with weighted average
        combined_confidence = self._combine_signals(
            explicit=explicit_score,
            keyword=keyword_score,
            llm=llm_result.confidence if llm_result else 0
        )

        if combined_confidence > 0.7:  # Threshold for transition
            await self._transition_to_item(
                next_item,
                confidence=combined_confidence,
                reason=llm_result.reason if llm_result else "keyword_match"
            )

def _check_explicit_transitions(self, text: str, next_item: AgendaItem) -> float:
    """Check for explicit topic transition phrases."""
    transition_patterns = [
        r"let's move (on )?to\s+(.+)",
        r"next (on the agenda|item|topic) is\s+(.+)",
        r"moving on to\s+(.+)",
        r"now (let's|we'll) (discuss|talk about|cover)\s+(.+)",
        r"that covers (.+),? now",
    ]

    for pattern in transition_patterns:
        match = re.search(pattern, text.lower())
        if match:
            mentioned_topic = match.group(match.lastindex)
            similarity = self._fuzzy_match(mentioned_topic, next_item.title)
            if similarity > 0.6:
                return 0.95

    return 0.0

def _check_keyword_match(self, text: str, item: AgendaItem) -> float:
    """Check if item keywords appear in recent speech."""
    text_words = set(text.lower().split())
    item_keywords = set(item.keywords)

    if not item_keywords:
        return 0.0

    overlap = len(text_words & item_keywords)
    score = overlap / len(item_keywords)

    return min(score, 0.85)  # Cap at 0.85 for keyword-only
```

### 6.2.1 Off-Agenda Handling

When discussion veers away from any agenda topic, the agent must handle it gracefully:

```python
# Off-agenda detection constants
OFF_AGENDA_PERSIST_THRESHOLD = 120.0  # 2 minutes of off-agenda before flagging
OFF_AGENDA_HIGH_CONFIDENCE = 0.85     # Very high confidence needed to mark off-agenda

@dataclass
class OffAgendaState:
    is_off_agenda: bool = False
    started_at: float | None = None
    current_topic_when_departed: str | None = None

async def handle_off_agenda_detection(
    self,
    llm_result: TopicAnalysisResult,
    off_agenda_state: OffAgendaState
) -> None:
    """Handle when LLM indicates discussion is off-agenda."""

    if llm_result.predicted_topic == "off_agenda":
        now = time.time()

        if not off_agenda_state.is_off_agenda:
            # Just went off-agenda - start tracking but DON'T switch yet
            off_agenda_state.started_at = now
            off_agenda_state.current_topic_when_departed = self.current_item.id
            # Keep current topic active - don't change UI yet
            return

        # Already off-agenda - check if persistent
        duration = now - off_agenda_state.started_at
        if duration >= OFF_AGENDA_PERSIST_THRESHOLD and llm_result.confidence >= OFF_AGENDA_HIGH_CONFIDENCE:
            # Persistent off-agenda with high confidence - publish status
            await self._publish_off_agenda_status(
                reason="Discussion has departed from agenda topics",
                duration=duration
            )
    else:
        # Back on agenda - reset off-agenda tracking
        off_agenda_state.is_off_agenda = False
        off_agenda_state.started_at = None
```

**UI Behavior for Off-Agenda:**
- Keep current topic highlighted (don't clear it)
- Optionally show subtle "Discussion has veered off-agenda" indicator
- When discussion returns to any agenda topic, remove indicator
- Never mark a topic as "completed" just because discussion went off-agenda

### 6.3 LLM Prompt for Topic Detection

```python
# prompts/agenda_detection.py

TOPIC_DETECTION_SYSTEM_PROMPT = """You are a meeting analyst detecting when discussion topics change.

Given:
1. Recent meeting transcript (last 2-3 minutes)
2. Current agenda topic being discussed
3. Next agenda topic

Determine if the conversation has transitioned from the current topic to the next topic.

Respond with JSON only:
{
  "has_transitioned": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "evidence": "relevant quote from transcript"
}

Guidelines:
- has_transitioned=true only if clearly discussing the next topic
- High confidence (0.8+) requires explicit transition or sustained discussion of new topic
- Medium confidence (0.6-0.8) for indirect transitions or topic drift
- Low confidence (<0.6) means current topic still active
- Ignore brief mentions of future topics (that's anticipation, not transition)
- Consider that topics may naturally overlap or flow into each other
"""

TOPIC_DETECTION_USER_TEMPLATE = """
## Current Agenda Topic
Title: {current_title}
Description: {current_description}

## Next Agenda Topic
Title: {next_title}
Description: {next_description}

## Recent Transcript
{transcript}

Has the discussion transitioned to the next topic?
"""
```

### 6.4 Integration with HedwiqAgent

```python
# hedwiq_agent.py modifications

class HedwiqAgent:
    def __init__(self, room, room_id=None, ...):
        # ... existing init ...

        # Initialize agenda tracker
        self.agenda_tracker = AgendaTracker(
            room=room,
            room_id=self.room_id,
            llm=self.llm,
        )

    async def start(self):
        # ... existing start code ...

        # Start agenda tracker
        await self.agenda_tracker.start()

    async def stop(self):
        # ... existing stop code ...

        # Stop agenda tracker
        await self.agenda_tracker.stop()

# In ParticipantTranscriber - add agenda tracking:
async def _on_transcript(self, entry: TranscriptEntry):
    # ... existing publish to lk.transcription ...

    # Feed to agenda tracker
    if entry.is_final:
        await self.agenda_tracker.process_transcript(entry)
```

### 6.5 Database Integration for Agent

The agent needs to read agenda from database and update item statuses:

```python
# agent/db/agenda.py

import asyncpg
import os

class AgendaDB:
    def __init__(self):
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"))

    async def get_agenda_for_room(self, room_id: str) -> Optional[Agenda]:
        """Fetch agenda with items for a room."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM agenda WHERE room_id = $1",
                room_id
            )
            if not row:
                return None

            items = await conn.fetch(
                "SELECT * FROM agenda_item WHERE agenda_id = $1 ORDER BY order_index",
                row['id']
            )

            return Agenda(
                id=row['id'],
                room_id=row['room_id'],
                items=[AgendaItem(**item) for item in items],
                # ... other fields
            )

    async def update_item_status(
        self,
        item_id: str,
        status: str,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        transcript_ref: Optional[str] = None
    ):
        """Update agenda item status and timestamps."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                UPDATE agenda_item
                SET status = $1,
                    started_at = COALESCE($2, started_at),
                    completed_at = COALESCE($3, completed_at),
                    start_transcript_ref = COALESCE($4, start_transcript_ref),
                    end_transcript_ref = COALESCE($5, end_transcript_ref),
                    actual_duration = CASE
                        WHEN $3 IS NOT NULL AND started_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM ($3 - started_at))::INTEGER
                        ELSE actual_duration
                    END,
                    updated_at = NOW()
                WHERE id = $6
            """, status, started_at, completed_at,
                transcript_ref if status == 'in_progress' else None,
                transcript_ref if status == 'completed' else None,
                item_id)
```

---

## 7. Data Flow & Communication

### 7.1 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PREJOIN PHASE                                      │
│                                                                              │
│  User creates agenda items ──► Local state (DraftAgendaItem[])              │
│                                        │                                     │
│  User clicks "Join Meeting"            ▼                                     │
│                             POST /api/agenda/create                          │
│                                        │                                     │
│                                        ▼                                     │
│                             Create agenda + items in DB                      │
│                                        │                                     │
│                                        ▼                                     │
│                             Return agendaId in UserChoices                   │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEETING PHASE                                      │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         FRONTEND                                       │  │
│  │                                                                        │  │
│  │  AgendaContext loads agenda from DB                                    │  │
│  │         │                                                              │  │
│  │         ├──► Render AgendaProgress component                           │  │
│  │         │                                                              │  │
│  │         └──► Subscribe to hedwiq.agenda topic                          │  │
│  │                    │                                                   │  │
│  │                    ▼                                                   │  │
│  │         On AgendaProgressEvent ──► Update local state ──► Re-render    │  │
│  │                                          │                             │  │
│  │                                          ▼                             │  │
│  │                                   Persist to DB (optional)             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          AGENT                                         │  │
│  │                                                                        │  │
│  │  HedwiqAgent joins room                                                │  │
│  │         │                                                              │  │
│  │         ├──► AgendaTracker.start() ──► Load agenda from DB             │  │
│  │         │                                                              │  │
│  │         └──► On each transcript segment:                               │  │
│  │                    │                                                   │  │
│  │                    ▼                                                   │  │
│  │         AgendaTracker.process_transcript()                             │  │
│  │                    │                                                   │  │
│  │                    ▼                                                   │  │
│  │         Detect topic change (multi-signal)                             │  │
│  │                    │                                                   │  │
│  │                    ▼ (if topic changed)                                │  │
│  │         Update DB ──► Publish hedwiq.agenda event                      │  │
│  │                              │                                         │  │
│  └──────────────────────────────┼────────────────────────────────────────┘  │
│                                 │                                            │
│                                 ▼                                            │
│                      LiveKit Room (pub/sub)                                  │
│                                 │                                            │
│                                 └──────────► All participants receive        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Event Types

```typescript
// All events published to hedwiq.agenda topic

// Meeting lifecycle
{ type: 'meeting_started', timestamp: number }
{ type: 'meeting_ended', timestamp: number }

// Topic lifecycle
{
  type: 'topic_started',
  itemId: string,
  itemIndex: number,
  timestamp: number,
  transcriptRef: string,
  confidence: number
}

{
  type: 'topic_completed',
  itemId: string,
  itemIndex: number,
  timestamp: number,
  transcriptRef: string,
  confidence: number,
  actualDuration: number  // seconds
}

{
  type: 'topic_skipped',
  itemId: string,
  itemIndex: number,
  timestamp: number,
  reason: string
}

// Sync events (for late joiners)
{
  type: 'agenda_sync',
  agenda: Agenda,  // Full agenda state
  currentItemIndex: number
}
```

### 7.3 Late Joiner Handling

**Primary Mechanism: Agent Participant Attributes**

When a participant joins mid-meeting:

1. **LiveKit auto-syncs agent's participant attributes** (contains compact agenda state)
2. **Frontend reads agent's attributes immediately** on participant list update
3. **Frontend loads full agenda definition from DB** (for titles/descriptions)
4. **Frontend merges attribute state with DB definition** for complete UI

```typescript
// Frontend: Listen for agent participant updates
useEffect(() => {
  const agent = participants.find(p => p.identity === 'hedwiq-agent');
  if (agent?.attributes?.agendaState) {
    const state = JSON.parse(agent.attributes.agendaState);
    setAgendaState(state);  // { currentItemId, completedIds, startedAt }
  }
}, [participants]);
```

**Fallback: Text Stream Sync Event**

If agent attributes are stale or missing:
1. Agent optionally publishes `agenda_sync` text stream event
2. Useful for immediate animations but NOT required for correctness

This ensures all participants see consistent agenda progress regardless of when they join, without relying on text stream replay.

---

## 8. Edge Cases & Error Handling

### 8.1 Topic Detection Edge Cases

| Scenario | Detection Challenge | Mitigation Strategy |
|----------|---------------------|---------------------|
| **Topics discussed out of order** | User jumps to topic 3 before topic 2 | Allow non-sequential transitions; mark skipped items |
| **Topic revisited** | Return to previously completed topic | Don't re-open completed; note in transcript link |
| **Parallel topic discussion** | Two topics discussed simultaneously | Use primary topic (higher keyword match); log ambiguity |
| **No clear transition** | Gradual topic drift | Use time-based heuristics + LLM analysis |
| **Off-agenda discussion** | Tangent not in agenda | Keep current topic active; don't force transitions |
| **Very short topic** | Topic completed in 30 seconds | Allow quick transitions if confidence high |
| **Very long topic** | Topic runs 3x estimated time | Don't auto-advance; wait for actual transition |
| **Meeting ends without completing all** | Time runs out | Mark remaining as "skipped" with reason |
| **Single-person monologue** | One speaker covers all topics | Rely more on keyword/LLM signals |

### 8.2 Technical Edge Cases

| Scenario | Problem | Solution |
|----------|---------|----------|
| **Agent not connected** | No topic detection | Show warning; enable manual controls |
| **Agent restarts mid-meeting** | Loses context | Re-load agenda from DB; sync with frontend state |
| **DB write fails** | Status not persisted | Retry with backoff; log error; continue real-time updates |
| **LLM timeout** | Topic detection delayed | Fall back to keyword matching only |
| **Multiple simultaneous speakers** | Noisy transcript | Use combined text; weight by speaker duration |
| **Poor audio quality** | Bad transcription | Lower confidence thresholds; more conservative transitions |
| **Empty agenda** | No items to track | Don't show agenda panel; normal meeting mode |
| **Deleted agenda mid-meeting** | Agenda disappears | Graceful degradation; hide panel |

### 8.3 Error Recovery Patterns

```typescript
// Frontend error recovery
async function fetchAgendaWithRetry(roomId: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchAgenda(roomId);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        setError("Failed to load agenda. Meeting continues normally.");
        return null;
      }
      await sleep(1000 * Math.pow(2, attempt));  // Exponential backoff
    }
  }
}

// Agent error recovery
async def _transition_to_item_safe(self, item, confidence, reason):
    try:
        # Update database first
        await self.db.update_item_status(item.id, 'in_progress', ...)
    except Exception as e:
        logger.error(f"DB update failed: {e}")
        # Continue with LiveKit update - frontend will have correct state

    try:
        # Then publish event
        await self._publish_event(AgendaProgressEvent(...))
    except Exception as e:
        logger.error(f"Event publish failed: {e}")
        # Frontend may miss update; will sync on next event or page refresh
```

---

## 9. Risks & Mitigation

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **LLM latency causes delayed updates** | Medium | Medium | Pre-compute keywords; use fast signals first; async LLM |
| **False positive topic transitions** | Medium | High | Conservative thresholds; multi-signal confirmation; easy manual override |
| **False negative (missed transitions)** | Medium | Medium | Time-based fallbacks; keyword matching; user can manually advance |
| **Database bottleneck** | Low | Medium | Connection pooling; batch updates; local state as primary |
| **LiveKit message loss** | Low | Low | Periodic sync events; DB as source of truth |
| **Agent memory leak (long meetings)** | Low | High | Bounded buffers; periodic cleanup; process restart on OOM |

### 9.2 UX Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Agenda distracts from meeting** | Medium | Medium | Collapsible panel; subtle updates; non-intrusive design |
| **Incorrect topic shown** | Medium | High | Clear "AI-detected" indicator; manual override option |
| **Agenda panel too small to be useful** | Medium | Medium | Responsive design; hover for full info; expand on click |
| **Users confused by automatic updates** | Low | Medium | Onboarding tooltip; clear visual feedback on transitions |
| **Agenda creation too complex** | Low | Medium | Simple defaults; optional fields; import from template |

### 9.3 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Increased LLM costs** | Medium | Medium | Efficient prompts; batching; cache results; keyword-first approach |
| **Feature bloat in PreJoin** | Low | Medium | Collapsible section; only show if agenda exists |
| **Scope creep** | High | Medium | Strict phase boundaries; MVP first; defer enhancements |

### 9.4 Security Considerations

**Participant Attributes Data Exposure:**

LiveKit participant attributes are visible to ALL room participants. This has security implications:

| Concern | Risk | Mitigation |
|---------|------|------------|
| **Sensitive agenda content** | Agenda titles/descriptions visible to all participants | Store only IDs + status in attributes, not full text |
| **Data leakage to unauthorized users** | Non-participants could potentially see attributes | Use roomParticipant access control; validate on API routes |
| **Service role key exposure** | Agent uses privileged credentials | Never expose SUPABASE_SERVICE_ROLE_KEY to frontend |
| **Attribute size limits** | LiveKit has ~16KB limit on attributes | Keep payload compact; full agenda in DB only |

**Secure Attribute Payload Design:**

```typescript
// GOOD: Compact, ID-only payload (safe for attributes)
interface AgendaStateAttribute {
  v: number;           // Version for cache invalidation
  c: string | null;    // Current item ID (not title)
  d: string[];         // Completed item IDs
  s: number;           // Started timestamp
}
// Example: {"v":2,"c":"item-123","d":["item-456"],"s":1702389600}

// BAD: Full agenda text (DO NOT put in attributes)
interface UnsafePayload {
  currentTopic: "Q4 Revenue Discussion - Confidential"; // Exposes content!
  items: [{ title: "Salary Review", description: "..." }]; // Sensitive!
}
```

**Frontend Security Pattern:**

```typescript
// Frontend: Fetch full agenda definition via authenticated API
const agendaDefinition = await fetchAgenda(roomId); // Requires auth, room access

// Frontend: Read compact state from agent attributes
const agendaState = parseAgentAttributes(agent.attributes);

// Merge: Match IDs to get full display data
const displayItems = agendaDefinition.items.map(item => ({
  ...item,
  status: agendaState.d.includes(item.id) ? 'completed'
        : agendaState.c === item.id ? 'in_progress'
        : 'pending'
}));
```

**Access Control Checklist:**

- [ ] All `/api/rooms/[roomId]/agenda/*` routes validate Better Auth session
- [ ] All routes call `validateRoomAccess(userId, roomId)` before processing
- [ ] Agent uses `DATABASE_URL` directly (service role), never exposed to client
- [ ] Participant attributes contain ONLY IDs and status, never agenda text
- [ ] API routes return 403 for unauthorized users, not 404 (prevents enumeration)

---

## 10. Testing Strategy

### 10.1 Unit Tests

**Frontend:**
- AgendaBuilder: CRUD operations, validation, reordering
- AgendaContext: State updates from events, computed values
- AgendaProgress: Rendering different states, animations

**Agent:**
- AgendaTracker: Topic detection logic, signal combination
- Keyword matching: Fuzzy match accuracy
- Event publishing: Correct format and attributes

### 10.2 Integration Tests

```typescript
// Example: Full flow test
describe('Agenda Feature Integration', () => {
  it('creates agenda in PreJoin and tracks in meeting', async () => {
    // 1. Create agenda in PreJoin
    const agenda = await createAgenda(roomId, userId, [
      { title: 'Introduction' },
      { title: 'Technical Discussion' },
    ]);

    // 2. Connect to room
    await joinRoom(roomId, token);

    // 3. Simulate transcript that mentions "technical discussion"
    await sendTranscript("Let's move on to the technical discussion");

    // 4. Verify topic transition event received
    const event = await waitForAgendaEvent('topic_started');
    expect(event.itemId).toBe(agenda.items[1].id);
  });
});
```

### 10.3 End-to-End Tests

| Test Scenario | Steps | Expected Result |
|---------------|-------|-----------------|
| Happy path | Create 3-item agenda → Join → Discuss each topic | All items marked complete in order |
| Out-of-order | Create 3-item agenda → Discuss topic 2 first | Topic 2 starts first; topic 1 skipped or pending |
| No agenda | Join without creating agenda | No agenda panel shown |
| Late join | Join after meeting started | See current agenda state |
| Manual override | Click "complete" manually | Item completed regardless of AI |

### 10.4 Performance Tests

- Agenda with 20 items renders smoothly
- Topic detection latency < 3 seconds
- 50 concurrent meetings with agendas
- Memory usage stable over 2-hour meeting

---

## 11. Implementation Phases

### Phase 1: Database & Types (Foundation)

**Scope:**
- Add `agenda` and `agendaItem` tables to schema
- Create database migration
- Implement CRUD operations in `lib/db/agenda.ts`
- Define TypeScript types in `types/agenda.ts`
- Create API routes for agenda management

**Deliverables:**
- `lib/db/schema.ts` - Updated with agenda tables
- `lib/db/agenda.ts` - Database operations
- `types/agenda.ts` - Type definitions
- `app/api/rooms/[roomId]/agenda/` - API routes (see Appendix A for full spec)

**Validation:**
- Unit tests for database operations
- API routes respond correctly
- Migration runs without errors

### Phase 2: Agenda Builder (PreJoin)

**Scope:**
- Create AgendaBuilder component with full CRUD UI
- Implement drag-and-drop reordering
- Integrate with PreJoin screen
- Save agenda on "Join Meeting"
- Pass agendaId to meeting room

**Deliverables:**
- `app/meetings/[roomId]/components/agenda-builder/` - Component directory
- Updated `pre-join-screen.tsx` - Integration
- Updated `meeting-room.tsx` - Agenda creation on join

**Validation:**
- Can create, edit, delete, reorder items
- Agenda persists after joining
- UI matches design specifications

### Phase 3: Agenda Context & Progress UI (Frontend)

**Scope:**
- Create AgendaContext for state management
- Subscribe to `hedwiq.agenda` LiveKit topic
- Build AgendaProgress sidebar component
- Widen sidebar layout
- Implement visual states and animations

**Deliverables:**
- `contexts/agenda-context.tsx` - Context provider
- `components/agenda/` - Progress components
- Updated `meeting-layout.tsx` - Wider sidebar
- Updated `transcription-sidebar.tsx` - Side-by-side layout

**Validation:**
- Agenda displays correctly in meeting
- Visual states render properly
- Events update UI in real-time (mock events)

### Phase 4: Agent Topic Detection (Backend)

**Scope:**
- Create AgendaTracker class
- Implement multi-signal topic detection
- Add LLM prompt for topic analysis
- Integrate with HedwiqAgent
- Publish events to LiveKit topic

**Deliverables:**
- `agent/agenda_tracker.py` - Tracker class
- `agent/prompts/agenda_detection.py` - LLM prompts
- `agent/schemas/agenda.py` - Data classes
- `agent/db/agenda.py` - Database client
- Updated `hedwiq_agent.py` - Integration

**Validation:**
- Agent loads agenda on room join
- Topic transitions detected from transcripts
- Events published to correct topic
- Database updated with status changes

### Phase 5: Integration & Polish

**Scope:**
- End-to-end testing of full flow
- Error handling and edge cases
- Late joiner sync mechanism
- Manual override controls
- Performance optimization
- Documentation

**Deliverables:**
- Integration test suite
- Error states and recovery
- Sync mechanism for late joiners
- Optional manual controls
- Performance profiling results
- Updated CLAUDE.md files

**Validation:**
- Full flow works end-to-end
- All edge cases handled
- Performance meets targets
- Documentation complete

---

## Appendix A: API Routes

### Agenda Management APIs

**Route Pattern**: `/api/rooms/[roomId]/agenda/*` (mirrors existing `rooms/[roomId]/access` pattern)

```
# Get agenda for a room (includes all items)
GET    /api/rooms/[roomId]/agenda
       Auth: Required (Better Auth session)
       Access: Validates via validateRoomAccess()
       Response: {
         agenda: {
           id, roomId, status, version, itemCount,
           meetingStartedAt, meetingEndedAt,
           items: AgendaItem[]
         } | null
       }

# Create or update agenda (upsert draft)
PUT    /api/rooms/[roomId]/agenda
       Auth: Required, validates access
       Body: { items: DraftAgendaItem[] }
       Behavior:
         - If no agenda exists: creates as 'draft'
         - If agenda exists and status='draft': updates items, increments version
         - If agenda exists and status='active': returns 409 Conflict
       Response: { agenda: Agenda }

# Publish agenda (lock-in for meeting start)
POST   /api/rooms/[roomId]/agenda/publish
       Auth: Required
       Body: {} (empty)
       Behavior:
         - Transitions status: draft → active
         - Sets startedAt timestamp (or leave for agent)
         - Must be called BEFORE token request (see Join Sequencing)
       Response: { agenda: Agenda }

# Update single item
PATCH  /api/rooms/[roomId]/agenda/items/[itemId]
       Auth: Required
       Body: { title?, description?, estimatedDuration?, orderIndex? }
       Constraints: Only when agenda status='draft'
       Response: { item: AgendaItem }

# Delete single item
DELETE /api/rooms/[roomId]/agenda/items/[itemId]
       Auth: Required
       Constraints: Only when agenda status='draft'
       Response: { success: true }

# Reorder items
POST   /api/rooms/[roomId]/agenda/reorder
       Auth: Required
       Body: { itemIds: string[] }  // In desired order
       Constraints: Only when agenda status='draft'
       Response: { items: AgendaItem[] }

# Manual status override (optional, for fallback UI)
POST   /api/rooms/[roomId]/agenda/items/[itemId]/status
       Auth: Required
       Body: { status: 'in_progress' | 'completed' | 'skipped' }
       Note: For manual overrides when agent unavailable
       Response: { item: AgendaItem }
```

### Agent Access Options

The agent needs to read agenda and write status updates. Two approaches:

**Option 1 (Preferred): Direct Supabase Access**
```python
# Agent reads directly from Supabase using service role key
# Pro: No Next.js dependency at runtime
# Con: Must handle schema changes carefully

import asyncpg
pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"))
agenda = await pool.fetchrow("SELECT * FROM agenda WHERE room_id = $1", room_id)
```

**Option 2: Internal API with Service Token**
```python
# Agent calls Next.js API with INTERNAL_SERVICE_TOKEN
# Pro: Schema changes handled by Next.js
# Con: Extra network hop, service dependency

headers = {"Authorization": f"Bearer {os.getenv('INTERNAL_SERVICE_TOKEN')}"}
response = await httpx.get(f"{api_url}/api/rooms/{room_id}/agenda", headers=headers)
```

---

## Appendix B: LiveKit Topic Schema

### Topic: hedwiq.agenda

All messages are JSON strings with the following base structure:

```typescript
interface AgendaEvent {
  type: string;
  timestamp: number;  // Unix timestamp in milliseconds
  // ... type-specific fields
}
```

### Attributes

All agenda events include these attributes for filtering:

```typescript
{
  "event_type": "topic_started" | "topic_completed" | "topic_skipped" | "meeting_started" | "meeting_ended" | "agenda_sync",
  "item_id": "item-xxx-0" | "",  // Empty for meeting events
  "confidence": "0.85"  // Optional, for AI-detected events
}
```

---

## Appendix C: Design Tokens

```css
/* Agenda Progress Colors */
--agenda-pending: hsl(var(--muted-foreground));
--agenda-in-progress: hsl(var(--primary));
--agenda-completed: hsl(142 76% 36%);  /* Green */
--agenda-skipped: hsl(var(--muted));

/* Animations */
--agenda-pulse-duration: 2s;
--agenda-transition-duration: 300ms;

/* Layout */
--agenda-panel-width: 180px;
--sidebar-total-width: 520px;
--agenda-item-padding: 12px;
--agenda-connector-width: 2px;
```

---

## Appendix D: Example Agenda Data

```json
{
  "id": "agenda-meeting-abc-1702389600000",
  "roomId": "meeting-abc",
  "createdBy": "user-123",
  "itemCount": 4,
  "status": "active",
  "currentItemIndex": 1,
  "meetingStartedAt": 1702389600000,
  "items": [
    {
      "id": "item-agenda-xxx-0",
      "title": "Introduction",
      "description": "Quick introductions and meeting overview",
      "estimatedDuration": 5,
      "presenter": "Sarah",
      "orderIndex": 0,
      "status": "completed",
      "startedAt": 1702389600000,
      "completedAt": 1702389900000,
      "actualDuration": 300,
      "startTranscriptRef": "user1-seg-001",
      "endTranscriptRef": "user2-seg-015"
    },
    {
      "id": "item-agenda-xxx-1",
      "title": "Technical Requirements",
      "description": "Review technical specs and dependencies",
      "estimatedDuration": 15,
      "presenter": "Mike",
      "orderIndex": 1,
      "status": "in_progress",
      "startedAt": 1702389900000,
      "startTranscriptRef": "user1-seg-016"
    },
    {
      "id": "item-agenda-xxx-2",
      "title": "Design Review",
      "description": null,
      "estimatedDuration": 10,
      "presenter": "Emma",
      "orderIndex": 2,
      "status": "pending"
    },
    {
      "id": "item-agenda-xxx-3",
      "title": "Action Items",
      "description": "Assign tasks and set deadlines",
      "estimatedDuration": 5,
      "presenter": "Sarah",
      "orderIndex": 3,
      "status": "pending"
    }
  ]
}
```

---

*Document Version: 1.1*
*Created: December 2024*
*Last Updated: December 2024*

## Changelog

### v1.1 (December 2024)
- Added **Late Joiner Strategy** (Section 1.3) - participant attributes as primary state sync mechanism
- Added **version field** to agenda schema for cache invalidation
- Added **stability/hysteresis parameters** for topic detection (Section 6.2)
- Added **off-agenda handling** logic (Section 6.2.1)
- Updated **API route pattern** to `/api/rooms/[roomId]/agenda/*` to match existing conventions
- Added **join sequencing** (Section 2.1.1) - agenda publish → token → connect
- Added **security considerations** (Section 9.4) for participant metadata content
