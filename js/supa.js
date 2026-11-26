// Conversa com o Supabase: entrar, ler e gravar na API, enviar e abrir fotos.
//
// Por `fetch` direto, sem a biblioteca oficial: são poucas chamadas, e a
// biblioteca pesaria mais do que o site inteiro — no celular com sinal fraco,
// cada quilobyte conta.

import { SUPABASE, BUCKET } from "./config.js";

const BASE = SUPABASE.url.replace(/\/+$/, "");
const CHAVE = SUPABASE.chave;
const GUARDA_SESSAO = "sad.sessao";
const GUARDA_URLS = "sad.fotos";
const VALIDADE_URL = 24 * 3600; // segundos que um endereço de foto vale

export class ErroBanco extends Error {
  constructor(mensagem, status = 0, codigo = "") {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

// ── a sessão, guardada neste aparelho ──────────────────────────────────────

function lerGuardado(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || "null"); } catch { return null; }
}
function guardar(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* modo privado ou cheio: segue sem guardar */ }
}

let sessao = (() => {
  const s = lerGuardado(GUARDA_SESSAO);
  return s && s.access_token && s.refresh_token ? s : null;
})();

const aoCair = new Set();
/** Avisa quando o servidor encerrou a sessão (senha trocada, acesso removido). */
export function quandoSessaoCair(fn) { aoCair.add(fn); }

function encerrar(motivo) {
  sessao = null;
  guardar(GUARDA_SESSAO, null);
  for (const fn of aoCair) { try { fn(motivo); } catch { /* segue */ } }
}

function guardarSessao(j) {
  sessao = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    id: (j.user && j.user.id) || (sessao && sessao.id) || "",
    email: (j.user && j.user.email) || (sessao && sessao.email) || "",
  };
  guardar(GUARDA_SESSAO, sessao);
}

export function logado() { return !!sessao; }
export function eu() { return sessao ? { id: sessao.id, email: sessao.email } : null; }

// ── a rede ─────────────────────────────────────────────────────────────────

async function buscar(url, opcoes = {}, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opcoes, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new ErroBanco("O servidor demorou demais para responder. Confira o sinal e tente de novo.", 0, "tempo");
    }
    throw new ErroBanco("Sem conexão com o servidor. Confira o sinal e tente de novo.", 0, "rede");
  } finally {
    clearTimeout(t);
  }
}

/** As mensagens do Supabase vêm em inglês e técnicas; aqui viram o que fazer. */
export function traduzir(mensagem, codigo = "") {
  const m = String(mensagem || "");
  const s = m.toLowerCase();
  const c = String(codigo || "");
  if (s.includes("invalid login")) return "E-mail ou senha não conferem.";
  if (s.includes("email not confirmed")) {
    return "Sua conta ainda não foi liberada. Peça ao administrador para liberar o seu acesso.";
  }
  if (s.includes("already registered") || s.includes("already been registered")) {
    return "Já existe uma conta com esse e-mail. É só entrar com a senha.";
  }
  if (s.includes("password should be") || s.includes("weak password")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (s.includes("should be different")) return "A senha nova é igual à atual. Escolha outra.";
  if (s.includes("unable to validate email") || (s.includes("email") && s.includes("invalid"))) {
    return "Esse e-mail não parece válido.";
  }
  if (s.includes("rate limit") || s.includes("sending confirmation") || s.includes("error sending")) {
    return "O Supabase não conseguiu mandar o e-mail de confirmação. O administrador precisa " +
      "desligar \"Confirm email\" no painel do Supabase (Authentication → Sign In / Providers → Email).";
  }
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) {
    return "A criação de contas está desligada no Supabase.";
  }
  if (s.includes("jwt expired") || s.includes("token is expired")) return "Sua sessão venceu. Entre de novo.";
  if (s.includes("pessoas_nome_unico")) return "Já existe uma pessoa com esse nome (e essa matrícula).";
  if (s.includes("materiais_descricao_unica")) return "Já existe um material com essa descrição.";
  if (s.includes("materiais_codigo_unico")) return "Já existe um material com esse código.";
  if (s.includes("movimentacoes_foto_key")) return "Essa foto já foi usada em outro registro. Tire outra.";
  if (s.includes("mime type") || s.includes("invalid_mime_type")) return "A foto precisa estar em JPEG.";
  if (s.includes("maximum allowed size") || s.includes("payload too large")) return "A foto ficou grande demais.";
  if (c === "23514" || s.includes("violates check constraint")) {
    return "Algum campo ficou fora do permitido (vazio ou comprido demais).";
  }
  if (c === "42501" || s.includes("row-level security") || s.includes("permission denied")) {
    // As mensagens que o próprio banco escreve em português já dizem o porquê.
    if (/[áéíóúãõç]/i.test(m) && !s.includes("permission denied")) return m;
    return "O seu acesso não permite fazer isso.";
  }
  if (s === "failed to fetch" || s.includes("networkerror")) return "Sem conexão com o servidor.";
  return m || "Algo deu errado. Tente de novo.";
}

