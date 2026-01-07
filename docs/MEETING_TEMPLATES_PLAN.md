# Meeting Templates Feature - Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding meeting templates to Luframe. The goal is to transform the current manual meeting creation process into a streamlined, template-driven experience that promotes effective meetings through structured agendas, time allocations, and meeting effectiveness questions.

---

## 1. Current State Analysis

### 1.1 Existing Architecture

**Meeting Creation Flows:**
- **Instant Meeting**: Users enter details on pre-join screen (`/app/meetings/[roomId]/pre-join-screen.tsx`)
- **Scheduled Meeting**: Users fill out a dialog form (`/components/meetings/schedule-meeting-dialog.tsx`)

**Current Meeting Data Model:**
```typescript
// From types/meeting.ts
interface Meeting {
  id: string;
  roomId: string;
  hostId: string;
  folderId: string | null;
  title: string;
  description?: string | null;
  type: MeetingType; // "instant" | "scheduled"
  status: MeetingStatus;
  scheduledAt?: string | null;
  durationMinutes: number;
  timezone?: string | null;
  settings?: MeetingSettings | null;
  createdAt: string;
  updatedAt: string;
}
```

**Existing Agenda System:**
```typescript
// From lib/db/schema.ts
agenda: {
  id, roomId, createdBy, meetingId, meetingName,
  scheduledAt, itemCount, status, currentItemIndex, version
}

agendaItem: {
  id, agendaId, orderIndex, title, description,
  estimatedDuration, presenter, status
}
```

**Team System:**
- Teams exist with hierarchical structure (parentTeamId)
- TeamMember with roles (owner, admin, member)
- Already supports team-based meeting invitations

### 1.2 Pain Points Identified

1. **Manual Entry**: Every meeting requires manual input of title, agenda, duration
2. **No Structure**: No guidance on effective meeting practices
3. **Repetitive Work**: Recurring meeting types (standups, 1-on-1s) need re-creation
4. **No Best Practices**: Users don't receive prompts for meeting goals or outcomes

---

## 2. Template Types & Structure

### 2.1 System Templates (Built-in)

Based on the meeting framework research, we'll implement these core templates:

| Template | Duration | Cadence | Key Focus |
|----------|----------|---------|-----------|
| **Daily Standup** | 15 min | Daily | Quick sync, blockers, priorities |
| **Weekly Tactical** | 60 min | Weekly | Progress, metrics, decisions |
| **1-on-1** | 30 min | Biweekly | Career, feedback, support |
| **Monthly Strategic** | 90 min | Monthly | Goals, strategy, alignment |
| **Quarterly Offsite** | 240 min | Quarterly | Big picture, planning |
| **Retrospective** | 60 min | Sprint-end | What worked, improvements |
| **Decision Meeting** | 45 min | As needed | Single decision focus |
| **Brainstorm** | 60 min | As needed | Idea generation |

### 2.2 Template Data Structure

```typescript
// New types/template.ts

export type TemplateCategory =
  | "sync"        // Daily standups, check-ins
  | "tactical"    // Weekly tactical, team meetings
  | "strategic"   // Monthly/quarterly planning
  | "one_on_one"  // 1-on-1 meetings
  | "workshop"    // Brainstorms, retrospectives
  | "decision";   // Decision-focused meetings

export type TemplateScope = "system" | "team" | "personal";

export interface MeetingTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  scope: TemplateScope;

  // Ownership
  teamId?: string | null;      // For team templates
  createdBy?: string | null;   // For personal templates

  // Default values
  defaultDuration: number;     // Minutes
  suggestedCadence?: string;   // "daily", "weekly", "biweekly", etc.

  // Meeting goal/purpose
  defaultGoal?: string;

  // Agenda template
  agendaItems: TemplateAgendaItem[];

  // Effectiveness questions
  planningQuestions: PlanningQuestion[];

  // Settings defaults
  defaultSettings: MeetingSettings;

  // Metadata
  isArchived: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateAgendaItem {
  id: string;
  orderIndex: number;
  title: string;
  description?: string;
  estimatedDuration: number;   // Minutes
  isRequired: boolean;         // Can user remove this item?
  presenterRole?: string;      // "host", "participant", "anyone"
}

export interface PlanningQuestion {
  id: string;
  question: string;
  category: "goal" | "attendees" | "preparation" | "outcome";
  isRequired: boolean;
  placeholder?: string;
}
```

