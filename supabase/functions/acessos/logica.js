// A lógica da função `acessos` (criar conta e trocar senha), separada da
// entrada do servidor para poder ser testada fora dele (testes/unidade.mjs):
// recebe o cliente de administrador do Supabase como parâmetro.
//
// Quem chama já foi conferido na entrada (index.ts): sessão válida e papel
// "admin" na tabela `perfis`.

export const PAPEIS_CRIAVEIS = ["consulta", "operador", "admin"];
// O e-mail é só o nome de entrar: vale o que o navegador aceita num campo de
// e-mail e o Supabase aceita ao criar a conta, inclusive o domínio sem ponto
// ("nome.sobrenome@empresa"). A mesma regra do site (js/texto.js).
const EMAIL = /^[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "" se a senha serve; senão, o porquê. A mesma regra do site. */
export function senhaFraca(s) {
  const t = String(s ?? "");
  if (t.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (t.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[A-Za-z]/.test(t) || !/[0-9]/.test(t)) return "Use letras e números na senha.";
  return "";
}

export function emailValido(e) {
  const t = String(e ?? "");
  return t.length <= 254 && EMAIL.test(t);
}

const falha = (status, erro) => ({ status, corpo: { erro } });

export async function tratar(pedido, admin) {
  const acao = pedido && pedido.acao;

  if (acao === "criar") {
    const email = String(pedido.email ?? "").trim().toLowerCase();
    const nome = String(pedido.nome ?? "").trim().replace(/\s+/g, " ");
    const senha = String(pedido.senha ?? "");
    const papel = String(pedido.papel ?? "");
    if (!emailValido(email)) return falha(400, "Esse e-mail não parece válido.");
    if (nome.length < 2 || nome.length > 80) return falha(400, "Escreva o nome da pessoa.");
    if (!PAPEIS_CRIAVEIS.includes(papel)) return falha(400, "Escolha o acesso da pessoa.");
    const fraca = senhaFraca(senha);
    if (fraca) return falha(400, fraca);

    const { data, error } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome },
    });
    if (error) {
      // A senha primeiro: o Supabase também responde 422 para senha fraca.
      const m = String(error.message || "").toLowerCase();
      const c = String(error.code || "");
      if (c === "weak_password" || m.includes("password")) {
        return falha(400, "O Supabase recusou a senha. Use pelo menos 8 caracteres, com letras e números.");
      }
      if (c === "email_exists" || c === "user_already_exists" || m.includes("already") || m.includes("registered")) {
        return falha(409, "Já existe uma conta com esse e-mail. Ela está na lista abaixo: escolha o acesso nela, ou dê uma senha nova.");
      }
      if (c === "validation_failed" || c === "email_address_invalid" || m.includes("email")) {
        return falha(400, "O Supabase recusou esse e-mail. Confira se está escrito certo (sem acento nem espaço).");
      }
      return falha(502, "O Supabase não criou a conta. Tente de novo em instantes.");
    }
    const id = data && data.user && data.user.id;
    if (!id) return falha(502, "O Supabase não devolveu a conta criada.");
    // O perfil nasce "pendente" pelo gatilho do banco; aqui ganha o acesso escolhido.
    const { error: e2 } = await admin.from("perfis").update({ papel, nome }).eq("id", id);
    if (e2) return falha(502, "A conta foi criada, mas o acesso não foi gravado: escolha o acesso dela na lista.");
    return { status: 200, corpo: { id } };
  }

  if (acao === "senha") {
    const id = String(pedido.id ?? "").toLowerCase();
    const senha = String(pedido.senha ?? "");
    if (!UUID.test(id)) return falha(400, "Conta inválida.");
    const fraca = senhaFraca(senha);
    if (fraca) return falha(400, fraca);
    const { data: perfil } = await admin.from("perfis").select("id").eq("id", id).maybeSingle();
    if (!perfil) return falha(404, "Conta não encontrada.");
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return falha(502, "O Supabase não trocou a senha. Tente de novo em instantes.");
    return { status: 200, corpo: { ok: true } };
  }

  return falha(400, "Pedido desconhecido.");
}
