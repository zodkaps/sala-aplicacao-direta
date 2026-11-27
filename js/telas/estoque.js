// O estoque da sala (entradas menos saídas de cada material) e a página de cada
// material, com o histórico dele.

import { el, adiar } from "../ui.js";
import * as D from "../dados.js";
import { filtrar, formatarQtd, situacaoSaldo, quando } from "../texto.js";
import {
  listaMovimentos, filtroHistorico, dialogoMaterial, titulo, miniatura, carregarMiniaturas, verFoto,
} from "./comum.js";
import { dialogoConferir } from "./vistoria.js";
import { icone } from "../icones.js";

const ROTULO_SITUACAO = { negativo: "divergência", baixo: "abaixo do mínimo", zerado: "zerado", ok: "" };

export function telaEstoque(raiz, ctx) {
  const f = { ver: ["baixo", "divergencia"].includes(ctx.query.ver) ? ctx.query.ver : "", termo: "", inativos: false };
  const corpo = el("div", { class: "lista-estoque" });
  const resumo = el("p", { class: "resumo-lista" });

  function desenhar() {
    let lista = D.estado.materiais.filter((m) => f.inativos || m.ativo);
    if (f.ver === "baixo") lista = lista.filter((m) => ["baixo", "negativo"].includes(situacaoSaldo(m.saldo, m.minimo)));
    if (f.ver === "divergencia") lista = lista.filter((m) => situacaoSaldo(m.saldo, m.minimo) === "negativo");
    if (f.termo.trim()) lista = filtrar(lista, f.termo, (m) => [m.descricao, m.referencia, m.codigo, m.local], 500);
    resumo.textContent = `${lista.length} ${lista.length === 1 ? "material" : "materiais"}`;
    corpo.replaceChildren(...(lista.length ? lista.map(linhaMaterial)
      : [el("p", { class: "nada" }, D.estado.materiais.length ? "Nenhum material com esse filtro." : "Nenhum material cadastrado ainda.")]));
    carregarMiniaturas(corpo);
  }

  const chips = [["", "Todos"], ["baixo", "Abaixo do mínimo"], ["divergencia", "Divergência"]].map(([v, t]) =>
    el("button", {
      type: "button", class: `chip${f.ver === v ? " ativo" : ""}`,
      onclick: (ev) => {
        f.ver = v;
        for (const c of chips) c.classList.remove("ativo");
        ev.currentTarget.classList.add("ativo");
        desenhar();
      },
    }, t));
  const inativos = el("input", { type: "checkbox" });
  inativos.addEventListener("change", () => { f.inativos = inativos.checked; desenhar(); });
  const busca = el("input", { type: "search", class: "busca", placeholder: "Buscar material, referência ou código", "aria-label": "Buscar material", autocomplete: "off" });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; desenhar(); }, 150));

  const novo = D.podeRegistrar()
    ? el("button", { type: "button", class: "botao primario", onclick: async () => { if (await dialogoMaterial({})) desenhar(); } }, "+ Material")
    : null;

  raiz.append(
    titulo("Estoque da sala", novo),
    el("div", { class: "filtros" },
      el("div", { class: "chips" }, ...chips),
      busca,
      el("label", { class: "marcar pequeno" }, inativos, " Mostrar desativados")),
    resumo, corpo);
  desenhar();
  D.carregarCadastros().then(desenhar).catch(() => {});
  return {};
}

function linhaMaterial(m) {
  const sit = situacaoSaldo(m.saldo, m.minimo);
  return el("a", { href: `#/material/${m.id}`, class: `linha-material ${sit}${m.ativo ? "" : " inativo"}` },
    miniatura(m.foto, "mini-lista"),
    el("span", { class: "lm-texto" },
      el("strong", {}, m.descricao),
      el("small", {}, [m.referencia ? `ref. ${m.referencia}` : "", m.codigo ? `Protheus ${m.codigo}` : "",
        m.local || "", m.minimo ? `mín. ${formatarQtd(m.minimo)}` : "",
        m.ativo ? "" : "desativado"].filter(Boolean).join(" · ") || " ")),
    el("span", { class: "lm-saldo" },
      el("strong", {}, formatarQtd(m.saldo)), el("small", {}, m.unidade),
      ROTULO_SITUACAO[sit] ? el("span", { class: `etiqueta ${sit}` }, ROTULO_SITUACAO[sit]) : null));
}

export function telaMaterial(raiz, ctx) {
  const id = Number(ctx.params[0]);
  const cabeca = el("div", {});
  const lista = listaMovimentos({
    filtros: () => filtroHistorico({ materialId: id }), vazio: "Nenhuma movimentação deste material.",
    aoMudar: () => desenhar(),
  });

  function desenhar() {
    const m = D.materialPorId(id);
    if (!m) { cabeca.replaceChildren(el("p", { class: "nada" }, "Material não encontrado.")); return; }
    const sit = situacaoSaldo(m.saldo, m.minimo);
    cabeca.replaceChildren(
      el("a", { href: "#/estoque", class: "voltar" }, "‹ Estoque"),
      el("h1", {}, m.descricao),
      m.foto ? el("button", {
        type: "button", class: "foto-material-pagina", "aria-label": "Ver a foto de referência",
        onclick: () => verFoto(m.foto, m.descricao),
      }, el("img", { alt: `Foto de referência: ${m.descricao}`, dataset: { foto: m.foto } })) : null,
      el("div", { class: `saldo-grande ${sit}` },
        el("strong", {}, formatarQtd(m.saldo)), el("span", {}, m.unidade),
        ROTULO_SITUACAO[sit] ? el("span", { class: `etiqueta ${sit}` }, ROTULO_SITUACAO[sit]) : null),
      el("dl", { class: "ficha" },
        ...[["Referência do fabricante", m.referencia], ["Código Protheus", m.codigo], ["Onde fica", m.local], ["Estoque mínimo", m.minimo ? `${formatarQtd(m.minimo)} ${m.unidade}` : ""],
          ["Última movimentação", quando(m.ultima)], ["Última vistoria", quando(m.ultima_vistoria)],
          ["Situação", m.ativo ? "Ativo" : "Desativado"]]
          .filter(([, v]) => v).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      el("div", { class: "acoes" },
        D.podeRegistrar() && m.ativo ? el("a", { href: `#/saida?material=${m.id}`, class: "botao saida" }, "Registrar saída") : null,
        D.podeRegistrar() && m.ativo ? el("a", { href: `#/entrada?material=${m.id}`, class: "botao entrada" }, "Registrar entrada") : null,
        D.ehAdmin() && m.ativo ? el("button", {
          type: "button", class: "botao",
          onclick: async () => { if (await dialogoConferir(m)) { desenhar(); lista.recarregar(); } },
        }, icone("vistoria", 18), "Conferir") : null,
        el("a", { href: `#/etiquetas?material=${m.id}`, class: "botao" }, icone("qr", 18), "Etiqueta QR"),
        D.ehAdmin() ? el("button", {
          type: "button", class: "botao",
          onclick: async () => {
            const r = await dialogoMaterial(m);
            if (r === "apagado") location.hash = "#/estoque"; else if (r) desenhar();
          },
        }, "Editar") : null),
      el("h2", { class: "titulo-secao" }, "Movimentações"));
    carregarMiniaturas(cabeca);
  }

  raiz.append(cabeca, lista.raiz);
  desenhar();
  lista.recarregar();
  D.carregarCadastros().then(desenhar).catch(() => {});
  return {};
}
