---
title: Backend do portfolio com painel administrativo
labels: [ready-for-agent]
status: ready
date: 2026-09-27
---

# Backend do portfolio com painel administrativo

## Problem Statement

O portfolio (referência visual: `docs/ui/layout.html`) hoje é uma página estática com conteúdo fixo no código. Para atualizar qualquer informação — um projeto novo, uma experiência, um parágrafo do "Sobre" — é preciso editar o HTML e publicar de novo. Não há versão em inglês, o CV precisa ser mantido à parte e fica desatualizado em relação ao site, e não existe um lugar seguro para o dono do portfolio gerenciar seu próprio conteúdo.

## Solution

Uma API em NestJS + Prisma + PostgreSQL que é a fonte única do conteúdo do portfolio:

- Um **site público** que lê todo o conteúdo visível por uma API, em português ou inglês, com filtros na listagem de projetos.
- Um **painel administrativo** protegido, em que o único dono do portfolio edita cada seção (perfil, links sociais, habilidades, projetos, experiência, formação, serviços), ordena itens, oculta itens sem apagar e envia imagens.
- Um **CV em PDF gerado sob demanda** a partir dos mesmos dados, em PT ou EN, sempre em sincronia com o site.
- O **contato**: cada Mensagem de contato enviada pelo formulário chega ao canal `#contato` do Discord do dono.
- Todo o ambiente (dev, testes, build de produção) roda em Docker, operado por um Makefile, sem exigir Node, pnpm ou Postgres instalados localmente. O repositório é um monorepo pnpm, com a API em `apps/api` e espaço para o futuro app web.

## User Stories

### Visitante — leitura pública

1. As a visitor, I want to load the whole home page content in a single request, so that the page renders fast.
2. As a visitor, I want to choose between Portuguese and English, so that I can read the portfolio in my language.
3. As a visitor, I want content missing in English to fall back to Portuguese, so that I never see empty sections.
4. As a visitor, I want to see the owner's name, headline and summary in the hero, so that I immediately know who they are.
5. As a visitor, I want to see the social links (GitHub, LinkedIn, etc.) in the configured order, so that I can find the owner elsewhere.
6. As a visitor, I want to see the "About" section with photo, paragraphs, location, availability, work modality and spoken languages, so that I understand the owner's profile.
7. As a visitor, I want to see skills grouped by category, so that I can scan the owner's stack.
8. As a visitor, I want to see only featured projects on the home page, so that the best work stands out.
9. As a visitor, I want to open a page with all visible projects, so that I can browse the full body of work.
10. As a visitor, I want to filter projects by one or more technology tags, so that I find projects relevant to me.
11. As a visitor, I want to choose whether a tag filter matches any or all tags, so that I can narrow or widen results.
12. As a visitor, I want tag filtering to ignore letter case, so that "react" and "React" behave the same.
13. As a visitor, I want to search projects by text in title and description, ignoring accents, so that I find projects by keyword.
14. As a visitor, I want to paginate the project list, so that large lists stay usable.
15. As a visitor, I want to sort projects by manual order or by most recent, so that I can see them the way I prefer.
16. As a visitor, I want each project to show its image, title, description, tags and code/demo links, so that I can evaluate it.
17. As a visitor, I want to see professional experience ordered with period, role, company and bullet points, so that I understand the owner's career.
18. As a visitor, I want the current job to be identifiable as "current", so that I know where the owner works now.
19. As a visitor, I want dates to respect their precision (month or year only), so that periods display the same way the owner wrote them.
20. As a visitor, I want to see education, certifications and courses, so that I know the owner's background.
21. As a visitor, I want to see the services offered, so that I know what I can hire the owner for.
22. As a visitor, I want to see the contact channels the owner chose to expose, so that I can reach out.
23. As a visitor, I want the phone/email to be hidden when the owner chooses so, so that the owner's privacy is respected.
24. As a visitor, I want to download the CV as a PDF in the selected language, so that I can keep or share it.
25. As a visitor, I want the CV to reflect the current site content, so that it is never outdated.
26. As a visitor, I want my browser to reuse a previously downloaded CV when nothing changed, so that downloads are fast.
27. As a visitor, I want to send a message through the contact form and be told whether it was delivered, so that I know the owner got it.
28. As a visitor, I never want to see hidden (non-visible) items, so that drafts stay private.

### Admin — autenticação e conta

