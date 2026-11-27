# Segurança da Sala de Aplicação Direta

## Como o site se protege

**Quem decide é o banco, não a tela.** O site é estático (GitHub Pages) e fala
com o Supabase. A chave que fica no site é a *publicável* — feita para ser
pública. O que protege os dados são as regras do banco (`sql/01_esquema.sql`):

- toda tabela tem RLS (segurança por linha) e privilégio por coluna;
- sem conta, nada se lê; conta nova (ou suspensa) não vê nada;
- quem só consulta não grava; quem registra não edita, não apaga e não faz
  vistoria; só o administrador apaga, e o que é apagado fica copiado em
  `apagados`;
- quem registrou e quando é o banco que grava (não dá para assinar como outra
  pessoa nem mudar a data); a foto tem de ter sido enviada por quem registra;
- ninguém além do administrador vê a lista de contas e os e-mails;
- as fotos ficam num bucket privado e só abrem por endereço assinado, que
  vence em duas horas;
- criar conta e trocar senha de outra pessoa passa pela função `acessos`
  (`supabase/functions/acessos`), que confere que quem pede é administrador.
  A chave de administrador do Supabase só existe lá, no servidor.

`sql/90_testar_regras.sql` confere tudo isso no banco fingindo ser cada tipo de
acesso, e desfaz o que criou.

**No navegador:**

- só HTTPS (o GitHub Pages força);
- política de conteúdo (CSP) fechada: só scripts do próprio site, só conexão
  com o projeto do Supabase, nada de script embutido;
- *Trusted Types* ligado: o navegador recusa transformar texto em código, então
  um nome de material ou de pessoa nunca vira script;
- o site não abre dentro de outro site (moldura) e não manda o endereço da
  página para fora (*referrer*);
- senha nova com pelo menos 8 caracteres, letras e números;
- ao sair, o aparelho esquece o e-mail, as cópias dos cadastros e os endereços
  das fotos.

**No repositório** (que é público): nada de chave secreta, e-mail, foto ou dado
da equipe. O teste `testes/unidade.mjs` confere a chave, a CSP, o Trusted Types
e e-mails de verdade.

## O que ligar fora do código

No **Supabase** (painel do projeto):

1. *Authentication → Sign In / Providers → Email*: desligue **Allow new users
   to sign up**. Quem cria as contas é o administrador, no site.
2. No mesmo lugar, suba o **tamanho mínimo da senha** para 8 e exija letras e
   números.

No **GitHub** (repositório e conta):

1. Conta: ligue a **verificação em duas etapas** (*Settings → Password and
   authentication*).
2. Repositório → *Settings → Advanced Security* (ou *Code security*): ligue
   **Dependabot alerts**, **Secret scanning** com **Push protection** e
   **Private vulnerability reporting**.
3. *Settings → Branches*: proteja a `main` contra *force push* e contra
   exclusão.
4. *Settings → Pages*: deixe **Enforce HTTPS** marcado.

## Como avisar de um problema

Encontrou uma falha de segurança? Não abra uma *issue* pública: use
**Security → Report a vulnerability** neste repositório.
