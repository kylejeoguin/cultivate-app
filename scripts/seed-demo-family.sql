-- ============================================================================
-- DEMO FAMILY seeder — Cultivate
-- ----------------------------------------------------------------------------
-- Seeds ONE believable homeschool family with a year of records, for SCREENSHOTS
-- and product demos. This is deliberately NOT the QA fixture.
--
-- WHY A SECOND FIXTURE EXISTS (Kyle, 2026-08/09):
--   The QA fixture (`seed-qa-fixture-fullyear.sql`) is right for TESTS and wrong for
--   pictures. It has six children named one-per-state ("Mateo (MO test)", "Priya (PA
--   test)") because it exists to exercise six states' compliance rules at once. And its
--   daily entries come from `CASE extract(dow FROM d)` over five fixed strings, so every
--   Monday of the year reads the identical sentence — roughly 104 identical Mondays.
--   Nobody's real family looks like that, and homeschool parents are the least
--   fool-able audience for a fake homeschool record.
--
-- WHAT THIS ONE DOES DIFFERENTLY — the three things that make records look real:
--   1. VARIETY. Entries are drawn from large phrasing pools indexed by day-of-year, so
--      no two weeks read alike and no sentence repeats on a schedule.
--   2. SEASON. The year has a shape: seed starting and planting in spring, the harvest
--      and canning push in July/August, school-heavy stretches in winter. The QA fixture
--      is flat across all twelve months.
--   3. GAPS. Real logs have holes — a sick week, Thanksgiving, the week the well pump
--      broke. A perfect unbroken grid is the single clearest tell that data is fake.
--
-- HOURS: aimed to land NEAR Missouri's 1,000 / 600 core / 400-at-home, not exactly on
-- it. Suspiciously exact totals read as invented.
--
-- ⚠️ EVERY SCREENSHOT TAKEN FROM THIS ACCOUNT MUST BE LABELLED AS EXAMPLE DATA.
--    Invented records presented as a real customer's are not something we ship.
--
-- USAGE: the account must already exist with two children and a subject list.
--   v_email : the demo account
--   v_year  : calendar year to simulate
-- Idempotent — every insert is NOT EXISTS-guarded.
--
-- Conventions (wrong case silently breaks the Intelligence filters — see the QA seeder):
--   garden_entries.status = planned|planted|growing|harvested|failed
--   preservation_logs.method = canning|freezing|dehydrating|fermenting
--   livestock_logs.disposition = personal|sold|mixed
--   attendance.status = present|absent|excused
--   equipment_maintenance.equipment_category = home|homestead
-- ============================================================================

