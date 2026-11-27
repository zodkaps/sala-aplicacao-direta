// Peças usadas por várias telas: o seletor de material/pessoa/frota, os
// cadastros (com a foto de referência do material), a lista de movimentações
// (com miniatura) e a ficha de cada uma — com cancelar e apagar, para o
// administrador.

import { el, janela, aviso, campo, ocupar, perguntar, confirmar } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { prepararFoto, novoId } from "../foto.js";
import { icone } from "../icones.js";
import {
  filtrar, formatarQtd, quando, dataHora, miniaturaDe, caminhoFoto, termoSeguro, lerQuantidade, UNIDADES,
} from "../texto.js";

export const detalheMaterial = (m) => [
  `Saldo: ${formatarQtd(m.saldo)} ${m.unidade}`,
  m.referencia ? `ref. ${m.referencia}` : "",
  m.codigo ? `Protheus ${m.codigo}` : "",
  m.local || "",
].filter(Boolean).join(" · ");

export const detalheFrota = (f) => [f.descricao || "", f.placa || ""].filter(Boolean).join(" · ");

export const detalhePessoa = (p) => [p.matricula ? `mat. ${p.matricula}` : "", p.funcao || ""]
  .filter(Boolean).join(" · ");

/** Uma miniatura (a foto chega depois, por carregarMiniaturas). Sem foto, o ícone. */
export function miniatura(caminho, classe = "mini", iconeVazio = "estoque") {
  return caminho
    ? el("span", { class: classe }, el("img", { alt: "", loading: "lazy", decoding: "async", dataset: { foto: caminho } }))
    : el("span", { class: `${classe} sem-imagem` }, icone(iconeVazio, 26));
}

/** Abre uma foto grande por cima da tela. */
export function verFoto(caminho, titulo) {
  return janela(titulo, () => {
    const foto = el("img", { class: "foto-grande", alt: titulo });
    supa.enderecosDasFotos([caminho]).then((u) => { if (u[caminho]) foto.src = u[caminho]; else foto.alt = "Não consegui abrir a foto."; })
      .catch(() => { foto.alt = "Sem conexão para abrir a foto."; });
    return [foto];
  }, { larga: true });
}

// ── o seletor: busca no que já está em memória, sem esperar a rede ─────────

export function seletor(o) {
  const raiz = el("div", { class: "seletor" });
  let atual = o.valor || null;

  function escolher(item) {
    atual = item;
    D.lembrar(o.tipoRecente, item.id);
    o.aoMudar(item);
    desenhar();
  }

  function desenhar(focar = false) {
    raiz.replaceChildren();
    if (atual) {
      const det = o.detalhe(atual);
      const f = o.foto ? o.foto(atual) : null;
      raiz.append(el("div", { class: "escolhido" },
        f ? el("button", {
          type: "button", class: "foto-escolhido", "aria-label": "Ver a foto de referência",
          onclick: () => verFoto(f, o.rotulo(atual)),
        }, el("img", { alt: "", dataset: { foto: f } })) : null,
        el("div", { class: "escolhido-texto" }, el("strong", {}, o.rotulo(atual)), det ? el("small", {}, det) : null),
        el("button", {
          type: "button", class: "botao discreto",
          onclick: () => { atual = null; o.aoMudar(null); desenhar(true); },
        }, "Trocar")));
      carregarMiniaturas(raiz);
      return;
    }
    const busca = el("input", {
      type: "search", placeholder: o.vazio, autocomplete: "off", enterkeyhint: "search",
      "aria-label": o.titulo, class: "busca",
    });
    const lista = el("div", { class: "opcoes" });
    const mostrar = () => {
      const termo = busca.value.trim();
      const ativos = o.itens().filter((i) => i.ativo !== false);
      let achados;
      let dica = "";
      if (!termo) {
        const rec = D.recentes(o.tipoRecente).map((id) => ativos.find((i) => i.id === id)).filter(Boolean);
        achados = (rec.length ? rec : ativos).slice(0, 6);
        dica = !ativos.length ? "O cadastro ainda está vazio." : rec.length ? "Usados por último:" : "Do cadastro:";
      } else {
        achados = filtrar(ativos, termo, o.campos, 8);
        if (!achados.length) dica = "Nada encontrado com esse nome.";
      }
      const filhos = [];
      if (dica) filhos.push(el("p", { class: "dica" }, dica));
      for (const i of achados) {
        const det = o.detalhe(i);
        filhos.push(el("button", { type: "button", class: o.foto ? "opcao com-foto" : "opcao", onclick: () => escolher(i) },
          o.foto ? miniatura(o.foto(i), "mini-sel") : null,
          el("span", { class: "opcao-texto" }, el("strong", {}, o.rotulo(i)), det ? el("small", {}, det) : null)));
      }
      if (o.criar && (o.podeCriar ? o.podeCriar() : D.podeRegistrar())) {
        filhos.push(el("button", {
          type: "button", class: "opcao nova",
          onclick: async () => { const novo = await o.criar(termo); if (novo && novo !== "apagado") escolher(novo); },
        }, termo.length >= 2 ? `+ ${o.textoCriar}: "${termo}"` : `+ ${o.textoCriar}`));
      }
      lista.replaceChildren(...filhos);
      carregarMiniaturas(lista);
    };
    busca.addEventListener("input", mostrar);
    raiz.append(busca, lista);
    mostrar();
    if (focar) setTimeout(() => busca.focus(), 30);
  }

  desenhar();
  return { raiz, valor: () => atual, definir(item) { atual = item; desenhar(); } };
}

