# Real-Time Actions Implementation Plan

## Executive Summary

Transform detected meeting insights/actions into executable real-world actions (starting with Gmail integration for follow-up emails). The AI agent identifies actionable items during meetings, classifies their action type, and when email-related, generates draft emails that users can accept, edit, or reject in real-time.

---

## 1. Problem Analysis

### Current State
- Agent extracts `action_item` insights from conversation (speaker assigned, content captured)
- Action items are displayed in UI but remain **passive** - users must manually act on them
- No integration bridge between detected actions and execution tools

### Desired State
- Action items automatically classified by **execution type** (email, task, calendar, etc.)
- Email-type actions trigger AI-generated draft emails
- Users interact with drafts in real-time or post-meeting
- Seamless Gmail integration with proper OAuth

---

## 2. Architecture Overview

### Data Flow
```
Transcript → Agent (Action Detection + Classification) → LiveKit Stream
     ↓
Frontend (Action Context + Email Draft UI)
     ↓
User Decision (Accept/Edit/Reject)
     ↓
Gmail API (Send Email)
```

### Component Layers

| Layer | Components |
|-------|------------|
| **Agent** | ActionClassifier, EmailDraftGenerator |
| **Transport** | LiveKit topics: `hedwiq.action`, `hedwiq.email_draft` |
| **Frontend Context** | ActionsContext, EmailDraftsContext |
| **UI** | ActionCard, EmailDraftPanel, EmailComposer |
| **API** | Gmail OAuth routes, email send routes |
| **Database** | action_items, email_drafts, gmail_integration tables |

---

## 3. Detailed Implementation

### Phase 1: Action Classification System

#### 3.1.1 Agent-Side Changes

**New File: `action_classifier.py`**

Responsibilities:
- Receive action_item insights from InsightAnalyzer
- Classify action into execution types using LLM
- Extract structured metadata (recipient, subject hints, urgency)

**Action Types Taxonomy:**
| Type | Trigger Patterns | Metadata |
|------|-----------------|----------|
| `email_followup` | "send email", "follow up with", "email X about" | recipient_hint, subject_hint |
| `email_share` | "share with", "send to", "forward to" | recipient_hint, content_type |
| `email_schedule` | "schedule meeting with", "set up call" | recipient_hint, meeting_type |
| `task_create` | "create task", "add to backlog" | project_hint, assignee |
| `calendar_event` | "block time", "schedule", "remind me" | datetime_hint, duration |
| `manual` | Default fallback | none |

**Classification Prompt Strategy:**
- Input: action_item content + surrounding transcript context (5 turns)
- Output: structured JSON with type, confidence, extracted metadata
- Confidence threshold: 0.7 for auto-classification

**Publishing:**
- New topic: `hedwiq.action` (enhanced action_item with classification)
- Attributes include action_type, requires_email flag

#### 3.1.2 Frontend Changes

**New Context: `ActionsContext`**

State:
- `actions[]` - All classified actions
- `emailActions[]` - Filtered email-type actions
- `pendingDrafts[]` - Actions awaiting draft generation

Subscribe to `hedwiq.action` topic, parse classification metadata.

**New Type: `ClassifiedAction`**
```
- id, content, speaker, timestamp (from Insight)
- actionType: 'email_followup' | 'email_share' | ...
- metadata: { recipientHint?, subjectHint?, urgency? }
- status: 'detected' | 'drafting' | 'draft_ready' | 'sent' | 'rejected'
```

### Phase 2: Gmail OAuth Integration

#### 3.2.1 OAuth Flow (Mirror Calendar Pattern)

**Required Gmail Scopes:**
- `gmail.send` - Send emails on behalf of user
- `userinfo.email` - Get user's email address

**Note:** We intentionally avoid `gmail.compose` (restricted scope) by storing drafts locally in our database rather than syncing to Gmail Drafts folder.

**New Files:**
- `lib/gmail-oauth.ts` - OAuth URL builder, token exchange (copy pattern from google-oauth.ts)
- `lib/db/gmail.ts` - CRUD for gmail_integration table
- `types/gmail.ts` - Type definitions

