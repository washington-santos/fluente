-- Drop the overly permissive policy that allowed any authenticated user to list all audio
drop policy if exists "audio-replay: public read" on storage.objects;

-- Re-create scoped to caller's own folder
create policy "audio-replay: own files read"
  on storage.objects for select
  using (
    bucket_id = 'audio-replay'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