// ── cadastros rápidos (e a edição e o apagar, para o administrador) ────────

function texto(valor, props = {}) {
  return el("input", { type: "text", value: valor ?? "", autocomplete: "off", ...props });
}

/** O botão "Apagar" de um cadastro (só o administrador, só ao editar). O banco
 *  recusa apagar o que tem movimentação; aí a mensagem diz para desativar. */
function botaoApagar(rotulo, aoApagar, fechar) {
  return el("button", {
    type: "button", class: "botao perigo",
    onclick: async (ev) => {
      if (!(await confirmar(`Apagar ${rotulo} de vez? Isso não tem volta (fica só uma cópia de segurança, que o administrador vê no banco).`,
        { sim: "Apagar", perigo: true }))) return;
      const soltar = ocupar(ev.currentTarget, "Apagando…");
      try {
        await aoApagar();
        aviso("Cadastro apagado.");
        fechar("apagado");
      } catch (e) {
        soltar();
        aviso(e.message, "erro", 8000);
      }
    },
  }, icone("lixeira", 18), "Apagar");
}

/** A foto de referência no cadastro do material: tirar, escolher, trocar ou tirar. */
function campoFotoMaterial(atual) {
  let nova = null;
  let remover = false;
  const previa = el("img", { class: "previa-material", alt: "Foto de referência do material", hidden: !atual });
  const vazio = el("div", { class: "sem-foto pequena", hidden: !!atual }, icone("camera", 30), "Sem foto");
  if (atual) {
    supa.enderecosDasFotos([atual]).then((u) => { if (u[atual]) previa.src = u[atual]; }).catch(() => {});
  }
  const status = el("small", { class: "ajuda" }, "Opcional. Ajuda a reconhecer a peça na retirada.");
  const tirar = el("button", { type: "button", class: "botao discreto", hidden: !atual }, "Tirar a foto");
  async function aoEscolher(ev) {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!arq) return;
    status.textContent = "Preparando a foto…";
    try {
      const p = await prepararFoto(arq);
      if (nova) URL.revokeObjectURL(nova.previa);
      nova = p; remover = false;
      previa.src = p.previa; previa.hidden = false; vazio.hidden = true; tirar.hidden = false;
      status.textContent = "Foto pronta: ela sobe quando você salvar.";
    } catch (e) { status.textContent = e.message; }
  }
  const camera = el("input", { type: "file", accept: "image/*", capture: "environment", class: "invisivel", "aria-label": "Tirar foto do material" });
  const galeria = el("input", { type: "file", accept: "image/*", class: "invisivel", "aria-label": "Escolher foto do material" });
  camera.addEventListener("change", aoEscolher);
  galeria.addEventListener("change", aoEscolher);
  tirar.addEventListener("click", () => {
    if (nova) { URL.revokeObjectURL(nova.previa); nova = null; }
    remover = !!atual;
    previa.hidden = true; vazio.hidden = false; tirar.hidden = true;
    status.textContent = atual ? "A foto sai quando você salvar." : "Opcional. Ajuda a reconhecer a peça na retirada.";
  });
  const raiz = el("div", { class: "campo" },
    el("span", { class: "rotulo" }, "Foto de referência"),
    el("div", { class: "foto-material" }, previa, vazio),
    el("div", { class: "foto-botoes" },
      el("label", { class: "botao" }, camera, icone("camera", 20), "Tirar foto"),
      el("label", { class: "botao" }, galeria, icone("galeria", 20), "Galeria")),
    tirar, status);
  return {
    raiz,
    /** Envia a foto nova (se houver) e diz o que gravar em `foto`. */
    async gravar() {
      if (nova) {
        const caminho = caminhoFoto(novoId());
        await supa.enviarFoto(caminho, nova.grande);
        await supa.enviarFoto(miniaturaDe(caminho), nova.pequena).catch(() => {});
        return { mudou: true, foto: caminho };
      }
      if (remover) return { mudou: true, foto: null };
      return { mudou: false };
    },
    soltar() { if (nova) URL.revokeObjectURL(nova.previa); },
  };
}

