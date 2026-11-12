-- Private `worksheets` bucket for the printable library.
--
-- Deliberately NOT public, and deliberately WITHOUT any storage.objects policy.
--
-- `log-photos` is public because a photo URL is already a per-user secret path. The worksheet
-- packs are the opposite: the homestead-art activity sheets are the paid differentiator, so a
-- public bucket would turn them into a free CDN — the URL is guessable and login wouldn't even
-- be required. No policy means no anon or authenticated role can read or write here at all.
--
-- The ONLY reader is `/api/resources/[id]/download`, which authorizes the user against
-- getAccessInfo() and then mints a 60-second signed URL with the service role. The route is
-- the gate; the absence of a policy is the backstop. (BUILD-BIBLE Dim 2.)
--
-- Both existing storage policies ("Users can read/upload their own photos") are scoped to
-- bucket_id = 'log-photos' in USING and WITH CHECK, so neither leaks into this bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('worksheets', 'worksheets', false, 52428800, ARRAY['application/pdf', 'application/zip'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
