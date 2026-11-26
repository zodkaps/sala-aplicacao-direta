// O endereço do projeto Supabase e a chave do navegador.
//
// Os dois são PÚBLICOS por desenho: a chave publishable foi feita para ficar no
// navegador de quem usa. Quem protege os dados são as regras do banco
// (sql/01_esquema.sql — RLS em toda tabela, fotos num bucket privado), e o
// sql/90_testar_regras.sql confere essas regras fingindo ser cada papel.
// Nunca coloque aqui a chave secreta (service_role / sb_secret_…).

export const SUPABASE = {
  url: "https://ogaaapaondalugvezdtd.supabase.co",
  chave: "sb_publishable_uL9G1HO7HisoLpn8bUAClA_NFUAi6Rn",
};

export const BUCKET = "fotos";
export const VERSAO = "1.0.0";
