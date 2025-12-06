# Phase 2: Real-time Insights Implementation Plan

## Executive Summary

This document outlines the implementation strategy for Phase 2 of Hedwiq: **Real-time Insights**. Based on deep analysis of the current codebase, LiveKit Agents documentation, and official examples, this plan provides multiple architectural approaches with recommendations.

---

## Current Architecture Analysis

### Existing Components

**Agent (`/agent/transcription_agent.py`):**
- Multi-participant transcriber using Deepgram STT
- Publishes to `lk.transcription` topic via `send_text()`
- Handles multiple audio tracks simultaneously
- Uses segment IDs for transcript continuity

**Frontend (`/frontend/components/transcription/`):**
- `TranscriptionSidebar` receives text streams on `lk.transcription` topic
- Uses `registerTextStreamHandler()` to receive data
- Handles interim and final transcriptions
- Speaker differentiation via attributes

### Key Observations

1. **Text Streams are Flexible**: LiveKit text streams support custom topics with custom attributes - perfect for insights
2. **No Voice Output Needed**: Insights agent doesn't need TTS - it's analysis-only
3. **Real-time is Critical**: Insights must appear alongside transcription with minimal latency
4. **Parallel Processing**: Insights can be extracted in parallel with transcription display

---

## Architectural Options

### Option A: Unified Agent with LLM Analysis (RECOMMENDED)

Enhance the existing transcription agent to also perform insight extraction.

```
┌─────────────────────────────────────────────────────────────────┐
│                      LiveKit Room                                │
├─────────────────────────────────────────────────────────────────┤
│  Participant Audio → Transcription Agent (Enhanced)             │
│                           │                                      │
│                           ├─→ STT → lk.transcription (text)     │
│                           │                                      │
│                           └─→ LLM Analysis (buffered)           │
│                                    │                             │
│                                    └─→ hedwiq.insight (JSON)    │
│                                                                  │
│  Frontend listens to both topics simultaneously                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Single agent to maintain
- Shared context (transcription available immediately for analysis)
- Lower latency
- Simpler deployment

**Cons:**
- Agent complexity increases
- LLM calls may introduce latency to transcription (mitigated with async)

### Option B: Separate Insight Agent

Deploy a second agent that listens to transcription output.

```
┌─────────────────────────────────────────────────────────────────┐
│                      LiveKit Room                                │
├─────────────────────────────────────────────────────────────────┤
│  Participant Audio → Transcription Agent → lk.transcription     │
│                                                    │             │
│                      Insight Agent ←───────────────┘             │
│                           │                                      │
│                           └─→ hedwiq.insight (JSON)             │
│                                                                  │
│  Frontend listens to both topics                                │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Separation of concerns
- Can scale independently
- Transcription unaffected by LLM latency

**Cons:**
- More complex deployment
- Additional network hop latency
- Need to coordinate two agents

### Option C: Frontend-side Analysis (Vercel AI SDK)

Run insight extraction on the frontend using Vercel AI SDK.

```
┌─────────────────────────────────────────────────────────────────┐
│                      LiveKit Room                                │
├─────────────────────────────────────────────────────────────────┤
│  Participant Audio → Transcription Agent → lk.transcription     │
│                                                    │             │
│                                                    ▼             │
│                                            Frontend (Next.js)   │
│                                                    │             │
│                                            Vercel AI SDK        │
│                                                    │             │
│                                            Local LLM calls      │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- No backend changes needed
- Leverages Vercel AI SDK streaming
- Can use any LLM provider

**Cons:**
- Higher client-side compute
- API keys exposed (or need proxy)
- No shared insights between participants
- Inconsistent results across clients

---

## Recommendation: Option A (Unified Agent)

Based on analysis of the LiveKit Agents examples, particularly:
- `note-taking-assistant/agent.py` - Real-time analysis pattern
- `multi-user-transcriber.py` - Multi-participant handling
- `text_only.py` - Text-only agent pattern

**Option A is recommended** because:
1. LiveKit Agents SDK natively supports LLM integration
2. The `note-taking-assistant` example demonstrates this exact pattern
3. Insights can be sent via text streams without voice output
4. Single deployment simplifies operations

---

## Implementation Plan

### Phase 2.1: Backend - Insight Extraction Agent

#### 2.1.1 Enhance Transcription Agent

**File:** `/agent/transcription_agent.py` → `/agent/hedwiq_agent.py`

```python
# New structure
from livekit.agents import AgentSession, Agent
from livekit.agents.llm import ChatContext, ChatMessage, function_tool
from livekit.plugins import openai, deepgram

