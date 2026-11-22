# Login com Google (OAuth 2.0 / OpenID Connect) no painel admin

> Pesquisa de 2026-11-22, feita só com fontes primárias: docs do Google Identity, Ajuda do Google Cloud Console (a documentação oficial do próprio console, em `support.google.com/cloud`), RFCs, OpenID Connect Core 1.0, o draft RFC 6265bis, MDN e o README/código das bibliotecas. As fontes estão na data de hoje; docs do Google mudam com frequência.
>
> **Como ler este documento**
> - Frase com link: fato afirmado pela fonte linkada.
> - **[Recomendação]**: opinião minha, não está na fonte.
> - **[Inferência]**: conclusão minha a partir de duas ou mais fontes.
> - **[Não confirmado]**: nenhuma das fontes confirma; não completei com o que eu acho.

## Resumo

1. OAuth 2.0 é um framework de **autorização**; o **OpenID Connect** é a camada de **autenticação** por cima dele, e o produto dela é o **ID token** (um JWT com `iss`, `sub`, `aud`, `exp`, `nonce`...).
2. O Google oferece dois caminhos para web com backend: o **fluxo de servidor** (Authorization Code, cliente confidencial) e o **Google Identity Services** (botão, One Tap, ID token entregue a uma função JS ou num POST para o `login_uri`). Para pôr um botão num site, a recomendação do Google é o GIS.
3. **[Recomendação]** Neste projeto, use o **Authorization Code no servidor**, com `state` + `nonce` + PKCE `S256`, `scope=openid email` e sem `access_type=offline`. Ele não carrega script de terceiro, não mexe na CSP, só usa GETs (o OAC do CloudFront exige `x-amz-content-sha256` em POST) e reaproveita `issueTokens`/`tokenVersion`.
4. A chave do usuário é `sub` (com `iss`), **nunca** o `email`. `email_verified` e `hd` só servem para decidir se dá para confiar no e-mail.
5. O cookie que guarda `state`/`nonce`/`code_verifier` entre o início e o callback tem de ser `SameSite=Lax`: um cookie `Strict` não vai junto na navegação que volta do Google. O refresh cookie atual continua `Strict`.
6. O logout continua só nosso (`tokenVersion++`): o Google não publica `end_session_endpoint`. Como não chamamos APIs do Google, não precisamos de refresh token do Google.
7. **[Recomendação]** Use a biblioteca `openid-client` (3 pacotes, ~1 MB, certificada pela OpenID Foundation, valida state, nonce, PKCE, `iss`, `aud` e `exp`). A `google-auth-library` instala 23 pacotes (~12 MB) e o `verifyIdToken` dela não confere `nonce`. A `passport-google-oauth20` não recebe versão desde 2019 e precisa de `express-session`.
8. No console do Google, **External + Testing** basta para `openid email profile`: esses escopos ficam fora do limite de test users e da expiração de 7 dias. Quem pode entrar no admin é decidido no nosso código (allowlist de `sub`). Se o Google cobra por isso: **[Não confirmado]**.

## Conceitos

