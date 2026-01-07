/**
 * System Templates for Luframe
 *
 * These are built-in meeting templates available to all users.
 * System templates are read-only and cannot be modified or deleted.
 *
 * Categories:
 * - sync: Daily standups, check-ins
 * - tactical: Weekly tactical, team meetings
 * - strategic: Monthly/quarterly planning
 * - one_on_one: 1-on-1 meetings
 * - workshop: Brainstorms, retrospectives
 * - decision: Decision-focused meetings
 */

import type {
  TemplateCategory,
  TemplateAgendaItemInput,
  PlanningQuestionInput,
} from "@/types/template";
import type { MeetingSettings } from "@/types/meeting";

// ============================================================================
// Types
// ============================================================================

/**
 * System template definition used for seeding.
 */
export interface SystemTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  defaultDuration: number;
  suggestedCadence: string;
  defaultGoal: string;
  defaultSettings: MeetingSettings;
  agendaItems: TemplateAgendaItemInput[];
  planningQuestions: PlanningQuestionInput[];
}

// ============================================================================
// System Template Definitions
// ============================================================================

export const SYSTEM_TEMPLATES: SystemTemplateDefinition[] = [
  // -------------------------------------------------------------------------
  // Daily Standup (Sync)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-daily-standup",
    name: "Daily Standup",
    description:
      "Quick daily sync for teams to share progress, plans, and blockers. Keep it short and focused.",
    category: "sync",
    defaultDuration: 15,
    suggestedCadence: "daily",
    defaultGoal: "Share daily updates and identify blockers",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: false,
    },
    agendaItems: [
      {
        title: "What did you accomplish yesterday?",
        description: "Share completed tasks and progress made",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "What will you work on today?",
        description: "Share planned tasks and priorities for the day",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Any blockers or concerns?",
        description: "Raise issues that need help or attention",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "anyone",
      },
    ],
    planningQuestions: [
      {
        question: "Are there any team members who should present first?",
        category: "attendees",
        isRequired: false,
        placeholder: "e.g., Team members with time constraints",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Weekly Team Tactical (Tactical)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-weekly-tactical",
    name: "Weekly Team Tactical",
    description:
      "Structured weekly meeting to review metrics, discuss priorities, and align on upcoming work.",
    category: "tactical",
    defaultDuration: 60,
    suggestedCadence: "weekly",
    defaultGoal: "Review progress and align on weekly priorities",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Lightning Round",
        description: "Quick updates from each team member (30 seconds each)",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Metrics Review",
        description: "Review key metrics and KPIs",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Priority Updates",
        description: "Status on current priorities and any changes needed",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Blockers & Escalations",
        description: "Address blockers and items needing escalation",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Upcoming Week Planning",
        description: "Align on priorities and commitments for the week ahead",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Action Items & Wrap-up",
        description: "Summarize decisions and assign action items",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What is the single most important topic to address this week?",
        category: "goal",
        isRequired: true,
        placeholder: "e.g., Q4 deadline, new feature launch",
      },
      {
        question: "Are there any metrics or data to review before the meeting?",
        category: "preparation",
        isRequired: false,
        placeholder: "Links to dashboards or reports",
      },
      {
        question: "What key decisions need to be made?",
        category: "outcome",
        isRequired: false,
        placeholder: "List decisions needed by end of meeting",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Monthly Planning (Strategic)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-monthly-planning",
    name: "Monthly Planning",
    description:
      "Strategic session for reviewing the month and planning ahead. Focus on goals, wins, and learning.",
    category: "strategic",
    defaultDuration: 90,
    suggestedCadence: "monthly",
    defaultGoal: "Review monthly progress and set next month priorities",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Month in Review",
        description: "Summary of what was accomplished this month",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Wins & Celebrations",
        description: "Recognize achievements and successes",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Challenges & Learnings",
        description: "Discuss what didn't go well and lessons learned",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Goals Review",
        description: "Review progress against quarterly/annual goals",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Next Month Priorities",
        description: "Define key priorities and objectives for the coming month",
        estimatedDuration: 20,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Resource & Support Needs",
        description: "Identify what the team needs to succeed",
        estimatedDuration: 10,
        isRequired: false,
        presenterRole: "anyone",
      },
      {
        title: "Action Items & Commitments",
        description: "Summarize commitments and next steps",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What were the key objectives for this month?",
        category: "preparation",
        isRequired: true,
        placeholder: "List the main goals that were set",
      },
      {
        question: "What data/metrics should be reviewed before the meeting?",
        category: "preparation",
        isRequired: false,
        placeholder: "Links to reports, dashboards, or documents",
      },
      {
        question: "What strategic decisions need to be made?",
        category: "outcome",
        isRequired: false,
        placeholder: "List key decisions needed",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 1-on-1 Meeting (One-on-One)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-one-on-one",
    name: "1-on-1 Meeting",
    description:
      "Dedicated time for manager-direct report conversations. Focus on growth, feedback, and support.",
    category: "one_on_one",
    defaultDuration: 30,
    suggestedCadence: "weekly",
    defaultGoal: "Connect, provide support, and discuss growth",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: false,
    },
    agendaItems: [
      {
        title: "Check-in",
        description: "How are you doing? Personal and professional well-being",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "participant",
      },
      {
        title: "Updates & Progress",
        description: "Share updates on current work and projects",
        estimatedDuration: 8,
        isRequired: true,
        presenterRole: "participant",
      },
      {
        title: "Challenges & Support Needed",
        description: "Discuss blockers and areas where you need help",
        estimatedDuration: 7,
        isRequired: true,
        presenterRole: "participant",
      },
      {
        title: "Feedback",
        description: "Give and receive feedback",
        estimatedDuration: 5,
        isRequired: false,
        presenterRole: "anyone",
      },
      {
        title: "Growth & Development",
        description: "Career goals, learning opportunities, skill development",
        estimatedDuration: 5,
        isRequired: false,
        presenterRole: "anyone",
      },
    ],
    planningQuestions: [
      {
        question: "What would you most like to discuss today?",
        category: "goal",
        isRequired: true,
        placeholder: "Top 1-2 topics you want to cover",
      },
      {
        question: "Is there any feedback you want to share or receive?",
        category: "preparation",
        isRequired: false,
        placeholder: "Topics for feedback discussion",
      },
      {
        question: "Any wins or accomplishments to celebrate?",
        category: "preparation",
        isRequired: false,
        placeholder: "Recent achievements to recognize",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Retrospective (Workshop)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-retrospective",
    name: "Retrospective",
    description:
      "Structured reflection session to improve team processes. What went well, what didn't, and what to change.",
    category: "workshop",
    defaultDuration: 60,
    suggestedCadence: "sprint-end",
    defaultGoal: "Reflect on recent work and identify improvements",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Set the Stage",
        description: "Welcome, ground rules, and prime directive",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "What Went Well",
        description: "Celebrate successes and positive experiences",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "What Didn't Go Well",
        description: "Discuss challenges, problems, and frustrations",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Ideas & Improvements",
        description: "Brainstorm ideas for improvement",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Action Items",
        description: "Select and assign improvement actions",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What time period or project are we reflecting on?",
        category: "goal",
        isRequired: true,
        placeholder: "e.g., Sprint 5, Q3, Project Alpha launch",
      },
      {
        question: "Are there specific topics or incidents to discuss?",
        category: "preparation",
        isRequired: false,
        placeholder: "Any particular events that should be addressed",
      },
      {
        question: "How many improvement actions do we want to commit to?",
        category: "outcome",
        isRequired: false,
        placeholder: "e.g., 2-3 actionable improvements",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Decision Meeting (Decision)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-decision-meeting",
    name: "Decision Meeting",
    description:
      "Focused meeting for making a specific decision. Structured to ensure thorough discussion and clear outcomes.",
    category: "decision",
    defaultDuration: 45,
    suggestedCadence: "as-needed",
    defaultGoal: "Make a well-informed decision",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Decision Context",
        description: "Background and why this decision needs to be made now",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Options Presentation",
        description: "Present the available options with pros/cons",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Discussion & Questions",
        description: "Open discussion, clarifying questions, concerns",
        estimatedDuration: 15,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Decision",
        description: "Make and document the decision",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Next Steps",
        description: "Define action items and owners for implementing the decision",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What specific decision needs to be made?",
        category: "goal",
        isRequired: true,
        placeholder: "Clear statement of the decision",
      },
      {
        question: "Who has decision-making authority?",
        category: "attendees",
        isRequired: true,
        placeholder: "Who will make the final call",
      },
      {
        question: "What information should attendees review beforehand?",
        category: "preparation",
        isRequired: false,
        placeholder: "Links to documents, data, or analysis",
      },
      {
        question: "What criteria will guide this decision?",
        category: "preparation",
        isRequired: false,
        placeholder: "e.g., cost, timeline, quality, risk",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Brainstorming Session (Workshop)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-brainstorm",
    name: "Brainstorming Session",
    description:
      "Creative ideation session for generating new ideas. Focus on quantity over quality initially.",
    category: "workshop",
    defaultDuration: 45,
    suggestedCadence: "as-needed",
    defaultGoal: "Generate creative ideas and solutions",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Problem Definition",
        description: "Clearly define the problem or opportunity we're addressing",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Ground Rules",
        description: "Set brainstorming rules: no criticism, build on ideas, quantity over quality",
        estimatedDuration: 3,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Ideation Round 1",
        description: "Free-form idea generation",
        estimatedDuration: 12,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Ideation Round 2",
        description: "Build on and combine previous ideas",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Clustering & Themes",
        description: "Group similar ideas and identify themes",
        estimatedDuration: 8,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Selection & Next Steps",
        description: "Vote on top ideas and determine follow-up actions",
        estimatedDuration: 7,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What problem or opportunity are we brainstorming about?",
        category: "goal",
        isRequired: true,
        placeholder: "Clear problem statement",
      },
      {
        question: "Are there any constraints we need to work within?",
        category: "preparation",
        isRequired: false,
        placeholder: "e.g., budget, timeline, technical limitations",
      },
      {
        question: "How will we select the best ideas?",
        category: "outcome",
        isRequired: false,
        placeholder: "e.g., voting, criteria-based evaluation",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Project Kickoff (Tactical)
  // -------------------------------------------------------------------------
  {
    id: "tpl-system-project-kickoff",
    name: "Project Kickoff",
    description:
      "Launch meeting for new projects. Align on goals, scope, roles, and success criteria.",
    category: "tactical",
    defaultDuration: 60,
    suggestedCadence: "as-needed",
    defaultGoal: "Align team on project goals, scope, and responsibilities",
    defaultSettings: {
      transcriptionEnabled: true,
      insightsEnabled: true,
      recordingEnabled: true,
    },
    agendaItems: [
      {
        title: "Project Overview",
        description: "What is the project and why are we doing it?",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Goals & Success Criteria",
        description: "Define what success looks like",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Scope & Deliverables",
        description: "What's in scope, what's out, and key deliverables",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Roles & Responsibilities",
        description: "Who is responsible for what",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Timeline & Milestones",
        description: "Key dates and checkpoints",
        estimatedDuration: 10,
        isRequired: true,
        presenterRole: "host",
      },
      {
        title: "Questions & Concerns",
        description: "Address any questions or concerns from the team",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "anyone",
      },
      {
        title: "Next Steps",
        description: "Immediate action items and first steps",
        estimatedDuration: 5,
        isRequired: true,
        presenterRole: "host",
      },
    ],
    planningQuestions: [
      {
        question: "What is the project name and brief description?",
        category: "goal",
        isRequired: true,
        placeholder: "Project name and 1-2 sentence summary",
      },
      {
        question: "What is the expected timeline?",
        category: "preparation",
        isRequired: true,
        placeholder: "e.g., 6 weeks, by end of Q4",
      },
      {
        question: "Who are the key stakeholders?",
        category: "attendees",
        isRequired: true,
        placeholder: "List key people involved or affected",
      },
      {
        question: "Is there a project brief or documentation to share?",
        category: "preparation",
        isRequired: false,
        placeholder: "Links to project documentation",
      },
    ],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a system template by ID.
 */
export function getSystemTemplateById(
  id: string
): SystemTemplateDefinition | undefined {
  return SYSTEM_TEMPLATES.find((template) => template.id === id);
}

/**
 * Get all system templates by category.
 */
export function getSystemTemplatesByCategory(
  category: TemplateCategory
): SystemTemplateDefinition[] {
  return SYSTEM_TEMPLATES.filter((template) => template.category === category);
}

/**
 * Get all system template IDs.
 */
export function getSystemTemplateIds(): string[] {
  return SYSTEM_TEMPLATES.map((template) => template.id);
}

/**
 * Check if a template ID is a system template.
 */
export function isSystemTemplate(templateId: string): boolean {
  return templateId.startsWith("tpl-system-");
}
