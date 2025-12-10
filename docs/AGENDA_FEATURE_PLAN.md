# Agenda Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding a **Progressive Meeting Agenda** feature to Hedwiq. The feature enables users to create meeting agendas before joining, displays real-time agenda progress during meetings, and uses AI to automatically detect when agenda topics are completed based on conversation analysis.

---

## 1. Feature Overview

### 1.1 User Story

> As a meeting host, I want to create an agenda before the meeting starts, so that all participants can see the meeting structure and track progress through topics in real-time with AI assistance.

### 1.2 Key Capabilities

1. **Agenda Creation (PreJoin)**: Users create agenda items with titles, descriptions, and optional time estimates
2. **Agenda Display (In-Meeting)**: Sidebar shows agenda progress alongside transcription
3. **AI-Powered Progress Tracking**: Agent detects topic transitions and marks agenda items as complete
4. **Topic Change Indicators**: Visual indicators in transcription when topics change
5. **Manual Override**: Users can manually mark topics as complete or revert

### 1.3 Target UI (Reference)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Meeting Room                                │
├─────────────────────────┬───────────────────────────────────────────────┤
│                         │  ┌─────────────────────────────────────────┐  │
│                         │  │ CURRENTLY DISCUSSING                    │  │
│   Meeting Agenda        │  │ Action Items & Next Steps              │  │
│   Progress: 6/6         │  ├─────────────────────────────────────────┤  │
│   ████████████████      │  │ [Avatar] Mike 10:33 AM                 │  │
│                         │  │ Sounds good, Sarah. Quick question...  │  │
│   ✓ Technical Req.      │  │                                         │  │
│     15 min • Led by Mike│  │ [Avatar] Sarah 10:34 AM [Product Lead] │  │
│                         │  │ Great point, Mike. Yes, we'll touch... │  │
│   ✓ Design Updates      │  │                                         │  │
│     10 min • Led by Emma│  │ ─────── Topic Changed ───────          │  │
│                         │  │                                         │  │
│   ▶ Action Items        │  │ [Avatar] David 10:35 AM [Marketing]    │  │
│     5 min • Led by Sarah│  │ Thanks Sarah. So Q3 was a strong...    │  │
│                         │  │                                         │  │
│   Est. remaining: 5 min │  │ ••• Transcribing in real-time...       │  │
│                         │  └─────────────────────────────────────────┘  │
└─────────────────────────┴───────────────────────────────────────────────┘
```

---

## 2. Technical Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PreJoinScreen                    MeetingLayout (Wider Sidebar)         │
│  ├─ AgendaCreator                 ├─ AgendaProgressPanel                │
│  │  ├─ AgendaItemForm             │  ├─ AgendaHeader                    │
│  │  └─ AgendaItemList             │  ├─ AgendaItemProgress              │
│  └─ Submit → UserChoices.agenda   │  └─ EstimatedTimeRemaining          │
│                                   ├─ TranscriptionSidebar               │
│                                   │  ├─ TopicChangeIndicator            │
│                                   │  └─ TranscriptionMessage            │
│                                   └─ AgendaContext (state management)   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    LiveKit Text Streams (bidirectional)
                                    │
                    ┌───────────────┴───────────────┐
                    │ hedwiq.agenda (frontend→agent)│
                    │ hedwiq.agenda_progress (agent→frontend)
                    └───────────────┬───────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                           Agent (Python)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HedwiqAgent                                                             │
│  ├─ AgendaTracker (NEW)                                                 │
│  │  ├─ Receives agenda from frontend                                    │
│  │  ├─ Analyzes transcripts for topic progression                       │
│  │  ├─ Detects topic completions via LLM                                │
│  │  └─ Publishes progress updates                                       │
│  ├─ InsightAnalyzer (existing)                                          │
│  └─ DocumentReferencer (existing)                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
1. PreJoin: User creates agenda
   └─→ Stored in UserChoices.agenda

2. Join Meeting: Agenda sent to agent
   └─→ LiveKit text stream: hedwiq.agenda
   └─→ Agent receives and initializes AgendaTracker

3. During Meeting: Agent analyzes transcripts
   └─→ Every N segments, check if current topic is complete
   └─→ LLM determines topic progression
   └─→ Publish progress: hedwiq.agenda_progress

4. Frontend receives progress updates
   └─→ AgendaContext updates state
   └─→ UI reflects current topic, completed items
   └─→ Topic change indicators in transcription
```