class HedwiqInsightAgent:
    """Analyzes transcription and extracts insights in real-time."""

    def __init__(self, room):
        self.room = room
        self.transcript_buffer = []
        self.llm = openai.LLM(model="gpt-4o-mini")  # Fast, cost-effective
        self.analysis_task = None

    async def add_transcript(self, speaker: str, text: str, timestamp: float):
        """Add transcript segment and trigger analysis."""
        self.transcript_buffer.append({
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp
        })

        # Debounce: wait for pause in speech before analyzing
        if self.analysis_task:
            self.analysis_task.cancel()
        self.analysis_task = asyncio.create_task(
            self._analyze_with_delay()
        )

    async def _analyze_with_delay(self):
        """Wait for speech pause, then analyze."""
        await asyncio.sleep(1.5)  # Wait for natural pause
        await self._extract_insights()

    async def _extract_insights(self):
        """Send buffered transcript to LLM for insight extraction."""
        if not self.transcript_buffer:
            return

        # Build context from recent transcript
        recent_text = self._build_context(max_entries=10)

        prompt = f"""Analyze this meeting transcript and identify insights.

Transcript:
{recent_text}

Extract any of these insight types if present:
- idea: New suggestions or proposals
- problem: Issues, challenges, pain points
- solution: Proposed solutions
- risk: Risks, limitations, uncertainties
- insight: Meaningful observations
- hypothesis: Assumptions to validate
- action_item: Tasks requiring follow-up
- open_question: Unresolved questions

Return JSON array of insights found. If none, return empty array.
Each insight: {{"type": "...", "content": "...", "speaker": "...", "confidence": 0.0-1.0}}

Only extract clear, explicit insights. Be conservative."""

        try:
            response = await self._call_llm(prompt)
            insights = self._parse_insights(response)

            for insight in insights:
                await self._publish_insight(insight)

        except Exception as e:
            logger.error(f"Insight extraction failed: {e}")

    async def _publish_insight(self, insight: dict):
        """Publish insight to frontend via text stream."""
        await self.room.local_participant.send_text(
            json.dumps(insight),
            topic="hedwiq.insight",
            attributes={
                "insight_type": insight["type"],
                "speaker": insight.get("speaker", "unknown"),
                "confidence": str(insight.get("confidence", 0.8)),
            }
        )
```

#### 2.1.2 Insight Categories Schema

**File:** `/agent/schemas/insights.py`

```python
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional

class InsightType(str, Enum):
    IDEA = "idea"
    PROBLEM = "problem"
    SOLUTION = "solution"
    RISK = "risk"
    INSIGHT = "insight"
    HYPOTHESIS = "hypothesis"
    ACTION_ITEM = "action_item"
    OPEN_QUESTION = "open_question"

class Insight(BaseModel):
    type: InsightType
    content: str = Field(..., max_length=500)
    speaker: Optional[str] = None
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    transcript_ref: Optional[str] = None  # Segment ID reference
    timestamp: float

INSIGHT_ICONS = {
    InsightType.IDEA: "lightbulb",
    InsightType.PROBLEM: "alert-triangle",
    InsightType.SOLUTION: "check-circle",
    InsightType.RISK: "alert-circle",
    InsightType.INSIGHT: "search",
    InsightType.HYPOTHESIS: "flask",
    InsightType.ACTION_ITEM: "clipboard-list",
    InsightType.OPEN_QUESTION: "help-circle",
}
```

#### 2.1.3 LLM Prompt Engineering

**File:** `/agent/prompts/insight_extraction.py`

```python
INSIGHT_EXTRACTION_SYSTEM_PROMPT = """You are an expert meeting analyst.
Your job is to identify key insights from meeting transcripts in real-time.

You must be:
1. CONSERVATIVE - Only extract clear, explicit insights
2. PRECISE - Content should be concise (1-2 sentences max)
3. ACCURATE - Never invent or assume information
4. FAST - Focus on the most recent exchanges

Insight Types:
- idea: Someone proposes something new ("We could...", "What if we...", "I suggest...")
- problem: Issues identified ("The problem is...", "We're struggling with...", "This doesn't work...")
- solution: Proposed fixes ("Let's fix this by...", "The solution is...", "We should...")
- risk: Concerns raised ("This might...", "I'm worried about...", "The risk is...")
- insight: Key observations ("I noticed...", "The data shows...", "Interestingly...")
- hypothesis: Assumptions ("I think...", "My guess is...", "Probably...")
- action_item: Tasks assigned ("John will...", "By Friday we need to...", "Let's schedule...")
- open_question: Unresolved questions ("How will we...", "What about...", "Do we know...?")

Return ONLY valid JSON. No markdown, no explanation."""