### 2.3 System Template Definitions

```typescript
// lib/templates/system-templates.ts

export const SYSTEM_TEMPLATES: Omit<MeetingTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: "Daily Standup",
    description: "Quick daily sync to share progress and identify blockers",
    category: "sync",
    scope: "system",
    defaultDuration: 15,
    suggestedCadence: "daily",
    defaultGoal: "Align on today's priorities and surface any blockers",
    agendaItems: [
      {
        orderIndex: 0,
        title: "What I accomplished yesterday",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "participant"
      },
      {
        orderIndex: 1,
        title: "What I'm working on today",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "participant"
      },
      {
        orderIndex: 2,
        title: "Blockers & help needed",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "participant"
      }
    ],
    planningQuestions: [
      {
        question: "What specific blocker needs to be resolved today?",
        category: "goal",
        isRequired: false
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: false
    }
  },

  {
    name: "Weekly Tactical",
    description: "Review metrics, discuss priorities, and make tactical decisions",
    category: "tactical",
    scope: "system",
    defaultDuration: 60,
    suggestedCadence: "weekly",
    defaultGoal: "Review progress, align on priorities, and resolve tactical issues",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Metrics Review",
        description: "Review key metrics and KPIs",
        estimatedDuration: 10,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Progress Updates",
        description: "Team updates on key initiatives",
        estimatedDuration: 20,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "Blockers & Escalations",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Decisions & Action Items",
        estimatedDuration: 15,
        isRequired: true
      }
    ],
    planningQuestions: [
      {
        question: "What decisions must be made by the end of this meeting?",
        category: "goal",
        isRequired: true,
        placeholder: "e.g., Finalize Q2 priorities, Approve budget request"
      },
      {
        question: "What pre-read materials should attendees review?",
        category: "preparation",
        isRequired: false,
        placeholder: "e.g., Weekly metrics dashboard, Project status doc"
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true
    }
  },

  {
    name: "1-on-1",
    description: "Regular check-in between manager and direct report",
    category: "one_on_one",
    scope: "system",
    defaultDuration: 30,
    suggestedCadence: "biweekly",
    defaultGoal: "Connect on progress, challenges, and career development",
    agendaItems: [
      {
        orderIndex: 0,
        title: "How are you doing?",
        description: "General check-in on wellbeing",
        estimatedDuration: 5,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Your updates & priorities",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "participant"
      },
      {
        orderIndex: 2,
        title: "Challenges & support needed",
        estimatedDuration: 10,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Career & growth discussion",
        estimatedDuration: 5,
        isRequired: false
      }
    ],
    planningQuestions: [
      {
        question: "What's the most important thing we should discuss?",
        category: "goal",
        isRequired: false
      },
      {
        question: "Is there feedback you want to share or receive?",
        category: "goal",
        isRequired: false
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: false  // Privacy for 1-on-1s
    }
  },

  {
    name: "Monthly Strategic",
    description: "Review strategy, discuss big-picture goals, and plan ahead",
    category: "strategic",
    scope: "system",
    defaultDuration: 90,
    suggestedCadence: "monthly",
    defaultGoal: "Align on strategic direction and upcoming priorities",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Month in Review",
        description: "Key wins, learnings, and metrics",
        estimatedDuration: 20,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Strategic Discussion",
        description: "Deep dive on strategic topic",
        estimatedDuration: 30,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "Next Month Planning",
        description: "Priorities and resource allocation",
        estimatedDuration: 25,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Decisions & Commitments",
        estimatedDuration: 15,
        isRequired: true
      }
    ],
    planningQuestions: [
      {
        question: "What strategic question should we answer in this meeting?",
        category: "goal",
        isRequired: true
      },
      {
        question: "Who needs to be in this meeting to make decisions?",
        category: "attendees",
        isRequired: true
      },
      {
        question: "What data or context should be shared before the meeting?",
        category: "preparation",
        isRequired: false
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true
    }
  },

  {
    name: "Retrospective",
    description: "Reflect on what worked, what didn't, and how to improve",
    category: "workshop",
    scope: "system",
    defaultDuration: 60,
    suggestedCadence: "sprint-end",
    defaultGoal: "Identify improvements and celebrate wins",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Set the Stage",
        description: "Check-in and prime directive",
        estimatedDuration: 5,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "What Went Well",
        description: "Celebrate successes and wins",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "What Could Improve",
        description: "Identify challenges and friction",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Action Items",
        description: "Commit to specific improvements",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 4,
        title: "Close & Appreciate",
        description: "Recognize contributions",
        estimatedDuration: 10,
        isRequired: false
      }
    ],
    planningQuestions: [
      {
        question: "What's the scope of this retro (sprint, project, quarter)?",
        category: "goal",
        isRequired: true
      },
      {
        question: "What specific outcome should change after this retro?",
        category: "outcome",
        isRequired: true,
        placeholder: "e.g., New process for code reviews, Clearer sprint goals"
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: false  // Encourage candid feedback
    }
  },

  {
    name: "Decision Meeting",
    description: "Focused session to make a specific decision",
    category: "decision",
    scope: "system",
    defaultDuration: 45,
    suggestedCadence: "as-needed",
    defaultGoal: "Make a clear decision with committed next steps",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Context & Background",
        description: "Set the stage for the decision",
        estimatedDuration: 10,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Options & Trade-offs",
        description: "Present and discuss alternatives",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "Decision",
        description: "Make the call",
        estimatedDuration: 10,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Next Steps & Owners",
        description: "Assign action items",
        estimatedDuration: 10,
        isRequired: true
      }
    ],
    planningQuestions: [
      {
        question: "What specific decision must be made?",
        category: "goal",
        isRequired: true,
        placeholder: "e.g., Which vendor to select, Go/no-go on launch"
      },
      {
        question: "Who has the authority to make this decision?",
        category: "attendees",
        isRequired: true
      },
      {
        question: "What information is needed to make this decision?",
        category: "preparation",
        isRequired: true
      },
      {
        question: "What will be different after this decision is made?",
        category: "outcome",
        isRequired: true
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true
    }
  },

  {
    name: "Brainstorm",
    description: "Creative session to generate ideas and explore possibilities",
    category: "workshop",
    scope: "system",
    defaultDuration: 60,
    suggestedCadence: "as-needed",
    defaultGoal: "Generate diverse ideas and identify promising directions",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Problem/Opportunity Framing",
        description: "Define what we're brainstorming about",
        estimatedDuration: 10,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Divergent Thinking",
        description: "Generate ideas without judgment",
        estimatedDuration: 25,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "Convergent Thinking",
        description: "Group, discuss, and prioritize ideas",
        estimatedDuration: 20,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Next Steps",
        description: "Decide what to explore further",
        estimatedDuration: 5,
        isRequired: true
      }
    ],
    planningQuestions: [
      {
        question: "What specific problem or opportunity are we exploring?",
        category: "goal",
        isRequired: true,
        placeholder: "e.g., How might we improve user onboarding?"
      },
      {
        question: "What constraints should we consider?",
        category: "preparation",
        isRequired: false,
        placeholder: "e.g., Budget limits, Technical constraints"
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true
    }
  },

  {
    name: "Quarterly Offsite",
    description: "Extended planning session for strategic alignment",
    category: "strategic",
    scope: "system",
    defaultDuration: 240,  // 4 hours
    suggestedCadence: "quarterly",
    defaultGoal: "Align on quarterly priorities and strengthen team cohesion",
    agendaItems: [
      {
        orderIndex: 0,
        title: "Quarter Retrospective",
        description: "Review wins, misses, and learnings",
        estimatedDuration: 45,
        isRequired: true
      },
      {
        orderIndex: 1,
        title: "Strategic Context",
        description: "Company direction and market context",
        estimatedDuration: 30,
        isRequired: true
      },
      {
        orderIndex: 2,
        title: "Break",
        estimatedDuration: 15,
        isRequired: true
      },
      {
        orderIndex: 3,
        title: "Quarterly Goals Workshop",
        description: "Define and prioritize Q objectives",
        estimatedDuration: 60,
        isRequired: true
      },
      {
        orderIndex: 4,
        title: "Resource Planning",
        description: "Allocation and dependencies",
        estimatedDuration: 45,
        isRequired: true
      },
      {
        orderIndex: 5,
        title: "Team Building",
        description: "Connection and celebration",
        estimatedDuration: 30,
        isRequired: false
      },
      {
        orderIndex: 6,
        title: "Commitments & Close",
        estimatedDuration: 15,
        isRequired: true
      }
    ],
    planningQuestions: [
      {
        question: "What are the 3 most important outcomes for next quarter?",
        category: "goal",
        isRequired: true
      },
      {
        question: "What strategic bets should we evaluate?",
        category: "goal",
        isRequired: false
      },
      {
        question: "What pre-work should attendees complete?",
        category: "preparation",
        isRequired: true
      }
    ],
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true
    }
  }
];
```

