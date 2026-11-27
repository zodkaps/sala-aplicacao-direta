// QR Code feito aqui mesmo, sem biblioteca de fora: modo byte (UTF-8), nível de
// correção M (aguenta ~15% da etiqueta suja ou riscada), versões 1 a 10 — o
// endereço de um material cabe na versão 4 ou 5.
//
// Segue a norma ISO/IEC 18004 no mesmo desenho do gerador de referência de
// Project Nayuki: monta os padrões fixos, distribui os dados em zigue-zague,
// escolhe a máscara de menor penalidade e grava o formato. Função pura (não toca
// na tela): o testes/unidade.mjs confere com os exemplos da norma e lê de volta
// cada QR gerado.

// Nível M: blocos e códigos de correção por versão (índice = versão).
export const ECC_POR_BLOCO = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
export const BLOCOS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMATO_M = 0;  // bits do nível M no código de formato (L=1, M=0, Q=3, H=2)

const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** Multiplicação no corpo GF(2^8) da norma (polinômio 0x11D). */
export function gfMult(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisorRS(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMult(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = gfMult(raiz, 0x02);
  }
  return r;
}

/** Os códigos de correção (Reed-Solomon) de um bloco de dados. */
export function correcaoRS(dados, grau) {
  const div = divisorRS(grau);
  const r = new Array(grau).fill(0);
  for (const b of dados) {
    const fator = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= gfMult(c, fator); });
  }
  return r;
}

/** Os 15 bits de formato (nível + máscara, com BCH e a máscara fixa da norma). */
export function bitsDeFormato(nivelBits, mascara) {
  const dado = (nivelBits << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}

/** Os 18 bits de versão (só da versão 7 em diante). */
export function bitsDeVersao(versao) {
  let resto = versao;
  for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
  return (versao << 12) | resto;
}

export const tamanhoDaVersao = (v) => v * 4 + 17;

function modulosDeDados(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}

export function posicoesDeAlinhamento(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2;
  const passo = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = tamanhoDaVersao(v) - 7; r.length < n; pos -= passo) r.splice(1, 0, pos);
  return r;
}

export const capacidadeDeDados = (v) => Math.floor(modulosDeDados(v) / 8) - ECC_POR_BLOCO[v] * BLOCOS[v];

export function utf8(texto) {
  return [...new TextEncoder().encode(String(texto))];
}

/** As 8 máscaras da norma (x = coluna, y = linha). */
export function mascaraInverte(m, x, y) {
  switch (m) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error("máscara inválida");
  }
}

/** A grade de módulos fixos (padrões, formato, versão) de uma versão — o que
 *  não é dado. Usada para gerar e, nos testes, para ler de volta. */
export function moduloFixo(v) {
  const n = tamanhoDaVersao(v);
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
  const marcar = (x, y) => { fixo[y][x] = true; };
  for (let i = 0; i < n; i++) { marcar(6, i); marcar(i, 6); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < n && y >= 0 && y < n) marcar(x, y);
    }
  }
  const al = posicoesDeAlinhamento(v);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marcar(al[i] + dx, al[j] + dy);
  }
  for (let i = 0; i <= 8; i++) { marcar(8, i); marcar(i, 8); }
  for (let i = 0; i < 8; i++) marcar(n - 1 - i, 8);
  for (let i = 0; i < 7; i++) marcar(8, n - 1 - i);
  marcar(8, n - 8);
  if (v >= 7) for (let i = 0; i < 18; i++) { marcar(n - 11 + (i % 3), Math.floor(i / 3)); marcar(Math.floor(i / 3), n - 11 + (i % 3)); }
  return fixo;
}

/** A ordem em que os bits de dados entram na grade: colunas em pares, da direita
 *  para a esquerda, subindo e descendo em zigue-zague, pulando a coluna 6. */
export function ordemDosDados(v) {
  const n = tamanhoDaVersao(v);
  const fixo = moduloFixo(v);
  const ordem = [];
  for (let dir = n - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j;
        const subindo = ((dir + 1) & 2) === 0;
        const y = subindo ? n - 1 - k : k;
        if (!fixo[y][x]) ordem.push([x, y]);
      }
    }
  }
  return ordem;
}

function desenharFormato(mod, n, mascara) {
  const b = bitsDeFormato(FORMATO_M, mascara);
  const pos = (x, y, cor) => { mod[y][x] = cor; };
  for (let i = 0; i <= 5; i++) pos(8, i, bit(b, i));
  pos(8, 7, bit(b, 6));
  pos(8, 8, bit(b, 7));
  pos(7, 8, bit(b, 8));
  for (let i = 9; i < 15; i++) pos(14 - i, 8, bit(b, i));
  for (let i = 0; i < 8; i++) pos(n - 1 - i, 8, bit(b, i));
  for (let i = 8; i < 15; i++) pos(8, n - 15 + i, bit(b, i));
  pos(8, n - 8, true);  // o módulo escuro fixo
}

