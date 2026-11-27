// A vistoria do estoque (só o administrador): conferir na sala o que tem de
// cada material. O saldo passa a ser o que foi contado, e a diferença fica no
// histórico como "Vistoria" — não é entrada nem saída. Contar igual ao sistema
// ("Confere") também fica registrado: é o check-in do material naquele dia.

import { el, adiar, ocupar, aviso, janela, campo } from "../ui.js";
import * as supa from "../supa.js";
import * as D from "../dados.js";
import { filtrar, formatarQtd, lerQuantidade, quando, inicioDoDia } from "../texto.js";
import { dialogoMaterial, miniatura, carregarMiniaturas, titulo } from "./comum.js";
import { icone } from "../icones.js";

/** Grava a contagem de um material; o banco lê o saldo e guarda a diferença. */
export async function gravarContagem(material, contado, obs = "") {
  const r = await supa.inserir("movimentacoes?select=id,quantidade,saldo_antes,contado", {
    tipo: "ajuste", material_id: material.id, quantidade: 0, contado, obs: obs || null,
  });
  const m = D.materialPorId(material.id);
  if (m) {
    m.saldo = Number(r.contado);
    m.ultima_vistoria = new Date().toISOString();
    m.ultima = m.ultima_vistoria;
  }
  return r;
}

export function textoDaDiferenca(r, unidade) {
  const d = Number(r.quantidade);
  if (!d) return "confere com o sistema";
  return `${d > 0 ? "+" : "−"}${formatarQtd(Math.abs(d))} ${unidade} (o sistema tinha ${formatarQtd(r.saldo_antes)})`;
}

/** Conferir um material só (da página do material). */
export function dialogoConferir(material) {
  return janela(`Conferir: ${material.descricao}`, (fechar) => {
    const contado = el("input", {
      type: "text", inputmode: "decimal", autocomplete: "off", class: "qtd-campo", "aria-label": "Quantidade contada",
    });
    const obs = el("input", { type: "text", maxlength: 300, autocomplete: "off", placeholder: "Opcional" });
    const erro = el("p", { class: "erro-campo", hidden: true });
    const gravar = el("button", { type: "button", class: "botao primario" }, "Gravar contagem");
    async function enviar(valor) {
      erro.hidden = true;
      const q = valor ?? lerQuantidade(contado.value);
      if (!Number.isFinite(q) || q < 0) { erro.textContent = "Escreva a quantidade contada na sala."; erro.hidden = false; return; }
      const soltar = ocupar(gravar, "Gravando…");
      try {
        const r = await gravarContagem(material, q, obs.value.trim());
        aviso(`Vistoria gravada: ${textoDaDiferenca(r, material.unidade)}.`);
        fechar(r);
      } catch (e) {
        soltar();
        erro.textContent = e.message; erro.hidden = false;
      }
    }
    gravar.addEventListener("click", () => enviar());
    setTimeout(() => contado.focus(), 50);
    return [
      el("p", { class: "pergunta" },
        `O sistema tem ${formatarQtd(material.saldo)} ${material.unidade}. Conte o que tem na sala: o saldo passa a ser o contado, e a diferença fica registrada como vistoria.`),
      el("div", { class: "contador" }, contado, el("span", { class: "unidade" }, material.unidade)),
      campo("Observação", obs),
      erro,
      el("div", { class: "acoes" },
        material.saldo >= 0
          ? el("button", { type: "button", class: "botao", onclick: () => enviar(material.saldo) }, `Confere (${formatarQtd(material.saldo)})`)
          : null,
        gravar),
    ];
  });
}

