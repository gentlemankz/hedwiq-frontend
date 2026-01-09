# Agent Builder Feature - Comprehensive Plan

## Executive Summary

The Agent Builder is a new feature that enables users to create custom AI agents that automate meeting-related workflows. Agents can check meeting transcriptions, generate summaries, send emails to teams, and execute scheduled or trigger-based actions using the existing Luframe ecosystem (folders, teams, Gmail integration).

---

## 1. Feature Overview

### 1.1 Core Concept
Users build agents by writing natural language instructions with **@ mentions** to reference:
- **Folders**: `@General`, `@Sales Meetings`, `@Custom Folder`
- **Teams**: `@Marketing`, `@Engineering`
- **Services**: `@Gmail`, `@Calendar`

### 1.2 UI Layout (Three-Panel Design)
```
┌─────────────────────────────────────────────────────────────────┐
│                         Header                                   │
├──────────────┬──────────────────────────┬───────────────────────┤
│              │                          │                       │
│  Left Panel  │      Middle Panel        │    Right Panel        │
│  (Agents)    │    (Instructions)        │    (Settings)         │
│              │                          │                       │
│  - Agent 1   │  "Check latest meeting   │  Model: gpt-4o        │
│  - Agent 2   │   from @General folder,  │                       │
│  + New Agent │   make summary, send     │  Status: [Toggle]     │
│              │   to @Marketing team     │                       │
│              │   via @Gmail"            │  Schedule:            │
│              │                          │  - Daily at 9 AM      │
│              │                          │  - Weekly on Monday   │
│              │                          │                       │
│              │                          │  Triggers:            │
│              │                          │  - On meeting end     │
│              │                          │  - Manual only        │
│              │                          │                       │
└──────────────┴──────────────────────────┴───────────────────────┘
```

### 1.3 Example Use Cases

| Use Case | Instruction Example |
|----------|---------------------|
| Daily summary | "Check latest meeting from @General, summarize key points, send to @Engineering via @Gmail" |
| Action item follow-up | "For each meeting in @Sales Meetings, extract action items, email each participant their personal tasks via @Gmail" |
| Weekly digest | "Aggregate all meetings from @All Folders this week, create executive summary, send to @Leadership team" |
| Meeting completion trigger | "When meeting ends in @Client Calls, immediately send meeting notes to all participants via @Gmail" |

---

## 2. Technical Architecture

### 2.1 High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Agent List  │  │ Instruction │  │  Settings   │                  │
│  │   Panel     │  │   Editor    │  │   Panel     │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│         │                │                │                          │
│         └────────────────┼────────────────┘                          │
│                          ▼                                           │
│              ┌───────────────────────┐                              │
│              │   Agent Context API   │                              │
│              └───────────┬───────────┘                              │
└──────────────────────────┼──────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        API Routes (/api/agents)                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │   CRUD     │  │  Execute   │  │  Schedule  │  │   Logs     │     │
│  │  /agents   │  │  /execute  │  │   /cron    │  │  /history  │     │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │
└────────┼───────────────┼───────────────┼───────────────┼─────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Agent Execution Engine                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │  Instruction   │  │   Vercel AI    │  │    Action      │         │
│  │    Parser      │  │   SDK Core     │  │   Executor     │         │
│  │ (@ mentions)   │  │  (gpt-4o)      │  │(Gmail, etc.)   │         │
│  └────────────────┘  └────────────────┘  └────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
         │               │               │
         ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Data Layer                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │   Agents   │  │  Meetings  │  │   Teams    │  │   Gmail    │     │
│  │   Table    │  │  Folders   │  │  Members   │  │Integration │     │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack Addition
```json
{
  "dependencies": {
    "ai": "^4.0.0",           // Vercel AI SDK 6 core
    "@ai-sdk/openai": "^1.0.0" // OpenAI provider
  }
}
```

**Why Vercel AI SDK 6?**
- Clean streaming API for real-time feedback during agent execution
- Built-in tool/function calling support
- Works seamlessly with Next.js App Router
- Better suited for "offline" agent work (vs LiveKit Agents for real-time meetings)

---

## 3. Database Schema Design

### 3.1 New Tables

