// O histórico: tudo o que entrou e saiu, com filtro por tipo, período e busca,
// e a exportação para planilha (CSV que o Excel abre).

import { el, adiar, ocupar, baixar, aviso } from "../ui.js";
import * as supa from "../supa.js";
import { inicioDoDia, dataHora, formatarQtd, paraCSV } from "../texto.js";
import { listaMovimentos, filtroHistorico, titulo } from "./comum.js";

const PERIODOS = [["0", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["tudo", "Tudo"]];

export function telaHistorico(raiz, ctx) {
  const f = {
    tipo: ["saida", "entrada", "ajuste"].includes(ctx.query.tipo) ? ctx.query.tipo : "",
    periodo: PERIODOS.some(([v]) => v === ctx.query.periodo) ? ctx.query.periodo : "30",
    termo: "",
  };
  const desde = () => (f.periodo === "tudo" ? "" : inicioDoDia(f.periodo === "0" ? 0 : Number(f.periodo) - 1));
  const filtros = () => filtroHistorico({ tipo: f.tipo, desde: desde(), termo: f.termo });
  const lista = listaMovimentos({ filtros, vazio: "Nenhuma movimentação com esses filtros." });

  const botoesTipo = [["", "Tudo"], ["saida", "Saídas"], ["entrada", "Entradas"], ["ajuste", "Vistorias"]].map(([v, t]) =>
    el("button", {
      type: "button", class: `chip${f.tipo === v ? " ativo" : ""}`, "aria-pressed": String(f.tipo === v),
      onclick: (ev) => {
        f.tipo = v;
        for (const b of botoesTipo) { b.classList.remove("ativo"); b.setAttribute("aria-pressed", "false"); }
        ev.currentTarget.classList.add("ativo");
        ev.currentTarget.setAttribute("aria-pressed", "true");
        lista.recarregar();
      },
    }, t));

  const periodo = el("select", { "aria-label": "Período" },
    ...PERIODOS.map(([v, t]) => el("option", { value: v, selected: v === f.periodo }, t)));
  periodo.addEventListener("change", () => { f.periodo = periodo.value; lista.recarregar(); });

  const busca = el("input", {
    type: "search", class: "busca", placeholder: "Buscar material, referência, frota, pessoa, nota…",
    "aria-label": "Buscar", enterkeyhint: "search", autocomplete: "off",
  });
  busca.addEventListener("input", adiar(() => { f.termo = busca.value; lista.recarregar(); }, 350));

  const csv = el("button", { type: "button", class: "botao discreto" }, "Exportar planilha");
  csv.addEventListener("click", async () => {
    const soltar = ocupar(csv, "Gerando…");
    try {
      // O Supabase entrega no máximo 1000 linhas por pedido: vai de mil em mil.
      const linhas = [];
      let ultimo = null;
      for (let i = 0; i < 100; i++) {
        const pg = await supa.ler(`historico?select=*&order=id.desc&limit=1000${filtros()}${ultimo ? `&id=lt.${ultimo}` : ""}`);
        linhas.push(...pg);
        if (pg.length < 1000) break;
        ultimo = pg[pg.length - 1].id;
      }
      if (!linhas.length) { aviso("Não há movimentações com esses filtros.", "alerta"); return; }
      const conteudo = paraCSV(
        ["Data", "Tipo", "Material", "Referência do fabricante", "Código Protheus", "Quantidade", "Unidade",
          "Retirou", "Matrícula", "Frota", "Frota (descrição)", "Outro local / complemento",
          "Acompanhou / Recebeu", "Entregue por", "Documento", "Observação",
          "Registrado por", "Situação", "Motivo do cancelamento", "Foto (arquivo)",
          "Vistoria: contado", "Vistoria: o sistema tinha"],
        linhas.map((m) => [
          dataHora(m.registrado_em), { saida: "Saída", entrada: "Entrada", ajuste: "Vistoria" }[m.tipo] || m.tipo,
          m.material, m.referencia, m.codigo,
          formatarQtd(m.quantidade), m.unidade, m.retirante, m.retirante_matricula, m.frota, m.frota_descricao,
          m.destino, m.responsavel, m.entregue_por, m.documento, m.obs, m.registrado_por_nome,
          m.cancelada_em ? `Cancelada em ${dataHora(m.cancelada_em)} por ${m.cancelada_por_nome || "—"}` : "Válida",
          m.motivo_cancelamento, m.foto,
          m.tipo === "ajuste" ? formatarQtd(m.contado) : "", m.tipo === "ajuste" ? formatarQtd(m.saldo_antes) : "",
        ]));
      const hoje = new Date().toISOString().slice(0, 10);
      baixar(`movimentacoes-sala-aplicacao-direta-${hoje}.csv`, conteudo);
    } catch (e) {
      aviso(e.message, "erro", 6000);
    } finally {
      soltar();
    }
  });

  raiz.append(
    titulo("Histórico", csv),
    el("div", { class: "filtros" },
      el("div", { class: "chips" }, ...botoesTipo, periodo),
      busca),
    lista.raiz);
  lista.recarregar();
  return {};
}
