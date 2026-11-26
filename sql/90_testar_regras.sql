-- Testa as regras do banco fingindo ser cada papel
-- ================================================
-- Rode no SQL Editor quando mexer no 01_esquema.sql. Cria contas, pessoas,
-- materiais, fotos e movimentações de mentira, testa o que cada papel consegue
-- e o que o banco recusa, e termina SEMPRE com um erro de propósito: é ele que
-- desfaz tudo o que o teste criou. Nada fica no banco.
--
-- Leia a mensagem do erro: "TUDO CERTO: N verificações" ou "FALHOU: …".

do $$
declare
  u_admin uuid := gen_random_uuid();
  u_op    uuid := gen_random_uuid();
  u_con   uuid := gen_random_uuid();
  u_pen   uuid := gen_random_uuid();
  pasta   text := to_char(now(), 'YYYY/MM/');
  f_ent   text := pasta || gen_random_uuid() || '.jpg';
  f_sai   text := pasta || gen_random_uuid() || '.jpg';
  f_mais  text := pasta || gen_random_uuid() || '.jpg';
  f_adm   text := pasta || gen_random_uuid() || '.jpg';
  f_solta text := pasta || gen_random_uuid() || '.jpg';
  p_mec   bigint;
  p_alm   bigint;
  m_graxa bigint;
  mv_sai  bigint;
  f_433   bigint;
  n       bigint;
  t       text;
  v       numeric;
  ok      int := 0;