INSIGHT_EXTRACTION_USER_TEMPLATE = """Analyze this transcript segment:

{transcript}

Return JSON array of insights. Format:
[{{"type": "...", "content": "...", "speaker": "...", "confidence": 0.0-1.0}}]

Return [] if no insights found."""
```

---

### Phase 2.2: Frontend - Insight Display Components

#### 2.2.1 Insight Types and Hooks

**File:** `/frontend/types/insight.ts`

```typescript
export type InsightType =
  | 'idea'
  | 'problem'
  | 'solution'
  | 'risk'
  | 'insight'
  | 'hypothesis'
  | 'action_item'
  | 'open_question';

export interface Insight {
  id: string;
  type: InsightType;
  content: string;
  speaker?: string;
  speakerName?: string;
  confidence: number;
  transcriptRef?: string;
  timestamp: number;
}

export const INSIGHT_CONFIG: Record<InsightType, {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
}> = {
  idea: {
    icon: 'Lightbulb',
    label: 'Idea',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
  },
  problem: {
    icon: 'AlertTriangle',
    label: 'Problem',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
  },
  solution: {
    icon: 'CheckCircle',
    label: 'Solution',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950',
  },
  risk: {
    icon: 'AlertCircle',
    label: 'Risk',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950',
  },
  insight: {
    icon: 'Search',
    label: 'Insight',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
  },
  hypothesis: {
    icon: 'FlaskConical',
    label: 'Hypothesis',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
  },
  action_item: {
    icon: 'ClipboardList',
    label: 'Action Item',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950',
  },
  open_question: {
    icon: 'HelpCircle',
    label: 'Question',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950',
  },
};
```

#### 2.2.2 useInsights Hook

**File:** `/frontend/hooks/use-insights.ts`

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import type { Insight } from "@/types/insight";

const INSIGHT_TOPIC = "hedwiq.insight";
const MAX_INSIGHTS = 100;

interface TextStreamReader {
  info: {
    id: string;
    timestamp?: number;
    attributes?: Record<string, string>;
  };
  readAll: () => Promise<string>;
}

interface ParticipantInfo {
  identity: string;
}

export function useInsights() {
  const room = useRoomContext();
  const isMountedRef = useRef(true);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleInsightStream = useCallback(
    async (reader: TextStreamReader, participantInfo: ParticipantInfo) => {
      try {
        const rawJson = await reader.readAll();
        if (!isMountedRef.current) return;

        const data = JSON.parse(rawJson);
        const attrs = reader.info.attributes ?? {};

        const insight: Insight = {
          id: reader.info.id,
          type: data.type || attrs["insight_type"],
          content: data.content,
          speaker: data.speaker || attrs["speaker"],
          speakerName: data.speakerName || data.speaker,
          confidence: parseFloat(attrs["confidence"] || data.confidence || "0.8"),
          transcriptRef: data.transcript_ref,
          timestamp: reader.info.timestamp ?? Date.now(),
        };

        setInsights((prev) => {
          const updated = [insight, ...prev];
          return updated.slice(0, MAX_INSIGHTS);
        });
      } catch (err) {
        console.error("Failed to parse insight:", err);
      }
    },
    []
  );

  useEffect(() => {
    if (!room) return;

    room.registerTextStreamHandler(INSIGHT_TOPIC, handleInsightStream);

    return () => {
      room.unregisterTextStreamHandler(INSIGHT_TOPIC);
    };
  }, [room, handleInsightStream]);

  const insightsByType = insights.reduce((acc, insight) => {
    if (!acc[insight.type]) {
      acc[insight.type] = [];
    }
    acc[insight.type].push(insight);
    return acc;
  }, {} as Record<string, Insight[]>);

  return {
    insights,
    insightsByType,
    insightCount: insights.length,
  };
}
```

#### 2.2.3 InsightBadge Component

**File:** `/frontend/components/insights/insight-badge.tsx`

