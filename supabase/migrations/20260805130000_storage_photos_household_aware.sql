-- Make log-photos storage policies HOUSEHOLD-aware.  (RLS audit 2026-08-05, finding 3)
--
-- THE BUG: storage policies still used the PRE-JULY per-user model --
--     (auth.uid())::text = (storage.foldername(name))[1]
-- The July household migration (20260727210000) moved every TABLE to household ownership but
-- never touched storage. So an invited parent's client could not read images the other parent
-- uploaded -- the same one-directional sharing bug that was fixed for tables.
--
-- ⚠️ WHY NOBODY NOTICED: the bucket is currently `public = true`, so reads bypass RLS entirely
-- and succeed regardless. The bug is MASKED by a worse bug. Flipping the bucket to private
-- (the real fix for public child photos) would expose this instantly -- which is exactly why
-- this lands FIRST, before the bucket flip.
--
-- Uploads stay own-folder (you write under your own uid). Reads/updates/deletes resolve through
-- household_owner_of(), so both parents in a household see the same photos -- matching how every
-- table already behaves.
--
-- The uuid regex guard matters: (storage.foldername(name))[1]::uuid throws on any object whose
-- first path segment isn't a uuid, and a throwing policy fails the whole query rather than
-- filtering a row. Verified against all 15 live objects -- both folders are valid uuids.
--
-- DELETE/UPDATE policies are NEW. There were none, so a user could not remove their own photo
-- through the client at all (api/photo/route.ts works around it with the service-role client).
-- Apple 5.1.1(v) in-app account deletion requires storage objects to be removable, so this is a
-- native submission prerequisite as well as a correctness fix.

drop policy if exists "Users can read their own photos"   on storage.objects;
drop policy if exists "Users can upload their own photos" on storage.objects;

-- READ: anyone in the same household as the folder owner.
create policy "Household reads log photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.household_owner_of(((storage.foldername(name))[1])::uuid)
        = public.household_owner_of((select auth.uid()))
  );

-- WRITE: you upload into YOUR OWN folder, always. Keeps object paths attributable to the
-- actual uploader even though visibility is household-wide.
create policy "Users upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'log-photos'
    and ((select auth.uid()))::text = (storage.foldername(name))[1]
  );

create policy "Household updates log photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.household_owner_of(((storage.foldername(name))[1])::uuid)
        = public.household_owner_of((select auth.uid()))
  )
  with check (
    bucket_id = 'log-photos'
    and ((select auth.uid()))::text = (storage.foldername(name))[1]
  );

create policy "Household deletes log photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'log-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.household_owner_of(((storage.foldername(name))[1])::uuid)
        = public.household_owner_of((select auth.uid()))
  );

-- 🔴 NOT DONE HERE, ON PURPOSE: the bucket is still `public = true`, so child photos remain
-- fetchable with no auth. Flipping it breaks every render path, because all three upload sites
-- persist the absolute public URL into daily_log.photo_urls / yearbook_slots.photo_url /
-- photos.url. The flip must come AFTER render migrates to signed URLs. See the audit doc.
