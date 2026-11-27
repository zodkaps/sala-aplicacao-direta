// Os acessos ao site (só o administrador): criar a conta de alguém com uma
// senha provisória, escolher o acesso de cada um e dar senha nova a quem
// esqueceu. Criar conta e trocar senha passam pela função `acessos` do
// Supabase — a chave de administrador fica lá, nunca no site.

import { el, campo, ocupar, aviso, janela } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { PAPEIS, quando, senhaFraca, gerarSenha, emailValido, emailSemFinal } from "../texto.js";
import { titulo } from "./comum.js";

const ACESSOS_CRIAVEIS = ["consulta", "operador", "admin"];

export async function contarPendentes() {
  if (!D.ehAdmin()) return 0;
  try {
    const l = await supa.rpc("listar_acessos");
    return (l || []).filter((a) => a.papel === "pendente").length;
  } catch { return 0; }
}

/** Campo de senha provisória: à vista (o administrador vai passá-la adiante),
 *  já preenchido com uma senha gerada, e com o botão de gerar outra. */
function campoProvisoria() {
  const senha = el("input", {
    type: "text", value: gerarSenha(), maxlength: 72, autocomplete: "off",
    autocapitalize: "none", autocorrect: "off", spellcheck: "false", class: "senha-provisoria",
  });
  const gerar = el("button", { type: "button", class: "botao", onclick: () => { senha.value = gerarSenha(); } }, "Gerar outra");
  return { senha, raiz: el("div", { class: "campo" },
    el("span", { class: "rotulo" }, "Senha provisória"),
    el("div", { class: "linha-senha" }, senha, gerar),
    el("small", { class: "ajuda" }, "Pelo menos 8 caracteres, com letras e números. A pessoa troca em Minha conta.")) };
}

/** O que passar para a pessoa (pessoalmente — não em grupo de mensagem). */
function entrega(nome, email, senha) {
  const texto = `Sala de Aplicação Direta\n${location.origin}${location.pathname}\nE-mail: ${email}\nSenha provisória: ${senha}\nTroque a senha em Minha conta.`;
  const copiar = el("button", {
    type: "button", class: "botao",
    onclick: async () => {
      try { await navigator.clipboard.writeText(texto); aviso("Copiado."); } catch { aviso("Não deu para copiar: anote à mão.", "alerta"); }
    },
  }, "Copiar");
  return el("div", { class: "entrega", role: "status" },
    el("strong", {}, `Pronto: acesso de ${nome}`),
    el("dl", { class: "ficha" },
      el("dt", {}, "E-mail"), el("dd", {}, email),
      el("dt", {}, "Senha provisória"), el("dd", { class: "senha-provisoria" }, senha)),
    el("p", { class: "ajuda" }, "Passe para a pessoa pessoalmente (não mande em grupo). No primeiro acesso, ela troca a senha em Minha conta."),
    copiar);
}

