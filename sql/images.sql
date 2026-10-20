-- Фото кладки и схемы испытаний. Картинки сжимаются в браузере (до ~1600 px, JPEG)
-- и лежат в таблице как data-URL; писать в неё можно только через submit_experiment.
create table if not exists public.masonry_image (
  id          serial primary key,
  masonry_id  int  not null references public.masonry(id) on delete cascade,
  kind        text not null check (kind in ('masonry','scheme')),
  filename    text,
  data        text not null check (length(data) <= 900000 and data like 'data:image/%'),
  created_at  timestamptz not null default now()
);
create index if not exists masonry_image_masonry_idx on public.masonry_image(masonry_id);

alter table public.masonry_image enable row level security;
drop policy if exists read_approved on public.masonry_image;
create policy read_approved on public.masonry_image for select to anon, authenticated
  using (public.is_admin() or exists (
    select 1 from public.masonry m where m.id = masonry_id and m.status = 'approved'));
revoke insert, update, delete on public.masonry_image from anon, authenticated;

create or replace function public._ins_images(mid int, imgs jsonb) returns void
language plpgsql set search_path = public as $$
declare i jsonb; n int := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(imgs,'[]'::jsonb)) loop
    n := n + 1;
    if n > 20 then raise exception 'Слишком много изображений (максимум 20 на кладку)'; end if;
    if i->>'kind' not in ('masonry','scheme') then raise exception 'Неизвестный тип изображения'; end if;
    insert into masonry_image(masonry_id, kind, filename, data)
    values (mid, i->>'kind', left(i->>'filename', 200), i->>'data');
  end loop;
end $$;
revoke all on function public._ins_images(int,jsonb) from public, anon, authenticated;

create or replace function public.submit_experiment(payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare p jsonb := payload->'paper'; b jsonb; m jsonb; w jsonb; pid int; rid int;
        bids jsonb := '{}'; mids jsonb := '{}'; wids int[] := '{}'; bi int; mi int;
begin
  if coalesce(trim(p->>'title'),'')='' then raise exception 'Не указано название статьи'; end if;
  if coalesce((p->>'year')::int,0)<=0 then raise exception 'Не указан год публикации'; end if;
  if jsonb_array_length(coalesce(payload->'masonries','[]'::jsonb))=0 then raise exception 'В заявке нет ни одной кладки'; end if;

  insert into paper(title,authors,year,doi,journal,bib_filename,bib_content,status)
  values (p->>'title',p->>'authors',(p->>'year')::int,p->>'doi',p->>'journal',p->>'bib_filename',coalesce(p->>'bib_content',''),'pending')
  returning paper.id into pid;

  for b in select * from jsonb_array_elements(coalesce(payload->'bricks','[]'::jsonb)) loop
    insert into brick(type_id,density,voidness,specific_perimeter)
    values ((b->>'type_id')::int,(b->>'density')::int,(b->>'voidness')::int,(b->>'specific_perimeter')::float8)
    returning brick.id into rid;
    bids := bids || jsonb_build_object(b->>'key', rid);
    perform public._ins_tests('brick', rid, b->'tests');
  end loop;

  for m in select * from jsonb_array_elements(coalesce(payload->'mortars','[]'::jsonb)) loop
    insert into mortar(density,elastic_modulus,strain_ult,stress_ult)
    values ((m->>'density')::int,(m->>'elastic_modulus')::int,(m->>'strain_ult')::float8,(m->>'stress_ult')::float8)
    returning mortar.id into rid;
    mids := mids || jsonb_build_object(m->>'key', rid);
    perform public._ins_tests('mortar', rid, m->'tests');
  end loop;

  for w in select * from jsonb_array_elements(payload->'masonries') loop
    bi := (bids->>(w->>'brick_key'))::int; mi := (mids->>(w->>'mortar_key'))::int;
    if bi is null or mi is null then raise exception 'Кладка ссылается на несуществующий кирпич или раствор'; end if;
    insert into masonry(type_id,brick_id,mortar_id,mortar_thickness,paper_id,status)
    values ((w->>'type_id')::int,bi,mi,(w->>'mortar_thickness')::int,pid,'pending')
    returning masonry.id into rid;
    wids := wids || rid;
    perform public._ins_tests('masonry', rid, w->'tests');
    perform public._ins_images(rid, w->'images');
  end loop;
  return jsonb_build_object('paper_id',pid,'masonry_ids',to_jsonb(wids));
end $$;

-- admin_review: + reopen и удаление заявки вместе с картинками и «осиротевшими» кирпичом/раствором/статьёй
create or replace function public.admin_review(mid int, act text, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pid int; bid int; mrid int;
begin
  if not public.is_admin() then raise exception 'Нужно войти как администратор'; end if;
  select paper_id, brick_id, mortar_id into pid, bid, mrid from masonry where id = mid;
  if not found then raise exception 'Заявка не найдена'; end if;
  if act = 'approve' then
    update masonry set status='approved', reviewed_at=now(), note=null where id = mid;
    update paper   set status='approved', reviewed_at=now(), note=null where id = pid;
  elsif act = 'reject' then
    update masonry set status='rejected', reviewed_at=now(), note=admin_review.note where id = mid;
    update paper   set status='rejected', reviewed_at=now(), note=admin_review.note where id = pid;
  elsif act = 'reopen' then
    update masonry set status='pending', reviewed_at=null, note=null where id = mid;
    update paper   set status='pending', reviewed_at=null, note=null where id = pid;
  elsif act = 'delete' then
    delete from masonry_image where masonry_id = mid;
    delete from masonry_test_curve  where masonry_test_id in (select id from masonry_test where masonry_id = mid);
    delete from masonry_test_result where masonry_test_id in (select id from masonry_test where masonry_id = mid);
    delete from masonry_test where masonry_id = mid;
    delete from masonry where id = mid;
    if bid is not null and not exists (select 1 from masonry where brick_id = bid) then
      delete from brick_test_curve  where brick_test_id in (select id from brick_test where brick_id = bid);
      delete from brick_test_result where brick_test_id in (select id from brick_test where brick_id = bid);
      delete from brick_test where brick_id = bid;
      delete from brick where id = bid;
    end if;
    if mrid is not null and not exists (select 1 from masonry where mortar_id = mrid) then
      delete from mortar_test_curve  where mortar_test_id in (select id from mortar_test where mortar_id = mrid);
      delete from mortar_test_result where mortar_test_id in (select id from mortar_test where mortar_id = mrid);
      delete from mortar_test where mortar_id = mrid;
      delete from mortar where id = mrid;
    end if;
    if pid is not null and not exists (select 1 from masonry where paper_id = pid) then
      delete from paper where id = pid;
    end if;
  else raise exception 'Неизвестное действие: %', act;
  end if;
end $$;
revoke all on function public.admin_review(int,text,text) from public, anon;
grant execute on function public.admin_review(int,text,text) to authenticated;
