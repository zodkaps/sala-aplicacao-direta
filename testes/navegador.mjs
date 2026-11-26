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
  const r = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth,
    [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 3).map((e) => `${e.tagName}.${e.className}`)]);
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
  await page.getByRole("button", { name: "Sair deste aparelho" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.locator('input[type="email"]').waitFor();
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

// criar conta → aguardando liberação
await page.getByRole("button", { name: "Primeira vez? Criar conta" }).click();
await page.getByLabel("Seu nome (como aparece para a equipe)").fill("Bruno Operador");
await page.locator('input[type="email"]').fill("bruno@exemplo-teste.com.br");
await page.locator('input[type="password"]').fill("senha-bruno-1");
await page.getByRole("button", { name: "Criar conta" }).click();
await page.getByText("aguardando liberação").waitFor();
assert.equal(db.perfis.find((p) => p.email === "bruno@exemplo-teste.com.br").papel, "pendente");
passo("conta nova fica aguardando liberação");
await page.getByRole("button", { name: "Sair" }).click();

// administrador libera
await entrar(page, "ana.admin@exemplo-teste.com.br", "senha-admin-1");
await page.getByRole("heading", { name: "Olá, Ana" }).waitFor();
await page.locator("#bmenu .bolinha", { hasText: "1" }).waitFor();
await tela(page, "02-inicio-vazio");
await page.locator("#bmenu").click();
await page.getByRole("button", { name: /Acessos/ }).click();
const pend = page.locator(".acesso.pendente");
await pend.waitFor();
await pend.locator("select").selectOption("operador");
await pend.getByRole("button", { name: "Liberar" }).click();
await page.getByText("Acesso salvo.").waitFor();
assert.equal(db.perfis.find((p) => p.email === "bruno@exemplo-teste.com.br").papel, "operador");
passo("administrador libera o acesso pelo site");

// ── entrada ──
await page.locator('#abas a[data-rota="entrada"]').click();
await page.getByRole("heading", { name: "Entrada de material" }).waitFor();
await page.getByLabel("Tirar foto").setInputFiles(await foto(1600, 1200, "#166534"));
await page.getByText("Foto enviada ✓").waitFor();
await cadastrarNoSeletor(page, "Material", "Graxa de lítio EP2 para rolamentos de roda", async (d) => {
  await d.locator("select").selectOption("KG");
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
await page.locator(".erro-caixa", { hasText: "Falta a foto, o material e quem está retirando." }).waitFor();
assert.equal(await page.locator(".passo.falta").count(), 3);
passo("saída sem foto/material/retirante é barrada na tela, com o que falta");

await page.getByLabel("Tirar foto").setInputFiles(await foto(1200, 1600, "#9a3412"));
await page.locator(".erro-caixa").waitFor({ state: "hidden" });
await page.getByLabel("Material", { exact: true }).fill("gra");
await page.locator(".opcao", { hasText: "Graxa de lítio" }).click();
await page.getByRole("button", { name: "Aumentar" }).click();
await page.getByRole("button", { name: "Aumentar" }).click();
assert.equal(await page.locator(".qtd-campo").inputValue(), "3");
await cadastrarNoSeletor(page, "Quem está retirando", "João Mecânico", async (d) => {
  await d.getByLabel("Matrícula").fill("123");
  await d.getByLabel("Função").fill("Mecânico");
});
await page.getByLabel("Para onde vai (frota, OS, equipamento)").fill("Frota 101");

// sair pela metade pede confirmação
await page.locator('#abas a[data-rota=""]').click();
await page.getByText("Descartar esta saída sem registrar?").waitFor();
await page.getByRole("button", { name: "Continuar preenchendo" }).click();
await page.getByRole("heading", { name: "Saída de material" }).waitFor();
assert.equal(await page.getByLabel("Para onde vai (frota, OS, equipamento)").inputValue(), "Frota 101");
passo("sair com a saída pela metade pede confirmação e não perde nada");

await page.getByText("Foto enviada ✓").waitFor();
await semRolagemLateral(page, "saída");
await tela(page, "04-saida-preenchida");
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.getByRole("heading", { name: "Saída registrada" }).waitFor();
await page.getByText("Retirou: João Mecânico · Acompanhou: Carlos Almoxarife").waitFor();
await page.getByText("Saldo agora: 7 KG").waitFor();
await tela(page, "05-saida-registrada");
const sai = db.movimentacoes[1];
assert.equal(sai.tipo, "saida"); assert.equal(sai.quantidade, 3); assert.equal(sai.destino, "Frota 101");
assert.equal(db.pessoas.find((p) => p.id === sai.retirante_id).nome, "João Mecânico");
assert.equal(db.pessoas.find((p) => p.id === sai.responsavel_id).nome, "Carlos Almoxarife");
passo("saída com foto, quem retirou e quem acompanhou; saldo 7");

// saída maior que o saldo pede confirmação
await page.getByRole("button", { name: "Registrar outra saída" }).click();
await page.getByLabel("Tirar foto").setInputFiles(await foto(800, 600, "#7c2d12"));
await page.getByLabel("Material", { exact: true }).click();
await page.locator(".opcao", { hasText: "Graxa de lítio" }).click();
await page.locator(".qtd-campo").fill("50");
await page.getByText("Atenção: o saldo registrado é 7 KG.").waitFor();
await page.getByLabel("Quem está retirando", { exact: true }).click();
await page.locator(".opcao", { hasText: "João Mecânico" }).click();
await page.getByRole("button", { name: "Registrar saída" }).click();
await page.getByText(/Registrar mesmo assim\? O saldo fica negativo/).waitFor();
await page.getByRole("button", { name: "Voltar" }).click();
assert.equal(db.movimentacoes.length, 2);
passo("saída maior que o saldo avisa e pede confirmação");

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
await page.getByLabel("Buscar", { exact: true }).fill("frota 101");
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 1);
passo("filtros de tipo e busca no histórico");
await page.getByLabel("Buscar", { exact: true }).fill("");
await page.waitForFunction(() => document.querySelectorAll(".mov").length === 3);

// ficha com a foto e cancelamento
await page.locator(".mov.saida", { hasText: "Frota 101" }).click();
const ficha = page.locator("dialog[open]");
await ficha.getByText("João Mecânico (mat. 123)").waitFor();
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
assert.ok(db.movimentacoes.find((m) => m.destino === "Frota 101").cancelada_em);
passo("administrador cancela com motivo; o registro fica, marcado como cancelado");

// planilha
const [baixado] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar planilha" }).click()]);
const csv = readFileSync(await baixado.path(), "utf8");
assert.ok(csv.startsWith("﻿Data;Tipo;Material"));
assert.ok(csv.includes("Graxa de lítio") && csv.includes("Cancelada em") && csv.includes("João Mecânico"));
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
await tela(page, "09-inicio");
passo("início conta só as válidas de hoje");

// ── operador ──
await sairPeloMenu(page);
await entrar(page, "bruno@exemplo-teste.com.br", "senha-bruno-1");
await page.getByRole("heading", { name: "Olá, Bruno" }).waitFor();
await page.locator(".atalho.saida").waitFor();
await page.locator("#bmenu").click();
assert.equal(await page.getByRole("button", { name: /Acessos/ }).count(), 0);
await page.locator("dialog[open] .fechar").click();
await page.locator(".mov").first().click();
await page.locator("dialog[open] .ficha").waitFor();
assert.equal(await page.getByRole("button", { name: "Cancelar este registro" }).count(), 0);
await page.locator("dialog[open] .fechar").click();
passo("operador registra, mas não vê Acessos nem cancela");

// ── consulta ──
await sairPeloMenu(page);
criarUsuario(db, { email: "dora@exemplo-teste.com.br", senha: "senha-dora-1", nome: "Dora Consulta", papel: "consulta" });
await entrar(page, "dora@exemplo-teste.com.br", "senha-dora-1");
await page.getByRole("heading", { name: "Olá, Dora" }).waitFor();
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

assert.deepEqual(erros, [], erros.join("\n"));
passo("nenhum erro de JavaScript nem de CSP no console");
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
await pt.waitForFunction(() => [...document.querySelectorAll(".mini img")].length === 3 &&
  [...document.querySelectorAll(".mini img")].every((i) => i.complete && i.naturalWidth > 0));
await semRolagemLateral(pt, "tablet início");
await tela(pt, "10-tablet-inicio");
await pt.locator(".atalho.saida").click();
await pt.getByRole("heading", { name: "Saída de material" }).waitFor();
await tela(pt, "11-tablet-saida");
await semRolagemLateral(pt, "tablet saída");
assert.deepEqual(errosTab, [], errosTab.join("\n"));
passo("tablet: início e saída sem rolagem lateral e sem erro");
await tab.close();

await navegador.close();
servidor.close();
console.log(`\n✓ ${passos} passos do navegador passaram`);
