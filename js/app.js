// O começo de tudo: quem está usando, a casca (topo e abas) e qual tela abrir.
// As telas mudam pelo endereço depois do "#": #/saida, #/material/12…

import { el, $, aviso, janela } from "./ui.js";
import { icone } from "./icones.js";
import { PAPEIS } from "./texto.js";
import * as supa from "./supa.js";
import * as D from "./dados.js";
import { telaEntrar, telaAguardando } from "./telas/entrar.js";
import { telaInicio } from "./telas/inicio.js";
import { telaRegistrar } from "./telas/registrar.js";
import { telaHistorico } from "./telas/historico.js";
import { telaEstoque, telaMaterial } from "./telas/estoque.js";
import { telaPessoas, telaPessoa } from "./telas/pessoas.js";
import { telaAcessos, contarPendentes } from "./telas/acessos.js";
import { telaConta } from "./telas/conta.js";
import { telaFrotas, telaFrota } from "./telas/frotas.js";

const ROTAS = [
  [/^$/, "Início", telaInicio],
  [/^saida$/, "Saída", (r, c) => telaRegistrar(r, "saida", c)],
  [/^entrada$/, "Entrada", (r, c) => telaRegistrar(r, "entrada", c)],
  [/^historico$/, "Histórico", telaHistorico],
  [/^estoque$/, "Estoque", telaEstoque],
  [/^material\/(\d+)$/, "Material", telaMaterial],
  [/^pessoas$/, "Pessoas", telaPessoas],
  [/^pessoa\/(\d+)$/, "Pessoa", telaPessoa],
  [/^frotas$/, "Frotas", telaFrotas],
  [/^frota\/(\d+)$/, "Frota", telaFrota],
  [/^acessos$/, "Acessos", telaAcessos],
  [/^conta$/, "Minha conta", telaConta],
];

// O menu: no celular, as cinco primeiras viram a barra de baixo e o resto vai
// para o "Menu"; no computador e no tablet deitado, tudo fica na barra lateral.
const MENU = [
  ["Movimento", [
    ["", "Início", "inicio", () => true, true],
    ["saida", "Saída", "saida", () => D.podeRegistrar(), true],
    ["entrada", "Entrada", "entrada", () => D.podeRegistrar(), true],
    ["historico", "Histórico", "historico", () => true, true],
  ]],
  ["Cadastros", [
    ["estoque", "Estoque", "estoque", () => true, true],
    ["frotas", "Frotas", "caminhao", () => true, false],
    ["pessoas", "Pessoas", "pessoas", () => true, false],
  ]],
  ["Gestão", [
    ["acessos", "Acessos", "chave", () => D.ehAdmin(), false],
    ["conta", "Minha conta", "pessoa", () => true, false],
  ]],
];
const itensDoMenu = () => MENU.flatMap(([, itens]) => itens).filter((i) => i[3]());

// Claro é o padrão (como no painel de programação); o escuro fica no botão ◐.
const GUARDA_TEMA = "sad.tema";
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema === "escuro" ? "escuro" : "claro";
  const cor = tema === "escuro" ? "#0d0d0d" : "#13164E";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", cor);
}
function trocarTema() {
  const novo = document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro";
  aplicarTema(novo);
  try { localStorage.setItem(GUARDA_TEMA, novo); } catch { /* segue */ }
}
try { aplicarTema(localStorage.getItem(GUARDA_TEMA) || "claro"); } catch { aplicarTema("claro"); }

/** A tela de cada item do menu, para marcar o ativo também nas páginas de dentro. */
function rotaDoMenu(caminho) {
  const raiz = caminho.split("/")[0];
  return { material: "estoque", frota: "frotas", pessoa: "pessoas" }[raiz] ?? raiz;
}

let atual = null;        // { parar, podeSair } da tela aberta
let hashAtual = null;
let ignorarProxima = false;

