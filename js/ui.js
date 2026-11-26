// Peças de tela. Texto de gente entra sempre como texto (via `el`, que usa
// nós de texto), nunca como HTML: nome de material ou de pessoa não vira código.

export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k in n && k !== "list" && k !== "form" && typeof v !== "string") n[k] = v;
    else if (k === "value" || k === "checked") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat(9)) {
    if (f == null || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

export const $ = (s, r = document) => r.querySelector(s);

/** Mensagem curta no rodapé, que some sozinha. */
export function aviso(texto, tipo = "ok", ms = 3000) {
  const caixa = $("#avisos");
  if (!caixa) return;
  while (caixa.children.length >= 2) caixa.firstElementChild.remove();
  const a = el("div", { class: `aviso ${tipo}`, role: tipo === "erro" ? "alert" : "status" }, texto);
  caixa.append(a);
  setTimeout(() => { a.classList.add("saindo"); setTimeout(() => a.remove(), 300); }, ms);
}

/** Janela por cima da tela. `montar(fechar)` devolve o conteúdo. */
export function janela(titulo, montar, { larga = false } = {}) {
  const d = el("dialog", { class: larga ? "janela larga" : "janela" });
  let resolver;
  const fim = new Promise((r) => { resolver = r; });
  const fechar = (valor) => { if (d.open) d.close(); d.remove(); resolver(valor); };
  d.addEventListener("cancel", (e) => { e.preventDefault(); fechar(undefined); });
  d.addEventListener("click", (e) => { if (e.target === d) fechar(undefined); });
  d.append(
    el("header", {},
      el("h2", {}, titulo),
      el("button", { type: "button", class: "fechar", "aria-label": "Fechar", onclick: () => fechar(undefined) }, "✕")),
    el("div", { class: "conteudo" }, montar(fechar)),
  );
  document.body.append(d);
  d.showModal();
  return fim;
}

export function confirmar(texto, { sim = "Confirmar", nao = "Voltar", perigo = false } = {}) {
  return janela("Confirme", (fechar) => [
    el("p", { class: "pergunta" }, texto),
    el("div", { class: "acoes" },
      el("button", { type: "button", class: "botao", onclick: () => fechar(false) }, nao),
      el("button", { type: "button", class: perigo ? "botao perigo" : "botao primario", onclick: () => fechar(true) }, sim)),
  ]).then((v) => v === true);
}

/** Pede um texto (ex.: o motivo de um cancelamento). Devolve null se desistir. */
export function perguntar(texto, { rotulo = "", minimo = 1, botao = "Confirmar", perigo = false } = {}) {
  return janela("Confirme", (fechar) => {
    const campo = el("textarea", { rows: 3, maxlength: 300, "aria-label": rotulo || texto });
    const erro = el("p", { class: "erro-campo", hidden: true });
    const ok = () => {
      const v = campo.value.trim();
      if (v.length < minimo) { erro.textContent = `Escreva pelo menos ${minimo} letras.`; erro.hidden = false; return; }
      fechar(v);
    };
    setTimeout(() => campo.focus(), 50);
    return [
      el("p", { class: "pergunta" }, texto),
      rotulo ? el("label", { class: "rotulo" }, rotulo) : null,
      campo, erro,
      el("div", { class: "acoes" },
        el("button", { type: "button", class: "botao", onclick: () => fechar(null) }, "Voltar"),
        el("button", { type: "button", class: perigo ? "botao perigo" : "botao primario", onclick: ok }, botao)),
    ];
  }).then((v) => (typeof v === "string" ? v : null));
}

/** Põe o botão em "ocupado" e devolve a função que o solta. */
export function ocupar(botao, texto) {
  const antes = botao.textContent;
  botao.disabled = true;
  botao.classList.add("ocupado");
  if (texto) botao.textContent = texto;
  return () => { botao.disabled = false; botao.classList.remove("ocupado"); botao.textContent = antes; };
}

/** Campo com rótulo em cima, que é o que lê melhor na tela pequena. */
export function campo(rotulo, entrada, ajuda) {
  return el("label", { class: "campo" },
    el("span", { class: "rotulo" }, rotulo),
    entrada,
    ajuda ? el("small", { class: "ajuda" }, ajuda) : null);
}

let nSenha = 0;

/** Campo de senha com o botão "Mostrar": no celular é fácil errar uma letra
 *  sem ver. O botão fica fora do <label> para o nome do campo continuar
 *  sendo só o rótulo (quem usa leitor de tela ouve "Senha", não "Senha Mostrar"). */
export function campoSenha(rotulo, entrada) {
  nSenha += 1;
  entrada.id = entrada.id || `senha-${nSenha}`;
  // Visível, a senha não pode ganhar maiúscula nem correção do teclado.
  entrada.setAttribute("autocapitalize", "none");
  entrada.setAttribute("autocorrect", "off");
  entrada.setAttribute("spellcheck", "false");
  const botao = el("button", {
    type: "button", class: "mostrar-senha", "aria-controls": entrada.id,
    "aria-pressed": "false", "aria-label": "Mostrar a senha",
  }, "Mostrar");
  botao.addEventListener("click", () => {
    const ver = entrada.type === "password";
    const fim = entrada.value.length;
    entrada.type = ver ? "text" : "password";
    botao.textContent = ver ? "Ocultar" : "Mostrar";
    botao.setAttribute("aria-pressed", String(ver));
    botao.setAttribute("aria-label", ver ? "Ocultar a senha" : "Mostrar a senha");
    entrada.focus({ preventScroll: true });
    try { entrada.setSelectionRange(fim, fim); } catch { /* nada */ }
  });
  return el("div", { class: "campo" },
    el("label", { class: "rotulo", for: entrada.id }, rotulo),
    el("div", { class: "senha-caixa" }, entrada, botao));
}

/** Volta a esconder as senhas de um formulário (antes de enviar). */
export function esconderSenhas(raiz) {
  for (const b of raiz.querySelectorAll(".mostrar-senha[aria-pressed='true']")) b.click();
}

/** Espera o usuário parar de digitar. */
export function adiar(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Baixa um arquivo gerado aqui (CSV). */
export function baixar(nome, conteudo, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = el("a", { href: url, download: nome, class: "invisivel" });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