**API Routes:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/gmail/connect` | GET | Start OAuth flow |
| `/api/gmail/callback` | GET | Handle OAuth callback |
| `/api/gmail/status` | GET | Check connection status |
| `/api/gmail/disconnect` | POST | Revoke integration |
| `/api/gmail/send` | POST | Send email via Gmail API |

**Database Table: `gmail_integration`**
- id, user_id, access_token (encrypted), refresh_token (encrypted)
- token_expires_at, gmail_email, status, error_message
- created_at, updated_at

**Security Considerations:**
- Tokens encrypted at rest
- Refresh token rotation on each use
- Rate limiting on send endpoint
- User confirmation required before sending

#### 3.2.2 Token Management

**Token Refresh Strategy:**
- Check expiry before each API call
- Proactive refresh if expiring within 5 minutes
- Background job for batch refresh (optional, Phase 3)

### Phase 3: Email Draft Generation

#### 3.3.1 Agent-Side Draft Generation

**New File: `email_draft_generator.py`**

Responsibilities:
- Receive email-type actions from ActionClassifier
- Build context from meeting transcript + action metadata
- Generate professional email draft using LLM
- Publish draft to frontend

**Draft Generation Input:**
- Action content and metadata
- Meeting context (title, participants, agenda topics)
- Last N transcript turns for context
- Sender's name (from participant info)

**Draft Structure:**
| Field | Source |
|-------|--------|
| suggested_to | Extracted from action or participant list |
| suggested_subject | LLM-generated from context |
| body | LLM-generated, professional tone |
| meeting_reference | Auto-included meeting link |

**Prompt Engineering Considerations:**
- Professional but personable tone
- Clear call-to-action
- Reference specific meeting discussion points
- Keep concise (3-5 sentences typically)

**Publishing:**
- Topic: `hedwiq.email_draft`
- Includes action_id reference for linking

#### 3.3.2 Frontend Draft Handling

**New Context: `EmailDraftsContext`**

State:
- `drafts[]` - All received drafts
- `activeDraft` - Currently editing draft
- `sendingStatus` - API call state

Functions:
- `updateDraft(id, changes)` - Edit draft locally
- `sendDraft(id)` - Submit to Gmail API
- `rejectDraft(id)` - Dismiss draft
- `saveDraft(id)` - Persist draft to local database (auto-saved on edit)

### Phase 4: Real-Time UI Components

#### 3.4.1 Action Card Enhancement

**Enhanced `InsightCard` for action_items:**
- Show action type badge (email icon for email types)
- "Generate Email" button for email-type actions
- Status indicator (detected → drafting → ready)

**New Component: `ActionableInsightCard`**
- Extends InsightCard with action capabilities
- Quick action buttons based on type
- Expandable for showing generated draft inline

#### 3.4.2 Email Draft Panel

**New Component: `EmailDraftPanel`**

Location: Sidebar tab (next to Notes, Insights)

Features:
- List of pending email drafts
- Inline editing (to, subject, body)
- Recipient autocomplete from meeting participants
- Send / Reject buttons (drafts auto-saved locally)
- Character count, attachment hint

**Draft Card Component:**
- Collapsed: Shows subject, recipient, first line
- Expanded: Full editor mode
- Visual status (draft, sending, sent, failed)

#### 3.4.3 Post-Meeting Review

**Enhancement to Meeting History View:**

New tab: "Actions & Follow-ups"
- List all classified actions from meeting
- Email drafts with status (sent, pending, rejected)
- Ability to generate/send emails post-meeting
- Action completion tracking

### Phase 5: Database Schema

#### 3.5.1 New Tables

**Table: `gmail_integration`**
- Mirrors calendar_integration structure
- Stores encrypted OAuth tokens
- Tracks connection status

**Table: `action_item`**
- id, meeting_id, content, speaker_id
- action_type, metadata (JSONB)
- status, created_at

**Table: `email_draft`**
- id, action_item_id, meeting_id, user_id
- to_address, subject, body
- status (draft, sent, rejected)
- gmail_message_id (after sending)
- sent_at, created_at, updated_at

**Table: `email_sent`** (audit log)
- id, draft_id, meeting_id, user_id
- to_address, subject
- sent_at, gmail_message_id

#### 3.5.2 Migrations

Create incremental migration files:
1. `XXXX_add_gmail_integration.sql`
2. `XXXX_add_action_items.sql`
3. `XXXX_add_email_drafts.sql`

---

## 4. Risk Analysis & Mitigations

### 4.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Gmail API rate limits | Medium | Medium | Implement queue with exponential backoff; batch operations |
| LLM hallucination in drafts | High | Medium | Require user review before send; never auto-send |
| OAuth token expiry during meeting | Medium | Low | Proactive refresh; graceful degradation |
| Classification accuracy | Medium | Medium | Confidence thresholds; manual override option |
| Draft generation latency | Low | Medium | Async generation; loading states; queue management |

### 4.2 User Experience Risks

| Risk | Mitigation |
|------|------------|
| Notification overload | Batch similar actions; collapsible UI; priority filtering |
| Accidental email sends | Two-step confirmation; undo within 5 seconds |
| Draft quality variance | Editable drafts; regenerate option; template improvements |
| Privacy concerns | Clear data handling; local storage option; delete capability |

### 4.3 Security Risks

| Risk | Mitigation |
|------|------------|
| Token exposure | Server-side only; encrypted storage; no client tokens |
| Unauthorized sends | Session validation; rate limiting; audit logging |
| Email content injection | Input sanitization; LLM output filtering |
| Cross-user data access | Strict user_id checks; RLS policies |

### 4.4 Integration Risks

| Risk | Mitigation |
|------|------------|
| Google OAuth consent screen delays | Submit for verification early; use unverified for testing |
| Gmail API changes | Abstract API calls; version pinning |
| LiveKit message ordering | Timestamp-based ordering; idempotent processing |

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Action classification working end-to-end

- [ ] Agent: Create ActionClassifier with LLM classification
- [ ] Agent: New topic `hedwiq.action` publishing
- [ ] Frontend: ActionsContext with topic subscription
- [ ] Frontend: Enhanced action_item display with type badges
- [ ] Database: action_item table migration

**Deliverable:** Actions classified and displayed by type in UI

### Phase 2: Gmail OAuth (Week 2-3) - COMPLETE
**Goal:** Gmail connected and tokens managed

- [x] Copy calendar OAuth pattern for Gmail (`lib/gmail-oauth.ts`)
- [x] Database: gmail_integration table (`lib/db/schema.ts`, `0013_add_gmail_integration.sql`)
- [x] API routes: connect, callback, status, disconnect (`app/api/gmail/`)
- [x] Frontend: Gmail connection UI (`components/gmail/gmail-status-card.tsx`)
- [x] Token refresh mechanism (`lib/db/gmail.ts` - `getValidGmailToken`)

**Deliverable:** Users can connect/disconnect Gmail account

### Phase 3: Email Draft Generation (Week 3-4)
**Goal:** AI-generated email drafts from actions

- [ ] Agent: EmailDraftGenerator component
- [ ] Agent: New topic `hedwiq.email_draft`
- [ ] Frontend: EmailDraftsContext
- [ ] Frontend: Draft editing UI (inline or panel)
- [ ] Database: email_draft table

**Deliverable:** Email drafts generated and editable in real-time

### Phase 4: Send Integration (Week 4-5)
**Goal:** Actually send emails via Gmail API

- [ ] API: /api/gmail/send endpoint
- [ ] Gmail API integration (googleapis client)
- [ ] Send confirmation flow
- [ ] Success/failure handling
- [ ] Database: email_sent audit table

**Deliverable:** Users can send AI-drafted emails

### Phase 5: Polish & Post-Meeting (Week 5-6)
**Goal:** Complete user experience

- [ ] Post-meeting review tab for actions
- [ ] Unsent drafts management
- [ ] Email templates/regeneration
- [ ] Notification preferences
- [ ] Analytics/tracking

**Deliverable:** Production-ready feature

---

## 6. API Specifications

### 6.1 Gmail Send Endpoint

**POST /api/gmail/send**

Request:
- draftId (required) - Reference to email_draft
- override: { to?, subject?, body? } - Optional overrides

Response:
- success: boolean
- messageId: string (Gmail message ID)
- error?: string

Validations:
- User authenticated
- Gmail connected
- Draft belongs to user
- Rate limit not exceeded

### 6.2 LiveKit Message Formats

**hedwiq.action topic:**
```
{
  id, type, content, speaker, timestamp,
  actionType: "email_followup" | ...,
  metadata: { recipientHint?, subjectHint? },
  confidence: number
}
```

**hedwiq.email_draft topic:**
```
{
  id, actionId,
  suggestedTo: string[],
  subject: string,
  body: string,
  meetingContext: { title, date, participants },
  generatedAt: timestamp
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests
- Action classification prompt testing (mock LLM)
- OAuth state generation/parsing
- Draft context building

### 7.2 Integration Tests
- Full OAuth flow (with test credentials)
- LiveKit topic publishing/subscribing
- Database CRUD operations

### 7.3 E2E Tests
- Connect Gmail → Generate draft → Edit → Send flow
- Post-meeting draft review
- Error handling (expired tokens, API failures)

### 7.4 Manual Testing Scenarios
- Various action types classification accuracy
- Draft quality for different meeting types
- Mobile responsiveness of draft editor
- Slow network handling

---

## 8. Success Metrics

### 8.1 Adoption Metrics
- Gmail connection rate (users who connect / total users)
- Draft generation rate (drafts generated / email actions detected)
- Send rate (emails sent / drafts generated)

### 8.2 Quality Metrics
- Edit rate (drafts edited before send)
- Regeneration rate (drafts regenerated)
- Rejection rate (drafts dismissed)

### 8.3 Performance Metrics
- Classification latency (action detected → type assigned)
- Draft generation latency (action → draft ready)
- Send latency (user clicks send → email delivered)

---

## 9. Future Extensions

### 9.1 Near-Term (Post-MVP)
- **Multiple recipients** - Parse and suggest multiple recipients
- **CC/BCC support** - Full email composition
- **Attachments** - Attach meeting documents to emails
- **Email templates** - User-defined templates per action type
- **Scheduling sends** - "Send tomorrow morning"
- **Gmail Drafts sync** - Sync drafts to Gmail (requires `gmail.compose` restricted scope approval)

### 9.2 Medium-Term
- **Other email providers** - Outlook, custom SMTP
- **CRM integrations** - Salesforce, HubSpot action creation
- **Project management** - Jira, Asana task creation
- **Slack/Teams** - Post-meeting summary messages

### 9.3 Long-Term
- **Smart suggestions** - Proactive "You should follow up with X"
- **Action chains** - "After sending email, create calendar event"
- **Learning from edits** - Improve drafts based on user edits
- **Org-wide templates** - Company email style guidelines

---

## 10. Dependencies & Prerequisites

### 10.1 External Services
- Google Cloud Console project (Gmail API enabled)
- OAuth consent screen configured
- Gmail API quotas (default: 1B units/day)

### 10.2 Environment Variables (New)
```
GMAIL_CLIENT_ID          # Can reuse GOOGLE_CLIENT_ID if same project
GMAIL_CLIENT_SECRET      # Can reuse GOOGLE_CLIENT_SECRET if same project
```

### 10.3 NPM Packages (New)
- `googleapis` - Gmail API client (if not using raw fetch)
- Consider encryption library for token storage

### 10.4 Internal Dependencies
- Existing OAuth pattern (calendar) as template
- InsightAnalyzer output (action_items)
- LiveKit text stream infrastructure
- Meeting context (title, participants, agenda)

---

## 11. Open Questions

1. **Same Google project for Calendar + Gmail?**
   - Recommendation: Yes, simplifies OAuth (one consent screen)
   - Risk: Broader scope request at once

2. **Auto-send option ever?**
   - Recommendation: No, always require user confirmation
   - Could revisit with enterprise admin controls

3. **Draft storage: Local vs Server?**
   - **Decision:** Server database (`email_draft` table) - syncs across devices, survives browser close
   - Note: Gmail Drafts sync not available (requires restricted `gmail.compose` scope)

4. **Multiple email accounts?**
   - MVP: Single Gmail per user
   - Future: Account selector in compose

5. **Rate limiting strategy?**
   - Per-user: 50 sends/hour
   - Per-meeting: 20 sends/meeting
   - Adjust based on usage patterns

---

## 12. Glossary

| Term | Definition |
|------|------------|
| Action Item | Insight type representing a task assigned during meeting |
| Classified Action | Action item with execution type and metadata |
| Email Draft | AI-generated email ready for user review |
| Action Type | Category of execution (email, task, calendar, manual) |
| Recipient Hint | Partial information about intended email recipient |

---

## Document Metadata

- **Author:** AI-assisted planning
- **Created:** 2024-12-16
- **Updated:** 2024-12-17
- **Status:** Draft (Phase 1 & 2 Complete)
- **Related Docs:** PHASE2_INSIGHTS_PLAN.md, MEETING_SCHEDULING_CALENDAR_PLAN.md
- **Scope Change:** Removed `gmail.compose` scope - drafts stored locally only
