// Testes que rodam no Node, sem navegador: as funções puras, a lista do
// service worker e as regras de segurança do código.
//   node testes/unidade.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../js/texto.js";
import { filtroHistorico } from "../js/telas/comum.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function teste(nome, fn) {
  try { fn(); n += 1; } catch (e) { console.error(`✗ ${nome}\n  ${e.message}`); process.exitCode = 1; }
}

teste("normalizar tira acento, caixa e espaço", () => {
  assert.equal(T.normalizar("  Graxa  AZUL Lítio "), "graxa azul litio");
  assert.equal(T.normalizar(null), "");
});

teste("filtrar acha por pedaço de palavra, sem acento, e põe o começo primeiro", () => {
  const l = [
    { id: 1, d: "Óleo hidráulico 68", c: "100" },
    { id: 2, d: "Filtro de óleo", c: "200" },
    { id: 3, d: "Graxa", c: "OLEO-X" },
  ];
  const r = T.filtrar(l, "oleo", (x) => [x.d, x.c]);
  assert.deepEqual(r.map((x) => x.id), [1, 3, 2]);
  assert.deepEqual(T.filtrar(l, "oleo filtro", (x) => [x.d]).map((x) => x.id), [2]);
  assert.deepEqual(T.filtrar(l, "200", (x) => [x.d, x.c]).map((x) => x.id), [2]);
  assert.equal(T.filtrar(l, "", (x) => [x.d], 2).length, 2);
});

teste("lerQuantidade entende vírgula e recusa lixo", () => {
  assert.equal(T.lerQuantidade("2,5"), 2.5);
  assert.equal(T.lerQuantidade("1.250,75"), 1250.75);
  assert.equal(T.lerQuantidade(" 3 "), 3);
  assert.equal(T.lerQuantidade("0,125"), 0.125);
  assert.ok(Number.isNaN(T.lerQuantidade("")));
  assert.ok(Number.isNaN(T.lerQuantidade("dois")));
  assert.ok(Number.isNaN(T.lerQuantidade("1,2345")));
  assert.ok(Number.isNaN(T.lerQuantidade("-1")));
});

teste("formatarQtd no jeito brasileiro", () => {
  assert.equal(T.formatarQtd(2.5), "2,5");
  assert.equal(T.formatarQtd(1000), "1.000");
  assert.equal(T.formatarQtd(-3), "-3");
  assert.equal(T.formatarQtd("x"), "—");
});

teste("quando e dataHora", () => {
  const agora = new Date(2026, 10, 26, 15, 0);
  assert.equal(T.quando(new Date(2026, 10, 26, 9, 5).toISOString(), agora), "26/11 09:05");
  assert.equal(T.quando(new Date(2025, 0, 2, 7, 0).toISOString(), agora), "02/01/2025 07:00");
  assert.equal(T.dataHora(new Date(2026, 10, 26, 9, 5).toISOString()), "26/11/2026 09:05");
  assert.equal(T.quando(null), "");
});

teste("inicioDoDia é meia-noite local", () => {
  const agora = new Date(2026, 10, 26, 15, 0);
  const d = new Date(T.inicioDoDia(0, agora));
  assert.equal(d.getHours(), 0);
  assert.equal(d.getDate(), 26);
  assert.equal(new Date(T.inicioDoDia(6, agora)).getDate(), 20);
});

teste("CSV não vira fórmula e abre no Excel", () => {
  assert.equal(T.celulaCSV("=CMD()"), "'=CMD()");
  assert.equal(T.celulaCSV("+55"), "'+55");
  assert.equal(T.celulaCSV("a;b"), '"a;b"');
  assert.equal(T.celulaCSV('diz "oi"'), '"diz ""oi"""');
  assert.equal(T.celulaCSV(null), "");
  const csv = T.paraCSV(["A", "B"], [["1", "=x"]]);
  assert.ok(csv.startsWith("\ufeffA;B\r\n1;'=x"));
});

teste("termoSeguro não quebra o filtro do PostgREST", () => {
  assert.equal(T.termoSeguro('graxa, (azul) "x"*\\'), "graxa azul x");
  assert.equal(T.termoSeguro("a".repeat(100)).length, 60);
});

