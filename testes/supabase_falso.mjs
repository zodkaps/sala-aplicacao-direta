// Um Supabase de mentira, dentro do navegador de teste (Playwright intercepta
// os pedidos). Imita só o que o site usa: o Auth, a API (com os filtros que o
// site manda), as funções do administrador e o Storage — e as mesmas recusas
// das regras do sql/01_esquema.sql, de forma simplificada. As regras de
// verdade são testadas no próprio banco pelo sql/90_testar_regras.sql.
//
// Todo dado aqui é inventado.

const RE_FOTO = /^[0-9]{4}\/[0-9]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-p)?\.jpg$/;
const RE_FOTO_MOV = /^[0-9]{4}\/[0-9]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function criarBanco() {
  return {
    usuarios: [],        // { id, email, senha, confirmado }
    perfis: [],          // { id, email, nome, papel, criado_em }
    pessoas: [],
    materiais: [],
    frotas: [],
    movimentacoes: [],
    apagados: [],          // a cópia do que o administrador apagou
    objetos: new Map(),  // caminho -> { bytes, dono, tipo }
    tokens: new Map(),   // token -> id do usuário
    seq: { pessoas: 0, materiais: 0, frotas: 0, movimentacoes: 0, token: 0 },
    pedidos: [],         // registro do que o site pediu (para o teste conferir)
    autoconfirma: true,
    falhar: null,        // (rota) => boolean: força erro de rede
  };
}

let nUuid = 0;
function uuid() {
  nUuid += 1;
  return `00000000-0000-4000-8000-${String(nUuid).padStart(12, "0")}`;
}

export function criarUsuario(db, { email, senha, nome, papel = "pendente" }) {
  const id = uuid();
  db.usuarios.push({ id, email, senha, confirmado: true });
  db.perfis.push({ id, email, nome, papel, criado_em: new Date().toISOString() });
  return id;
}

function sessao(db, id) {
  db.seq.token += 1;
  const tk = `tk-${db.seq.token}`;
  db.tokens.set(tk, id);
  const u = db.usuarios.find((x) => x.id === id);
  return { access_token: tk, refresh_token: `rf-${db.seq.token}-${id}`, expires_in: 3600, token_type: "bearer", user: { id, email: u.email } };
}

const papelDe = (db, id) => (db.perfis.find((p) => p.id === id) || {}).papel || "pendente";
const podeVer = (p) => ["consulta", "operador", "admin"].includes(p);
const podeRegistrar = (p) => ["operador", "admin"].includes(p);

function estoque(db) {
  return db.materiais.map((m) => {
    const movs = db.movimentacoes.filter((x) => x.material_id === m.id && !x.cancelada_em);
    const saldo = movs.reduce((s, x) => s + (x.tipo === "saida" ? -x.quantidade : x.quantidade), 0);
    const vistorias = movs.filter((x) => x.tipo === "ajuste");
    return {
      id: m.id, codigo: m.codigo, descricao: m.descricao, unidade: m.unidade, minimo: m.minimo, local: m.local,
      ativo: m.ativo, saldo: Math.round(saldo * 1000) / 1000, movimentos: movs.length,
      ultima: movs.length ? movs[movs.length - 1].registrado_em : null,
      referencia: m.referencia ?? null, foto: m.foto ?? null,
      ultima_vistoria: vistorias.length ? vistorias[vistorias.length - 1].registrado_em : null,
    };
  });
}

