// Testes que rodam no Node, sem navegador: as funções puras, a lista do
// service worker e as regras de segurança do código.
//   node testes/unidade.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../js/texto.js";
import { filtroHistorico } from "../js/telas/comum.js";
import * as QR from "../js/qr.js";
import * as FN from "../supabase/functions/acessos/logica.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const pendentes = [];
function teste(nome, fn) {
  const falhou = (e) => { console.error(`✗ ${nome}\n  ${e.message}`); process.exitCode = 1; };
  try {
    const r = fn();
    if (r && typeof r.then === "function") pendentes.push(r.then(() => { n += 1; }, falhou));
    else n += 1;
  } catch (e) { falhou(e); }
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

teste("referência se acha sem espaço, ponto, barra ou traço", () => {
  assert.equal(T.compacto(" 0 986-452.041 "), "0986452041");
  const l = [{ id: 1, d: "Filtro de óleo", r: "0 986 452 041" }, { id: 2, d: "Graxa", r: "SKF LGWA 2/1" }];
  assert.deepEqual(T.filtrar(l, "0986452041", (x) => [x.d, x.r]).map((x) => x.id), [1]);
  assert.deepEqual(T.filtrar(l, "lgwa21", (x) => [x.d, x.r]).map((x) => x.id), [2]);
  assert.deepEqual(T.filtrar(l, "ab", (x) => [x.d, x.r]).map((x) => x.id), [], "termo curto não casa por pedaço compacto");
});

teste("lista de frotas colada do Excel", () => {
  const r = T.lerListaDeFrotas("Frota\tModelo\tPlaca\r\nc-433\tScania R450\tABC-1D23\nC-433\trepetida\n\nT-12; Volvo FH; XYZ9876\nM-07 - Munck Hyva\n  k  1 \n" + "X".repeat(21));
  assert.deepEqual(r, [
    { numero: "C-433", descricao: "Scania R450", placa: "ABC1D23" },
    { numero: "T-12", descricao: "Volvo FH", placa: "XYZ9876" },
    { numero: "M-07", descricao: "Munck Hyva", placa: null },
    { numero: "K 1", descricao: null, placa: null },
  ]);
  assert.deepEqual(T.lerListaDeFrotas(""), []);
});

teste("filtroHistorico: frota e busca por referência e frota", () => {
  assert.equal(filtroHistorico({ frotaId: "9" }), "&frota_id=eq.9");
  const q = decodeURIComponent(filtroHistorico({ termo: "c-433" }));
  assert.ok(q.includes('referencia.ilike."*c-433*"') && q.includes('frota.ilike."*c-433*"'), q);
});

teste("todo ícone usado nas telas existe", () => {
  const ic = readFileSync(join(RAIZ, "js/icones.js"), "utf8");
  const existentes = new Set([...ic.matchAll(/^  ([a-z]+): '/gm)].map((m) => m[1]));
  for (const f of arquivos(join(RAIZ, "js"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/icone\("([a-z]+)"/g)) {
      assert.ok(existentes.has(m[1]), `${relative(RAIZ, f)} usa o ícone "${m[1]}", que não existe`);
    }
  }
  const app = readFileSync(join(RAIZ, "js/app.js"), "utf8");
  for (const m of app.matchAll(/\["[a-z]*", "[^"]+", "([a-z]+)", \(\)/g)) assert.ok(existentes.has(m[1]), `menu: ícone "${m[1]}"`);
});

// ── o QR Code das etiquetas ──
// Os exemplos da norma ISO/IEC 18004 e um leitor que lê cada QR gerado de volta.

/** Lê um QR (grade de módulos) e devolve o texto, conferindo no caminho o
 *  formato (as duas cópias), a correção de cada bloco e os padrões fixos. */
function lerQR(mod) {
  const n = mod.length, v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, `tamanho ${n}`);
  const b = (x, y) => (mod[y][x] ? 1 : 0);
  // os três quadrados dos cantos (7×7) com a borda clara
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      assert.equal(b(x, y), d !== 2 && d !== 4 ? 1 : 0, `canto (${cx},${cy}) em (${x},${y})`);
    }
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(b(i, 6), i % 2 === 0 ? 1 : 0); assert.equal(b(6, i), i % 2 === 0 ? 1 : 0); }
  assert.equal(b(8, n - 8), 1, "o módulo escuro fixo");
  // formato: primeira cópia (perto do canto de cima à esquerda) e segunda
  const p1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const p2 = [...Array(8)].map((_, i) => [n - 1 - i, 8]).concat([...Array(7)].map((_, k) => [8, n - 7 + k]));
  const f1 = p1.reduce((a, [x, y], i) => a | (b(x, y) << i), 0);
  const f2 = p2.reduce((a, [x, y], i) => a | (b(x, y) << i), 0);
  assert.equal(f1, f2, "as duas cópias do formato");
  let mascara = -1;
  for (let m = 0; m < 8; m++) if (QR.bitsDeFormato(0, m) === f1) mascara = m;
  assert.ok(mascara >= 0, "formato do nível M não encontrado");
  // os bits de dados, sem a máscara
  const bits = QR.ordemDosDados(v).map(([x, y]) => (mod[y][x] !== QR.mascaraInverte(mascara, x, y) ? 1 : 0));
  const cod = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cod.push(bits.slice(i, i + 8).reduce((a, x) => (a << 1) | x, 0));
  // desentrelaça os blocos e confere a correção de cada um
  const nb = QR.BLOCOS[v], ecc = QR.ECC_POR_BLOCO[v], total = cod.length;
  const curtos = nb - (total % nb), tamCurto = Math.floor(total / nb);
  const blocos = [...Array(nb)].map((_, i) => ({ dados: [], ecc: [], tam: tamCurto - ecc + (i < curtos ? 0 : 1) }));
  let k = 0;
  for (let i = 0; i < tamCurto - ecc + 1; i++) for (const bl of blocos) if (i < bl.tam) bl.dados.push(cod[k++]);
  for (let i = 0; i < ecc; i++) for (const bl of blocos) bl.ecc.push(cod[k++]);
  for (const bl of blocos) assert.deepEqual(QR.correcaoRS(bl.dados, ecc), bl.ecc, "correção de um bloco");
  const dados = blocos.flatMap((bl) => bl.dados);
  // modo byte, tamanho e os bytes
  const fluxo = dados.flatMap((x) => [...Array(8)].map((_, i) => (x >>> (7 - i)) & 1));
  const ler = (q) => { const r = fluxo.splice(0, q).reduce((a, x) => (a << 1) | x, 0); return r; };
  assert.equal(ler(4), 0b0100, "modo byte");
  const qtd = ler(v <= 9 ? 8 : 16);
  return new TextDecoder().decode(Uint8Array.from([...Array(qtd)].map(() => ler(8))));
}

teste("QR: correção Reed-Solomon igual ao exemplo da norma (\"01234567\", 1-M)", () => {
  const dados = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(QR.correcaoRS(dados, 10), [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

teste("QR: bits de formato e de versão iguais às tabelas da norma", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((m) => QR.bitsDeFormato(0, m)),
    [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0], "nível M, máscaras 0 a 7");
  assert.equal(QR.bitsDeFormato(1, 0), 0x77c4, "nível L, máscara 0");
  assert.equal(QR.bitsDeVersao(7), 0x07c94, "versão 7");
  assert.deepEqual([1, 2, 5, 7, 10].map(QR.posicoesDeAlinhamento), [[], [6, 18], [6, 30], [6, 22, 38], [6, 28, 50]]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(QR.capacidadeDeDados), [16, 28, 44, 64, 86, 108, 124, 154, 182, 216]);
});

teste("QR: o que se gera se lê de volta (todas as máscaras e tamanhos)", () => {
  const textos = ["A", "https://zodkaps.github.io/sala-aplicacao-direta/#/material/12",
    "Graxa de lítio — referência SKF LGWA 2/1 ç ã é", "x".repeat(100), "y".repeat(150), "z".repeat(213)];
  for (const t of textos) {
    for (let m = 0; m < 8; m++) {
      const q = QR.gerarQR(t, { mascara: m });
      assert.equal(lerQR(q.modulos), t, `versão ${q.versao}, máscara ${m}`);
    }
    const auto = QR.gerarQR(t);
    assert.equal(lerQR(auto.modulos), t);
  }
  assert.equal(QR.gerarQR("https://zodkaps.github.io/sala-aplicacao-direta/#/material/1234").versao, 5);
  assert.throws(() => QR.gerarQR("w".repeat(300)), /longo demais/);
  assert.match(QR.caminhoSVG([[true, false], [false, true]], 4), /^M4 4h1v1h-1zM5 5h1v1h-1z$/);
});

// ── a função `acessos` do Supabase (criar conta e senha provisória) ──
function adminFalso() {
  const contas = new Map(), perfis = new Map();
  return {
    contas, perfis,
    auth: {
      admin: {
        async createUser({ email, password, email_confirm, user_metadata }) {
          if ([...contas.values()].some((c) => c.email === email)) {
            return { data: null, error: { status: 422, message: "A user with this email address has already been registered" } };
          }
          const id = crypto.randomUUID();
          contas.set(id, { email, password, email_confirm });
          perfis.set(id, { id, nome: user_metadata.nome, papel: "pendente" });
          return { data: { user: { id } }, error: null };
        },
        async updateUserById(id, { password }) {
          const c = contas.get(id);
          if (!c) return { data: null, error: { message: "User not found" } };
          c.password = password;
          return { data: {}, error: null };
        },
      },
    },
    from() {
      return {
        update: (campos) => ({ eq: async (_c, id) => { if (perfis.has(id)) Object.assign(perfis.get(id), campos); return { error: null }; } }),
        select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: perfis.has(id) ? { id } : null, error: null }) }) }),
      };
    },
  };
}