### 2.3 LiveKit Topics

| Topic | Direction | Purpose | Payload |
|-------|-----------|---------|---------|
| `hedwiq.agenda` | Frontend → Agent | Send agenda to agent | `AgendaPayload` |
| `hedwiq.agenda_progress` | Agent → Frontend | Progress updates | `AgendaProgressPayload` |

---

## 3. Data Models

### 3.1 Frontend Types (`types/agenda.ts`)

```typescript
/**
 * Single agenda item created by user
 */
export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  /** Estimated duration in minutes */
  estimatedMinutes?: number;
  /** Optional presenter/leader */
  leadBy?: string;
  /** Order in agenda (0-indexed) */
  order: number;
}

/**
 * Agenda item with progress state
 */
export interface AgendaItemProgress extends AgendaItem {
  status: 'pending' | 'in_progress' | 'completed';
  /** When this item started being discussed */
  startedAt?: number;
  /** When this item was marked complete */
  completedAt?: number;
  /** Actual duration in minutes (calculated) */
  actualMinutes?: number;
}

/**
 * Full agenda with progress tracking
 */
export interface Agenda {
  id: string;
  roomId: string;
  items: AgendaItemProgress[];
  /** Currently active item index (-1 if not started) */
  currentItemIndex: number;
  /** Meeting start timestamp */
  meetingStartedAt?: number;
  /** Created by user ID */
  createdBy: string;
}

/**
 * Payload sent to agent when joining
 */
export interface AgendaPayload {
  type: 'agenda_init';
  agenda: {
    id: string;
    roomId: string;
    items: AgendaItem[];
  };
}

/**
 * Progress update from agent
 */
export interface AgendaProgressPayload {
  type: 'topic_started' | 'topic_completed' | 'topic_change' | 'agenda_complete';
  agendaId: string;
  /** Index of the affected item */
  itemIndex: number;
  /** New status */
  status: 'pending' | 'in_progress' | 'completed';
  /** Confidence score (0-1) */
  confidence: number;
  /** Why the agent made this decision */
  reason?: string;
  /** Transcript segment that triggered the change */
  transcriptRef?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Topic change indicator for transcription display
 */
export interface TopicChangeEvent {
  id: string;
  fromItemIndex: number;
  toItemIndex: number;
  timestamp: number;
  transcriptRef: string;
}
```

### 3.2 Agent Schemas (`schemas/agenda.py`)

```python
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

class AgendaItemStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

class AgendaItem(BaseModel):
    """Single agenda item from frontend."""
    id: str
    title: str
    description: Optional[str] = None
    estimated_minutes: Optional[int] = None
    lead_by: Optional[str] = None
    order: int

class Agenda(BaseModel):
    """Full agenda received from frontend."""
    id: str
    room_id: str
    items: List[AgendaItem]

class AgendaProgressUpdate(BaseModel):
    """Progress update sent to frontend."""
    type: str = Field(..., pattern="^(topic_started|topic_completed|topic_change|agenda_complete)$")
    agenda_id: str
    item_index: int
    status: AgendaItemStatus
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: Optional[str] = Field(None, max_length=200)
    transcript_ref: Optional[str] = None
    timestamp: int  # milliseconds

class TopicAnalysisResult(BaseModel):
    """LLM analysis result for topic progression."""
    current_topic_complete: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence: str = Field(..., max_length=200)
    next_topic_started: bool = False
    next_topic_index: Optional[int] = None
```

---

## 4. Implementation Details

### 4.1 Frontend Components

#### 4.1.1 AgendaCreator Component (`components/agenda/agenda-creator.tsx`)

**Location**: PreJoin screen, collapsible section below documents

