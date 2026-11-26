// Abrir rápido e abrir sem sinal.
//
// Os arquivos do site ficam guardados no aparelho. Com rede, busca a versão
// nova primeiro (com tempo limite curto, para o sinal fraco não travar a
// abertura); sem rede, usa a guardada. Os dados e as fotos nunca passam por
// aqui: são de outro endereço (o Supabase) e o navegador fala direto com ele.
//
// Mudou um arquivo? Mantenha a lista abaixo em dia e suba a VERSAO — o
// testes/unidade.mjs acusa arquivo de js/ ou css/ que falte na lista.

const VERSAO = "sad-v4";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icone.svg",
  "./img/icone-180.png",
  "./img/icone-192.png",
  "./img/icone-512.png",
  "./img/makro.svg",
  "./img/makro-branco.svg",
  "./fontes/metropolis-400.woff2",
  "./fontes/metropolis-600.woff2",
  "./fontes/metropolis-700.woff2",
  "./fontes/nunito-latin.woff2",
  "./css/app.css",
  "./js/app.js",
  "./js/config.js",
  "./js/supa.js",
  "./js/dados.js",
  "./js/ui.js",
  "./js/texto.js",
  "./js/foto.js",
  "./js/icones.js",
  "./js/telas/comum.js",
  "./js/telas/entrar.js",
  "./js/telas/inicio.js",
  "./js/telas/registrar.js",
  "./js/telas/historico.js",
  "./js/telas/estoque.js",
  "./js/telas/pessoas.js",
  "./js/telas/frotas.js",
  "./js/telas/acessos.js",
  "./js/telas/conta.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function comTempo(promessa, ms) {
  return new Promise((ok, erro) => {
    const t = setTimeout(() => erro(new Error("tempo")), ms);
    promessa.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); erro(e); });
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const rede = fetch(req).then((r) => {
      if (r && r.ok && r.type === "basic") cache.put(req, r.clone());
      return r;
    });
    try {
      return await comTempo(rede, 3500);
    } catch {
      const guardada = await cache.match(req, { ignoreSearch: true }) ||
        (req.mode === "navigate" ? await cache.match("./index.html") : null);
      if (guardada) return guardada;
      return rede; // nem rede nem cópia: deixa o erro da rede aparecer
    }
  })());
});