```typescript
// lib/db/schema.ts - Add these new tables

// ============================================================================
// Agent Builder Tables
// ============================================================================

export const agent = pgTable("agent", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // Basic info
  name: text("name").notNull(),
  description: text("description"),
  instructions: text("instructions").notNull(), // Natural language with @ mentions

  // Parsed references (extracted from instructions)
  referencedFolders: text("referenced_folders").array(), // folder IDs
  referencedTeams: text("referenced_teams").array(),     // team IDs
  referencedServices: text("referenced_services").array(), // ['gmail', 'calendar']

  // Configuration
  model: text("model").notNull().default("gpt-4o"),
  isActive: boolean("is_active").notNull().default(false),

  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentSchedule = pgTable("agent_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agent.id, { onDelete: "cascade" }),

  // Schedule type
  scheduleType: text("schedule_type", {
    enum: ["once", "hourly", "daily", "weekly", "monthly"]
  }).notNull(),

  // For 'once': specific datetime
  scheduledAt: timestamp("scheduled_at"),

  // For recurring: cron-like config
  hour: integer("hour"),         // 0-23
  minute: integer("minute"),     // 0-59
  dayOfWeek: integer("day_of_week"), // 0-6 (Sunday = 0)
  dayOfMonth: integer("day_of_month"), // 1-31
  timezone: text("timezone").default("UTC"),

  // Tracking
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  isEnabled: boolean("is_enabled").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const agentTrigger = pgTable("agent_trigger", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agent.id, { onDelete: "cascade" }),

  // Trigger type
  triggerType: text("trigger_type", {
    enum: ["meeting_end", "meeting_start", "new_meeting_in_folder", "manual"]
  }).notNull(),

  // Optional: scope trigger to specific folder/team
  scopeFolderId: uuid("scope_folder_id")
    .references(() => meetingFolder.id, { onDelete: "set null" }),
  scopeTeamId: uuid("scope_team_id")
    .references(() => team.id, { onDelete: "set null" }),

  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const agentExecution = pgTable("agent_execution", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agent.id, { onDelete: "cascade" }),

  // Execution context
  triggeredBy: text("triggered_by", {
    enum: ["schedule", "trigger", "manual"]
  }).notNull(),
  scheduleId: uuid("schedule_id")
    .references(() => agentSchedule.id, { onDelete: "set null" }),
  triggerId: uuid("trigger_id")
    .references(() => agentTrigger.id, { onDelete: "set null" }),

  // Status
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"]
  }).notNull().default("pending"),

  // Results
  inputContext: jsonb("input_context"), // What data was passed to agent
  outputResult: jsonb("output_result"), // What agent produced
  errorMessage: text("error_message"),

  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const agentRelations = relations(agent, ({ one, many }) => ({
  user: one(user, {
    fields: [agent.userId],
    references: [user.id],
  }),
  schedules: many(agentSchedule),
  triggers: many(agentTrigger),
  executions: many(agentExecution),
}));
```

### 3.2 Entity Relationship Diagram
```
┌─────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    User     │──1:N─│     Agent       │──1:N─│ AgentSchedule   │
└─────────────┘      │                 │      └─────────────────┘
                     │  - instructions │
                     │  - isActive     │──1:N─┌─────────────────┐
                     │  - model        │      │  AgentTrigger   │
                     └────────┬────────┘      └─────────────────┘
                              │
                              │ 1:N
                              ▼
                     ┌─────────────────┐
                     │ AgentExecution  │
                     │  - status       │
                     │  - result       │
                     └─────────────────┘

Referenced Entities (via @ mentions):
┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐
│  MeetingFolder   │  │    Team     │  │ GmailIntegration │
└──────────────────┘  └─────────────┘  └──────────────────┘
```

---

## 4. @ Mention System Design

### 4.1 Mention Types
| Prefix | Entity Type | Example | Resolved To |
|--------|-------------|---------|-------------|
| `@` | Folder | `@General` | `meetingFolder.id` |
| `@` | Team | `@Marketing` | `team.id` |
| `@` | Service | `@Gmail` | `"gmail"` service key |
| `@` | Special | `@All Folders` | All user's folders |

