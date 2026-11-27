// Um leitor de QR Code só para os testes: lê a grade de módulos que o
// js/qr.js gera e devolve o texto, conferindo no caminho os padrões fixos, as
// duas cópias do formato e a correção (Reed-Solomon) de cada bloco.
// Usado pelo testes/unidade.mjs e pelo testes/navegador.mjs (que lê de volta o
// QR da etiqueta impressa).

import assert from "node:assert/strict";
import * as QR from "../js/qr.js";

/** Lê um QR (grade de módulos) e devolve o texto, conferindo no caminho o
 *  formato (as duas cópias), a correção de cada bloco e os padrões fixos. */
export function lerQR(mod) {
  const n = mod.length, v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, `tamanho ${n}`);
  const b = (x, y) => (mod[y][x] ? 1 : 0);
  // os três quadrados dos cantos (7×7) com a borda clara
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      assert.equal(b(x, y), d !== 2 && d !== 4 ? 1 : 0, `canto (${cx},${cy}) em (${x},${y})`);
    }
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(b(i, 6), i % 2 === 0 ? 1 : 0); assert.equal(b(6, i), i % 2 === 0 ? 1 : 0); }
  assert.equal(b(8, n - 8), 1, "o módulo escuro fixo");
  // formato: primeira cópia (perto do canto de cima à esquerda) e segunda
  const p1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const p2 = [...Array(8)].map((_, i) => [n - 1 - i, 8]).concat([...Array(7)].map((_, k) => [8, n - 7 + k]));
  const f1 = p1.reduce((a, [x, y], i) => a | (b(x, y) << i), 0);
  const f2 = p2.reduce((a, [x, y], i) => a | (b(x, y) << i), 0);
  assert.equal(f1, f2, "as duas cópias do formato");
  let mascara = -1;
  for (let m = 0; m < 8; m++) if (QR.bitsDeFormato(0, m) === f1) mascara = m;
  assert.ok(mascara >= 0, "formato do nível M não encontrado");
  // os bits de dados, sem a máscara
  const bits = QR.ordemDosDados(v).map(([x, y]) => (mod[y][x] !== QR.mascaraInverte(mascara, x, y) ? 1 : 0));
  const cod = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cod.push(bits.slice(i, i + 8).reduce((a, x) => (a << 1) | x, 0));
  // desentrelaça os blocos e confere a correção de cada um
  const nb = QR.BLOCOS[v], ecc = QR.ECC_POR_BLOCO[v], total = cod.length;
  const curtos = nb - (total % nb), tamCurto = Math.floor(total / nb);
  const blocos = [...Array(nb)].map((_, i) => ({ dados: [], ecc: [], tam: tamCurto - ecc + (i < curtos ? 0 : 1) }));
  let k = 0;
  for (let i = 0; i < tamCurto - ecc + 1; i++) for (const bl of blocos) if (i < bl.tam) bl.dados.push(cod[k++]);
  for (let i = 0; i < ecc; i++) for (const bl of blocos) bl.ecc.push(cod[k++]);
  for (const bl of blocos) assert.deepEqual(QR.correcaoRS(bl.dados, ecc), bl.ecc, "correção de um bloco");
  const dados = blocos.flatMap((bl) => bl.dados);
  // modo byte, tamanho e os bytes
  const fluxo = dados.flatMap((x) => [...Array(8)].map((_, i) => (x >>> (7 - i)) & 1));
  const ler = (q) => { const r = fluxo.splice(0, q).reduce((a, x) => (a << 1) | x, 0); return r; };
  assert.equal(ler(4), 0b0100, "modo byte");
  const qtd = ler(v <= 9 ? 8 : 16);
  return new TextDecoder().decode(Uint8Array.from([...Array(qtd)].map(() => ler(8))));
}

/** Lê o QR de um caminho SVG ("M4 4h1v1h-1z…") com a margem de 4 módulos. */
export function lerQRdoSVG(d, lado) {
  const n = lado - 8;
  const mod = Array.from({ length: n }, () => new Array(n).fill(false));
  for (const [, x, y] of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) mod[Number(y) - 4][Number(x) - 4] = true;
  return lerQR(mod);
}