**Features**:
- Add/remove/reorder agenda items
- Title (required), description (optional), time estimate (optional)
- Optional "Led by" field (dropdown of known participants or free text)
- Drag-and-drop reordering
- Template suggestions (e.g., "Standup", "Sprint Planning")

**State**:
```typescript
interface AgendaCreatorProps {
  initialItems?: AgendaItem[];
  onAgendaChange: (items: AgendaItem[]) => void;
  maxItems?: number; // Default: 10
}
```

#### 4.1.2 AgendaProgressPanel Component (`components/agenda/agenda-progress-panel.tsx`)

**Location**: Left side of the wider sidebar (see UI reference)

**Features**:
- Progress bar showing completed/total items
- List of agenda items with status indicators:
  - ✓ Completed (green checkmark)
  - ▶ In Progress (blue indicator, highlighted)
  - ○ Pending (gray circle)
- Estimated time remaining
- Click to manually change status (with confirmation)
- Current item highlighted with accent color

**Props**:
```typescript
interface AgendaProgressPanelProps {
  agenda: Agenda | null;
  onManualStatusChange?: (itemIndex: number, status: AgendaItemStatus) => void;
  className?: string;
}
```

#### 4.1.3 TopicChangeIndicator Component (`components/transcription/topic-change-indicator.tsx`)

**Location**: Inline in TranscriptionSidebar between messages

**Features**:
- Horizontal divider with "Topic Changed" label
- Shows transition: "Technical Requirements → Design Updates"
- Timestamp of change
- Subtle animation on appearance

#### 4.1.4 AgendaContext (`contexts/agenda-context.tsx`)

**Purpose**: Manage agenda state and LiveKit stream communication

**Key Functions**:
```typescript
interface AgendaContextValue {
  // State
  agenda: Agenda | null;
  currentItem: AgendaItemProgress | null;
  topicChanges: TopicChangeEvent[];
  isAgendaActive: boolean;

  // Actions
  initializeAgenda: (items: AgendaItem[]) => void;
  sendAgendaToAgent: () => Promise<void>;
  manuallyCompleteItem: (index: number) => void;
  manuallyStartItem: (index: number) => void;
  revertItemStatus: (index: number) => void;

  // Queries
  getProgressPercentage: () => number;
  getEstimatedTimeRemaining: () => number;
  getTopicChangeForTranscript: (transcriptRef: string) => TopicChangeEvent | null;
}
```

### 4.2 Agent Components

#### 4.2.1 AgendaTracker Class (`agenda_tracker.py`)

**Purpose**: Track meeting progress against agenda using LLM analysis

**Architecture**:
```python
class AgendaTracker:
    """
    Tracks meeting progress through agenda items using LLM analysis.

    Pipeline:
    1. Receive agenda from frontend via LiveKit stream
    2. Accumulate transcript segments
    3. Periodically analyze if current topic is complete
    4. Publish progress updates to frontend

    Analysis Strategy:
    - Wait for MIN_SEGMENTS_FOR_ANALYSIS segments
    - Use sliding window of recent transcript
    - LLM determines if discussion has moved on
    - Confidence threshold prevents false positives
    """

    def __init__(
        self,
        room: rtc.Room,
        room_id: str,
        llm_client: OpenAILLM,
    ):
        self.room = room
        self.room_id = room_id
        self.llm = llm_client

        # Agenda state
        self.agenda: Optional[Agenda] = None
        self.current_item_index: int = -1  # -1 = not started
        self.item_start_times: Dict[int, float] = {}

        # Transcript buffer for analysis
        self.transcript_buffer: List[TranscriptEntry] = []
        self.last_analysis_time: float = 0

        # Analysis scheduling
        self.pending_segments: List[TranscriptEntry] = []
        self.analysis_lock = asyncio.Lock()
        self.scheduled_task: Optional[asyncio.Task] = None

        # Deduplication
        self.published_transitions: Set[str] = set()

    async def start(self):
        """Start listening for agenda from frontend."""
        pass

    async def stop(self):
        """Stop tracker and log metrics."""
        pass

    async def on_agenda_received(self, agenda_data: dict):
        """Handle agenda initialization from frontend."""
        pass

    async def on_transcript_final(self, entry: TranscriptEntry):
        """Process new transcript segment."""
        pass

    async def _analyze_topic_progression(self):
        """LLM analysis to determine if topic has changed."""
        pass

    async def _publish_progress(self, update: AgendaProgressUpdate):
        """Send progress update to frontend."""
        pass
```