29. As the admin, I want to log in with email and password, so that only I can edit the portfolio.
30. As the admin, I want a generic error message on failed login, so that attackers cannot tell whether the email exists.
31. As the admin, I want login attempts rate-limited, so that brute force is impractical.
32. As the admin, I want a short-lived access token, so that a leaked token has little value.
33. As the admin, I want my session silently renewed by a refresh token stored in an httpOnly cookie, so that I stay logged in without exposing the token to JavaScript.
34. As the admin, I want refresh tokens to rotate on each use, so that a stolen refresh token has a narrow window.
35. As the admin, I want to log out and invalidate all my refresh tokens, so that a lost device cannot keep access.
36. As the admin, I want to change my password (confirming the current one), so that I can rotate credentials; doing so invalidates all sessions.
37. As the operator, I want the admin account created by an idempotent seed from environment variables, so that there is no public sign-up route.

### Admin — conteúdo

38. As the admin, I want to edit my profile (name, headline, summary, about paragraphs, location, availability, modality, spoken languages, email, phone, photo), so that the site reflects who I am.
39. As the admin, I want every free-text field to have a Portuguese and an optional English value, so that I maintain both languages in one place.
40. As the admin, I want to receive the full `{pt, en}` objects when editing, so that I can see what is still missing in English.
41. As the admin, I want to toggle whether my phone and email are shown publicly (site and CV), so that I control my privacy.
42. As the admin, I want to create, edit, delete and reorder social links, so that I can list any network.
43. As the admin, I want to create, edit, delete and reorder skill categories and the skills inside them, so that my stack stays current.
44. As the admin, I want to create, edit, delete and reorder projects, with image, tags, repo and demo URLs, so that my work is up to date.
45. As the admin, I want to mark projects as featured, so that I choose what shows on the home page and in the CV.
46. As the admin, I want to create, edit, delete and reorder experiences, with start/end date, precision and bullets, so that my career is accurate.
47. As the admin, I want to create, edit, delete and reorder education entries, classified as degree, certification or course, so that my background is organized.
48. As the admin, I want to create, edit, delete and reorder services, so that my offer is current.
49. As the admin, I want to hide any collection item without deleting it, so that I can prepare content before publishing.
50. As the admin, I want to filter admin lists by visibility (and the same filters as the public lists), so that I find drafts quickly.
51. As the admin, I want reordering to be atomic, so that a failed reorder never leaves a half-applied order.
52. As the admin, I want invalid payloads rejected with clear validation errors, and unknown fields refused, so that bad data never reaches the database.

### Admin — mídia

53. As the admin, I want to upload an image and receive a media id, so that I can attach it to my profile or a project.
54. As the admin, I want uploads validated by real file content (not just extension) and size, so that malicious files are rejected.
55. As the admin, I want uploaded files stored under generated names, so that user-supplied filenames never touch the filesystem.
56. As the admin, I want to list media, filtered by unused and by type, so that I can find and clean orphan uploads.
57. As the admin, I want deleting media that is still referenced to be refused, so that I never break a page.
58. As the operator, I want the storage backend swappable by configuration (local disk now, S3-compatible later) without migrating data, so that hosting can change cheaply.

### Contato

59. As the owner, I want each Mensagem de contato in my `#contato` Discord channel with the visitor's name, e-mail and message, so that I can answer by e-mail.
60. As the owner, I want the contact endpoint to validate and rate-limit input and to drop bots silently (honeypot), so that spam doesn't reach me.

### Operação / ambiente

61. As a developer, I want to start the whole stack with one command, so that onboarding needs only Docker and make.
62. As a developer, I want hot reload inside the container, so that I iterate fast.
63. As a developer, I want make targets for migrations, seed, Prisma Studio, tests, lint, shell and DB reset, so that I never need local tooling.
64. As a developer, I want the app to refuse to start with missing or invalid environment variables, so that misconfiguration fails loudly.
65. As an operator, I want a small multi-stage production image running as a non-root user, so that the attack surface is minimal.
66. As an operator, I want migrations applied on container start in production, so that deploys are one step.
67. As a developer, I want e2e tests to run against a real Postgres in Docker, so that tests exercise the real queries.
68. As a developer, I want the repository organized as a pnpm monorepo, so that the future web app lives alongside the API with one lockfile.
69. As a developer, I want interactive API docs (Swagger UI) in non-production environments, so that I can explore and try endpoints.
70. As a future frontend developer, I want a versioned OpenAPI spec exported from the API, so that I can generate typed clients instead of hand-writing types.
71. As an operator, I want Swagger disabled in production, so that the API surface is not advertised publicly.

## Implementation Decisions

