// O site de ponta a ponta, num navegador de verdade (Chromium), como celular e
// como tablet, contra o Supabase de mentira (testes/supabase_falso.mjs).
//   node testes/navegador.mjs [pasta-para-as-fotos-das-telas]
//
// Cria conta, libera acesso, registra entrada e saída com foto, confere o
// saldo, o histórico, a ficha com a foto, o cancelamento, a planilha, os
// acessos de operador e de consulta, e a abertura sem internet.

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { criarBanco, criarUsuario, instalar } from "./supabase_falso.mjs";
import { lerQRdoSVG } from "./ler_qr.mjs";
import { senhaFraca } from "../js/texto.js";

// `require` acha o Playwright instalado no projeto (npm i -D playwright) ou o global.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUPA = readFileSync(join(RAIZ, "js/config.js"), "utf8").match(/url: "([^"]+)"/)[1];
const TELAS = process.argv[2] || "";
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json",
};

const servidor = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  if (p.includes("..")) { res.writeHead(400).end(); return; }
  try {
    const corpo = await readFile(join(RAIZ, p));
    res.writeHead(200, { "Content-Type": TIPOS[extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(corpo);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => servidor.listen(0, "localhost", r));
const SITE = `http://localhost:${servidor.address().port}/`;

const navegador = await chromium.launch();
let passos = 0;
const passo = (t) => { passos += 1; console.log(`  ✓ ${t}`); };

async function foto(largura, altura, cor) {
  const p = await navegador.newPage({ viewport: { width: largura, height: altura } });
  await p.setContent(`<body style="margin:0;background:linear-gradient(135deg,${cor},#fde68a 60%,#1e3a8a)">
    <div style="font:bold 160px sans-serif;color:#fff;padding:80px">PEÇA</div></body>`);
  const b = await p.screenshot({ type: "jpeg", quality: 92 });
  await p.close();
  return { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: b };
}

async function tela(page, nome) {
  if (!TELAS) return;
  await mkdir(TELAS, { recursive: true });
  await page.evaluate(() => document.querySelectorAll(".aviso").forEach((a) => a.remove()));
  await page.screenshot({ path: join(TELAS, `${nome}.png`) });
}

function vigiar(page, erros) {
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return; // recusas esperadas
    if (/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/.test(t)) return; // o teste sem internet
    erros.push(`console: ${t}`);
  });
}

/** Nada da tela pode passar da largura do aparelho (nome comprido incluso),
 *  e nenhum "null"/"undefined" pode vazar como texto. */
async function semRolagemLateral(page, onde) {
  const vazou = await page.evaluate(() => /\b(null|undefined|NaN)\b/.test(document.body.innerText));
  assert.ok(!vazou, `${onde}: "null", "undefined" ou "NaN" escrito na tela`);
  const r = await page.evaluate(() => {
    const larg = window.innerWidth;
    // O que passa da borda mas está dentro de uma caixa que corta (o "…" de
    // nome comprido) não aparece: só conta o que fica à vista.
    const cortado = (e) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const ov = getComputedStyle(a).overflowX;
        if (ov !== "visible" && a.getBoundingClientRect().right <= larg + 1) return true;
      }
      return false;
    };
    return [larg, document.documentElement.scrollWidth,
      [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > larg + 1 && !cortado(e))
        .slice(0, 3).map((e) => `${e.tagName}.${e.className}`)];
  });
  assert.ok(r[1] <= r[0] && !r[2].length, `${onde}: passou da largura (${r[1]} > ${r[0]}): ${r[2]}`);
}