#### 4.2.2 Agenda Analysis Prompts (`prompts/agenda_tracking.py`)

**System Prompt**:
```python
AGENDA_TRACKING_SYSTEM_PROMPT = """You are a meeting progress tracker.
Your job is to determine if a meeting has moved from one agenda topic to another.

You will receive:
1. The meeting agenda with numbered topics
2. The current topic being discussed
3. Recent transcript of the conversation

Your task:
1. Determine if the current topic appears COMPLETE based on the conversation
2. Identify if speakers have explicitly or implicitly moved to a new topic
3. Provide confidence score and evidence

IMPORTANT RULES:
- Be CONSERVATIVE - only mark complete when clearly done
- Look for explicit transitions: "Let's move on to...", "Next topic..."
- Look for implicit transitions: discussion clearly shifted to next agenda item
- A topic is complete when:
  * Speakers explicitly conclude it ("That covers the technical requirements")
  * Discussion naturally shifts to the next agenda topic
  * Someone initiates the next topic without explicit transition
- Do NOT mark complete just because there's a pause or brief tangent
- Return JSON only, no explanation outside JSON"""

AGENDA_TRACKING_USER_TEMPLATE = """Analyze if the current meeting topic is complete.

MEETING AGENDA:
{agenda_items}

CURRENT TOPIC (index {current_index}):
{current_topic}

RECENT TRANSCRIPT:
{transcript}

Determine:
1. Is the current topic "{current_topic_title}" complete?
2. Has discussion moved to a different topic?
3. If yes, which agenda item (by index)?

Return JSON:
{{
  "current_topic_complete": true/false,
  "confidence": 0.0-1.0,
  "evidence": "Brief quote or description (max 100 chars)",
  "next_topic_started": true/false,
  "next_topic_index": null or 0-N
}}"""
```

### 4.3 Sidebar Layout Changes

#### Current Layout (w-96 = 384px):
```
┌────────────────────────────────┐
│ [Tabs: Transcript | Insights]  │
├────────────────────────────────┤
│                                │
│     TranscriptionSidebar       │
│           or                   │
│     InsightsSummaryPanel       │
│                                │
└────────────────────────────────┘
```

#### New Layout (w-[600px] or wider):
```
┌────────────────────────────────────────────────────────────┐
│ [Header: Currently Discussing: {topic}]                    │
├──────────────────────┬─────────────────────────────────────┤
│                      │ [Tabs: Transcript | Insights]       │
│  AgendaProgressPanel │─────────────────────────────────────│
│  (fixed width ~200px)│                                     │
│                      │     TranscriptionSidebar            │
│  - Progress bar      │           or                        │
│  - Item list         │     InsightsSummaryPanel            │
│  - Time remaining    │                                     │
│                      │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

**Implementation**:
- Sidebar width: `w-[600px]` (from `w-96`)
- Main content margin: `mr-[600px]` (from `mr-96`)
- Internal split: `grid grid-cols-[200px_1fr]` or flexbox
- Agenda panel: fixed 200px width
- Transcription: flexible remaining width

---

## 5. API Endpoints

### 5.1 Agenda Persistence (Optional Phase 2)

For MVP, agenda is stored only in React state and sent to agent via LiveKit.

For persistence (Phase 2):

```typescript
// POST /api/rooms/[roomId]/agenda
// Create/update agenda for a room
interface CreateAgendaRequest {
  items: AgendaItem[];
}

// GET /api/rooms/[roomId]/agenda
// Get agenda for a room (for late joiners)
interface GetAgendaResponse {
  agenda: Agenda | null;
}