async function erroDe(r) {
  const j = await r.json().catch(() => ({}));
  const m = j.error_description || j.msg || j.message || j.error || `${r.status} ${r.statusText}`;
  const codigo = String(j.code || j.error_code || j.statusCode || "");
  return new ErroBanco(traduzir(m, codigo), r.status, codigo);
}

// ── entrar e sair ──────────────────────────────────────────────────────────

async function auth(caminho, corpo) {
  const r = await buscar(`${BASE}/auth/v1/${caminho}`, {
    method: "POST",
    headers: { apikey: CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw await erroDe(r);
  return r.json();
}

export async function entrar(email, senha) {
  const j = await auth("token?grant_type=password", { email: String(email).trim().toLowerCase(), password: senha });
  guardarSessao(j);
  return eu();
}

/** Cria a conta. Com "Confirm email" desligado o Supabase já devolve a sessão;
 *  ligado, a conta espera — e liberar pelo site também a confirma. */
export async function criarConta(email, senha, nome) {
  const j = await auth("signup", {
    email: String(email).trim().toLowerCase(), password: senha, data: { nome: String(nome).trim() },
  });
  if (j && j.access_token) { guardarSessao(j); return { entrou: true }; }
  return { entrou: false };
}

let renovando = null;
async function renovar() {
  if (!sessao) throw new ErroBanco("Entre com o seu e-mail e senha.", 401, "sem_sessao");
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const r = await buscar(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: CHAVE, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: sessao.refresh_token }),
      });
      if (!r.ok) {
        const e = await erroDe(r);
        // O servidor disse que a credencial não vale mais: não adianta insistir.
        if (r.status >= 400 && r.status < 500) encerrar("Sua sessão terminou. Entre de novo.");
        throw e;
      }
      guardarSessao(await r.json());
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

async function token() {
  if (!sessao) throw new ErroBanco("Entre com o seu e-mail e senha.", 401, "sem_sessao");
  if (Date.now() > sessao.expira - 60000) await renovar();
  return sessao.access_token;
}

export async function sair() {
  const s = sessao;
  encerrar("");
  guardar(GUARDA_URLS, null);
  if (s) {
    // Só deste aparelho (`scope=local`): os outros aparelhos da pessoa seguem.
    buscar(`${BASE}/auth/v1/logout?scope=local`, {
      method: "POST", headers: { apikey: CHAVE, Authorization: `Bearer ${s.access_token}` },
    }, 8000).catch(() => {});
  }
}

export async function trocarSenha(nova) {
  await pedir(`${BASE}/auth/v1/user`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: nova }),
  });
}

/** O que o projeto diz de si (não exige estar logado). */
export async function opcoesDoProjeto() {
  const r = await buscar(`${BASE}/auth/v1/settings`, { headers: { apikey: CHAVE } }, 10000);
  if (!r.ok) throw await erroDe(r);
  return r.json();
}

