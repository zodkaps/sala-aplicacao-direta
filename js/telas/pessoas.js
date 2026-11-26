// As pessoas que retiram, recebem ou acompanham (não precisam ter conta no
// site), e a página de cada uma com o que ela retirou e acompanhou.

import { el, adiar } from "../ui.js";
import * as D from "../dados.js";
import { filtrar } from "../texto.js";
import { listaMovimentos, filtroHistorico, dialogoPessoa, detalhePessoa, titulo } from "./comum.js";

export function telaPessoas(raiz) {
  const f = { termo: "", inativos: false };
  const corpo = el("div", { class: "lista-pessoas" });

  function desenhar() {
    let lista = D.estado.pessoas.filter((p) => f.inativos || p.ativo);
    if (f.termo.trim()) lista = filtrar(lista, f.termo, (p) => [p.nome, p.matricula, p.funcao], 500);
    corpo.replaceChildren(...(lista.length
      ? lista.map((p) => el("a", { href: `#/pessoa/${p.id}`, class: `linha-pessoa${p.ativo ? "" : " inativo"}` },
        el("strong", {}, p.nome),
        el("small", {}, [detalhePessoa(p), p.ativo ? "" : "desativada"].filter(Boolean).join(" · ") || " ")))
      : [el("p", { class: "nada" }, D.estado.pessoas.length ? "Ninguém com esse nome." : "Nenhuma pessoa cadastrada ainda.")]));
  }

  const busca = el("input", { type: "search", class: "busca", placeholder: "Buscar nome, matrícula ou função", "aria-label": "Buscar pessoa", autocomplete: "off" });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; desenhar(); }, 150));
  const inativos = el("input", { type: "checkbox" });
  inativos.addEventListener("change", () => { f.inativos = inativos.checked; desenhar(); });
  const nova = D.podeRegistrar()
    ? el("button", { type: "button", class: "botao primario", onclick: async () => { if (await dialogoPessoa({})) desenhar(); } }, "+ Pessoa")
    : null;

  raiz.append(
    titulo("Pessoas", nova),
    el("p", { class: "explica" }, "Quem retira, recebe ou acompanha material. Não precisa ter conta no site."),
    el("div", { class: "filtros" }, busca, el("label", { class: "marcar pequeno" }, inativos, " Mostrar desativadas")),
    corpo);
  desenhar();
  D.carregarCadastros().then(desenhar).catch(() => {});
  return {};
}

export function telaPessoa(raiz, ctx) {
  const id = Number(ctx.params[0]);
  const cabeca = el("div", {});
  const lista = listaMovimentos({
    filtros: () => filtroHistorico({ pessoaId: id }), vazio: "Nenhuma movimentação com esta pessoa.",
  });

  function desenhar() {
    const p = D.pessoaPorId(id);
    if (!p) { cabeca.replaceChildren(el("p", { class: "nada" }, "Pessoa não encontrada.")); return; }
    cabeca.replaceChildren(
      el("a", { href: "#/pessoas", class: "voltar" }, "‹ Pessoas"),
      el("h1", {}, p.nome),
      el("p", { class: "explica" }, [detalhePessoa(p), p.ativo ? "" : "desativada"].filter(Boolean).join(" · ")),
      D.ehAdmin() ? el("div", { class: "acoes" },
        el("button", { type: "button", class: "botao", onclick: async () => { if (await dialogoPessoa(p)) desenhar(); } }, "Editar")) : null,
      el("h2", { class: "titulo-secao" }, "Retiradas e acompanhamentos"));
  }

  raiz.append(cabeca, lista.raiz);
  desenhar();
  lista.recarregar();
  return {};
}