function lerEndereco() {
  const h = decodeURIComponent((location.hash || "").replace(/^#\/?/, ""));
  const [caminho, busca = ""] = h.split("?");
  const query = Object.fromEntries(new URLSearchParams(busca));
  return { caminho: caminho.replace(/\/+$/, ""), query };
}

function montarCasca() {
  const p = D.estado.perfil || {};
  const nome = p.nome || (supa.eu() && supa.eu().email) || "";
  const inicial = (nome.trim()[0] || "?").toUpperCase();
  const logo = (claro) => el("img", {
    src: claro ? "img/makro.svg" : "img/makro-branco.svg", alt: "Makro", width: 92, height: 21,
    class: `logo-makro ${claro ? "so-claro" : "so-escuro"}`,
  });
  const linkMenu = ([rota, rotulo, ic]) => el("a", { href: `#/${rota}`, dataset: { rota } },
    icone(ic, 20), el("span", {}, rotulo),
    rota === "acessos" ? el("span", { class: "bolinha pendentes", hidden: true }) : null);

  document.body.replaceChildren(
    el("aside", { id: "lateral" },
      el("a", { href: "#/", class: "marca" },
        el("img", { src: "img/makro-branco.svg", alt: "Makro", width: 118, height: 27, class: "logo-makro" }),
        el("small", {}, "manutenção · sala de aplicação direta")),
      el("nav", { "aria-label": "Menu" }, ...MENU.map(([grupo, itens]) => {
        const vis = itens.filter((i) => i[3]());
        return vis.length ? [el("p", { class: "grupo" }, grupo), ...vis.map(linkMenu)] : null;
      })),
      el("a", { href: "#/conta", class: "pe" }, el("span", { class: "inicial" }, inicial),
        el("span", { class: "quem" }, el("b", {}, nome), el("small", {}, PAPEIS[p.papel] || "")))),
    el("header", { id: "topo" },
      el("a", { href: "#/", class: "marca-topo", "aria-label": "Início" }, logo(true), logo(false),
        el("small", {}, "sala de aplicação direta")),
      el("h1", { class: "titulo" }),
      el("span", { id: "sem-rede", hidden: navigator.onLine }, "sem internet"),
      el("button", { type: "button", class: "icone-botao", title: "Atualizar os dados", "aria-label": "Atualizar os dados", onclick: recarregarTudo }, icone("atualizar")),
      el("button", { type: "button", class: "icone-botao", title: "Claro ou escuro", "aria-label": "Trocar entre claro e escuro", onclick: trocarTema }, icone("tema")),
      el("button", { type: "button", id: "bmenu", class: "icone-botao", "aria-label": "Menu", onclick: abrirMenu },
        el("span", { class: "inicial" }, inicial), el("span", { class: "bolinha pendentes", hidden: true }))),
    el("main", { id: "tela" }),
    el("nav", { id: "abas", "aria-label": "Atalhos" }, ...itensDoMenu().filter((i) => i[4]).slice(0, 5).map(linkMenu)),
    el("div", { id: "avisos", "aria-live": "polite" }));
  contarPendentes().then((n) => {
    for (const b of document.querySelectorAll(".pendentes")) { b.hidden = !n; b.textContent = String(n); }
  });
}

function abrirMenu() {
  janela("Menu", (fechar) => {
    const p = D.estado.perfil || {};
    const n = Number(($(".pendentes") || {}).textContent || 0);
    const ir = (r) => () => { fechar(); location.hash = `#/${r}`; };
    const naBarra = new Set([...document.querySelectorAll("#abas a")].map((a) => a.dataset.rota));
    return el("nav", { class: "menu" },
      el("p", { class: "quem" }, el("strong", {}, p.nome || ""), el("small", {}, `${(supa.eu() && supa.eu().email) || ""} · ${PAPEIS[p.papel] || ""}`)),
      ...itensDoMenu().filter((i) => !naBarra.has(i[0])).map(([rota, rotulo, ic]) =>
        el("button", { type: "button", class: "item", onclick: ir(rota) }, icone(ic, 20), el("span", {}, rotulo),
          rota === "acessos" && n ? el("span", { class: "bolinha" }, String(n)) : null)),
      el("button", { type: "button", class: "item", onclick: async () => { fechar(); await recarregarTudo(); } },
        icone("atualizar", 20), el("span", {}, "Atualizar os dados")));
  });
}

async function recarregarTudo() {
  try {
    await D.carregarCadastros();
    aviso("Dados atualizados.");
    // Uma saída preenchida pela metade não se perde: o seletor já lê a lista nova.
    if (!/^(saida|entrada)$/.test(lerEndereco().caminho)) desenhar(true);
  } catch (e) { aviso(e.message, "erro", 6000); }
}

async function desenhar(forcar = false) {
  const { caminho, query } = lerEndereco();
  if (!forcar && location.hash === hashAtual) return;

  // A tela aberta pode pedir para confirmar (ex.: uma saída preenchida pela metade).
  if (!forcar && atual && atual.podeSair && hashAtual !== null) {
    const ok = await atual.podeSair();
    if (!ok) {
      ignorarProxima = true;
      location.hash = hashAtual;
      return;
    }
  }
  if (atual && atual.parar) { try { atual.parar(); } catch { /* segue */ } }
  atual = null;
  hashAtual = location.hash;

  let rota = ROTAS[0], params = [];
  for (const r of ROTAS) {
    const m = caminho.match(r[0]);
    if (m) { rota = r; params = m.slice(1); break; }
  }
  const raiz = $("#tela");
  if (!raiz) return;
  raiz.replaceChildren();
  raiz.className = `tela-${(caminho.split("/")[0] || "inicio")}`;
  document.title = `${rota[1]} · Sala de Aplicação Direta`;
  const ativa = rotaDoMenu(caminho);
  for (const a of document.querySelectorAll("#abas a, #lateral nav a")) a.classList.toggle("ativa", a.dataset.rota === ativa);
  const tit = $("#topo .titulo");
  if (tit) tit.textContent = rota[1] === "Início" ? "Sala de Aplicação Direta" : rota[1];
  window.scrollTo(0, 0);
  try {
    atual = rota[2](raiz, { params, query, redesenhar: () => desenhar(true), sair }) || {};
  } catch (e) {
    raiz.append(el("p", { class: "nada" }, `Não consegui abrir esta tela: ${e.message}`));
  }
}

async function sair() {
  await supa.sair();
  D.esquecerTudo();
  // Quem entrar depois começa pelo início, não na tela em que o outro parou.
  history.replaceState(null, "", location.pathname + location.search);
  mostrarEntrar();
}

function telaSolta() {
  document.body.replaceChildren(el("main", { id: "tela", class: "solta" }), el("div", { id: "avisos", "aria-live": "polite" }));
  return $("#tela");
}

function mostrarEntrar(motivo = "") {
  atual = null; hashAtual = null;
  telaEntrar(telaSolta(), { aoEntrar: abrirSessao, motivo });
}

async function abrirSessao() {
  const raiz = telaSolta();
  raiz.append(el("p", { class: "nada" }, "Carregando…"));
  try {
    await D.carregarPerfil();
  } catch (e) {
    if (!supa.logado()) { mostrarEntrar(e.message); return; }
    return falhou(raiz, e);
  }
  if (!D.podeVer()) {
    raiz.replaceChildren();
    telaAguardando(raiz, { nome: D.estado.perfil && D.estado.perfil.nome, aoVerificar: abrirSessao, aoSair: sair });
    return;
  }
  const tinha = D.cadastrosGuardados();
  const carga = D.carregarCadastros();
  if (!tinha) {
    try { await carga; } catch (e) { return falhou(raiz, e); }
  } else {
    carga.catch(() => aviso("Sem conexão: mostrando a última cópia deste aparelho.", "alerta", 5000));
  }
  montarCasca();
  hashAtual = null;
  desenhar(true);
}

function falhou(raiz, e) {
  raiz.replaceChildren(el("section", { class: "entrar" },
    el("h1", {}, "Não consegui abrir"),
    el("p", { class: "explica" }, e.message),
    el("div", { class: "cartao" },
      el("button", { type: "button", class: "botao primario grande largo", onclick: abrirSessao }, "Tentar de novo"),
      el("button", { type: "button", class: "botao discreto largo", onclick: sair }, "Sair"))));
}

window.addEventListener("hashchange", () => {
  if (ignorarProxima) { ignorarProxima = false; return; }
  if ($("#abas")) desenhar();
});
window.addEventListener("online", () => { const s = $("#sem-rede"); if (s) s.hidden = true; });
window.addEventListener("offline", () => { const s = $("#sem-rede"); if (s) s.hidden = false; });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && supa.logado() && D.podeVer()) D.atualizarSeVelho(60000).catch(() => {});
});

supa.quandoSessaoCair((motivo) => { D.esquecerTudo(); if (motivo) mostrarEntrar(motivo); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

if (supa.logado()) abrirSessao(); else mostrarEntrar();