async function entrar(page, email, senha) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function sairPeloMenu(page) {
  await page.locator("#bmenu").click();
  await page.getByRole("button", { name: "Minha conta" }).click();
  await page.getByRole("button", { name: "Sair deste aparelho" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Mostrar a senha" }).count(), 2, "Minha conta: Mostrar nas duas senhas");
  await page.getByRole("button", { name: "Sair deste aparelho" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.locator('input[type="email"]').waitFor();
  assert.equal(await page.locator('input[type="email"]').inputValue(), "", "sair apaga o e-mail lembrado");
}

async function cadastrarNoSeletor(page, rotulo, termo, preencher) {
  await page.getByLabel(rotulo, { exact: true }).fill(termo);
  await page.locator(".opcao.nova", { hasText: termo }).click();
  const d = page.locator("dialog[open]");
  await d.waitFor();
  if (preencher) await preencher(d);
  await d.getByRole("button", { name: "Cadastrar" }).click();
  await d.waitFor({ state: "detached" });
}

const db = criarBanco();
criarUsuario(db, { email: "ana.admin@exemplo-teste.com.br", senha: "senha-admin-1", nome: "Ana Admin", papel: "admin" });

// ════════════════════════ celular ════════════════════════
console.log("Celular (Pixel 7):");
const ctx = await navegador.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
await instalar(ctx, SUPA, db);
const page = await ctx.newPage();
const erros = [];
vigiar(page, erros);

await page.goto(SITE);
await page.getByRole("heading", { name: "Sala de Aplicação Direta" }).waitFor();
await tela(page, "01-entrar");

// senha errada
await entrar(page, "ana.admin@exemplo-teste.com.br", "errada");
await page.getByText("E-mail ou senha não conferem.").waitFor();
passo("senha errada é recusada com mensagem em português");

// mostrar e ocultar a senha
const campoDaSenha = page.getByLabel("Senha", { exact: true });
await campoDaSenha.fill("abc Def");
await page.getByRole("button", { name: "Mostrar a senha" }).click();
assert.equal(await campoDaSenha.getAttribute("type"), "text");
assert.equal(await campoDaSenha.inputValue(), "abc Def");
assert.equal(await campoDaSenha.getAttribute("autocapitalize"), "none");
await semRolagemLateral(page, "entrar com a senha à vista");
await page.getByRole("button", { name: "Ocultar a senha" }).click();
assert.equal(await campoDaSenha.getAttribute("type"), "password");
passo("o botão Mostrar deixa ver a senha e Ocultar esconde de novo");

// sem cadastro aberto: quem cria o acesso é o administrador
assert.equal(await page.getByRole("button", { name: /Criar conta/ }).count(), 0);
await page.getByText("Peça ao administrador do PCM").waitFor();
passo("entrar não tem cadastro aberto: o acesso é criado pelo administrador");

// o administrador cria o acesso do operador (senha provisória) e libera uma conta antiga
criarUsuario(db, { email: "eva.antiga@exemplo-teste.com.br", senha: "Antiga12345", nome: "Eva Antiga" }); // pendente
await entrar(page, "ana.admin@exemplo-teste.com.br", "senha-admin-1");
await page.getByRole("heading", { name: "Olá, Ana" }).waitFor();
await page.locator("#bmenu .bolinha", { hasText: "1" }).waitFor();
await tela(page, "02-inicio-vazio");
await page.locator("#bmenu").click();
await page.getByRole("button", { name: /Acessos/ }).click();
const criarAcesso = page.locator("form.criar-acesso");
await criarAcesso.waitFor();
await criarAcesso.getByLabel("Nome", { exact: true }).fill("Bruno Operador");
await criarAcesso.getByLabel("E-mail", { exact: true }).fill("bruno.operador@oficina-teste");
await criarAcesso.getByLabel("E-mail", { exact: true }).blur();
await criarAcesso.locator("#email-sem-final").waitFor(); // e-mail sem o final (.com.br): vale, com o aviso
await tela(page, "02a-acessos-aviso");
await criarAcesso.locator("select").selectOption("operador");
const senhaBruno = await criarAcesso.locator("input.senha-provisoria").inputValue();
assert.equal(senhaFraca(senhaBruno), "", senhaBruno);
await semRolagemLateral(page, "acessos");
await criarAcesso.getByRole("button", { name: "Criar acesso" }).click();
await page.getByText("Pronto: acesso de Bruno Operador").waitFor();
assert.ok(await criarAcesso.locator("#email-sem-final").isHidden(), "o aviso sai com o formulário limpo");
const bruno = db.perfis.find((p) => p.email === "bruno.operador@oficina-teste");
assert.equal(bruno.papel, "operador");
assert.equal(db.usuarios.find((u) => u.id === bruno.id).senha, senhaBruno);
await tela(page, "02a-acessos");
passo("administrador cria o acesso com senha provisória, já com o acesso escolhido (e-mail sem o final .com.br)");

const pend = page.locator(".acesso.pendente");
await pend.waitFor();
await pend.locator("select").selectOption("consulta");
await pend.getByRole("button", { name: "Liberar" }).click();
await page.getByText("Acesso salvo.").waitFor();
const eva = db.perfis.find((p) => p.email === "eva.antiga@exemplo-teste.com.br");
assert.equal(eva.papel, "consulta");
await page.locator("#bmenu .bolinha").waitFor({ state: "hidden" });
await page.locator(".acesso", { hasText: "Eva Antiga" }).getByRole("button", { name: "Senha nova" }).click();
const dlgSenha = page.locator("dialog[open]");
const senhaEva = await dlgSenha.locator("input.senha-provisoria").inputValue();
await dlgSenha.getByRole("button", { name: "Dar esta senha" }).click();
await dlgSenha.getByText("Pronto: acesso de Eva Antiga").waitFor();
assert.equal(db.usuarios.find((u) => u.id === eva.id).senha, senhaEva);
await dlgSenha.locator("button.botao", { hasText: "Fechar" }).click();
passo("conta antiga liberada como consulta e com senha nova dada pelo administrador");

// ── frotas: colar a lista do Excel ──
await page.locator("#bmenu").click();
await page.getByRole("button", { name: "Frotas" }).click();
await page.getByText("Nenhuma frota cadastrada ainda").waitFor();
await page.getByRole("button", { name: "Colar lista" }).click();
await page.getByLabel("Lista de frotas").fill("Frota\tModelo\tPlaca\nc-101\tScania R450\tABC-1D23\nC-102\tVolvo FH 540\nM-07\nC-101\trepetida");
await page.getByText("3 frotas novas").waitFor();
await semRolagemLateral(page, "colar lista de frotas");
await page.getByRole("button", { name: "Cadastrar 3" }).click();
await page.getByText("3 frotas cadastradas.").waitFor();
await page.locator(".linha-pessoa", { hasText: "Frota C-101" }).waitFor();
assert.deepEqual(db.frotas.map((f) => [f.numero, f.placa]), [["C-101", "ABC1D23"], ["C-102", null], ["M-07", null]]);
await semRolagemLateral(page, "frotas");
await tela(page, "02b-frotas");
passo("administrador cola a lista de frotas do Excel (cabeçalho e repetida ficam de fora)");

// ── entrada ──
await page.locator('#abas a[data-rota="entrada"]').click();
await page.getByRole("heading", { name: "Entrada de material" }).waitFor();
await page.getByLabel("Tirar foto").setInputFiles(await foto(1600, 1200, "#166534"));
await page.getByText("Foto enviada ✓").waitFor();
await cadastrarNoSeletor(page, "Material", "Graxa de lítio EP2 para rolamentos de roda", async (d) => {
  await d.locator("select").selectOption("KG");
  await d.getByLabel("Tirar foto do material").setInputFiles(await foto(900, 900, "#334155"));
  await d.getByText("Foto pronta").waitFor();
  await d.getByLabel("Referência do fabricante").fill("SKF LGWA 2/1");
  await d.getByLabel("Código Protheus").fill("000123456");
  await d.getByLabel("Estoque mínimo").fill("4");
  await d.getByLabel("Onde fica na sala").fill("Prateleira 2");
});
await page.locator(".escolhido", { hasText: "Graxa de lítio" }).waitFor();
await page.locator(".qtd-campo").fill("10");
await semRolagemLateral(page, "entrada");
await cadastrarNoSeletor(page, "Quem recebeu", "Carlos Almoxarife", async (d) => { await d.getByLabel("Matrícula").fill("900"); });
await page.getByLabel("Entregue por").fill("Fornecedor Exemplo");
await page.getByLabel("Documento").fill("NF 123");
await tela(page, "03-entrada-preenchida");
await page.getByRole("button", { name: "Registrar entrada" }).click();
await page.getByRole("heading", { name: "Entrada registrada" }).waitFor();
assert.equal(db.materiais[0].referencia, "SKF LGWA 2/1");
assert.equal(db.materiais[0].codigo, "000123456");
assert.ok(db.objetos.has(db.materiais[0].foto) && db.objetos.has(db.materiais[0].foto.replace(".jpg", "-p.jpg")), "foto de referência no bucket");
await page.getByText("Saldo agora: 10 KG").waitFor();
assert.equal(db.movimentacoes.length, 1);
const ent = db.movimentacoes[0];
assert.equal(ent.tipo, "entrada"); assert.equal(ent.quantidade, 10); assert.equal(ent.documento, "NF 123");
const grande = db.objetos.get(ent.foto), pequena = db.objetos.get(ent.foto.replace(".jpg", "-p.jpg"));
assert.ok(grande && pequena, "foto e miniatura no bucket");
assert.ok(grande.bytes.length < 400 * 1024, `foto grande com ${grande.bytes.length} bytes`);
assert.ok(pequena.bytes.length < grande.bytes.length / 3, "miniatura bem menor");
assert.equal(grande.bytes[0], 0xff); assert.equal(grande.bytes[1], 0xd8); // JPEG
passo(`entrada com foto: ${Math.round(grande.bytes.length / 1024)} KB + miniatura ${Math.round(pequena.bytes.length / 1024)} KB`);

// as dimensões da foto enviada
const dims = await page.evaluate((b64) => new Promise((ok, erro) => {
  const i = new Image();
  i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
  i.onerror = () => erro(new Error("não abriu"));
  i.src = `data:image/jpeg;base64,${b64}`;
}), grande.bytes.toString("base64"));
assert.deepEqual(dims, [1024, 768]);
passo("foto reduzida para 1024 × 768");

// ── saída ──
await page.getByRole("link", { name: "Voltar ao início" }).click();
await page.locator(".atalho.saida").click();
await page.getByRole("heading", { name: "Saída de material" }).waitFor();
await page.locator(".escolhido", { hasText: "Carlos Almoxarife" }).waitFor(); // lembrado
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.locator(".erro-caixa", { hasText: "Falta a foto, o material, quem está retirando e onde vai ser aplicada." }).waitFor();
assert.equal(await page.locator(".passo.falta").count(), 4);
passo("saída sem foto/material/retirante é barrada na tela, com o que falta");

await page.getByLabel("Tirar foto").setInputFiles(await foto(1200, 1600, "#9a3412"));
await page.locator(".erro-caixa").waitFor({ state: "hidden" });
await page.getByLabel("Material", { exact: true }).fill("gra");
await page.waitForFunction(() => { const i = document.querySelector(".opcao .mini-sel img"); return i && i.complete && i.naturalWidth > 0; });
await page.locator(".opcao", { hasText: "Graxa de lítio" }).click();
await page.waitForFunction(() => { const i = document.querySelector(".foto-escolhido img"); return i && i.complete && i.naturalWidth > 0; });
passo("a foto de referência do material aparece na busca e no material escolhido");
await page.getByRole("button", { name: "Aumentar" }).click();
await page.getByRole("button", { name: "Aumentar" }).click();
assert.equal(await page.locator(".qtd-campo").inputValue(), "3");
await cadastrarNoSeletor(page, "Quem está retirando", "João Mecânico", async (d) => {
  await d.getByLabel("Matrícula").fill("123");
  await d.getByLabel("Função").fill("Mecânico");
});
await page.getByLabel("Frota", { exact: true }).fill("101");
await page.locator(".opcao", { hasText: "Frota C-101" }).click();
await page.locator(".escolhido", { hasText: "Frota C-101" }).waitFor();
await page.getByLabel("Outro local ou complemento").fill("Eixo dianteiro");

// sair pela metade pede confirmação
await page.locator('#abas a[data-rota=""]').click();
await page.getByText("Descartar esta saída sem registrar?").waitFor();
await page.getByRole("button", { name: "Continuar preenchendo" }).click();
await page.getByRole("heading", { name: "Saída de material" }).waitFor();
assert.equal(await page.getByLabel("Outro local ou complemento").inputValue(), "Eixo dianteiro");
await page.locator(".escolhido", { hasText: "Frota C-101" }).waitFor();
passo("sair com a saída pela metade pede confirmação e não perde nada");

await page.getByText("Foto enviada ✓").waitFor();
await semRolagemLateral(page, "saída");
await tela(page, "04-saida-preenchida");
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.getByRole("heading", { name: "Saída registrada" }).waitFor();
await page.getByText("Retirou: João Mecânico · Acompanhou: Carlos Almoxarife · Frota C-101").waitFor();
await page.getByText("Saldo agora: 7 KG").waitFor();
await tela(page, "05-saida-registrada");
const sai = db.movimentacoes[1];
assert.equal(sai.tipo, "saida"); assert.equal(sai.quantidade, 3); assert.equal(sai.destino, "Eixo dianteiro");
assert.equal(db.frotas.find((f) => f.id === sai.frota_id).numero, "C-101");
assert.equal(db.pessoas.find((p) => p.id === sai.retirante_id).nome, "João Mecânico");
assert.equal(db.pessoas.find((p) => p.id === sai.responsavel_id).nome, "Carlos Almoxarife");
passo("saída com foto, quem retirou e quem acompanhou; saldo 7");

// saída maior que o saldo pede confirmação
await page.getByRole("button", { name: "Registrar outra saída" }).click();
await page.getByLabel("Tirar foto").setInputFiles(await foto(800, 600, "#7c2d12"));
await page.getByLabel("Material", { exact: true }).fill("lgwa21");
await page.locator(".opcao", { hasText: "Graxa de lítio" }).click();
await page.locator(".qtd-campo").fill("50");
await page.getByLabel("Outro local ou complemento").fill("Oficina");
await page.getByText("Atenção: o saldo registrado é 7 KG.").waitFor();
await page.getByLabel("Quem está retirando", { exact: true }).click();
await page.locator(".opcao", { hasText: "João Mecânico" }).click();
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.getByText(/Registrar mesmo assim\? O saldo fica negativo/).waitFor();
await page.getByRole("button", { name: "Voltar" }).click();
assert.equal(db.movimentacoes.length, 2);
passo("material achado pela referência digitada sem espaço nem barra; saída maior que o saldo pede confirmação");

// rede cai na hora de gravar: nada se perde, e tentar de novo grava uma vez só
db.falhar = (r) => r === "POST /rest/v1/movimentacoes";
await page.locator(".qtd-campo").fill("2");
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.locator(".erro-caixa", { hasText: "Nada foi perdido" }).waitFor();
db.falhar = null;
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.getByRole("heading", { name: "Saída registrada" }).waitFor();
assert.equal(db.movimentacoes.length, 3);
passo("sem sinal na hora de gravar: mostra o erro, mantém o formulário e grava ao tentar de novo");

// ── histórico ──
await page.locator('#abas a[data-rota="historico"]').click();
await page.locator(".mov").nth(2).waitFor();
assert.equal(await page.locator(".mov").count(), 3);
await page.waitForFunction(() => [...document.querySelectorAll(".mini img")].every((i) => i.complete && i.naturalWidth > 0));
const largMini = await page.locator(".mini img").first().evaluate((i) => i.naturalWidth);
assert.ok(largMini <= 320, `miniatura com ${largMini}px`);
await semRolagemLateral(page, "histórico");
passo("histórico com as 3 movimentações e as miniaturas");
await tela(page, "06-historico");

await page.getByRole("button", { name: "Saídas" }).click();
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 2);
await page.getByRole("button", { name: "Entradas" }).click();
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 1);
await page.getByRole("button", { name: "Tudo" }).click();
await page.getByLabel("Buscar", { exact: true }).fill("c-101");
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 1);
passo("filtros de tipo e busca no histórico");
await page.getByLabel("Buscar", { exact: true }).fill("");
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 3);