### Estrutura do repositório (monorepo)
- Monorepo com **pnpm workspaces**; pnpm é o único gerenciador de pacotes do projeto inteiro (lockfile único na raiz, versão fixada via `packageManager` + Corepack; npm/yarn não são usados em nenhum lugar, inclusive nas imagens Docker).
- `apps/api`: o backend desta spec.
- `apps/web` (futuro, fora de escopo): um único app com site público e painel admin em rotas separadas.
- Raiz: workspace, `docker-compose`, `Makefile`, `docs/`. Todos os comandos partem da raiz.
- Sem orquestrador de build (Turborepo/Nx) enquanto houver um só app.
- Sem pacote compartilhado de tipos: o contrato entre apps é o **OpenAPI** gerado pela API (ver seção OpenAPI).

### Escopo e tenancy
- **Single-tenant**: um portfolio, um admin. Nenhuma tabela carrega `userId` além do próprio admin. `Profile` é singleton.

### Módulos
- **Config**: valida env no boot com zod (DB URL, dois segredos JWT distintos, TTLs, origem CORS, driver de storage, diretório de uploads, tamanho mínimo de senha, credenciais do seed, credenciais do Google e chave do cookie do fluxo pendente).
- **Auth**: login por senha e pelo Google, refresh, logout, troca de senha; guard JWT global (deny-by-default): toda rota exige token, exceto as marcadas como públicas.
- **Profile**, **SocialLinks**, **Skills** (categorias + skills), **Projects**, **Experience**, **Education**, **Services**: CRUD admin + reorder; leitura pública.
- **Portfolio (público)**: agregado de leitura da home.
- **Media**: upload, listagem, deleção; depende de Storage.
- **Storage**: interface única com driver local; driver escolhido por env.
- **CV**: gera PDF sob demanda a partir dos mesmos serviços de leitura pública.
- **Contact**: DTO + envio ao Discord por `postToDiscord` (`common/discord.ts`), reaproveitado pelos avisos de Login e Visita.
- **I18n (lógica pura)**: resolução de `LocalizedText` para um locale com fallback (helper comum).

### Autenticação (stateless)
- **Access token**: JWT, TTL 15 min, enviado em `X-Authorization: Bearer <token>` (não em `Authorization`, que o CloudFront sobrescreve com a assinatura do OAC — ver `infra.md`), guardado em memória pelo front. Validação 100% stateless.
- **Refresh token**: JWT, TTL 7 dias, em cookie `httpOnly; Secure; SameSite=Strict`, com `Path` restrito ao endpoint de refresh. Rotação a cada uso (novo par emitido).
- **Revogação**: o admin tem `tokenVersion` (int). O refresh carrega a versão; o endpoint de refresh compara com o banco (única leitura de estado). Logout e troca de senha fazem `tokenVersion++`, invalidando todos os refresh tokens.
- Segredos distintos para access e refresh; algoritmo fixado na verificação.
- Senha com **argon2id**. Mensagem de erro de login genérica. Tamanho mínimo configurável por `PASSWORD_MIN_LENGTH` (padrão 5), aplicado na troca de senha e no seed.
- **Abertura de sessão**: todo Login, qualquer que seja o método, abre a sessão por um único ponto (`AuthController.openSession`): emite os tokens, grava o refresh cookie e anuncia o Login com o método. O método só resolve qual Admin é.
- **Aviso de Login**: cada Login (e-mail e senha corretos, ou uma Conta vinculada) gera uma mensagem **silenciosa** (flag `SUPPRESS_NOTIFICATIONS`) no `#alertas` do Discord, com o método ("Senha" ou "Google (e-mail da conta)"), IP real (header da borda), navegador (user agent cortado em 200 caracteres) e horário (`timestamp` do embed, mostrado no fuso de quem lê). Um Login que não foi o dono é um incidente. Refresh e senha errada não avisam. Webhook em `DISCORD_ALERTS_WEBHOOK_URL` (`discord-alerts-webhook` no SSM), obrigatório em produção. O Discord com erro ou lento (até ~2 s) **não bloqueia o Login**: a falha vai para o log com nível `error`, que o alarme de erros da API pega. País fica de fora: o plano Free do CloudFront não repassa esse header.
- Sem signup público; admin criado por **seed idempotente** a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Nenhuma conta é criada a partir do Google.
- MFA fora de escopo.