```typescript
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Lightbulb, AlertTriangle, CheckCircle, AlertCircle,
  Search, FlaskConical, ClipboardList, HelpCircle
} from "lucide-react";
import { INSIGHT_CONFIG, type InsightType } from "@/types/insight";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICONS = {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Search,
  FlaskConical,
  ClipboardList,
  HelpCircle,
};

interface InsightBadgeProps {
  type: InsightType;
  content: string;
  className?: string;
  onClick?: () => void;
}

export function InsightBadge({ type, content, className, onClick }: InsightBadgeProps) {
  const config = INSIGHT_CONFIG[type];
  const IconComponent = ICONS[config.icon as keyof typeof ICONS];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              "transition-all hover:scale-105 cursor-pointer",
              config.bgColor,
              config.color,
              className
            )}
          >
            <IconComponent className="size-3" />
            <span>{config.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

#### 2.2.4 InsightCard Component

**File:** `/frontend/components/insights/insight-card.tsx`

```typescript
"use client";

import React from "react";
import { cn, getInitials, getHashedColor } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Lightbulb, AlertTriangle, CheckCircle, AlertCircle,
  Search, FlaskConical, ClipboardList, HelpCircle
} from "lucide-react";
import { INSIGHT_CONFIG, type Insight } from "@/types/insight";

const ICONS = {
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Search,
  FlaskConical,
  ClipboardList,
  HelpCircle,
};

interface InsightCardProps {
  insight: Insight;
  className?: string;
  onClick?: () => void;
}