function penalidade(mod) {
  const n = mod.length;
  let p = 0;
  // N1: cinco ou mais iguais seguidos, em linha e em coluna
  for (let eixo = 0; eixo < 2; eixo++) {
    for (let a = 0; a < n; a++) {
      let cor = null, run = 0;
      for (let b = 0; b < n; b++) {
        const c = eixo === 0 ? mod[a][b] : mod[b][a];
        if (c === cor) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else { cor = c; run = 1; }
      }
    }
  }
  // N2: blocos 2×2 da mesma cor
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = mod[y][x];
    if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
  }
  // N3: o desenho parecido com o do canto (1:1:3:1:1 com 4 claros de um lado)
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  for (let eixo = 0; eixo < 2; eixo++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 11 <= n; b++) {
        let iguaisA = true, iguaisB = true;
        for (let k = 0; k < 11; k++) {
          const c = eixo === 0 ? mod[a][b + k] : mod[b + k][a];
          if (c !== A[k]) iguaisA = false;
          if (c !== B[k]) iguaisB = false;
        }
        if (iguaisA) p += 40;
        if (iguaisB) p += 40;
      }
    }
  }
  // N4: equilíbrio entre claro e escuro
  let escuros = 0;
  for (const linha of mod) for (const c of linha) if (c) escuros++;
  const total = n * n;
  p += Math.floor(Math.abs(escuros * 20 - total * 10) / total) * 10;
  return p;
}

/** Gera o QR Code do texto. Devolve a grade de módulos (true = escuro) e os
 *  detalhes; `mascara` fixa a máscara (só para os testes). */
export function gerarQR(texto, { mascara = null } = {}) {
  const bytes = utf8(texto);
  let v = 1;
  const bitsNecessarios = (ver) => 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
  while (v <= 10 && bitsNecessarios(v) > capacidadeDeDados(v) * 8) v++;
  if (v > 10) throw new Error("Texto longo demais para o QR Code.");
  const n = tamanhoDaVersao(v);
  const capacidade = capacidadeDeDados(v);

  // os bits: modo byte, tamanho, dados, terminador e enchimento
  const bits = [];
  const por = (valor, qtd) => { for (let i = qtd - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  por(0b0100, 4);
  por(bytes.length, v <= 9 ? 8 : 16);
  for (const b of bytes) por(b, 8);
  por(0, Math.min(4, capacidade * 8 - bits.length));
  por(0, (8 - (bits.length % 8)) % 8);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; dados.length < capacidade; pad ^= 0xec ^ 0x11) dados.push(pad);

  // blocos, correção e entrelaçamento
  const nBlocos = BLOCOS[v], ecc = ECC_POR_BLOCO[v];
  const brutos = Math.floor(modulosDeDados(v) / 8);
  const curtos = nBlocos - (brutos % nBlocos);
  const tamCurto = Math.floor(brutos / nBlocos);
  const blocos = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const tam = tamCurto - ecc + (i < curtos ? 0 : 1);
    const d = dados.slice(k, k + tam);
    k += tam;
    const e = correcaoRS(d, ecc);
    if (i < curtos) d.push(0);
    blocos.push(d.concat(e));
  }
  const final = [];
  for (let i = 0; i < blocos[0].length; i++) {
    for (let j = 0; j < blocos.length; j++) {
      if (i !== tamCurto - ecc || j >= curtos) final.push(blocos[j][i]);
    }
  }

  // a grade: padrões fixos
  const mod = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) { mod[6][i] = i % 2 === 0; mod[i][6] = i % 2 === 0; }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < n && y >= 0 && y < n) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        mod[y][x] = d !== 2 && d !== 4;
      }
    }
  }
  const al = posicoesDeAlinhamento(v);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      mod[al[j] + dy][al[i] + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
    }
  }
  if (v >= 7) {
    const vb = bitsDeVersao(v);
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3), b = Math.floor(i / 3);
      mod[b][a] = bit(vb, i);
      mod[a][b] = bit(vb, i);
    }
  }

  // os dados em zigue-zague (os módulos que sobram ficam claros)
  const ordem = ordemDosDados(v);
  ordem.forEach(([x, y], i) => {
    mod[y][x] = i < final.length * 8 ? bit(final[i >>> 3], 7 - (i & 7)) : false;
  });

  // a máscara de menor penalidade (ou a pedida)
  const aplicar = (m) => {
    const g = mod.map((l) => l.slice());
    for (const [x, y] of ordem) if (mascaraInverte(m, x, y)) g[y][x] = !g[y][x];
    desenharFormato(g, n, m);
    return g;
  };
  let melhor = null, melhorM = 0, melhorP = Infinity;
  for (const m of mascara == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mascara]) {
    const g = aplicar(m);
    const p = penalidade(g);
    if (p < melhorP) { melhor = g; melhorM = m; melhorP = p; }
  }
  return { modulos: melhor, versao: v, tamanho: n, mascara: melhorM };
}

/** O desenho do QR como um caminho SVG (um quadradinho por módulo escuro),
 *  com a margem clara de 4 módulos que a norma pede em volta. */
export function caminhoSVG(modulos, margem = 4) {
  const partes = [];
  modulos.forEach((linha, y) => linha.forEach((escuro, x) => {
    if (escuro) partes.push(`M${x + margem} ${y + margem}h1v1h-1z`);
  }));
  return partes.join("");
}