// ficha com a foto e cancelamento
await page.locator(".mov.saida", { hasText: "Frota C-101" }).click();
const ficha = page.locator("dialog[open]");
await ficha.getByText("João Mecânico (mat. 123)").waitFor();
await ficha.getByText("C-101 · Scania R450").waitFor();
await ficha.getByText("SKF LGWA 2/1").waitFor();
await page.waitForFunction(() => { const i = document.querySelector("dialog[open] .foto-grande"); return i && i.complete && i.naturalWidth === 768; });
await semRolagemLateral(page, "ficha");
await tela(page, "07-ficha");
passo("ficha mostra a foto grande e quem retirou");
await ficha.getByRole("button", { name: "Cancelar este registro" }).click();
const motivo = page.locator("dialog[open]").last();
await motivo.locator("textarea").fill("Lançado errado no teste");
await motivo.getByRole("button", { name: "Cancelar registro" }).click();
await page.getByText("Registro cancelado.").waitFor();
await page.locator(".mov.cancelada").waitFor();
assert.ok(db.movimentacoes.find((m) => m.destino === "Eixo dianteiro").cancelada_em);
passo("administrador cancela com motivo; o registro fica, marcado como cancelado");

// planilha
const [baixado] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar planilha" }).click()]);
const csv = readFileSync(await baixado.path(), "utf8");
assert.ok(csv.startsWith("﻿Data;Tipo;Material"));
assert.ok(csv.includes("Graxa de lítio") && csv.includes("Cancelada em") && csv.includes("João Mecânico"));
assert.ok(csv.includes("Referência do fabricante;Código Protheus") && csv.includes("SKF LGWA 2/1") && csv.includes("000123456") && csv.includes(";C-101;Scania R450;"), "planilha com referência, código e frota");
assert.equal(csv.trim().split("\r\n").length, 4);
passo(`planilha exportada (${baixado.suggestedFilename()})`);