teste("função acessos: cria a conta já com o acesso, e recusa o que não serve", async () => {
  const a = adminFalso();
  const ok = await FN.tratar({ acao: "criar", email: " Karla@Exemplo-Teste.com.br ", nome: "  Karla   Teste ", senha: "Kpwzr48273", papel: "operador" }, a);
  assert.equal(ok.status, 200);
  const conta = a.contas.get(ok.corpo.id);
  assert.equal(conta.email, "karla@exemplo-teste.com.br");
  assert.equal(conta.email_confirm, true, "a conta já nasce confirmada");
  assert.deepEqual(a.perfis.get(ok.corpo.id), { id: ok.corpo.id, nome: "Karla Teste", papel: "operador" });
  assert.equal((await FN.tratar({ acao: "criar", email: "karla@exemplo-teste.com.br", nome: "Outra", senha: "Abcd12345", papel: "consulta" }, a)).status, 409);
  for (const [pedido, msg] of [
    [{ email: "sem-arroba", nome: "Fulano", senha: "Abcd12345", papel: "consulta" }, /e-mail/],
    [{ email: "f@exemplo-teste.com.br", nome: "F", senha: "Abcd12345", papel: "consulta" }, /nome/],
    [{ email: "f@exemplo-teste.com.br", nome: "Fulano", senha: "Abcd12345", papel: "pendente" }, /acesso/],
    [{ email: "f@exemplo-teste.com.br", nome: "Fulano", senha: "Abcd12345", papel: "chefe" }, /acesso/],
    [{ email: "f@exemplo-teste.com.br", nome: "Fulano", senha: "Ab12", papel: "consulta" }, /8 caracteres/],
    [{ email: "f@exemplo-teste.com.br", nome: "Fulano", senha: "abcdefghij", papel: "consulta" }, /letras e números/],
  ]) {
    const r = await FN.tratar({ acao: "criar", ...pedido }, a);
    assert.equal(r.status, 400, JSON.stringify(pedido));
    assert.match(r.corpo.erro, msg);
  }
  assert.equal(a.contas.size, 1, "nada além da primeira conta foi criado");
});