// PATCH /api/rooms/[roomId]/agenda/progress
// Manual status update (syncs with agent)
interface UpdateProgressRequest {
  itemIndex: number;
  status: 'pending' | 'in_progress' | 'completed';
}
```

### 5.2 Database Schema (Phase 2)

```typescript
// lib/db/schema.ts - Add agenda table
export const agenda = pgTable("agenda", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  items: jsonb("items").$type<AgendaItem[]>().notNull(),
  currentItemIndex: integer("current_item_index").notNull().default(-1),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agendaProgress = pgTable("agenda_progress", {
  id: text("id").primaryKey(),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => agenda.id, { onDelete: "cascade" }),
  itemIndex: integer("item_index").notNull(),
  status: text("status").notNull(), // pending, in_progress, completed
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  completedByAi: boolean("completed_by_ai").notNull().default(true),
  confidence: real("confidence"),
  reason: text("reason"),
  transcriptRef: text("transcript_ref"),
});
```

---

## 6. Implementation Phases

### Phase 1: Core MVP (Recommended First)

**Frontend**:
1. Create `types/agenda.ts` with data models
2. Create `AgendaCreator` component for PreJoin
3. Extend `UserChoices` interface to include agenda
4. Create `AgendaContext` with basic state management
5. Create `AgendaProgressPanel` component
6. Modify `MeetingLayout` for wider sidebar with split view
7. Send agenda to agent on room join
8. Handle progress updates from agent

**Agent**:
1. Create `schemas/agenda.py` with Pydantic models
2. Create `prompts/agenda_tracking.py` with LLM prompts
3. Create `AgendaTracker` class with:
   - Agenda reception from frontend
   - Basic transcript accumulation
   - LLM-based topic completion detection
   - Progress publishing
4. Integrate with `HedwiqAgent`

**Estimated Scope**: ~15-20 files, ~2000-2500 lines of code

### Phase 2: Enhanced Features

1. **Topic Change Indicators**: Visual dividers in transcription
2. **Persistence**: Database storage for agenda and progress
3. **Late Joiner Sync**: New participants receive current agenda state
4. **Manual Override UI**: Buttons to manually advance/revert topics
5. **Time Tracking**: Actual vs estimated duration display
6. **Agenda Templates**: Pre-built templates for common meeting types

### Phase 3: Advanced Features

1. **Agenda Suggestions**: AI suggests agenda items based on meeting title
2. **Progress Analytics**: Post-meeting report on agenda adherence
3. **Calendar Integration**: Import agenda from calendar event
4. **Participant Assignment**: Track who led each topic
5. **Export**: Export agenda with notes to various formats

---

## 7. Risk Analysis & Mitigations

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **LLM latency causes delayed updates** | Medium | Medium | Use aggressive caching, async updates, optimistic UI |
| **False positive topic completions** | High | Medium | High confidence threshold (0.8), manual override, require 2+ signals |
| **Agenda state desync (frontend/agent)** | Medium | Low | Periodic state reconciliation, single source of truth in agent |
| **Sidebar too wide on small screens** | Medium | Medium | Responsive breakpoints, collapsible agenda panel |
| **Memory leak with large transcript buffers** | Low | Low | Strict buffer limits, periodic cleanup |

### 7.2 UX Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Users ignore agenda feature** | Medium | Make it optional, don't block join flow |
| **Too many UI elements overwhelming** | Medium | Progressive disclosure, clean visual hierarchy |
| **Manual override conflicts with AI** | Medium | Clear indication of AI vs manual changes |
| **Agenda creation too complex** | Medium | Simple default form, templates for quick setup |

### 7.3 Mitigation Strategies

**For False Positives**:
```python
# Require multiple signals for topic completion
MIN_CONFIDENCE_THRESHOLD = 0.8  # Higher than insights (0.75)
MIN_SEGMENTS_SINCE_TOPIC_START = 5  # Don't complete too quickly
REQUIRE_EXPLICIT_TRANSITION = False  # But prefer them

# Two-phase detection:
# 1. Soft signal: Confidence > 0.7, mark as "possibly complete"
# 2. Hard signal: Confidence > 0.85 OR explicit transition phrase
```

**For State Desync**:
```typescript
// Periodic heartbeat from agent with full state
interface AgendaHeartbeat {
  type: 'heartbeat';
  agenda: Agenda;
  timestamp: number;
}