begin
  -- ── as contas de mentira (o gatilho tem de criar o perfil pendente) ──
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', u_admin, 'authenticated', 'authenticated', 't-admin@teste.invalid', '{"nome":"T Admin"}'),
    ('00000000-0000-0000-0000-000000000000', u_op,    'authenticated', 'authenticated', 't-op@teste.invalid',    '{"nome":"T Operador"}'),
    ('00000000-0000-0000-0000-000000000000', u_con,   'authenticated', 'authenticated', 't-con@teste.invalid',   '{"nome":"T Consulta"}'),
    ('00000000-0000-0000-0000-000000000000', u_pen,   'authenticated', 'authenticated', 't-pen@teste.invalid',   '{"nome":"  T Pendente  "}');

  select count(*) into n from public.perfis
   where id in (u_admin, u_op, u_con, u_pen) and papel = 'pendente';
  if n <> 4 then raise exception using errcode = 'TFAIL', message = 'FALHOU: conta nova sem perfil pendente (' || n || ')'; end if;
  select nome into t from public.perfis where id = u_pen;
  if t <> 'T Pendente' then raise exception using errcode = 'TFAIL', message = 'FALHOU: nome do perfil veio "' || t || '"'; end if;
  ok := ok + 2;

  update public.perfis set papel = 'admin'    where id = u_admin;
  update public.perfis set papel = 'operador' where id = u_op;
  update public.perfis set papel = 'consulta' where id = u_con;

  -- uma frota (o número e a placa saem num jeito só)
  insert into public.frotas (numero, placa, descricao) values ('  t-433 ', 'abc-1d23', ' Cavalo T ') returning id into f_433;
  select numero || '|' || placa || '|' || descricao into t from public.frotas where id = f_433;
  if t <> 'T-433|ABC1D23|Cavalo T' then raise exception using errcode = 'TFAIL', message = 'FALHOU: frota gravada como ' || t; end if;
  ok := ok + 1;

  -- as fotos "enviadas" (no bucket, com dono)
  insert into storage.objects (bucket_id, name, owner_id) values
    ('fotos', f_ent, u_op::text), ('fotos', f_sai, u_op::text),
    ('fotos', f_mais, u_op::text), ('fotos', f_adm, u_admin::text);

  -- ════════════════ operador ════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.pessoas (nome, matricula) values ('T Mecânico', 'T1') returning id into p_mec;
  insert into public.pessoas (nome) values ('T Almoxarife') returning id into p_alm;
  insert into public.materiais (descricao, unidade, codigo, referencia) values ('T Graxa', 'KG', 'T900', 'REF-T 123') returning id into m_graxa;
  ok := ok + 1;

  insert into public.movimentacoes (tipo, material_id, quantidade, foto, responsavel_id, entregue_por)
  values ('entrada', m_graxa, 10, f_ent, p_alm, '  ');
  insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id, frota_id, destino)
  values ('saida', m_graxa, 3, f_sai, p_mec, p_alm, f_433, 'Eixo traseiro') returning id into mv_sai;

  select registrado_por::text || '|' || coalesce(entregue_por, 'nulo') into t
    from public.movimentacoes where foto = f_ent;
  if t <> u_op::text || '|nulo' then raise exception using errcode = 'TFAIL', message = 'FALHOU: registrado_por/limpeza: ' || t; end if;
  select saldo into v from public.estoque where id = m_graxa;
  if v <> 7 then raise exception using errcode = 'TFAIL', message = 'FALHOU: saldo depois de entrada 10 e saída 3 = ' || v; end if;
  select retirante || '|' || responsavel || '|' || registrado_por_nome into t from public.historico where id = mv_sai;
  if t <> 'T Mecânico|T Almoxarife|T Operador' then raise exception using errcode = 'TFAIL', message = 'FALHOU: histórico: ' || t; end if;
  select frota || '|' || referencia || '|' || codigo into t from public.historico where id = mv_sai;
  if t <> 'T-433|REF-T 123|T900' then raise exception using errcode = 'TFAIL', message = 'FALHOU: frota/referência no histórico: ' || t; end if;
  select referencia into t from public.estoque where id = m_graxa;
  if t is distinct from 'REF-T 123' then raise exception using errcode = 'TFAIL', message = 'FALHOU: referência no estoque'; end if;
  ok := ok + 5;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, responsavel_id, frota_id)
    values ('entrada', m_graxa, 1, f_mais, p_alm, f_433);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: entrada com frota entrou';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    insert into public.frotas (numero) values ('T-999');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador cadastrou frota';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, responsavel_id)
    values ('saida', m_graxa, 1, f_mais, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: saída sem quem retirou entrou';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 1, f_solta, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: saída com foto que não está no bucket entrou';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 1, f_adm, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: saída com foto enviada por outra pessoa entrou';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 1, f_sai, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: a mesma foto serviu para dois registros';
  exception when unique_violation then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 0, f_mais, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: quantidade zero entrou';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id, registrado_por)
    values ('saida', m_graxa, 1, f_mais, p_mec, p_alm, u_admin);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador assinou como outra pessoa';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    update public.movimentacoes set quantidade = 1 where id = mv_sai;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador editou uma movimentação';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    delete from public.movimentacoes where id = mv_sai;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador apagou uma movimentação';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  update public.pessoas set nome = 'Trocado' where id = p_mec;
  get diagnostics n = row_count;
  if n <> 0 then raise exception using errcode = 'TFAIL', message = 'FALHOU: operador editou o cadastro de pessoa'; end if;
  ok := ok + 1;

  begin
    perform public.cancelar_movimentacao(mv_sai, 'operador tentando');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador cancelou um registro';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    perform public.definir_acesso(u_op, 'admin');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador se fez administrador';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    perform * from public.listar_acessos();
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador viu a lista de acessos';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    perform email from public.perfis;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador leu e-mail dos perfis';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  begin
    update public.perfis set papel = 'admin' where id = u_op;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador trocou o próprio papel';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  -- fotos: envia com nome certo; nome fora do padrão, não; e não apaga
  insert into storage.objects (bucket_id, name, owner_id)
  values ('fotos', pasta || gen_random_uuid() || '-p.jpg', u_op::text);
  ok := ok + 1;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('fotos', 'qualquer/coisa.jpg', u_op::text);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: foto com nome fora do padrão entrou';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    delete from storage.objects where bucket_id = 'fotos' and name = f_ent;
  exception when others then null;  -- recusar com erro também serve
  end;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = f_ent) then
    raise exception using errcode = 'TFAIL', message = 'FALHOU: operador apagou uma foto';
  end if;
  ok := ok + 1;

  -- ════════════════ consulta ════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', u_con, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.historico where material_id = m_graxa;
  if n <> 2 then raise exception using errcode = 'TFAIL', message = 'FALHOU: consulta vê ' || n || ' movimentações'; end if;
  select count(*) into n from storage.objects where bucket_id = 'fotos' and name in (f_ent, f_sai);
  if n <> 2 then raise exception using errcode = 'TFAIL', message = 'FALHOU: consulta não vê as fotos'; end if;
  ok := ok + 2;

  begin
    insert into public.pessoas (nome) values ('T Intruso');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: consulta cadastrou pessoa';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 1, f_mais, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: consulta registrou saída';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('fotos', pasta || gen_random_uuid() || '.jpg', u_con::text);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: consulta enviou foto';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  -- ════════════════ pendente ════════════════
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_pen, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select (select count(*) from public.pessoas) + (select count(*) from public.materiais)
       + (select count(*) from public.historico) + (select count(*) from public.estoque)
       + (select count(*) from storage.objects where bucket_id = 'fotos') into n;
  if n <> 0 then raise exception using errcode = 'TFAIL', message = 'FALHOU: pendente enxerga ' || n || ' linhas'; end if;
  select count(*) into n from public.perfis;
  if n <> 1 then raise exception using errcode = 'TFAIL', message = 'FALHOU: pendente vê ' || n || ' perfis'; end if;
  ok := ok + 2;
  begin
    insert into public.pessoas (nome) values ('T Intruso');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: pendente cadastrou pessoa';
  exception when insufficient_privilege then ok := ok + 1;
  end;

  -- ════════════════ administrador ════════════════
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  update public.pessoas set funcao = 'Mecânico' where id = p_mec;
  get diagnostics n = row_count;
  if n <> 1 then raise exception using errcode = 'TFAIL', message = 'FALHOU: admin não editou o cadastro'; end if;
  ok := ok + 1;

  -- frotas: o administrador cadastra e desativa; frota desativada não recebe saída
  insert into public.frotas (numero) values ('t-500');
  begin
    insert into public.frotas (numero) values ('T-500 ');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: frota repetida entrou';
  exception when unique_violation then ok := ok + 1;
  end;
  update public.frotas set ativo = false where id = f_433;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id, frota_id)
    values ('saida', m_graxa, 1, f_mais, p_mec, p_alm, f_433);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: saída para frota desativada entrou';
  exception when sqlstate 'P0001' then
    get stacked diagnostics t = message_text;
    if t not like '%frota%' then raise exception using errcode = 'TFAIL', message = 'FALHOU: recusa errada: ' || t; end if;
    ok := ok + 1;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.cancelar_movimentacao(mv_sai, 'oi');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: cancelou sem motivo';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;
  perform public.cancelar_movimentacao(mv_sai, 'Registrado em dobro, teste');
  select saldo into v from public.estoque where id = m_graxa;
  if v <> 10 then raise exception using errcode = 'TFAIL', message = 'FALHOU: saldo depois de cancelar = ' || v; end if;
  select cancelada_por_nome into t from public.historico where id = mv_sai;
  if t is distinct from 'T Admin' then raise exception using errcode = 'TFAIL', message = 'FALHOU: cancelamento sem autor'; end if;
  ok := ok + 2;
  begin
    perform public.cancelar_movimentacao(mv_sai, 'de novo, teste');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: cancelou duas vezes';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;

  select count(*) into n from public.listar_acessos() a where a.email like '%@teste.invalid';
  if n <> 4 then raise exception using errcode = 'TFAIL', message = 'FALHOU: listar_acessos trouxe ' || n; end if;
  ok := ok + 1;
  perform public.definir_acesso(u_pen, 'consulta', 'T Liberado');
  begin
    perform public.definir_acesso(u_admin, 'operador');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: admin tirou o próprio acesso';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;
  begin
    perform public.definir_acesso(u_pen, 'chefe');
    raise exception using errcode = 'TFAIL', message = 'FALHOU: papel inventado entrou';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;

  update public.materiais set ativo = false where id = m_graxa;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.movimentacoes (tipo, material_id, quantidade, foto, retirante_id, responsavel_id)
    values ('saida', m_graxa, 1, f_mais, p_mec, p_alm);
    raise exception using errcode = 'TFAIL', message = 'FALHOU: saída de material desativado entrou';
  exception when sqlstate 'P0001' then ok := ok + 1;
  end;

  perform set_config('role', 'postgres', true);
  select nome || '|' || papel into t from public.perfis where id = u_pen;
  if t <> 'T Liberado|consulta' then raise exception using errcode = 'TFAIL', message = 'FALHOU: definir_acesso gravou ' || t; end if;
  if not exists (select 1 from auth.users where id = u_pen and email_confirmed_at is not null) then
    raise exception using errcode = 'TFAIL', message = 'FALHOU: liberar não confirmou o e-mail';
  end if;
  ok := ok + 2;

  -- ════════════════ sem conta (a chave pública sozinha) ════════════════
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    perform count(*) from public.pessoas;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: sem conta leu pessoas';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    perform count(*) from public.historico;
    raise exception using errcode = 'TFAIL', message = 'FALHOU: sem conta leu o histórico';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    perform * from public.listar_acessos();
    raise exception using errcode = 'TFAIL', message = 'FALHOU: sem conta chamou listar_acessos';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  perform set_config('role', 'postgres', true);

  raise exception using errcode = 'TFAIL', message = 'TUDO CERTO: ' || ok || ' verificações (e nada ficou no banco)';
end $$;
