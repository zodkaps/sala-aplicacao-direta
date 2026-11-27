// Entrar. Conta nova não se cria aqui: quem cria é o administrador, em
// menu → Acessos, com uma senha provisória que a pessoa troca em Minha conta.
// (Contas antigas que se cadastraram sozinhas ainda podem aparecer como
// "aguardando liberação".)

import { el, campo, campoSenha, ocupar } from "../ui.js";
import * as supa from "../supa.js";

export const GUARDA_EMAIL = "sad.email";

export function telaEntrar(raiz, { aoEntrar, motivo = "" }) {
  let ultimo = "";
  try { ultimo = localStorage.getItem(GUARDA_EMAIL) || ""; } catch { /* nada */ }

  const email = el("input", { type: "email", autocomplete: "username", inputmode: "email", value: ultimo, autocapitalize: "none", maxlength: 254 });
  const senha = el("input", { type: "password", autocomplete: "current-password", maxlength: 72 });
  const mensagem = el("p", { class: "erro-campo", hidden: !motivo }, motivo);
  const enviar = el("button", { type: "submit", class: "botao primario grande largo" }, "Entrar");

  async function aoEnviar(ev) {
    ev.preventDefault();
    mensagem.hidden = true;
    const e = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { mostrar("Digite o seu e-mail."); return; }
    if (!senha.value) { mostrar("Digite a sua senha."); return; }
    const soltar = ocupar(enviar, "Entrando…");
    try {
      await supa.entrar(e, senha.value);
      try { localStorage.setItem(GUARDA_EMAIL, e); } catch { /* nada */ }
      aoEntrar();
    } catch (err) {
      soltar();
      mostrar(err.message);
    }
  }
  function mostrar(t) { mensagem.textContent = t; mensagem.hidden = false; }

  raiz.append(el("section", { class: "entrar" },
    el("form", { class: "formulario cartao cartao-entrar", onsubmit: aoEnviar },
      cabecalho(),
      campo("E-mail", email), campoSenha("Senha", senha), mensagem, enviar,
      el("p", { class: "dica-entrar" }, "Não tem acesso ou esqueceu a senha? Peça ao administrador do PCM: ele cria o acesso e dá uma senha provisória."))));
  setTimeout(() => (ultimo ? senha : email).focus(), 50);
}

/** O alto do cartão de entrar: a estrela da Makro e o nome do sistema, como
 *  no painel de programação. */
function cabecalho() {
  return el("div", { class: "logo-linha" },
    el("img", { src: "icone.svg", alt: "", width: 44, height: 44 }),
    el("div", {}, el("h1", {}, "Sala de Aplicação Direta"), el("small", {}, "manutenção · controle de material")));
}

export function telaAguardando(raiz, { nome, aoVerificar, aoSair }) {
  const verificar = el("button", { type: "button", class: "botao primario grande largo" }, "Já fui liberado — verificar");
  verificar.addEventListener("click", async () => { const soltar = ocupar(verificar, "Verificando…"); try { await aoVerificar(); } finally { soltar(); } });
  raiz.append(el("section", { class: "entrar" },
    el("div", { class: "cartao cartao-entrar" },
      cabecalho(),
      el("h2", {}, nome ? `Olá, ${nome.split(" ")[0]}` : "Olá"),
      el("p", { class: "explica" }, "Sua conta está aguardando liberação. Peça ao administrador para escolher o seu acesso no site (menu → Acessos)."),
      verificar,
      el("button", { type: "button", class: "botao discreto largo", onclick: aoSair }, "Sair"))));
}
