# Portfolio

Site pessoal com painel administrativo. Todo o conteúdo (perfil, projetos, experiência, formação, habilidades,
serviços, links) vem de uma API e é editado no admin, em português e inglês. O CV em PDF é gerado a partir dos mesmos
dados, então nunca fica desatualizado.

Em produção: `https://felipemaejima.com` (site), `/admin` (painel) e `/api` (API).

## Funcionalidades

**Site público**
- Página inicial com todo o conteúdo em uma única requisição (`GET /api/portfolio`).
- PT/EN. O que não tiver tradução em inglês cai para o português.
- Página de projetos com filtro por tags (qualquer uma ou todas), busca por texto sem acentos, ordenação e paginação.
- CV em PDF sob demanda, no idioma escolhido, com cache por ETag.
- Formulário de contato: só a estrutura (validação e rate limit). A API responde `501` até existir um canal.

**Painel admin (`/admin`)**
- Login por e-mail e senha. Não existe cadastro: o único admin é criado por seed.
- CRUD de todas as seções, com reordenação atômica, itens ocultos (rascunho) e campos `{pt, en}` lado a lado.
- Upload de imagens validado pelo conteúdo real do arquivo (magic bytes), até 4 MB. Mídia ainda em uso não pode ser
  apagada.
- Troca de senha, que encerra todas as sessões.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm 12 workspaces, Node 24 |
| API (`apps/api`) | NestJS 12, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 18, zod, argon2id, JWT, pdfmake, Swagger/OpenAPI |
| Web (`apps/web`) | React 19, Vite 8, React Router (SPA; o admin é carregado sob demanda) |
| Qualidade | TypeScript 6, oxlint, Jest 30 (e2e contra Postgres real), Vitest (contrato do cliente da API) |
| Ambiente local | Docker Compose + Makefile. Não precisa de Node, pnpm nem Postgres instalados |
| Nuvem | AWS (CloudFront, WAF, Lambda, S3, ECR, Route 53, SSM…), Neon (Postgres serverless), Terraform |
| CI/CD | GitHub Actions com OIDC (sem chaves AWS guardadas no GitHub) |

## Rodando localmente

Requisitos: Docker e `make`.

```sh
cp .env.example .env   # valores de dev; nunca reutilize fora da sua máquina
make up                # postgres, api (hot reload) e web
make migrate           # aplica as migrations
make seed              # cria o admin com ADMIN_EMAIL / ADMIN_PASSWORD do .env
```

- Site: http://localhost:5173 (admin em `/admin`)
- API: http://localhost:3000/api (Swagger em `/api/docs`, só fora de produção)

Comandos do dia a dia (`make help` lista todos):

| Comando | O que faz |
|---|---|
| `make test` | suíte e2e da API contra um Postgres descartável (`t=<padrão>` filtra) |
| `make test-web` | testes do cliente da API no front |
| `make lint` | typecheck + oxlint (api e web) |
| `make migration name=x` | cria uma migration a partir do schema |
| `make openapi` | exporta `apps/api/openapi.json` |
| `make studio` | Prisma Studio |
| `make reset-db` | recria o banco de dev |

## Arquitetura

```
                        felipemaejima.com (Route 53 + ACM)
                                      │
                   CloudFront (plano fixo Free) + WAF
               ┌──────────────────────┼───────────────────────┐
               │ /*                   │ /uploads/*            │ /api/*
         S3 (site React)        S3 (imagens)         Lambda Function URL (IAM, só via OAC)
                                                              │
                                              Lambda arm64: imagem Docker do Nest
                                               (Lambda Web Adapter), segredos do SSM
                                                              │
                                                     Neon Postgres (pooled)
```

**Por que assim.** O orçamento é de ~R$ 60/mês, e ataques não podem virar fatura.
- **Uma distribuição CloudFront** serve site, imagens e API no mesmo domínio: sem CORS e com um único ponto de defesa.
  Ela fica no **plano de preço fixo Free**, que não cobra excedente e não conta requisições bloqueadas.
- **WAF** com reputação de IP, rate limit por IP e regras gerenciadas da AWS.
- **API no Lambda** (e não ECS/EC2/RDS): custo ~zero parado. A **Function URL exige assinatura IAM**, e só o
  CloudFront (via OAC) assina. Quem tentar chamar a Lambda direto é recusado antes de a função rodar.
  - Por causa do OAC, requisições com corpo enviam `x-amz-content-sha256` (hash do corpo), e o token vai em
    `X-Authorization`, já que `Authorization` é usado pela assinatura.
- **Mesma imagem Docker** local e na Lambda, via Lambda Web Adapter. O Nest roda como um servidor Express comum.
- **Banco no Neon** (fora da AWS, plano gratuito), o que dispensa VPC e RDS.
- **Disjuntor de custo**: um alarme de uso da API ou o Budget estourado disparam SNS → uma Lambda que zera a
  concorrência da API. `make api-enable` religa.