teste("função acessos: senha provisória para quem já tem conta", async () => {
  const a = adminFalso();
  const { corpo } = await FN.tratar({ acao: "criar", email: "b@exemplo-teste.com.br", nome: "Bia", senha: "Abcd12345", papel: "consulta" }, a);
  assert.equal((await FN.tratar({ acao: "senha", id: corpo.id, senha: "Nova12345x" }, a)).status, 200);
  assert.equal(a.contas.get(corpo.id).password, "Nova12345x");
  assert.equal((await FN.tratar({ acao: "senha", id: corpo.id, senha: "curta1" }, a)).status, 400);
  assert.equal((await FN.tratar({ acao: "senha", id: "nao-e-uuid", senha: "Nova12345x" }, a)).status, 400);
  assert.equal((await FN.tratar({ acao: "senha", id: crypto.randomUUID(), senha: "Nova12345x" }, a)).status, 404);
  assert.equal((await FN.tratar({ acao: "apagar-tudo" }, a)).status, 400);
});

teste("senha provisória gerada sempre passa na regra (a mesma no site e na função)", () => {
  for (let i = 0; i < 300; i++) {
    const s = T.gerarSenha();
    assert.equal(T.senhaFraca(s), "", s);
    assert.equal(FN.senhaFraca(s), "", s);
    assert.ok(!/[ilo]/i.test(s.slice(1, 5)), s);
  }
  for (const s of ["", "Ab1", "abcdefgh", "12345678", "a".repeat(80) + "1", "Abcd1234"]) assert.equal(T.senhaFraca(s), FN.senhaFraca(s), s);
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

await Promise.all(pendentes);
console.log(process.exitCode ? `\nfalhou (${n} passaram)` : `✓ ${n} testes de unidade passaram`);
