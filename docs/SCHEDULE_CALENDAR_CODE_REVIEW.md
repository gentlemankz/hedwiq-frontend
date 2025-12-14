# Schedule-Calendar Branch Code Review

**Date**: December 15, 2025
**Branch**: `schedule-calendar`
**Reviewer**: Claude Code

---

## Executive Summary

This code review covers the Meeting Scheduling feature (Phase 1) implementation. The feature adds the ability to create instant and scheduled meetings with a calendar interface. Overall, the implementation is well-structured but has several issues that need to be addressed.

**Critical Issues**: 3
**Major Issues**: 8
**Minor Issues**: 12

---

## 1. Functionality Issues

### 1.1 Critical: Orphan Room Creation on API Failure
**File**: `dashboard-client.tsx:91-100`
**Severity**: Critical

```typescript
} catch (error) {
  console.error("Failed to create instant meeting:", error);
  // Fallback: navigate directly without creating a record
  const roomId = generateRoomId();
  router.push(`/meetings/${roomId}`);
}
```

**Problem**: If the API fails, a meeting room is created without a database record. This creates orphan rooms that can't be managed.

**Fix**: Show an error toast instead of silently creating an untracked room.

### 1.2 Major: Query Variable Reassignment
**File**: `lib/db/meeting.ts:184-230`

**Problem**: The `listMeetingsByHost` function reassigns the `query` variable multiple times, which creates confusion and the original query object is never used.

**Fix**: Use conditional query building pattern.

### 1.3 Minor: Past Date Validation Buffer
**File**: `lib/validation/meeting.ts:137-141`

```typescript
const now = new Date();
now.setMinutes(now.getMinutes() - 1);
if (date < now) {
  return { isValid: false, error: "scheduledAt cannot be in the past" };
}
```

**Problem**: 1-minute buffer is arbitrary and could allow meetings scheduled slightly in the past.

**Fix**: Increase buffer or remove it and handle on client side.

---

## 2. Security Issues

### 2.1 Critical: Non-Cryptographic Random for IDs
**File**: `lib/db/meeting.ts:27-28`

```typescript
const random = Math.random().toString(36).slice(2, 8);
return `mtg-${timestamp}-${random}`;
```

**Problem**: `Math.random()` is not cryptographically secure. Meeting IDs could be predictable, allowing enumeration attacks.

**Fix**: Use `crypto.randomUUID()` or `crypto.getRandomValues()`.

### 2.2 Critical: Broken RLS Policies
**File**: `lib/db/migrations/0006_add_meeting_table.sql:32-49`

```sql
USING (auth.uid()::text = host_id);
```

**Problem**: The RLS policies use Supabase's `auth.uid()` function, but the application uses Better Auth (not Supabase Auth). These policies will never match.

**Fix**: Either:
1. Remove RLS and rely on application-level authorization
2. Or use database roles properly with Better Auth

### 2.3 Major: Type Casting Before Validation
**File**: `app/api/meetings/route.ts:27`

```typescript
const status = searchParams.get("status") as "upcoming" | "past" | "all" | null;
```

**Problem**: Type assertion happens before validation, which could lead to runtime issues.

**Fix**: Validate first, then narrow the type.

### 2.4 Minor: Missing Rate Limiting
**File**: `app/api/meetings/route.ts`

**Problem**: No rate limiting on meeting creation endpoint - could be abused for spam.

**Fix**: Add rate limiting middleware.

---

## 3. Performance Issues

### 3.1 Major: Inefficient Query Building
**File**: `lib/db/meeting.ts:184-230`

**Problem**: Creating multiple query objects when only one is needed. The initial query is built but discarded.

### 3.2 Minor: Missing Composite Index
**File**: `lib/db/migrations/0006_add_meeting_table.sql`

**Problem**: Missing composite index for `(host_id, status)` which is used in `listMeetingsByHost`.

```sql
-- Missing:
CREATE INDEX IF NOT EXISTS "idx_meeting_host_status" ON "meeting"("host_id", "status");
```

### 3.3 Minor: Unnecessary Date Object Creation
**File**: `schedule-meeting-dialog.tsx:45-53`

```typescript
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  // Creates new Date() 48 times on module load
  const tempDate = setMinutes(setHours(new Date(), hour), minute);
});
```

**Fix**: Use static string formatting instead.

---

## 4. Code Duplication Issues

### 4.1 Major: Duplicate `generateRoomId` Function
**Files**:
- `dashboard-client.tsx:358-368`
- `lib/db/meeting.ts:34-44`

**Problem**: Same function implemented twice.

**Fix**: Export from `lib/db/meeting.ts` and import in dashboard-client.