export function dialogoMaterial(inicial = {}) {
  const editar = inicial.id != null;
  let foto = null;
  return janela(editar ? "Editar material" : "Cadastrar material", (fechar) => {
    const descricao = texto(inicial.descricao, { maxlength: 120, required: true });
    const unidade = el("select", {},
      ...[...new Set([...(inicial.unidade ? [inicial.unidade] : []), ...UNIDADES])]
        .map((u) => el("option", { value: u, selected: u === (inicial.unidade || "UN") }, u)));
    const referencia = texto(inicial.referencia, { maxlength: 60, placeholder: "Ex.: 0 986 452 041" });
    const codigo = texto(inicial.codigo, { maxlength: 30, inputmode: "text", placeholder: "Ex.: 000123456" });
    const local = texto(inicial.local, { maxlength: 60, placeholder: "Ex.: Prateleira 3" });
    const minimo = texto(inicial.minimo ? String(inicial.minimo).replace(".", ",") : "", { inputmode: "decimal", placeholder: "0" });
    const ativo = el("input", { type: "checkbox", checked: inicial.ativo !== false });
    const erro = el("p", { class: "erro-campo", hidden: true });
    const salvar = el("button", { type: "submit", class: "botao primario" }, editar ? "Salvar" : "Cadastrar");
    foto = campoFotoMaterial(inicial.foto || null);

    async function enviar(ev) {
      ev.preventDefault();
      erro.hidden = true;
      const min = minimo.value.trim() ? lerQuantidade(minimo.value) : 0;
      if (descricao.value.trim().length < 2) { erro.textContent = "Escreva a descrição do material."; erro.hidden = false; return; }
      if (!Number.isFinite(min) || min < 0) { erro.textContent = "O estoque mínimo tem de ser um número."; erro.hidden = false; return; }
      const linha = {
        descricao: descricao.value.trim(), unidade: unidade.value,
        referencia: referencia.value.trim() || null,
        codigo: codigo.value.trim() || null, local: local.value.trim() || null, minimo: min,
      };
      if (editar) linha.ativo = ativo.checked;
      const soltar = ocupar(salvar, "Salvando…");
      try {
        const f = await foto.gravar();
        if (f.mudou) linha.foto = f.foto;
        const r = editar
          ? await supa.atualizar("materiais", `id=eq.${inicial.id}`, linha)
          : await supa.inserir("materiais", linha);
        D.guardarMaterial(r);
        // A foto antiga sai do bucket (só o administrador edita, e só ele apaga arquivo).
        if (f.mudou && inicial.foto) supa.apagarFotos([inicial.foto, miniaturaDe(inicial.foto)]).catch(() => {});
        aviso(editar ? "Material atualizado." : "Material cadastrado.");
        fechar(D.materialPorId(r.id));
      } catch (e) {
        soltar();
        erro.textContent = e.message; erro.hidden = false;
      }
    }

    setTimeout(() => descricao.focus(), 50);
    return el("form", { class: "formulario", onsubmit: enviar },
      campo("Descrição", descricao),
      foto.raiz,
      campo("Referência do fabricante", referencia, "O número da peça no catálogo do fabricante. Opcional"),
      campo("Código Protheus", codigo, "Opcional"),
      el("div", { class: "dupla" }, campo("Unidade", unidade), campo("Estoque mínimo", minimo)),
      campo("Onde fica na sala", local, "Opcional"),
      editar && D.ehAdmin() ? el("label", { class: "marcar" }, ativo, " Ativo (desmarque para tirar das listas)") : null,
      erro,
      el("div", { class: "acoes" },
        editar && D.ehAdmin() ? botaoApagar("este material", async () => {
          await supa.apagar("materiais", `id=eq.${inicial.id}`);
          D.removerMaterial(inicial.id);
          if (inicial.foto) supa.apagarFotos([inicial.foto, miniaturaDe(inicial.foto)]).catch(() => {});
        }, fechar) : null,
        el("button", { type: "button", class: "botao", onclick: () => fechar(null) }, "Voltar"), salvar));
  }).finally(() => { if (foto) foto.soltar(); });
}

