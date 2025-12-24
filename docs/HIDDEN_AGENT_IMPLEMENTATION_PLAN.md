# Hidden Agent Implementation Plan

## Executive Summary

Make the Hedwiq AI agent invisible to meeting participants while maintaining full functionality. This enables a "bot-free" user experience while secretly providing AI-powered transcription, insights, agenda tracking, and real-time actions.

---

## Project Analysis

### Current Architecture

| Component | Location | Current Behavior |
|-----------|----------|------------------|
| Agent Server | `agent/hedwiq_agent.py:443-451` | Uses `WorkerOptions` API (legacy) |
| Agent Identity | `agent/hedwiq_agent.py:436-440` | Visible as "Hedwiq Agent" |
| Late Joiner Sync | `frontend/contexts/agenda/use-agenda-late-joiner-sync.ts` | Reads from `remoteParticipants` |
| Agenda Attributes | `agent/agenda_tracker.py:1023-1064` | Sets `participant.set_attributes()` |
| Video Grid | `frontend/components/participant/custom-video-conference.tsx:120-126` | No agent filtering |

### Why Current Approach Fails

1. **Agent appears in participant list** - Users see "Hedwiq Agent" joined the meeting
2. **Agent visible in video grid** - Placeholder tile shown for agent
3. **Identity exposed in events** - Text streams reveal agent identity

---

## Solution: LiveKit Hidden Participants

LiveKit natively supports hidden participants via `AgentServerPermissions(hidden=True)`:

> "A participant is hidden if their participant permissions has `hidden` set to `true`. A hidden participant is not visible to other participants in the room."
> — LiveKit Documentation

### Key Capabilities When Hidden

| Capability | Available | Notes |
|------------|-----------|-------|
| Subscribe to audio | Yes | `can_subscribe=True` |
| Publish data streams | Yes | `can_publish_data=True` |
| Publish video/audio tracks | No | Hidden agents can't publish tracks |
| Visible in participant list | No | Primary goal achieved |
| Set participant attributes | Maybe | May fail silently |

---

## Implementation Steps

### Step 1: Migrate to AgentServer API

**File:** `agent/hedwiq_agent.py`

**Current:** Uses `WorkerOptions` (legacy API)
**Target:** Use `AgentServer` with `hidden=True` permission

**Changes Required:**
1. Import `AgentServer`, `AgentServerPermissions` from `livekit.agents`
2. Create server instance with permissions config
3. Use `@server.rtc_session()` decorator pattern
4. Remove visible agent name

**Key Configuration:**
- `can_publish=False` — No video/audio tracks needed
- `can_subscribe=True` — Subscribe to participant audio for transcription
- `can_publish_data=True` — Publish text streams (transcription, insights, etc.)
- `hidden=True` — **INVISIBLE to other participants**

### Step 2: Graceful Attribute Handling

**File:** `agent/agenda_tracker.py`

Hidden participants may not be able to set attributes. The `_update_participant_attributes()` method (lines 1023-1064) needs defensive handling.

**Changes Required:**
1. Wrap attribute updates in try/catch
2. Log warning on failure (not error)
3. Continue operation regardless of attribute success

**Rationale:** Late joiner sync now uses API fetch, so attributes are a nice-to-have fallback, not critical path.

### Step 3: Simplify Late Joiner Sync

**File:** `frontend/contexts/agenda/use-agenda-late-joiner-sync.ts`

This hook searches `remoteParticipants` for the agent — which won't exist when hidden.

**Changes Required:**
1. Remove participant search logic
2. Keep hook as no-op placeholder
3. Add comment explaining API-based sync

**Rationale:** Late joiners already fetch agenda state via API (`use-agenda-api.ts`). Real-time updates come via LiveKit text streams which work regardless of agent visibility.

### Step 4: Frontend Safety Filter

**File:** `frontend/components/participant/custom-video-conference.tsx`

Defense in depth — even if hidden flag fails, filter agent from video grid.

