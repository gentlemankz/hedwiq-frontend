# Dashboard Sidebar & Meeting Folders Plan

## Overview

Restructure dashboard from vertical card layout to left sidebar navigation with folder-based meeting organization. This improves UX by reducing cognitive load and enabling better meeting organization.

---

## Current State Analysis

### Dashboard Components (dashboard-client.tsx)
- Welcome Card (account info)
- Quick Actions Card (New Meeting | Join Meeting)
- CalendarStatusCard (Google Calendar integration)
- Upcoming Meetings (MeetingList)
- Past Meetings (PastMeetingsList)

### Current Data Flow
- Meetings stored flat in `meeting` table with `hostId`, `status`, `type`
- No folder/organization concept exists
- Past meetings fetched via `/api/meetings/history` with simple pagination
- Gmail integration lives in EmailDraftPanel (inside meeting sidebar, not dashboard)

---

## Target Architecture

### Left Sidebar Structure
```
┌─────────────────────────────┐
│  [Avatar] User Name         │  <- Team member info
│  user@email.com             │
├─────────────────────────────┤
│  🏠 Home                    │  <- Dashboard overview
│  📁 Past Meetings      ▸    │  <- Expandable folders
│     └─ General              │
│     └─ Project A            │
│     └─ + New Folder         │
│  🔗 Integrations            │  <- Calendar + Gmail
│  ⚙️ Settings                │  <- User preferences
└─────────────────────────────┘
```

### Main Content Areas
| Route | Content |
|-------|---------|
| `/dashboard` (Home) | Quick Actions + Upcoming Meetings |
| `/dashboard/past-meetings` | Folder tree + meeting list |
| `/dashboard/past-meetings/[folderId]` | Specific folder contents |
| `/dashboard/integrations` | Calendar + Gmail status cards |
| `/dashboard/settings` | User preferences (future) |

---

## Database Schema Changes

### New Table: `meeting_folder`
```sql
CREATE TABLE meeting_folder (
  id TEXT PRIMARY KEY,           -- folder-{userId}-{timestamp}
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,            -- "General", "Project Alpha", etc.
  color TEXT,                    -- Optional hex color for UI
  icon TEXT,                     -- Optional icon identifier
  order_index INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,  -- "General" folder
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_folder_user ON meeting_folder(user_id);
CREATE UNIQUE INDEX idx_folder_default ON meeting_folder(user_id) WHERE is_default = TRUE;
```

### Modify Table: `meeting`
```sql
ALTER TABLE meeting
ADD COLUMN folder_id TEXT REFERENCES meeting_folder(id) ON DELETE SET NULL;

CREATE INDEX idx_meeting_folder ON meeting(folder_id);
```

### Auto-Create Default Folder
On first meeting creation or dashboard access, auto-create "General" folder for user with `is_default = TRUE`.

---

## Component Architecture

### New Components

#### 1. `components/layout/dashboard-sidebar.tsx`
- Collapsible sidebar (icon-only on mobile)
- User avatar + info at top
- Navigation items with active state
- Folder tree with expand/collapse
- Responsive: sheet on mobile, fixed on desktop

#### 2. `components/layout/dashboard-layout.tsx`
- Wraps all `/dashboard/*` routes
- Sidebar + main content area
- Handles sidebar state (expanded/collapsed)

#### 3. `components/folders/folder-tree.tsx`
- Nested folder display
- Drag-drop reordering (future)
- Inline rename
- Folder CRUD actions

#### 4. `components/folders/folder-select.tsx`
- Dropdown for selecting folder
- Used in ScheduleMeetingDialog and PreJoinScreen
- "General" as default selection
- Quick "New Folder" option

#### 5. `components/folders/create-folder-dialog.tsx`
- Name input
- Optional color/icon picker
- Validation (unique name per user)

### Modified Components

#### `app/dashboard/page.tsx` → `app/dashboard/(main)/page.tsx`
- Move to route group
- Simplified: Quick Actions + Upcoming only
- Remove Past Meetings section

#### `components/meetings/schedule-meeting-dialog.tsx`
- Add FolderSelect dropdown
- Default to "General" folder
- Store `folderId` in meeting creation

#### `app/meetings/[roomId]/pre-join-screen.tsx`
- Add collapsible "Organization" section
- FolderSelect for instant meetings
- Disabled for scheduled meetings (already assigned)

---

## Route Structure