function historico(db) {
  const nome = (lista, id) => (lista.find((x) => x.id === id) || {}).nome || null;
  return db.movimentacoes.map((mv) => {
    const m = db.materiais.find((x) => x.id === mv.material_id);
    const r = db.pessoas.find((x) => x.id === mv.retirante_id);
    const f = db.frotas.find((x) => x.id === mv.frota_id);
    return {
      id: mv.id, tipo: mv.tipo, quantidade: mv.quantidade, foto: mv.foto, registrado_em: mv.registrado_em,
      material_id: mv.material_id, material: m.descricao, codigo: m.codigo, unidade: m.unidade,
      retirante_id: mv.retirante_id, retirante: r ? r.nome : null, retirante_matricula: r ? r.matricula : null,
      responsavel_id: mv.responsavel_id, responsavel: nome(db.pessoas, mv.responsavel_id),
      entregue_por: mv.entregue_por, documento: mv.documento, destino: mv.destino, obs: mv.obs,
      registrado_por: mv.registrado_por, registrado_por_nome: nome(db.perfis, mv.registrado_por),
      cancelada_em: mv.cancelada_em, cancelada_por_nome: nome(db.perfis, mv.cancelada_por),
      motivo_cancelamento: mv.motivo_cancelamento,
      referencia: m.referencia ?? null, frota_id: mv.frota_id ?? null,
      frota: f ? f.numero : null, frota_descricao: f ? f.descricao : null,
      saldo_antes: mv.saldo_antes ?? null, contado: mv.contado ?? null, material_foto: m.foto ?? null,
    };
  });
}

// ── os filtros do PostgREST que o site usa ──────────────────────────────────

function valorDe(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function compara(linha, col, op, val) {
  const x = linha[col];
  switch (op) {
    case "eq": return String(x) === String(valorDe(val));
    case "gte": return x != null && (typeof x === "number" ? x >= Number(val) : String(x) >= val);
    case "lt": return x != null && (typeof x === "number" ? x < Number(val) : String(x) < val);
    case "is": return val === "null" ? x == null : x === valorDe(val);
    case "ilike": {
      let v = val.replace(/^"|"$/g, "");
      const re = new RegExp("^" + v.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
      return x != null && re.test(String(x));
    }
    default: throw new Error(`filtro não imitado: ${op}`);
  }
}

function partesOr(s) {
  // "(a.eq.1,b.ilike."*x, y*")" → ["a.eq.1", 'b.ilike."*x, y*"']
  const dentro = s.replace(/^\(|\)$/g, "");
  const partes = []; let atual = ""; let aspas = false;
  for (const ch of dentro) {
    if (ch === '"') aspas = !aspas;
    if (ch === "," && !aspas) { partes.push(atual); atual = ""; } else atual += ch;
  }
  if (atual) partes.push(atual);
  return partes.map((p) => {
    const [col, op, ...resto] = p.split(".");
    return [col, op, resto.join(".")];
  });
}

function aplicar(linhas, params) {
  let out = linhas.slice();
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    if (k === "or") {
      const conds = partesOr(v);
      out = out.filter((l) => conds.some(([c, op, val]) => compara(l, c, op, val)));
      continue;
    }
    const i = v.indexOf(".");
    const op = v.slice(0, i), val = v.slice(i + 1);
    out = out.filter((l) => compara(l, k, op, val));
  }
  const ordem = params.get("order");
  if (ordem) {
    const chaves = ordem.split(",").map((o) => { const [c, d] = o.split("."); return [c, d === "desc" ? -1 : 1]; });
    out.sort((a, b) => {
      for (const [c, d] of chaves) {
        const x = a[c], y = b[c];
        if (x === y) continue;
        if (typeof x === "number" && typeof y === "number") return (x - y) * d;
        return String(x).localeCompare(String(y), "pt-BR") * d;
      }
      return 0;
    });
  }
  const off = Number(params.get("offset") || 0);
  const lim = Math.min(Number(params.get("limit") || 1000), 1000);
  return out.slice(off, off + lim);
}

// O formato de e-mail que o Supabase aceita ao criar a conta (checkmail): a
// parte da frente com pontos só entre os pedaços, e o domínio com ou sem ponto.
const EMAIL_DO_SUPABASE = /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i;

/** O cliente de administrador do Supabase, imitado sobre este banco, para a
 *  lógica da função `acessos` (a mesma que está publicada) rodar no teste. */
function adminDoBanco(db) {
  return {
    auth: {
      admin: {
        async createUser({ email, password, user_metadata }) {
          if (!EMAIL_DO_SUPABASE.test(email)) return { data: null, error: { status: 400, code: "validation_failed", message: "Unable to validate email address: invalid format" } };
          if (db.usuarios.some((u) => u.email === email)) return { data: null, error: { status: 422, message: "A user with this email address has already been registered" } };
          const id = criarUsuario(db, { email, senha: password, nome: user_metadata.nome });
          return { data: { user: { id } }, error: null };
        },
        async updateUserById(id, { password }) {
          const u = db.usuarios.find((x) => x.id === id);
          if (!u) return { data: null, error: { message: "User not found" } };
          u.senha = password;
          return { data: {}, error: null };
        },
      },
    },
    from() {
      return {
        update: (campos) => ({ eq: async (_c, id) => { const p = db.perfis.find((x) => x.id === id); if (p) Object.assign(p, campos); return { error: null }; } }),
        select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: db.perfis.some((x) => x.id === id) ? { id } : null, error: null }) }) }),
      };
    },
  };
}

