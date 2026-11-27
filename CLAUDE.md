# Sala de Aplicação Direta — o que o Claude precisa saber antes de mexer

Controle de entrada e saída de material da sala de aplicação direta da
manutenção. Site estático (GitHub Pages, a partir da `main`) em cima do
Supabase (projeto "Sala de Aplicação Direta", `ogaaapaondalugvezdtd`). O
`README.md` explica as telas, as regras e a configuração.

## Regras que valem sempre

- **Não inventar dado.** Material, quantidade, quem retirou, quem acompanhou: o
  que a pessoa não disse fica vazio. Na dúvida, perguntar.
- **Movimentação não se edita.** Engano do dia a dia: cancelar
  (`cancelar_movimentacao`, com motivo) e registrar de novo. Registro de teste:
  o administrador apaga pelo site (`apagar_movimentacao`, com motivo; a cópia
  fica em `apagados`). O Claude não apaga pelo SQL sem a pessoa pedir, e
  confere antes o que vai sair.
- **Gravar no banco pede confirmação.** Mudança de esquema vai para
  `sql/01_esquema.sql` (que tem de poder rodar de novo) e é seguida do
  `sql/90_testar_regras.sql` no projeto.
- Nunca pedir token, chave ou senha no chat. E-mail de verdade e dado da equipe
  não entram no repositório (é público): teste usa dado inventado.
- Foto de verdade da sala não vai para o repositório nem para o chat.

## Frotas e material

- A lista de frotas é cadastro do administrador (menu → Frotas, uma a uma ou
  colando do Excel). Número de frota não entra no repositório: teste usa
  número inventado. A lista oficial é a "Frotas do PCM" do painel de
  programação; a fita de eventos de lá tem os números escritos de vários jeitos
  e não serve de fonte sem a pessoa conferir.
- Toda saída diz onde vai ser aplicada: `frota_id` ou `destino` (a tela exige um
  dos dois). Entrada não tem frota (`entrada_sem_frota`).
- O material tem `referencia` (do fabricante) e `codigo` (Protheus).

## Vistoria, acessos e etiquetas

- **Vistoria** é o tipo `ajuste` em `movimentacoes`, só do administrador: o site
  manda o `contado`; o gatilho lê o saldo (com trava por material), grava
  `saldo_antes` e a diferença em `quantidade` (pode ser negativa ou zero). Sem
  foto, pessoa nem frota. O saldo soma entrada e ajuste e tira saída.
- **Contas** se criam pelo site (Acessos), pela função `acessos` do Supabase
  (`supabase/functions/acessos`): `index.ts` confere a sessão e o papel admin e
  usa a chave de administrador que só existe lá; `logica.js` é testada no
  `testes/unidade.mjs` e roda no Supabase de mentira. Mudou a função? Publicar
  de novo (deploy) com *verify_jwt* desligado. Senha: 8+, letras e números.
- **QR Code** é do próprio site (`js/qr.js`, sem biblioteca de fora), testado
  com os exemplos da norma e lido de volta por `testes/ler_qr.mjs`.

## Visual

Padrão Makro, o mesmo do painel de programação (`gestaomkt`): azul-marinho
#13164E na estrutura, vermelho só para alerta — com uma exceção pedida pelo
PCM (26/11/2026): **entrada é verde e saída é vermelha** nos cards da lista,
nos botões grandes e na tela de registrar (`--entrada` e `--saida` no CSS); Metropolis nos títulos e
Nunito no texto, cinza como base e a situação num ponto colorido. Claro por
padrão, escuro no ◐. Cor nova vai como variável no `:root` do `css/app.css`.

## Segurança

- Texto de gente entra na tela por `el()` (nós de texto), nunca como HTML.
  O site roda com **Trusted Types** (CSP `require-trusted-types-for 'script'`):
  nada de innerHTML, DOMParser nem script por texto; endereço de script novo
  (como o `sw.js`) passa pela política `sad` do `js/app.js`.
- O site não abre em moldura (iframe) e não manda *referrer*. Ao sair, o
  aparelho esquece tudo de quem usou (fica só a escolha de claro/escuro).
- Só o administrador vê a lista de contas e e-mails (`listar_acessos`); o nome
  de quem registrou chega ao histórico por `privado.nome_do_perfil`.
- Nada de script dentro do HTML, nem biblioteca ou servidor fora da CSP do
  `index.html`. A única chave no código é a publicável (`sb_publishable_…`).
- Quem decide o que cada um pode é o banco (RLS, privilégio por coluna, gatilho
  `antes_de_registrar`, bucket privado sem update/delete), não a tela.

## Testes

```bash
node testes/unidade.mjs
node testes/navegador.mjs [pasta-para-fotos-das-telas]
```

Mudou arquivo em `js/`, `css/` ou `img/`? Acrescentar em `sw.js` (lista e
`VERSAO`) — o `testes/unidade.mjs` acusa o que faltar. Tela nova passa pelo
`semRolagemLateral` do teste do navegador (largura do celular e "null" vazando).
