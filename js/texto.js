// Funções puras: texto, números, datas, CSV e nomes de arquivo.
// Não tocam na tela nem na rede — o testes/unidade.mjs roda todas no Node.

/** Minúsculas, sem acento e com um espaço só: "  Graxa  AZUL " → "graxa azul". */
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Só letras e números: "0 986-452.041" → "0986452041". Referência de peça
 *  aparece escrita de mil jeitos; assim todos se acham. */
export function compacto(s) {
  return normalizar(s).replace(/[^a-z0-9]/g, "");
}

/** Filtra e ordena uma lista pelo que foi digitado. Cada palavra digitada tem
 *  de aparecer em algum dos campos (ou o termo inteiro, sem espaço nem
 *  pontuação, numa referência); vem primeiro o que COMEÇA com o termo. */
export function filtrar(lista, termo, campos, limite = 30) {
  const palavras = normalizar(termo).split(" ").filter(Boolean);
  if (!palavras.length) return lista.slice(0, limite);
  const t = palavras.join(" ");
  const tc = compacto(termo);
  const achados = [];
  for (const item of lista) {
    const textos = campos(item).filter(Boolean).map(normalizar);
    const tudo = textos.join(" ");
    const porPalavra = palavras.every((p) => tudo.includes(p));
    if (!porPalavra && !(tc.length >= 3 && textos.some((x) => compacto(x).includes(tc)))) continue;
    let nota = 3;
    if (textos.some((x) => x === t)) nota = 0;
    else if (textos.some((x) => x.startsWith(t))) nota = 1;
    else if (textos.some((x) => x.split(" ").some((w) => w.startsWith(palavras[0])))) nota = 2;
    achados.push([nota, item]);
  }
  achados.sort((a, b) => a[0] - b[0]);
  return achados.slice(0, limite).map((a) => a[1]);
}

/** "2,5" → 2.5 · "1.250,75" → 1250.75 · "3" → 3. Inválido → NaN.
 *  Aceita até 3 casas decimais, que é o que o banco guarda. */
export function lerQuantidade(texto) {
  let s = String(texto ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return NaN;
  return Number(s);
}

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export function formatarQtd(n) {
  const v = Number(n);
  return Number.isFinite(v) ? NUM.format(v) : "—";
}

function doisDigitos(n) { return String(n).padStart(2, "0"); }

/** "26/11 14:32" (com o ano quando não é o ano corrente). */
export function quando(iso, agora = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
  const ano = d.getFullYear() === agora.getFullYear() ? "" : `/${d.getFullYear()}`;
  return `${dia}${ano} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** "26/11/2026 14:32". */
export function dataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Meia-noite (hora local) de `dias` dias atrás, em ISO. 0 = hoje. */
export function inicioDoDia(dias = 0, agora = new Date()) {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

/** Célula de CSV que não vira fórmula no Excel (=, +, -, @ no começo). */
export function celulaCSV(v) {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV com ";" e BOM, que é como o Excel em português abre sem estragar acento. */
export function paraCSV(cabecalho, linhas) {
  const l = [cabecalho, ...linhas].map((r) => r.map(celulaCSV).join(";"));
  return "﻿" + l.join("\r\n") + "\r\n";
}

/** O termo de busca vai dentro de um filtro `or=(...)` do PostgREST: vírgula,
 *  parêntese, aspas, asterisco e barra invertida quebrariam o filtro. */
export function termoSeguro(s) {
  return String(s ?? "").replace(/[,()"*\\%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "2026/11/<uuid>.jpg" — o mesmo padrão que o banco confere. */
export function caminhoFoto(uuid, data = new Date()) {
  const id = String(uuid).toLowerCase();
  if (!UUID.test(id)) throw new Error("Identificador de foto inválido.");
  return `${data.getFullYear()}/${doisDigitos(data.getMonth() + 1)}/${id}.jpg`;
}

/** A miniatura mora ao lado da foto: "<uuid>-p.jpg". */
export function miniaturaDe(caminho) {
  return String(caminho).replace(/\.jpg$/, "-p.jpg");
}

/** Cabe em `max` × `max` sem distorcer e sem aumentar. */
export function dimensoes(largura, altura, max) {
  const w = Math.max(1, Math.round(largura)), h = Math.max(1, Math.round(altura));
  const f = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
}

/** Situação do saldo de um material: "negativo" (saiu mais do que entrou —
 *  divergência), "baixo" (no mínimo ou abaixo) ou "ok". */
export function situacaoSaldo(saldo, minimo) {
  const s = Number(saldo) || 0, m = Number(minimo) || 0;
  if (s < 0) return "negativo";
  if (m > 0 && s <= m) return "baixo";
  if (s === 0) return "zerado";
  return "ok";
}

/** A lista de frotas colada do Excel (ou digitada), uma por linha:
 *    C-433                          só o número
 *    C-433 <tab> Scania R450 <tab> ABC1D23   colunas do Excel
 *    C-433; Scania R450; ABC-1D23   ou com ponto e vírgula
 *    C-433 - Scania R450            ou com " - "
 *  A placa é reconhecida pelo formato (antigo ou Mercosul). Linha de
 *  cabeçalho ("Frota", "Número") e repetida ficam de fora. */
export function lerListaDeFrotas(texto) {
  const PLACA = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;
  const vistos = new Set();
  const frotas = [];
  for (const bruta of String(texto ?? "").split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    let partes = linha.includes("\t") ? linha.split("\t")
      : linha.includes(";") ? linha.split(";")
        : linha.split(/\s+[-–—]\s+/);
    partes = partes.map((x) => x.trim()).filter(Boolean);
    if (!partes.length) continue;
    const numero = partes[0].toUpperCase().replace(/\s+/g, " ");
    if (/^(FROTA|FROTAS|N[ÚU]MERO|NUMERO|N[ºO°]?)$/.test(numero) || numero.length > 20) continue;
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    let placa = null;
    const resto = [];
    for (const x of partes.slice(1)) {
      const p = x.toUpperCase().replace(/\s/g, "");
      if (!placa && PLACA.test(p)) placa = p.replace("-", "");
      else resto.push(x);
    }
    frotas.push({ numero, descricao: resto.join(" · ").slice(0, 80) || null, placa });
  }
  return frotas;
}

export const PAPEIS = {
  pendente: "Aguardando liberação",
  consulta: "Só consulta",
  operador: "Registra entradas e saídas",
  admin: "Administrador",
};

export const UNIDADES = ["UN", "PC", "KG", "L", "M", "M²", "CX", "PAR", "JG", "RL", "GL", "LT", "KIT"];