### Login pelo Google (Conta vinculada)
Decisões no ADR 0002; fontes em `docs/research/oauth-google.md`.
- OpenID Connect, Authorization Code no servidor, pela `openid-client` (ESM, importada no primeiro uso). O pedido leva `scope=openid email`, `prompt=select_account`, `state`, `nonce` e PKCE `S256`, sem `access_type=offline`. Discovery lazy, uma vez por instância, em memória (timeout de 5 s por requisição ao Google). Nenhum token do Google é guardado.
- **Provedor Google** (`auth/google.provider.ts`): o único ponto que fala com o Google e o único substituído nos testes. Monta a URL de autorização e troca os parâmetros da volta por `{ subject, email }`, com `iss`, `aud`, `exp` e `nonce` validados. A redirect URI é `PUBLIC_URL` + `/api/auth/google/callback`, nunca o header `Host` (atrás do CloudFront ele é o da Lambda). Em dev, `PUBLIC_URL` é a origem do Vite (`http://localhost:5173`).
- **Cookie do fluxo pendente** `google_oauth` (`auth/pending-flow-cookie.ts`): intenção (`login`, ou `vincular` com o `adminId` e o `tokenVersion` de quem começou), `state`, `nonce` e `code_verifier`, cifrados com AES-256-GCM (chave = SHA-256 de `OAUTH_STATE_SECRET`), com expiração de 10 min embutida. `HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=600`: precisa ser `Lax`, porque um cookie `Strict` não volta na navegação vinda do Google.
- O `state` começa com a intenção (`login.` ou `vincular.`): um vínculo cujo cookie já se foi (expirado no Google) volta mesmo assim para a página Conta, com `erro`.
- **Uso único**: a volta apaga o cookie em qualquer resultado, e uma cópia reenviada dentro dos 10 min é recusada por um contador do rate limit (`RateLimit`, chave `google-flow:<state>`, limite 1).
- **Volta** (`/admin?google=<código>` nas falhas, sempre caminhos fixos): cookie ausente, alterado, de outra chave, expirado ou já usado → `erro`; `error=access_denied` → `cancelado`; outro `error` → `erro`; `state` diferente do cookie → `erro`; falha na troca → `erro`; `sub` sem Conta vinculada → `nao-vinculada`; sucesso → atualiza o e-mail exibido, abre a sessão pelo ponto único e responde 302 para `/admin`, onde o painel restaura a sessão pelo refresh cookie.
- **Vínculo** (só de dentro do painel, nunca por e-mail igual): `POST /admin/account/google` confirma a senha atual (403; 409 se já há Conta vinculada Google), grava o cookie com a intenção `vincular` e devolve a URL do Google. Na volta, cancelar → `/admin/conta`; qualquer outra falha, `tokenVersion` mudado no intervalo (logout ou troca de senha: a revogação vence) ou um dos lados já vinculado (as chaves únicas) → `/admin/conta?google=erro`; sucesso → cria a Conta vinculada num único `update` do Admin filtrado por `tokenVersion`, avisa e responde 302 para `/admin/conta?google=vinculada`.
- **Desvínculo** (`DELETE`, sem senha, para cortar rápido um Login suspeito): apaga a Conta vinculada e faz `tokenVersion++` na mesma transação, limpa o refresh cookie e avisa.
- **Avisos** no `#alertas`, silenciosos e no mesmo formato do aviso de Login: "Conta Google vinculada" e "Conta Google desvinculada", com o e-mail da conta, o IP e o navegador. Vincular é o jeito de um invasor manter acesso.
- **Incidente**: aviso de vínculo que não foi o dono → desvincular (encerra todas as sessões) e depois trocar a senha. Trocar a senha não desvincula.
- **Logs**: falhas que quem chama consegue causar vão como `warn`, nunca `error` (não disparam Alerta). A query string da volta nunca é logada (leva o code); da falha na troca só vão o nome e o código do erro. Falha no discovery ao iniciar é `error`.
- **Config**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `OAUTH_STATE_SECRET` (mínimo de 32 caracteres, diferente dos segredos JWT). Opcionais por enquanto; sem os três, o início responde 302 para `/admin?google=erro`.

### Segurança transversal
- Helmet; CORS com allowlist (em prod, front e API no mesmo site via reverse proxy em `/api`, então CORS só importa em dev).
- `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted`, `transform`.
- `@nestjs/throttler`: limites estritos por IP em login, refresh, troca de senha (5 por minuto, como o login: um access token roubado não testa senhas sem limite), início e volta do Login pelo Google e início do vínculo (5 por minuto cada), `POST /contact` e `GET /cv`, com contadores no Postgres (compartilhados entre instâncias). O limite global por IP fica no WAF (ver `infra.md`).
- Limites de tamanho de corpo e de upload.
- HTTPS terminado na borda (CloudFront). O IP real do cliente vem de um header gravado pela borda (`CLIENT_IP_HEADER`), nunca do `X-Forwarded-For`, cujas entradas o cliente pode forjar.
- Logs estruturados do Nest; sem tabela de auditoria nem lockout por conta.

