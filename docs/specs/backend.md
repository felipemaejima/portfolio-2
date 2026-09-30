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
- A **estrutura do contato** preparada (modelo, contrato e proteção), mas sem ação ainda.
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
27. As a visitor, I want to see a contact form, so that I know a message channel will exist (the backend answers "not implemented" for now).
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

### Contato (estrutura)

59. As the operator, I want the contact message model already migrated, so that implementing the channel later needs no schema redesign.
60. As the operator, I want the contact endpoint to already validate and rate-limit input before answering "not implemented", so that the contract and protection are in place from day one.

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
- **Config**: valida env no boot com zod (DB URL, dois segredos JWT distintos, TTLs, origem CORS, driver de storage, diretório de uploads, tamanho mínimo de senha, credenciais do seed).
- **Auth**: login, refresh, logout, troca de senha; guard JWT global (deny-by-default): toda rota exige token, exceto as marcadas como públicas.
- **Profile**, **SocialLinks**, **Skills** (categorias + skills), **Projects**, **Experience**, **Education**, **Services**: CRUD admin + reorder; leitura pública.
- **Portfolio (público)**: agregado de leitura da home.
- **Media**: upload, listagem, deleção; depende de Storage.
- **Storage**: interface única com driver local; driver escolhido por env.
- **CV**: gera PDF sob demanda a partir dos mesmos serviços de leitura pública.
- **Contact**: DTO + endpoint 501.
- **I18n (lógica pura)**: resolução de `LocalizedText` para um locale com fallback (helper comum).

### Autenticação (stateless)
- **Access token**: JWT, TTL 15 min, enviado em `X-Authorization: Bearer <token>` (não em `Authorization`, que o CloudFront sobrescreve com a assinatura do OAC — ver `infra.md`), guardado em memória pelo front. Validação 100% stateless.
- **Refresh token**: JWT, TTL 7 dias, em cookie `httpOnly; Secure; SameSite=Strict`, com `Path` restrito ao endpoint de refresh. Rotação a cada uso (novo par emitido).
- **Revogação**: o admin tem `tokenVersion` (int). O refresh carrega a versão; o endpoint de refresh compara com o banco (única leitura de estado). Logout e troca de senha fazem `tokenVersion++`, invalidando todos os refresh tokens.
- Segredos distintos para access e refresh; algoritmo fixado na verificação.
- Senha com **argon2id**. Mensagem de erro de login genérica. Tamanho mínimo configurável por `PASSWORD_MIN_LENGTH` (padrão 5), aplicado na troca de senha e no seed.
- Sem signup público; admin criado por **seed idempotente** a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- MFA fora de escopo.

### Segurança transversal
- Helmet; CORS com allowlist (em prod, front e API no mesmo site via reverse proxy em `/api`, então CORS só importa em dev).
- `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted`, `transform`.
- `@nestjs/throttler`: limites estritos por IP em login, refresh, `POST /contact` e `GET /cv`, com contadores no Postgres (compartilhados entre instâncias). O limite global por IP fica no WAF (ver `infra.md`).
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
- **Profile** (singleton): name, headline `LT`, summary `LT`, about `LT[]` (parágrafos, JSONB), location `LT`, availability `LT`, workModality `LT`, spokenLanguages `LT`, email, phone, showEmail, showPhone, photoMediaId → Media.
- **SocialLink**: label, url.
- **SkillCategory**: name `LT`; **Skill**: name (não traduzível), categoryId → SkillCategory (cascade).
- **Project**: title `LT`, description `LT`, tags `String[]` (grafia original), repoUrl?, demoUrl?, featured, imageMediaId? → Media.
- **Experience**: role `LT`, company, bullets `LT[]` (JSONB), startDate, endDate? (null = atual), datePrecision (`MONTH|YEAR`).
- **Education**: title `LT`, institution, kind (`DEGREE|CERTIFICATION|COURSE`), startDate?, endDate?, datePrecision.
- **Service**: title `LT`, description `LT`.
- **Media**: key (única, gerada), mime, size, createdAt. Referências a Media com `onDelete: Restrict`.
- **ContactMessage**: name, email, message, createdAt, readAt?.
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
- `ETag` derivado do maior `updatedAt` do conteúdo + lang; responde 304 quando inalterado. Throttle estrito. Sem cache em disco.

### Contrato da API
Todas as rotas ficam sob o prefixo **`/api`** (em todos os ambientes); os caminhos abaixo o omitem por brevidade.

Público (sem auth):
- `GET /portfolio?lang=` — agregado: perfil, links sociais, categorias com skills, projetos featured, experiências, formação, serviços. Só itens visíveis, ordenados por `position`.
- `GET /projects?lang=&tags=&tagsMode=any|all&featured=&q=&sort=position|-createdAt&page=&pageSize=`.
- `GET /cv?lang=`.
- `POST /contact` — valida `{ name, email, message }` com limites de tamanho, passa pelo throttle e responde **501 Not Implemented**.

Auth:
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `PATCH /admin/account/password`.

Admin (`/admin/*`, JWT obrigatório):
- `GET|PUT /admin/profile`.
- Para cada coleção (`social-links`, `skill-categories`, `skills`, `projects`, `experiences`, `education`, `services`): `GET` (lista, com filtros), `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `PATCH /reorder` (recebe `[ids]`, reescreve `position` em transação).
- `POST /admin/uploads`, `GET /admin/media`, `DELETE /admin/media/:id`.

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
  - Auth: login ok/falha genérica; rota admin sem token → 401; refresh rotaciona; refresh após logout ou troca de senha → 401; senha nova abaixo do mínimo → 400; throttle de login → 429.
  - Validação: campo desconhecido → 400; `LocalizedText` sem `pt` → 400.
  - i18n: `?lang=en` com EN ausente cai para PT.
  - Visibilidade: item `visible=false` nunca aparece nas rotas públicas nem no CV.
  - Projects: filtros por tags (any/all, case-insensitive), `featured`, `q` com acento, ordenação e paginação.
  - Reorder: aplica ordem nova; ids inválidos não alteram nada (transação).
  - Media: upload com extensão falsa (magic bytes inválidos) → 400; excesso de tamanho → 413; delete de mídia referenciada → 409; `unused=true` lista só órfãs.
  - CV: responde `application/pdf`; segundo request com `If-None-Match` → 304; mudança de conteúdo muda o ETag.
  - Contact: payload inválido → 400; válido → 501.
  - Swagger: `/api/docs-json` servido fora de produção e indisponível com env de produção.
- **Unitário**: nenhum — a resolução de `LocalizedText` é uma linha e o fallback já é coberto pelo e2e de i18n.
- **Prior art**: nenhum — repositório novo; estes testes estabelecem o padrão.

## Out of Scope

- Implementação do canal de contato (envio de e-mail, persistência de mensagens, notificações, captcha).
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