- **Segredos** (URL do banco, chaves JWT) ficam no SSM Parameter Store como SecureString e são lidos pela API no boot.
  Não ficam em variáveis de ambiente, nem no Terraform, nem no GitHub.

Detalhes e trade-offs: [ADR 0001](docs/adr/0001-api-em-lambda.md) e [spec de infra](docs/specs/infra.md).

### Segurança da API (resumo)
- Negação por padrão: toda rota exige JWT, exceto as marcadas como públicas.
- Access token curto no header + refresh token rotativo em cookie `httpOnly`, `Secure`, `SameSite=Strict`, restrito a
  `/api/auth/refresh`. Logout e troca de senha revogam tudo (`tokenVersion`).
- Senhas com argon2id. Login com erro genérico e rate limit (contadores no Postgres, IP vindo de um header gravado
  pela borda, que o cliente não consegue forjar).
- Payloads validados (campos desconhecidos são recusados), `Cache-Control: no-store` por padrão e CSP no front.

## AWS e Terraform

Toda a infraestrutura é código em [`infra/`](infra/), aplicada pelo Terraform rodando em container (`make tf-*`):
- `infra/bootstrap`: o bucket S3 que guarda o *state* do Terraform (versionado, com lock nativo).
- `infra/main`: todo o resto (DNS, certificado, CloudFront, WAF, S3, ECR, Lambda, SSM, alarmes, Budget, CloudTrail,
  Access Analyzer, backups e as roles do GitHub).

Acesso humano pelo **IAM Identity Center (SSO)**, com credenciais temporárias (`make aws-login`). Não existem access
keys de longa duração.

Alguns passos ficam fora do Terraform de propósito:
- Os valores do banco são digitados em `make db-secrets` e nunca aparecem em state nem em plano.
- A assinatura do plano do CloudFront (`make plan-subscribe`) ainda não tem recurso no provider.

Passo a passo da primeira implantação, operação e restauração de backup: [`infra/README.md`](infra/README.md).

## CI/CD

| Workflow | Quando | O que faz |
|---|---|---|
| `api.yml` | push na `main` em `apps/api` | lint + e2e → imagem arm64 no ECR → migrations no Neon → atualiza a Lambda → smoke |
| `web.yml` | push na `main` em `apps/web` | lint + testes → build → S3 → invalida o CloudFront |
| `backup.yml` | diário | `pg_dump` do Neon para um bucket S3 |

O GitHub obtém credenciais temporárias por **OIDC**. Cada role confia só neste repositório (IDs imutáveis) e no
environment `production`, com permissões mínimas: a de deploy da API, por exemplo, não lê os segredos da aplicação.
As actions são fixadas por SHA.

## Desenvolvimento com IA

O projeto foi desenvolvido com o **Claude Code** (Anthropic) como par de programação. Eu defino o que construir,
reviso e decido. A IA investiga, propõe e implementa.

1. **Especificação antes do código.** Cada frente (backend, infra) começou com uma sessão de perguntas
   (`/grill-me`), em que a IA questiona requisitos, casos de borda e trade-offs até não sobrar ambiguidade. O
   resultado vira uma spec versionada (`/to-spec`), que é o contrato da implementação: [backend](docs/specs/backend.md)
   e [infra](docs/specs/infra.md). Decisões arquiteturais viram ADR.
2. **Implementação guiada pela spec**, com regras explícitas:
   - simples e modular;
   - sem abstrações especulativas nem testes inflados;
   - versões mais recentes compatíveis.
3. **Revisão humana de tudo.** A IA não faz commit sem pedido. As alterações ficam no working tree para eu revisar e
   commitar.
4. **Nada sensível é executado pela IA.** Ela não lê segredos nem roda `terraform apply`, deploys ou qualquer mudança
   em produção. Entrega o comando pronto e explica o efeito, e eu executo e compartilho só a saída não sensível.
5. **Validação contra fontes oficiais.** Decisões de segurança e comandos AWS são conferidos na documentação oficial
   antes de aplicar. Erros reais de deploy foram diagnosticados a partir da saída, sem suposições.
6. **Revisões periódicas** de segurança e de coerência entre código e documentação: permissões IAM, actions fixadas
   por SHA, segredos fora de variáveis de ambiente, docs alinhadas ao que roda.

A IA acelera a pesquisa e a escrita. As decisões, a revisão e a responsabilidade pelo que vai para produção são
humanas.

## Estrutura

```
apps/api      API NestJS (módulos por seção do portfolio, auth, mídia, CV, storage local/S3)
apps/web      site público + admin (React)
infra/        Terraform (bootstrap + main) e guia de operação
docs/specs    specs de backend e infra
docs/adr      decisões de arquitetura
docs/ui       referência visual original
.github/      workflows de CI/CD
```