### 4.2 Parser Implementation
```typescript
// lib/agents/instruction-parser.ts

interface ParsedMention {
  type: "folder" | "team" | "service" | "special";
  rawText: string;      // "@Marketing"
  entityId?: string;    // UUID for folder/team
  entityName: string;   // "Marketing"
  serviceKey?: string;  // "gmail" | "calendar"
}

interface ParsedInstruction {
  rawInstruction: string;
  mentions: ParsedMention[];
  folderIds: string[];
  teamIds: string[];
  services: string[];
}

export async function parseInstruction(
  instruction: string,
  userId: string
): Promise<ParsedInstruction> {
  // 1. Extract all @ mentions using regex
  const mentionRegex = /@([A-Za-z0-9\s]+?)(?=\s|,|$|@)/g;

  // 2. For each mention, resolve to entity
  //    - Check folders by name
  //    - Check teams by name
  //    - Check known services

  // 3. Return structured result
}
```

### 4.3 Autocomplete Component
```typescript
// components/agents/mention-input.tsx

// Uses textarea with overlay for @ mention suggestions
// When user types @, show dropdown with:
// - User's folders (from context)
// - User's teams (from context)
// - Available services (Gmail, Calendar)
```

---

## 5. Schedule & Trigger System

### 5.1 Schedule Types

| Type | Configuration | Example |
|------|---------------|---------|
| Once | Specific datetime | "Run on Jan 15, 2025 at 9:00 AM" |
| Hourly | Every N hours | "Every 2 hours" |
| Daily | Time of day | "Daily at 9:00 AM" |
| Weekly | Day + time | "Every Monday at 9:00 AM" |
| Monthly | Day of month + time | "1st of month at 9:00 AM" |

### 5.2 Trigger Types

| Trigger | Fires When | Scope |
|---------|------------|-------|
| `meeting_end` | Meeting session ends | All meetings or specific folder |
| `meeting_start` | Meeting session starts | All meetings or specific folder |
| `new_meeting_in_folder` | New meeting added to folder | Specific folder |
| `manual` | User clicks "Run Now" | N/A |

### 5.3 Implementation Approach

**Option A: Vercel Cron (Recommended for MVP)**
```typescript
// app/api/cron/agents/route.ts
// Vercel cron runs every minute, checks for due schedules

export async function GET(request: Request) {
  // Verify cron secret
  // Find all schedules where nextRunAt <= now
  // Execute each due agent
  // Update nextRunAt for recurring schedules
}
```

**Option B: External Job Queue (Future Scale)**
- Use Inngest, Trigger.dev, or similar
- Better for high-volume, complex scheduling
- More infrastructure complexity

### 5.4 Trigger Implementation
```typescript
// lib/agents/trigger-dispatcher.ts

export async function dispatchTrigger(
  triggerType: "meeting_end" | "meeting_start" | "new_meeting_in_folder",
  context: {
    meetingId?: string;
    folderId?: string;
    userId: string;
  }
) {
  // 1. Find all agents with matching trigger type
  // 2. Filter by scope (folder/team if specified)
  // 3. Queue executions for each matching agent
}

// Called from existing meeting lifecycle hooks:
// - app/api/livekit/webhook/route.ts (meeting end)
// - Meeting creation endpoints (new meeting)
```

---

## 6. Agent Execution Engine

### 6.1 Execution Flow
```
┌─────────────────┐
│ Trigger/Schedule│
└────────┬────────┘
         ▼
┌─────────────────┐
│ Create Execution│  (status: pending)
│    Record       │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Parse @ Mentions│  Extract folder/team/service refs
└────────┬────────┘
         ▼
┌─────────────────┐
│ Gather Context  │  Fetch meetings, transcripts, team members
└────────┬────────┘
         ▼
┌─────────────────┐
│ Execute via     │  (status: running)
│ Vercel AI SDK   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Execute Actions │  Send emails, create events, etc.
└────────┬────────┘
         ▼
┌─────────────────┐
│ Store Result    │  (status: completed/failed)
└─────────────────┘
```

### 6.2 Vercel AI SDK Integration
```typescript
// lib/agents/executor.ts

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";

export async function executeAgent(
  agent: Agent,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const result = await generateText({
    model: openai("gpt-4o"),
    system: buildSystemPrompt(agent, context),
    prompt: agent.instructions,
    tools: {
      // Available tools based on agent's service references
      sendEmail: tool({
        description: "Send an email via Gmail",
        parameters: z.object({
          to: z.array(z.string()),
          subject: z.string(),
          body: z.string(),
        }),
        execute: async ({ to, subject, body }) => {
          // Use existing Gmail integration
          return await sendGmailEmail(context.userId, to, subject, body);
        },
      }),
      getMeetingTranscript: tool({
        description: "Get transcript from a meeting",
        parameters: z.object({
          meetingId: z.string(),
        }),
        execute: async ({ meetingId }) => {
          return await fetchMeetingTranscript(meetingId);
        },
      }),
      getTeamMembers: tool({
        description: "Get email addresses of team members",
        parameters: z.object({
          teamId: z.string(),
        }),
        execute: async ({ teamId }) => {
          return await fetchTeamMembers(teamId);
        },
      }),
      // ... more tools
    },
    maxSteps: 10, // Allow multi-step reasoning
  });

  return {
    output: result.text,
    toolCalls: result.toolCalls,
    usage: result.usage,
  };
}
```

