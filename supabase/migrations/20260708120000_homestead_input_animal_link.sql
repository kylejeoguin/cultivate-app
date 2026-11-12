-- Replace the fragile fuzzy input↔animal join in Homestead Intelligence with a real link.
--
-- Before: an input's cost was attributed to an animal only if homestead_inputs.category
-- (lowercased) happened to CONTAIN the animal-type's first word. Real data proves this
-- fails — livestock inputs are categorized "feed"/"supplies" (no animal name), so nothing
-- matched and the per-animal profit signal was dead.
--
-- Grain = animal_type (text), NOT animal_id: inputs are type-level (a bag of feed serves
-- the whole flock), which matches how livestock_logs.animal_type stores production.
-- NULL = unattributed, which stays a valid state — a generic cost still logs fine.

alter table public.homestead_inputs
  add column if not exists animal_type text;

comment on column public.homestead_inputs.animal_type is
  'For section=''livestock'' inputs: the animal type this cost is for (matches livestock_logs.animal_type). Powers per-animal cost/profit in Intelligence. NULL = unattributed.';

-- Best-effort backfill from the OLD fuzzy match so historical per-animal numbers don't
-- all read null on day one. Rows that didn't match under the fuzzy logic stay null —
-- they were already unattributed, so this is not a regression.
update public.homestead_inputs hi
set animal_type = m.animal_type
from (
  select distinct on (hi2.id) hi2.id, la.animal_type
  from public.homestead_inputs hi2
  join public.livestock_animals la on la.user_id = hi2.user_id
  where hi2.section = 'livestock'
    and hi2.animal_type is null
    and position(lower(split_part(la.animal_type, ' ', 1)) in lower(hi2.category)) > 0
) m
where hi.id = m.id;

-- Supports the new Intelligence join (Dim 2: index non-PK columns used in filters).
create index if not exists idx_homestead_inputs_user_animal_type
  on public.homestead_inputs (user_id, animal_type)
  where animal_type is not null;

-- RLS: homestead_inputs is already RLS-scoped by user_id. A new non-key column inherits
-- the existing policies and is not a new access surface. No policy change required.