// estoque
await page.locator('#abas a[data-rota="estoque"]').click();
const linha = page.locator(".linha-material", { hasText: "Graxa de lítio" });
await linha.waitFor();
assert.equal(await linha.locator(".lm-saldo strong").innerText(), "8");
assert.ok(await linha.locator(".etiqueta.baixo").count() === 0);
await semRolagemLateral(page, "estoque");
await tela(page, "08-estoque");
await linha.click();
await page.locator(".saldo-grande", { hasText: "8" }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 3);
passo("estoque: 10 − 3 (cancelada) − 2 = 8, e a página do material com o histórico dele");

// início com os números do dia
await page.locator('#abas a[data-rota=""]').click();
await page.locator(".numero", { hasText: "saídas hoje" }).locator("strong", { hasText: "1" }).waitFor();
await page.locator(".numero", { hasText: "entradas hoje" }).locator("strong", { hasText: "1" }).waitFor();
await semRolagemLateral(page, "início");
// entrada verde e saída vermelha: os botões grandes e os cards da lista
const cores = await page.evaluate(() => {
  const fundo = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
  const borda = (s) => getComputedStyle(document.querySelector(s)).borderLeftColor;
  return [fundo(".atalho.saida"), fundo(".atalho.entrada"), borda(".mov.saida"), borda(".mov.entrada")];
});
assert.deepEqual(cores, ["rgb(212, 0, 31)", "rgb(18, 130, 59)", "rgb(212, 0, 31)", "rgb(18, 130, 59)"], String(cores));
passo("entrada em verde e saída em vermelho nos botões do início e nos cards");
await tela(page, "09-inicio");
passo("início conta só as válidas de hoje");

