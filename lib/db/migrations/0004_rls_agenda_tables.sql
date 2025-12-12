-- RLS Policies for Agenda Tables
--
-- ARCHITECTURE NOTE:
-- This project uses direct PostgreSQL connection via Drizzle ORM with a connection string.
-- Access control is currently enforced at the application level via validateRoomAccess().
--
-- These RLS policies are OPTIONAL and provide defense-in-depth IF the project migrates
-- to using Supabase client with JWT-based authentication in the future.
--
-- CURRENT STATE: NOT ENABLED
-- The policies below are commented out because:
-- 1. The app uses service role / direct connection (bypasses RLS anyway)
-- 2. auth.uid() requires Supabase GoTrue integration which isn't currently configured
-- 3. Application-level access control via validateRoomAccess() is the primary mechanism
--
-- TO ENABLE (if migrating to Supabase client with JWT):
-- 1. Uncomment the policies below
-- 2. Ensure Supabase GoTrue is configured and auth.uid() returns the user ID
-- 3. Update the agent to use service role credentials
-- 4. Test thoroughly before deploying

-- Enable RLS on agenda table (commented - see notes above)
-- ALTER TABLE "agenda" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on agenda_item table (commented - see notes above)
-- ALTER TABLE "agenda_item" ENABLE ROW LEVEL SECURITY;

/*
-- FUTURE: Uncomment these policies when migrating to Supabase client with JWT auth

-- Policy: Users can read agendas for rooms they have participated in
CREATE POLICY "agenda_select_policy" ON "agenda"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "room_participant"
      WHERE "room_participant"."room_id" = "agenda"."room_id"
      AND "room_participant"."user_id" = auth.uid()::text
    )
  );

-- Policy: Users can insert agendas for rooms they have participated in
CREATE POLICY "agenda_insert_policy" ON "agenda"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "room_participant"
      WHERE "room_participant"."room_id" = "agenda"."room_id"
      AND "room_participant"."user_id" = auth.uid()::text
    )
    AND "created_by" = auth.uid()::text
  );

-- Policy: Users can update draft agendas they created
CREATE POLICY "agenda_update_policy" ON "agenda"
  FOR UPDATE
  USING (
    "created_by" = auth.uid()::text
    AND "status" = 'draft'
  )
  WITH CHECK (
    "created_by" = auth.uid()::text
  );

-- Policy: Users can delete draft agendas they created
CREATE POLICY "agenda_delete_policy" ON "agenda"
  FOR DELETE
  USING (
    "created_by" = auth.uid()::text
    AND "status" = 'draft'
  );

-- Policy: Users can read agenda items for agendas in rooms they participated in
CREATE POLICY "agenda_item_select_policy" ON "agenda_item"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "agenda"
      JOIN "room_participant" ON "room_participant"."room_id" = "agenda"."room_id"
      WHERE "agenda"."id" = "agenda_item"."agenda_id"
      AND "room_participant"."user_id" = auth.uid()::text
    )
  );

-- Policy: Users can insert items into draft agendas they created
CREATE POLICY "agenda_item_insert_policy" ON "agenda_item"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "agenda"
      WHERE "agenda"."id" = "agenda_item"."agenda_id"
      AND "agenda"."created_by" = auth.uid()::text
      AND "agenda"."status" = 'draft'
    )
  );

-- Policy: Users can update items in draft agendas they created
CREATE POLICY "agenda_item_update_policy" ON "agenda_item"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "agenda"
      WHERE "agenda"."id" = "agenda_item"."agenda_id"
      AND "agenda"."created_by" = auth.uid()::text
      AND "agenda"."status" = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "agenda"
      WHERE "agenda"."id" = "agenda_item"."agenda_id"
      AND "agenda"."created_by" = auth.uid()::text
    )
  );

-- Policy: Users can delete items from draft agendas they created
CREATE POLICY "agenda_item_delete_policy" ON "agenda_item"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "agenda"
      WHERE "agenda"."id" = "agenda_item"."agenda_id"
      AND "agenda"."created_by" = auth.uid()::text
      AND "agenda"."status" = 'draft'
    )
  );
*/

-- Documentation comments
COMMENT ON TABLE "agenda" IS 'Meeting agenda. Access controlled via application-level validateRoomAccess().';
COMMENT ON TABLE "agenda_item" IS 'Agenda items. Access controlled via application-level validateRoomAccess().';