// ── a API ──────────────────────────────────────────────────────────────────

async function pedir(url, opcoes = {}, tentativa = 0) {
  const tk = await token();
  const r = await buscar(url, {
    ...opcoes,
    headers: { apikey: CHAVE, Authorization: `Bearer ${tk}`, ...(opcoes.headers || {}) },
  });
  if (r.status === 401 && tentativa === 0) {
    await renovar();
    return pedir(url, opcoes, 1);
  }
  if (!r.ok) throw await erroDe(r);
  return r;
}

/** GET /rest/v1/<caminho>. Ex.: ler("estoque?select=*&order=descricao"). */
export async function ler(caminho) {
  const r = await pedir(`${BASE}/rest/v1/${caminho}`);
  return r.json();
}

/** Lê tudo, de mil em mil (o Supabase entrega no máximo 1000 por pedido).
 *  O `caminho` precisa ter uma ordem que não empate (termine em `,id`). */
export async function lerTudo(caminho, passo = 1000) {
  const tudo = [];
  for (let de = 0; de < 200000; de += passo) {
    const pg = await ler(`${caminho}&limit=${passo}&offset=${de}`);
    tudo.push(...pg);
    if (pg.length < passo) break;
  }
  return tudo;
}

/** Insere uma linha e devolve o que o banco gravou. */
export async function inserir(tabela, linha) {
  const r = await pedir(`${BASE}/rest/v1/${tabela}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(linha),
  });
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}

/** Atualiza as linhas do filtro. Nenhuma linha alterada = o banco recusou. */
export async function atualizar(tabela, filtro, campos) {
  const r = await pedir(`${BASE}/rest/v1/${tabela}?${filtro}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(campos),
  });
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) throw new ErroBanco("O seu acesso não permite alterar esse cadastro.", 403, "42501");
  return j[0];
}

export async function rpc(nome, args = {}) {
  const r = await pedir(`${BASE}/rest/v1/rpc/${nome}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  if (r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ── as fotos ───────────────────────────────────────────────────────────────

/** Envia uma foto. Se ela já tinha chegado numa tentativa anterior, segue. */
export async function enviarFoto(caminho, blob) {
  try {
    await pedir(`${BASE}/storage/v1/object/${BUCKET}/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" },
      body: blob,
    }, 0);
  } catch (e) {
    if (e.status === 409 || e.codigo === "409" || /already exists|duplicate/i.test(e.message)) return;
    throw e;
  }
}

/** Endereços assinados das fotos, guardados por um dia neste aparelho: o mesmo
 *  endereço de novo faz o navegador usar a foto que já baixou. */
export async function enderecosDasFotos(caminhos) {
  const agora = Date.now();
  const guardadas = lerGuardado(GUARDA_URLS) || {};
  const faltam = [...new Set(caminhos.filter(Boolean))]
    .filter((c) => !(guardadas[c] && guardadas[c].ate > agora + 120000));
  for (let i = 0; i < faltam.length; i += 100) {
    const lote = faltam.slice(i, i + 100);
    const r = await pedir(`${BASE}/storage/v1/object/sign/${BUCKET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: VALIDADE_URL, paths: lote }),
    });
    const lista = await r.json();
    for (const it of Array.isArray(lista) ? lista : []) {
      if (it && it.signedURL && !it.error) {
        guardadas[it.path] = { u: `${BASE}/storage/v1${it.signedURL}`, ate: agora + (VALIDADE_URL - 3600) * 1000 };
      }
    }
  }
  if (faltam.length) {
    for (const [c, v] of Object.entries(guardadas)) if (!v || v.ate < agora) delete guardadas[c];
    const chaves = Object.keys(guardadas);
    if (chaves.length > 600) for (const c of chaves.slice(0, chaves.length - 600)) delete guardadas[c];
    guardar(GUARDA_URLS, guardadas);
  }
  const saida = {};
  for (const c of caminhos) saida[c] = (guardadas[c] && guardadas[c].u) || "";
  return saida;
}