// a página da frota: o que foi aplicado nela
await page.goto(`${SITE}#/frotas`);
await page.locator(".linha-pessoa", { hasText: "Frota C-101" }).click();
await page.getByRole("heading", { name: "Frota C-101" }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 1);
await semRolagemLateral(page, "página da frota");
passo("a página da frota mostra as peças aplicadas nela");

// ── vistoria (administrador): o saldo vira o contado ──
await page.locator("#bmenu").click();
await page.getByRole("button", { name: "Vistoria" }).click();
const lv = page.locator(".linha-vistoria", { hasText: "Graxa de lítio" });
await lv.waitFor();
await lv.locator(".conta-campo").fill("10");
await lv.getByRole("button", { name: "Gravar" }).click();
await lv.locator(".status-vistoria", { hasText: "Conferido agora: +2 KG" }).waitFor();
await page.getByText("1 de 1 conferidos hoje").waitFor();
let aj = db.movimentacoes.at(-1);
assert.deepEqual([aj.tipo, aj.quantidade, aj.saldo_antes, aj.contado], ["ajuste", 2, 8, 10]);
await lv.getByRole("button", { name: "Confere" }).click();
await lv.locator(".status-vistoria", { hasText: "confere com o sistema" }).waitFor();
aj = db.movimentacoes.at(-1);
assert.deepEqual([aj.tipo, aj.quantidade], ["ajuste", 0]);
await semRolagemLateral(page, "vistoria");
await tela(page, "13-vistoria");
await page.goto(`${SITE}#/historico?tipo=ajuste`);
await page.waitForFunction(() => document.querySelectorAll(".mov.ajuste").length === 2);
passo("vistoria: o saldo vira o contado (+2) e o \"confere\" também fica no histórico");