export function dialogoPessoa(inicial = {}) {
  const editar = inicial.id != null;
  return janela(editar ? "Editar pessoa" : "Cadastrar pessoa", (fechar) => {
    const nome = texto(inicial.nome, { maxlength: 80, autocomplete: "name", autocapitalize: "words" });
    const matricula = texto(inicial.matricula, { maxlength: 30, inputmode: "numeric" });
    const funcao = texto(inicial.funcao, { maxlength: 60, placeholder: "Ex.: Mecânico, Eletricista" });
    const ativo = el("input", { type: "checkbox", checked: inicial.ativo !== false });
    const erro = el("p", { class: "erro-campo", hidden: true });
    const salvar = el("button", { type: "submit", class: "botao primario" }, editar ? "Salvar" : "Cadastrar");

    async function enviar(ev) {
      ev.preventDefault();
      erro.hidden = true;
      if (nome.value.trim().length < 2) { erro.textContent = "Escreva o nome da pessoa."; erro.hidden = false; return; }
      const linha = { nome: nome.value.trim().replace(/\s+/g, " "), matricula: matricula.value.trim() || null, funcao: funcao.value.trim() || null };
      if (editar) linha.ativo = ativo.checked;
      const soltar = ocupar(salvar, "Salvando…");
      try {
        const r = editar
          ? await supa.atualizar("pessoas", `id=eq.${inicial.id}`, linha)
          : await supa.inserir("pessoas", linha);
        D.guardarPessoa(r);
        aviso(editar ? "Cadastro atualizado." : "Pessoa cadastrada.");
        fechar(D.pessoaPorId(r.id));
      } catch (e) {
        soltar();
        erro.textContent = e.message; erro.hidden = false;
      }
    }

    setTimeout(() => nome.focus(), 50);
    return el("form", { class: "formulario", onsubmit: enviar },
      campo("Nome", nome),
      el("div", { class: "dupla" }, campo("Matrícula", matricula, "Opcional"), campo("Função", funcao, "Opcional")),
      editar && D.ehAdmin() ? el("label", { class: "marcar" }, ativo, " Ativo (desmarque para tirar das listas)") : null,
      erro,
      el("div", { class: "acoes" },
        editar && D.ehAdmin() ? botaoApagar("esta pessoa", async () => {
          await supa.apagar("pessoas", `id=eq.${inicial.id}`);
          D.removerPessoa(inicial.id);
        }, fechar) : null,
        el("button", { type: "button", class: "botao", onclick: () => fechar(null) }, "Voltar"), salvar));
  });
}

