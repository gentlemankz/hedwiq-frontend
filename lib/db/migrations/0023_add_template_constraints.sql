-- Migration: Add Missing Template Table Constraints
-- Purpose: Add CHECK constraints, UNIQUE constraints, and FK constraint for template tables
-- Created: Phase 1 fixes based on code review findings
--
-- This migration adds:
-- 1. CHECK constraints for enum-like text columns
-- 2. UNIQUE constraints on (template_id, order_index) for ordering
-- 3. FK constraint from meeting.template_id to meeting_template.id

-- ============================================================================
-- CHECK Constraints for meeting_template
-- ============================================================================

-- Ensure category is one of the valid values
ALTER TABLE "meeting_template"
ADD CONSTRAINT "meeting_template_category_check"
CHECK ("category" IN ('sync', 'tactical', 'strategic', 'one_on_one', 'workshop', 'decision'));

-- Ensure scope is one of the valid values
ALTER TABLE "meeting_template"
ADD CONSTRAINT "meeting_template_scope_check"
CHECK ("scope" IN ('system', 'team', 'personal'));

-- ============================================================================
-- CHECK Constraints for template_agenda_item
-- ============================================================================

-- Ensure presenter_role is valid (or NULL)
ALTER TABLE "template_agenda_item"
ADD CONSTRAINT "template_agenda_item_presenter_role_check"
CHECK ("presenter_role" IS NULL OR "presenter_role" IN ('host', 'participant', 'anyone'));

-- Ensure order_index is non-negative
ALTER TABLE "template_agenda_item"
ADD CONSTRAINT "template_agenda_item_order_index_check"
CHECK ("order_index" >= 0);

-- ============================================================================
-- CHECK Constraints for template_planning_question
-- ============================================================================

-- Ensure category is one of the valid values
ALTER TABLE "template_planning_question"
ADD CONSTRAINT "template_planning_question_category_check"
CHECK ("category" IN ('goal', 'attendees', 'preparation', 'outcome'));

-- Ensure order_index is non-negative
ALTER TABLE "template_planning_question"
ADD CONSTRAINT "template_planning_question_order_index_check"
CHECK ("order_index" >= 0);

-- ============================================================================
-- UNIQUE Constraints for ordering
-- ============================================================================

-- Ensure no duplicate order_index within the same template for agenda items
ALTER TABLE "template_agenda_item"
ADD CONSTRAINT "template_agenda_item_template_order_unique"
UNIQUE ("template_id", "order_index");

-- Ensure no duplicate order_index within the same template for planning questions
ALTER TABLE "template_planning_question"
ADD CONSTRAINT "template_planning_question_template_order_unique"
UNIQUE ("template_id", "order_index");

-- ============================================================================
-- Foreign Key Constraint for meeting.template_id
-- ============================================================================

-- Add FK constraint from meeting.template_id to meeting_template.id
-- SET NULL on delete to preserve meeting history even if template is deleted
ALTER TABLE "meeting"
ADD CONSTRAINT "meeting_template_id_fk"
FOREIGN KEY ("template_id")
REFERENCES "meeting_template"("id")
ON DELETE SET NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON CONSTRAINT "meeting_template_category_check" ON "meeting_template" IS 'Ensures category is one of: sync, tactical, strategic, one_on_one, workshop, decision';
COMMENT ON CONSTRAINT "meeting_template_scope_check" ON "meeting_template" IS 'Ensures scope is one of: system, team, personal';
COMMENT ON CONSTRAINT "template_agenda_item_presenter_role_check" ON "template_agenda_item" IS 'Ensures presenter_role is one of: host, participant, anyone (or NULL)';
COMMENT ON CONSTRAINT "template_agenda_item_order_index_check" ON "template_agenda_item" IS 'Ensures order_index is non-negative';
COMMENT ON CONSTRAINT "template_planning_question_category_check" ON "template_planning_question" IS 'Ensures category is one of: goal, attendees, preparation, outcome';
COMMENT ON CONSTRAINT "template_planning_question_order_index_check" ON "template_planning_question" IS 'Ensures order_index is non-negative';
COMMENT ON CONSTRAINT "template_agenda_item_template_order_unique" ON "template_agenda_item" IS 'Ensures no duplicate order_index within the same template';
COMMENT ON CONSTRAINT "template_planning_question_template_order_unique" ON "template_planning_question" IS 'Ensures no duplicate order_index within the same template';
COMMENT ON CONSTRAINT "meeting_template_id_fk" ON "meeting" IS 'Links meeting to its source template (if any)';