// ── apagar de vez (administrador): o registro e a foto saem ──
await page.goto(`${SITE}#/historico`);
await page.locator(".mov.saida", { hasText: "Oficina" }).click();
const apagarSaida = db.movimentacoes.find((m) => m.destino === "Oficina");
await page.locator("dialog[open]").getByRole("button", { name: "Apagar de vez" }).click();
const dlgMotivo = page.locator("dialog[open]").last();
await dlgMotivo.locator("textarea").fill("registro de teste");
await dlgMotivo.getByRole("button", { name: "Apagar de vez" }).click();
await page.getByText("Registro apagado.").waitFor();
await page.waitForFunction(() => !document.querySelector("dialog[open]"));
assert.ok(!db.movimentacoes.includes(apagarSaida), "o registro saiu");
assert.equal(db.apagados.at(-1).motivo, "registro de teste");
await page.waitForFunction(() => true);
for (let i = 0; i < 20 && db.objetos.has(apagarSaida.foto); i++) await page.waitForTimeout(100);
assert.ok(!db.objetos.has(apagarSaida.foto) && !db.objetos.has(apagarSaida.foto.replace(".jpg", "-p.jpg")), "a foto saiu do bucket");
passo("administrador apaga um registro de teste: some do histórico, a foto sai e fica a cópia");