export function telaVistoria(raiz) {
  if (!D.ehAdmin()) {
    raiz.append(el("p", { class: "nada" }, "A vistoria do estoque é feita pelo administrador."));
    return {};
  }
  const hoje = inicioDoDia(0);
  const f = { termo: "", faltam: true };
  const corpo = el("div", { class: "lista-vistoria" });
  const resumo = el("p", { class: "resumo-lista" });
  const conferidoHoje = (m) => !!m.ultima_vistoria && m.ultima_vistoria >= hoje;

  function desenhar() {
    const ativos = D.estado.materiais.filter((m) => m.ativo);
    resumo.textContent = `${ativos.filter(conferidoHoje).length} de ${ativos.length} conferidos hoje`;
    let lista = f.faltam ? ativos.filter((m) => !conferidoHoje(m)) : ativos;
    if (f.termo.trim()) lista = filtrar(lista, f.termo, (m) => [m.descricao, m.referencia, m.codigo, m.local], 2000);
    corpo.replaceChildren(...(lista.length ? lista.map(linha)
      : [el("p", { class: "nada" }, !ativos.length ? "Nenhum material cadastrado ainda."
        : f.faltam ? "Tudo conferido hoje." : "Nenhum material com esse nome.")]));
    carregarMiniaturas(corpo);
  }

  function linha(m) {
    const contado = el("input", {
      type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Contado", class: "conta-campo",
      "aria-label": `Quantidade contada: ${m.descricao}`, enterkeyhint: "done",
    });
    const saldo = el("strong", {}, formatarQtd(m.saldo));
    const status = el("small", { class: "status-vistoria" },
      m.ultima_vistoria ? `Última vistoria: ${quando(m.ultima_vistoria)}` : "Ainda não conferido");
    const gravar = el("button", { type: "button", class: "botao primario" }, "Gravar");
    const confere = el("button", { type: "button", class: "botao", disabled: m.saldo < 0, title: "A contagem é igual ao sistema" }, "Confere");
    const cartao = el("div", { class: `linha-vistoria${conferidoHoje(m) ? " conferido" : ""}` },
      miniatura(m.foto, "mini-lista"),
      el("div", { class: "lv-texto" },
        el("strong", {}, m.descricao),
        el("small", {}, [m.referencia ? `ref. ${m.referencia}` : "", m.codigo ? `Protheus ${m.codigo}` : "", m.local || ""].filter(Boolean).join(" · ") || " "),
        status),
      el("div", { class: "lv-sistema" }, el("small", {}, "Sistema"), saldo, el("small", {}, m.unidade)),
      el("div", { class: "lv-acoes" }, contado, gravar, confere));

    async function enviar(q, botao) {
      if (!Number.isFinite(q) || q < 0) { aviso("Escreva a quantidade contada.", "alerta"); contado.focus(); return; }
      const soltar = ocupar(botao, "…");
      try {
        const r = await gravarContagem(m, q);
        saldo.textContent = formatarQtd(m.saldo);
        status.textContent = `Conferido agora: ${textoDaDiferenca(r, m.unidade)}`;
        cartao.classList.add("conferido");
        contado.value = "";
      } catch (e) {
        aviso(e.message, "erro", 6000);
      } finally { soltar(); }
    }
    gravar.addEventListener("click", () => enviar(lerQuantidade(contado.value), gravar));
    contado.addEventListener("keydown", (ev) => { if (ev.key === "Enter") enviar(lerQuantidade(contado.value), gravar); });
    confere.addEventListener("click", () => enviar(m.saldo, confere));
    return cartao;
  }

  const chips = [[true, "Falta conferir hoje"], [false, "Todos"]].map(([v, t]) =>
    el("button", {
      type: "button", class: `chip${f.faltam === v ? " ativo" : ""}`,
      onclick: (ev) => {
        f.faltam = v;
        for (const c of chips) c.classList.remove("ativo");
        ev.currentTarget.classList.add("ativo");
        desenhar();
      },
    }, t));
  const busca = el("input", { type: "search", class: "busca", placeholder: "Buscar material, referência ou código", "aria-label": "Buscar material", autocomplete: "off" });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; desenhar(); }, 150));
  const novo = el("button", {
    type: "button", class: "botao primario",
    onclick: async () => { if (await dialogoMaterial({})) desenhar(); },
  }, icone("adicionar", 18), "Material");

  raiz.append(
    titulo("Vistoria do estoque", novo),
    el("p", { class: "explica" },
      "Conte o que tem na sala. \"Confere\" quando bate com o sistema; se não bater, escreva o contado e toque em Gravar: " +
      "o saldo passa a ser o contado e a diferença fica no histórico como vistoria (não é entrada nem saída). " +
      "Achou material que não está no cadastro? Toque em + Material e depois conte."),
    el("div", { class: "filtros" }, el("div", { class: "chips" }, ...chips), busca),
    resumo, corpo);
  desenhar();
  D.carregarCadastros().then(desenhar).catch(() => {});
  return {};
}