### 4.2 Major: Duplicate `MeetingSettings` Interface
**Files**:
- `lib/db/schema.ts:205-210`
- `types/meeting.ts:35-39`

**Problem**: Same interface defined twice, creating maintenance burden.

**Fix**: Define once in `types/meeting.ts` and import in schema.

### 4.3 Minor: Repeated Authentication Pattern
**Files**: All API routes

**Problem**: Same auth check repeated in every handler.

**Fix**: Consider creating a middleware or utility function.

---

## 5. Resource Management / Memory Leaks

### 5.1 Minor: Timer Leak on Unmount
**File**: `meeting-card.tsx:102-106`

```typescript
await navigator.clipboard.writeText(meetingUrl);
setCopySuccess(true);
setTimeout(() => setCopySuccess(false), 2000);
```

**Problem**: If component unmounts before timeout fires, state update on unmounted component.

**Fix**: Clean up timeout on unmount or use `useCallback` with cleanup.

---

## 6. Architecture / SOLID Violations

### 6.1 Major: Single Responsibility Violation
**File**: `dashboard-client.tsx`

**Problem**: Component handles:
- User authentication display
- Sign out
- Instant meeting creation
- Scheduled meeting creation
- Meeting list display
- Multiple dialog states
- Form validation
- Navigation

**Fix**: Extract smaller components:
- `QuickActions` component
- `MeetingDialogs` component
- Custom hooks for meeting operations

### 6.2 Minor: Switch Statement for Extensibility
**File**: `meeting-card.tsx:77-93`

**Problem**: Status badge uses switch statement - adding new statuses requires modifying this code.

**Fix**: Use a configuration map instead.

---

## 7. Edge Cases / Testing Gaps

### 7.1 Race Condition: Double Click
**File**: `dashboard-client.tsx`

**Problem**: Clicking "instant meeting" twice quickly could create two meetings.

**Fix**: Disable button during creation (partially done but has gap).

### 7.2 Missing Timezone Validation
**File**: `lib/validation/meeting.ts`

**Problem**: No validation that timezone string is valid.

### 7.3 Concurrent Deletion
**Problem**: No handling for when meeting is deleted while another user is trying to join.

### 7.4 Unicode in Titles
**Problem**: No sanitization or validation for unicode/emoji in meeting titles.

---

## 8. Hidden Issues

### 8.1 Hydration Mismatch Risk
**File**: `meeting-card.tsx:57`

```typescript
const meetingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/meetings/${meeting.roomId}`;
```

**Problem**: Server renders empty string, client renders full URL - potential hydration mismatch.

**Fix**: Move URL generation to effect or use environment variable.

### 8.2 Silent Fetch Failures
**File**: `dashboard-client.tsx:153-162`

```typescript
const fetchMeetings = async () => {
  try {
    const response = await fetch("/api/meetings?status=upcoming&limit=10");
    // ...
  } catch (error) {
    console.error("Failed to fetch meetings:", error);
    // No user feedback!
  }
};
```

**Problem**: Fetch errors are logged but user sees no indication.

### 8.3 No Pagination UI
**Problem**: API supports pagination but UI only shows first 10 meetings.

---

## Recommendations

### Immediate Fixes Required:
1. Fix the broken RLS policies or remove them
2. Use cryptographically secure random for IDs
3. Remove orphan room creation fallback
4. Consolidate duplicate code

### Short-term Improvements:
1. Add rate limiting
2. Add loading/error states
3. Fix memory leaks
4. Add missing indexes

### Long-term Refactoring:
1. Extract reusable components from dashboard
2. Consider using Zod schemas consistently
3. Add comprehensive test coverage
4. Implement proper pagination UI

---

## Files Changed Summary

| File | Status | Issues |
|------|--------|--------|
| `lib/db/meeting.ts` | New | 3 |
| `lib/db/schema.ts` | Modified | 1 |
| `lib/validation/meeting.ts` | New | 2 |
| `types/meeting.ts` | New | 1 |
| `app/api/meetings/route.ts` | New | 2 |
| `app/api/meetings/[meetingId]/route.ts` | New | 0 |
| `app/dashboard/dashboard-client.tsx` | Modified | 4 |
| `app/dashboard/page.tsx` | Modified | 0 |
| `components/meetings/meeting-card.tsx` | New | 3 |
| `components/meetings/meeting-list.tsx` | New | 0 |
| `components/meetings/meeting-type-selector.tsx` | New | 0 |
| `components/meetings/schedule-meeting-dialog.tsx` | New | 1 |
| `lib/db/migrations/0006_add_meeting_table.sql` | New | 2 |

