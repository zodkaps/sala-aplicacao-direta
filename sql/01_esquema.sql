-- Sala de Aplicação Direta — o banco
-- ==================================
-- Controle de entrada e saída de material da sala de aplicação direta da
-- manutenção: cada movimentação tem foto, quem retirou (ou recebeu) e quem
-- acompanhou. Rode inteiro no SQL Editor de um projeto Supabase novo. Pode rodar
-- de novo: as tabelas só nascem se não existirem, e as regras são refeitas.
--
-- Como a parede funciona: a chave do site é pública (fica no navegador), então
-- quem protege os dados é o Postgres. Toda tabela tem RLS; o que não tem
-- política é negado. Ninguém apaga nem edita uma movimentação: o administrador
-- CANCELA, com motivo, e o registro fica (sai só da conta do saldo).
--
-- Papéis (tabela `perfis`, que o site só altera pela função `definir_acesso`):
--   pendente  conta criada, esperando o administrador liberar — não vê nada
--   consulta  vê o estoque, o histórico e as fotos
--   operador  vê tudo e registra entradas e saídas, cadastra pessoa e material
--   admin     tudo isso, e edita cadastros, cancela registros e libera acessos

-- ── o esquema das funções de apoio ─────────────────────────────────────────
-- Fora do `public` para não virarem endpoint da API: só as políticas as chamam.
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- ── quem entra ─────────────────────────────────────────────────────────────
create table if not exists public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  email     text not null default '',
  nome      text not null default '' check (length(nome) <= 80),
  papel     text not null default 'pendente'
            check (papel in ('pendente', 'consulta', 'operador', 'admin')),
  criado_em timestamptz not null default now()
);
comment on table public.perfis is
  'Um por conta do Auth. O papel só muda pela função definir_acesso (administrador).';
alter table public.perfis enable row level security;

create or replace function privado.papel_atual() returns text
language sql stable security definer set search_path = '' as $$
  select p.papel from public.perfis p where p.id = auth.uid()
$$;

create or replace function privado.pode_ver() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(privado.papel_atual() in ('consulta', 'operador', 'admin'), false)
$$;

create or replace function privado.pode_registrar() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(privado.papel_atual() in ('operador', 'admin'), false)
$$;

create or replace function privado.eh_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(privado.papel_atual() = 'admin', false)
$$;

revoke all on function privado.papel_atual(), privado.pode_ver(),
  privado.pode_registrar(), privado.eh_admin() from public;
grant execute on function privado.papel_atual(), privado.pode_ver(),
  privado.pode_registrar(), privado.eh_admin() to authenticated;

-- Toda conta nova ganha um perfil `pendente`, com o nome que a pessoa digitou.
create or replace function privado.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, coalesce(new.email, ''),
          left(btrim(coalesce(new.raw_user_meta_data ->> 'nome', '')), 80))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function privado.novo_usuario() from public;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function privado.novo_usuario();

