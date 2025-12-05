# Hedwiq Product Requirements Document (PRD)

## Executive Summary

Hedwiq is a next-generation agentic meeting application that seamlessly integrates AI capabilities directly into the video conferencing experience. Unlike traditional meeting platforms that rely on external bots or plugins, Hedwiq provides native AI features including real-time transcription, intelligent insights extraction, and automated note generation.

---

## 1. Product Vision

### 1.1 Problem Statement

Current meeting platforms suffer from:
- **Fragmented AI integration**: Bots appear as separate participants, disrupting the meeting flow
- **Post-meeting summaries only**: Insights arrive after the meeting ends, reducing actionable value
- **Manual note-taking burden**: Participants must divide attention between listening and documenting
- **Lost context**: Key decisions, action items, and risks are buried in lengthy transcripts

### 1.2 Solution

Hedwiq transforms every meeting into a **knowledge engine** by:
- Embedding AI agents natively into the platform (invisible to participants)
- Providing real-time transcription with speaker differentiation
- Automatically detecting and highlighting meeting insights as they occur
- Generating and continuously updating structured notes without user intervention

### 1.3 Target Users

- **Primary**: Knowledge workers in remote/hybrid teams
- **Secondary**: Sales teams, customer success, product managers
- **Enterprise**: Organizations requiring meeting compliance and documentation

---

## 2. Technical Architecture

### 2.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16 + React 19 | App Router, SSR, modern React features |
| UI Components | shadcn/ui + Radix UI | Accessible, customizable component library |
| Styling | Tailwind CSS v4 | OKLCH color space, dark/light themes |
| Real-time Media | LiveKit | WebRTC-based video/audio/data |
| AI Agents | LiveKit Agents (Python) | STT, LLM, real-time analysis |
| Authentication | Better Auth | OAuth, sessions, organizations |
| Database | PostgreSQL | User data, meeting records, notes |

### 2.2 LiveKit Integration

LiveKit provides the real-time infrastructure for Hedwiq:

#### 2.2.1 Core Capabilities

| Feature | LiveKit Component | Hedwiq Usage |
|---------|-------------------|--------------|
| Video/Audio | Room, Tracks | Participant media streams |
| Real-time Transcription | Agents STT | Speech-to-text for all participants |
| AI Processing | Agents LLM | Insight extraction, summarization |
| Text Streaming | Data Streams | Transcript/insight delivery to UI |
| State Sync | Room Metadata | Meeting state, participant attributes |

#### 2.2.2 Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LiveKit Room                            │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Participant │ Participant │ Participant │   Hedwiq Agent   │
│   (User A)  │   (User B)  │   (User C)  │   (Invisible)    │
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬─────────┘
       │             │             │               │
       └─────────────┴─────────────┴───────────────┘
                           │
                    Audio Streams
                           │
                           ▼
       ┌───────────────────────────────────────────┐
       │            Hedwiq Agent Pipeline          │
       ├───────────────────────────────────────────┤
       │  ┌─────┐   ┌─────┐   ┌──────────────┐    │
       │  │ VAD │ → │ STT │ → │ Transcription │   │
       │  └─────┘   └─────┘   │   Output      │   │
       │                      └───────┬───────┘   │
       │                              │           │
       │                              ▼           │
       │                      ┌──────────────┐    │
       │                      │     LLM      │    │
       │                      │  (Analysis)  │    │
       │                      └───────┬──────┘   │
       │                              │           │
       │              ┌───────────────┼───────────┤
       │              ▼               ▼           │
       │      ┌─────────────┐  ┌────────────┐    │
       │      │  Insights   │  │   Notes    │    │
       │      │  Extraction │  │ Generation │    │
       │      └──────┬──────┘  └─────┬──────┘    │
       └─────────────┼───────────────┼───────────┘
                     │               │
                     ▼               ▼
              Text Streams to Frontend