// ── o tratador ─────────────────────────────────────────────────────────────

function json(route, status, corpo) {
  return route.fulfill({ status, contentType: "application/json", body: corpo === undefined ? "" : JSON.stringify(corpo) });
}

const erroRLS = (tabela) => ({ code: "42501", message: `new row violates row-level security policy for table "${tabela}"` });

export async function instalar(context, base, db) {
  await context.route(`${base}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const caminho = url.pathname;
    const metodo = req.method();
    db.pedidos.push(`${metodo} ${caminho}${url.search}`);
    if (db.falhar && db.falhar(`${metodo} ${caminho}`)) return route.abort("internetdisconnected");

    const cab = await req.allHeaders();
    let corpo = null;
    const texto = () => { try { return JSON.parse(req.postData() || "null"); } catch { return null; } };

    // ── Auth ──
    if (caminho === "/auth/v1/settings") return json(route, 200, { mailer_autoconfirm: db.autoconfirma, external: { email: true } });
    if (caminho === "/auth/v1/signup") {
      corpo = texto();
      if (db.usuarios.some((u) => u.email === corpo.email)) return json(route, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
      const id = criarUsuario(db, { email: corpo.email, senha: corpo.password, nome: (corpo.data && corpo.data.nome) || "" });
      if (!db.autoconfirma) { db.usuarios.find((u) => u.id === id).confirmado = false; return json(route, 200, { id, email: corpo.email }); }
      return json(route, 200, sessao(db, id));
    }
    if (caminho === "/auth/v1/token") {
      corpo = texto();
      if (url.searchParams.get("grant_type") === "password") {
        const u = db.usuarios.find((x) => x.email === corpo.email && x.senha === corpo.password);
        if (!u) return json(route, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        if (!u.confirmado) return json(route, 400, { error_code: "email_not_confirmed", msg: "Email not confirmed" });
        return json(route, 200, sessao(db, u.id));
      }
      const id = String(corpo.refresh_token || "").split("-").slice(2).join("-");
      if (!db.usuarios.some((u) => u.id === id)) return json(route, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      return json(route, 200, sessao(db, id));
    }

    const tk = String(cab.authorization || "").replace(/^Bearer /, "");
    const eu = db.tokens.get(tk);
    if (caminho.startsWith("/storage/v1/object/sign/") && metodo === "GET") {
      const c = decodeURIComponent(caminho.replace("/storage/v1/object/sign/fotos/", ""));
      const o = db.objetos.get(c);
      if (!o || url.searchParams.get("token") !== "ok") return route.fulfill({ status: 400, body: "" });
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: o.bytes });
    }
    if (cab.apikey == null) return json(route, 401, { message: "No API key found in request" });
    if (caminho === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
    if (!eu) return json(route, 401, { code: "PGRST301", message: "JWT expired" });
    const papel = papelDe(db, eu);
    if (caminho === "/auth/v1/user") return json(route, 200, { id: eu });

    // ── a função `acessos` ──
    if (caminho === "/functions/v1/acessos") {
      if (papel !== "admin") return json(route, 403, { erro: "Só o administrador cria acessos e troca senhas." });
      const { tratar } = await import("../supabase/functions/acessos/logica.js");
      const r = await tratar(texto(), adminDoBanco(db));
      return json(route, r.status, r.corpo);
    }

    // ── Storage ──
    if (caminho === "/storage/v1/object/sign/fotos") {
      corpo = texto();
      return json(route, 200, corpo.paths.map((p) => (podeVer(papel) && db.objetos.has(p)
        ? { path: p, signedURL: `/object/sign/fotos/${p}?token=ok`, error: null }
        : { path: p, signedURL: null, error: "Either the object does not exist or you do not have access to it" })));
    }
    if (caminho === "/storage/v1/object/fotos" && metodo === "DELETE") {
      corpo = texto();
      if (papel !== "admin") return json(route, 200, []);  // a política filtra: nada some
      const foram = corpo.prefixes.filter((c) => db.objetos.delete(c)).map((name) => ({ name }));
      return json(route, 200, foram);
    }
    if (caminho.startsWith("/storage/v1/object/fotos/") && metodo === "POST") {
      const c = decodeURIComponent(caminho.replace("/storage/v1/object/fotos/", ""));
      if (!podeRegistrar(papel) || !RE_FOTO.test(c)) return json(route, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (cab["content-type"] !== "image/jpeg") return json(route, 400, { statusCode: "415", error: "invalid_mime_type", message: "mime type not supported" });
      if (db.objetos.has(c)) return json(route, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      const bytes = req.postDataBuffer();
      if (bytes.length > 3145728) return json(route, 400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      db.objetos.set(c, { bytes, dono: eu, tipo: cab["content-type"] });
      return json(route, 200, { Key: `fotos/${c}`, Id: uuid() });
    }

    // ── a API ──
    if (!caminho.startsWith("/rest/v1/")) return json(route, 404, { message: "não imitado" });
    const alvo = caminho.replace("/rest/v1/", "");
    const params = url.searchParams;

    if (alvo.startsWith("rpc/")) {
      corpo = texto() || {};
      const nome = alvo.slice(4);
      if (papel !== "admin") return json(route, 403, { code: "42501", message: `Só o administrador ${nome === "cancelar_movimentacao" ? "cancela um registro" : nome === "apagar_movimentacao" ? "apaga um registro" : "libera acessos"}.` });
      if (nome === "apagar_movimentacao") {
        if (String(corpo.p_motivo || "").trim().length < 3) return json(route, 400, { code: "P0001", message: "Escreva por que está apagando (ex.: teste)." });
        const i = db.movimentacoes.findIndex((x) => x.id === corpo.p_id);
        if (i < 0) return json(route, 400, { code: "P0001", message: "Registro não encontrado." });
        const [mv] = db.movimentacoes.splice(i, 1);
        db.apagados.push({ tabela: "movimentacoes", dados: mv, motivo: corpo.p_motivo, apagado_por: eu });
        return json(route, 200, mv.foto);
      }
      if (nome === "listar_acessos") {
        return json(route, 200, db.perfis.map((p) => ({ id: p.id, email: p.email, nome: p.nome, papel: p.papel, criado_em: p.criado_em, ultimo_acesso: null }))
          .sort((a, b) => (b.papel === "pendente") - (a.papel === "pendente") || a.nome.localeCompare(b.nome)));
      }
      if (nome === "definir_acesso") {
        if (corpo.p_id === eu && corpo.p_papel !== "admin") return json(route, 400, { code: "P0001", message: "Você não pode tirar o seu próprio acesso de administrador." });
        const p = db.perfis.find((x) => x.id === corpo.p_id);
        p.papel = corpo.p_papel; if (corpo.p_nome) p.nome = corpo.p_nome;
        db.usuarios.find((u) => u.id === corpo.p_id).confirmado = true;
        return route.fulfill({ status: 204, body: "" });
      }
      if (nome === "cancelar_movimentacao") {
        if (String(corpo.p_motivo || "").trim().length < 5) return json(route, 400, { code: "P0001", message: "Escreva o motivo do cancelamento." });
        const mv = db.movimentacoes.find((x) => x.id === corpo.p_id && !x.cancelada_em);
        if (!mv) return json(route, 400, { code: "P0001", message: "Registro não encontrado ou já cancelado." });
        Object.assign(mv, { cancelada_em: new Date().toISOString(), cancelada_por: eu, motivo_cancelamento: corpo.p_motivo });
        return route.fulfill({ status: 204, body: "" });
      }
      return json(route, 404, { message: "função não imitada" });
    }

    const tabelas = {
      perfis: () => db.perfis.filter((p) => p.id === eu || papel === "admin").map(({ id, nome, papel: pp }) => ({ id, nome, papel: pp })),
      pessoas: () => (podeVer(papel) ? db.pessoas : []),
      materiais: () => (podeVer(papel) ? db.materiais : []),
      frotas: () => (podeVer(papel) ? db.frotas : []),
      estoque: () => (podeVer(papel) ? estoque(db) : []),
      historico: () => (podeVer(papel) ? historico(db) : []),
    };

    if (metodo === "GET") {
      if (!tabelas[alvo]) return json(route, 404, { message: `tabela não imitada: ${alvo}` });
      return json(route, 200, aplicar(tabelas[alvo](), params));
    }

    if (metodo === "POST") {
      corpo = texto();
      if (!podeRegistrar(papel)) return json(route, 403, erroRLS(alvo));
      const agora = new Date().toISOString();
      if (alvo === "frotas") {
        if (papel !== "admin") return json(route, 403, erroRLS(alvo));
        const ignorar = /resolution=ignore-duplicates/.test(cab.prefer || "") && params.get("on_conflict") === "numero";
        const feitas = [];
        for (const x of Array.isArray(corpo) ? corpo : [corpo]) {
          const numero = String(x.numero || "").trim().toUpperCase().replace(/\s+/g, " ");
          if (db.frotas.some((f) => f.numero === numero)) {
            if (ignorar) continue;
            return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "frotas_numero_key"' });
          }
          const placa = x.placa ? String(x.placa).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
          const linha = { id: ++db.seq.frotas, numero, descricao: x.descricao || null, placa, ativo: true, criado_em: agora };
          db.frotas.push(linha);
          feitas.push(linha);
        }
        return json(route, 201, feitas);
      }
      if (alvo === "pessoas") {
        if (db.pessoas.some((p) => p.nome.toLowerCase() === corpo.nome.toLowerCase() && (p.matricula || "") === (corpo.matricula || ""))) {
          return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "pessoas_nome_unico"' });
        }
        const linha = { id: ++db.seq.pessoas, nome: corpo.nome, matricula: corpo.matricula, funcao: corpo.funcao, ativo: true, criado_em: agora, criado_por: eu };
        db.pessoas.push(linha);
        return json(route, 201, [linha]);
      }
      if (alvo === "materiais") {
        if (db.materiais.some((m) => m.descricao.toLowerCase() === corpo.descricao.toLowerCase())) {
          return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "materiais_descricao_unica"' });
        }
        if (corpo.foto != null && !RE_FOTO_MOV.test(corpo.foto)) return json(route, 400, { code: "23514", message: "violates check constraint materiais_foto_check" });
        const linha = { id: ++db.seq.materiais, codigo: corpo.codigo, referencia: corpo.referencia ?? null, foto: corpo.foto ?? null, descricao: corpo.descricao, unidade: corpo.unidade, minimo: corpo.minimo || 0, local: corpo.local, ativo: true, criado_em: agora, criado_por: eu };
        db.materiais.push(linha);
        return json(route, 201, [linha]);
      }
      if (alvo === "movimentacoes") {
        const permitidas = ["tipo", "material_id", "quantidade", "foto", "retirante_id", "responsavel_id", "frota_id", "entregue_por", "documento", "destino", "obs", "contado"];
        const sobra = Object.keys(corpo).filter((k) => !permitidas.includes(k));
        if (sobra.length) return json(route, 403, { code: "42501", message: `permission denied for table movimentacoes (${sobra})` });
        if (corpo.tipo === "ajuste") {
          if (papel !== "admin") return json(route, 403, { code: "42501", message: "Só o administrador faz a vistoria do estoque." });
          if (!(corpo.contado >= 0)) return json(route, 400, { code: "P0001", message: "Informe a quantidade contada." });
          const saldoAntes = estoque(db).find((x) => x.id === corpo.material_id).saldo;
          const linha = {
            id: ++db.seq.movimentacoes, tipo: "ajuste", material_id: corpo.material_id,
            quantidade: Math.round((corpo.contado - saldoAntes) * 1000) / 1000, contado: corpo.contado, saldo_antes: saldoAntes,
            foto: null, retirante_id: null, responsavel_id: null, frota_id: null, entregue_por: null, documento: null, destino: null,
            obs: corpo.obs ?? null, registrado_por: eu, registrado_em: agora, cancelada_em: null, cancelada_por: null, motivo_cancelamento: null,
          };
          db.movimentacoes.push(linha);
          return json(route, 201, [{ id: linha.id, quantidade: linha.quantidade, saldo_antes: linha.saldo_antes, contado: linha.contado }]);
        }
        const o = db.objetos.get(corpo.foto);
        if (!RE_FOTO_MOV.test(corpo.foto || "")) return json(route, 400, { code: "23514", message: "violates check constraint movimentacoes_foto_check" });
        if (!o || o.dono !== eu) return json(route, 400, { code: "P0001", message: "A foto não chegou ao servidor. Tire a foto de novo e registre." });
        if (db.movimentacoes.some((x) => x.foto === corpo.foto)) return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "movimentacoes_foto_key"' });
        if (!(corpo.quantidade > 0)) return json(route, 400, { code: "23514", message: "violates check constraint" });
        if (corpo.tipo === "saida" && !corpo.retirante_id) return json(route, 400, { code: "23514", message: 'violates check constraint "saida_tem_retirante"' });
        if (corpo.tipo === "entrada" && corpo.retirante_id) return json(route, 400, { code: "23514", message: 'violates check constraint "entrada_sem_retirante"' });
        if (corpo.tipo === "entrada" && corpo.frota_id) return json(route, 400, { code: "23514", message: 'violates check constraint "entrada_sem_frota"' });
        if (corpo.frota_id && !db.frotas.some((f) => f.id === corpo.frota_id && f.ativo)) return json(route, 400, { code: "P0001", message: "Essa frota está desativada no cadastro." });
        const linha = {
          id: ++db.seq.movimentacoes, ...Object.fromEntries(permitidas.map((k) => [k, corpo[k] ?? null])),
          registrado_por: eu, registrado_em: agora, cancelada_em: null, cancelada_por: null, motivo_cancelamento: null,
        };
        db.movimentacoes.push(linha);
        return json(route, 201, [{ id: linha.id }]);
      }
      return json(route, 404, { message: "não imitado" });
    }

    if (metodo === "PATCH") {
      corpo = texto();
      const lista = { pessoas: db.pessoas, materiais: db.materiais, frotas: db.frotas }[alvo] || null;
      if (!lista) return json(route, 403, { code: "42501", message: `permission denied for table ${alvo}` });
      if (papel !== "admin") return json(route, 200, []); // a política filtra: nenhuma linha
      const alvos = aplicar(lista, params);
      for (const l of alvos) Object.assign(l, corpo);
      return json(route, 200, alvos);
    }

    if (metodo === "DELETE") {
      const lista = { pessoas: db.pessoas, materiais: db.materiais, frotas: db.frotas }[alvo] || null;
      if (!lista) return json(route, 403, { code: "42501", message: `permission denied for table ${alvo}` });
      if (papel !== "admin") return json(route, 200, []);
      const alvos = aplicar(lista, params);
      for (const l of alvos) {
        const usado = db.movimentacoes.some((mv) => (alvo === "materiais" && mv.material_id === l.id) ||
          (alvo === "pessoas" && (mv.retirante_id === l.id || mv.responsavel_id === l.id)) || (alvo === "frotas" && mv.frota_id === l.id));
        if (usado) return json(route, 409, { code: "23503", message: `update or delete on table "${alvo}" violates foreign key constraint` });
      }
      for (const l of alvos) { lista.splice(lista.indexOf(l), 1); db.apagados.push({ tabela: alvo, dados: l, motivo: null, apagado_por: eu }); }
      return json(route, 200, alvos);
    }

    return json(route, 405, { message: "método não imitado" });
  });
}