**Changes Required:**
1. Import `AGENT_IDENTITY_PREFIX` from constants
2. Filter tracks by participant identity before rendering
3. Exclude any identity starting with "hedwiq"

**Filter Logic:** `!track.participant.identity.toLowerCase().startsWith("hedwiq")`

---

## Risk Analysis

### Risk 1: Data Publishing May Break

**Concern:** Hidden agents might not be able to publish data streams.

**Mitigation:** LiveKit documentation confirms `can_publish_data=True` works independently of `hidden`. Text streams use `send_text()`, not track publishing.

**Verification:** Test all stream topics:
- `lk.transcription`
- `hedwiq.insight`
- `hedwiq.document_reference`
- `hedwiq.agenda`
- `hedwiq.action`
- `hedwiq.email_draft`

### Risk 2: Late Joiner Sync Regression

**Concern:** Late joiners might not receive current agenda state.

**Mitigation:** API-based sync already implemented in `use-agenda-api.ts`. This is the primary sync mechanism; participant attributes were a redundant fallback.

**Verification:** Test late joiner flow:
1. Start meeting, advance agenda
2. New participant joins
3. Verify correct agenda state shown

### Risk 3: Attribute Updates Fail

**Concern:** `set_attributes()` may fail for hidden participants.

**Mitigation:**
1. Not on critical path (API sync handles this)
2. Wrapped in try/catch with graceful degradation
3. Logged as warning for debugging

### Risk 4: Frontend Still Shows Agent

**Concern:** Edge case where hidden flag doesn't work.

**Mitigation:** Frontend filter provides defense in depth. Even if agent somehow becomes visible at LiveKit level, it's filtered from rendering.

---

## Testing Checklist

### Visibility Tests
- [ ] Agent does NOT appear in participant list
- [ ] Agent does NOT appear in video grid
- [ ] Agent does NOT appear in `room.remoteParticipants`
- [ ] No "Hedwiq Agent" name visible anywhere in UI
- [ ] Chat does not show agent messages

### Functionality Tests
- [ ] Transcription streams received correctly
- [ ] Insights streams received correctly
- [ ] Agenda events received correctly
- [ ] Document reference events received correctly
- [ ] Action classification events received correctly
- [ ] Email draft events received correctly

### Late Joiner Tests
- [ ] New participants fetch agenda state from API
- [ ] Real-time updates (LiveKit streams) work for late joiners
- [ ] No console errors about missing agent participant

### Error Handling Tests
- [ ] Graceful degradation if attribute updates fail
- [ ] No console errors about hidden agent
- [ ] Meeting works even if agent connection issues

---

## Files to Modify

| File | Scope | Change |
|------|-------|--------|
| `agent/hedwiq_agent.py` | Major | Migrate to `AgentServer` with `hidden=True` |
| `agent/agenda_tracker.py` | Minor | Add try/catch around attribute updates |
| `frontend/contexts/agenda/use-agenda-late-joiner-sync.ts` | Minor | Simplify to no-op |
| `frontend/components/participant/custom-video-conference.tsx` | Minor | Add safety filter |

---

## Success Criteria

1. **Invisibility:** Agent is completely invisible to users
2. **Functionality:** All AI features continue working (transcription, insights, agenda, actions, drafts)
3. **Sync:** Late joiners get current state via API
4. **Real-time:** LiveKit stream updates work for all participants
5. **Stability:** No console errors or warnings
6. **UX:** Users experience a "bot-free" meeting

---

## Rollback Plan

If hidden agent causes issues:

1. Revert to `WorkerOptions` API (remove `AgentServer`)
2. Remove `hidden=True` permission
3. Keep frontend filter as cosmetic layer
4. Document as "coming soon" feature

---

## Future Considerations

1. **Participant Count:** Hidden agents don't count toward participant limits
2. **Analytics:** May need separate tracking for agent presence
3. **Debugging:** Add admin-only flag to reveal agent for debugging
4. **Multi-Agent:** If adding more agents, ensure all use hidden permission