### Internacionalização
- Idiomas: `pt` (obrigatório) e `en` (opcional).
- Todo texto livre traduzível é uma coluna **JSONB `LocalizedText`** no formato `{ pt: string, en?: string }`, validada por um DTO compartilhado. Campos não traduzíveis (URLs, datas, tags, nomes de skill) são colunas comuns.
- API pública recebe `?lang=pt|en` (padrão `pt`) e devolve **strings já resolvidas**, com fallback EN→PT centralizado no back.
- API admin devolve e recebe os objetos `{pt, en}` completos.

### Modelo de dados (Prisma / Postgres)
Todas as coleções têm `id`, `position` (int, ordenação manual), `visible` (bool), `createdAt`, `updatedAt`. `LT` = `LocalizedText` (JSONB).

- **Admin**: email (único), passwordHash, tokenVersion.
- **LinkedAccount** (Conta vinculada): adminId → Admin (apagada em cascata), provider (enum, hoje só `GOOGLE`), subject (o `sub`), email (só para exibir). Únicos em `(provider, subject)` e `(adminId, provider)`. Ter uma nunca dá acesso ao painel por si só.
- **Profile** (singleton): name, headline `LT`, summary `LT`, about `LT[]` (parágrafos, JSONB), location `LT`, availability `LT`, workModality `LT`, spokenLanguages `LT`, email, phone, showEmail, showPhone, photoMediaId → Media.
- **SocialLink**: label, url.
- **SkillCategory**: name `LT`; **Skill**: name (não traduzível), categoryId → SkillCategory (cascade).
- **Project**: title `LT`, description `LT`, tags `String[]` (grafia original), repoUrl?, demoUrl?, featured, imageMediaId? → Media.
- **Experience**: role `LT`, company, bullets `LT[]` (JSONB), startDate, endDate? (null = atual), datePrecision (`MONTH|YEAR`).
- **Education**: title `LT`, institution, kind (`DEGREE|CERTIFICATION|COURSE`), startDate?, endDate?, datePrecision.
- **Service**: title `LT`, description `LT`.
- **Media**: key (única, gerada), mime, size, createdAt. Referências a Media com `onDelete: Restrict`.
- **ContactMessage**: name, email, message, createdAt, readAt?. Sem uso: as mensagens vão para o Discord, não para o banco.
- Datas armazenadas como `DATE` (dia 1 / mês 1 quando a precisão é menor); formatação é responsabilidade do front.

### Storage
- Interface `StorageService`: `save(buffer, mime) → key`, `delete(key)`, `publicUrl(key)`.
- Driver selecionado por `STORAGE_DRIVER` (hoje só `local`). O banco guarda **apenas a key**; URLs são montadas na resposta via `publicUrl`. Trocar para S3 = novo driver + cópia dos arquivos, sem migração de dados.
- Driver local grava em volume Docker e serve em `/uploads/*` com `X-Content-Type-Options: nosniff` e `Content-Disposition` adequado.

### Mídia / upload
- `POST /api/admin/uploads` com o **arquivo cru como corpo** (`Content-Type: image/*`, até 4 MB; não multipart, para o cliente conseguir calcular o hash exigido pelo OAC) → valida o tipo por **magic bytes** (allowlist: jpeg, png, webp), gera key UUID, cria registro `Media` e devolve `{ id, url }`.
- Entidades referenciam por `mediaId`.
- `GET /admin/media?unused=&mime=&page=&pageSize=`; `DELETE /admin/media/:id` recusa (409) se referenciada; ao excluir, remove registro e arquivo.
- Sem job de limpeza automática.

### CV
- `GET /cv?lang=pt|en` público, gera PDF com **pdfmake** a cada request, a partir dos dados visíveis.
- Conteúdo: perfil (nome, headline, resumo, localização, idiomas, contatos respeitando `showEmail`/`showPhone`), experiência, formação, habilidades, projetos **featured**. Sem foto.
- `ETag` derivado do maior `updatedAt` do conteúdo + lang + versão do layout do PDF; responde 304 quando inalterado. Throttle estrito. Sem cache em disco.

### Contrato da API
Todas as rotas ficam sob o prefixo **`/api`** (em todos os ambientes); os caminhos abaixo o omitem por brevidade.

Público (sem auth):
- `GET /portfolio?lang=` — agregado: perfil, links sociais, categorias com skills, projetos featured, experiências, formação, serviços. Só itens visíveis, ordenados por `position`.
- `GET /projects?lang=&tags=&tagsMode=any|all&featured=&q=&sort=position|-createdAt&page=&pageSize=`.
- `GET /cv?lang=`.
- `POST /visits` — anuncia uma Visita no `#visitas` do Discord: valida `{ page: '/'|'/projetos', lang: 'pt'|'en', referrer? }`, um por IP a cada 24 h (429 depois), teto de 50 no site inteiro a cada 24 h; responde **204** (ver Visita).
- `POST /contact` — valida `{ name, email, message, honeypot? }`, passa pelo throttle (3 por minuto por IP), envia ao `#contato` do Discord e responde **204**; **502** se o Discord falhar (ver Contato).

