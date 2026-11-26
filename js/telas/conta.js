// Minha conta: quem está usando, trocar a senha e sair deste aparelho.

import { el, campo, ocupar, aviso, confirmar } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { PAPEIS } from "../texto.js";
import { VERSAO } from "../config.js";
import { titulo } from "./comum.js";

export function telaConta(raiz, ctx) {
  const p = D.estado.perfil || {};
  const nova = el("input", { type: "password", autocomplete: "new-password", minlength: 6 });
  const repete = el("input", { type: "password", autocomplete: "new-password", minlength: 6 });
  const trocar = el("button", { type: "submit", class: "botao primario" }, "Trocar a senha");
  const erro = el("p", { class: "erro-campo", hidden: true });

  async function enviar(ev) {
    ev.preventDefault();
    erro.hidden = true;
    if (nova.value.length < 6) { erro.textContent = "A senha precisa ter pelo menos 6 caracteres."; erro.hidden = false; return; }
    if (nova.value !== repete.value) { erro.textContent = "As duas senhas não são iguais."; erro.hidden = false; return; }
    const soltar = ocupar(trocar, "Trocando…");
    try {
      await supa.trocarSenha(nova.value);
      nova.value = ""; repete.value = "";
      aviso("Senha trocada.");
    } catch (e) {
      erro.textContent = e.message; erro.hidden = false;
    } finally { soltar(); }
  }

  raiz.append(
    titulo("Minha conta"),
    el("dl", { class: "ficha" },
      el("dt", {}, "Nome"), el("dd", {}, p.nome || "—"),
      el("dt", {}, "E-mail"), el("dd", {}, (supa.eu() && supa.eu().email) || "—"),
      el("dt", {}, "Acesso"), el("dd", {}, PAPEIS[p.papel] || p.papel || "—")),
    el("form", { class: "formulario cartao", onsubmit: enviar },
      el("h2", {}, "Trocar a senha"),
      campo("Senha nova", nova), campo("Repita a senha nova", repete), erro,
      el("div", { class: "acoes" }, trocar)),
    el("div", { class: "acoes" },
      el("button", {
        type: "button", class: "botao perigo",
        onclick: async () => { if (await confirmar("Sair deste aparelho?", { sim: "Sair" })) ctx.sair(); },
      }, "Sair deste aparelho")),
    el("p", { class: "versao" }, `Sala de Aplicação Direta · versão ${VERSAO}`));
  return {};
}