// Frontend reconciles on heartbeat
const handleHeartbeat = (heartbeat: AgendaHeartbeat) => {
  if (heartbeat.timestamp > lastKnownTimestamp) {
    setAgenda(heartbeat.agenda);
  }
};
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Frontend**:
- `AgendaCreator`: Item CRUD, validation, reordering
- `AgendaContext`: State transitions, progress calculations
- `AgendaProgressPanel`: Rendering with various states

**Agent**:
- `AgendaTracker`: Agenda parsing, transcript accumulation
- Prompt formatting: Correct agenda/transcript formatting
- Progress publishing: Payload structure validation

### 8.2 Integration Tests

1. **End-to-end flow**: Create agenda → Join → Receive in agent → Progress updates
2. **LiveKit stream tests**: Message serialization/deserialization
3. **Multi-participant**: Agenda visible to all, progress synced

### 8.3 LLM Testing

```python
# Test cases for topic detection
TEST_CASES = [
    {
        "agenda": ["Technical Requirements", "Design Review"],
        "current_index": 0,
        "transcript": "...Let's move on to the design review...",
        "expected_complete": True,
        "expected_next": 1,
    },
    {
        "agenda": ["Standup Updates", "Blockers"],
        "current_index": 0,
        "transcript": "...I'm still working on the API...",
        "expected_complete": False,  # Still on topic
    },
    # More cases...
]
```

---

## 9. Performance Considerations

### 9.1 Agent Performance

| Operation | Target Latency | Strategy |
|-----------|---------------|----------|
| Agenda init | < 100ms | Simple parsing, no LLM |
| Topic analysis | < 2s | Same model as insights, shared context |
| Progress publish | < 100ms | Async, non-blocking |

### 9.2 Frontend Performance

| Consideration | Strategy |
|---------------|----------|
| Re-renders | Memoize AgendaProgressPanel, use `React.memo` |
| Context updates | Batch related updates, use `useMemo` for derived state |
| Sidebar layout | CSS Grid for smooth resize, no JS layout |

### 9.3 LLM Token Usage

```
Agenda analysis prompt: ~500-800 tokens input
- Agenda items: ~50 tokens per item (5 items = 250)
- Transcript window: ~300-500 tokens
- System prompt: ~200 tokens

Output: ~50-100 tokens

Cost estimate (GPT-4o-mini):
- Per analysis: ~$0.0003
- Per 1-hour meeting (20 analyses): ~$0.006
```

---

## 10. Configuration Constants

### Frontend (`lib/constants/agenda.ts`)

```typescript
export const AGENDA_CONSTANTS = {
  // Creation limits
  MAX_AGENDA_ITEMS: 10,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,

  // Time estimates
  DEFAULT_ITEM_MINUTES: 10,
  MAX_ITEM_MINUTES: 120,

  // UI
  SIDEBAR_WIDTH: 600, // pixels
  AGENDA_PANEL_WIDTH: 200, // pixels

  // Sync
  HEARTBEAT_INTERVAL_MS: 30000, // 30 seconds
};
```

### Agent (`config/agenda.py`)

```python
# Analysis triggers
MIN_SEGMENTS_FOR_ANALYSIS = 4  # Wait for context
MIN_ANALYSIS_INTERVAL_SECONDS = 15  # Don't analyze too frequently
ANALYSIS_DELAY_SECONDS = 5  # Wait for more context after trigger

# Confidence thresholds
MIN_CONFIDENCE_FOR_COMPLETION = 0.8
MIN_CONFIDENCE_FOR_SOFT_SIGNAL = 0.7

# Transcript window
MAX_TRANSCRIPT_WINDOW = 20  # Last N segments for analysis
MIN_SEGMENTS_SINCE_TOPIC_START = 5  # Don't complete too early

# Deduplication
TRANSITION_COOLDOWN_SECONDS = 60  # Min time between transitions
```

---

## 11. File Structure

### Frontend New Files

