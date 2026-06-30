-- Create public audio-replay bucket for TTS audio storage
insert into storage.buckets (id, name, public)
values ('audio-replay', 'audio-replay', true)
on conflict (id) do nothing;

-- Public read policy — anyone with the URL can stream the audio
create policy "audio-replay: public read"
  on storage.objects for select
  using (bucket_id = 'audio-replay');
