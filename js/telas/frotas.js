// As frotas: a lista que aparece na saída ("onde vai ser aplicada"). Todo
// mundo vê; só o administrador cadastra — uma a uma ou colando a lista do
// Excel de uma vez. Cada frota tem a página com o que foi aplicado nela.

import { el, adiar, janela, ocupar, aviso } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { filtrar, lerListaDeFrotas } from "../texto.js";
import { icone } from "../icones.js";
import { listaMovimentos, filtroHistorico, dialogoFrota, detalheFrota, titulo } from "./comum.js";

export function telaFrotas(raiz) {
  const f = { termo: "", inativas: false };
  const corpo = el("div", { class: "lista-pessoas" });
  const resumo = el("p", { class: "resumo-lista" });

  function desenhar() {
    let lista = D.estado.frotas.filter((x) => f.inativas || x.ativo);
    if (f.termo.trim()) lista = filtrar(lista, f.termo, (x) => [x.numero, x.descricao, x.placa], 1000);
    resumo.textContent = `${lista.length} ${lista.length === 1 ? "frota" : "frotas"}`;
    corpo.replaceChildren(...(lista.length
      ? lista.map((x) => el("a", { href: `#/frota/${x.id}`, class: `linha-pessoa${x.ativo ? "" : " inativo"}` },
        el("strong", {}, `Frota ${x.numero}`),
        el("small", {}, [detalheFrota(x), x.ativo ? "" : "desativada"].filter(Boolean).join(" · ") || " ")))
      : [el("p", { class: "nada" }, D.estado.frotas.length ? "Nenhuma frota com esse número."
        : D.ehAdmin() ? "Nenhuma frota cadastrada ainda. Toque em \"Colar lista\" para trazer todas do Excel de uma vez."
          : "Nenhuma frota cadastrada ainda. O administrador cadastra pelo menu → Frotas.")]));
  }

  const busca = el("input", { type: "search", class: "busca", placeholder: "Buscar número, modelo ou placa", "aria-label": "Buscar frota", autocomplete: "off" });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; desenhar(); }, 150));
  const inativas = el("input", { type: "checkbox" });
  inativas.addEventListener("change", () => { f.inativas = inativas.checked; desenhar(); });

  const botoes = D.ehAdmin() ? [
    el("button", { type: "button", class: "botao", onclick: async () => { if (await colarLista()) desenhar(); } }, icone("colar", 18), "Colar lista"),
    el("button", { type: "button", class: "botao primario", onclick: async () => { if (await dialogoFrota({})) desenhar(); } }, icone("adicionar", 18), "Frota"),
  ] : [];

  raiz.append(
    titulo("Frotas", el("div", { class: "botoes-titulo" }, ...botoes)),
    el("p", { class: "explica" }, "A lista que aparece na saída, em \"Onde vai ser aplicada\"."),
    el("div", { class: "filtros" }, busca, el("label", { class: "marcar pequeno" }, inativas, " Mostrar desativadas")),
    resumo, corpo);
  desenhar();
  D.carregarCadastros().then(desenhar).catch(() => {});
  return {};
}

/** Cola a lista do Excel (número, modelo, placa) e cadastra de uma vez. As que
 *  já existem ficam como estão. */
function colarLista() {
  return janela("Colar lista de frotas", (fechar) => {
    const caixa = el("textarea", {
      rows: 9, class: "colar", spellcheck: "false", autocapitalize: "characters",
      placeholder: "Uma frota por linha. Pode colar direto do Excel:\nC-433\tScania R450\tABC1D23\nC-434\tVolvo FH 540\nM-07",
      "aria-label": "Lista de frotas",
    });
    const previa = el("p", { class: "ajuda-lista" }, "Cole as colunas do Excel: número da frota, depois (se tiver) modelo e placa.");
    const erro = el("p", { class: "erro-campo", hidden: true });
    const salvar = el("button", { type: "button", class: "botao primario", disabled: true }, "Cadastrar");
    let novas = [];

    function ver() {
      const lidas = lerListaDeFrotas(caixa.value);
      const existentes = new Set(D.estado.frotas.map((x) => x.numero));
      novas = lidas.filter((x) => !existentes.has(x.numero));
      const ja = lidas.length - novas.length;
      previa.textContent = !lidas.length ? "Cole as colunas do Excel: número da frota, depois (se tiver) modelo e placa."
        : `${novas.length} ${novas.length === 1 ? "frota nova" : "frotas novas"}` +
          (ja ? ` · ${ja} já no cadastro (não mudam)` : "") +
          (novas.length ? ` · ex.: ${novas.slice(0, 3).map((x) => x.numero).join(", ")}${novas.length > 3 ? "…" : ""}` : "");
      salvar.disabled = !novas.length;
      salvar.textContent = novas.length ? `Cadastrar ${novas.length}` : "Cadastrar";
    }
    caixa.addEventListener("input", adiar(ver, 200));

    salvar.addEventListener("click", async () => {
      erro.hidden = true;
      const soltar = ocupar(salvar, "Cadastrando…");
      try {
        let feitas = 0;
        for (let i = 0; i < novas.length; i += 200) {
          const r = await supa.inserirVarias("frotas", novas.slice(i, i + 200), { conflito: "numero", ignorarRepetidas: true });
          D.guardarFrotas(r);
          feitas += r.length;
        }
        aviso(`${feitas} ${feitas === 1 ? "frota cadastrada" : "frotas cadastradas"}.`);
        fechar(true);
      } catch (e) {
        soltar();
        erro.textContent = e.message; erro.hidden = false;
      }
    });

    setTimeout(() => caixa.focus(), 50);
    return [caixa, previa, erro,
      el("div", { class: "acoes" }, el("button", { type: "button", class: "botao", onclick: () => fechar(false) }, "Voltar"), salvar)];
  }, { larga: true });
}

export function telaFrota(raiz, ctx) {
  const id = Number(ctx.params[0]);
  const cabeca = el("div", {});
  const lista = listaMovimentos({
    filtros: () => filtroHistorico({ frotaId: id }), vazio: "Nenhuma peça registrada para esta frota ainda.",
  });

  function desenhar() {
    const x = D.frotaPorId(id);
    if (!x) { cabeca.replaceChildren(el("p", { class: "nada" }, "Frota não encontrada.")); return; }
    cabeca.replaceChildren(
      el("a", { href: "#/frotas", class: "voltar" }, "‹ Frotas"),
      el("h1", {}, `Frota ${x.numero}`),
      el("p", { class: "explica" }, [detalheFrota(x), x.ativo ? "" : "desativada"].filter(Boolean).join(" · ") || " "),
      D.ehAdmin() ? el("div", { class: "acoes" },
        el("button", {
          type: "button", class: "botao",
          onclick: async () => { const r = await dialogoFrota(x); if (r === "apagado") location.hash = "#/frotas"; else if (r) desenhar(); },
        }, "Editar")) : null,
      el("div", { class: "titulo-secao" }, el("h2", {}, "Peças aplicadas nesta frota")));
  }

  raiz.append(cabeca, lista.raiz);
  desenhar();
  lista.recarregar();
  return {};
}
