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