export function InsightCard({ insight, className, onClick }: InsightCardProps) {
  const config = INSIGHT_CONFIG[insight.type];
  const IconComponent = ICONS[config.icon as keyof typeof ICONS];
  const timestamp = new Date(insight.timestamp).toLocaleTimeString();

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        config.bgColor,
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-full", config.bgColor)}>
            <IconComponent className={cn("size-4", config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-xs font-medium", config.color)}>
                {config.label}
              </span>
              {insight.speaker && (
                <div className="flex items-center gap-1">
                  <Avatar className="size-4">
                    <AvatarFallback
                      className={cn(
                        "text-[8px] text-white",
                        getHashedColor(insight.speaker)
                      )}
                    >
                      {getInitials(insight.speakerName || insight.speaker)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">
                    {insight.speakerName || insight.speaker}
                  </span>
                </div>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {timestamp}
              </span>
            </div>
            <p className="text-sm">{insight.content}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 2.2.5 Enhanced TranscriptionSidebar with Insights

**File:** `/frontend/components/transcription/transcription-sidebar.tsx` (updated)

```typescript
// Add to existing TranscriptionSidebar

import { useInsights } from "@/hooks/use-insights";
import { InsightBadge } from "@/components/insights/insight-badge";

// Inside component:
const { insights, insightsByType } = useInsights();

// Find insights related to a transcript entry
const getInsightsForTranscript = (transcriptId: string) => {
  return insights.filter(i => i.transcriptRef === transcriptId);
};

// In render, after each TranscriptionMessage:
{entry.isFinal && getInsightsForTranscript(entry.id).map((insight) => (
  <div key={insight.id} className="ml-11 mt-1">
    <InsightBadge
      type={insight.type}
      content={insight.content}
    />
  </div>
))}
```

#### 2.2.6 InsightsSummaryPanel Component

**File:** `/frontend/components/insights/insights-summary-panel.tsx`

```typescript
"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInsights } from "@/hooks/use-insights";
import { InsightCard } from "./insight-card";
import { INSIGHT_CONFIG, type InsightType } from "@/types/insight";
import { Badge } from "@/components/ui/badge";

export function InsightsSummaryPanel() {
  const { insights, insightsByType, insightCount } = useInsights();

  const typeOrder: InsightType[] = [
    'action_item', 'problem', 'solution', 'risk',
    'idea', 'insight', 'hypothesis', 'open_question'
  ];

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Insights</h2>
        <Badge variant="secondary">{insightCount}</Badge>
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 p-4">
          <TabsContent value="all" className="space-y-3 mt-0">
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Insights will appear here as they are detected
              </p>
            ) : (
              insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))
            )}
          </TabsContent>

          <TabsContent value="actions" className="space-y-3 mt-0">
            {(insightsByType['action_item'] || []).map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </TabsContent>

          <TabsContent value="issues" className="space-y-3 mt-0">
            {[
              ...(insightsByType['problem'] || []),
              ...(insightsByType['risk'] || []),
              ...(insightsByType['open_question'] || []),
            ].map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
```

---

### Phase 2.3: Integration

#### 2.3.1 Meeting Layout Update

Update the meeting layout to show both transcription and insights:

```typescript
// In meeting-layout.tsx or similar
<div className="flex h-full">
  {/* Video grid */}
  <div className="flex-1">
    <VideoGrid />
  </div>

  {/* Right panel with tabs */}
  <div className="w-96 flex flex-col">
    <Tabs defaultValue="transcript">
      <TabsList>
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
        <TabsTrigger value="insights">
          Insights
          {insightCount > 0 && (
            <Badge className="ml-2">{insightCount}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="transcript" className="flex-1">
        <TranscriptionSidebar />
      </TabsContent>

      <TabsContent value="insights" className="flex-1">
        <InsightsSummaryPanel />
      </TabsContent>
    </Tabs>
  </div>
</div>
```

---

## Text Stream Topics Summary

| Topic | Purpose | Data Format |
|-------|---------|-------------|
| `lk.transcription` | Real-time transcription | Plain text with attributes |
| `hedwiq.insight` | Detected insights | JSON: `{type, content, speaker, confidence}` |
| `hedwiq.notes` | Auto-generated notes (Phase 2.4) | JSON: `{section, items[]}` |

---

## Performance Considerations

### LLM Call Optimization

1. **Debouncing**: Wait 1-2 seconds after speech pause before analyzing
2. **Batching**: Analyze multiple transcript segments together
3. **Streaming**: Use LLM streaming for faster perceived response
4. **Caching**: Skip analysis if transcript hasn't changed significantly

### Latency Budget

| Component | Target Latency |
|-----------|----------------|
| STT (Deepgram) | < 300ms |
| LLM Analysis | < 2000ms |
| Text Stream Delivery | < 100ms |
| Frontend Render | < 50ms |
| **Total Insight Latency** | **< 2500ms** |

### Cost Optimization

- Use `gpt-4o-mini` for speed and cost (~$0.15/1M input tokens)
- Only analyze final transcripts, not interim
- Set confidence threshold to filter low-quality insights
- Consider local/smaller models for high-volume usage

---

## Testing Strategy

### Unit Tests

1. Insight extraction prompt accuracy
2. JSON parsing and validation
3. Frontend component rendering
4. Text stream handling

### Integration Tests

1. Agent → Text Stream → Frontend flow
2. Multi-participant insight attribution
3. Concurrent transcription and insight display

### E2E Tests

1. Real conversation insight extraction
2. Insight display latency measurement
3. UI interaction with insights

---

## Deployment Considerations

### Environment Variables

```bash
# Agent
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

# Frontend (if using Vercel AI SDK as fallback)
NEXT_PUBLIC_OPENAI_API_KEY=... # Or use server-side proxy
```

### Agent Deployment

1. Update agent Docker container with new dependencies
2. Deploy to LiveKit Cloud or self-hosted infrastructure
3. Monitor LLM API usage and costs

---

## Migration Path

### Step 1: Backend Changes (Week 1)
- [ ] Create `HedwiqInsightAgent` class
- [ ] Implement LLM integration
- [ ] Add `hedwiq.insight` text stream publishing
- [ ] Test locally with frontend mock

### Step 2: Frontend Components (Week 1-2)
- [ ] Create types and schemas
- [ ] Implement `useInsights` hook
- [ ] Create `InsightBadge` component
- [ ] Create `InsightCard` component
- [ ] Create `InsightsSummaryPanel` component

### Step 3: Integration (Week 2)
- [ ] Connect frontend to agent text streams
- [ ] Update meeting layout with insights panel
- [ ] Add inline insight badges to transcription
- [ ] Implement insight filtering and search

### Step 4: Polish (Week 3)
- [ ] Performance optimization
- [ ] Error handling and fallbacks
- [ ] Accessibility improvements
- [ ] Documentation

---

## Future Enhancements (Phase 2.4+)

1. **Notes Generation**: Auto-cluster insights into structured notes
2. **Insight Editing**: Allow users to edit/delete insights
3. **Export**: Export insights as Markdown/JSON
4. **Search**: Full-text search within insights
5. **Linking**: Link insights back to transcript timestamps
6. **Multi-language**: Translate insights to user's preferred language

---

## Appendix: Alternative LLM Providers

| Provider | Model | Latency | Cost | Notes |
|----------|-------|---------|------|-------|
| OpenAI | gpt-4o-mini | ~1s | $$ | Recommended |
| Anthropic | claude-3-haiku | ~1s | $$ | Good alternative |
| Groq | llama-3.1-70b | ~0.3s | $ | Fastest, open model |
| Cerebras | llama-3.1-70b | ~0.3s | $ | Ultra-fast inference |
| Google | gemini-1.5-flash | ~1s | $$ | Good for context |

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Author: Claude Code Analysis*