export function dialogoFrota(inicial = {}) {
  const editar = inicial.id != null;
  return janela(editar ? "Editar frota" : "Cadastrar frota", (fechar) => {
    const numero = texto(inicial.numero, { maxlength: 20, autocapitalize: "characters", placeholder: "Ex.: C-433" });
    const descricao = texto(inicial.descricao, { maxlength: 80, placeholder: "Ex.: Scania R450 · cavalo" });
    const placa = texto(inicial.placa, { maxlength: 10, autocapitalize: "characters", placeholder: "Ex.: ABC1D23" });
    const ativo = el("input", { type: "checkbox", checked: inicial.ativo !== false });
    const erro = el("p", { class: "erro-campo", hidden: true });
    const salvar = el("button", { type: "submit", class: "botao primario" }, editar ? "Salvar" : "Cadastrar");

    async function enviar(ev) {
      ev.preventDefault();
      erro.hidden = true;
      if (!numero.value.trim()) { erro.textContent = "Escreva o número da frota."; erro.hidden = false; return; }
      const linha = { numero: numero.value.trim(), descricao: descricao.value.trim() || null, placa: placa.value.trim() || null };
      if (editar) linha.ativo = ativo.checked;
      const soltar = ocupar(salvar, "Salvando…");
      try {
        const r = editar
          ? await supa.atualizar("frotas", `id=eq.${inicial.id}`, linha)
          : await supa.inserir("frotas", linha);
        D.guardarFrotas([r]);
        aviso(editar ? "Frota atualizada." : "Frota cadastrada.");
        fechar(D.frotaPorId(r.id));
      } catch (e) {
        soltar();
        erro.textContent = e.message; erro.hidden = false;
      }
    }

    setTimeout(() => numero.focus(), 50);
    return el("form", { class: "formulario", onsubmit: enviar },
      campo("Número da frota", numero),
      campo("Descrição", descricao, "Modelo, tipo do equipamento. Opcional"),
      campo("Placa", placa, "Opcional"),
      editar ? el("label", { class: "marcar" }, ativo, " Ativa (desmarque para tirar das listas)") : null,
      erro,
      el("div", { class: "acoes" },
        editar && D.ehAdmin() ? botaoApagar("esta frota", async () => {
          await supa.apagar("frotas", `id=eq.${inicial.id}`);
          D.removerFrota(inicial.id);
        }, fechar) : null,
        el("button", { type: "button", class: "botao", onclick: () => fechar(null) }, "Voltar"), salvar));
  });
}

// ── as movimentações ───────────────────────────────────────────────────────

/** Os filtros da vista `historico`, em formato de endereço do PostgREST. */
export function filtroHistorico({ tipo, desde, termo, materialId, pessoaId, frotaId } = {}) {
  let q = "";
  if (tipo === "saida" || tipo === "entrada" || tipo === "ajuste") q += `&tipo=eq.${tipo}`;
  if (desde) q += `&registrado_em=gte.${encodeURIComponent(desde)}`;
  if (materialId) q += `&material_id=eq.${Number(materialId)}`;
  if (frotaId) q += `&frota_id=eq.${Number(frotaId)}`;
  if (pessoaId) {
    const p = Number(pessoaId);
    q += `&or=(retirante_id.eq.${p},responsavel_id.eq.${p})`;
  } else {
    const t = termoSeguro(termo);
    if (t) {
      const v = encodeURIComponent(`"*${t}*"`);
      const cols = ["material", "referencia", "codigo", "frota", "retirante", "responsavel", "destino", "documento", "entregue_por"];
      q += `&or=(${cols.map((c) => `${c}.ilike.${v}`).join(",")})`;
    }
  }
  return q;
}

/** A diferença de uma vistoria: "+2", "−3" ou "confere". */
export function diferencaDaVistoria(m) {
  const d = Number(m.quantidade);
  if (!d) return "confere";
  return `${d > 0 ? "+" : "−"}${formatarQtd(Math.abs(d))} ${m.unidade}`;
}

export function cartaoMovimento(m, aoAbrir) {
  const saida = m.tipo === "saida";
  const ajuste = m.tipo === "ajuste";
  const onde = [m.frota ? `Frota ${m.frota}` : "", m.destino || ""].filter(Boolean).join(" · ");
  const quem = ajuste
    ? `Contado ${formatarQtd(m.contado)} ${m.unidade} · o sistema tinha ${formatarQtd(m.saldo_antes)}`
    : saida
      ? `${m.retirante || "—"}${onde ? " → " + onde : ""}`
      : `Recebeu: ${m.responsavel}${m.entregue_por ? " · de " + m.entregue_por : ""}`;
  const rodape = ajuste
    ? `${quando(m.registrado_em)} · por ${m.registrado_por_nome || "—"}`
    : saida ? `${quando(m.registrado_em)} · acompanhou ${m.responsavel}` : quando(m.registrado_em);
  return el("button", {
    type: "button", class: `mov ${m.tipo}${m.cancelada_em ? " cancelada" : ""}`, onclick: () => aoAbrir(m),
  },
  ajuste ? miniatura(null, "mini", "vistoria") : miniatura(m.foto),
  el("span", { class: "mov-texto" },
    el("span", { class: "linha1" },
      el("span", { class: `etiqueta ${m.tipo}` }, ajuste ? "Vistoria" : saida ? "Saída" : "Entrada"),
      el("strong", { class: "qtd" }, ajuste ? diferencaDaVistoria(m) : `${formatarQtd(m.quantidade)} ${m.unidade}`),
      m.cancelada_em ? el("span", { class: "etiqueta cancelada" }, "Cancelada") : null),
    el("span", { class: "material" }, m.material, m.referencia ? el("small", { class: "ref" }, ` · ${m.referencia}`) : null),
    el("span", { class: "quem" }, quem),
    el("small", { class: "quando" }, rodape)));
}

