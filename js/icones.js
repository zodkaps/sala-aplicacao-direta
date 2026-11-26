// Os ícones em linha (24×24, traço de 2 na cor do texto), os mesmos do painel
// de programação da Makro. Montados com DOMParser a partir destes desenhos
// fixos — nunca com texto de gente.

const NS = "http://www.w3.org/2000/svg";

const DESENHOS = {
  inicio: '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 9.5v10h11v-10"/><path d="M10 19.5v-5h4v5"/>',
  saida: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 14.5v3a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-3"/>',
  entrada: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 14.5v3a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-3"/>',
  estoque: '<path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8"/>',
  historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>',
  caminhao: '<path d="M2.5 6.5h11v9.5h-11z"/><path d="M13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19.5c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3c1.8.8 3 2.6 3.5 5.2"/>',
  chave: '<circle cx="8" cy="15.5" r="4"/><path d="M11 12.5L20 3.5M16.5 7l2.5 2.5M14 9.5l2 2"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
  atualizar: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>',
  tema: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.5-2h5.4l1.5 2h2.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  galeria: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  adicionar: '<path d="M12 5v14M5 12h14"/>',
  baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  visto: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.1"/>',
  sair: '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/><path d="M10 16.5L5.5 12 10 7.5M5.5 12h10"/>',
  colar: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3.5h6v1M9 10h6M9 13.5h6M9 17h3.5"/>',
};

let parser = null;

/** O ícone como <svg>, na cor do texto em volta. */
export function icone(nome, tam = 20) {
  parser = parser || new DOMParser();
  const doc = parser.parseFromString(`<svg xmlns="${NS}">${DESENHOS[nome] || ""}</svg>`, "image/svg+xml");
  const s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24", width: tam, height: tam, fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "ic",
  })) s.setAttribute(k, String(v));
  for (const n of [...doc.documentElement.childNodes]) s.append(document.importNode(n, true));
  return s;
}

export const ICONES = Object.keys(DESENHOS);
