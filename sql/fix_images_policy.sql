-- Supabase → SQL Editor → вставить → Run.
-- Исправляет ошибку «permission denied for function is_admin» при просмотре фото гостями.
drop policy if exists read_approved on public.masonry_image;
drop policy if exists read_approved_or_admin on public.masonry_image;
-- гости видят картинки только одобренных кладок (is_admin() для anon недоступна, поэтому отдельная политика)
create policy read_approved on public.masonry_image for select to anon
  using (exists (select 1 from public.masonry m where m.id = masonry_id and m.status = 'approved'));
create policy read_approved_or_admin on public.masonry_image for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.masonry m where m.id = masonry_id and m.status = 'approved'));