**Papéis.** A [RFC 6749 §1.1](https://www.rfc-editor.org/rfc/rfc6749#section-1.1) define quatro papéis. Neste projeto ficam assim:

| Papel OAuth | Aqui |
|---|---|
| *resource owner* (dono do recurso) | o admin, dono da conta Google |
| *client* (cliente) | a nossa API NestJS. É **confidencial**: guarda o `client_secret` no servidor ([RFC 6749 §2.1](https://www.rfc-editor.org/rfc/rfc6749#section-2.1)) |
| *authorization server* / *OpenID Provider* | o Google (`accounts.google.com`) |
| *resource server* | as APIs do Google. **Não usamos nenhuma.** |

**Autorização x autenticação.** O OAuth 2.0 serve para um app "obter acesso limitado a um serviço HTTP" ([RFC 6749, Abstract](https://www.rfc-editor.org/rfc/rfc6749)). Ele "não define métodos padrão para fornecer informação de identidade" ([OIDC Core §1](https://openid.net/specs/openid-connect-core-1_0.html#Introduction)). O OpenID Connect é "uma camada simples de identidade por cima do OAuth 2.0", ativada pelo escopo `openid`, que devolve o resultado da autenticação num JWT chamado **ID token** ([OIDC Core §1](https://openid.net/specs/openid-connect-core-1_0.html#Introduction)).

**Os tokens que aparecem no fluxo:**

| Token | Quem emite | Para quê | Usamos? |
|---|---|---|---|
| *authorization code* | Google, na URL do callback | trocado uma vez por tokens. Expira rápido: a RFC recomenda no máximo 10 min ([RFC 6749 §4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2)) | sim, de passagem |
| ID token | Google, na resposta do token endpoint | prova de quem é o usuário | **sim, só ele importa** |
| access token do Google | Google | chamar APIs do Google | não; descartar |
| refresh token do Google | Google, só com `access_type=offline` | renovar o access token do Google | não pedir |
| access JWT / refresh JWT **nossos** | a nossa API | sessão do painel (`X-Authorization` + cookie) | sim, como hoje |

Depois que a API valida o ID token, o Google sai de cena. A sessão do painel continua sendo a nossa, igual à do login por senha.

**Fluxo escolhido** (Authorization Code no servidor, com `state`, `nonce` e PKCE). As fontes de cada passo estão nas seções 2 a 6.

```
Navegador (SPA /admin)            API (Lambda, via CloudFront /api/*)      Google
       |                                    |                                  |
 1. clica "Entrar com Google"               |                                  |
    (navegação GET /api/auth/google)        |                                  |
       |----------------------------------->|                                  |
       |                         2. gera state, nonce e code_verifier          |
       |                            (aleatórios, um conjunto por tentativa)    |
 3. 302 Location: accounts.google.com/o/oauth2/v2/auth?...                    |
    Set-Cookie: google_oauth=<state,nonce,verifier>;                          |
                HttpOnly; Secure; SameSite=Lax; Max-Age=600                   |
       |<-----------------------------------|                                  |
 4. GET /o/oauth2/v2/auth?response_type=code&client_id=...&redirect_uri=...   |
        &scope=openid%20email&state=...&nonce=...                             |
        &code_challenge=...&code_challenge_method=S256                        |
       |---------------------------------------------------------------------->|
 5. usuário escolhe a conta e consente (só na primeira vez)                   |
 6. 302 Location: https://<dominio>/api/auth/google/callback?code=...&state=...
       |<----------------------------------------------------------------------|
 7. GET /api/auth/google/callback?code&state   (o cookie Lax vai junto)       |
       |----------------------------------->|                                  |
       |                         8. state da URL == state do cookie?           |
       |                         9. POST oauth2.googleapis.com/token           |
       |                            code, client_id, client_secret,            |
       |                            redirect_uri, code_verifier                |
       |                                    |--------------------------------->|
       |                        10. { id_token, access_token, expires_in }     |
       |                                    |<---------------------------------|
       |                        11. valida id_token: iss, aud, exp, nonce;     |
       |                            Admin onde googleSub == sub; senão 401     |
       |                        12. issueTokens(admin)  (código atual)         |
13. 302 Location: /admin                    |                                  |
    Set-Cookie: refresh_token=...; SameSite=Strict; Path=/api/auth/refresh     |
    Set-Cookie: google_oauth=; Max-Age=0   (uso único)                         |
       |<-----------------------------------|                                  |
14. SPA abre /admin e chama POST /api/auth/refresh (mesma origem)              |
    -> recebe o access JWT, que passa a ir no X-Authorization                  |
```

---

## 1. OAuth 2.0 x OpenID Connect; o ID token e os claims do Google

- O ID token é "um token de segurança com claims sobre a autenticação de um usuário final", representado como JWT ([OIDC Core §2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken)). Ele deve ser assinado com JWS ([OIDC Core §2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken)). O Google assina só com `RS256` ([discovery do Google, `id_token_signing_alg_values_supported`](https://accounts.google.com/.well-known/openid-configuration)).
- Claims do padrão, todos REQUIRED: `iss`, `sub`, `aud`, `exp` e `iat`. `nonce` é devolvido sem alteração quando foi enviado. `azp` é opcional ([OIDC Core §2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken)).

Claims que o Google emite, segundo a [tabela do Google](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo):

| Claim | Sempre? | O que o Google diz |
|---|---|---|
| `iss` | sempre | `https://accounts.google.com` **ou** `accounts.google.com` |
| `aud` | sempre | tem de ser um dos client IDs do seu app |
| `sub` | sempre | "único entre todas as Contas Google e nunca reutilizado"; não muda quando o e-mail muda; "use `sub` como chave". Até 255 caracteres ASCII, diferenciando maiúsculas de minúsculas |
| `exp`, `iat` | sempre | expiração e emissão, em segundos Unix |
| `email` | com o escopo `email` | "pode não ser único para esta conta e pode mudar com o tempo" |
| `email_verified` | com o escopo `email` | `true` se o e-mail foi verificado |
| `hd` | só para contas de organização Google Workspace/Cloud | domínio da organização; ausente = conta sem domínio hospedado |
| `nonce` | quando enviado | "proteja contra replay apresentando este valor só uma vez" |
| `name`, `picture`, `given_name`, `family_name`, `locale` | às vezes, com `profile` | "nunca garantido" |
| `azp`, `at_hash`, `amr`, `auth_time` | condicionais | `at_hash` sempre vem no fluxo de servidor quando há access token; `amr`/`auth_time` só se pedidos via `claims` e habilitados |

Com o escopo `email`, o ID token traz `email` e `email_verified` ([Google, parâmetro `scope`](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)).

## 2. Fluxos do Google para app web com backend

### 2.1 Fluxo de servidor (Authorization Code)

- O Google documenta dois fluxos de autenticação: o **server flow**, que "permite ao backend verificar a identidade", e o **implicit flow**, para JS no navegador. O implícito é "significativamente mais complicado por causa dos riscos de lidar com tokens no cliente" ([Google OIDC, Authenticating the user](https://developers.google.com/identity/openid-connect/openid-connect#authenticatingtheuser)). A RFC 9700 diz que clientes **SHOULD NOT** usar o implicit grant ([RFC 9700 §2.1.2](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.2)).
- Os passos do server flow no Google são: criar o token `state`, enviar o pedido de autenticação, conferir o `state`, trocar o `code` por access token + ID token, ler o ID token e autenticar o usuário ([Google OIDC, Server flow](https://developers.google.com/identity/openid-connect/openid-connect#server-flow)).
- A troca do code é um POST no token endpoint com `code`, `client_id`, `client_secret`, `redirect_uri` e `grant_type=authorization_code` ([Google OIDC, passo 4](https://developers.google.com/identity/openid-connect/openid-connect#exchangecode)).
- O Google diz que esse fluxo de web server é "para aplicações que conseguem guardar informação confidencial e manter estado" ([Google, Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)).
- O Google recomenda que o callback trate a requisição e "redirecione para outra URL que não inclua os parâmetros da resposta". Senão, scripts da página e o `Referer` podem expor o `code` ([Google, Handle the OAuth 2.0 server response](https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse)).
- Endpoints, a partir do [discovery](https://accounts.google.com/.well-known/openid-configuration): authorization `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, JWKS `https://www.googleapis.com/oauth2/v3/certs`, revogação `https://oauth2.googleapis.com/revoke`. O Google pede que o app fixe a URI do discovery no código e leia os endpoints dela, respeitando o cache HTTP ([Google OIDC, Discovery document](https://developers.google.com/identity/openid-connect/openid-connect#discovery)).

### 2.2 Google Identity Services ("Sign in with Google")

- O GIS oferece botão personalizado, One Tap e login automático ([GIS Overview](https://developers.google.com/identity/gsi/web/guides/overview)). Ele "é baseado em OAuth 2.0" e "inclui proteção contra CSRF por padrão" ([GIS Overview, Compare to OAuth and OpenID Connect](https://developers.google.com/identity/gsi/web/guides/overview#compare_to_oauth_and_openid_connect)).
- A API de autenticação do GIS **só devolve ID tokens**; a de autorização só devolve code ou access token ([GIS Overview, Separated moments](https://developers.google.com/identity/gsi/web/guides/overview#separated_authentication_and_authorization_moments)).
- O ID token chega ao app de duas formas ([GIS Integrate](https://developers.google.com/identity/gsi/web/guides/integrate)):
  - **Callback JS**: a página recebe o JWT. O Google diz que o objetivo "não é decodificá-lo no JavaScript, e sim enviá-lo ao seu servidor", por exemplo via XHR.
  - **POST no `login_uri`**: o Google envia `credential` (o ID token) e `g_csrf_token` em `application/x-www-form-urlencoded`. O servidor confere se o `g_csrf_token` do cookie é igual ao do corpo, no padrão *double-submit cookie* ([HTML API reference, Server-side integration](https://developers.google.com/identity/gsi/web/reference/html-reference#server-side); [Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)).
- O botão tem dois modos: **popup** (o padrão) e **redirect**. O redirect "é geralmente mais intrusivo, mas é considerado o método de login mais seguro", e nele o Google faz POST do JWT direto no `login_uri` ([Display button, Redirect mode](https://developers.google.com/identity/gsi/web/guides/display-button#redirect_mode)). O redirect do GIS "sempre usa POST", enquanto o redirect do OAuth "normalmente usa GET" ([GIS Integrate, Pop-up versus redirect](https://developers.google.com/identity/gsi/web/guides/integrate#pop-up_versus_redirect)).
- "Usar seu próprio botão não é suportado" no GIS ([GIS Integrate, Button customization](https://developers.google.com/identity/gsi/web/guides/integrate#button_customization)).
- Requisitos de página: carregar `https://accounts.google.com/gsi/client` (o Google não suporta hospedar uma cópia própria) e, se houver CSP, liberar `script-src https://accounts.google.com/gsi/client`, `frame-src`, `connect-src https://accounts.google.com/gsi/` e `style-src https://accounts.google.com/gsi/style` ([GIS Setup, Load the client library e Content Security Policy](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy)).
- O GIS usa a API FedCM do navegador. Para apps novos, "você deve sempre habilitar FedCM" ([GIS Overview, FedCM](https://developers.google.com/identity/gsi/web/guides/overview#federated_credential_manager_fedcm)).
- `initialize()` aceita um `nonce`, "usado pelo ID token para evitar replay" ([JS API reference, nonce](https://developers.google.com/identity/gsi/web/reference/js-reference#nonce)).

### 2.3 O que o Google recomenda

- Para pôr um botão "Sign in with Google" num site, use o GIS ([Google OIDC, nota no topo](https://developers.google.com/identity/openid-connect/openid-connect)). Na web, use a biblioteca JS oficial e implemente botão + One Tap ([Best practices, Web implementation](https://developers.google.com/identity/siwg/best-practices#web-js-library)).
- Entre popup e redirect, "não existe um padrão único que funcione melhor para todos os sites" ([Best practices, Placement strategy](https://developers.google.com/identity/siwg/best-practices#web-js-library)).
- O server flow continua documentado e suportado, e o serviço OIDC do Google é OpenID Certified ([Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect)). O Google "incentiva fortemente" usar uma biblioteca pronta em vez de implementar na mão ([Google OIDC, Accessing the service](https://developers.google.com/identity/openid-connect/openid-connect#accessingtheservice)).
- Se o botão não vier do SDK, ele precisa seguir as diretrizes de marca, inclusive para passar na verificação do app ([Branding guidelines](https://developers.google.com/identity/branding-guidelines)).

### 2.4 Prós e contras para este projeto

| | Authorization Code (servidor) | GIS popup + callback JS | GIS redirect (`login_uri`) |
|---|---|---|---|
| Script de terceiro no `/admin` | não | sim (`gsi/client`) | sim |
| Mudança na CSP do build | não | sim (4 diretivas) | sim |
| Chegada na API | GET com `code` (sem corpo) | POST JSON nosso, pelo `fetch` com hash | POST de formulário **vindo do Google** |
| `client_secret` | sim (fica no SSM) | não | não |
| Botão | qualquer um que siga a marca | só o do SDK | só o do SDK |
| Compatível com o OAC | **sim** | sim | **[Inferência] não**: o [`infra.md`](../specs/infra.md) diz que requisições com corpo (POST/PUT/PATCH) precisam de `x-amz-content-sha256`, e o POST de formulário vindo do Google não leva esse header |

**[Recomendação]** Authorization Code no servidor. Ele vai contra a preferência do Google pelo GIS na web, mas é um fluxo documentado e certificado. Aqui ele evita afrouxar a CSP e evita depender de script de terceiro na página do admin. O GIS redirect fica fora por causa do OAC. O GIS popup funcionaria, mas troca o `client_secret` por CSP mais aberta e FedCM.

### 2.5 O Google aceita PKCE com cliente confidencial?

- A página de *Web Server Applications* **não menciona** PKCE. Ele aparece na página de apps instalados: "o Google suporta o protocolo PKCE para tornar o fluxo de app instalado mais seguro" ([Native apps, Step 1](https://developers.google.com/identity/protocols/oauth2/native-app#step1-code-verifier)).
- O [discovery do Google](https://accounts.google.com/.well-known/openid-configuration) anuncia `"code_challenge_methods_supported": ["plain", "S256"]`. A RFC 9700 diz que publicar esse campo é a forma RECOMMENDED de o servidor indicar suporte a PKCE ([RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)).
- O exemplo oficial da `google-auth-library` usa PKCE com credenciais de cliente **web** (`new OAuth2Client(keys.web)`) ([oauth2-codeVerifier.js](https://github.com/googleapis/google-cloud-node/blob/main/core/packages/google-auth-library-nodejs/samples/oauth2-codeVerifier.js)). O `getToken` envia `code_verifier` junto do `client_secret` ([oauth2client.ts](https://github.com/googleapis/google-cloud-node/blob/main/core/packages/google-auth-library-nodejs/src/auth/oauth2client.ts)).
- **[Não confirmado]** Nenhuma página do Google diz com todas as letras que PKCE com cliente web confidencial é suportado. Os sinais acima apontam que sim. **[Recomendação]** Confirmar em dev na primeira implementação. Se o Google recusar, o `nonce` cobre a injeção de code para cliente OIDC confidencial ([RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)).

## 3. Proteções: `state`, `nonce`, PKCE e redirect URI

O que a **RFC 9700** (OAuth 2.0 Security BCP) exige:

- **Redirect URI**: o servidor de autorização "MUST" comparar com a URI registrada "por string exata", exceto a porta de localhost em apps nativos ([§2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1)).
- **Open redirect**: cliente e servidor "MUST NOT" expor URLs que redirecionam para um destino vindo de query string ([§2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1), [§4.11.1](https://www.rfc-editor.org/rfc/rfc9700#section-4.11.1)). Isso pesa se o callback aceitar um "voltar para".
- **CSRF**: "Clients MUST prevent CSRF". Quem confirmou que o servidor suporta PKCE pode confiar no PKCE; em OIDC, o `nonce` também protege. Fora isso, é obrigatório um `state` de uso único preso ao navegador ([§2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1), [§4.7.1](https://www.rfc-editor.org/rfc/rfc9700#section-4.7.1)). O PKCE protege inclusive contra um atacante que lê a resposta de autorização; o `state` e o `nonce` não ([§4.7.1](https://www.rfc-editor.org/rfc/rfc9700#section-4.7.1)).
- **Injeção de authorization code**: o cliente "MUST" se proteger. Cliente público usa PKCE obrigatoriamente; para cliente confidencial, PKCE é RECOMMENDED. Um cliente OIDC confidencial "MAY" usar o `nonce` no lugar, com cuidados extras. "Em qualquer caso", o challenge e o nonce "MUST" ser específicos da transação e presos ao navegador que a iniciou ([§2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)).
  - Cuidados do `nonce`: validá-lo no ID token **vindo do token endpoint** e não usar token nenhum antes disso ([§4.5.3.2](https://www.rfc-editor.org/rfc/rfc9700#section-4.5.3.2)).
- **Método do PKCE**: use um que não exponha o verifier no pedido; "atualmente, S256 é o único" ([§2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)). A [RFC 7636 §4.2](https://www.rfc-editor.org/rfc/rfc7636#section-4.2) diz que quem consegue usar `S256` "MUST" usá-lo. O verifier tem de 43 a 128 caracteres aleatórios de alta entropia ([RFC 7636 §4.1](https://www.rfc-editor.org/rfc/rfc7636#section-4.1)).
- **Vazamento pelo Referer**: a página que trata a resposta não deve carregar recursos de terceiros, e um `Referrer-Policy` ajuda. O `state` "SHOULD" ser invalidado depois do primeiro uso ([§4.2.4](https://www.rfc-editor.org/rfc/rfc9700#section-4.2.4)).
- **Mix-up**: com **mais de um** servidor de autorização, uma defesa é REQUIRED, de preferência o parâmetro `iss` da RFC 9207. Com um só, não é exigida ([§2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1), [§4.4.2](https://www.rfc-editor.org/rfc/rfc9700#section-4.4.2)).

O que diz a base:

- A [RFC 6749 §10.12](https://www.rfc-editor.org/rfc/rfc6749#section-10.12) diz que o cliente "MUST" ter proteção CSRF no redirect URI e "SHOULD" usar `state`. O valor tem de ser impossível de adivinhar e ficar num lugar que só o cliente e o navegador acessam.
- O [OIDC Core §3.1.2.1](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest) marca `state` como RECOMMENDED, "tipicamente preso criptograficamente a um cookie", e `nonce` como OPTIONAL, mas com entropia suficiente quando usado.
- Para clientes web, o [OIDC Core §15.5.2](https://openid.net/specs/openid-connect-core-1_0.html#NonceNotes) sugere guardar um valor aleatório num cookie HttpOnly e mandar o hash dele como `nonce`.

O que o Google diz:

- `state`: "opcional, mas fortemente recomendado" ([OIDC](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)). Na página de web server, "o cliente OAuth deve prevenir CSRF", e uma das formas é o `state` ([Web server, parâmetros](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1)). Sugestão de valor: uma string de ~30 caracteres de um gerador aleatório de qualidade ([OIDC, passo 1](https://developers.google.com/identity/openid-connect/openid-connect#createxsrftoken)).
- `nonce`: aparece como **(Required)** na tabela de parâmetros do Google ([OIDC](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)).
- `redirect_uri`: precisa bater exatamente com uma das URIs autorizadas, "incluindo esquema, maiúsculas e a barra final" ([OIDC](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters); [Web server](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1)).

**[Recomendação]** Use os três juntos (`state` + `nonce` + PKCE `S256`), cada um com um valor novo por tentativa, guardados num cookie de vida curta (seção 6). Custa pouco: com `openid-client`, são três opções de uma chamada (seção 10).

## 4. Validação do ID token

**Checklist do Google** ([Google OIDC, Validating an ID token](https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken); [Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)):

1. A assinatura é do Google, com as chaves do `jwks_uri`. Elas "são rotacionadas regularmente"; o `Cache-Control` da resposta diz quando buscá-las de novo.
2. `iss` é `https://accounts.google.com` ou `accounts.google.com`.
3. `aud` é o seu client ID. Isso impede que um ID token emitido para outro app seja aceito no seu backend.
4. `exp` ainda não passou.
5. Se você mandou `hd`, o claim `hd` bate com o domínio aceito.

Pontos complementares:

- O checklist do Google **não lista o `nonce`**. O [OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation) diz que, se o nonce foi enviado, ele "MUST" estar no token e ser igual ao enviado. O Google manda apresentar o nonce "só uma vez" ([tabela de claims](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)).
- O OIDC Core também exige que `iss` bata **exatamente** com o issuer do discovery. Se `aud` tiver audiências extras não confiáveis, o token é rejeitado. Uma folga pequena para diferença de relógio no `exp` é aceita ([OIDC Core §2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken), [§3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)).
- Em produção, valide localmente com as chaves públicas. O endpoint `tokeninfo` serve só para depuração e pode sofrer throttling ([Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken)).

**Quando a assinatura pode ser pulada:**

- OIDC Core: se o ID token veio "por comunicação direta entre o Client e o Token Endpoint", a validação TLS do servidor "MAY" substituir a checagem da assinatura. Todos os outros ID tokens "MUST" ter a assinatura validada ([OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)).
- Google: como a troca acontece "direto com o Google, por HTTPS sem intermediário" e autenticada com o `client_secret`, "você pode ter confiança de que o token veio do Google e é válido". Se o token for repassado a outros componentes, eles têm de validá-lo ([Google OIDC, passo 5](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)).
- Só a assinatura pode ser pulada: `iss`, `aud`, `exp` e `nonce` continuam obrigatórios ([OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)).
- No GIS, o ID token chega pelo navegador. Aí a validação completa, com assinatura, é obrigatória: "nunca confie num token só porque veio do seu cliente" ([Best practices](https://developers.google.com/identity/siwg/best-practices#security_token_handling)).

## 5. Identificador estável: `sub`, não `email`

Sim, o Google diz isso com todas as letras:

- "Você não deve usar o campo `email` do ID token como identificador único. Sempre use o campo `sub`: ele é único para uma Conta Google mesmo que o usuário troque de e-mail" ([Google OIDC, passo 5](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)).
- "Use só o `sub` como identificador do usuário, já que ele é único e estável entre todas as Contas Google e nunca reutilizado. [...] Você pode usar o e-mail para checar se o usuário já tem conta, mas não como identificador" ([Best practices](https://developers.google.com/identity/siwg/best-practices#security_token_handling)).
- No padrão: só `iss` + `sub` juntos são identificador estável. O emissor "MAY" reutilizar um e-mail para outro usuário em outro momento, e por isso `email`, `phone_number`, `preferred_username` e `name` "MUST NOT" ser usados como identificador único ([OIDC Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)).
- O Google usa `sub` do tipo *public* ([discovery, `subject_types_supported`](https://accounts.google.com/.well-known/openid-configuration)): o mesmo `sub` vale para todos os clients ([OIDC Core §8](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes)). **[Inferência]** Trocar de projeto ou client ID no console não muda o `sub` do admin.

**`email_verified` e `hd`:**

- `email_verified: true` quer dizer que o provedor "tomou medidas para garantir que o e-mail era controlado pelo usuário **no momento da verificação**" ([OIDC Core §5.1](https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims)).
- O Google é **autoritativo** para o e-mail em dois casos: e-mail `@gmail.com`, ou `email_verified` verdadeiro com `hd` presente (Workspace). Sem `@gmail.com` e sem `hd`, o Google não é autoritativo e recomenda senha ou outro desafio. `email_verified` pode ser `true` mesmo que a posse do e-mail de terceiros tenha mudado depois ([Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)).
- Para restringir acesso aos membros de um domínio, é preciso checar o claim `hd`; o domínio do `email` não basta ([Google OIDC, tabela de claims](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)). O parâmetro `hd` do pedido é só otimização de interface e pode ser alterado no cliente ([parâmetro `hd`](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)).

## 6. Cookies na volta do redirect

**A pergunta:** a resposta do Google é um `302` para o nosso callback. O navegador faz uma navegação de topo (*top-level*) para o nosso site, disparada a partir de um documento de outro site (`accounts.google.com`). Que cookies vão junto?

- **`Strict`**: "cookies em modo Strict **não** serão enviados em navegações de topo disparadas de um contexto de documento cross-site" ([draft RFC 6265bis-22 §5.6.7.1](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7.1)). O MDN resume: o cookie só vai "em requisições originadas do mesmo site que o criou" ([MDN Set-Cookie, SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value)).
- **`Lax`**: vai também em requisições cross-site que sejam **navegação de topo** e usem **método seguro** (GET), e não vai em POST. O método é avaliado em cada salto do redirect ([6265bis §5.6.7.1](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7.1); [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value)).
- **Sem `SameSite`**: "alguns navegadores" tratam como `Lax`. Nesse modo padrão, POST cross-site ainda leva o cookie se ele tiver até 2 minutos ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value); [6265bis §5.6.7.2](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7.2)).
- **Gravar cookie**: cookies `Lax` ou `Strict` "podem ser gravados em qualquer navegação de topo, cross-site ou não" ([6265bis §4.1.2.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.2.7)). Ou seja, a resposta do callback **pode** gravar o refresh cookie `Strict`.
- **Recarregar a página**: um reload feito pelo usuário numa página aberta por navegação cross-site continua cross-site ([6265bis §8.8.5](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-8.8.5)).
- **Status do 6265bis**: é um Internet-Draft (rev. 22, de dezembro de 2025). No [datatracker](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/), o estado no IESG é "RFC Ed Queue" e o status no RFC Editor é "blocked: Final Approval Pending". Ainda não é RFC.

**[Não confirmado]** Se o Google responder com `302` imediato (usuário já logado e consentimento já dado), a cadeia de navegação começou no nosso site. O draft define "same-site" pela origem do documento que dispara a requisição ([§5.2](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.2)), mas não diz como fica uma cadeia de redirects que passa por outro site. Não presuma que `Strict` funciona nesse caso.

**Impacto em onde guardar `state`, `nonce` e `code_verifier`:**

- Esses valores precisam sobreviver entre `/api/auth/google` e o callback, presos ao navegador ([RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1); [RFC 6749 §10.12](https://www.rfc-editor.org/rfc/rfc6749#section-10.12)). A Lambda não guarda memória entre requisições ([ADR 0001](../adr/0001-api-em-lambda.md)), então eles ficam num cookie ou no banco.
- **[Recomendação]** Use um cookie dedicado:
  - `HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=600`.
  - `Lax` é o que garante que ele chega no callback GET em qualquer caso. Isso é seguro: o cookie só guarda valores aleatórios de uso único, e um atacante não consegue lê-los nem gerar uma resposta que bata com eles.
  - Os 600 s acompanham a vida máxima recomendada para o code ([RFC 6749 §4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2)).
  - Apague o cookie no callback, para uso único ([RFC 9700 §4.2.4](https://www.rfc-editor.org/rfc/rfc9700#section-4.2.4)).
- O **refresh cookie atual continua `Strict`**. Ele é gravado na resposta do callback (permitido, ver acima) e só é lido depois, pelo `fetch` same-origin do SPA para `/api/auth/refresh`.
- Endurecimento opcional: o prefixo `__Host-` exige `Secure`, nenhum `Domain` e `Path=/` ([MDN, Cookie prefixes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes)). Ele trava o cookie no host, mas obriga a abrir o `Path`. O MDN lembra que `Path` "não é uma medida de segurança" ([MDN Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#controlling_third-party_cookies_with_samesite)). **[Recomendação]** Não vale a pena aqui: o site tem um host só.

## 7. Google Cloud Console

**Criar o client.** Em *Clients* > *Create client* > tipo **Web application**, com as *Authorized redirect URIs* ([Web server, Create authorization credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)). O `client_secret` "só é mostrado depois de criar o client" e não pode ser visto de novo ([mesma seção](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)). As políticas proíbem versionar credenciais em repositório público e recomendam um gerenciador de segredos ([OAuth 2.0 Policies, Handle client credentials securely](https://developers.google.com/identity/protocols/oauth2/policies#secure-credentials)).

**Regras do redirect URI** ([Redirect URI validation rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation)):

- Precisa ser HTTPS, exceto `localhost` (inclusive IPs de localhost).
- Não pode ter IP como host (localhost à parte), wildcard `*`, fragmento `#`, *userinfo*, *path traversal* nem open redirect.
- O TLD precisa estar na *public suffix list*.

O [GIS Setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#get_your_google_api_client_id) pede, para desenvolvimento local, `http://localhost` e `http://localhost:<porta>` nas origens autorizadas.

**Branding (tela de consentimento).** Nome do app, logo, e-mail de suporte, domínios autorizados e links de home, privacidade e termos, que precisam estar em domínio autorizado ([GIS Setup, Configure your OAuth Consent Screen](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#configure_your_oauth_consent_screen)). Para autenticação, os escopos padrão (`email`, `profile`, `openid`) bastam, "sem escopos sensíveis" (mesma página). Os escopos de Sign-In vêm preenchidos como **não sensíveis** ([Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)).

**Tipo de usuário e status de publicação** ([Ajuda do Cloud Console, Manage App Audience](https://support.google.com/cloud/answer/15549945)):

- **External**: qualquer Conta Google. O que cada uma pode autorizar depende do status de publicação.
- **Internal**: só membros de uma organização Google Workspace/Cloud.
- **Personal**: só a conta que **criou** o app. Não exige verificação, não tem limite de usuários nem expiração de 7 dias, e não mostra a tela de app não verificado. É **escolha única e irreversível**: não vira External nem Internal depois.
- Status **Testing** (só para External):
  - limite de **100 test users**;
  - aviso antes do consentimento;
  - autorizações de test users **expiram em 7 dias**, inclusive o refresh token.
  - **Exceção**: se o app pede só nome, e-mail e perfil (`openid`, `userinfo.email`, `userinfo.profile` ou os equivalentes OIDC), "os usuários não precisam estar na lista, não verão aviso e as autorizações não expiram em 7 dias". A exceção vale também para Sign in with Google. A [página de token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) confirma a regra dos 7 dias com essa mesma exceção.
- Status **In production**: qualquer Conta Google. Verificação conforme os critérios. A tela de "app não verificado" aparece se o app pedir escopos sensíveis ou restritos antes de verificá-los.
- **[Não confirmado]** As fontes divergem sobre o aviso no Testing. A tabela da [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) diz que, em Testing, o usuário "vê um aviso de que o app está em teste", logo depois de citar a exceção dos escopos básicos. A Ajuda do console diz que, com escopos básicos, não há aviso.

**Verificação:**

- Não é obrigatória para apps Personal, para público limitado (< 100 usuários, clicando no aviso), para apps em desenvolvimento/teste ou para apps Internal ([Ajuda, When is verification not needed](https://support.google.com/cloud/answer/13464323)).
- A **verificação de marca** é necessária quando o app é External + publicado **e** você quer exibir nome e logo na tela de consentimento ([Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)).
- Publicado sem verificação de marca, o nome e o logo não aparecem ([app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)).
- A verificação de marca exige home pública e política de privacidade no mesmo domínio, com o domínio verificado no Google Search Console ([Brand verification, Authorized domains e requisitos](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)). Para apps só de autenticação, é a verificação "mais simples" ([Best practices](https://developers.google.com/identity/siwg/best-practices)).

**Projetos por ambiente.** As políticas exigem projetos separados por ambiente (dev, staging, prod) para apps "de produção". Um app **não** é "de produção" se for de uso pessoal: não compartilhado, ou com menos de 100 pessoas que você conhece ([Policies, Use separate projects](https://developers.google.com/identity/protocols/oauth2/policies#separate-projects)).

**Custo. [Não confirmado]** Nenhuma das páginas consultadas (OIDC, web server, GIS, políticas, verificação, Ajuda do console) fala em preço do Sign in with Google ou do fluxo OAuth. A página de web server só diz "se solicitado, habilite o faturamento" no passo de habilitar **APIs** ([Enable APIs](https://developers.google.com/identity/protocols/oauth2/web-server#enable-apis)), e o login não usa API nenhuma. Não afirmo que é gratuito. O Identity Platform do Google Cloud é outro produto e não foi avaliado.

**[Recomendação]** Para a fase só do admin, use **External + Testing**, com os escopos básicos `openid email`. Pela exceção acima, funciona sem cadastrar test user, não expira e não exige verificação. Mantém aberto o caminho para o multiusuário sem trocar de projeto. **Personal** dá uma camada extra (o próprio Google barra outras contas), mas é irreversível e obrigaria a criar outro projeto para o multiusuário; o `sub` do admin continuaria valendo (seção 5). Nos dois casos, quem decide quem entra é a nossa allowlist de `sub`, não o console.

## 8. Futuro multiusuário

**O que as fontes dizem:**

- **Chave**: `iss` + `sub` ([OIDC Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)). No Google, `sub` ([Best practices](https://developers.google.com/identity/siwg/best-practices#security_token_handling)).
- **Cadastro**: no primeiro login, verifique se existe usuário com aquele `sub`; se não existir, crie a conta ([Best practices, UX](https://developers.google.com/identity/siwg/best-practices#ux-best-practices)).
- **Vínculo com conta existente**: o e-mail pode servir para **descobrir** que já existe conta, mas não como identificador ([Best practices](https://developers.google.com/identity/siwg/best-practices#security_token_handling)).
  - Se já existe uma conta com outro método de login, o Google sugere uma página em que o usuário digita a senha para vincular, o que "confirma que ele tem acesso à conta existente" ([Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)).
  - Pular a senha só é aceitável quando o Google é autoritativo para o e-mail (Gmail, ou `email_verified` + `hd`) ([mesma página](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)).
  - Ofereça "Contas conectadas" para vincular e desvincular. Desvincular exige revogar tokens e remover a associação ([Best practices, UX](https://developers.google.com/identity/siwg/best-practices#ux-best-practices)).
- **Vários provedores por usuário**:
  - O OIDC Core não trata de vínculo de contas (não encontrei menção).
  - Ele diz que só `iss` + `sub` garantem unicidade e que e-mails podem ser reatribuídos a outro usuário ([§5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)).
  - Com mais de um provedor, a defesa contra *mix-up* passa a ser REQUIRED, com o parâmetro `iss` (RFC 9207) ou redirect URIs distintos ([RFC 9700 §2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1), [§4.4.2](https://www.rfc-editor.org/rfc/rfc9700#section-4.4.2)). O Google anuncia `"authorization_response_iss_parameter_supported": true` no [discovery](https://accounts.google.com/.well-known/openid-configuration).
- **Troca de e-mail**: o `sub` não muda quando o e-mail muda ([tabela de claims](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)). Para `name`, `picture` e `profile`, o Google diz que "você pode usá-los para atualizar os registros do usuário" ([mesma tabela](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo)).
- **Exclusão de conta**: o app "deve revogar todos os tokens" obtidos ([Best practices](https://developers.google.com/identity/siwg/best-practices#security_token_handling)). O Google também recomenda Cross-Account Protection (RISC) para proteção mais ampla (mesma página).

**[Recomendação]** Quando chegar o multiusuário:

- Tabela `Identity(issuer, subject, userId)` com único em (`issuer`, `subject`) e `email` como atributo comum, atualizado a cada login.
- Vínculo automático por e-mail só quando o Google for autoritativo. No resto, peça a senha, ou vincule a partir de uma sessão já aberta.
- Callback por provedor (`/api/auth/<provedor>/callback`) como defesa de mix-up.

## 9. Logout e refresh tokens do Google

- O Google diz que "o status de login da Conta Google do usuário e o seu app são independentes", e que o Sign in with Google "não oferece nenhum recurso de gerência de sessão no seu site depois da autenticação" ([GIS Integrate](https://developers.google.com/identity/gsi/web/guides/integrate)).
- O [discovery do Google](https://accounts.google.com/.well-known/openid-configuration) **não** publica `end_session_endpoint`. Não há logout OIDC iniciado pelo app (RP-Initiated Logout) anunciado.
- O único ajuste de logout que o Google pede é para One Tap com login automático: chamar `google.accounts.id.disableAutoSelect()` ou usar a classe `g_id_signout`, para o usuário não ser logado de novo em loop ([Automatic sign-in and sign-out](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out#sign-out)). Não se aplica ao fluxo de servidor.
- **[Inferência]** Sem `prompt`, o Google só pede consentimento na primeira vez ([Web server, `prompt`](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1)), e sair do painel não desloga o Google. Num computador compartilhado, quem abrir o navegador pode entrar de novo com um clique. **[Recomendação]** Mande `prompt=select_account` para sempre mostrar o seletor de conta ([parâmetro `prompt`](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)).

**Refresh token do Google:**

- Só é emitido com `access_type=offline` e serve para obter access tokens "quando o usuário não está presente" ([Web server, `access_type`](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1); [OIDC, Refresh tokens](https://developers.google.com/identity/openid-connect/openid-connect#refresh-tokens)). Sem chamar APIs do Google, **não precisamos dele**. O DPoP que o Google recomenda na troca também só amarra o refresh token ([Web server, passo 5](https://developers.google.com/identity/protocols/oauth2/web-server#exchange-authorization-code)), então não se aplica.
- O access token do Google vem na resposta de qualquer jeito ([OIDC, passo 4](https://developers.google.com/identity/openid-connect/openid-connect#exchangecode)). As políticas pedem para não trafegar tokens em texto puro, criptografar tokens guardados e revogar quando não precisar mais ([Policies, Handle user tokens securely](https://developers.google.com/identity/protocols/oauth2/policies#secure-token-handling)).
- **Revogar** "remove todos os escopos concedidos ao projeto" ([Web server, Token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)). **[Inferência]** Revogar a cada login apagaria o consentimento e faria o Google pedi-lo de novo toda vez.

**[Recomendação]** Não guardar o access token do Google: ele morre sozinho em `expires_in`. Revogar só ao desvincular ou excluir a conta. O logout do painel continua o de hoje: `POST /api/auth/logout` → `tokenVersion++`.

## 10. Bibliotecas Node

**O que já está instalado:** nenhuma biblioteca de OAuth ou OIDC. O `apps/api/package.json` tem `@nestjs/jwt` (JWT HS256 próprio), `cookie-parser`, `argon2` e `@nestjs/throttler`, entre outras. Nem `passport` nem `@nestjs/passport` estão lá.

Para medir o tamanho, instalei cada pacote isolado com `npm install --ignore-scripts` (versão `latest` de 2026-11-22). Status de manutenção pelo registry do npm e pelo GitHub.

| | `google-auth-library` | `openid-client` | `passport-google-oauth20` |
|---|---|---|---|
| Versão / última publicação | 11.3.4, 2026-11-09 ([npm](https://www.npmjs.com/package/google-auth-library)) | 6.9.1, 2026-11-20 ([npm](https://www.npmjs.com/package/openid-client)) | 2.0.0, **2019-03-08** ([npm](https://www.npmjs.com/package/passport-google-oauth20)) |
| Repositório | o repo antigo está **arquivado** e o README diz que o conteúdo foi movido ([google-auth-library-nodejs](https://github.com/googleapis/google-auth-library-nodejs)); hoje vive no monorepo [google-cloud-node/core](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs) | [panva/openid-client](https://github.com/panva/openid-client), ativo | [jaredhanson/passport-google-oauth2](https://github.com/jaredhanson/passport-google-oauth2): último commit em 2023-05 (só README), 59 issues/PRs abertos |
| Status declarado | "stable", da própria Google ([README](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs)) | v6.x com correções de segurança, bugs e features; certificado OpenID RP Basic/FAPI ([README](https://github.com/panva/openid-client)) | não declara |
| Pacotes instalados (com ele) | **23** | **3** (`jose`, `oauth4webapi`) | **7**, mais `passport` e, para o Nest, `@nestjs/passport` |
| Tamanho no disco | **~12 MB** (~8,9 MB só do `web-streams-polyfill`) | **~1 MB** | ~0,3 MB, mais o passport |
| Formato | CJS; `engines: node >=22` | ESM; `require()` funciona no Node ≥ 23 ([README, nota cjs](https://github.com/panva/openid-client)). A imagem usa `node:24-slim` | CJS |
| Fluxo de código (gerar URL e trocar o code) | sim: `generateAuthUrl`, `getToken`, PKCE com `generateCodeVerifierAsync` ([fonte](https://github.com/googleapis/google-cloud-node/blob/main/core/packages/google-auth-library-nodejs/src/auth/oauth2client.ts)) | sim: `buildAuthorizationUrl` e `authorizationCodeGrant` com `pkceCodeVerifier`, `expectedState` e `expectedNonce` ([docs](https://github.com/panva/openid-client/blob/main/docs/interfaces/AuthorizationCodeGrantChecks.md)) | sim, via `passport-oauth2`, com `state`/`pkce` |
| Validação do ID token | `verifyIdToken({ idToken, audience })`: checa assinatura (certs do Google), `iat`/`exp` com 300 s de folga, `iss` e `aud`. **Não checa `nonce`.** **Sem `audience`, não checa `aud`** ([fonte](https://github.com/googleapis/google-cloud-node/blob/main/core/packages/google-auth-library-nodejs/src/auth/oauth2client.ts)) | valida o ID token da resposta do token endpoint (`iss` exato do discovery, `aud`, `exp`, `nonce`). Assinatura opcional via `enableNonRepudiationChecks`, porque o canal TLS direto já autentica o emissor ([docs](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md)) | **não usa ID token**: busca o perfil no endpoint `userinfo` com o access token ([strategy.js](https://github.com/jaredhanson/passport-google-oauth2/blob/master/lib/strategy.js)). A token URL fixa no código (`www.googleapis.com/oauth2/v4/token`) não é a do discovery |
| Onde guarda `state`/PKCE | por sua conta | por sua conta: o README diz para guardar "na sessão do usuário" | stores prontos que **exigem `req.session`** (`express-session`) ([pkcesession.js](https://github.com/jaredhanson/passport-oauth2/blob/master/lib/state/pkcesession.js)) |
| Indicada pelo Google | sim: é a biblioteca Node citada para validar ID token ([Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)) | não citada | não citada |

**Leitura (minha):**

- **`google-auth-library`** faz sentido se o caminho for o **GIS** (ID token vindo do navegador): o `verifyIdToken` é exatamente o que o Google documenta. Mas é pesada para uma Lambda (23 pacotes, 12 MB), não confere `nonce` e exige passar `audience` sempre.
- **`openid-client`** implementa o fluxo escolhido de ponta a ponta, com as checagens do OIDC Core, em 3 pacotes. **[Recomendação]** É a escolha para o Authorization Code.
- **`passport-google-oauth20`**: sem publicação desde 2019, depende de sessão no servidor (a API é stateless), não valida ID token nem `nonce`. **[Recomendação]** Descartar.
- **Escrever à mão** (`fetch` + decodificar o JWT + checar `iss`/`aud`/`exp`/`nonce`, sem assinatura, já que o canal é TLS direto) daria zero dependências e é permitido pela [OIDC Core §3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation). O Google, porém, "incentiva fortemente" usar biblioteca por causa do risco de errar ([Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect#accessingtheservice)). **[Recomendação]** Prefira `openid-client`: 1 MB não justifica reimplementar.

---

## Implicações para este projeto

Cada item liga um achado às restrições atuais ([`backend.md`](../specs/backend.md), [`infra.md`](../specs/infra.md), [ADR 0001](../adr/0001-api-em-lambda.md), `apps/api/src/auth/*`). Tudo aqui é **[Recomendação]**, salvo onde houver link.

1. **Duas rotas novas, públicas e GET**: `GET /api/auth/google` (início) e `GET /api/auth/google/callback`.
   - São navegações de topo (`<a href>` ou `location.assign`), não `fetch`. Por isso não levam `X-Authorization`; precisam de `@Public()` e do `ClientIpThrottlerGuard`, como o login atual.
   - Por serem GET sem corpo, não precisam de `x-amz-content-sha256`, e o OAC não atrapalha ([infra.md, consequências para clientes](../specs/infra.md)).
   - O behavior `/api/*` do CloudFront usa a origin request policy `AllViewerExceptHostHeader` e não cacheia (`CachingDisabled`), segundo o [infra.md](../specs/infra.md). **[Inferência]** Ele já repassa cookies e query string, porque o refresh cookie e os filtros por query string (`/api/projects?tags=`) funcionam por ele hoje. Nada muda na distribuição.
2. **Redirect URIs no console**: `https://<dominio>.info/api/auth/google/callback` e, para dev, `http://localhost:5173/api/auth/google/callback`.
   - Em dev, o Vite faz proxy de `/api` na mesma origem, como em produção (`docker-compose.yml`, `WEB_PORT` padrão 5173).
   - A string tem de bater exatamente, inclusive a barra final ([Google](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1)). Monte a URI a partir do `PUBLIC_URL` que já existe na config.
   - Não aceite um "voltar para" vindo da URL: open redirect é proibido ([RFC 9700 §4.11.1](https://www.rfc-editor.org/rfc/rfc9700#section-4.11.1)). O callback sempre redireciona para `/admin`.
3. **Cookie temporário** `google_oauth`: `HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=600`, com `state`, `nonce` e `code_verifier` aleatórios, e apagado no callback (seção 6).
   - **Não** reaproveite o `cookieOptions()` atual: ele força `sameSite: 'strict'`, e um cookie `Strict` não chegaria no callback ([6265bis §5.6.7.1](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.6.7.1)).
   - Em localhost, o `Secure` funciona: o MDN diz que a exigência de HTTPS é ignorada quando o cookie é gravado por localhost ([MDN, Secure](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#secure)).
4. **Sessão sem mudanças de modelo**:
   - O callback chama o `issueTokens(admin)` existente e grava o refresh cookie (`Strict`, `Path=/api/auth/refresh`) no próprio 302. É permitido gravar cookie `Strict` numa navegação de topo ([6265bis §4.1.2.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.2.7)).
   - Depois redireciona para `/admin`, onde o `AdminApp` já restaura a sessão com `refreshSession()` (`apps/web/src/admin/AdminApp.tsx`).
   - O access JWT nunca passa pela URL, e o Google recomenda justamente redirecionar para uma URL sem os parâmetros da resposta ([Google](https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse)).
   - **`tokenVersion` continua igual**: logout e troca de senha revogam todas as sessões, venham de senha ou de Google.
5. **Quem pode entrar**:
   - `Admin.googleSub String? @unique` numa migration nova. O callback só emite tokens se `sub` bater com o de um `Admin`; sem `sub` conhecido, recusa (401 ou redirect com aviso).
   - **Nada de cadastro automático**: o spec proíbe signup público ([backend.md, user story 37](../specs/backend.md)).
   - Como vincular o `sub`, em ordem de preferência minha:
     - (a) botão "Vincular conta Google" na página de conta, com sessão por senha já aberta. O Google sugere exatamente esse vínculo a partir de um login existente ([Best practices](https://developers.google.com/identity/siwg/best-practices#ux-best-practices)).
     - (b) variável do seed (`ADMIN_GOOGLE_SUB`).
   - Evite vincular por e-mail: o e-mail pode mudar e até ser reatribuído ([OIDC Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)).
   - **Decisão do dono**: manter ou não o login por senha como alternativa. Se for só Google, `passwordHash` vira opcional e a troca de senha some.
6. **Aviso de Login**: o callback deve chamar o mesmo `announceLogin`. O [GLOSSARY.md](../../GLOSSARY.md) define Login como "com e-mail e senha". A definição precisa incluir Google quando isso for implementado (é termo de domínio).
7. **Segredos e config**:
   - `GOOGLE_CLIENT_ID` (não é segredo) e `GOOGLE_CLIENT_SECRET` (segredo) no SSM. O segredo vai na lista explícita de parâmetros que a role da Lambda lê no boot e na validação zod da config, no mesmo padrão dos JWT e webhooks ([infra.md, Segredos](../specs/infra.md)).
   - O Google proíbe versionar o `client_secret` ([Policies](https://developers.google.com/identity/protocols/oauth2/policies#secure-credentials)).
   - Criar o client no console e gravar o segredo no SSM são passos manuais do dono.
8. **CSP do `apps/web`**: nada muda no fluxo de servidor. O navegador só segue um 302 até o Google, e a página não carrega nada dele.
   - Use um link (`<a>`), não `<form>`: a CSP tem `form-action 'self'`. **[Não confirmado]** Não verifiquei se um `form-action` bloquearia o redirect seguinte. Com link, a questão não existe.
   - Se um dia o caminho for o GIS, serão 4 diretivas novas ([GIS Setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy)).
9. **Cold start**: o `openid-client` faz `discovery()` com uma chamada HTTP ao Google. Faça lazy, no primeiro `/api/auth/google` de cada instância, e guarde em memória. O Google pede que o discovery respeite o cache HTTP ([Google](https://developers.google.com/identity/openid-connect/openid-connect#discovery)). Fica dentro do timeout de 15 s da Lambda ([infra.md](../specs/infra.md)).
10. **Parâmetros do pedido**: `scope=openid email` (o `profile` é dispensável: nome e foto já estão no `Profile`), `prompt=select_account` (seção 9), `state`, `nonce`, `code_challenge` (S256). Sem `access_type=offline`.
    - Se o usuário negar, o callback recebe `error=access_denied` ([Google](https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse)) e deve redirecionar para `/admin` com aviso.
11. **Testes e2e**: o Google não roda no Docker. Deixe a troca de code atrás de uma função da `AuthService` que o e2e substitui, e teste o resto de verdade: state errado → 401, sem cookie → 401, `sub` desconhecido → 401, sucesso → refresh cookie + Login anunciado.
12. **Custo (decisão do dono)**:
    - AWS: ~US$ 0. Um parâmetro SSM padrão é gratuito ([infra.md](../specs/infra.md)) e são 2 invocações de Lambda por login.
    - Google: **[Não confirmado]** (seção 7). Não precisa de verificação nem de projeto publicado para a fase só do admin.
    - Dependência: +3 pacotes (~1 MB) na imagem, com efeito no cold start não medido.

## Fontes consultadas

- Google Identity: [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Discovery](https://accounts.google.com/.well-known/openid-configuration) · [Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) · [Native apps (PKCE)](https://developers.google.com/identity/protocols/oauth2/native-app) · [OAuth 2.0 overview / expiration](https://developers.google.com/identity/protocols/oauth2#expiration) · [Policies](https://developers.google.com/identity/protocols/oauth2/policies) · [App state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) · [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) · [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) · [GIS Overview](https://developers.google.com/identity/gsi/web/guides/overview) · [GIS Integrate](https://developers.google.com/identity/gsi/web/guides/integrate) · [GIS Setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) · [Display button](https://developers.google.com/identity/gsi/web/guides/display-button) · [Verify ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) · [Sign-out](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out) · [HTML API ref](https://developers.google.com/identity/gsi/web/reference/html-reference) · [JS API ref](https://developers.google.com/identity/gsi/web/reference/js-reference) · [Best practices](https://developers.google.com/identity/siwg/best-practices) · [Branding guidelines](https://developers.google.com/identity/branding-guidelines)
- Ajuda do Google Cloud Console: [Manage App Audience](https://support.google.com/cloud/answer/15549945) · [When is verification not needed](https://support.google.com/cloud/answer/13464323)
- Padrões: [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) · [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) · [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) · [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) · [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) · [draft-ietf-httpbis-rfc6265bis-22](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22)
- MDN: [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) · [Cookies guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- Bibliotecas: [google-auth-library (monorepo)](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs) · [repo antigo, arquivado](https://github.com/googleapis/google-auth-library-nodejs) · [openid-client](https://github.com/panva/openid-client) · [passport-google-oauth2](https://github.com/jaredhanson/passport-google-oauth2) · [passport-oauth2](https://github.com/jaredhanson/passport-oauth2) · registry do npm ([google-auth-library](https://registry.npmjs.org/google-auth-library), [openid-client](https://registry.npmjs.org/openid-client), [passport-google-oauth20](https://registry.npmjs.org/passport-google-oauth20))

### Sobre o RFC 6750 e o `X-Authorization`

O RFC 6750 define o envio de bearer token no header **`Authorization`** ([§2.1](https://www.rfc-editor.org/rfc/rfc6750#section-2.1)). O projeto usa `X-Authorization` porque o CloudFront sobrescreve `Authorization` com a assinatura do OAC (`apps/api/src/auth/auth.guard.ts`). Como esse token é nosso, não do Google, o login com Google não muda nada aqui. O mesmo RFC diz que bearer tokens em cookie "MUST" ter proteção contra CSRF ([§5.3](https://www.rfc-editor.org/rfc/rfc6750#section-5.3)). O refresh cookie `SameSite=Strict` com `Path` restrito é essa proteção hoje, e continua igual.