Auth:
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `PATCH /admin/account/password`.
- `GET /auth/google` (302 para o Google, ou para `/admin?google=erro` sem credenciais) e `GET /auth/google/callback` (302 para `/admin`, `/admin?google=<código>` ou, num vínculo, `/admin/conta?google=vinculada|erro`); ver Login pelo Google.
- `GET /admin/account/google` (`{ email, linkedAt }` ou 404), `POST /admin/account/google` (`{ currentPassword }` → `{ url }`) e `DELETE /admin/account/google` (204, encerra todas as sessões).

Admin (`/admin/*`, JWT obrigatório):
- `GET|PUT /admin/profile`.
- Para cada coleção (`social-links`, `skill-categories`, `skills`, `projects`, `experiences`, `education`, `services`): `GET` (lista, com filtros), `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `PATCH /reorder` (recebe `[ids]`, reescreve `position` em transação).
- `POST /admin/uploads`, `GET /admin/media`, `DELETE /admin/media/:id`.

### Contato (Discord)
- **Webhook** do `#contato` em `DISCORD_CONTACT_WEBHOOK_URL`. Em produção é obrigatório e vem do SSM no boot (`discord-contact-webhook`, ver `infra.md`): nunca em variável de ambiente da Lambda, no state ou nos logs. Fora de produção é opcional; sem ele, a mensagem só vai para o log (ambiente local sem webhook real).
- **Formato**: um embed com título "Mensagem de contato", campos Nome e E-mail e a mensagem na descrição, como texto puro (nunca HTML). Menções desligadas (`allowed_mentions: { parse: [] }`): `@everyone` do formulário não notifica ninguém. O markdown digitado pelo visitante é renderizado pelo Discord; escapá-lo poderia passar dos 4096 caracteres da descrição, e links mascarados já passam pelo aviso de link externo do Discord.
- **Limite**: mensagem de até **4000** caracteres, contados em unidades UTF-16 nos dois lados (o `maxLength` do formulário conta assim; o `MaxLength` do class-validator contaria "❤️" como 1): cabe inteira na descrição do embed, sem código de corte. Nome e mensagem só com espaços → 400 (o Discord recusa campos em branco).
- **Honeypot**: campo `honeypot`, invisível e fora da ordem de tabulação no formulário, com um nome que nenhum preenchimento automático reconhece (uma mensagem real nunca pode ser descartada). Preenchido → 204 sem envio.
- **Falha**: erro do Discord ou demora acima de ~2 s (a Lambda é cobrada enquanto espera) → **502**, e o site mostra erro, nunca um sucesso falso. O log registra o status e o início da resposta de erro do Discord (que aponta o campo recusado), ou o tipo do erro; nunca a URL.
- **Smoke de produção**: não chama `POST /contact`, que enviaria uma mensagem real.

### Visita (Discord)
- **Visita** (ver `GLOSSARY.md`): alguém que não é o admin abriu o site público. Cada Visita nova gera uma mensagem no `#visitas` com página, idioma, origem e navegador, e horário (`timestamp`).
- **No navegador** (`apps/web/src/lib/visit.ts`): as páginas públicas chamam `POST /visits` ao montar, no máximo uma vez a cada 24 h por navegador (`localStorage`), sem a página esperar a resposta. Só conta como anunciado quando a API responde (204, ou 429 porque o IP já anunciou): uma falha (rede, 5xx, o site publicado antes da API) é tentada de novo na próxima carga. Recarregar ou navegar não chama nada. O navegador fica marcado como do admin (`localStorage`, mesma origem que o admin) sempre que uma sessão abre no painel, por Login ou restaurada ao carregar, e nunca anuncia. Sem `localStorage` (bloqueado), não anuncia.
- **Na API, dois limites**, ambos com contadores no Postgres (`RateLimit`):
  - **por IP**: um a cada 24 h pelo throttle por IP que já existe (chave sha256, o IP não fica em texto puro); repetição → 429. Ele roda antes do teto, então uma repetição não gasta o teto;
  - **teto do site inteiro**: 50 avisos a cada 24 h, só para `/visits` (login, refresh e contato não contam nem são afetados). Acima disso → 204 sem envio, sem mensagem de "teto atingido".
