// Registrar uma saída ou uma entrada: foto, material, quantidade, quem retirou
// (ou recebeu) e quem acompanhou. Uma tela só, de cima para baixo, com o botão
// grande no fim — feita para o polegar.
//
// A foto começa a subir assim que é tirada: quando a pessoa termina de
// preencher, ela normalmente já chegou, e registrar é só gravar a linha.

import { el, campo, confirmar, ocupar } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { prepararFoto, novoId } from "../foto.js";
import { caminhoFoto, miniaturaDe, lerQuantidade, formatarQtd, normalizar } from "../texto.js";
import { seletor, detalheMaterial, detalhePessoa, dialogoMaterial, dialogoPessoa } from "./comum.js";

const GUARDA_RESP = "sad.responsavel";

function responsavelPadrao() {
  let id = null;
  try { id = JSON.parse(localStorage.getItem(GUARDA_RESP) || "null"); } catch { /* nada */ }
  const p = id != null ? D.pessoaPorId(id) : null;
  if (p && p.ativo) return p;
  const meu = normalizar(D.estado.perfil && D.estado.perfil.nome);
  return (meu && D.estado.pessoas.find((x) => x.ativo && normalizar(x.nome) === meu)) || null;
}

function juntar(l) {
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

function paraCampo(n) { return String(n).replace(".", ","); }

export function telaRegistrar(raiz, tipo, ctx) {
  const saida = tipo === "saida";
  if (!D.podeRegistrar()) {
    raiz.append(el("p", { class: "nada" }, "O seu acesso é só de consulta: ele não registra entradas e saídas."));
    return {};
  }

  const inicial = ctx.query.material ? D.materialPorId(Number(ctx.query.material)) : null;
  const f = {
    foto: null, caminho: null, envio: null,
    material: inicial && inicial.ativo ? inicial : null,
    retirante: null,
    responsavel: responsavelPadrao(),
  };
  const enviadas = new Set();
  // O aviso vermelho de "Falta…" some assim que a pessoa mexe no que faltava.
  let erroCaixa = null;
  const limparErro = () => { if (erroCaixa) erroCaixa.hidden = true; };
  let registrado = false;
  let tentouGravar = false;

  // ── 1. a foto ──
  const previa = el("img", { class: "previa", alt: "Foto do material", hidden: true });
  const semFoto = el("div", { class: "sem-foto" }, el("span", { class: "icone-camera", "aria-hidden": "true" }), "Nenhuma foto ainda");
  const statusFoto = el("p", { class: "status-foto", "aria-live": "polite" });
  const camera = el("input", { type: "file", accept: "image/*", capture: "environment", class: "invisivel", "aria-label": "Tirar foto" });
  const galeria = el("input", { type: "file", accept: "image/*", class: "invisivel", "aria-label": "Escolher foto da galeria" });
  const textoCamera = el("span", {}, "Tirar foto");
  const secFoto = el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, "1"), saida ? "Foto do material que está saindo" : "Foto do material que chegou"),
    el("div", { class: "foto-area" }, semFoto, previa),
    el("div", { class: "foto-botoes" },
      el("label", { class: `botao grande ${tipo}` }, camera, el("span", { "aria-hidden": "true" }, "📷 "), textoCamera),
      el("label", { class: "botao" }, galeria, "Galeria")),
    statusFoto);

  function enviarAgora() {
    const { foto, caminho } = f;
    const p = Promise.all([
      enviadas.has(caminho) ? null : supa.enviarFoto(caminho, foto.grande).then(() => enviadas.add(caminho)),
      enviadas.has(miniaturaDe(caminho)) ? null
        : supa.enviarFoto(miniaturaDe(caminho), foto.pequena).then(() => enviadas.add(miniaturaDe(caminho))).catch(() => {}),
    ]);
    f.envio = p;
    p.then(() => { if (f.caminho === caminho) statusFoto.textContent = "Foto enviada ✓"; })
      .catch(() => { if (f.caminho === caminho) statusFoto.textContent = "A foto sobe quando você tocar em Registrar."; });
    return p;
  }

  async function garantirFoto() {
    if (enviadas.has(f.caminho)) return;
    try { await f.envio; } catch { /* tenta de novo abaixo */ }
    if (enviadas.has(f.caminho)) return;
    await enviarAgora();
  }

  async function aoEscolherFoto(ev) {
    const arquivo = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;
    statusFoto.textContent = "Preparando a foto…";
    try {
      const nova = await prepararFoto(arquivo);
      if (f.foto) URL.revokeObjectURL(f.foto.previa);
      f.foto = nova;
      f.caminho = caminhoFoto(novoId());
      previa.src = nova.previa;
      previa.hidden = false;
      semFoto.hidden = true;
      textoCamera.textContent = "Tirar outra";
      secFoto.classList.remove("falta");
      limparErro();
      statusFoto.textContent = `Enviando a foto (${Math.max(1, Math.round(nova.grande.size / 1024))} KB)…`;
      enviarAgora().catch(() => {});
    } catch (e) {
      statusFoto.textContent = e.message;
    }
  }
  camera.addEventListener("change", aoEscolherFoto);
  galeria.addEventListener("change", aoEscolherFoto);

  // ── 2. o material ──
  const unidade = el("span", { class: "unidade" });
  const saldoAviso = el("p", { class: "saldo-aviso", hidden: true });
  const selMaterial = seletor({
    titulo: "Material", vazio: "Digite o nome ou o código", tipoRecente: "material",
    itens: () => D.estado.materiais, campos: (m) => [m.descricao, m.codigo, m.local],
    rotulo: (m) => m.descricao, detalhe: detalheMaterial, valor: f.material,
    aoMudar: (m) => { f.material = m; mostrarUnidade(); if (m) { secMaterial.classList.remove("falta"); limparErro(); } },
    criar: (termo) => dialogoMaterial({ descricao: termo }), textoCriar: "Cadastrar material",
  });
  const secMaterial = el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, "2"), "Material"), selMaterial.raiz);

  // ── 3. a quantidade ──
  const qtd = el("input", { type: "text", inputmode: "decimal", value: "1", class: "qtd-campo", "aria-label": "Quantidade", autocomplete: "off" });
  const mudar = (d) => {
    const v = lerQuantidade(qtd.value);
    const base = Number.isFinite(v) ? v : 0;
    qtd.value = paraCampo(Math.max(1, Math.round((base + d) * 1000) / 1000));
    mostrarUnidade();
  };
  qtd.addEventListener("input", () => { mostrarUnidade(); limparErro(); });
  qtd.addEventListener("focus", () => qtd.select());
  const secQtd = el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, "3"), "Quantidade"),
    el("div", { class: "contador" },
      el("button", { type: "button", class: "botao passo-qtd", "aria-label": "Diminuir", onclick: () => mudar(-1) }, "−"),
      qtd,
      el("button", { type: "button", class: "botao passo-qtd", "aria-label": "Aumentar", onclick: () => mudar(1) }, "+"),
      unidade),
    saldoAviso);

  function mostrarUnidade() {
    const m = f.material;
    unidade.textContent = m ? m.unidade : "";
    const q = lerQuantidade(qtd.value);
    if (saida && m && q > m.saldo) {
      saldoAviso.textContent = `Atenção: o saldo registrado é ${formatarQtd(m.saldo)} ${m.unidade}.`;
      saldoAviso.hidden = false;
    } else saldoAviso.hidden = true;
    if (q > 0) secQtd.classList.remove("falta");
  }
  mostrarUnidade();

  // ── 4 e 5. as pessoas ──
  const opcoesPessoa = {
    tipoRecente: "pessoa", itens: () => D.estado.pessoas, campos: (p) => [p.nome, p.matricula, p.funcao],
    rotulo: (p) => p.nome, detalhe: detalhePessoa,
    criar: (termo) => dialogoPessoa({ nome: termo }), textoCriar: "Cadastrar pessoa",
  };
  const selRetirante = saida ? seletor({
    ...opcoesPessoa, titulo: "Quem está retirando", vazio: "Nome ou matrícula de quem retira",
    aoMudar: (p) => { f.retirante = p; if (p) { secRetirante.classList.remove("falta"); limparErro(); } },
  }) : null;
  const secRetirante = saida ? el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, "4"), "Quem está retirando"), selRetirante.raiz) : null;

  const selResp = seletor({
    ...opcoesPessoa, tipoRecente: "responsavel", valor: f.responsavel,
    titulo: saida ? "Quem acompanhou a retirada" : "Quem recebeu",
    vazio: saida ? "Quem acompanhou a retirada" : "Quem recebeu o material",
    aoMudar: (p) => { f.responsavel = p; if (p) { secResp.classList.remove("falta"); limparErro(); } },
  });
  const secResp = el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, saida ? "5" : "4"), saida ? "Quem acompanhou a retirada" : "Quem recebeu o material"),
    selResp.raiz);

  // ── 6. o resto (opcional) ──
  const destino = el("input", { type: "text", maxlength: 80, autocomplete: "off", placeholder: "Ex.: Frota 433, OS 12345, compressor" });
  const entreguePor = el("input", { type: "text", maxlength: 80, autocomplete: "off", placeholder: "Fornecedor ou quem trouxe" });
  const documento = el("input", { type: "text", maxlength: 40, autocomplete: "off", placeholder: "Nota fiscal, requisição…" });
  const obs = el("textarea", { rows: 2, maxlength: 300 });
  const secExtra = el("section", { class: "passo" },
    el("h2", {}, el("span", { class: "num" }, saida ? "6" : "5"), "Detalhes ", el("small", {}, "(opcional)")),
    saida ? campo("Para onde vai (frota, OS, equipamento)", destino) : null,
    !saida ? campo("Entregue por", entreguePor) : null,
    !saida ? campo("Documento", documento) : null,
    campo("Observação", obs));

  // ── registrar ──
  erroCaixa = el("div", { class: "erro-caixa", role: "alert", hidden: true });
  const botao = el("button", { type: "button", class: `botao grande largo ${tipo}` }, saida ? "Registrar saída" : "Registrar entrada");
  botao.addEventListener("click", registrar);

  function mostrarErro(t) { erroCaixa.textContent = t; erroCaixa.hidden = false; }

  async function registrar() {
    erroCaixa.hidden = true;
    const q = lerQuantidade(qtd.value);
    const faltas = [];
    if (!f.foto) faltas.push([secFoto, "a foto"]);
    if (!f.material) faltas.push([secMaterial, "o material"]);
    if (!(q > 0)) faltas.push([secQtd, "a quantidade"]);
    if (saida && !f.retirante) faltas.push([secRetirante, "quem está retirando"]);
    if (!f.responsavel) faltas.push([secResp, saida ? "quem acompanhou" : "quem recebeu"]);
    for (const s of [secFoto, secMaterial, secQtd, secRetirante, secResp]) if (s) s.classList.remove("falta");
    if (faltas.length) {
      for (const [s] of faltas) s.classList.add("falta");
      mostrarErro(`Falta ${juntar(faltas.map((x) => x[1]))}.`);
      faltas[0][0].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (saida && q > f.material.saldo) {
      const ok = await confirmar(
        `O saldo registrado de ${f.material.descricao} é ${formatarQtd(f.material.saldo)} ${f.material.unidade}, ` +
        `e esta saída é de ${formatarQtd(q)}. Registrar mesmo assim? O saldo fica negativo e aparece como divergência no estoque.`,
        { sim: "Registrar mesmo assim" });
      if (!ok) return;
    }

    const soltar = ocupar(botao, "Enviando a foto…");
    const linha = {
      tipo, material_id: f.material.id, quantidade: q, foto: f.caminho,
      responsavel_id: f.responsavel.id, obs: obs.value.trim() || null,
    };
    if (saida) { linha.retirante_id = f.retirante.id; linha.destino = destino.value.trim() || null; }
    else { linha.entregue_por = entreguePor.value.trim() || null; linha.documento = documento.value.trim() || null; }

    try {
      await garantirFoto();
      botao.textContent = "Registrando…";
      const repeticao = tentouGravar;
      tentouGravar = true;
      try {
        await supa.inserir("movimentacoes?select=id", linha);
      } catch (e) {
        // A conexão caiu DEPOIS de o banco gravar: a foto já está num registro,
        // que é este mesmo. Não grava de novo.
        if (!(repeticao && e.codigo === "23505")) throw e;
      }
    } catch (e) {
      soltar();
      mostrarErro(e.status === 0 ? `${e.message} Nada foi perdido: toque em "${botao.textContent}" de novo.` : e.message);
      return;
    }

    registrado = true;
    D.aplicarMovimento(f.material.id, tipo, q);
    try { localStorage.setItem(GUARDA_RESP, JSON.stringify(f.responsavel.id)); } catch { /* nada */ }
    sucesso(q);
  }

  function sucesso(q) {
    const m = D.materialPorId(f.material.id) || f.material;
    raiz.replaceChildren(el("section", { class: `sucesso ${tipo}` },
      el("div", { class: "marca-ok", "aria-hidden": "true" }, "✓"),
      el("h1", {}, saida ? "Saída registrada" : "Entrada registrada"),
      el("img", { class: "previa pequena", src: f.foto.previa, alt: "" }),
      el("p", { class: "resumo" }, `${formatarQtd(q)} ${m.unidade} · ${m.descricao}`),
      el("p", {}, saida
        ? `Retirou: ${f.retirante.nome} · Acompanhou: ${f.responsavel.nome}`
        : `Recebeu: ${f.responsavel.nome}`),
      el("p", { class: "saldo-agora" }, `Saldo agora: ${formatarQtd(m.saldo)} ${m.unidade}`),
      el("div", { class: "acoes coluna" },
        el("button", { type: "button", class: `botao grande ${tipo}`, onclick: () => ctx.redesenhar() },
          saida ? "Registrar outra saída" : "Registrar outra entrada"),
        el("a", { href: "#/", class: "botao grande" }, "Voltar ao início"))));
    window.scrollTo(0, 0);
  }

  raiz.append(...[
    el("div", { class: `cabeca-registro ${tipo}` },
      el("h1", {}, saida ? "Saída de material" : "Entrada de material"),
      el("p", {}, saida ? "Material saindo da sala de aplicação direta." : "Material chegando na sala de aplicação direta.")),
    secFoto, secMaterial, secQtd, secRetirante, secResp, secExtra,
    el("div", { class: "rodape-acao" }, erroCaixa, botao),
  ].filter(Boolean)); // append(null) escreveria "null" na tela

  return {
    parar() { if (f.foto) URL.revokeObjectURL(f.foto.previa); },
    async podeSair() {
      if (registrado || !(f.foto || f.material || f.retirante)) return true;
      return confirmar(saida ? "Descartar esta saída sem registrar?" : "Descartar esta entrada sem registrar?",
        { sim: "Descartar", nao: "Continuar preenchendo", perigo: true });
    },
  };
}