---

## 3. Database Schema Design

### 3.1 New Tables

```sql
-- Meeting Templates Table
CREATE TABLE meeting_template (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('sync', 'tactical', 'strategic', 'one_on_one', 'workshop', 'decision')),
  scope TEXT NOT NULL CHECK (scope IN ('system', 'team', 'personal')),

  -- Ownership (nullable based on scope)
  team_id TEXT REFERENCES team(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES "user"(id) ON DELETE CASCADE,

  -- Defaults
  default_duration INTEGER NOT NULL DEFAULT 60,
  suggested_cadence TEXT,
  default_goal TEXT,
  default_settings JSONB DEFAULT '{}',

  -- Metadata
  is_archived BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_team_scope CHECK (
    (scope = 'team' AND team_id IS NOT NULL) OR
    (scope != 'team' AND team_id IS NULL)
  ),
  CONSTRAINT valid_personal_scope CHECK (
    (scope = 'personal' AND created_by IS NOT NULL) OR
    (scope != 'personal')
  )
);

-- Template Agenda Items Table
CREATE TABLE template_agenda_item (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id TEXT NOT NULL REFERENCES meeting_template(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_duration INTEGER NOT NULL DEFAULT 10,
  is_required BOOLEAN NOT NULL DEFAULT false,
  presenter_role TEXT CHECK (presenter_role IN ('host', 'participant', 'anyone')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(template_id, order_index)
);

-- Template Planning Questions Table
CREATE TABLE template_planning_question (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id TEXT NOT NULL REFERENCES meeting_template(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('goal', 'attendees', 'preparation', 'outcome')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  placeholder TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(template_id, order_index)
);

-- Meeting-Template Relationship (track which template was used)
ALTER TABLE meeting ADD COLUMN template_id TEXT REFERENCES meeting_template(id);
ALTER TABLE meeting ADD COLUMN meeting_goal TEXT;
ALTER TABLE meeting ADD COLUMN planning_answers JSONB DEFAULT '{}';

-- Indexes
CREATE INDEX idx_template_scope ON meeting_template(scope);
CREATE INDEX idx_template_team ON meeting_template(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_template_creator ON meeting_template(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_template_category ON meeting_template(category);
CREATE INDEX idx_template_archived ON meeting_template(is_archived);
CREATE INDEX idx_meeting_template ON meeting(template_id) WHERE template_id IS NOT NULL;
```