```

#### 2.2.3 Text Stream Topics

| Topic | Purpose | Data Format |
|-------|---------|-------------|
| `lk.transcription` | Real-time transcription | `{ text, speaker_id, timestamp, is_final }` |
| `hedwiq.insight` | Detected insights | `{ type, content, confidence, context }` |
| `hedwiq.notes` | Auto-generated notes | `{ section, content, related_insights[] }` |
| `lk.chat` | Participant chat | Standard text messages |

### 2.3 Authentication (Better Auth)

Better Auth provides comprehensive authentication for Hedwiq:

#### 2.3.1 Authentication Methods

| Method | Use Case |
|--------|----------|
| OAuth (Google, Microsoft) | Primary sign-in for enterprise users |
| Magic Links | Quick guest access for meeting invites |
| Passkeys/WebAuthn | High-security option for hosts |
| Email/Password | Fallback authentication |

#### 2.3.2 Organization Model

```
Organization (Workspace)
├── Members
│   ├── Owner (full admin)
│   ├── Admin (manage members, settings)
│   ├── Member (create/join meetings)
│   └── Guest (join specific meetings)
├── Settings
│   ├── Allowed domains
│   ├── Default meeting settings
│   └── AI feature toggles
└── Meetings
    ├── Recordings
    ├── Transcripts
    └── Notes
```

#### 2.3.3 Meeting Access Control

| Role | Permissions |
|------|-------------|
| Host | Start/end meeting, manage participants, access all features |
| Co-host | Manage participants, mute/remove, share screen |
| Participant | Join, speak, share screen (if allowed), view transcription |
| Viewer | Watch-only, view transcription |

---

## 3. Feature Specifications

### 3.1 Real-time Transcription

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| TR-01 | Display transcription in right sidebar | P0 |
| TR-02 | Differentiate speakers by color and label | P0 |
| TR-03 | Show speaker name/avatar next to transcript | P0 |
| TR-04 | Support interim (live) and final transcripts | P1 |
| TR-05 | Auto-scroll with manual scroll lock | P1 |
| TR-06 | Highlight current speaker | P2 |
| TR-07 | Search within transcript | P2 |

#### UI Component: TranscriptionSidebar

```tsx
interface TranscriptionEntry {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  insights?: InsightBadge[];
}

interface TranscriptionSidebarProps {
  entries: TranscriptionEntry[];
  currentSpeaker?: string;
  onInsightClick?: (insight: Insight) => void;
}
```

### 3.2 Real-time Insights

#### Insight Categories

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| Idea | 💡 | New suggestions or proposals | "We could use machine learning for this" |
| Problem | ⚠️ | Issues, challenges, pain points | "The current system is too slow" |
| Solution | ✅ | Proposed solutions | "Let's implement caching" |
| Risk | 🔴 | Risks, limitations, uncertainties | "This might break existing integrations" |
| Insight | 🔍 | Meaningful observations | "Users spend 80% of time on dashboard" |
| Hypothesis | 🧪 | Assumptions to validate | "I think users prefer mobile" |
| Action Item | 📋 | Tasks requiring follow-up | "John will prepare the report by Friday" |
| Open Question | ❓ | Unresolved questions | "How will we handle authentication?" |

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| IN-01 | Detect and classify insights in real-time | P0 |
| IN-02 | Display insight badges inline with transcript | P0 |
| IN-03 | Show insight cards with context on hover/click | P1 |
| IN-04 | Allow manual insight creation/editing | P1 |
| IN-05 | Filter/group insights by type | P2 |
| IN-06 | Export insights as structured data | P2 |

#### UI Components

```tsx
interface Insight {
  id: string;
  type: InsightType;
  content: string;
  confidence: number;
  speakerId: string;
  timestamp: number;
  transcriptRef: string; // Reference to transcript entry
  context: string; // Surrounding text
}

// Badge shown inline with transcript
<InsightBadge type="action_item" onClick={showDetails} />

// Card shown on click/hover
<InsightCard
  insight={insight}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onAddToNotes={handleAddToNotes}
/>
```

### 3.3 Auto-Generated Notes

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NT-01 | Generate notes from insights automatically | P0 |
| NT-02 | Cluster related insights into sections | P0 |
| NT-03 | Update notes continuously during meeting | P1 |
| NT-04 | Allow manual editing of notes | P1 |
| NT-05 | Link notes back to transcript timestamps | P1 |
| NT-06 | Generate meeting summary at end | P1 |
| NT-07 | Export notes as Markdown/PDF | P2 |

#### Note Structure

```tsx
interface MeetingNotes {
  meetingId: string;
  title: string;
  date: Date;
  participants: Participant[];
  sections: NoteSection[];
  summary?: string;
}

