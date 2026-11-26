// Os acessos ao site (só o administrador): quem criou conta e o que cada um
// pode fazer. Liberar também confirma o e-mail da conta.

import { el, ocupar, aviso } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { PAPEIS, quando } from "../texto.js";
import { titulo } from "./comum.js";

export async function contarPendentes() {
  if (!D.ehAdmin()) return 0;
  try {
    const l = await supa.rpc("listar_acessos");
    return (l || []).filter((a) => a.papel === "pendente").length;
  } catch { return 0; }
}

export function telaAcessos(raiz) {
  if (!D.ehAdmin()) { raiz.append(el("p", { class: "nada" }, "Só o administrador vê os acessos.")); return {}; }
  const corpo = el("div", { class: "lista-acessos" }, el("p", { class: "nada" }, "Carregando…"));

  async function carregar() {
    try {
      const lista = await supa.rpc("listar_acessos");
      corpo.replaceChildren(...(lista && lista.length ? lista.map(linha) : [el("p", { class: "nada" }, "Nenhuma conta.")]));
    } catch (e) {
      corpo.replaceChildren(el("p", { class: "nada" }, e.message));
    }
  }

  function linha(a) {
    const eu = supa.eu() && supa.eu().id === a.id;
    const nome = el("input", { type: "text", value: a.nome || "", maxlength: 80, "aria-label": "Nome", autocomplete: "off" });
    const papel = el("select", { "aria-label": "Acesso", disabled: eu },
      ...Object.entries(PAPEIS).map(([v, t]) => el("option", { value: v, selected: v === a.papel }, t)));
    const salvar = el("button", { type: "button", class: "botao primario" }, a.papel === "pendente" ? "Liberar" : "Salvar");
    salvar.addEventListener("click", async () => {
      if (a.papel === "pendente" && papel.value === "pendente") papel.value = "operador";
      const soltar = ocupar(salvar, "Salvando…");
      try {
        await supa.rpc("definir_acesso", { p_id: a.id, p_papel: papel.value, p_nome: nome.value.trim() || null });
        aviso(papel.value === "pendente" ? "Acesso suspenso." : "Acesso salvo.");
        await carregar();
      } catch (e) {
        soltar();
        aviso(e.message, "erro", 6000);
      }
    });
    return el("div", { class: `acesso${a.papel === "pendente" ? " pendente" : ""}` },
      el("div", { class: "acesso-cabeca" },
        el("strong", {}, a.nome || "(sem nome)"),
        el("small", {}, a.email),
        el("small", {}, `Conta criada ${quando(a.criado_em)}${a.ultimo_acesso ? ` · último acesso ${quando(a.ultimo_acesso)}` : " · nunca entrou"}`)),
      el("div", { class: "acesso-campos" }, nome, papel, eu ? el("small", {}, "(você)") : salvar));
  }

  raiz.append(
    titulo("Acessos"),
    el("p", { class: "explica" },
      "Quem vai usar o site abre o endereço e toca em \"Criar conta\". A conta aparece aqui como ",
      el("strong", {}, "Aguardando liberação"), ": escolha o acesso e toque em Liberar. ",
      "Para tirar o acesso de alguém, volte para \"Aguardando liberação\"."),
    el("dl", { class: "ficha papeis" },
      el("dt", {}, "Só consulta"), el("dd", {}, "vê estoque, histórico e fotos"),
      el("dt", {}, "Registra entradas e saídas"), el("dd", {}, "também registra e cadastra pessoa e material"),
      el("dt", {}, "Administrador"), el("dd", {}, "também edita cadastros, cancela registros e libera acessos")),
    corpo);
  carregar();
  return {};
}
