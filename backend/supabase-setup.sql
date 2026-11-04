-- =====================================================================
-- PELUSART · preparación de la base de datos (Supabase)
--
-- Se pega UNA sola vez en: Supabase → SQL Editor → New query → Run.
--
-- ANTES DE EJECUTAR: reemplazá  TU_EMAIL@EJEMPLO.COM  (aparece una sola vez,
-- más abajo) por el email con el que vas a entrar como moderador.
-- =====================================================================

-- 1) Quién es el moderador (solo ese email puede borrar)
create or replace function public.is_moderator()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = lower('TU_EMAIL@EJEMPLO.COM');
$$;

-- 2) Tabla de obras
create table if not exists public.pelusarts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  votes      integer not null default 0 check (votes >= 0),
  img_path   text not null check (char_length(img_path) between 5 and 80)
);

alter table public.pelusarts enable row level security;

drop policy if exists "todos ven"         on public.pelusarts;
drop policy if exists "todos suben"       on public.pelusarts;
drop policy if exists "moderador borra"   on public.pelusarts;

-- cualquiera puede VER las obras
create policy "todos ven" on public.pelusarts
  for select to anon, authenticated using (true);

-- cualquiera puede SUBIR una obra (siempre arranca con 0 votos)
create policy "todos suben" on public.pelusarts
  for insert to anon, authenticated with check (votes = 0);

-- SOLO el moderador puede BORRAR
create policy "moderador borra" on public.pelusarts
  for delete to authenticated using (public.is_moderator());

-- 3) Votar: la gente no puede editar la tabla, solo sumar o restar 1 con esta función
create or replace function public.vote_pelusart(p_id uuid, p_delta integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.pelusarts
     set votes = greatest(0, votes + case when p_delta > 0 then 1 else -1 end)
   where id = p_id
  returning votes;
$$;

revoke all on function public.vote_pelusart(uuid, integer) from public;
grant execute on function public.vote_pelusart(uuid, integer) to anon, authenticated;

-- 4) Carpeta de imágenes (pública para verlas, máx. 500 KB, solo JPG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pelusarts', 'pelusarts', true, 512000, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 512000, allowed_mime_types = array['image/jpeg'];

drop policy if exists "todos suben imagenes"     on storage.objects;
drop policy if exists "moderador borra imagenes" on storage.objects;

create policy "todos suben imagenes" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'pelusarts');

create policy "moderador borra imagenes" on storage.objects
  for delete to authenticated using (bucket_id = 'pelusarts' and public.is_moderator());