/** Põe as miniaturas nas imagens que ainda não têm. Sem miniatura (ou se ela
 *  falhar), usa a foto grande. */
export async function carregarMiniaturas(raiz) {
  const imgs = [...raiz.querySelectorAll("img[data-foto]:not([data-pronta])")];
  if (!imgs.length) return;
  for (const img of imgs) img.dataset.pronta = "1";
  let urls = {};
  try { urls = await supa.enderecosDasFotos(imgs.map((i) => miniaturaDe(i.dataset.foto))); } catch { return; }
  for (const img of imgs) {
    const grande = img.dataset.foto;
    const usarGrande = async () => {
      img.onerror = null;
      try {
        const g = await supa.enderecosDasFotos([grande]);
        if (g[grande]) img.src = g[grande];
      } catch { /* fica sem */ }
    };
    const u = urls[miniaturaDe(grande)];
    if (u) { img.onerror = usarGrande; img.src = u; } else usarGrande();
  }
}

export function abrirMovimento(m, aoMudar) {
  const saida = m.tipo === "saida";
  const ajuste = m.tipo === "ajuste";
  return janela(ajuste ? "Vistoria do estoque" : saida ? "Saída de material" : "Entrada de material", (fechar) => {
    let ligacao = null;
    if (!ajuste) {
      const foto = el("img", { class: "foto-grande", alt: `Foto do material: ${m.material}` });
      ligacao = el("a", { class: "foto-link", target: "_blank", rel: "noopener noreferrer" }, foto);
      supa.enderecosDasFotos([m.foto]).then((u) => {
        if (u[m.foto]) { foto.src = u[m.foto]; ligacao.href = u[m.foto]; } else foto.alt = "Não consegui abrir a foto.";
      }).catch(() => { foto.alt = "Sem conexão para abrir a foto."; });
    }

    const linhas = ajuste ? [
      ["Material", m.material],
      m.referencia ? ["Referência", m.referencia] : null,
      m.codigo ? ["Código Protheus", m.codigo] : null,
      ["Contado na sala", `${formatarQtd(m.contado)} ${m.unidade}`],
      ["O sistema tinha", `${formatarQtd(m.saldo_antes)} ${m.unidade}`],
      ["Diferença", diferencaDaVistoria(m)],
      m.obs ? ["Observação", m.obs] : null,
      ["Conferido", `${dataHora(m.registrado_em)} por ${m.registrado_por_nome || "—"}`],
      m.cancelada_em ? ["Cancelado", `${dataHora(m.cancelada_em)} por ${m.cancelada_por_nome || "—"} — ${m.motivo_cancelamento}`] : null,
    ] : [
      ["Material", m.material],
      m.referencia ? ["Referência", m.referencia] : null,
      m.codigo ? ["Código Protheus", m.codigo] : null,
      ["Quantidade", `${formatarQtd(m.quantidade)} ${m.unidade}`],
      saida ? ["Retirou", `${m.retirante}${m.retirante_matricula ? ` (mat. ${m.retirante_matricula})` : ""}`] : null,
      m.frota ? ["Frota", [m.frota, m.frota_descricao].filter(Boolean).join(" · ")] : null,
      [saida ? "Acompanhou" : "Recebeu", m.responsavel],
      m.entregue_por ? ["Entregue por", m.entregue_por] : null,
      m.documento ? ["Documento", m.documento] : null,
      m.destino ? [m.frota ? "Local" : "Destino", m.destino] : null,
      m.obs ? ["Observação", m.obs] : null,
      ["Registrado", `${dataHora(m.registrado_em)} por ${m.registrado_por_nome || "—"}`],
      m.cancelada_em ? ["Cancelado", `${dataHora(m.cancelada_em)} por ${m.cancelada_por_nome || "—"} — ${m.motivo_cancelamento}`] : null,
    ];

    const depois = async () => {
      fechar(true);
      await D.carregarCadastros().catch(() => {});
      if (aoMudar) aoMudar();
    };

    const cancelar = D.ehAdmin() && !m.cancelada_em
      ? el("button", {
        type: "button", class: "botao perigo",
        onclick: async (ev) => {
          const motivo = await perguntar(
            "O registro não é apagado: ele fica no histórico como cancelado e sai da conta do saldo.",
            { rotulo: "Motivo do cancelamento", minimo: 5, botao: "Cancelar registro", perigo: true });
          if (!motivo) return;
          const soltar = ocupar(ev.target, "Cancelando…");
          try {
            await supa.rpc("cancelar_movimentacao", { p_id: m.id, p_motivo: motivo });
            aviso("Registro cancelado.");
            await depois();
          } catch (e) {
            soltar();
            aviso(e.message, "erro", 7000);
          }
        },
      }, "Cancelar este registro")
      : null;

    const apagar = D.ehAdmin()
      ? el("button", {
        type: "button", class: "botao perigo",
        onclick: async (ev) => {
          const motivo = await perguntar(
            "Apagar este registro de vez? Ele sai do histórico e da conta do saldo, e a foto é apagada. " +
            "Para engano do dia a dia, prefira Cancelar: o registro fica, marcado.",
            { rotulo: "Por que apagar? (ex.: registro de teste)", minimo: 3, botao: "Apagar de vez", perigo: true });
          if (!motivo) return;
          const soltar = ocupar(ev.target, "Apagando…");
          try {
            const foto = await supa.rpc("apagar_movimentacao", { p_id: m.id, p_motivo: motivo });
            if (foto) supa.apagarFotos([foto, miniaturaDe(foto)]).catch(() => {});
            aviso("Registro apagado.");
            await depois();
          } catch (e) {
            soltar();
            aviso(e.message, "erro", 7000);
          }
        },
      }, icone("lixeira", 18), "Apagar de vez")
      : null;

    return [
      m.cancelada_em ? el("p", { class: "faixa-cancelada" }, "Este registro foi cancelado e não conta no saldo.") : null,
      ligacao,
      el("dl", { class: "ficha" }, ...linhas.filter(Boolean).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      cancelar || apagar ? el("div", { class: "acoes" }, cancelar, apagar) : null,
    ];
  }, { larga: true });
}

/** Lista paginada da vista `historico`, mais nova primeiro. */
export function listaMovimentos({ filtros = () => "", tamanho = 30, vazio = "Nenhuma movimentação.", semMais = false, aoMudar } = {}) {
  const itens = el("div", { class: "itens" });
  const nada = el("p", { class: "nada", hidden: true });
  const mais = el("button", { type: "button", class: "botao discreto largo", hidden: true }, "Carregar mais");
  const raiz = el("div", { class: "lista-mov" }, itens, nada, mais);
  let ultimoId = null;
  let geracao = 0;

  const abrir = (m) => abrirMovimento(m, () => { recarregar(); if (aoMudar) aoMudar(); });

  async function pagina(reiniciar) {
    const g = reiniciar ? ++geracao : geracao;
    mais.disabled = true;
    try {
      const desde = reiniciar ? "" : (ultimoId ? `&id=lt.${ultimoId}` : "");
      const linhas = await supa.ler(`historico?select=*&order=id.desc&limit=${tamanho}${filtros()}${desde}`);
      if (g !== geracao) return; // o filtro mudou enquanto esperava
      if (reiniciar) itens.replaceChildren();
      for (const m of linhas) itens.append(cartaoMovimento(m, abrir));
      if (linhas.length) ultimoId = linhas[linhas.length - 1].id;
      else if (reiniciar) ultimoId = null;
      mais.hidden = semMais || linhas.length < tamanho;
      nada.hidden = itens.children.length > 0;
      nada.textContent = vazio;
      carregarMiniaturas(itens);
    } catch (e) {
      if (g !== geracao) return;
      nada.hidden = false;
      nada.textContent = e.message;
    } finally {
      if (g === geracao) mais.disabled = false;
    }
  }

  function recarregar() { return pagina(true); }
  mais.addEventListener("click", () => pagina(false));
  return { raiz, recarregar };
}

/** Cabeçalho de tela com título e, se quiser, um botão à direita. */
export function titulo(texto, ...extra) {
  return el("div", { class: "titulo-tela" }, el("h1", {}, texto), ...extra);
}
