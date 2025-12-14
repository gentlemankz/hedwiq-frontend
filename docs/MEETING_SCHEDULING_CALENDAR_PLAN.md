# Meeting Scheduling & Google Calendar Integration Plan

## Executive Summary

This document outlines the comprehensive implementation plan for adding meeting scheduling capabilities and Google Calendar integration to Hedwiq. The feature enables users to create scheduled meetings (in addition to instant meetings), connect their Google Calendar, and sync meeting events bidirectionally.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [User Flow](#3-user-flow)
4. [Technical Architecture](#4-technical-architecture)
5. [Database Design](#5-database-design)
6. [Google Calendar Integration](#6-google-calendar-integration)
7. [Frontend Implementation](#7-frontend-implementation)
8. [API Design](#8-api-design)
9. [Edge Cases & Error Handling](#9-edge-cases--error-handling)
10. [Security Considerations](#10-security-considerations)
11. [Testing Strategy](#11-testing-strategy)
12. [Implementation Phases](#12-implementation-phases)
13. [Future Enhancements](#13-future-enhancements)

---

## 1. Feature Overview

### 1.1 Core Capabilities

**Two Meeting Types:**
- **Instant Meeting**: Current behavior - generates room ID, starts immediately
- **Scheduled Meeting**: New - set date/time, optional recurrence, calendar sync

**Google Calendar Integration:**
- Connect/disconnect Google Calendar
- Create calendar events for scheduled meetings
- Import meetings from Google Calendar
- Sync meeting updates bidirectionally

**Dashboard Enhancements:**
- View upcoming scheduled meetings
- Meeting list with filters (upcoming, past, all)
- Quick actions (join, edit, cancel, copy link)

### 1.2 Key Principles

1. **Backward Compatibility**: Instant meetings continue to work exactly as before
2. **Optional Integration**: Calendar connection is optional, not required
3. **User Control**: Users can create meetings without calendar sync
4. **Graceful Degradation**: If calendar sync fails, meeting still works

---

## 2. Current State Analysis

### 2.1 What Exists

| Component | Current State | Notes |
|-----------|---------------|-------|
| Meeting Creation | Random roomId generation | `generateRoomId()` in dashboard-client.tsx |
| Room Flow | Navigate to `/meetings/[roomId]` | No persistence, ephemeral rooms |
| PreJoin Screen | Has meeting name, scheduled time inputs | Local state only, not persisted for scheduling |
| Auth | Better Auth with Google OAuth | Has accessToken/refreshToken in account table |
| Database | user, session, account, roomParticipant, document, agenda | No dedicated meeting/scheduling table |

### 2.2 Key Files

```
frontend/
├── app/dashboard/
│   ├── page.tsx                    # Server component, auth check
│   └── dashboard-client.tsx        # "New Meeting" + "Join Meeting" buttons
├── app/meetings/[roomId]/
│   ├── page.tsx                    # Room entry, records participation
│   ├── pre-join-screen.tsx         # Media preview, agenda builder
│   └── meeting-room.tsx            # LiveKit integration
├── lib/
│   ├── auth.ts                     # Better Auth server config (Google OAuth)
│   ├── auth-client.ts              # Better Auth client
│   └── db/schema.ts                # Drizzle schema (user, account, etc.)
```

### 2.3 Existing OAuth Setup

The current Better Auth configuration already has Google OAuth:

```typescript
// lib/auth.ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    prompt: "select_account",
  },
},
```

The `account` table already stores:
- `accessToken` - OAuth access token
- `refreshToken` - OAuth refresh token
- `accessTokenExpiresAt` - Token expiration
- `scope` - Granted OAuth scopes

**Current limitation**: Only requests basic profile scope, not Calendar API scope.

---

## 3. User Flow

### 3.1 Meeting Type Selection

```
User clicks "New Meeting" button
         │
         ▼
┌─────────────────────────────────────────┐
│         New Meeting Dialog              │
│  ┌───────────────────────────────────┐  │
│  │  Choose how to start:              │  │
│  │                                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  ⚡ Start Instant Meeting    │  │  │  ◄── Current behavior
│  │  │  Begin meeting immediately   │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  📅 Schedule for Later       │  │  │  ◄── NEW
│  │  │  Set date, time & invite    │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 3.2 Schedule Meeting Flow

```
User selects "Schedule for Later"
         │
         ▼
┌─────────────────────────────────────────┐
│         Schedule Meeting                 │
│  ┌───────────────────────────────────┐  │
│  │  Meeting Title                     │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Weekly Team Standup         │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                    │  │
│  │  Date & Time                       │  │
│  │  ┌──────────────┐ ┌────────────┐  │  │
│  │  │ Dec 20, 2025 │ │ 10:00 AM   │  │  │
│  │  └──────────────┘ └────────────┘  │  │
│  │                                    │  │
│  │  Duration                          │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 30 minutes              ▼   │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                    │  │
│  │  ☐ Add to Google Calendar          │  │  ◄── If calendar connected
│  │    (or "Connect Google Calendar")  │  │
│  │                                    │  │
│  │  Advanced Options ▼                │  │
│  │  ├─ Description                    │  │
│  │  ├─ Agenda Items                   │  │
│  │  └─ Recurrence (Coming Soon)       │  │
│  │                                    │  │
│  │  ┌─────────┐ ┌─────────────────┐  │  │
│  │  │ Cancel  │ │ Schedule Meeting │  │  │
│  │  └─────────┘ └─────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 3.3 Dashboard with Scheduled Meetings

```
┌────────────────────────────────────────────────────────────────┐
│                          Dashboard                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Welcome back, John!                          [Sign Out]   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Quick Actions                                             │  │
│  │ ┌────────────────┐ ┌────────────────┐                    │  │
│  │ │ ⚡ New Meeting  │ │ 👥 Join Meeting │                    │  │
│  │ └────────────────┘ └────────────────┘                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Upcoming Meetings                              View All ▶ │  │
│  │ ────────────────────────────────────────────────────────  │  │
│  │                                                           │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ 📅 Weekly Team Standup                              │  │  │
│  │ │    Today, 10:00 AM • 30 min • Room: abc-defg-hij    │  │  │
│  │ │    ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │  │
│  │ │    │  Join    │ │ Copy Link│ │  Edit    │           │  │  │
│  │ │    └──────────┘ └──────────┘ └──────────┘           │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ 📅 Project Review                                   │  │  │
│  │ │    Tomorrow, 2:00 PM • 1 hr • Room: xyz-uvwx-pqr    │  │  │
│  │ │    ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │  │
│  │ │    │  Join    │ │ Copy Link│ │  Edit    │           │  │  │
│  │ │    └──────────┘ └──────────┘ └──────────┘           │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │ No more upcoming meetings                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📆 Google Calendar                      [Manage] [Sync]   │  │
│  │    Connected as john@gmail.com                            │  │
│  │    Last synced: 5 minutes ago                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 3.4 Google Calendar Connection Flow

```
User clicks "Connect Google Calendar"
         │
         ▼
┌─────────────────────────────────────────┐
│      Connect Google Calendar            │
│  ┌───────────────────────────────────┐  │
│  │  📆 Connect your Google Calendar   │  │
│  │                                    │  │
│  │  This will allow Hedwiq to:        │  │
│  │  ✓ Create calendar events for      │  │
│  │    your scheduled meetings         │  │
│  │  ✓ Show your availability          │  │
│  │  ✓ Import meetings from calendar   │  │
│  │                                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 🔗 Connect with Google       │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                    │  │
│  │  You can disconnect anytime from   │  │
│  │  Settings > Integrations           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
         │
         ▼
    Google OAuth Consent
    (request calendar scope)
         │
         ▼
    Redirect back to Hedwiq
         │
         ▼
    Store calendar tokens
    Show success message
```

---

## 4. Technical Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │    Dashboard     │  │  Schedule Modal  │  │  Calendar Settings     │ │
│  │  - Upcoming list │  │  - Date/time     │  │  - Connect/disconnect  │ │
│  │  - Quick actions │  │  - Add to cal    │  │  - Sync status         │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────────┬────────────┘ │
│           │                    │                         │              │
└───────────┼────────────────────┼─────────────────────────┼──────────────┘
            │                    │                         │
            ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API ROUTES                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ /api/meetings   │  │ /api/calendar   │  │ /api/integrations       │ │
│  │  - CRUD         │  │  - Sync         │  │  - Connect              │ │
│  │  - List         │  │  - Events       │  │  - Disconnect           │ │
│  │  - Join         │  │  - Import       │  │  - Status               │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────────┬────────────┘ │
│           │                    │                         │              │
└───────────┼────────────────────┼─────────────────────────┼──────────────┘
            │                    │                         │
            ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              SERVICES                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ MeetingService  │  │ CalendarService │  │ IntegrationService      │ │
│  │  - Create       │  │  - Google API   │  │  - OAuth flow           │ │
│  │  - Update       │  │  - Sync logic   │  │  - Token refresh        │ │
│  │  - Validation   │  │  - Event CRUD   │  │  - Scope management     │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────────┬────────────┘ │
│           │                    │                         │              │
└───────────┼────────────────────┼─────────────────────────┼──────────────┘
            │                    │                         │
            ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              DATABASE                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │     meeting     │  │ calendarEvent   │  │     integration         │ │
│  │  - id, roomId   │  │  - eventId      │  │  - provider (google)    │ │
│  │  - scheduledAt  │  │  - meetingId    │  │  - accessToken          │ │
│  │  - status       │  │  - syncStatus   │  │  - refreshToken         │ │
│  │  - hostId       │  │  - lastSynced   │  │  - scopes               │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
            │                    │                         │
            └────────────────────┼─────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Google Calendar API                               ││
│  │  - Create/Update/Delete events                                       ││
│  │  - List events                                                       ││
│  │  - Watch for changes (webhook)                                       ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Meeting Types

```typescript
type MeetingType = "instant" | "scheduled";

type MeetingStatus =
  | "scheduled"   // Future meeting, not started
  | "live"        // Meeting in progress
  | "ended"       // Meeting completed
  | "cancelled";  // Meeting cancelled
```

### 4.3 Calendar Sync Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CALENDAR SYNC STRATEGY                               │
│                                                                          │
│  Hedwiq → Google Calendar (Push):                                       │
│  ─────────────────────────────────                                      │
│  1. User creates scheduled meeting with "Add to Calendar" checked       │
│  2. Hedwiq creates Google Calendar event via API                        │
│  3. Store eventId in calendarEvent table for sync tracking              │
│  4. Updates to meeting propagate to calendar event                      │
│                                                                          │
│  Google Calendar → Hedwiq (Pull - Optional/Future):                     │
│  ───────────────────────────────────────────────                        │
│  1. User can import existing calendar events                            │
│  2. Creates corresponding Hedwiq meeting                                │
│  3. Future: Webhook for real-time sync                                  │
│                                                                          │
│  Conflict Resolution:                                                    │
│  ────────────────────                                                   │
│  - Hedwiq is source of truth for Hedwiq meetings                        │
│  - If calendar event is deleted externally, mark as "unsynced"          │
│  - If meeting is deleted, delete calendar event                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Design

### 5.1 New Tables

```sql
-- Scheduled meetings table
CREATE TABLE meeting (
  id TEXT PRIMARY KEY,                    -- UUID or prefixed ID (mtg-xxx)
  room_id TEXT NOT NULL UNIQUE,           -- LiveKit room ID (abc-defg-hij)
  host_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Meeting details
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'instant',   -- 'instant' | 'scheduled'
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'ended' | 'cancelled'

  -- Scheduling
  scheduled_at TIMESTAMP,                 -- NULL for instant meetings
  duration_minutes INTEGER DEFAULT 60,    -- Expected duration
  timezone TEXT DEFAULT 'UTC',            -- User's timezone for display

  -- Tracking
  started_at TIMESTAMP,                   -- Actual start time
  ended_at TIMESTAMP,                     -- Actual end time

  -- Settings
  settings JSONB DEFAULT '{}',            -- { transcriptionEnabled, insightsEnabled, etc. }

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_host ON meeting(host_id);
CREATE INDEX idx_meeting_scheduled ON meeting(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_meeting_room ON meeting(room_id);

-- Calendar integration table (separate from Better Auth account)
CREATE TABLE calendar_integration (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',  -- 'google' | 'outlook' (future)

  -- OAuth tokens (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,

  -- Provider-specific
  provider_account_id TEXT,               -- Google account ID
  provider_email TEXT,                    -- Calendar account email
  calendar_id TEXT DEFAULT 'primary',     -- Which calendar to use

  -- Sync state
  scopes TEXT[],                          -- Granted OAuth scopes
  last_synced_at TIMESTAMP,
  sync_enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, provider)               -- One integration per provider per user
);

CREATE INDEX idx_calendar_integration_user ON calendar_integration(user_id);

-- Calendar event mapping (links Hedwiq meetings to calendar events)
CREATE TABLE calendar_event (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES calendar_integration(id) ON DELETE CASCADE,

  -- External calendar event
  provider_event_id TEXT NOT NULL,        -- Google Calendar event ID
  provider_event_link TEXT,               -- Event link in Google Calendar

  -- Sync tracking
  sync_status TEXT NOT NULL DEFAULT 'synced', -- 'synced' | 'pending' | 'failed' | 'deleted'
  last_synced_at TIMESTAMP,
  sync_error TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(meeting_id, integration_id)      -- One event per meeting per integration
);

CREATE INDEX idx_calendar_event_meeting ON calendar_event(meeting_id);
```

### 5.2 Drizzle Schema

```typescript
// lib/db/schema.ts - New additions

import {
  pgTable, text, timestamp, boolean, integer, jsonb, index, uniqueIndex
} from "drizzle-orm/pg-core";

/**
 * Meetings table - both instant and scheduled meetings.
 */
export const meeting = pgTable(
  "meeting",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull().unique(),
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Meeting details
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("instant"), // 'instant' | 'scheduled'
    status: text("status").notNull().default("scheduled"),

    // Scheduling
    scheduledAt: timestamp("scheduled_at"),
    durationMinutes: integer("duration_minutes").default(60),
    timezone: text("timezone").default("UTC"),

    // Tracking
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),

    // Settings
    settings: jsonb("settings").$type<{
      transcriptionEnabled?: boolean;
      insightsEnabled?: boolean;
      recordingEnabled?: boolean;
    }>().default({}),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_meeting_host").on(table.hostId),
    index("idx_meeting_scheduled").on(table.scheduledAt),
  ]
);

/**
 * Calendar integrations - OAuth connections to external calendars.
 */
export const calendarIntegration = pgTable(
  "calendar_integration",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google"),

    // OAuth tokens
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),

    // Provider info
    providerAccountId: text("provider_account_id"),
    providerEmail: text("provider_email"),
    calendarId: text("calendar_id").default("primary"),

    // Sync state
    scopes: text("scopes").array(),
    lastSyncedAt: timestamp("last_synced_at"),
    syncEnabled: boolean("sync_enabled").default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_integration_user").on(table.userId),
    uniqueIndex("idx_calendar_integration_unique").on(table.userId, table.provider),
  ]
);

/**
 * Calendar events - links meetings to external calendar events.
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => calendarIntegration.id, { onDelete: "cascade" }),

    // External event
    providerEventId: text("provider_event_id").notNull(),
    providerEventLink: text("provider_event_link"),

    // Sync tracking
    syncStatus: text("sync_status").notNull().default("synced"),
    lastSyncedAt: timestamp("last_synced_at"),
    syncError: text("sync_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_event_meeting").on(table.meetingId),
    uniqueIndex("idx_calendar_event_unique").on(table.meetingId, table.integrationId),
  ]
);
```

### 5.3 Relationship to Existing Tables

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE RELATIONSHIPS                           │
│                                                                          │
│  ┌────────────┐                                                         │
│  │    user    │                                                         │
│  └─────┬──────┘                                                         │
│        │                                                                │
│        ├──────────────────────────────────────────────────────┐         │
│        │                                                      │         │
│        ▼                                                      ▼         │
│  ┌────────────────┐                              ┌────────────────────┐ │
│  │    meeting     │                              │ calendarIntegration│ │
│  │  (host_id)     │                              │    (user_id)       │ │
│  └───────┬────────┘                              └─────────┬──────────┘ │
│          │                                                 │            │
│          │ room_id                                         │            │
│          │                                                 │            │
│          ├────────────────────────────────────────────────-┤            │
│          │                                                 │            │
│          ▼                                                 ▼            │
│  ┌────────────────┐  ┌───────────┐  ┌──────────┐  ┌────────────────┐   │
│  │roomParticipant │  │  agenda   │  │ document │  │ calendarEvent  │   │
│  │  (room_id)     │  │ (room_id) │  │(room_id) │  │ (meeting_id,   │   │
│  └────────────────┘  └───────────┘  └──────────┘  │  integration_id)│   │
│                                                    └────────────────┘   │
│                                                                          │
│  NOTE: Existing tables (roomParticipant, agenda, document) use room_id  │
│        Meeting table provides the room_id for these relationships       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Google Calendar Integration

### 6.1 OAuth Scopes

```typescript
// Required scopes for Google Calendar integration
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",     // Create/edit events
  "https://www.googleapis.com/auth/calendar.readonly",   // Read calendar list
  "https://www.googleapis.com/auth/userinfo.email",      // Get user's email
];

// Note: We DON'T request full calendar access, only events
// This is the minimal scope needed for our use case
```

### 6.2 Separate OAuth Flow

**Important**: Calendar OAuth should be separate from sign-in OAuth.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WHY SEPARATE OAUTH FLOWS                             │
│                                                                          │
│  Sign-in OAuth (existing):                                              │
│  - Purpose: Authentication                                              │
│  - Scopes: profile, email                                               │
│  - Triggered: Sign-in page                                              │
│  - Required: Yes (for all users)                                        │
│                                                                          │
│  Calendar OAuth (new):                                                  │
│  - Purpose: Calendar integration                                        │
│  - Scopes: calendar.events, calendar.readonly                           │
│  - Triggered: "Connect Calendar" button                                 │
│  - Required: No (optional feature)                                      │
│                                                                          │
│  Benefits of separation:                                                │
│  1. Users can sign in without granting calendar access                  │
│  2. Clear permission request when user wants calendar                   │
│  3. Can revoke calendar access without affecting sign-in                │
│  4. Follows principle of least privilege                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Google Calendar API Client

```typescript
// lib/google-calendar.ts

import { google, calendar_v3 } from "googleapis";

export interface CalendarCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CreateEventInput {
  summary: string;           // Meeting title
  description?: string;      // Meeting description
  startTime: Date;          // Start time
  endTime: Date;            // End time
  timezone?: string;        // User's timezone
  conferenceData?: {
    meetingLink: string;    // Hedwiq meeting link
    meetingId: string;      // Room ID
  };
}

export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar;
  private credentials: CalendarCredentials;

  constructor(credentials: CalendarCredentials) {
    this.credentials = credentials;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt?.getTime(),
    });

    this.calendar = google.calendar({ version: "v3", auth: oauth2Client });
  }

  /**
   * Creates a Google Calendar event for a Hedwiq meeting.
   */
  async createEvent(
    input: CreateEventInput,
    calendarId = "primary"
  ): Promise<calendar_v3.Schema$Event> {
    const meetingLink = input.conferenceData?.meetingLink
      || `${process.env.NEXT_PUBLIC_APP_URL}/meetings/${input.conferenceData?.meetingId}`;

    const event = await this.calendar.events.insert({
      calendarId,
      requestBody: {
        summary: input.summary,
        description: `${input.description || ""}\n\nJoin Hedwiq Meeting: ${meetingLink}`,
        start: {
          dateTime: input.startTime.toISOString(),
          timeZone: input.timezone || "UTC",
        },
        end: {
          dateTime: input.endTime.toISOString(),
          timeZone: input.timezone || "UTC",
        },
        // Custom meeting link (not Google Meet)
        source: {
          title: "Hedwiq Meeting",
          url: meetingLink,
        },
      },
    });

    return event.data;
  }

  /**
   * Updates an existing Google Calendar event.
   */
  async updateEvent(
    eventId: string,
    input: Partial<CreateEventInput>,
    calendarId = "primary"
  ): Promise<calendar_v3.Schema$Event> {
    const updateData: calendar_v3.Schema$Event = {};

    if (input.summary) updateData.summary = input.summary;
    if (input.description) updateData.description = input.description;
    if (input.startTime) {
      updateData.start = {
        dateTime: input.startTime.toISOString(),
        timeZone: input.timezone || "UTC",
      };
    }
    if (input.endTime) {
      updateData.end = {
        dateTime: input.endTime.toISOString(),
        timeZone: input.timezone || "UTC",
      };
    }

    const event = await this.calendar.events.patch({
      calendarId,
      eventId,
      requestBody: updateData,
    });

    return event.data;
  }

  /**
   * Deletes a Google Calendar event.
   */
  async deleteEvent(eventId: string, calendarId = "primary"): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  /**
   * Lists user's calendars to let them choose which one to use.
   */
  async listCalendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const response = await this.calendar.calendarList.list();
    return response.data.items || [];
  }
}
```

### 6.4 Token Refresh Handling

```typescript
// lib/calendar/token-refresh.ts

import { db } from "@/lib/db";
import { calendarIntegration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { google } from "googleapis";

/**
 * Refreshes expired Google OAuth tokens.
 * Called before making Calendar API requests.
 */
export async function refreshCalendarTokenIfNeeded(
  integrationId: string
): Promise<string> {
  const [integration] = await db
    .select()
    .from(calendarIntegration)
    .where(eq(calendarIntegration.id, integrationId))
    .limit(1);

  if (!integration) {
    throw new Error("Calendar integration not found");
  }

  // Check if token is expired or expiring soon (5 min buffer)
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;
  const tokenExpiry = integration.tokenExpiresAt;

  if (tokenExpiry && tokenExpiry.getTime() - bufferMs > now.getTime()) {
    // Token is still valid
    return integration.accessToken;
  }

  // Token needs refresh
  if (!integration.refreshToken) {
    throw new Error("No refresh token available. User needs to reconnect.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: integration.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  // Update stored tokens
  await db
    .update(calendarIntegration)
    .set({
      accessToken: credentials.access_token!,
      tokenExpiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegration.id, integrationId));

  return credentials.access_token!;
}
```

---

## 7. Frontend Implementation

### 7.1 New Components

```
frontend/
├── components/
│   ├── meetings/
│   │   ├── index.ts                      # Barrel export
│   │   ├── meeting-type-selector.tsx     # Instant vs Scheduled picker
│   │   ├── schedule-meeting-dialog.tsx   # Full scheduling dialog
│   │   ├── meeting-card.tsx              # Meeting in list view
│   │   ├── meeting-list.tsx              # List of upcoming/past meetings
│   │   └── meeting-actions.tsx           # Join/Edit/Cancel/Copy actions
│   │
│   └── calendar/
│       ├── index.ts                      # Barrel export
│       ├── calendar-connect-button.tsx   # Connect Google Calendar
│       ├── calendar-status.tsx           # Connection status display
│       └── calendar-settings.tsx         # Manage integration
│
├── app/dashboard/
│   ├── page.tsx                          # Updated with meeting list
│   ├── dashboard-client.tsx              # Updated with new meeting flow
│   └── components/
│       ├── quick-actions.tsx             # New Meeting + Join Meeting
│       ├── upcoming-meetings.tsx         # List component
│       └── calendar-section.tsx          # Calendar integration status
```

### 7.2 Key Component: Meeting Type Selector

```tsx
// components/meetings/meeting-type-selector.tsx
"use client";

import { Video, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MeetingTypeSelectorProps {
  onSelectInstant: () => void;
  onSelectScheduled: () => void;
}

export function MeetingTypeSelector({
  onSelectInstant,
  onSelectScheduled,
}: MeetingTypeSelectorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card
        className="cursor-pointer transition-colors hover:border-primary"
        onClick={onSelectInstant}
      >
        <CardHeader>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Video className="size-6 text-primary" />
          </div>
          <CardTitle className="mt-4">Start Instant Meeting</CardTitle>
          <CardDescription>
            Begin a meeting immediately. Perfect for quick calls.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card
        className="cursor-pointer transition-colors hover:border-primary"
        onClick={onSelectScheduled}
      >
        <CardHeader>
          <div className="flex size-12 items-center justify-center rounded-full bg-blue-500/10">
            <Calendar className="size-6 text-blue-500" />
          </div>
          <CardTitle className="mt-4">Schedule for Later</CardTitle>
          <CardDescription>
            Set a date and time. Optionally sync with your calendar.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
```

### 7.3 Key Component: Schedule Meeting Dialog

```tsx
// components/meetings/schedule-meeting-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarConnectButton } from "@/components/calendar";

interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarConnected?: boolean;
}

const DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  const label = format(new Date().setHours(hour, minute), "h:mm a");
  return { value: time, label };
});

export function ScheduleMeetingDialog({
  open,
  onOpenChange,
  calendarConnected = false,
}: ScheduleMeetingDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [addToCalendar, setAddToCalendar] = useState(calendarConnected);

  const handleSubmit = async () => {
    if (!title || !date) return;

    setIsSubmitting(true);

    try {
      // Parse time
      const [hours, minutes] = time.split(":").map(Number);
      const scheduledAt = new Date(date);
      scheduledAt.setHours(hours, minutes, 0, 0);

      // Create meeting via API
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          type: "scheduled",
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: duration,
          addToCalendar,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create meeting");
      }

      const { meeting } = await response.json();

      // Close dialog and show success / navigate to meeting details
      onOpenChange(false);
      router.refresh(); // Refresh to show new meeting in list

    } catch (error) {
      console.error("Failed to schedule meeting:", error);
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule a Meeting</DialogTitle>
          <DialogDescription>
            Set up a meeting for a future date and time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Meeting Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Weekly Team Standup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Date & Time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label>Time</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration */}
          <div className="grid gap-2">
            <Label>Duration</Label>
            <Select
              value={duration.toString()}
              onValueChange={(v) => setDuration(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description (optional) */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Add meeting details, agenda, or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Calendar Integration */}
          <div className="rounded-lg border p-4">
            {calendarConnected ? (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="add-to-calendar"
                  checked={addToCalendar}
                  onCheckedChange={(checked) => setAddToCalendar(!!checked)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="add-to-calendar"
                    className="text-sm font-medium"
                  >
                    Add to Google Calendar
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Creates an event in your connected calendar
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Google Calendar</p>
                  <p className="text-sm text-muted-foreground">
                    Connect to add events automatically
                  </p>
                </div>
                <CalendarConnectButton variant="outline" size="sm" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title || !date || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Schedule Meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 7.4 Updated Dashboard Structure

```tsx
// app/dashboard/dashboard-client.tsx (updated structure)
"use client";

import { useState } from "react";
import { MeetingTypeSelector } from "@/components/meetings/meeting-type-selector";
import { ScheduleMeetingDialog } from "@/components/meetings/schedule-meeting-dialog";
import { MeetingList } from "@/components/meetings/meeting-list";
import { CalendarSection } from "./components/calendar-section";
import { JoinMeetingDialog } from "./components/join-meeting-dialog";
import type { User } from "@/types/user";
import type { Meeting } from "@/types/meeting";

interface DashboardClientProps {
  user: User;
  upcomingMeetings: Meeting[];
  calendarConnected: boolean;
}

export function DashboardClient({
  user,
  upcomingMeetings,
  calendarConnected,
}: DashboardClientProps) {
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  const handleInstantMeeting = () => {
    // Current behavior - generate room ID and navigate
    const roomId = generateRoomId();
    router.push(`/meetings/${roomId}`);
  };

  const handleScheduleMeeting = () => {
    setShowNewMeetingDialog(false);
    setShowScheduleDialog(true);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <DashboardHeader user={user} />

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button onClick={() => setShowNewMeetingDialog(true)}>
              <Video className="mr-2 size-4" />
              New Meeting
            </Button>
            <Button variant="outline" onClick={() => setShowJoinDialog(true)}>
              <Users className="mr-2 size-4" />
              Join Meeting
            </Button>
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingList meetings={upcomingMeetings} />
          </CardContent>
        </Card>

        {/* Calendar Integration */}
        <CalendarSection connected={calendarConnected} />

        {/* Dialogs */}
        <Dialog open={showNewMeetingDialog} onOpenChange={setShowNewMeetingDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Meeting</DialogTitle>
            </DialogHeader>
            <MeetingTypeSelector
              onSelectInstant={handleInstantMeeting}
              onSelectScheduled={handleScheduleMeeting}
            />
          </DialogContent>
        </Dialog>

        <ScheduleMeetingDialog
          open={showScheduleDialog}
          onOpenChange={setShowScheduleDialog}
          calendarConnected={calendarConnected}
        />

        <JoinMeetingDialog
          open={showJoinDialog}
          onOpenChange={setShowJoinDialog}
        />
      </div>
    </div>
  );
}
```

---

## 8. API Design

### 8.1 API Routes Structure

```
frontend/app/api/
├── meetings/
│   ├── route.ts                    # GET (list), POST (create)
│   └── [meetingId]/
│       ├── route.ts                # GET, PATCH, DELETE
│       └── join/
│           └── route.ts            # POST (generate join token)
│
├── calendar/
│   ├── connect/
│   │   └── route.ts                # GET (OAuth redirect URL)
│   ├── callback/
│   │   └── route.ts                # GET (OAuth callback handler)
│   ├── disconnect/
│   │   └── route.ts                # POST (remove integration)
│   ├── sync/
│   │   └── route.ts                # POST (manual sync trigger)
│   └── status/
│       └── route.ts                # GET (connection status)
```

### 8.2 Meetings API

```typescript
// app/api/meetings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { meeting, calendarIntegration, calendarEvent } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { GoogleCalendarService } from "@/lib/google-calendar";
import { z } from "zod";

// Validation schema
const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["instant", "scheduled"]),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().min(5).max(480).default(60),
  addToCalendar: z.boolean().default(false),
});

/**
 * GET /api/meetings
 * List user's meetings
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // 'upcoming' | 'past' | 'all'

  let query = db
    .select()
    .from(meeting)
    .where(eq(meeting.hostId, session.user.id))
    .orderBy(desc(meeting.scheduledAt));

  if (status === "upcoming") {
    query = query.where(
      and(
        eq(meeting.hostId, session.user.id),
        gte(meeting.scheduledAt, new Date())
      )
    );
  }

  const meetings = await query;

  return NextResponse.json({ meetings });
}

/**
 * POST /api/meetings
 * Create a new meeting
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validation = createMeetingSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.errors },
      { status: 400 }
    );
  }

  const input = validation.data;
  const roomId = generateRoomId();
  const meetingId = `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create meeting record
  const [newMeeting] = await db
    .insert(meeting)
    .values({
      id: meetingId,
      roomId,
      hostId: session.user.id,
      title: input.title,
      description: input.description,
      type: input.type,
      status: input.type === "instant" ? "live" : "scheduled",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      durationMinutes: input.durationMinutes,
    })
    .returning();

  // Create Google Calendar event if requested
  if (input.addToCalendar && input.type === "scheduled") {
    await createCalendarEvent(session.user.id, newMeeting);
  }

  return NextResponse.json({ meeting: newMeeting }, { status: 201 });
}

async function createCalendarEvent(userId: string, mtg: typeof meeting.$inferSelect) {
  // Get user's calendar integration
  const [integration] = await db
    .select()
    .from(calendarIntegration)
    .where(
      and(
        eq(calendarIntegration.userId, userId),
        eq(calendarIntegration.provider, "google"),
        eq(calendarIntegration.syncEnabled, true)
      )
    )
    .limit(1);

  if (!integration) return;

  try {
    const calendarService = new GoogleCalendarService({
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken ?? undefined,
      expiresAt: integration.tokenExpiresAt ?? undefined,
    });

    const endTime = new Date(mtg.scheduledAt!);
    endTime.setMinutes(endTime.getMinutes() + (mtg.durationMinutes || 60));

    const event = await calendarService.createEvent({
      summary: mtg.title,
      description: mtg.description ?? undefined,
      startTime: mtg.scheduledAt!,
      endTime,
      conferenceData: {
        meetingLink: `${process.env.NEXT_PUBLIC_APP_URL}/meetings/${mtg.roomId}`,
        meetingId: mtg.roomId,
      },
    });

    // Store event mapping
    await db.insert(calendarEvent).values({
      id: `cevt-${Date.now()}`,
      meetingId: mtg.id,
      integrationId: integration.id,
      providerEventId: event.id!,
      providerEventLink: event.htmlLink ?? null,
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to create calendar event:", error);
    // Don't fail the meeting creation, just log the error
  }
}

function generateRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const segments = [3, 4, 3];
  return segments
    .map((len) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("")
    )
    .join("-");
}
```

### 8.3 Calendar Connect API

```typescript
// app/api/calendar/connect/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * GET /api/calendar/connect
 * Returns Google OAuth URL for calendar connection
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BETTER_AUTH_URL}/api/calendar/callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to get refresh token
    state: session.user.id, // Pass user ID for callback
  });

  return NextResponse.json({ url: authUrl });
}
```

```typescript
// app/api/calendar/callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { db } from "@/lib/db";
import { calendarIntegration } from "@/lib/db/schema";

/**
 * GET /api/calendar/callback
 * OAuth callback handler for Google Calendar
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // User ID
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?calendar_error=${error}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?calendar_error=missing_params`
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BETTER_AUTH_URL}/api/calendar/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user's email from the token
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Store integration
    const integrationId = `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db
      .insert(calendarIntegration)
      .values({
        id: integrationId,
        userId: state,
        provider: "google",
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        providerAccountId: userInfo.data.id ?? null,
        providerEmail: userInfo.data.email ?? null,
        scopes: tokens.scope?.split(" ") ?? [],
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [calendarIntegration.userId, calendarIntegration.provider],
        set: {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token ?? undefined,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          providerEmail: userInfo.data.email ?? null,
          scopes: tokens.scope?.split(" ") ?? [],
          updatedAt: new Date(),
        },
      });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?calendar_connected=true`
    );
  } catch (error) {
    console.error("Calendar OAuth error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?calendar_error=oauth_failed`
    );
  }
}
```

---

## 9. Edge Cases & Error Handling

### 9.1 Meeting Edge Cases

| Scenario | Handling |
|----------|----------|
| User schedules meeting for past time | Validation error, require future date |
| User tries to join cancelled meeting | Show "Meeting cancelled" message, redirect |
| User edits meeting after calendar sync | Update calendar event via API |
| Calendar event deleted externally | Mark as "unsynced" on next sync check |
| Host doesn't show up | Meeting remains "scheduled", no auto-cancel |
| Duplicate room ID (collision) | Regenerate with retry logic |

### 9.2 Calendar Integration Edge Cases

| Scenario | Handling |
|----------|----------|
| OAuth token expired | Auto-refresh using refresh token |
| Refresh token revoked | Prompt user to reconnect |
| Calendar API rate limited | Exponential backoff, queue retries |
| User disconnects calendar | Delete integration, keep meetings |
| Multiple Google accounts | Show selector, store per-user |
| Calendar event creation fails | Meeting still created, show warning |

### 9.3 Error Messages

```typescript
// lib/errors/calendar.ts

export const CALENDAR_ERRORS = {
  NOT_CONNECTED: "Calendar not connected. Connect your calendar in Settings.",
  TOKEN_EXPIRED: "Calendar connection expired. Please reconnect.",
  SYNC_FAILED: "Failed to sync with calendar. Your meeting was still created.",
  EVENT_NOT_FOUND: "Calendar event not found. It may have been deleted.",
  RATE_LIMITED: "Too many requests. Please try again in a moment.",
} as const;
```

---

## 10. Security Considerations

### 10.1 OAuth Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        OAUTH SECURITY MEASURES                           │
│                                                                          │
│  1. Token Storage                                                       │
│     - Access tokens stored in database (encrypted at rest)              │
│     - Refresh tokens treated as sensitive credentials                   │
│     - Never exposed to client-side code                                 │
│                                                                          │
│  2. Scope Minimization                                                  │
│     - Only request calendar.events (not full calendar access)           │
│     - Separate from sign-in OAuth (different scopes)                    │
│                                                                          │
│  3. State Parameter                                                     │
│     - Include user ID in OAuth state                                    │
│     - Validate on callback to prevent CSRF                              │
│                                                                          │
│  4. Token Refresh                                                       │
│     - Auto-refresh before expiration                                    │
│     - Handle refresh failures gracefully                                │
│                                                                          │
│  5. Revocation                                                          │
│     - Users can disconnect anytime                                      │
│     - Clear all stored tokens on disconnect                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Meeting Access Control

```typescript
// Verify user has access to meeting
async function verifyMeetingAccess(userId: string, meetingId: string) {
  const mtg = await getMeetingById(meetingId);

  if (!mtg) {
    throw new Error("Meeting not found");
  }

  // Host always has access
  if (mtg.hostId === userId) {
    return { role: "host", meeting: mtg };
  }

  // Check if user was invited or is a participant
  // (Future: implement invitees table)

  // For now, anyone with the link can join
  return { role: "participant", meeting: mtg };
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// tests/lib/calendar/google-calendar.test.ts

describe("GoogleCalendarService", () => {
  describe("createEvent", () => {
    it("creates event with correct parameters");
    it("includes meeting link in description");
    it("handles timezone correctly");
  });

  describe("updateEvent", () => {
    it("updates only provided fields");
    it("handles non-existent event");
  });

  describe("deleteEvent", () => {
    it("deletes event successfully");
    it("handles already deleted event");
  });
});

// tests/api/meetings.test.ts

describe("POST /api/meetings", () => {
  it("creates instant meeting without calendar sync");
  it("creates scheduled meeting with calendar sync");
  it("validates required fields");
  it("rejects past scheduled times");
  it("generates unique room IDs");
});
```

### 11.2 Integration Tests

```typescript
// tests/integration/calendar-sync.test.ts

describe("Calendar Sync Integration", () => {
  it("completes full OAuth flow");
  it("creates calendar event when scheduling meeting");
  it("updates calendar event when meeting is modified");
  it("deletes calendar event when meeting is cancelled");
  it("handles token refresh during sync");
});
```

### 11.3 E2E Tests

```typescript
// tests/e2e/schedule-meeting.spec.ts

describe("Schedule Meeting Flow", () => {
  it("shows meeting type selector when clicking New Meeting");
  it("opens schedule dialog when selecting Schedule for Later");
  it("creates meeting and shows in upcoming list");
  it("allows joining scheduled meeting before start time");
  it("shows calendar connect option when not connected");
});
```

---

## 12. Implementation Phases

### Phase 1: Meeting Persistence (Week 1-2)

**Goal**: Persist meetings to database, update dashboard UI

- [ ] Create `meeting` table and migrations
- [ ] Update dashboard to show meeting type selector
- [ ] Implement instant meeting with persistence
- [ ] Implement schedule meeting dialog (without calendar)
- [ ] Show upcoming meetings in dashboard
- [ ] Meeting CRUD API routes
- [ ] Update existing meeting flow to create records

**Deliverables**:
- Users can create scheduled meetings
- Meetings persist in database
- Dashboard shows upcoming meetings
- Instant meetings work as before

### Phase 2: Google Calendar OAuth (Week 3)

**Goal**: Implement calendar connection flow

- [ ] Create `calendar_integration` table
- [ ] Implement OAuth connect flow
- [ ] Implement OAuth callback handler
- [ ] Add calendar status to dashboard
- [ ] Implement disconnect functionality
- [ ] Token refresh logic
- [ ] Calendar connect button component

**Deliverables**:
- Users can connect Google Calendar
- OAuth flow works end-to-end
- Tokens are stored securely
- Users can disconnect calendar

### Phase 3: Calendar Sync (Week 4)

**Goal**: Sync meetings to Google Calendar

- [ ] Create `calendar_event` table
- [ ] Implement Google Calendar API client
- [ ] Create events when scheduling meetings
- [ ] Update events when meetings change
- [ ] Delete events when meetings cancelled
- [ ] Add "Add to Calendar" checkbox
- [ ] Sync status indicators

**Deliverables**:
- Scheduled meetings create calendar events
- Meeting changes sync to calendar
- Cancellations delete calendar events
- Users see sync status

### Phase 4: Polish & Advanced Features (Week 5)

**Goal**: Refine UX and add advanced features

- [ ] Meeting notifications/reminders
- [ ] Copy meeting link functionality
- [ ] Meeting edit dialog
- [ ] Past meetings view
- [ ] Mobile responsive UI
- [ ] Error handling improvements
- [ ] Loading states and optimistic updates

**Deliverables**:
- Polished user experience
- Complete meeting management
- Mobile-friendly interface
- Robust error handling

---

## 13. Future Enhancements

### 13.1 Planned for Later

| Feature | Description | Priority |
|---------|-------------|----------|
| Recurring meetings | Weekly, daily, custom patterns | Medium |
| Meeting invites | Email invitations with RSVP | Medium |
| Microsoft Outlook | Calendar integration | Medium |
| Availability view | See free/busy times | Low |
| Meeting rooms | Resource booking | Low |
| Custom meeting links | Vanity URLs | Low |
| Waiting room | Pre-meeting holding area | Medium |

### 13.2 Technical Debt to Address

- [ ] Encrypt OAuth tokens at rest (beyond DB encryption)
- [ ] Implement webhook for real-time calendar sync
- [ ] Add retry queue for failed calendar operations
- [ ] Rate limiting for calendar API calls
- [ ] Audit logging for meeting operations

---

## Appendix A: Environment Variables

```bash
# Add to .env.example

# Google Calendar (separate from sign-in if needed)
# Note: Can use same credentials as sign-in OAuth if scopes are managed correctly
GOOGLE_CALENDAR_CLIENT_ID=       # Optional, defaults to GOOGLE_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET=   # Optional, defaults to GOOGLE_CLIENT_SECRET
```

---

## Appendix B: Type Definitions

```typescript
// types/meeting.ts

export type MeetingType = "instant" | "scheduled";

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface Meeting {
  id: string;
  roomId: string;
  hostId: string;
  title: string;
  description?: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAt?: string;
  durationMinutes: number;
  timezone?: string;
  startedAt?: string;
  endedAt?: string;
  settings?: MeetingSettings;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingSettings {
  transcriptionEnabled?: boolean;
  insightsEnabled?: boolean;
  recordingEnabled?: boolean;
}

// types/calendar.ts

export type CalendarProvider = "google" | "outlook";

export type SyncStatus = "synced" | "pending" | "failed" | "deleted";

export interface CalendarIntegration {
  id: string;
  userId: string;
  provider: CalendarProvider;
  providerEmail?: string;
  calendarId: string;
  syncEnabled: boolean;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  meetingId: string;
  integrationId: string;
  providerEventId: string;
  providerEventLink?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  syncError?: string;
}
```

---

*Document Version: 1.0*
*Created: December 2024*
*Author: Implementation Plan*