```
frontend/
├── types/
│   └── agenda.ts                    # Agenda type definitions
├── components/
│   └── agenda/
│       ├── index.ts                 # Barrel export
│       ├── agenda-creator.tsx       # PreJoin agenda form
│       ├── agenda-item-form.tsx     # Single item form
│       ├── agenda-progress-panel.tsx # In-meeting progress display
│       ├── agenda-item-progress.tsx  # Single item with status
│       └── agenda-header.tsx        # "Currently discussing" header
├── components/transcription/
│   └── topic-change-indicator.tsx   # Inline topic divider
├── contexts/
│   └── agenda-context.tsx           # Agenda state management
└── lib/
    └── constants/
        └── agenda.ts                # Configuration constants
```

### Agent New Files

```
agent/
├── agenda_tracker.py               # Main agenda tracking logic
├── schemas/
│   └── agenda.py                   # Pydantic models
├── prompts/
│   └── agenda_tracking.py          # LLM prompts
└── config/
    └── agenda.py                   # Configuration constants
```

### Modified Files

```
frontend/
├── app/meetings/[roomId]/
│   ├── pre-join-screen.tsx         # Add AgendaCreator section
│   ├── meeting-room.tsx            # Add AgendaProvider, pass agenda
│   └── components/
│       └── meeting-layout.tsx      # Wider sidebar, split layout
├── components/transcription/
│   └── transcription-sidebar.tsx   # Add topic change indicators

agent/
├── hedwiq_agent.py                 # Initialize AgendaTracker
└── participant_transcriber.py      # Forward transcripts to AgendaTracker
```

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agenda creation rate | 30% of meetings | Analytics |
| Topic detection accuracy | 85%+ user acceptance | Feedback/manual overrides |
| False positive rate | < 10% | Manual reverts tracked |
| Time to first progress update | < 30s from topic start | Logging |
| User satisfaction | NPS 40+ | Survey |

---

## 13. Open Questions

1. **Agenda visibility**: Should agenda be visible to all participants or just the creator?
   - **Recommendation**: Visible to all, editable by creator only

2. **Late joiner behavior**: How do late joiners see past progress?
   - **Recommendation**: Show current state, mark past items as "completed before you joined"

3. **Multiple agendas**: Can different users create competing agendas?
   - **Recommendation**: One agenda per room, first creator wins

4. **Agenda modification during meeting**: Allow adding items mid-meeting?
   - **Recommendation**: Phase 2 feature, keep MVP simple

5. **Integration with insights**: Should insights be grouped by agenda topic?
   - **Recommendation**: Phase 3 feature, adds complexity

---

## 14. Appendix: Example Prompts and Responses

### Topic Completion Detection

**Input**:
```
MEETING AGENDA:
0. Technical Requirements (Led by Mike) - 15 min
1. Design System Updates (Led by Emma) - 10 min
2. Action Items & Next Steps (Led by Sarah) - 5 min

CURRENT TOPIC (index 0):
Technical Requirements

RECENT TRANSCRIPT:
[mike]: So that covers the main technical considerations for the migration.
[sarah]: Great overview, Mike. Any questions on the technical side?
[emma]: No, I think that's clear. Should we move to the design updates?
[sarah]: Yes, let's do that. Emma, over to you.
[emma]: Thanks. So for the design system, we've been working on...
```

**Expected Output**:
```json
{
  "current_topic_complete": true,
  "confidence": 0.95,
  "evidence": "Emma asked to move to design updates, Sarah confirmed",
  "next_topic_started": true,
  "next_topic_index": 1
}
```

### No Topic Change

**Input**:
```
CURRENT TOPIC (index 0):
Technical Requirements

RECENT TRANSCRIPT:
[mike]: The database migration will need careful planning.
[sarah]: What's the estimated downtime?
[mike]: We're looking at about 2 hours with the rollback strategy.
[sarah]: Can we do it over a weekend?
```

**Expected Output**:
```json
{
  "current_topic_complete": false,
  "confidence": 0.9,
  "evidence": "Discussion continues about database migration details",
  "next_topic_started": false,
  "next_topic_index": null
}
```

---

*Document Version: 1.0*
*Created: December 2024*
*Author: Claude Code Analysis*