DO $$
DECLARE
  v_email text := 'demo-family@cultivate.test';
  v_year  int  := 2026;
  v_uid   uuid;
  v_start date;
  v_end   date;
  sy_id   uuid;
  c       record;
  d       date;
  idx     int;
  n_hours numeric;
  is_gap  boolean;
  subj_ids uuid[];
  pick    uuid[];
  child_n int := 0;

  -- Winter/early-spring: bookwork-heavy. 14 phrasings, so a fortnight never repeats.
  book_days text[] := ARRAY[
    'Long division most of the morning, then read two chapters of Farmer Boy out loud',
    'Fractions with the measuring cups while we doubled a bread recipe',
    'Spelling list, then she wrote a letter to her grandmother and addressed it herself',
    'Read about the Oregon Trail and traced the route on the big map',
    'Multiplication drills, then a chapter on the water cycle',
    'Handwriting practice and a read-aloud about the Wright brothers',
    'Worked through a whole unit on fractions — she finally got it today',
    'History: the Civil War, and why Missouri was split about it',
    'Science reading on weather fronts, then we watched the storm come in',
    'Math facts in the morning, spelling in the afternoon, nobody cried',
    'Read a biography of George Washington Carver and talked about peanuts for an hour',
    'Geometry with the tape measure — perimeter of every room in the house',
    'Copywork and a narration about the book she has been reading on her own',
    'Rounding and estimating, using the grocery receipt from Saturday'
  ];

  -- Spring: dirt, seeds, animals waking up.
  spring_days text[] := ARRAY[
    'Started tomato and pepper seeds in the south window — she labeled every cell',
    'Measured and staked out the new bed, 4 by 12, and figured the square footage',
    'Turned the compost and talked about what makes it heat up',
    'Planted the first row of peas. Cold hands, good morning',
    'Counted and candled eggs, then math on how many dozen that is in a month',
    'Pruned the peach tree and read about why you cut where you cut',
    'Soil test on the new bed — pH came back low, so we read about lime',
    'Transplanted the tomatoes out. Lost two to the wind, replanted them',
    'Watched the swallows come back and looked them up in the bird book',
    'Rain all day, so we did map work and a chapter on erosion instead',
    'Hauled and spread mulch. Everyone was filthy. Counted as PE',
    'Figured seed spacing for the whole bed on paper before we planted anything'
  ];

  -- Summer: harvest, heat, projects.
  summer_days text[] := ARRAY[
    'Picked 8 lbs of tomatoes and weighed every basket to track the yield',
    'Beans, beans, beans. She snapped a whole bowl while I read to her',
    'Fixed the mower deck together — she held the light and handed me wrenches',
    'Cucumbers coming in faster than we can eat them. Talked about pickling',
    'Weeded the whole east bed in the cool of the morning, then read inside',
    'Egg count is up to 9 a day. Charted it for the month',
    'Helped me replace the hydrant. She figured out why it kept leaking before I did',
    'Squash bugs. Read about them, then went out and dealt with them',
    'Measured rainfall for the week and compared it to last month',
    'Canning day prep — washed and sorted everything, counted jars',
    'Built the trellis for the pole beans. Math on how tall to make it',
    'Read on the porch through the hot part of the day, worked in the evening'
  ];

  -- Fall: putting up, wrapping up, back to books.
  fall_days text[] := ARRAY[
    'Canned six pints of salsa and talked about why the vinegar matters',
    'Dehydrated apples all afternoon, wrote down the weight before and after',
    'Pulled the last of the peppers and started cleaning out the beds',
    'Split and stacked wood. She counted the ricks and figured what we still need',
    'Back to bookwork mornings now that the garden is slowing down',
    'Made apple butter. Chemistry lesson without calling it one',
    'Cleaned the coop and put down fresh bedding before the cold',
    'Inventoried the pantry shelf — counted every jar and wrote up the list',
    'Read about first frost dates and we guessed ours. She was closer than me',
    'Winterized the hose bibs together and talked about why water expands',
    'History all morning, then helped me change the oil in the tractor',
    'Wrote up what we grew this year and what we would do differently'
  ];
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'User % not found — create it first, then re-run. Aborting.', v_email;
    RETURN;
  END IF;

  v_start := make_date(v_year, 1, 12);
  -- Stop at TODAY. A demo family with entries dated in the future is the loudest tell of
  -- all, and it also made the attendance pace read 129% of year-to-date.
  v_end   := least(current_date, make_date(v_year, 12, 11));

  IF NOT EXISTS (SELECT 1 FROM school_years WHERE user_id = v_uid AND is_active) THEN
    RAISE NOTICE 'No active school year for % — create one per child first. Aborting.', v_email;
    RETURN;
  END IF;

  FOR c IN SELECT id, name FROM children WHERE user_id = v_uid ORDER BY created_at LOOP
    child_n := child_n + 1;
    -- school_years and subjects are PER CHILD, not per household. Picking one row for the whole
    -- family would file both children's days under one child's year.
    SELECT id INTO sy_id FROM school_years
      WHERE user_id = v_uid AND child_id = c.id AND is_active LIMIT 1;
    CONTINUE WHEN sy_id IS NULL;

    -- This child's subject ids, ordered, so entries can carry real subject coverage. Without
    -- this the reports render with zero coverage, which is exactly what makes a demo look fake.
    SELECT array_agg(id ORDER BY name) INTO subj_ids
      FROM subjects WHERE user_id = v_uid AND child_id = c.id AND is_active;

    d := v_start;
    WHILE d <= v_end LOOP
      -- Weekends off.
      IF extract(dow FROM d)::int BETWEEN 1 AND 5 THEN

        -- THE GAPS. A real year has holes, and their absence is the giveaway:
        --   • a stomach-bug week in February
        --   • the week of Thanksgiving
        --   • the week in June the well pump went out
        --   • a scattering of single days, because life
        -- Household-wide breaks are shared (Thanksgiving; the week the well pump went out).
        -- Sick days are NOT — siblings do not fall ill on identical dates, and identical gaps
        -- across children is its own tell.
        is_gap :=
             (d BETWEEN make_date(v_year,11,23) AND make_date(v_year,11,27))
          OR (d BETWEEN make_date(v_year,6,15) AND make_date(v_year,6,19))
          OR (child_n = 1 AND d BETWEEN make_date(v_year,2,16) AND make_date(v_year,2,20))
          OR (child_n = 2 AND d BETWEEN make_date(v_year,3,9)  AND make_date(v_year,3,12))
          OR ((extract(doy FROM d)::int + child_n * 5) % 23 = 0);

        IF NOT is_gap THEN
          -- Pseudo-random but deterministic: a prime stride over day-of-year, offset per
          -- child, so siblings do not log identical sentences on the same day.
          -- Offset by child ORDINAL, never by name length: the first run used length(c.name)
          -- and both children happened to be four letters, so Emma and Ruth got byte-identical
          -- years — same 214 days, same 765.8 hours, same sentence every single day.
          idx := extract(doy FROM d)::int * 7 + child_n * 11;

          -- Hours vary the way real days do: 2.5–5.0, longer in winter, shorter in summer
          -- when the work moves outside.
          -- Tuned so the year lands JUST OVER Missouri's 1,000 (measured: 1,013.8 and 1,008.5
          -- for the two children) rather than short of it. The first pass averaged 3.58 h/day
          -- and totalled 766 — which would have rendered as failing compliance.
          n_hours := CASE
            WHEN extract(month FROM d)::int IN (6,7,8) THEN 3.5 + ((idx % 4) * 0.25)
            WHEN extract(month FROM d)::int IN (1,2,11,12) THEN 5.0 + ((idx % 3) * 0.5)
            ELSE 4.25 + ((idx % 5) * 0.25)
          END;

          -- Two or three subjects per day, rotating deterministically so coverage builds up
          -- across the whole list over the year instead of hammering the same two.
          pick := ARRAY[
            subj_ids[1 + (idx % array_length(subj_ids,1))],
            subj_ids[1 + ((idx + 3) % array_length(subj_ids,1))]
          ];
          IF idx % 3 = 0 THEN
            pick := pick || subj_ids[1 + ((idx + 5) % array_length(subj_ids,1))];
          END IF;

          INSERT INTO daily_log (user_id, child_id, school_year_id, log_date, notes, hours, subject_ids, is_homestead_day)
          SELECT v_uid, c.id, sy_id, d,
            CASE
              WHEN extract(month FROM d)::int IN (3,4,5)  THEN spring_days[1 + (idx % array_length(spring_days,1))]
              WHEN extract(month FROM d)::int IN (6,7,8)  THEN summer_days[1 + (idx % array_length(summer_days,1))]
              WHEN extract(month FROM d)::int IN (9,10)   THEN fall_days[1 + (idx % array_length(fall_days,1))]
              ELSE book_days[1 + (idx % array_length(book_days,1))]
            END,
            n_hours,
            pick,
            extract(month FROM d)::int BETWEEN 3 AND 10
          WHERE NOT EXISTS (
            SELECT 1 FROM daily_log
            WHERE user_id = v_uid AND child_id = c.id AND log_date = d
          );

          INSERT INTO attendance (user_id, child_id, school_year_id, attendance_date, status, notes)
          SELECT v_uid, c.id, sy_id, d, 'present', NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM attendance
            WHERE user_id = v_uid AND child_id = c.id AND attendance_date = d
          );
        END IF;
      END IF;
      d := d + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo family seeded for % (%): varied entries, seasonal shape, real gaps.', v_email, v_year;
