-- Stored documents: only the person who uploaded a file, or a flat admin, may delete it.
--
-- The documents table already had that rule ("uploader or admin deletes documents"), but the
-- storage policy let any member delete any file in the flat's folder through the Storage API,
-- around the app. Found in the full test on 2026-11-21. Deleting a whole flat still works: only
-- an admin can do that, and the app removes the flat's files before calling delete_flat.
drop policy "flat members delete documents" on storage.objects;
create policy "uploader or admin deletes documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'flat-docs'
    and public.is_member_of_folder(name)
    and (owner_id = auth.uid()::text or public.is_flat_admin(split_part(name, '/', 1)::uuid))
  );