-- ── pessoas: quem retira, recebe ou acompanha (não precisa ter conta) ──────
create table if not exists public.pessoas (
  id         bigint generated always as identity primary key,
  nome       text not null check (length(btrim(nome)) between 2 and 80),
  matricula  text check (matricula is null or length(matricula) <= 30),
  funcao     text check (funcao is null or length(funcao) <= 60),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create unique index if not exists pessoas_nome_unico
  on public.pessoas (lower(btrim(nome)), lower(btrim(coalesce(matricula, ''))));
create index if not exists pessoas_criado_por on public.pessoas (criado_por);
alter table public.pessoas enable row level security;

-- ── materiais ──────────────────────────────────────────────────────────────
create table if not exists public.materiais (
  id         bigint generated always as identity primary key,
  codigo     text check (codigo is null or length(codigo) <= 30),  -- código Protheus
  descricao  text not null check (length(btrim(descricao)) between 2 and 120),
  unidade    text not null default 'UN' check (length(btrim(unidade)) between 1 and 10),
  minimo     numeric(12, 3) not null default 0 check (minimo >= 0),
  local      text check (local is null or length(local) <= 60),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
-- A referência do fabricante (o número da peça no catálogo). Veio em 27/11/2026.
alter table public.materiais add column if not exists referencia text
  check (referencia is null or length(referencia) <= 60);
create index if not exists materiais_referencia on public.materiais (lower(btrim(referencia)))
  where referencia is not null;
create unique index if not exists materiais_descricao_unica
  on public.materiais (lower(btrim(descricao)));
create unique index if not exists materiais_codigo_unico
  on public.materiais (lower(btrim(codigo))) where codigo is not null and btrim(codigo) <> '';
create index if not exists materiais_criado_por on public.materiais (criado_por);
alter table public.materiais enable row level security;

-- ── frotas: onde a peça que sai vai ser aplicada ───────────────────────────
-- Cadastro do administrador (menu → Frotas). O número é escrito de um jeito só:
-- " c-433" vira "C-433".
create table if not exists public.frotas (
  id         bigint generated always as identity primary key,
  numero     text not null unique check (length(numero) between 1 and 20),
  descricao  text check (descricao is null or length(descricao) <= 80),
  placa      text check (placa is null or length(placa) <= 10),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index if not exists frotas_criado_por on public.frotas (criado_por);
alter table public.frotas enable row level security;

create or replace function privado.normalizar_frota() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.numero := upper(regexp_replace(btrim(new.numero), '\s+', ' ', 'g'));
  new.placa := nullif(upper(regexp_replace(btrim(coalesce(new.placa, '')), '[^A-Za-z0-9]', '', 'g')), '');
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  return new;
end $$;
revoke all on function privado.normalizar_frota() from public;
drop trigger if exists normalizar_frota on public.frotas;
create trigger normalizar_frota before insert or update on public.frotas
  for each row execute function privado.normalizar_frota();

-- ── movimentações ──────────────────────────────────────────────────────────
-- Entrada: quem recebeu (responsavel_id) e, se quiser, quem entregou e a nota.
-- Saída: quem retirou (retirante_id) e quem acompanhou (responsavel_id).
-- A foto é o caminho no bucket `fotos`; a miniatura mora ao lado, com "-p".
create table if not exists public.movimentacoes (
  id             bigint generated always as identity primary key,
  tipo           text not null check (tipo in ('entrada', 'saida')),
  material_id    bigint not null references public.materiais (id),
  quantidade     numeric(12, 3) not null check (quantidade > 0 and quantidade < 1000000),
  foto           text not null unique
                 check (foto ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
  retirante_id   bigint references public.pessoas (id),
  responsavel_id bigint not null references public.pessoas (id),
  entregue_por   text check (entregue_por is null or length(entregue_por) <= 80),
  documento      text check (documento is null or length(documento) <= 40),
  destino        text check (destino is null or length(destino) <= 80),
  obs            text check (obs is null or length(obs) <= 300),
  registrado_por uuid not null default auth.uid() references public.perfis (id),
  registrado_em  timestamptz not null default now(),
  cancelada_em   timestamptz,
  cancelada_por  uuid references public.perfis (id),
  motivo_cancelamento text check (motivo_cancelamento is null or length(motivo_cancelamento) <= 300),
  constraint saida_tem_retirante check (tipo <> 'saida' or retirante_id is not null),
  constraint entrada_sem_retirante check (tipo <> 'entrada' or retirante_id is null),
  constraint cancelamento_completo check (
    (cancelada_em is null) = (cancelada_por is null) and
    (cancelada_em is null) = (motivo_cancelamento is null))
);
-- A frota da saída (27/11/2026). Entrada não tem frota.
alter table public.movimentacoes add column if not exists frota_id bigint references public.frotas (id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entrada_sem_frota') then
    alter table public.movimentacoes add constraint entrada_sem_frota check (tipo <> 'entrada' or frota_id is null);
  end if;
end $$;
create index if not exists mov_frota on public.movimentacoes (frota_id, registrado_em desc);
create index if not exists mov_quando on public.movimentacoes (registrado_em desc);
create index if not exists mov_material on public.movimentacoes (material_id, registrado_em desc);
create index if not exists mov_retirante on public.movimentacoes (retirante_id);
create index if not exists mov_responsavel on public.movimentacoes (responsavel_id);
create index if not exists mov_registrado_por on public.movimentacoes (registrado_por);
create index if not exists mov_cancelada_por on public.movimentacoes (cancelada_por);
alter table public.movimentacoes enable row level security;

-- O que o navegador não decide: quem registrou, quando, e que a foto chegou.
create or replace function privado.antes_de_registrar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  -- O gatilho roda antes da política; sem isto, quem só consulta ouviria que
  -- "a foto não chegou" em vez de que o acesso dele não registra.
  if v_uid is not null and not privado.pode_registrar() then
    raise exception 'O seu acesso não registra entradas e saídas.' using errcode = '42501';
  end if;
  if v_uid is not null then new.registrado_por := v_uid; end if;
  new.registrado_em := now();
  new.cancelada_em := null;
  new.cancelada_por := null;
  new.motivo_cancelamento := null;
  new.entregue_por := nullif(btrim(new.entregue_por), '');
  new.documento := nullif(btrim(new.documento), '');
  new.destino := nullif(btrim(new.destino), '');
  new.obs := nullif(btrim(new.obs), '');

  if not exists (select 1 from public.materiais m where m.id = new.material_id and m.ativo) then
    raise exception 'Esse material está desativado no cadastro.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pessoas p where p.id = new.responsavel_id and p.ativo) then
    raise exception 'A pessoa que acompanhou (ou recebeu) está desativada no cadastro.' using errcode = 'P0001';
  end if;
  if new.retirante_id is not null and
     not exists (select 1 from public.pessoas p where p.id = new.retirante_id and p.ativo) then
    raise exception 'A pessoa que retirou está desativada no cadastro.' using errcode = 'P0001';
  end if;
  if new.frota_id is not null and
     not exists (select 1 from public.frotas f where f.id = new.frota_id and f.ativo) then
    raise exception 'Essa frota está desativada no cadastro.' using errcode = 'P0001';
  end if;
  -- A foto tem de estar no bucket, enviada por quem está registrando.
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'fotos' and o.name = new.foto
                    and (v_uid is null or o.owner_id = v_uid::text)) then
    raise exception 'A foto não chegou ao servidor. Tire a foto de novo e registre.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function privado.antes_de_registrar() from public;

drop trigger if exists antes_de_registrar on public.movimentacoes;
create trigger antes_de_registrar before insert on public.movimentacoes
  for each row execute function privado.antes_de_registrar();

-- ── o que se lê junto ──────────────────────────────────────────────────────
-- `security_invoker`: a vista obedece às políticas de quem lê.
create or replace view public.estoque with (security_invoker = true) as
select m.id, m.codigo, m.descricao, m.unidade, m.minimo, m.local, m.ativo,
       coalesce(sum(case mv.tipo when 'entrada' then mv.quantidade else -mv.quantidade end)
                filter (where mv.cancelada_em is null), 0)::numeric(12, 3) as saldo,
       count(mv.id) filter (where mv.cancelada_em is null) as movimentos,
       max(mv.registrado_em) filter (where mv.cancelada_em is null) as ultima,
       m.referencia  -- as colunas novas vão no fim: create or replace view só acrescenta
  from public.materiais m
  left join public.movimentacoes mv on mv.material_id = m.id
 group by m.id;

create or replace view public.historico with (security_invoker = true) as
select mv.id, mv.tipo, mv.quantidade, mv.foto, mv.registrado_em,
       mv.material_id, m.descricao as material, m.codigo, m.unidade,
       mv.retirante_id, r.nome as retirante, r.matricula as retirante_matricula,
       mv.responsavel_id, a.nome as responsavel,
       mv.entregue_por, mv.documento, mv.destino, mv.obs,
       mv.registrado_por, p.nome as registrado_por_nome,
       mv.cancelada_em, c.nome as cancelada_por_nome, mv.motivo_cancelamento,
       m.referencia, mv.frota_id, f.numero as frota, f.descricao as frota_descricao
  from public.movimentacoes mv
  join public.materiais m on m.id = mv.material_id
  join public.pessoas a on a.id = mv.responsavel_id
  left join public.pessoas r on r.id = mv.retirante_id
  left join public.perfis p on p.id = mv.registrado_por
  left join public.perfis c on c.id = mv.cancelada_por
  left join public.frotas f on f.id = mv.frota_id;

-- ── quem pode o quê ────────────────────────────────────────────────────────
-- O Supabase dá tudo a anon e authenticated por padrão; aqui se tira tudo e se
-- devolve só o necessário, coluna por coluna onde importa.
revoke all on public.perfis, public.pessoas, public.materiais, public.movimentacoes,
  public.frotas, public.estoque, public.historico from anon, authenticated;

grant select (id, nome, papel) on public.perfis to authenticated;
grant select on public.pessoas, public.materiais, public.movimentacoes, public.frotas,
  public.estoque, public.historico to authenticated;
grant insert (nome, matricula, funcao) on public.pessoas to authenticated;
grant update (nome, matricula, funcao, ativo) on public.pessoas to authenticated;
grant insert (codigo, referencia, descricao, unidade, minimo, local) on public.materiais to authenticated;
grant update (codigo, referencia, descricao, unidade, minimo, local, ativo) on public.materiais to authenticated;
grant insert (numero, descricao, placa) on public.frotas to authenticated;
grant update (numero, descricao, placa, ativo) on public.frotas to authenticated;
grant insert (tipo, material_id, quantidade, foto, retirante_id, responsavel_id, frota_id,
  entregue_por, documento, destino, obs) on public.movimentacoes to authenticated;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select privado.pode_ver()));

drop policy if exists pessoas_ler on public.pessoas;
create policy pessoas_ler on public.pessoas for select to authenticated
  using ((select privado.pode_ver()));
drop policy if exists pessoas_inserir on public.pessoas;
create policy pessoas_inserir on public.pessoas for insert to authenticated
  with check ((select privado.pode_registrar()));
drop policy if exists pessoas_editar on public.pessoas;
create policy pessoas_editar on public.pessoas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

drop policy if exists materiais_ler on public.materiais;
create policy materiais_ler on public.materiais for select to authenticated
  using ((select privado.pode_ver()));
drop policy if exists materiais_inserir on public.materiais;
create policy materiais_inserir on public.materiais for insert to authenticated
  with check ((select privado.pode_registrar()));
drop policy if exists materiais_editar on public.materiais;
create policy materiais_editar on public.materiais for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

drop policy if exists frotas_ler on public.frotas;
create policy frotas_ler on public.frotas for select to authenticated
  using ((select privado.pode_ver()));
drop policy if exists frotas_inserir on public.frotas;
create policy frotas_inserir on public.frotas for insert to authenticated
  with check ((select privado.eh_admin()));
drop policy if exists frotas_editar on public.frotas;
create policy frotas_editar on public.frotas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

drop policy if exists mov_ler on public.movimentacoes;
create policy mov_ler on public.movimentacoes for select to authenticated
  using ((select privado.pode_ver()));
drop policy if exists mov_inserir on public.movimentacoes;
create policy mov_inserir on public.movimentacoes for insert to authenticated
  with check ((select privado.pode_registrar()));
-- Sem política de update e de delete: ninguém edita nem apaga pela API.

-- ── as ações do administrador ──────────────────────────────────────────────
create or replace function public.cancelar_movimentacao(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cancela um registro.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  update public.movimentacoes
     set cancelada_em = now(), cancelada_por = auth.uid(),
         motivo_cancelamento = left(btrim(p_motivo), 300)
   where id = p_id and cancelada_em is null;
  if not found then
    raise exception 'Registro não encontrado ou já cancelado.' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.listar_acessos()
returns table (id uuid, email text, nome text, papel text,
               criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador vê os acessos.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.nome, p.papel, p.criado_em, u.last_sign_in_at
      from public.perfis p
      left join auth.users u on u.id = p.id
     order by (p.papel = 'pendente') desc, p.nome;
end $$;

-- Liberar também confirma o e-mail: o envio embutido do Supabase não entrega
-- para todo mundo, e quem o administrador liberou não fica preso esperando.
create or replace function public.definir_acesso(p_id uuid, p_papel text, p_nome text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador libera acessos.' using errcode = '42501';
  end if;
  if p_papel is null or p_papel not in ('pendente', 'consulta', 'operador', 'admin') then
    raise exception 'Papel desconhecido.' using errcode = 'P0001';
  end if;
  if p_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.' using errcode = 'P0001';
  end if;
  update public.perfis
     set papel = p_papel,
         nome = coalesce(nullif(left(btrim(p_nome), 80), ''), nome)
   where id = p_id;
  if not found then
    raise exception 'Acesso não encontrado.' using errcode = 'P0001';
  end if;
  if p_papel <> 'pendente' then
    update auth.users set email_confirmed_at = now()
     where id = p_id and email_confirmed_at is null;
  end if;
end $$;

revoke all on function public.cancelar_movimentacao(bigint, text), public.listar_acessos(),
  public.definir_acesso(uuid, text, text) from public, anon;
grant execute on function public.cancelar_movimentacao(bigint, text), public.listar_acessos(),
  public.definir_acesso(uuid, text, text) to authenticated;

-- ── as fotos ───────────────────────────────────────────────────────────────
-- Bucket privado: a foto só abre por endereço assinado, para quem pode ver.
-- Sem política de update e de delete: foto enviada não se troca nem se apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_ler on storage.objects;
create policy fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (select privado.pode_ver()));

drop policy if exists fotos_enviar on storage.objects;
create policy fotos_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos' and (select privado.pode_registrar()) and
    name ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-p)?\.jpg$');

-- ── o primeiro administrador ───────────────────────────────────────────────
-- Nenhum e-mail mora neste arquivo (o repositório é público). Depois de criar a
-- sua conta pelo site, rode no SQL Editor, com o seu e-mail:
--
--   update public.perfis set papel = 'admin' where email = 'o.seu@email';
--   update auth.users set email_confirmed_at = now()
--    where email = 'o.seu@email' and email_confirmed_at is null;
--
-- Dali em diante, os outros acessos se liberam pelo site (menu → Acessos).
