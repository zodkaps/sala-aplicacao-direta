// Etiquetas com QR Code para colar nas prateleiras. O QR leva ao endereço do
// material no site: a pessoa aponta a câmera do celular, entra (se ainda não
// estiver logada) e cai na página do material — com a foto, o saldo e o botão
// de registrar a saída. O QR não carrega dado nenhum além do endereço.
//
// A folha sai em A4, três etiquetas por linha (64 × 38 mm), com linha de corte.

import { el, adiar } from "../ui.js";
import * as D from "../dados.js";
import { filtrar } from "../texto.js";
import { gerarQR, caminhoSVG } from "../qr.js";
import { icone } from "../icones.js";
import { titulo } from "./comum.js";

const NS = "http://www.w3.org/2000/svg";
const cacheQR = new Map();

export function enderecoDoMaterial(id) {
  return `${location.origin}${location.pathname}#/material/${id}`;
}

/** O QR como SVG (quadradinhos pretos sobre branco, com a margem da norma). */
export function svgQR(texto) {
  let q = cacheQR.get(texto);
  if (!q) { q = gerarQR(texto); cacheQR.set(texto, q); }
  const lado = q.tamanho + 8;
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: `0 0 ${lado} ${lado}`, class: "qr", role: "img", "aria-label": "QR Code do material", "shape-rendering": "crispEdges",
  })) svg.setAttribute(k, v);
  const fundo = document.createElementNS(NS, "rect");
  fundo.setAttribute("width", lado); fundo.setAttribute("height", lado); fundo.setAttribute("fill", "#fff");
  const desenho = document.createElementNS(NS, "path");
  desenho.setAttribute("d", caminhoSVG(q.modulos, 4)); desenho.setAttribute("fill", "#000");
  svg.append(fundo, desenho);
  return svg;
}

function etiqueta(m) {
  return el("div", { class: "etiqueta-qr" },
    svgQR(enderecoDoMaterial(m.id)),
    el("div", { class: "eq-texto" },
      el("strong", {}, m.descricao),
      m.referencia ? el("span", {}, `Ref.: ${m.referencia}`) : null,
      m.codigo ? el("span", {}, `Protheus: ${m.codigo}`) : null,
      m.local ? el("span", {}, `Local: ${m.local}`) : null,
      el("small", {}, "Sala de Aplicação Direta · aponte a câmera")));
}

export function telaEtiquetas(raiz, ctx) {
  const so = ctx.query.material ? Number(ctx.query.material) : null;
  const ativos = () => D.estado.materiais.filter((m) => m.ativo);
  const marcados = new Set(so ? [so] : ativos().map((m) => m.id));
  const f = { termo: "" };
  const lista = el("div", { class: "lista-etiquetas nao-imprimir" });
  const folha = el("div", { class: "folha-etiquetas" });
  const resumo = el("p", { class: "resumo-lista nao-imprimir" });

  const desenharFolha = adiar(() => {
    const escolhidos = ativos().filter((m) => marcados.has(m.id));
    resumo.textContent = `${escolhidos.length} ${escolhidos.length === 1 ? "etiqueta" : "etiquetas"} na folha`;
    folha.replaceChildren(...escolhidos.map(etiqueta));
  }, 120);

  function desenharLista() {
    let l = ativos();
    if (f.termo.trim()) l = filtrar(l, f.termo, (m) => [m.descricao, m.referencia, m.codigo, m.local], 2000);
    lista.replaceChildren(...(l.length ? l.map((m) => {
      const marca = el("input", { type: "checkbox", checked: marcados.has(m.id) });
      marca.addEventListener("change", () => { if (marca.checked) marcados.add(m.id); else marcados.delete(m.id); desenharFolha(); });
      return el("label", { class: "marcar item-etiqueta" }, marca,
        el("span", {}, m.descricao, m.referencia ? el("small", {}, ` · ref. ${m.referencia}`) : null));
    }) : [el("p", { class: "nada" }, D.estado.materiais.length ? "Nenhum material com esse nome." : "Nenhum material cadastrado ainda.")]));
  }

  const busca = el("input", { type: "search", class: "busca", placeholder: "Buscar material, referência ou código", "aria-label": "Buscar material", autocomplete: "off" });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; desenharLista(); }, 150));
  const todos = el("button", { type: "button", class: "botao", onclick: () => { for (const m of ativos()) marcados.add(m.id); desenharLista(); desenharFolha(); } }, "Marcar todos");
  const nenhum = el("button", { type: "button", class: "botao", onclick: () => { marcados.clear(); desenharLista(); desenharFolha(); } }, "Desmarcar");
  const imprimir = el("button", { type: "button", class: "botao primario", onclick: () => window.print() }, icone("imprimir", 18), "Imprimir");

  raiz.append(
    el("div", { class: "nao-imprimir" },
      titulo("Etiquetas QR", imprimir),
      el("p", { class: "explica" },
        "Escolha os materiais e imprima em A4 (três por linha, com linha de corte). Cole na prateleira: " +
        "quem apontar a câmera do celular abre a página do material, com a foto e o botão de registrar a saída."),
      el("div", { class: "filtros" }, busca, el("div", { class: "acoes" }, todos, nenhum)),
      lista),
    resumo, folha);
  desenharLista();
  desenharFolha();
  return {};
}