- **Entrada de qualquer um**: página e idioma só de listas fixas (400 fora delas); a origem vira só o domínio do `referrer`, ou "direto" quando vazia ou inválida; navegador cortado em 200 caracteres; menções desligadas. **Sem o IP do visitante**: é dado pessoal (LGPD) e o Discord é um terceiro.
- **Bots**: sem filtro por enquanto; se aparecerem no `#visitas`, um filtro de uma linha no user agent resolve.
- **Webhook** em `DISCORD_VISITS_WEBHOOK_URL` (`discord-visits-webhook` no SSM), obrigatório em produção. Falha do Discord → log com nível `error` (o alarme de erros da API pega), resposta 204 mesmo assim.

### Filtros e paginação
- **Projects**: `tags` (lista), `tagsMode` (`any` padrão, `all`), `featured`, `q`, `sort`. Tags comparadas em minúsculas; exibição preserva a grafia original.
- **q**: `ILIKE` com `unaccent` sobre título e descrição **no locale pedido** (via SQL cru, já que é JSONB). Requer extensão `unaccent` criada por migration. Full-text search fora de escopo.
- **Experience**: `current`. **Education**: `kind`, `current`.
- **Admin**: todas as coleções aceitam `visible`, além dos filtros públicos.
- **Media**: `unused`, `mime`.
- Paginação por offset (`page`, `pageSize`, máx. 50) com envelope `{ items, total, page, pageSize }` em projects e media. Listas curtas (skills, serviços, links, experiência, formação) sem paginação.

### OpenAPI / Swagger
- `@nestjs/swagger` documenta todos os endpoints a partir dos DTOs e decorators (incluindo `LocalizedText`, envelopes de paginação, esquema `X-Authorization` e cookie de refresh).
- Swagger UI e o JSON do spec servidos em `/api/docs` **apenas fora de produção** (desligado por env em prod, para não expor a superfície da API).
- Target `openapi` do Makefile exporta o spec para um arquivo versionado no repo, sem subir o servidor HTTP; é a fonte para o futuro `apps/web` gerar tipos/cliente.
- Drift do spec versionado é verificado com `make openapi && git diff --exit-code apps/api/openapi.json` (o plugin do Swagger depende de informação de tipos, indisponível no ts-jest com `module: nodenext`, então o documento não é comparado dentro do Jest).

### Docker e Makefile
- `docker compose` de dev na raiz: `api` (hot reload, monorepo montado — `node_modules` e store do pnpm ficam no próprio bind mount, visíveis para o editor; healthcheck em `/api/health`), `web` (Vite, sobe depois que a `api` está saudável e faz proxy de `/api` e `/uploads`, mesma origem que em produção), `db` (Postgres 18), `db-test` (Postgres isolado para e2e, em tmpfs), volume de uploads.
- Dockerfile multi-stage de produção com pnpm (Corepack): instala com lockfile congelado filtrando só `apps/api` e suas dependências, gera artefato de deploy enxuto, runtime com usuário não-root e o Lambda Web Adapter (a mesma imagem roda local e na Lambda). Migrations **não** rodam no start: ficam no pipeline de deploy (ver `infra.md`).
- Stack (versões mais recentes compatíveis entre si): Node 24 LTS, pnpm 12, Nest 12, Prisma 7 (driver adapter `@prisma/adapter-pg`, config em `prisma.config.ts`), TypeScript 6 (TS 7 ainda sem suporte em ts-jest/swagger/typescript-eslint), Jest 30, Postgres 18. Lint com oxlint (padrão do template Nest 12) + `tsc --noEmit`.
- Makefile na raiz (tudo via `docker compose`, invocando pnpm com filtro do workspace): `help` (padrão; lista os comandos), `up`, `down`, `logs`, `sh`, `install`, `migrate`, `migration name=…`, `seed`, `studio`, `test` (suite e2e; `t=<padrão>` filtra), `lint`, `openapi`, `build`, `reset-db`.
- Portas do host configuráveis (`API_PORT`, `WEB_PORT`, `STUDIO_PORT`). Os targets de nuvem do Makefile estão descritos em `infra.md`.

## Testing Decisions