interface NoteSection {
  id: string;
  title: string; // e.g., "Key Decisions", "Action Items", "Open Questions"
  items: NoteItem[];
  autoGenerated: boolean;
}

interface NoteItem {
  id: string;
  content: string;
  sourceInsights: string[]; // Insight IDs
  timestamp?: number;
  assignee?: string; // For action items
  dueDate?: Date; // For action items
}
```

### 3.4 Video Conferencing Core

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| VC-01 | Support up to 25 participants with video | P0 |
| VC-02 | Support up to 100 participants audio-only | P1 |
| VC-03 | Screen sharing (single and multi-share) | P0 |
| VC-04 | Virtual backgrounds | P2 |
| VC-05 | Breakout rooms | P2 |
| VC-06 | Recording (cloud and local) | P1 |
| VC-07 | Noise cancellation (Krisp integration) | P1 |

---

## 4. User Flows

### 4.1 Meeting Creation Flow

```
1. User clicks "New Meeting"
2. System creates LiveKit room
3. User configures meeting settings:
   - Title
   - Scheduled time (optional)
   - Participants (optional)
   - AI features toggle
4. System generates meeting link
5. User shares link or starts immediately
```

### 4.2 Meeting Join Flow

```
1. User clicks meeting link
2. System checks authentication:
   - Authenticated → Check org membership
   - Guest → Show magic link sign-in or name entry
3. Pre-join lobby:
   - Camera/mic preview
   - Device selection
   - Background blur toggle