```
app/
├── dashboard/
│   ├── layout.tsx              # DashboardLayout with sidebar
│   ├── (main)/
│   │   └── page.tsx            # Home: Quick Actions + Upcoming
│   ├── past-meetings/
│   │   ├── page.tsx            # All folders overview
│   │   └── [folderId]/
│   │       └── page.tsx        # Single folder contents
│   ├── integrations/
│   │   └── page.tsx            # Calendar + Gmail cards
│   └── settings/
│       └── page.tsx            # User preferences (stub)
```

---

## API Endpoints

### Folders API: `/api/folders`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/folders` | List user's folders |
| POST | `/api/folders` | Create folder |
| PATCH | `/api/folders/[id]` | Update folder (name, color, order) |
| DELETE | `/api/folders/[id]` | Delete folder (moves meetings to General) |
| POST | `/api/folders/reorder` | Bulk update order_index |

### Modified Meetings API

| Endpoint | Change |
|----------|--------|
| POST `/api/meetings` | Accept optional `folderId` |
| PATCH `/api/meetings/[id]` | Accept `folderId` for reassignment |
| GET `/api/meetings/history` | Add `folderId` filter param |

---

## State Management

### Sidebar State
```typescript
// contexts/sidebar-context.tsx
interface SidebarState {
  isCollapsed: boolean;
  expandedFolders: Set<string>;
  activeRoute: string;
}
```

### Folders State
```typescript
// contexts/folders-context.tsx (or use React Query)
interface FoldersState {
  folders: Folder[];
  isLoading: boolean;
  createFolder: (name: string) => Promise<Folder>;
  updateFolder: (id: string, data: Partial<Folder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (ids: string[]) => Promise<void>;
}
```

---

## Migration Strategy

### Phase 1: Database & API
1. Create `meeting_folder` table migration
2. Add `folder_id` column to `meeting` table
3. Implement folders CRUD in `lib/db/folder.ts`
4. Create `/api/folders` endpoints
5. Modify `/api/meetings` to handle `folderId`

### Phase 2: Sidebar Layout
1. Create `DashboardLayout` with sidebar
2. Build `DashboardSidebar` component
3. Implement responsive behavior
4. Update route structure with groups

### Phase 3: Folders UI
1. Build `FolderTree` component
2. Create `FolderSelect` dropdown
3. Add to `ScheduleMeetingDialog`
4. Add to `PreJoinScreen`
5. Build folder management dialogs

### Phase 4: Past Meetings Refactor
1. Create `/dashboard/past-meetings` route
2. Build folder-based meeting list view
3. Implement folder filtering
4. Add bulk move functionality

### Phase 5: Integrations Page
1. Move `CalendarStatusCard` to `/dashboard/integrations`
2. Move `GmailStatusCard` to same page
3. Clean up dashboard home

---

## UI/UX Specifications

### Sidebar Behavior
- Default: Expanded (280px width)
- Collapsed: Icons only (64px width)
- Mobile: Hidden, opened via hamburger as sheet
- Persist state in localStorage

### Folder Colors (Optional)
```typescript
const FOLDER_COLORS = [
  { name: "Gray", value: "#6B7280" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F97316" },
  { name: "Green", value: "#22C55E" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#8B5CF6" },
];
```

### Meeting Card in Folder View
- Title, date, duration
- Participant count
- Quick stats (transcriptions, insights)
- Move to folder action
- Link to history view

### Empty States
- No folders (except General): "Create folders to organize your meetings"
- Empty folder: "No meetings in this folder yet"

---

## Type Definitions

```typescript
// types/folder.ts
interface Folder {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  orderIndex: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  meetingCount?: number; // Computed
}

// Extended meeting type
interface MeetingWithFolder extends Meeting {
  folderId: string | null;
  folder?: Folder | null;
}
```

---

## Testing Checklist

- [ ] Default folder auto-creation
- [ ] Folder CRUD operations
- [ ] Meeting assignment to folder
- [ ] Folder deletion (cascade to General)
- [ ] Sidebar navigation state persistence
- [ ] Mobile responsive behavior
- [ ] Folder filtering in past meetings
- [ ] FolderSelect in scheduling flow
- [ ] FolderSelect in PreJoin (instant meetings)

---

## Future Enhancements (Out of Scope)

- Folder sharing between team members
- Drag-drop meetings between folders
- Folder-level analytics
- Folder templates with default settings
- Nested folders (subfolders)
- Folder search/filter
