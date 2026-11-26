// O começo de tudo: quem está usando, a casca (topo e abas) e qual tela abrir.
// As telas mudam pelo endereço depois do "#": #/saida, #/material/12…

import { el, $, aviso, janela } from "./ui.js";
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

const ROTAS = [
  [/^$/, "Início", telaInicio],
  [/^saida$/, "Saída", (r, c) => telaRegistrar(r, "saida", c)],
  [/^entrada$/, "Entrada", (r, c) => telaRegistrar(r, "entrada", c)],
  [/^historico$/, "Histórico", telaHistorico],
  [/^estoque$/, "Estoque", telaEstoque],
  [/^material\/(\d+)$/, "Material", telaMaterial],
  [/^pessoas$/, "Pessoas", telaPessoas],
  [/^pessoa\/(\d+)$/, "Pessoa", telaPessoa],
  [/^acessos$/, "Acessos", telaAcessos],
  [/^conta$/, "Minha conta", telaConta],
];

const ABAS = [
  ["", "Início", "⌂", () => true],
  ["saida", "Saída", "↑", () => D.podeRegistrar()],
  ["entrada", "Entrada", "↓", () => D.podeRegistrar()],
  ["estoque", "Estoque", "▦", () => true],
  ["historico", "Histórico", "☰", () => true],
];

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
  const pend = el("span", { class: "bolinha", hidden: true });
  document.body.replaceChildren(
    el("header", { id: "topo" },
      el("a", { href: "#/", class: "marca" }, el("img", { src: "icone.svg", alt: "", width: 28, height: 28 }),
        el("span", {}, "Sala de Aplicação Direta")),
      el("span", { id: "sem-rede", hidden: navigator.onLine }, "sem internet"),
      el("button", { type: "button", id: "bmenu", class: "botao discreto", "aria-label": "Menu", onclick: abrirMenu }, "☰ Menu", pend)),
    el("main", { id: "tela" }),
    el("nav", { id: "abas" }, ...ABAS.filter((a) => a[3]()).map(([rota, nome, icone]) =>
      el("a", { href: `#/${rota}`, dataset: { rota } },
        el("span", { class: `icone ${rota || "inicio"}`, "aria-hidden": "true" }, icone), el("span", {}, nome)))),
    el("div", { id: "avisos", "aria-live": "polite" }));
  contarPendentes().then((n) => { if (n) { pend.hidden = false; pend.textContent = String(n); } });
}

function abrirMenu() {
  const pendentes = $("#bmenu .bolinha");
  janela("Menu", (fechar) => {
    const ir = (r) => () => { fechar(); location.hash = `#/${r}`; };
    const p = D.estado.perfil || {};
    return el("nav", { class: "menu" },
      el("p", { class: "quem" }, el("strong", {}, p.nome || (supa.eu() && supa.eu().email) || ""), el("small", {}, (supa.eu() && supa.eu().email) || "")),
      el("button", { type: "button", class: "item", onclick: ir("estoque") }, "Estoque"),
      el("button", { type: "button", class: "item", onclick: ir("historico") }, "Histórico"),
      el("button", { type: "button", class: "item", onclick: ir("pessoas") }, "Pessoas"),
      D.ehAdmin() ? el("button", { type: "button", class: "item", onclick: ir("acessos") }, "Acessos",
        pendentes && !pendentes.hidden ? el("span", { class: "bolinha" }, pendentes.textContent) : null) : null,
      el("button", { type: "button", class: "item", onclick: ir("conta") }, "Minha conta"),
      el("button", {
        type: "button", class: "item",
        onclick: async () => { fechar(); await recarregarTudo(); },
      }, "Atualizar os dados"));
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
  for (const a of document.querySelectorAll("#abas a")) {
    const r = a.dataset.rota;
    a.classList.toggle("ativa", r === caminho || (r === "estoque" && caminho.startsWith("material/")));
  }
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
