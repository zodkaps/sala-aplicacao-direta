# Sala de Aplicação Direta — o que o Claude precisa saber antes de mexer

Controle de entrada e saída de material da sala de aplicação direta da
manutenção. Site estático (GitHub Pages, a partir da `main`) em cima do
Supabase (projeto "Sala de Aplicação Direta", `ogaaapaondalugvezdtd`). O
`README.md` explica as telas, as regras e a configuração.

## Regras que valem sempre

- **Não inventar dado.** Material, quantidade, quem retirou, quem acompanhou: o
  que a pessoa não disse fica vazio. Na dúvida, perguntar.
- **Movimentação não se edita nem se apaga** — nem pelo SQL. Corrige-se
  cancelando (`cancelar_movimentacao`, com motivo) e registrando de novo.
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

## Visual

Padrão Makro, o mesmo do painel de programação (`gestaomkt`): azul-marinho
#13164E na estrutura, vermelho só para alerta — com uma exceção pedida pelo
Mateus (26/11/2026): **entrada é verde e saída é vermelha** nos cards da lista,
nos botões grandes e na tela de registrar (`--entrada` e `--saida` no CSS); Metropolis nos títulos e
Nunito no texto, cinza como base e a situação num ponto colorido. Claro por
padrão, escuro no ◐. Cor nova vai como variável no `:root` do `css/app.css`.

## Segurança

- Texto de gente entra na tela por `el()` (nós de texto), nunca como HTML.
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
