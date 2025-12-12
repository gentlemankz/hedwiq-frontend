# Agenda Builder Phase 1–2 Review (commit e9a0640)

Context: Agenda Builder implementation in PreJoin (Phase 2 of `docs/AGENDA_FEATURE_PLAN.md`). Scope includes new agenda-builder UI, join sequencing, and supporting tests.

## Key Findings

- **Inline edit skips validation for optional fields** – `app/meetings/[roomId]/components/agenda-builder/agenda-item.tsx:119-150` validates only the title and a narrow duration range. Description/presenter lengths are not checked, and out-of-range durations are silently dropped to `undefined`. Users can save values that will later be rejected by server validation during join, with no local feedback.  
  **Recommendation:** Reuse the shared agenda validation (`lib/validation/agenda.ts`) or mirror `AddTopicDialog` checks for description length, presenter length, and duration bounds, surfacing errors in the UI instead of discarding values.

- **Agenda metadata not propagated to meeting context** – `app/meetings/[roomId]/meeting-room.tsx:60-125` saves and publishes agendas but discards the returned agenda/agendaId, so nothing is passed into `MeetingLayout` for agent/agenda consumers. This deviates from the Phase 2 deliverable (“pass agendaId to meeting room”) and blocks upcoming progress UI/agent wiring.  
  **Recommendation:** Capture the agenda response from save/publish, persist `agendaId` (and version) alongside `userChoices`, and pass it through to meeting providers so the agent/progress UI can load the correct agenda instance.

- **Stale agenda edge case when joining with no items** – `app/meetings/[roomId]/meeting-room.tsx:60-99` skips both save and publish when the local agenda is empty. If the room already has a draft/active agenda, the old data remains and the user gets no signal that they are reusing stale topics.  
  **Recommendation:** On empty agendas, explicitly clear/abort any existing draft (or fetch and warn if an active agenda exists) so the join flow matches the user’s intent. At minimum, surface a warning that the prior agenda will stay in effect.

- **Validation logic duplicated and divergent** – Add vs. edit paths use separate ad-hoc validation (`add-topic-dialog.tsx` vs. `agenda-item.tsx`). The duplication already diverges (see first finding) and increases maintenance risk as limits evolve.  
  **Recommendation:** Centralize validation (shared hook or direct call to `validateAgendaItems`) so both creation and inline edit share identical rules and error messaging.

- **Testing gaps for critical flows** – `tests/components/agenda-builder/agenda-builder.test.tsx` covers CRUD UI but omits (1) drag-and-drop reordering behavior, and (2) join sequencing/order and error handling of agenda save/publish/token requests. These are the riskiest parts of Phase 2.  
  **Recommendation:** Add user-event based DnD tests (e.g., simulate pointer drag to assert `onChange` order) and a mocked fetch integration test for `handlePreJoinSubmit` verifying the call order (save → publish → token) and error surfacing for 4xx/409 cases.

## Additional Notes

- No memory-leak or obvious performance regressions observed; AbortController cleanup in `meeting-room.tsx` is solid.  
- UI/UX: Consider showing validation feedback instead of silently trimming/dropping invalid values to reduce user confusion.  
- Security: Requests rely on existing auth cookies; no new sensitive data paths introduced in this commit.

## Suggested Next Steps

1) Unify agenda validation for both add and edit flows and surface errors inline.  
2) Store agenda metadata from save/publish and plumb `agendaId` into meeting providers to align with the plan.  
3) Define behavior for “no agenda” joins when an old agenda exists (clear, confirm, or warn).  
4) Backfill tests for DnD reorder and join sequencing/error paths.