teste("o nome da foto bate com o que o banco aceita", () => {
  const sql = readFileSync(join(RAIZ, "sql/01_esquema.sql"), "utf8");
  const reMov = new RegExp(sql.match(/check \(foto ~ '([^']+)'\)/)[1]);
  const reObj = new RegExp(sql.match(/name ~ '([^']+)'\)/)[1]);
  const c = T.caminhoFoto("0f8fad5b-d9cb-469f-a165-70867728950e", new Date(2026, 0, 5));
  assert.equal(c, "2026/01/0f8fad5b-d9cb-469f-a165-70867728950e.jpg");
  assert.ok(reMov.test(c), "a foto da movimentação");
  assert.ok(reObj.test(c), "o arquivo da foto");
  assert.ok(reObj.test(T.miniaturaDe(c)), "o arquivo da miniatura");
  assert.ok(!reMov.test(T.miniaturaDe(c)), "a miniatura não serve de foto de registro");
  assert.throws(() => T.caminhoFoto("../../x"));
});

teste("dimensoes cabe sem distorcer e sem aumentar", () => {
  assert.deepEqual(T.dimensoes(4000, 3000, 1280), { w: 1280, h: 960 });
  assert.deepEqual(T.dimensoes(4032, 3024, 1024), { w: 1024, h: 768 });
  assert.deepEqual(T.dimensoes(3000, 4000, 1280), { w: 960, h: 1280 });
  assert.deepEqual(T.dimensoes(800, 600, 1280), { w: 800, h: 600 });
});

teste("situação do saldo", () => {
  assert.equal(T.situacaoSaldo(-1, 0), "negativo");
  assert.equal(T.situacaoSaldo(2, 5), "baixo");
  assert.equal(T.situacaoSaldo(5, 5), "baixo");
  assert.equal(T.situacaoSaldo(0, 0), "zerado");
  assert.equal(T.situacaoSaldo(6, 5), "ok");
});

teste("filtroHistorico monta os filtros do PostgREST", () => {
  assert.equal(filtroHistorico({ tipo: "saida" }), "&tipo=eq.saida");
  assert.equal(filtroHistorico({ tipo: "qualquer" }), "");
  assert.equal(filtroHistorico({ materialId: "7" }), "&material_id=eq.7");
  assert.equal(filtroHistorico({ pessoaId: 3, termo: "x" }), "&or=(retirante_id.eq.3,responsavel_id.eq.3)");
  const q = decodeURIComponent(filtroHistorico({ termo: "frota 1,2" }));
  assert.ok(q.startsWith('&or=(material.ilike."*frota 1 2*",'), q);
  assert.ok(filtroHistorico({ desde: "2026-11-26T03:00:00.000Z" }).includes("registrado_em=gte.2026-11-26T03%3A00"));
});

// ── o service worker guarda todos os arquivos do site ──
function arquivos(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
}

teste("sw.js lista todo arquivo de js/, css/, img/ e fontes/ (e só arquivos que existem)", () => {
  const sw = readFileSync(join(RAIZ, "sw.js"), "utf8");
  const lista = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  for (const d of ["js", "css", "img", "fontes"]) {
    for (const f of arquivos(join(RAIZ, d)).filter((x) => !x.endsWith(".txt"))) {
      const r = relative(RAIZ, f).split("\\").join("/");
      assert.ok(lista.includes(r), `falta no sw.js: ${r}`);
    }
  }
  for (const f of lista) assert.ok(existsSync(join(RAIZ, f)), `o sw.js lista um arquivo que não existe: ${f}`);
});

// ── segurança do código ──
teste("texto de gente nunca entra por innerHTML/outerHTML/insertAdjacentHTML", () => {
  for (const f of arquivos(join(RAIZ, "js"))) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(s), relative(RAIZ, f));
  }
});

teste("index.html: CSP fechada e nenhum script embutido", () => {
  const h = readFileSync(join(RAIZ, "index.html"), "utf8");
  const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(csp.includes("script-src 'self'") && !csp.includes("unsafe"), csp);
  assert.ok(csp.includes("connect-src 'self' https://ogaaapaondalugvezdtd.supabase.co"), csp);
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(h), "script embutido no HTML");
  assert.ok(!/ on[a-z]+="/.test(h), "atributo on…= no HTML");
});

teste("a chave do config.js é a publicável (nunca a secreta)", () => {
  const c = readFileSync(join(RAIZ, "js/config.js"), "utf8");
  assert.ok(/chave: "sb_publishable_[A-Za-z0-9_-]+"/.test(c));
  assert.ok(!/service_role|sb_secret_/.test(c.replace(/\/\/.*$/gm, "")));
});

teste(":hover só dentro de @media (hover: hover)", () => {
  const css = readFileSync(join(RAIZ, "css/app.css"), "utf8");
  const i = css.indexOf("@media (hover: hover)");
  assert.ok(i > 0);
  assert.ok(!css.slice(0, i).includes(":hover"), ":hover fora do @media");
});

console.log(process.exitCode ? `\nfalhou (${n} passaram)` : `✓ ${n} testes de unidade passaram`);
