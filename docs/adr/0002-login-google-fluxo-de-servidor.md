# ADR 0002 — Login com Google pelo fluxo de servidor, com Contas vinculadas

- **Status**: aceito
- **Data**: 2026-11-22

## Contexto

O admin quer entrar no painel também com a conta Google (#71), sem perder o login por e-mail e senha. No futuro
haverá usuários além do admin. Para botões de login em sites, o Google recomenda o Google Identity Services (GIS).
Pesquisa com as fontes: [`docs/research/oauth-google.md`](../research/oauth-google.md).

## Decisão

- **OpenID Connect com Authorization Code no servidor**: `state`, `nonce` e PKCE, pela biblioteca `openid-client`,
  pedindo só `openid email`. O Google só prova quem é a pessoa; a sessão continua a nossa (access e refresh JWT,
  `tokenVersion`). Nenhum token do Google é guardado.
- Rejeitados:
  - **GIS redirect**: o Google faz POST de formulário direto na API, e o OAC do CloudFront recusa POST sem
    `x-amz-content-sha256` ([ADR 0001](0001-api-em-lambda.md)).
  - **GIS popup**: põe script de terceiro no admin, abre a CSP e depende do FedCM, em troca de dispensar o
    `client_secret`.
- A conta Google é uma **Conta vinculada**: tabela própria com chave `(provider, sub)`, separada do `Admin`.
  O vínculo só é feito de dentro do painel, com a senha atual, e nunca por e-mail igual: o e-mail pode mudar e até
  ser reatribuído a outra pessoa.

## Consequências

- Um `client_secret` a mais no SSM; nada muda na CSP nem na distribuição.
- Um provedor novo é só mais um valor de `provider`.
- Quando houver usuários, ser admin continua sendo um atributo explícito: ter uma Conta vinculada nunca dá acesso
  ao painel por si só.
- O e-mail da conta Google serve só para exibir; nunca decide quem entra.