END $$;

-- ============================================================================
-- PASS 2 — derive each entry's subjects FROM ITS TEXT.
--
-- WHY THIS IS SEPARATE: pass 1 assigned subjects by rotating through the child's list, which
-- gives correct-looking AGGREGATES but produces entries like "History all morning, then helped
-- me change the oil in the tractor" tagged Mathematics, Science. That is invisible in a report
-- and is the first thing a reader notices on a log card — and log cards are the screenshot that
-- actually sells the product. Homeschool parents will read these.
--
-- Fallback is Life Skills, not Reading: an unmatched entry here is almost always garden, animal
-- or repair work. An earlier version fell back to Reading and filed "Transplanted the tomatoes
-- out" under it.
-- ============================================================================
DO $$
DECLARE
  v_uid uuid; r record; ids uuid[]; nm text;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email='demo-family@cultivate.test';
  IF v_uid IS NULL THEN RETURN; END IF;

  FOR r IN SELECT dl.id, dl.child_id, lower(dl.notes) AS t FROM daily_log dl WHERE dl.user_id=v_uid LOOP
    ids := ARRAY[]::uuid[];
    FOREACH nm IN ARRAY ARRAY['Mathematics','Reading','Language Arts','Science','Social Studies','Life Skills','Fine Arts','Physical Education'] LOOP
      IF (nm = 'Mathematics'        AND (r.t ~ 'division|fraction|multiplication|math|measured|figured|square footage|counted|weighed|perimeter|geometry|rounding|estimating|spacing|charted|how tall|cost per|how many dozen'))
      OR (nm = 'Reading'            AND (r.t ~ 'read |read-aloud|reading|book|biography|chapter|narration'))
      OR (nm = 'Language Arts'      AND (r.t ~ 'spelling|wrote|writing|letter|copywork|handwriting|narration'))
      OR (nm = 'Science'            AND (r.t ~ 'science|water cycle|weather|soil|ph came|compost|erosion|germinat|frost|chemistry|water expands|fermentation|rainfall|squash bugs|candled|swallows|bird book'))
      OR (nm = 'Social Studies'     AND (r.t ~ 'history|civil war|oregon trail|missouri was split|carver|wright brothers|map work|the big map'))
      OR (nm = 'Life Skills'        AND (r.t ~ 'canned|canning|bread|apple butter|dehydrated|pantry|jars|snapped|pickling|coop|eggs|inventoried|salsa|tomato|pepper|peas|planted|transplant|seeds|garden|beds|picked|harvest|cucumber|trellis|hydrant|mower|oil in the tractor|winterized|hose bibs'))
      OR (nm = 'Fine Arts'          AND (r.t ~ 'drawing|design|photograph|art project'))
      OR (nm = 'Physical Education' AND (r.t ~ 'hauled|stacked|weeded|mulch|counted as pe'))
      THEN
        ids := ids || (SELECT s.id FROM subjects s WHERE s.user_id=v_uid AND s.child_id=r.child_id AND s.name=nm AND s.is_active LIMIT 1);
      END IF;
    END LOOP;
    IF array_length(ids,1) IS NULL THEN
      ids := ARRAY[(SELECT s.id FROM subjects s WHERE s.user_id=v_uid AND s.child_id=r.child_id AND s.name='Life Skills' LIMIT 1)];
    END IF;
    UPDATE daily_log SET subject_ids = ids WHERE id = r.id;
  END LOOP;
END $$;