---

## 7. UI Components

### 7.1 Component Structure
```
components/agents/
├── index.ts                    # Barrel exports
├── agent-builder-layout.tsx    # Three-panel layout container
├── agent-list-panel.tsx        # Left sidebar with agent list
├── agent-instruction-editor.tsx # Middle panel with @ mention support
├── agent-settings-panel.tsx    # Right sidebar with config
├── mention-input.tsx           # @ mention autocomplete input
├── mention-tag.tsx             # Rendered @ mention chip
├── schedule-config.tsx         # Schedule configuration UI
├── trigger-config.tsx          # Trigger configuration UI
├── execution-history.tsx       # Agent run history list
├── execution-detail-dialog.tsx # Single execution details
└── dialogs/
    ├── create-agent-dialog.tsx
    ├── delete-agent-dialog.tsx
    └── duplicate-agent-dialog.tsx
```

### 7.2 Page Structure
```
app/dashboard/agents/
├── page.tsx              # Main agent builder page
├── layout.tsx            # Agent builder layout
└── [agentId]/
    ├── page.tsx          # Edit specific agent
    └── history/
        └── page.tsx      # Execution history for agent
```

### 7.3 Sidebar Integration
Add to `dashboard-sidebar.tsx`:
```typescript
// Add to navigation items, after Teams section
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/dashboard/agents")}
    tooltip="Agents"
  >
    <Link href="/dashboard/agents">
      <Bot /> {/* from lucide-react */}
      <span>Agents</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

---

## 8. API Routes

### 8.1 Route Structure
```
app/api/agents/
├── route.ts                    # GET (list), POST (create)
├── [agentId]/
│   ├── route.ts                # GET, PATCH, DELETE
│   ├── execute/
│   │   └── route.ts            # POST - manual execution
│   ├── schedules/
│   │   ├── route.ts            # GET, POST schedules
│   │   └── [scheduleId]/
│   │       └── route.ts        # PATCH, DELETE schedule
│   ├── triggers/
│   │   ├── route.ts            # GET, POST triggers
│   │   └── [triggerId]/
│   │       └── route.ts        # PATCH, DELETE trigger
│   └── executions/
│       └── route.ts            # GET execution history
└── cron/
    └── route.ts                # Cron endpoint for scheduled runs
```

### 8.2 API Response Types
```typescript
// types/agent.ts

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  model: "gpt-4o";
  isActive: boolean;
  referencedFolders: string[];
  referencedTeams: string[];
  referencedServices: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSchedule {
  id: string;
  agentId: string;
  scheduleType: "once" | "hourly" | "daily" | "weekly" | "monthly";
  config: ScheduleConfig;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  isEnabled: boolean;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  triggeredBy: "schedule" | "trigger" | "manual";
  status: "pending" | "running" | "completed" | "failed";
  inputContext: Record<string, unknown>;
  outputResult: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}
