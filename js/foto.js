// A foto do material: a câmera do celular tira 3 a 8 MB; aqui ela vira um JPEG
// de no máximo 1024 px (uns 100 a 150 KB) e uma miniatura de 320 px (uns 15 KB)
// para as listas. Assim o envio vai rápido no 4G da oficina, a lista abre leve
// e o 1 GB de arquivos do plano gratuito do Supabase guarda milhares de fotos.

import { dimensoes } from "./texto.js";

const GRANDE = 1024, PEQUENA = 320;

async function decodificar(arquivo) {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" respeita a rotação que o celular grava na foto.
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    } catch { /* cai para o <img> */ }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function desenhar(fonte, max, qualidade) {
  const lw = fonte.naturalWidth || fonte.width, lh = fonte.naturalHeight || fonte.height;
  const { w, h } = dimensoes(lw, lh, max);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fonte, 0, 0, w, h);
  return new Promise((ok, erro) => c.toBlob(
    (b) => (b ? ok(b) : erro(new Error("Não consegui preparar a foto."))), "image/jpeg", qualidade));
}

/** Devolve { grande, pequena, previa } — as duas em JPEG e o endereço local
 *  para mostrar na tela (solte com URL.revokeObjectURL quando não precisar). */
export async function prepararFoto(arquivo) {
  if (!arquivo) throw new Error("Nenhuma foto escolhida.");
  if (arquivo.type && !arquivo.type.startsWith("image/")) throw new Error("Esse arquivo não é uma foto.");
  let fonte;
  try {
    fonte = await decodificar(arquivo);
  } catch {
    throw new Error("Não consegui abrir essa foto. Tire de novo pela câmera.");
  }
  try {
    const grande = await desenhar(fonte, GRANDE, 0.7);
    const pequena = await desenhar(fonte, PEQUENA, 0.6);
    return { grande, pequena, previa: URL.createObjectURL(grande) };
  } finally {
    if (fonte && typeof fonte.close === "function") fonte.close();
  }
}

/** Um identificador novo para o nome do arquivo. */
export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