export function telaAcessos(raiz) {
  if (!D.ehAdmin()) { raiz.append(el("p", { class: "nada" }, "Só o administrador vê os acessos.")); return {}; }
  const corpo = el("div", { class: "lista-acessos" }, el("p", { class: "nada" }, "Carregando…"));

  // ── criar acesso ──
  const nome = el("input", { type: "text", maxlength: 80, autocomplete: "off", autocapitalize: "words" });
  const email = el("input", {
    type: "email", maxlength: 254, autocomplete: "off", inputmode: "email", autocapitalize: "none",
    "aria-describedby": "email-sem-final",
  });
  // E-mail sem o final (.com.br) vale: é só o nome de entrar. O aviso é para a
  // pessoa conferir antes, porque depois de criada a conta o e-mail não muda.
  const semFinal = el("small", { class: "ajuda", id: "email-sem-final", hidden: true },
    "Sem o final (.com.br…): serve para entrar no site — a pessoa vai digitar exatamente assim.");
  email.addEventListener("input", () => { semFinal.hidden = true; });
  email.addEventListener("change", () => { semFinal.hidden = !emailSemFinal(email.value.trim().toLowerCase()); });
  const papel = el("select", {}, ...ACESSOS_CRIAVEIS.map((v) => el("option", { value: v, selected: v === "operador" }, PAPEIS[v])));
  const prov = campoProvisoria();
  const erro = el("p", { class: "erro-campo", hidden: true });
  const resultado = el("div", {});
  const criar = el("button", { type: "submit", class: "botao primario" }, "Criar acesso");

  async function enviar(ev) {
    ev.preventDefault();
    erro.hidden = true;
    const e = email.value.trim().toLowerCase();
    const n = nome.value.trim().replace(/\s+/g, " ");
    const s = prov.senha.value;
    const problema = n.length < 2 ? "Escreva o nome da pessoa."
      : !e ? "Escreva o e-mail da pessoa (é com ele que ela entra)."
        : !emailValido(e) ? "Esse e-mail não vale: sem acento nem espaço, e com um @ só (ex.: nome.sobrenome@empresa)."
          : senhaFraca(s);
    if (problema) { erro.textContent = problema; erro.hidden = false; return; }
    const soltar = ocupar(criar, "Criando…");
    try {
      await supa.funcao("acessos", { acao: "criar", nome: n, email: e, senha: s, papel: papel.value });
      resultado.replaceChildren(entrega(n, e, s));
      nome.value = ""; email.value = ""; semFinal.hidden = true; prov.senha.value = gerarSenha();
      await carregar();
    } catch (x) {
      erro.textContent = x.message; erro.hidden = false;
    } finally { soltar(); }
  }

  async function carregar() {
    try {
      const lista = await supa.rpc("listar_acessos");
      corpo.replaceChildren(...(lista && lista.length ? lista.map(linha) : [el("p", { class: "nada" }, "Nenhuma conta.")]));
      // a bolinha do menu acompanha quantas contas ainda esperam liberação
      const n = (lista || []).filter((a) => a.papel === "pendente").length;
      for (const b of document.querySelectorAll(".pendentes")) { b.hidden = !n; b.textContent = String(n); }
    } catch (e) {
      corpo.replaceChildren(el("p", { class: "nada" }, e.message));
    }
  }

  function linha(a) {
    const eu = supa.eu() && supa.eu().id === a.id;
    const nomeConta = el("input", { type: "text", value: a.nome || "", maxlength: 80, "aria-label": "Nome", autocomplete: "off" });
    const sel = el("select", { "aria-label": "Acesso", disabled: eu },
      ...Object.entries(PAPEIS).map(([v, t]) => el("option", { value: v, selected: v === a.papel }, t)));
    const salvar = el("button", { type: "button", class: "botao primario" }, a.papel === "pendente" ? "Liberar" : "Salvar");
    salvar.addEventListener("click", async () => {
      if (a.papel === "pendente" && sel.value === "pendente") sel.value = "operador";
      const soltar = ocupar(salvar, "Salvando…");
      try {
        await supa.rpc("definir_acesso", { p_id: a.id, p_papel: sel.value, p_nome: nomeConta.value.trim() || null });
        aviso(sel.value === "pendente" ? "Acesso suspenso." : "Acesso salvo.");
        await carregar();
      } catch (e) {
        soltar();
        aviso(e.message, "erro", 6000);
      }
    });
    const novaSenha = el("button", { type: "button", class: "botao", onclick: () => dialogoSenha(a) }, "Senha nova");
    return el("div", { class: `acesso${a.papel === "pendente" ? " pendente" : ""}` },
      el("div", { class: "acesso-cabeca" },
        el("strong", {}, a.nome || "(sem nome)"),
        el("small", {}, a.email),
        el("small", {}, `Conta criada ${quando(a.criado_em)}${a.ultimo_acesso ? ` · último acesso ${quando(a.ultimo_acesso)}` : " · nunca entrou"}`)),
      el("div", { class: "acesso-campos" }, nomeConta, sel, eu ? el("small", {}, "(você)") : salvar, novaSenha));
  }

  function dialogoSenha(a) {
    return janela(`Senha nova: ${a.nome || a.email}`, (fechar) => {
      const p = campoProvisoria();
      const erroS = el("p", { class: "erro-campo", hidden: true });
      const saida = el("div", {});
      const ok = el("button", { type: "button", class: "botao primario" }, "Dar esta senha");
      ok.addEventListener("click", async () => {
        erroS.hidden = true;
        const fraca = senhaFraca(p.senha.value);
        if (fraca) { erroS.textContent = fraca; erroS.hidden = false; return; }
        const soltar = ocupar(ok, "Trocando…");
        try {
          await supa.funcao("acessos", { acao: "senha", id: a.id, senha: p.senha.value });
          saida.replaceChildren(entrega(a.nome || a.email, a.email, p.senha.value));
          ok.hidden = true;
        } catch (e) {
          soltar();
          erroS.textContent = e.message; erroS.hidden = false;
        }
      });
      return [
        el("p", { class: "pergunta" }, "A senha antiga para de valer. Passe a nova para a pessoa; ela troca em Minha conta."),
        p.raiz, erroS, saida,
        el("div", { class: "acoes" }, el("button", { type: "button", class: "botao", onclick: () => fechar() }, "Fechar"), ok),
      ];
    });
  }

  raiz.append(
    titulo("Acessos"),
    el("form", { class: "formulario cartao criar-acesso", onsubmit: enviar },
      el("h2", {}, "Criar acesso"),
      el("div", { class: "dupla" }, campo("Nome", nome), el("div", { class: "campo-email" }, campo("E-mail", email), semFinal)),
      campo("Acesso", papel),
      prov.raiz, erro,
      el("div", { class: "acoes" }, criar)),
    resultado,
    el("dl", { class: "ficha papeis" },
      el("dt", {}, "Só consulta (supervisor)"), el("dd", {}, "vê estoque, histórico e fotos; não registra nada"),
      el("dt", {}, "Registra entradas e saídas"), el("dd", {}, "também registra e cadastra pessoa e material"),
      el("dt", {}, "Administrador"), el("dd", {}, "também faz a vistoria, apaga registros, cadastra frotas e cria acessos")),
    el("h2", { class: "titulo-secao" }, "Contas"),
    corpo);
  carregar();
  return {};
}
