# Sala de Aplicação Direta

Controle de **entrada e saída de material** da sala de aplicação direta da
manutenção. Cada movimentação tem **foto do material**, **quem retirou** (ou
recebeu) e **quem acompanhou**, e o saldo de cada material sai da conta das
entradas menos as saídas.

Feito para o **celular e o tablet**: uma tela por tarefa, botões grandes, foto
direto da câmera, e leve (sem biblioteca). Funciona como aplicativo: no celular,
abra o endereço e use *Adicionar à tela inicial*.

O visual segue o **padrão Makro**, o mesmo do painel de programação do PCM: o
azul-marinho institucional na estrutura (barra lateral, botão principal, o que
está escolhido), as fontes Metropolis e Nunito, o logo e os ícones em linha. Para
bater o olho: **entrada é verde e saída é vermelha** — nos cards da lista, nos
botões grandes do início e na tela de registrar. Claro por padrão; o escuro fica no botão ◐.

## O que dá para fazer

| Tela | Para quê |
|---|---|
| **Início** | Os botões grandes de **Saída** e **Entrada**, as saídas e entradas de hoje, os materiais abaixo do mínimo e as últimas movimentações (atualiza sozinha a cada 30 s). |
| **Saída** | Foto → material → quantidade → quem está retirando → **onde vai ser aplicada** (a frota da lista, ou outro local) → quem acompanhou. |
| **Entrada** | Foto → material → quantidade → quem recebeu → quem entregou e a nota (opcional). |
| **Estoque** | O saldo de cada material, com filtro de *abaixo do mínimo* e *divergência* (saiu mais do que entrou). Cada material tem a sua página com o histórico. |
| **Histórico** | Tudo o que entrou e saiu, com a foto, filtro por tipo, período e busca (material, pessoa, frota, nota). **Exportar planilha** gera um CSV que o Excel abre. |
| **Frotas** (menu) | A lista que aparece na saída. O administrador cadastra uma a uma ou **cola a lista do Excel** (número, modelo, placa) de uma vez. Cada frota tem a página com as peças aplicadas nela. |
| **Pessoas** (menu) | Quem retira, recebe ou acompanha. Não precisa ter conta no site. Cada pessoa tem a página do que retirou e acompanhou. |
| **Acessos** (menu, administrador) | Libera quem criou conta e escolhe o que cada um pode fazer. |

Cada material tem a **referência do fabricante** (o número da peça no catálogo)
e o **código Protheus**; a busca acha pelos dois, mesmo digitados sem espaço,
ponto ou barra ("0986452041" acha "0 986 452 041"). Material ou pessoa que ainda
não existe se cadastra na hora, sem sair da saída ou da entrada.

## Regras

- **A foto é obrigatória.** Ela começa a subir assim que é tirada, já reduzida
  (1024 px, uns 100 a 150 KB, mais uma miniatura de 320 px para as listas).
  O banco confere que a foto chegou e que foi enviada por quem está registrando.
- **Ninguém edita nem apaga uma movimentação.** O administrador **cancela**, com
  motivo: o registro fica no histórico, marcado, e sai da conta do saldo.
- Quem registrou e quando é o banco que grava (a conta logada e a hora do
  servidor) — não dá para assinar como outra pessoa nem mudar a data.
- Toda saída diz **onde vai ser aplicada**: a frota da lista ou outro local
  escrito (oficina, compressor…). Frota desativada não aparece nem é aceita.
- Saída maior que o saldo avisa e pede confirmação; se confirmada, o saldo fica
  negativo e aparece como **divergência** no estoque.
- Sem sinal na hora de registrar, nada se perde: o formulário fica preenchido e
  é só tocar em Registrar de novo.

## Quem pode o quê

| Acesso | Pode |
|---|---|
| Aguardando liberação | nada (conta recém-criada) |
| Só consulta | ver estoque, histórico e fotos |
| Registra entradas e saídas | o de cima, e registrar e cadastrar pessoa e material |
| Administrador | tudo, e cadastrar frotas, editar/desativar cadastros, cancelar registros e liberar acessos |

Quem decide é o banco (Supabase, com RLS em todas as tabelas e as fotos num
bucket privado), não a tela: a chave que fica no site é pública por desenho.

## Primeira configuração

1. **Publicar o site** — no GitHub: *Settings → Pages → Build and deployment →
   Deploy from a branch → `main` / `(root)`*. O endereço fica
   `https://<usuário>.github.io/<repositório>/`.
2. **Supabase → Authentication → Sign In / Providers → Email**: deixe o
   provedor Email **ligado** e **desligue "Confirm email"**. O envio de e-mail
   embutido do Supabase não entrega para todo mundo (e tem limite por hora);
   quem libera as contas é o administrador, pelo site.
3. **Crie a sua conta** no site (*Primeira vez? Criar conta*) e torne-se
   administrador — no *SQL Editor* do Supabase, com o seu e-mail:
   ```sql
   update public.perfis set papel = 'admin' where email = 'o.seu@email';
   update auth.users set email_confirmed_at = now()
    where email = 'o.seu@email' and email_confirmed_at is null;
   ```
4. Peça para a equipe criar as contas e libere em **Menu → Acessos**.

## O banco

- `sql/01_esquema.sql` — tabelas, vistas, regras de acesso, funções do
  administrador e o bucket de fotos. Roda inteiro num projeto novo e pode rodar
  de novo.
- `sql/90_testar_regras.sql` — testa as regras fingindo ser cada acesso (69
  verificações) e **desfaz tudo** no fim: termina sempre com um erro de
  propósito, cuja mensagem diz "TUDO CERTO" ou o que falhou.

Tabelas: `perfis` (as contas), `pessoas`, `materiais`, `frotas`, `movimentacoes`. Vistas:
`estoque` (saldo por material) e `historico` (movimentação com os nomes).

**Plano gratuito do Supabase**: 1 GB de arquivos dá para uns 7 a 10 mil
movimentações com foto; o projeto **pausa depois de 7 dias sem uso** (volta pelo
painel do Supabase). Com uso diário, não pausa.

## Testes

```bash
node testes/unidade.mjs      # funções, lista do sw.js e regras de segurança do código
node testes/navegador.mjs    # o site de ponta a ponta no Chromium, celular e tablet
```

O teste do navegador usa um Supabase de mentira (`testes/supabase_falso.mjs`),
com dados inventados; precisa do Playwright (`npm i -D playwright`). As regras do
banco de verdade se testam com `sql/90_testar_regras.sql`.

## Arquivos

```
index.html            a casca (CSP fechada: só scripts daqui e o Supabase)
css/app.css           o visual no padrão Makro (claro; escuro no botão ◐)
fontes/               Metropolis e Nunito (licenças livres, junto)
img/                  o logo da Makro e os ícones do aplicativo
js/config.js          o endereço do Supabase e a chave pública
js/supa.js            Auth, API e Storage por fetch, sem biblioteca
js/dados.js           o que fica em memória (pessoas, materiais com saldo)
js/foto.js            reduz a foto antes de enviar
js/texto.js           funções puras (busca, números, datas, CSV)
js/ui.js              peças de tela
js/icones.js          os ícones em linha (os mesmos do painel do PCM)
js/telas/*.js         uma por tela
sw.js                 abre rápido e abre sem internet
```

Mudou um arquivo de `js/`, `css/`, `img/` ou `fontes/`? Acrescente no `sw.js` (lista e
`VERSAO`) — o `testes/unidade.mjs` acusa o que faltar.
