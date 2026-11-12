-- Let yearbook photo overrides (editable tiles) work for CUSTOM-RANGE books, not just
-- school-year books.
--
-- Slots were keyed to school_year_id (a FK), so a custom range — which has no school_years
-- row — couldn't attach overrides, making custom-range books read-only. Introduce a `scope`
-- string that identifies the book a slot belongs to: the school_year_id for a year book, or
-- "range:<start>:<end>" for a custom range. Uniqueness moves to (user_id, scope, slot_key),
-- a plain (non-partial) constraint so PostgREST upserts target it reliably. school_year_id
-- stays (nullable) for year books — for FK cascade + reference — and is null for range rows.
alter table public.yearbook_slots add column if not exists scope text;

-- Backfill existing rows (all had a school_year_id) so scope is populated before NOT NULL.
update public.yearbook_slots set scope = school_year_id::text where scope is null;

alter table public.yearbook_slots alter column school_year_id drop not null;

alter table public.yearbook_slots drop constraint if exists yearbook_slots_user_id_school_year_id_slot_key_key;
alter table public.yearbook_slots add constraint yearbook_slots_user_scope_slot_key_key unique (user_id, scope, slot_key);

alter table public.yearbook_slots alter column scope set not null;
