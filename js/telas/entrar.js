// Entrar e criar conta. Quem cria a conta fica "aguardando liberação" até o
// administrador escolher o acesso dela (menu → Acessos).

import { el, campo, ocupar } from "../ui.js";
import * as supa from "../supa.js";

const GUARDA_EMAIL = "sad.email";

export function telaEntrar(raiz, { aoEntrar, motivo = "" }) {
  let modo = "entrar";
  let ultimo = "";
  try { ultimo = localStorage.getItem(GUARDA_EMAIL) || ""; } catch { /* nada */ }

  const nome = el("input", { type: "text", autocomplete: "name", autocapitalize: "words", maxlength: 80 });
  const email = el("input", { type: "email", autocomplete: "username", inputmode: "email", value: ultimo, autocapitalize: "none" });
  const senha = el("input", { type: "password", autocomplete: "current-password", minlength: 6 });
  const campoNome = campo("Seu nome (como aparece para a equipe)", nome);
  const mensagem = el("p", { class: motivo ? "erro-campo" : "erro-campo", hidden: !motivo }, motivo);
  const enviar = el("button", { type: "submit", class: "botao primario grande largo" }, "Entrar");
  const trocar = el("button", { type: "button", class: "botao discreto largo" }, "Primeira vez? Criar conta");

  function aplicarModo() {
    const criar = modo === "criar";
    campoNome.hidden = !criar;
    senha.setAttribute("autocomplete", criar ? "new-password" : "current-password");
    enviar.textContent = criar ? "Criar conta" : "Entrar";
    trocar.textContent = criar ? "Já tenho conta: entrar" : "Primeira vez? Criar conta";
  }
  trocar.addEventListener("click", () => { modo = modo === "entrar" ? "criar" : "entrar"; mensagem.hidden = true; aplicarModo(); });

  async function aoEnviar(ev) {
    ev.preventDefault();
    mensagem.hidden = true;
    mensagem.className = "erro-campo";
    const e = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { mostrar("Digite o seu e-mail."); return; }
    if (senha.value.length < 6) { mostrar("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (modo === "criar" && nome.value.trim().length < 2) { mostrar("Digite o seu nome."); return; }
    const soltar = ocupar(enviar, modo === "criar" ? "Criando…" : "Entrando…");
    try {
      try { localStorage.setItem(GUARDA_EMAIL, e); } catch { /* nada */ }
      if (modo === "criar") {
        const r = await supa.criarConta(e, senha.value, nome.value.trim());
        if (r.entrou) { aoEntrar(); return; }
        soltar();
        modo = "entrar"; aplicarModo();
        mensagem.className = "ok-campo";
        mostrar("Conta criada. Peça ao administrador para liberar o seu acesso; depois é só entrar com o e-mail e a senha.");
        return;
      }
      await supa.entrar(e, senha.value);
      aoEntrar();
    } catch (err) {
      soltar();
      mostrar(err.message);
    }
  }
  function mostrar(t) { mensagem.textContent = t; mensagem.hidden = false; }

  aplicarModo();
  raiz.append(el("section", { class: "entrar" },
    el("img", { src: "icone.svg", alt: "", width: 72, height: 72, class: "logo" }),
    el("h1", {}, "Sala de Aplicação Direta"),
    el("p", { class: "explica" }, "Controle de entrada e saída de material da manutenção."),
    el("form", { class: "formulario cartao", onsubmit: aoEnviar },
      campoNome, campo("E-mail", email), campo("Senha", senha), mensagem, enviar, trocar)));
  setTimeout(() => (ultimo ? senha : email).focus(), 50);
}

export function telaAguardando(raiz, { nome, aoVerificar, aoSair }) {
  const verificar = el("button", { type: "button", class: "botao primario grande largo" }, "Já fui liberado — verificar");
  verificar.addEventListener("click", async () => { const soltar = ocupar(verificar, "Verificando…"); try { await aoVerificar(); } finally { soltar(); } });
  raiz.append(el("section", { class: "entrar" },
    el("img", { src: "icone.svg", alt: "", width: 72, height: 72, class: "logo" }),
    el("h1", {}, nome ? `Olá, ${nome.split(" ")[0]}` : "Olá"),
    el("p", { class: "explica" }, "Sua conta foi criada e está aguardando liberação. Peça ao administrador para liberar o seu acesso no site (menu → Acessos)."),
    el("div", { class: "cartao" }, verificar,
      el("button", { type: "button", class: "botao discreto largo", onclick: aoSair }, "Sair"))));
}