// apagar cadastro: o que tem movimentação não sai; o que não tem, sai
await page.goto(`${SITE}#/pessoas`);
await page.getByRole("button", { name: "+ Pessoa" }).click();
await page.locator("dialog[open]").getByLabel("Nome", { exact: true }).fill("Pessoa de Teste");
await page.locator("dialog[open]").getByRole("button", { name: "Cadastrar" }).click();
await page.locator(".linha-pessoa", { hasText: "Pessoa de Teste" }).click();
await page.getByRole("button", { name: "Editar" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Apagar" }).click();
await page.locator("dialog[open]").last().getByRole("button", { name: "Apagar", exact: true }).click();
await page.getByText("Cadastro apagado.").waitFor();
await page.waitForFunction(() => location.hash === "#/pessoas");
assert.ok(!db.pessoas.some((p) => p.nome === "Pessoa de Teste"));
await page.locator(".linha-pessoa", { hasText: "João Mecânico" }).click();
await page.getByRole("button", { name: "Editar" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Apagar" }).click();
await page.locator("dialog[open]").last().getByRole("button", { name: "Apagar", exact: true }).click();
await page.getByText("tem movimentações e não pode ser apagado").waitFor();
assert.ok(db.pessoas.some((p) => p.nome === "João Mecânico"));
await page.locator("dialog[open] .fechar").click();
passo("apagar cadastro: o sem uso sai; o que tem movimentação é recusado, com o porquê");

// ── etiquetas QR: a etiqueta leva ao endereço do material ──
const idGraxa = db.materiais.find((m) => m.descricao.startsWith("Graxa")).id;
await page.goto(`${SITE}#/material/${idGraxa}`);
await page.getByRole("link", { name: "Etiqueta QR" }).click();
await page.locator(".etiqueta-qr").first().waitFor();
assert.equal(await page.locator(".etiqueta-qr").count(), 1);
const qr = await page.locator(".etiqueta-qr svg.qr").first().evaluate((s) => ({
  d: s.querySelector("path").getAttribute("d"), lado: Number(s.getAttribute("viewBox").split(" ")[2]),
}));
assert.equal(lerQRdoSVG(qr.d, qr.lado), `${SITE}#/material/${idGraxa}`);
await semRolagemLateral(page, "etiquetas");
await tela(page, "14-etiquetas");
await page.emulateMedia({ media: "print" });
assert.ok(!(await page.locator("#abas").isVisible()) && !(await page.locator("#topo").isVisible()), "na impressão só a folha");
assert.ok(await page.locator(".folha-etiquetas").isVisible());
await tela(page, "15-etiquetas-impressao");
await page.emulateMedia({ media: "screen" });
passo("etiqueta QR do material: o QR lido de volta dá o endereço da página dele, e a impressão sai só com a folha");

// ── operador ──
await sairPeloMenu(page);
await entrar(page, "bruno.operador@oficina-teste", senhaBruno);
await page.getByRole("heading", { name: "Olá, Bruno" }).waitFor();
await page.locator(".atalho.saida").waitFor();
await page.locator("#bmenu").click();
assert.equal(await page.getByRole("button", { name: /Acessos/ }).count(), 0);
assert.equal(await page.locator("dialog[open] nav.menu").getByRole("button", { name: "Vistoria", exact: true }).count(), 0);
await page.locator("dialog[open] .fechar").click();
await page.locator(".mov").first().click();
await page.locator("dialog[open] .ficha").waitFor();
assert.equal(await page.getByRole("button", { name: "Cancelar este registro" }).count(), 0);
assert.equal(await page.getByRole("button", { name: "Apagar de vez" }).count(), 0);
await page.locator("dialog[open] .fechar").click();
await page.locator("#bmenu").click();
await page.getByRole("button", { name: "Frotas" }).click();
await page.locator(".linha-pessoa", { hasText: "Frota C-102" }).waitFor();
assert.equal(await page.getByRole("button", { name: "Colar lista" }).count(), 0);
await page.locator(".atalho.saida").count();
await page.goto(`${SITE}#/saida`);
await page.getByLabel("Frota", { exact: true }).fill("C-9");
assert.equal(await page.locator(".opcao.nova", { hasText: "Cadastrar frota" }).count(), 0);
await page.locator('#abas a[data-rota=""]').click();
passo("operador registra, mas não vê Acessos nem Vistoria, não cancela, não apaga e não cadastra frota");

// ── consulta ──
await sairPeloMenu(page);
await entrar(page, "eva.antiga@exemplo-teste.com.br", senhaEva);
await page.getByRole("heading", { name: "Olá, Eva" }).waitFor();
assert.equal(await page.locator(".atalho").count(), 0);
await semRolagemLateral(page, "início da consulta");
assert.equal(await page.locator('#abas a[data-rota="saida"]').count(), 0);
await page.goto(`${SITE}#/saida`);
await page.getByText("O seu acesso é só de consulta").waitFor();
passo("consulta só vê: sem botões de saída e entrada");

// ── sem internet ──
await page.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
db.falhar = () => true;
await page.goto(`${SITE}#/estoque`);
await page.locator(".linha-material", { hasText: "Graxa de lítio" }).waitFor();
await page.locator("#sem-rede").waitFor();
passo("sem internet o site abre com a última cópia do aparelho");
await ctx.setOffline(false);
db.falhar = null;

const moldura = await ctx.newPage();
await moldura.setContent(`<iframe src="${SITE}" width="400" height="300"></iframe>`);
await moldura.frameLocator("iframe").getByText("Abra a Sala de Aplicação Direta direto no navegador.").waitFor();
await moldura.close();
passo("dentro de outro site (moldura) o site não abre");

assert.deepEqual(erros, [], erros.join("\n"));
passo("nenhum erro de JavaScript, de CSP nem de Trusted Types no console");
await ctx.close();

// ════════════════════════ tablet ════════════════════════
console.log("Tablet (Galaxy Tab S4, deitado):");
const tab = await navegador.newContext({ ...devices["Galaxy Tab S4 landscape"] });
await instalar(tab, SUPA, db);
const pt = await tab.newPage();
const errosTab = [];
vigiar(pt, errosTab);
await pt.goto(SITE);
await entrar(pt, "ana.admin@exemplo-teste.com.br", "senha-admin-1");
await pt.getByRole("heading", { name: "Olá, Ana" }).waitFor();
await pt.waitForFunction(() => [...document.querySelectorAll(".mini img")].length >= 2 &&
  [...document.querySelectorAll(".mini img")].every((i) => i.complete && i.naturalWidth > 0));
await semRolagemLateral(pt, "tablet início");
await tela(pt, "10-tablet-inicio");
await pt.locator(".atalho.saida").click();
await pt.getByRole("heading", { name: "Saída de material" }).waitFor();
await tela(pt, "11-tablet-saida");
await semRolagemLateral(pt, "tablet saída");
assert.ok(await pt.locator("#lateral").isVisible(), "barra lateral no tablet deitado");
assert.ok(!(await pt.locator("#abas").isVisible()), "sem a barra de baixo no tablet deitado");
await pt.locator('#lateral a[data-rota="frotas"]').click();
await pt.locator("#topo .titulo", { hasText: "Frotas" }).waitFor();
passo("tablet: barra lateral Makro com o menu, início e saída sem rolagem lateral");

await pt.getByRole("button", { name: "Trocar entre claro e escuro" }).click();
assert.equal(await pt.evaluate(() => document.documentElement.dataset.tema), "escuro");
await pt.goto(`${SITE}#/`);
await pt.reload();
await pt.getByRole("heading", { name: "Olá, Ana" }).waitFor();
assert.equal(await pt.evaluate(() => document.documentElement.dataset.tema), "escuro");
await pt.waitForFunction(() => [...document.querySelectorAll(".mini img")].every((i) => i.complete && i.naturalWidth > 0));
await tela(pt, "12-tablet-escuro");
assert.deepEqual(errosTab, [], errosTab.join("\n"));
passo("claro/escuro no botão ◐, lembrado ao abrir de novo");
await tab.close();

await navegador.close();
servidor.close();
console.log(`\n✓ ${passos} passos do navegador passaram`);