### 3.2 Drizzle Schema Additions

```typescript
// lib/db/schema.ts additions

export const templateCategory = pgEnum('template_category', [
  'sync', 'tactical', 'strategic', 'one_on_one', 'workshop', 'decision'
]);

export const templateScope = pgEnum('template_scope', [
  'system', 'team', 'personal'
]);

export const questionCategory = pgEnum('question_category', [
  'goal', 'attendees', 'preparation', 'outcome'
]);

export const presenterRole = pgEnum('presenter_role', [
  'host', 'participant', 'anyone'
]);

export const meetingTemplate = pgTable('meeting_template', {
  id: text('id').primaryKey().$defaultFn(() => `tpl-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
  name: text('name').notNull(),
  description: text('description'),
  category: templateCategory('category').notNull(),
  scope: templateScope('scope').notNull(),
  teamId: text('team_id').references(() => team.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'cascade' }),
  defaultDuration: integer('default_duration').notNull().default(60),
  suggestedCadence: text('suggested_cadence'),
  defaultGoal: text('default_goal'),
  defaultSettings: jsonb('default_settings').$type<MeetingSettings>().default({}),
  isArchived: boolean('is_archived').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const templateAgendaItem = pgTable('template_agenda_item', {
  id: text('id').primaryKey().$defaultFn(() => `tai-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
  templateId: text('template_id').notNull().references(() => meetingTemplate.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  estimatedDuration: integer('estimated_duration').notNull().default(10),
  isRequired: boolean('is_required').notNull().default(false),
  presenterRole: presenterRole('presenter_role'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueOrder: unique().on(table.templateId, table.orderIndex),
}));

export const templatePlanningQuestion = pgTable('template_planning_question', {
  id: text('id').primaryKey().$defaultFn(() => `tpq-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
  templateId: text('template_id').notNull().references(() => meetingTemplate.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  category: questionCategory('category').notNull(),
  isRequired: boolean('is_required').notNull().default(false),
  placeholder: text('placeholder'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueOrder: unique().on(table.templateId, table.orderIndex),
}));

// Relations
export const meetingTemplateRelations = relations(meetingTemplate, ({ one, many }) => ({
  team: one(team, {
    fields: [meetingTemplate.teamId],
    references: [team.id],
  }),
  creator: one(user, {
    fields: [meetingTemplate.createdBy],
    references: [user.id],
  }),
  agendaItems: many(templateAgendaItem),
  planningQuestions: many(templatePlanningQuestion),
}));
```

---

## 4. API Design

### 4.1 Template API Endpoints

```typescript
// app/api/templates/route.ts
GET    /api/templates           // List templates (filtered by access)
POST   /api/templates           // Create personal/team template

// app/api/templates/[id]/route.ts
GET    /api/templates/:id       // Get single template with items
PUT    /api/templates/:id       // Update template
DELETE /api/templates/:id       // Archive/delete template

// app/api/templates/[id]/duplicate/route.ts
POST   /api/templates/:id/duplicate  // Duplicate and customize

// app/api/teams/[teamId]/templates/route.ts
GET    /api/teams/:teamId/templates  // List team templates
POST   /api/teams/:teamId/templates  // Create team template
```

### 4.2 Query Parameters

```typescript
// GET /api/templates
interface TemplateQueryParams {
  scope?: 'system' | 'team' | 'personal' | 'all';
  category?: TemplateCategory;
  teamId?: string;           // Filter by specific team
  includeArchived?: boolean;
  search?: string;           // Search name/description
  sortBy?: 'name' | 'usageCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}
```

### 4.3 Response Types

```typescript
// types/template.ts additions

export interface TemplateWithItems extends MeetingTemplate {
  agendaItems: TemplateAgendaItem[];
  planningQuestions: PlanningQuestion[];
  team?: {
    id: string;
    name: string;
  };
  creator?: {
    id: string;
    name: string;
    image?: string;
  };
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  category: TemplateCategory;
  scope: 'team' | 'personal';
  teamId?: string;  // Required if scope = 'team'
  defaultDuration: number;
  suggestedCadence?: string;
  defaultGoal?: string;
  defaultSettings?: MeetingSettings;
  agendaItems: Omit<TemplateAgendaItem, 'id' | 'templateId' | 'createdAt'>[];
  planningQuestions?: Omit<PlanningQuestion, 'id'>[];
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  defaultDuration?: number;
  suggestedCadence?: string;
  defaultGoal?: string;
  defaultSettings?: MeetingSettings;
  agendaItems?: Omit<TemplateAgendaItem, 'id' | 'templateId' | 'createdAt'>[];
  planningQuestions?: Omit<PlanningQuestion, 'id'>[];
  isArchived?: boolean;
}
```

---

## 5. UI/UX Design

### 5.1 Template Selection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Create Meeting                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Choose a template or start from scratch                            │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Blank     │ │   1-on-1    │ │  Standup    │ │  Weekly     │   │
│  │  Meeting    │ │             │ │             │ │  Tactical   │   │
│  │     +       │ │    👥       │ │    🔄       │ │    📊       │   │
│  │             │ │   30 min    │ │   15 min    │ │   60 min    │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Retro     │ │  Decision   │ │ Brainstorm  │ │  Monthly    │   │
│  │             │ │  Meeting    │ │             │ │  Strategic  │   │
│  │    🔁       │ │    ⚖️       │ │    💡       │ │    🎯       │   │
│  │   60 min    │ │   45 min    │ │   60 min    │ │   90 min    │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  ──────────────── Team Templates ────────────────                   │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐                                    │
│  │  Sprint     │ │  Design     │                                    │
│  │  Planning   │ │  Review     │                                    │
│  │    📋       │ │    🎨       │                                    │
│  │   90 min    │ │   45 min    │                                    │
│  └─────────────┘ └─────────────┘                                    │
│                                                                      │
│  [Browse All Templates]                    [+ Create Custom Template]│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Template Customization Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Weekly Tactical                                          [Use This] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  📋 Meeting Goal                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Review progress, align on priorities, and resolve tactical    │  │
│  │ issues                                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ⏱️ Duration: [60 min ▼]                                            │
│                                                                      │
│  ──────────────── Planning Questions ────────────────               │
│                                                                      │
│  What decisions must be made by the end of this meeting? *          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Finalize Q2 roadmap priorities                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  What pre-read materials should attendees review?                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Weekly metrics dashboard in Notion                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ──────────────── Agenda ────────────────                           │
│                                                                      │
│  ☰ Metrics Review                              10 min  [Required]   │
│  ☰ Progress Updates                            20 min  [Required]   │
│  ☰ Blockers & Escalations                      15 min  [Required]   │
│  ☰ Decisions & Action Items                    15 min  [Required]   │
│  ☰ + Add custom agenda item                                         │
│                                                                      │
│  ☐ Save customizations as new template                              │
│                                                                      │
│  [Cancel]                                           [Create Meeting] │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Component Structure

```
components/
├── templates/
│   ├── template-picker.tsx           # Grid of template cards
│   ├── template-card.tsx             # Single template preview
│   ├── template-customizer.tsx       # Customize before creating
│   ├── template-editor.tsx           # Full template edit (create/update)
│   ├── planning-questions-form.tsx   # Meeting effectiveness questions
│   ├── template-agenda-editor.tsx    # Edit template agenda items
│   └── template-browser-dialog.tsx   # Browse all templates modal
├── meetings/
│   ├── schedule-meeting-dialog.tsx   # Modified to include template selection
│   └── ...
```

### 5.4 Integration with Existing Flow

**Schedule Meeting Dialog Changes:**
1. Add template selection as first step
2. Pre-fill form fields from selected template
3. Show planning questions based on template
4. Allow customization before final creation
5. Option to save customizations as new template

**Pre-Join Screen Changes:**
1. Add "Apply Template" option for instant meetings
2. Quick-apply agenda from template
3. Show meeting goal prominently

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create database schema and migrations
- [ ] Implement Drizzle schema additions
- [ ] Create template types and interfaces
- [ ] Seed system templates
- [ ] Build template API endpoints (CRUD)

### Phase 2: Core UI (Week 3-4)
- [ ] Build TemplatePicker component
- [ ] Build TemplateCard component
- [ ] Build TemplateCustomizer component
- [ ] Build PlanningQuestionsForm component
- [ ] Integrate template selection into ScheduleMeetingDialog
- [ ] Store template_id and planning_answers on meetings

### Phase 3: Template Management (Week 5-6)
- [ ] Build TemplateEditor for creating custom templates
- [ ] Build TemplateBrowserDialog for browsing all templates
- [ ] Build TemplateAgendaEditor for agenda item management
- [ ] Add "Save as Template" flow from customization
- [ ] Implement template duplication

### Phase 4: Team Templates (Week 7)
- [ ] Add team template permissions (admin/owner can create)
- [ ] Show team templates in picker for team members
- [ ] Build team template management in team settings

### Phase 5: Instant Meeting Integration (Week 8)
- [ ] Add template selection to pre-join screen
- [ ] Quick-apply template agenda
- [ ] Show meeting goal in meeting room UI

### Phase 6: Analytics & Polish (Week 9)
- [ ] Track template usage (usageCount increment)
- [ ] Show popular templates
- [ ] Add template recommendations based on meeting patterns
- [ ] Performance optimization and testing

---

## 7. Meeting Effectiveness Questions

### 7.1 Core Questions by Category

**Goal Questions:**
- "What decision must be made by the end of this meeting?"
- "What specific outcome should exist after this meeting?"
- "What problem are we solving in this meeting?"

**Attendee Questions:**
- "Who actually needs to be in the room to make this decision?"
- "Who has the information we need?"
- "Who will be affected by the outcome?"

**Preparation Questions:**
- "What can be pre-read instead of presented during the meeting?"
- "What data or context should attendees have before arriving?"
- "What questions should attendees think about beforehand?"

**Outcome Questions:**
- "What decision, output, or change should exist after this meeting?"
- "How will we know if this meeting was successful?"
- "What are the expected follow-up actions?"

### 7.2 Question Selection Logic

```typescript
// Default questions if template doesn't specify custom ones
const DEFAULT_PLANNING_QUESTIONS: PlanningQuestion[] = [
  {
    question: "What's the primary goal of this meeting?",
    category: "goal",
    isRequired: true,
  },
  {
    question: "What decision or outcome should result from this meeting?",
    category: "outcome",
    isRequired: false,
  },
];

// For decision meetings, always include
const DECISION_MEETING_QUESTIONS: PlanningQuestion[] = [
  {
    question: "What specific decision must be made?",
    category: "goal",
    isRequired: true,
  },
  {
    question: "Who has the authority to make this decision?",
    category: "attendees",
    isRequired: true,
  },
  {
    question: "What will be different after this decision is made?",
    category: "outcome",
    isRequired: true,
  },
];
```

---

## 8. Success Metrics

### 8.1 Adoption Metrics
- % of meetings created using templates (target: >60%)
- Template usage distribution by type
- Custom template creation rate

### 8.2 Meeting Quality Metrics
- Average agenda completion rate (tracked by agent)
- Meeting duration vs. planned duration
- Action items generated per meeting
- Planning question completion rate

### 8.3 User Satisfaction
- Time to create meeting (should decrease)
- Template customization rate (healthy = 30-50%)
- Team template adoption rate

---

## 9. Future Enhancements

### 9.1 Smart Template Suggestions
- Suggest templates based on invitees (1-on-1 for 2 people)
- Suggest based on meeting title keywords
- Learn from user's meeting patterns

### 9.2 Template Marketplace
- Share templates publicly
- Import templates from other teams
- Rate and review templates

### 9.3 AI-Powered Templates
- Generate custom templates from description
- Auto-suggest agenda based on meeting goal
- Post-meeting template refinement suggestions

### 9.4 Calendar Integration
- Recurring meeting template sync
- Auto-apply templates to recurring meetings
- Template-aware calendar blocking

---

## 10. Technical Considerations

### 10.1 Performance
- Cache system templates (static, no DB query needed)
- Lazy-load team/personal templates
- Index template queries by scope and team

### 10.2 Permissions
- System templates: Read-only for all users
- Team templates: Read for members, Write for admin/owner
- Personal templates: Full access for creator only

### 10.3 Migration Strategy
- Add template columns to meeting table with nullable constraint
- Backfill existing meetings with template_id = null
- System templates seeded on first deployment

### 10.4 Backwards Compatibility
- All template fields are optional on meeting creation
- Existing flows continue to work without templates
- Templates enhance but don't require UI changes

---

## Appendix A: Template Icons

| Template | Icon | Color |
|----------|------|-------|
| Daily Standup | 🔄 / RefreshCw | Blue |
| Weekly Tactical | 📊 / BarChart3 | Green |
| 1-on-1 | 👥 / Users | Purple |
| Monthly Strategic | 🎯 / Target | Orange |
| Retrospective | 🔁 / RotateCcw | Teal |
| Decision Meeting | ⚖️ / Scale | Red |
| Brainstorm | 💡 / Lightbulb | Yellow |
| Quarterly Offsite | 🗓️ / Calendar | Indigo |

---

## Appendix B: Database Migration Files

```typescript
// drizzle/migrations/XXXX_add_meeting_templates.ts

import { sql } from 'drizzle-orm';

export async function up(db) {
  // Create enums
  await db.execute(sql`
    CREATE TYPE template_category AS ENUM ('sync', 'tactical', 'strategic', 'one_on_one', 'workshop', 'decision');
    CREATE TYPE template_scope AS ENUM ('system', 'team', 'personal');
    CREATE TYPE question_category AS ENUM ('goal', 'attendees', 'preparation', 'outcome');
    CREATE TYPE presenter_role AS ENUM ('host', 'participant', 'anyone');
  `);

  // Create tables
  await db.execute(sql`
    CREATE TABLE meeting_template (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category template_category NOT NULL,
      scope template_scope NOT NULL,
      team_id TEXT REFERENCES team(id) ON DELETE CASCADE,
      created_by TEXT REFERENCES "user"(id) ON DELETE CASCADE,
      default_duration INTEGER NOT NULL DEFAULT 60,
      suggested_cadence TEXT,
      default_goal TEXT,
      default_settings JSONB DEFAULT '{}',
      is_archived BOOLEAN NOT NULL DEFAULT false,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE TABLE template_agenda_item (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES meeting_template(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      estimated_duration INTEGER NOT NULL DEFAULT 10,
      is_required BOOLEAN NOT NULL DEFAULT false,
      presenter_role presenter_role,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, order_index)
    );

    CREATE TABLE template_planning_question (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES meeting_template(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      category question_category NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT false,
      placeholder TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, order_index)
    );

    -- Add template reference to meetings
    ALTER TABLE meeting ADD COLUMN template_id TEXT REFERENCES meeting_template(id);
    ALTER TABLE meeting ADD COLUMN meeting_goal TEXT;
    ALTER TABLE meeting ADD COLUMN planning_answers JSONB DEFAULT '{}';

    -- Create indexes
    CREATE INDEX idx_template_scope ON meeting_template(scope);
    CREATE INDEX idx_template_team ON meeting_template(team_id) WHERE team_id IS NOT NULL;
    CREATE INDEX idx_template_creator ON meeting_template(created_by) WHERE created_by IS NOT NULL;
    CREATE INDEX idx_template_category ON meeting_template(category);
    CREATE INDEX idx_meeting_template ON meeting(template_id) WHERE template_id IS NOT NULL;
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE meeting DROP COLUMN IF EXISTS template_id;
    ALTER TABLE meeting DROP COLUMN IF EXISTS meeting_goal;
    ALTER TABLE meeting DROP COLUMN IF EXISTS planning_answers;
    DROP TABLE IF EXISTS template_planning_question;
    DROP TABLE IF EXISTS template_agenda_item;
    DROP TABLE IF EXISTS meeting_template;
    DROP TYPE IF EXISTS presenter_role;
    DROP TYPE IF EXISTS question_category;
    DROP TYPE IF EXISTS template_scope;
    DROP TYPE IF EXISTS template_category;
  `);
}
```

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: Claude Code Assistant*
