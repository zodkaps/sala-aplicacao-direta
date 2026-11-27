// O que o site guarda em memória: quem está usando, as pessoas e os materiais
// (com o saldo). As duas listas são pequenas, então vêm inteiras e a busca é
// feita aqui mesmo — instantânea, sem esperar a rede a cada letra.
// Uma cópia fica no aparelho para o site abrir rápido; ela some ao sair.

import * as supa from "./supa.js";

const GUARDA = "sad.cadastros";
const GUARDA_PERFIL = "sad.perfil";
const GUARDA_RECENTES = "sad.recentes";

export const estado = {
  perfil: null,          // { id, nome, papel }
  pessoas: [],           // { id, nome, matricula, funcao, ativo }
  materiais: [],         // linhas da vista `estoque` (com saldo)
  frotas: [],            // { id, numero, descricao, placa, ativo }
  carregadoEm: 0,
};

function lerLocal(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || "null"); } catch { return null; }
}
function gravarLocal(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* segue sem guardar */ }
}

export function papel() { return (estado.perfil && estado.perfil.papel) || "pendente"; }
export function podeVer() { return ["consulta", "operador", "admin"].includes(papel()); }
export function podeRegistrar() { return ["operador", "admin"].includes(papel()); }
export function ehAdmin() { return papel() === "admin"; }

export async function carregarPerfil() {
  const quem = supa.eu();
  if (!quem) { estado.perfil = null; return null; }
  try {
    const r = await supa.ler(`perfis?select=id,nome,papel&id=eq.${encodeURIComponent(quem.id)}`);
    estado.perfil = r[0] || { id: quem.id, nome: "", papel: "pendente" };
    gravarLocal(GUARDA_PERFIL, estado.perfil);
  } catch (e) {
    // Sem rede: vale o último perfil visto neste aparelho, se for da mesma conta.
    const g = lerLocal(GUARDA_PERFIL);
    if (g && g.id === quem.id && e.status === 0) estado.perfil = g;
    else throw e;
  }
  return estado.perfil;
}

/** Abre com a cópia do aparelho (se houver) e atualiza pela rede. */
export function cadastrosGuardados() {
  const g = lerLocal(GUARDA);
  const quem = supa.eu();
  if (g && quem && g.dono === quem.id) {
    estado.pessoas = g.pessoas || [];
    estado.materiais = g.materiais || [];
    estado.frotas = g.frotas || [];
    return true;
  }
  return false;
}

export async function carregarCadastros() {
  const [pessoas, materiais, frotas] = await Promise.all([
    supa.lerTudo("pessoas?select=id,nome,matricula,funcao,ativo&order=nome,id"),
    supa.lerTudo("estoque?select=id,codigo,referencia,descricao,unidade,minimo,local,ativo,saldo,movimentos,ultima,foto,ultima_vistoria&order=descricao,id"),
    supa.lerTudo("frotas?select=id,numero,descricao,placa,ativo&order=numero,id"),
  ]);
  estado.pessoas = pessoas;
  estado.frotas = frotas;
  estado.materiais = materiais.map((m) => ({ ...m, saldo: Number(m.saldo), minimo: Number(m.minimo) }));
  estado.carregadoEm = Date.now();
  const quem = supa.eu();
  gravarLocal(GUARDA, { dono: quem && quem.id, pessoas: estado.pessoas, materiais: estado.materiais, frotas: estado.frotas });
}

/** Atualiza só se a cópia tiver mais de `idade` ms. */
export async function atualizarSeVelho(idade = 60000) {
  if (Date.now() - estado.carregadoEm > idade) await carregarCadastros();
}

export function esquecerTudo() {
  estado.perfil = null; estado.pessoas = []; estado.materiais = []; estado.frotas = []; estado.carregadoEm = 0;
  gravarLocal(GUARDA, null);
  gravarLocal(GUARDA_PERFIL, null);
}

export const pessoaPorId = (id) => estado.pessoas.find((p) => p.id === id) || null;
export const materialPorId = (id) => estado.materiais.find((m) => m.id === id) || null;
export const frotaPorId = (id) => estado.frotas.find((f) => f.id === id) || null;

/** Tira da memória o que o administrador apagou. */
export const removerMaterial = (id) => { estado.materiais = estado.materiais.filter((x) => x.id !== id); };
export const removerPessoa = (id) => { estado.pessoas = estado.pessoas.filter((x) => x.id !== id); };
export const removerFrota = (id) => { estado.frotas = estado.frotas.filter((x) => x.id !== id); };

export function guardarFrotas(lista) {
  for (const f of lista) {
    const i = estado.frotas.findIndex((x) => x.id === f.id);
    if (i >= 0) estado.frotas[i] = { ...estado.frotas[i], ...f }; else estado.frotas.push(f);
  }
  estado.frotas.sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
}

export function guardarPessoa(p) {
  const i = estado.pessoas.findIndex((x) => x.id === p.id);
  if (i >= 0) estado.pessoas[i] = { ...estado.pessoas[i], ...p }; else estado.pessoas.push(p);
  estado.pessoas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function guardarMaterial(m) {
  const i = estado.materiais.findIndex((x) => x.id === m.id);
  const base = i >= 0 ? estado.materiais[i] : { saldo: 0, movimentos: 0, ultima: null };
  const novo = { ...base, ...m, saldo: Number(m.saldo ?? base.saldo), minimo: Number(m.minimo ?? base.minimo ?? 0) };
  if (i >= 0) estado.materiais[i] = novo; else estado.materiais.push(novo);
  estado.materiais.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}

/** Depois de registrar, o saldo da tela já muda (a próxima leitura confirma). */
export function aplicarMovimento(materialId, tipo, quantidade) {
  const m = materialPorId(materialId);
  if (!m) return;
  m.saldo = Math.round((m.saldo + (tipo === "entrada" ? 1 : -1) * quantidade) * 1000) / 1000;
  m.movimentos = (m.movimentos || 0) + 1;
  m.ultima = new Date().toISOString();
}

// ── os mais usados neste aparelho aparecem primeiro ────────────────────────

export function recentes(tipo) {
  const g = lerLocal(GUARDA_RECENTES) || {};
  return Array.isArray(g[tipo]) ? g[tipo] : [];
}

export function lembrar(tipo, id) {
  if (id == null) return;
  const g = lerLocal(GUARDA_RECENTES) || {};
  const l = (Array.isArray(g[tipo]) ? g[tipo] : []).filter((x) => x !== id);
  l.unshift(id);
  g[tipo] = l.slice(0, 12);
  gravarLocal(GUARDA_RECENTES, g);
}
