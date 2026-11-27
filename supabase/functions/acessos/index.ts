// Função do Supabase `acessos`: o administrador cria contas e dá senha
// provisória, pelo site (menu → Acessos). A chave de administrador do Supabase
// só existe aqui, no servidor — nunca no site nem no repositório.
//
// A função confere sozinha quem chama (por isso sobe com verify_jwt = false):
// a sessão tem de ser válida no Auth do projeto e a pessoa tem de ter o papel
// "admin" na tabela `perfis`. A lógica fica em logica.js (testada no Node).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tratar } from "./logica.js";

const ORIGENS = ["https://zodkaps.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function cabecalhos(origem: string | null): Record<string, string> {
  const permitida = origem && (ORIGENS.includes(origem) || LOCAL.test(origem)) ? origem : ORIGENS[0];
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function responder(corpo: unknown, status: number, origem: string | null): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhos(origem), "Content-Type": "application/json; charset=utf-8" },
  });
}

function chaveDeAdministrador(): string {
  const legada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legada) return legada;
  try {
    const novas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return String(novas.default ?? Object.values(novas)[0] ?? "");
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  const origem = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos(origem) });
  if (req.method !== "POST") return responder({ erro: "Pedido não aceito." }, 405, origem);

  const chave = chaveDeAdministrador();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!chave || !url) return responder({ erro: "A função está sem configuração no Supabase." }, 500, origem);
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder({ erro: "Entre de novo no site." }, 401, origem);
  const { data: quem, error: semSessao } = await admin.auth.getUser(token);
  if (semSessao || !quem?.user) return responder({ erro: "Sua sessão venceu. Entre de novo." }, 401, origem);

  const { data: perfil } = await admin.from("perfis").select("papel").eq("id", quem.user.id).maybeSingle();
  if (perfil?.papel !== "admin") {
    return responder({ erro: "Só o administrador cria acessos e troca senhas." }, 403, origem);
  }

  let pedido: unknown;
  try {
    pedido = await req.json();
  } catch {
    return responder({ erro: "Pedido inválido." }, 400, origem);
  }
  const r = await tratar(pedido, admin);
  return responder(r.corpo, r.status, origem);
});
