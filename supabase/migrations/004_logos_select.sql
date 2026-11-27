-- DetailDesk 004 – logo studia: odczyt własnych plików w kubełku „logos”
-- Storage przy wgrywaniu (INSERT … RETURNING / upsert) wymaga reguły SELECT dla tego samego wiersza.
-- Publiczne wyświetlanie logo działa przez publiczny URL kubełka – ta reguła dotyczy tylko API Storage.
drop policy if exists logos_select on storage.objects;
create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_studio_id()::text);