4. User joins room
5. LiveKit connects participant
6. Agent begins transcription
```

### 4.3 In-Meeting AI Flow

```
1. Agent receives audio streams from all participants
2. VAD detects speech → STT generates transcript
3. Transcript streamed to frontend (lk.transcription topic)
4. LLM analyzes transcript chunks for insights
5. Detected insights streamed to frontend (hedwiq.insight topic)
6. Notes generator clusters insights into sections
7. Notes streamed to frontend (hedwiq.notes topic)
8. User can interact with any component (edit, export, etc.)
```

---

## 5. Data Models

### 5.1 Meeting

```typescript
interface Meeting {
  id: string;
  organizationId: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  hostId: string;
  participants: MeetingParticipant[];
  settings: MeetingSettings;
  livekitRoom?: string;
  recording?: Recording;
  transcript?: Transcript;
  notes?: MeetingNotes;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

interface MeetingSettings {
  transcriptionEnabled: boolean;
  insightsEnabled: boolean;
  notesEnabled: boolean;
  recordingEnabled: boolean;
  waitingRoomEnabled: boolean;
  allowGuestAccess: boolean;
}
```

### 5.2 Transcript

```typescript
interface Transcript {
  id: string;
  meetingId: string;
  entries: TranscriptEntry[];
  insights: Insight[];
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TranscriptEntry {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  startTime: number; // ms from meeting start
  endTime: number;
  isFinal: boolean;
  words?: WordTiming[];
}

interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}
```

---

## 6. API Specifications

### 6.1 REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings` | POST | Create new meeting |
| `/api/meetings/:id` | GET | Get meeting details |
| `/api/meetings/:id/join` | POST | Generate join token |
| `/api/meetings/:id/transcript` | GET | Get meeting transcript |
| `/api/meetings/:id/insights` | GET | Get meeting insights |
| `/api/meetings/:id/notes` | GET/PUT | Get or update notes |
| `/api/organizations/:id/members` | GET | List org members |

### 6.2 LiveKit Token Generation

```typescript
// Server-side token generation
import { AccessToken } from 'livekit-server-sdk';

async function generateMeetingToken(
  userId: string,
  meetingId: string,
  role: MeetingRole
): Promise<string> {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: userId,
      name: userName,
      metadata: JSON.stringify({ role, meetingId }),
    }
  );

  token.addGrant({
    room: meetingId,
    roomJoin: true,
    canPublish: role !== 'viewer',
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}
```

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target |
|--------|--------|
| Time to first transcript | < 500ms from speech |
| Insight detection latency | < 2s from relevant speech |
| Video latency (P95) | < 150ms |
| Page load time | < 2s |

### 7.2 Scalability

| Metric | Target |
|--------|--------|
| Concurrent meetings | 10,000+ |
| Participants per meeting | Up to 100 |
| Transcript storage | 1 year retention |

### 7.3 Security

| Requirement | Implementation |
|-------------|----------------|
| Data encryption at rest | AES-256 |
| Data encryption in transit | TLS 1.3 |
| Authentication | Better Auth with MFA option |
| Authorization | Role-based access control |
| Compliance | SOC 2 Type II (roadmap) |

---

## 8. Implementation Phases

### Phase 1: Foundation (MVP)

- [ ] User authentication (Better Auth)
- [ ] Basic video conferencing (LiveKit)
- [ ] Real-time transcription
- [ ] Simple transcript UI

### Phase 2: Intelligence

- [ ] Insight detection agent
- [ ] Inline insight badges
- [ ] Insight detail cards
- [ ] Basic notes generation

### Phase 3: Collaboration

- [ ] Organization/team support
- [ ] Meeting scheduling
- [ ] Note editing and sharing
- [ ] Export functionality

### Phase 4: Enterprise

- [ ] SSO integration (SAML, OIDC)
- [ ] Advanced admin controls
- [ ] Compliance features
- [ ] API access for integrations

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User activation | 60% create meeting in first session | Analytics |
| Feature adoption | 80% use transcription | Feature flags |
| Insight accuracy | 85% user acceptance rate | Feedback |
| Meeting efficiency | 20% shorter meetings | Duration comparison |
| NPS | 50+ | Quarterly surveys |

---

## 10. Open Questions

1. **Pricing model**: Per-seat vs. per-minute vs. hybrid?
2. **Data residency**: Region-specific deployments needed?
3. **Offline support**: PWA with limited offline capabilities?
4. **Mobile apps**: Native iOS/Android or responsive web only?
5. **Integrations**: Priority for calendar (Google/Outlook) vs. productivity tools (Notion/Slack)?

---

## Appendix A: LiveKit Agent Example

```python
from livekit.agents import (
    AgentSession, Agent, RunContext,
    function_tool, llm, stt, tts, JobContext
)
from livekit.agents.voice import AgentSession

class HedwiqTranscriptionAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions="""You are a meeting analysis agent.
            Your job is to:
            1. Transcribe speech accurately
            2. Identify key insights (ideas, problems, solutions, risks, action items)
            3. Generate structured notes

            Output insights in JSON format with type, content, and confidence.""",
        )

    @function_tool()
    async def extract_insight(
        self,
        context: RunContext,
        insight_type: str,
        content: str,
        confidence: float
    ) -> dict:
        """Extract and emit an insight from the conversation.

        Args:
            insight_type: One of: idea, problem, solution, risk, insight,
                          hypothesis, action_item, open_question
            content: The insight content
            confidence: Confidence score 0-1
        """
        # Emit insight via text stream
        await context.session.room.local_participant.send_text(
            json.dumps({
                "type": insight_type,
                "content": content,
                "confidence": confidence,
                "timestamp": time.time()
            }),
            topic="hedwiq.insight"
        )
        return {"status": "emitted"}

async def entrypoint(ctx: JobContext):
    session = AgentSession(
        stt=stt.STT.with_groq(),  # Fast transcription
        llm=llm.LLM.with_openai(), # GPT-4 for analysis
        agent=HedwiqTranscriptionAgent(),
    )

    await session.start(
        room=ctx.room,
        participant=ctx.participant,
    )
```

---

## Appendix B: Frontend Component Structure

```
components/
├── meeting/
│   ├── MeetingRoom.tsx        # Main meeting container
│   ├── VideoGrid.tsx          # Participant video layout
│   ├── ControlBar.tsx         # Meeting controls
│   └── PreJoinLobby.tsx       # Pre-meeting setup
├── transcription/
│   ├── TranscriptionSidebar.tsx
│   ├── TranscriptEntry.tsx
│   └── SpeakerIndicator.tsx
├── insights/
│   ├── InsightBadge.tsx
│   ├── InsightCard.tsx
│   ├── InsightFilter.tsx
│   └── InsightList.tsx
├── notes/
│   ├── NotesPanel.tsx
│   ├── NoteSection.tsx
│   ├── NoteItem.tsx
│   └── NotesExport.tsx
└── ui/                        # shadcn/ui components
    └── ...
```

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Author: Hedwiq Product Team*
