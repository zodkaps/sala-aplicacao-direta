// O início: os dois botões grandes, os números do dia e as últimas
// movimentações — atualizando sozinho a cada 30 segundos enquanto está aberto.

import { el } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { inicioDoDia, situacaoSaldo } from "../texto.js";
import { listaMovimentos } from "./comum.js";
import { icone } from "../icones.js";

export function telaInicio(raiz) {
  const nome = ((D.estado.perfil && D.estado.perfil.nome) || "").split(" ")[0];
  const nSaidas = el("strong", {}, "…");
  const nEntradas = el("strong", {}, "…");
  const nBaixo = el("strong", {}, "…");
  const lista = listaMovimentos({ tamanho: 10, semMais: true, vazio: "Nenhuma movimentação registrada ainda.", aoMudar: contar });

  function contarBaixo() {
    const n = D.estado.materiais.filter((m) => m.ativo && situacaoSaldo(m.saldo, m.minimo) !== "ok" && situacaoSaldo(m.saldo, m.minimo) !== "zerado").length;
    nBaixo.textContent = String(n);
  }

  async function contar() {
    contarBaixo();
    try {
      const hoje = await supa.ler(
        `historico?select=tipo&cancelada_em=is.null&registrado_em=gte.${encodeURIComponent(inicioDoDia(0))}&limit=5000`);
      nSaidas.textContent = String(hoje.filter((m) => m.tipo === "saida").length);
      nEntradas.textContent = String(hoje.filter((m) => m.tipo === "entrada").length);
    } catch {
      if (nSaidas.textContent === "…") { nSaidas.textContent = "—"; nEntradas.textContent = "—"; }
    }
  }

  raiz.append(...[
    el("h1", { class: "ola" }, nome ? `Olá, ${nome}` : "Olá"),
    D.podeRegistrar() ? el("div", { class: "grandes" },
      el("a", { href: "#/saida", class: "atalho saida" },
        el("span", { class: "seta" }, icone("saida", 30)),
        el("strong", {}, "Saída"), el("small", {}, "Material saindo da sala")),
      el("a", { href: "#/entrada", class: "atalho entrada" },
        el("span", { class: "seta" }, icone("entrada", 30)),
        el("strong", {}, "Entrada"), el("small", {}, "Material chegando na sala"))) : null,
    el("div", { class: "numeros" },
      el("a", { href: "#/historico?tipo=saida&periodo=0", class: "numero" }, nSaidas, el("span", {}, "saídas hoje")),
      el("a", { href: "#/historico?tipo=entrada&periodo=0", class: "numero" }, nEntradas, el("span", {}, "entradas hoje")),
      el("a", { href: "#/estoque?ver=baixo", class: "numero alerta" }, nBaixo, el("span", {}, "abaixo do mínimo"))),
    el("div", { class: "titulo-secao" }, el("h2", {}, "Últimas movimentações"), el("a", { href: "#/historico" }, "Ver tudo")),
    lista.raiz,
  ].filter(Boolean)); // append(null) escreveria "null" na tela

  contar();
  lista.recarregar();

  const t = setInterval(async () => {
    if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
    try { await D.atualizarSeVelho(25000); } catch { /* fica com o que tem */ }
    contar();
    lista.recarregar();
  }, 30000);

  return { parar() { clearInterval(t); } };
}