```

---

## 9. Risk Assessment & Mitigations

### 9.1 Security Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt injection via instructions | High | Sanitize instructions, use structured tool calls, limit LLM capabilities |
| Unauthorized data access | High | Verify user owns referenced folders/teams before execution |
| Email abuse (spam) | Medium | Rate limiting, daily email caps per agent, review queue for new agents |
| API key exposure | High | Server-side only execution, never expose OpenAI keys to client |
| Cron endpoint abuse | Medium | Verify cron secret header, rate limit |

### 9.2 Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| High OpenAI costs | High | Token usage tracking, user quotas, model selection limits |
| Execution failures | Medium | Retry logic, dead letter queue, user notifications |
| Schedule drift | Low | Use UTC internally, precise cron calculations |
| Gmail rate limits | Medium | Queue emails, respect Gmail API limits (100/day for free) |

### 9.3 UX Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex instructions fail | Medium | Instruction validation, preview mode, example templates |
| Users don't understand @ mentions | Medium | Clear documentation, autocomplete, inline help |
| Agent does wrong thing | Medium | Dry-run mode, confirmation for destructive actions |

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema (agent, schedule, trigger, execution tables)
- [ ] Basic CRUD API routes for agents
- [ ] UI: Three-panel layout skeleton
- [ ] UI: Agent list panel with create/delete

### Phase 2: Instructions & Mentions (Week 2-3)
- [ ] @ mention parser implementation
- [ ] Mention autocomplete component
- [ ] Instruction editor with mention support
- [ ] Instruction validation

### Phase 3: Execution Engine (Week 3-4)
- [ ] Vercel AI SDK integration
- [ ] Tool definitions (email, transcript, team)
- [ ] Manual execution (Run Now)
- [ ] Execution history UI

### Phase 4: Scheduling (Week 4-5)
- [ ] Schedule configuration UI
- [ ] Cron endpoint for scheduled runs
- [ ] Schedule management API
- [ ] Next run time calculations

### Phase 5: Triggers (Week 5-6)
- [ ] Trigger configuration UI
- [ ] Meeting end trigger integration
- [ ] Trigger dispatcher implementation
- [ ] Scope filtering (folder/team)

### Phase 6: Polish & Scale (Week 6-7)
- [ ] Error handling & retries
- [ ] Usage tracking & quotas
- [ ] Agent templates
- [ ] Performance optimization

---

## 11. Best Practices & Recommendations

### 11.1 Code Organization
- Keep agent execution logic in `lib/agents/` separate from API routes
- Use Zod for all API request validation
- Implement proper TypeScript types for all agent-related entities

### 11.2 Testing Strategy
- Unit tests for instruction parser
- Integration tests for execution engine
- E2E tests for critical flows (create agent, manual run)

### 11.3 Monitoring
- Log all agent executions with context
- Track OpenAI token usage per user/agent
- Alert on high failure rates

### 11.4 Future Considerations
- **Multi-model support**: Add Claude, Gemini when ready
- **Agent marketplace**: Share/import agent templates
- **Webhooks**: Allow external triggers via webhook
- **Conditional logic**: If/else in instructions
- **Agent chaining**: One agent triggers another

---

## 12. Open Questions

1. **Subscription tier limits**: How many agents per free/paid user?
2. **Execution frequency limits**: Max runs per day/hour?
3. **Email sending limits**: Tie to Gmail API limits or custom caps?
4. **Agent sharing**: Can agents be shared between team members?
5. **Audit logging**: How long to retain execution history?

---

## Appendix A: Example Agent Configurations

### A.1 Daily Meeting Summary Agent
```json
{
  "name": "Daily Meeting Digest",
  "instructions": "Every day, check all meetings from @General folder that occurred in the last 24 hours. Create a brief summary of each meeting including key decisions and action items. Send a consolidated digest email to @Engineering team via @Gmail with subject 'Daily Meeting Digest'.",
  "schedule": {
    "type": "daily",
    "hour": 18,
    "minute": 0,
    "timezone": "America/New_York"
  },
  "model": "gpt-4o",
  "isActive": true
}
```

### A.2 Meeting Follow-up Agent
```json
{
  "name": "Instant Meeting Follow-up",
  "instructions": "When a meeting ends in @Client Calls folder, immediately: 1) Extract all action items from the transcript, 2) For each participant, compile their personal action items, 3) Send individual follow-up emails via @Gmail to each participant with their specific tasks and meeting highlights.",
  "trigger": {
    "type": "meeting_end",
    "scopeFolderId": "client-calls-folder-id"
  },
  "model": "gpt-4o",
  "isActive": true
}
```

---

## Appendix B: Related Existing Code

| Feature | Location | Relevance |
|---------|----------|-----------|
| Gmail integration | `lib/gmail/`, `app/api/gmail/` | Email sending capability |
| Calendar integration | `lib/calendar/`, `app/api/calendar/` | Future calendar actions |
| Team management | `lib/teams/`, `components/teams/` | Team @ mention resolution |
| Folder management | `lib/folders/`, `components/folders/` | Folder @ mention resolution |
| Meeting data | `lib/db/queries/meetings.ts` | Transcript access |
| Sidebar UI | `components/layout/dashboard-sidebar.tsx` | Navigation integration |

---

*Document created: January 2025*
*Last updated: January 2025*