- **Um bom teste** exercita comportamento externo: faz uma requisição HTTP e verifica status, corpo, headers e efeitos observáveis pela própria API. Não inspeciona services, repositórios ou chamadas internas.
- **Seam principal (única)**: testes e2e via supertest contra a aplicação Nest completa, com Postgres real (`db-test` no compose) e storage local apontando para diretório temporário. O banco é limpo entre suites.
- **Cobertura mínima esperada**:
  - Auth: login ok/falha genérica; rota admin sem token → 401; refresh rotaciona; refresh após logout ou troca de senha → 401; senha nova abaixo do mínimo → 400; throttle de login e de troca de senha → 429.
  - Login pelo Google (provedor trocado por um dublê via `overrideProvider`, nunca por variável de ambiente): atributos do cookie; sucesso com refresh funcionando e aviso com o método; `nao-vinculada`, `cancelado` e cada `erro` (cookie ausente, alterado, de outra chave, expirado ou reutilizado; `state` divergente; falha na troca); logs `warn` sem a query; logout e troca de senha revogam a sessão; 429 no início e na volta; sem credenciais → `erro`. Vínculo: senha errada → 403; vínculo completo com `GET` mostrando o e-mail e o aviso; segundo vínculo → 409; `sub` de outro Admin, logout no intervalo e cookie alterado → `erro`; desvincular encerra as sessões, avisa e o `GET` passa a 404; 429 no vincular.
  - Validação: campo desconhecido → 400; `LocalizedText` sem `pt` → 400.
  - i18n: `?lang=en` com EN ausente cai para PT.
  - Visibilidade: item `visible=false` nunca aparece nas rotas públicas nem no CV.
  - Projects: filtros por tags (any/all, case-insensitive), `featured`, `q` com acento, ordenação e paginação.
  - Reorder: aplica ordem nova; ids inválidos não alteram nada (transação).
  - Media: upload com extensão falsa (magic bytes inválidos) → 400; excesso de tamanho → 413; delete de mídia referenciada → 409; `unused=true` lista só órfãs.
  - CV: responde `application/pdf`; segundo request com `If-None-Match` → 304; mudança de conteúdo muda o ETag.
  - Contact (webhook falso, um servidor HTTP local): válido com `@everyone` → 204 e um embed com menções desligadas; inválido, em branco ou acima de 4000 (inclusive com emoji) → 400; Discord com erro ou sem resposta → 502; honeypot preenchido → 204 sem envio.
  - Visits (webhook falso): mensagem com página, idioma, domínio de origem e navegador cortado, sem IP; origem vazia ou inválida → "direto"; página ou idioma fora da lista → 400; mesmo IP em 24 h → 429 sem envio; teto de 50 no site inteiro, com repetição de IP sem gastar o teto e login, refresh e contato normais depois do teto; falha do Discord → 204 e log de erro sem a URL.
  - Swagger: `/api/docs-json` servido fora de produção e indisponível com env de produção.
- **Unitário**: nenhum — a resolução de `LocalizedText` é uma linha e o fallback já é coberto pelo e2e de i18n.
- **Prior art**: nenhum — repositório novo; estes testes estabelecem o padrão.

## Out of Scope

- Contato além do Discord: e-mail, persistência das mensagens, captcha.
- Frontend público e painel administrativo (UI).
- Multi-tenant / múltiplos usuários, signup público.
- MFA/TOTP, lockout por conta, log de auditoria.
- Driver S3 de storage (apenas a interface está prevista).
- Job de limpeza automática de mídia órfã.
- Full-text search com ranking/stemming.
- Página de detalhe de projeto e slugs.
- Workflow de rascunho/publicação além do flag `visible`.
- Cache de PDF do CV em disco/Redis.
- Idiomas além de PT e EN.
- Pipeline de CI/CD e deploy.
- Geração de cliente/tipos a partir do OpenAPI (acontece junto com o `apps/web`).
- GraphQL (REST + OpenAPI atende um único cliente com payloads fixos; GraphQL adicionaria limites de complexidade, auth por resolver e perda de cache HTTP sem ganho aqui).

## Further Notes

- `layout.html` é um bundle; o conteúdo real está no template embutido. As seções mapeadas foram: Nav, Hero, Sobre, Habilidades, Projetos, Experiência, Formação, Serviços, Contato, Footer. Os textos do footer ("© ano Nome", "Feito com…") são derivados/estáticos e não viram dados.
- Os CTAs do hero ("Ver projetos", "Falar comigo") são navegação do front, não dados.
- Adicionar um terceiro idioma exige só ampliar o tipo `LocalizedText` e a validação — sem migration.
- Imagem de produção (~940MB) é dominada pelo Prisma CLI mantido para `migrate deploy`; se incomodar, rodar migrations num job/estágio separado e remover o CLI do runtime.
- Upgrade paths conhecidos: S3 (novo driver de storage), limpeza agendada de mídia (`@nestjs/schedule`), FTS com índices por idioma, cache do CV se o throttle não bastar.
- Deploy na AWS: ver `infra.md` e o ADR 0001. Para rodar atrás do CloudFront, a API passou a usar: caminhos sob `/api` (em todos os ambientes), token em `X-Authorization`, upload como arquivo cru de até 4 MB, IP do cliente por header confiável (`CLIENT_IP_HEADER`), `Cache-Control: no-store` por padrão (GETs públicos com cache de 60 s), rate limit persistido no Postgres e migrations no pipeline. Onde este documento diz o contrário, vale `infra.md`.
