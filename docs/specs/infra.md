---
title: Infraestrutura AWS (API serverless, web estático, IaC com Terraform)
labels: [ready-for-agent]
status: ready
date: 2026-09-27
---

# Infraestrutura AWS

> Este projeto também é material de estudo: cada decisão traz o **porquê** e, quando relevante, o que mudaria com mais orçamento. Os valores de custo são estimativas em `us-east-1` para tráfego baixo e devem ser conferidos na calculadora da AWS.

## Problem Statement

A API (ver `backend.md`) e o futuro front em React só rodam localmente em Docker. Para o portfolio cumprir seu papel — ser acessado por recrutadores e demonstrar conhecimento sólido em nuvem — ele precisa estar publicado em um domínio próprio (`.info`, registrado na Hostinger), com HTTPS, deploy automatizado e infraestrutura reproduzível. As restrições são fortes: cerca de US$ 100 de crédito e um teto de **R$ 60/mês (~US$ 11)**, o que exclui a arquitetura "de livro" (ALB + ECS + RDS custaria US$ 40+/mês). O banco fica fora da AWS, no Neon, para tirar esse custo da conta. Além disso, o custo **não pode ser inflado por ataques** (DDoS, floods de requisição): num modelo pago por requisição, tráfego malicioso vira fatura.

## Solution

- **Um domínio, uma porta de entrada**: tudo em `https://<dominio>.info` passa por **uma distribuição CloudFront** com **WAF**, no **plano de preço fixo Free** do CloudFront — **sem cobrança excedente, mesmo sob ataque**; requisições bloqueadas nem contam na franquia.
  - `/` → SPA React (S3 privado).
  - `/api/*` → API: a mesma imagem Docker de hoje no **AWS Lambda** (Lambda Web Adapter), exposta por uma **Function URL que só aceita requisições assinadas pelo CloudFront**. Sem API Gateway.
  - `/uploads/*` → imagens (S3 privado).
- **Banco**: **Neon** (Postgres serverless, AWS `us-east-1`), plano gratuito — sem cobrança possível.
- **DNS e certificado**: Route 53 + ACM, coberto pelo plano. Tudo em **Terraform**, executado via Docker.
- **CI/CD**: GitHub Actions por **OIDC** (sem chaves AWS guardadas): testa, publica a imagem no ECR, migra o Neon, atualiza a Lambda e faz smoke test.
- **Defesa de custo em camadas**: WAF (rate limit por IP + regras gerenciadas) → cache na borda dos GETs públicos → origens inacessíveis sem o CloudFront → **disjuntor** que desliga a API se o orçamento estourar.
- **Operação**: Budgets, Cost Anomaly Detection, alarme de 5xx, backup diário do banco no S3.
- Custo esperado: **~US$ 0–1/mês** (o plano cobre CloudFront, WAF e Route 53).

## User Stories

### Visitante
1. As a visitor, I want to open the portfolio at `https://<dominio>.info`, so that I can see the owner's work on a real domain.
2. As a visitor, I want every page served over HTTPS with a valid certificate, so that the site is trustworthy.
3. As a visitor, I want the site to load fast from Brazil, so that I don't give up waiting.
4. As a visitor, I want deep links of the SPA (e.g. `/projetos`) to work on refresh, so that shared links don't break.
5. As a visitor, I want images and API on the same domain as the site, so that nothing is blocked by the browser (no CORS).
6. As a visitor, I want a missing image to return a real 404, not the SPA page, so that broken references are visible.
7. As a visitor, I want the CV download to work in production, so that I can keep it.
8. As a visitor, I accept that the first request after a long idle period may take ~1–3 s, so that the owner pays close to zero.
9. As a visitor, I want the site to stay up during an attack on the API, so that the portfolio is still viewable.

### Admin
10. As the admin, I want to log in and stay logged in on `https://<dominio>.info`, so that the refresh cookie works (same origin).
11. As the admin, I want uploads up to 4 MB to be accepted and stored durably, so that images survive deploys.
12. As the admin, I want login brute-force limited at the edge and in the app, even with many Lambda instances, so that my account stays protected.
13. As the admin, I want my real IP (never a client-forged header) used for rate limiting, so that attackers can't bypass it.
14. As the admin, I want my private data never cached by the CDN, so that no one else can see it.

### Operador / desenvolvedor
15. As the operator, I want attack traffic to never turn into a bill (flat-rate CDN, blocked requests free), so that a DDoS can't bankrupt the project.
16. As the operator, I want the API origin unreachable except through CloudFront, so that nobody can bypass the WAF.
17. As the operator, I want a kill switch that disables the API when the budget is exceeded, so that spending has a real ceiling.
18. As the operator, I want to re-enable the API with one command, so that recovery is trivial.
19. As the operator, I want the whole AWS setup declared in Terraform, so that it is reproducible and reviewable.
20. As the operator, I want to run Terraform and the AWS CLI through Docker via make targets, so that I install nothing locally.
21. As the operator, I want Terraform state stored remotely in S3 with locking and encryption, so that state is safe and never corrupted by concurrent runs.
22. As the operator, I want a one-time bootstrap for the state bucket, so that the chicken-and-egg problem is solved explicitly.
23. As the operator, I want to authenticate locally via IAM Identity Center (SSO), so that I never create long-lived access keys.
24. As the operator, I want DNS for the domain hosted in Route 53, so that the apex can point to CloudFront and certificates validate automatically.
25. As the operator, I want clear instructions to switch the nameservers at Hostinger, so that the domain delegation is a single manual step.
26. As the operator, I want secrets (JWT keys, database URLs) kept in SSM Parameter Store and never in git or GitHub, so that there is one source of truth.
27. As the operator, I want JWT secrets generated by Terraform, so that nobody has to invent or copy them.
28. As the operator, I want budget alerts by email at 50%, 80% and 100% of US$ 11 (plus forecast), so that I learn about cost before it hurts.
29. As the operator, I want cost anomaly detection enabled, so that unusual spend is flagged automatically.
30. As the operator, I want every resource tagged with project and environment, so that I can filter costs.
31. As the operator, I want an email alarm when visitors start getting errors, so that I know production is broken.
32. As the operator, I want API logs in CloudWatch with a short retention and no per-request noise, so that I can debug without paying for logs.
33. As the operator, I want a daily database backup in S3 with automatic expiry, so that content can be restored even beyond Neon's free restore window.
34. As the operator, I want the restore procedure documented and tested once, so that backups are known to work.
35. As a developer, I want every push to `main` touching the API to be tested, built, migrated and deployed automatically, so that deploys are boring.
36. As a developer, I want CI to authenticate to AWS with OIDC and least-privilege roles, so that a leaked workflow cannot do more than its job.
37. As a developer, I want migrations to run against Neon's direct connection before the new code goes live, so that code never runs against an old schema.
38. As a developer, I want a post-deploy smoke test, so that a broken deploy is detected immediately.
39. As a developer, I want the same image and the same URL paths locally and in production, so that behavior matches.
40. As a developer, I want the local Postgres major version to match Neon's, so that version drift doesn't cause production-only bugs.
41. As a developer, I want the web hosting ready before the web app exists (placeholder page), so that the domain works from day one.
42. As a developer, I want `terraform fmt`/`validate` in a make target, so that infra code is checked like app code.
43. As a reader of the repo, I want an ADR explaining why the API runs on Lambda behind CloudFront and when to move it, so that the trade-off is explicit.

## Implementation Decisions

### Conta, região e acesso
- **Conta no Paid plan** da AWS (os créditos continuam valendo). Por quê: contas no plano Free da AWS não podem assinar os planos de preço fixo do CloudFront.
- **Região única `us-east-1`**. Por quê: é a mais barata, é obrigatória para certificados e web ACLs usados pelo CloudFront, e a latência não pesa (o CloudFront atende a partir de edges no Brasil). O Neon é criado na mesma região.
- **Acesso humano via IAM Identity Center (SSO)**, com login pelo AWS CLI em container. Por quê: credenciais temporárias; nenhuma access key de longa duração no disco.
- **Um só ambiente (produção)**. O Terraform recebe nome de ambiente como variável, mas staging não é construído.
- **Tags padrão** (`project`, `env`, `managed-by=terraform`) aplicadas por `default_tags` do provider.

### Terraform
- Código no diretório `infra/` do monorepo, com duas raízes:
  - **bootstrap**: bucket de estado (versionado, TLS obrigatório, acesso público bloqueado). Aplicado uma vez, com estado local — resolve o "ovo e galinha" de onde guardar o estado do próprio Terraform.
  - **main**: todo o resto, com backend S3 e **lock nativo do S3** (`use_lockfile`, Terraform ≥ 1.10), sem DynamoDB.
- Arquivos por assunto (DNS, web/CDN, WAF, API, storage, CI, observabilidade), **sem módulos próprios**: um único consumidor não justifica a abstração.
- Versões fixadas (Terraform e providers aws, random, archive); lockfile com hashes para Linux e macOS.
- **Estado é sensível**: contém os segredos gerados e lidos (JWT, URL do banco).
- Executado via imagem Docker oficial do Terraform, com targets no Makefile, rodando como o usuário do host.
- Infra é aplicada localmente pelo operador; plano/aplicação em CI fica fora de escopo.
- **O plano de preço fixo não tem recurso no provider Terraform** (a API da AWS é de setembro/2026; só CloudFormation/CDK suportam): a assinatura é um passo único via AWS CLI (`make plan-subscribe`), com os ARNs vindos de um output do Terraform.

### DNS e certificado
- **Route 53 hosted zone** para `<dominio>.info`, anexada ao plano do CloudFront (sem custo). Por quê: ALIAS no domínio raiz apontando para o CloudFront (CNAME no apex é proibido pelo DNS) e validação automática do certificado. O registro continua na Hostinger; lá só se trocam os nameservers.
- **ACM**: um único certificado para `<dominio>.info` (a API vive em `/api`, não em subdomínio).

### CloudFront — uma distribuição para tudo
- **Plano de preço fixo Free**: 1M requisições e 100 GB/mês de franquia, CDN, WAF (até 5 regras), proteção DDoS, Route 53 e TLS por US$ 0. **Sem cobrança excedente**: passar da franquia (inclusive por ataque) não gera fatura; requisições bloqueadas pelo WAF ou pela proteção DDoS não contam. Em excesso prolongado por meses, a AWS pode reduzir a performance — nunca cobrar.
- Restrições do plano Free respeitadas: só **políticas gerenciadas** (cache, origin request, response headers), até 5 comportamentos de cache (usamos 3), web ACL exclusivo da distribuição.
- **Comportamentos**:
  - padrão → bucket do web, cache otimizado, **CloudFront Function** de rewrite do SPA (rotas sem extensão → `index.html`). Por quê não "custom error responses": valeriam para a distribuição inteira e transformariam um upload inexistente em página do SPA com status 200.
  - `/uploads/*` → bucket de uploads (objetos sob o prefixo `uploads/`), cache longo (keys UUID imutáveis).
  - `/api/*` → Function URL da Lambda, todos os métodos, política `UseOriginCacheControlHeaders-QueryStrings` (cacheia só o que a API marca como cacheável; TTL padrão 0), origin request `AllViewerExceptHostHeader` (a Function URL precisa ver o próprio host) e uma **CloudFront Function que grava o IP real do visitante** em `x-viewer-ip`, sobrescrevendo qualquer valor enviado pelo cliente.
- **Origens privadas por OAC**: buckets e Function URL só respondem a requisições assinadas por esta distribuição. O CloudFront tem `s3:ListBucket` para que chaves inexistentes respondam 404 (não 403); ele nunca lista.
- **Cabeçalhos de segurança** pela política gerenciada `SecurityHeadersPolicy` (HSTS, nosniff, frame options, referrer policy). CSP fica para o `apps/web`.
- `PriceClass_All`: só ela inclui edges na América do Sul.
- Mídia apagada pode continuar no cache até o TTL; aceitável (keys nunca reutilizadas).
- Enquanto o `apps/web` não existe, o Terraform publica um `index.html` provisório (depois, o pipeline do web é dono do bucket).

### WAF (5 regras, todas incluídas no plano)
1. **Reputação de IP** (regra gerenciada da AWS): botnets e scanners conhecidos.
2. **Rate limit em `/api/auth/*`**: 20 requisições por IP a cada 5 min.
3. **Rate limit geral**: 1000 requisições por IP a cada 5 min (uma visita consome ~10–20).
4. **Common Rule Set** (OWASP), com a regra de tamanho de corpo (8 KB) só contando — uploads têm até 4 MB.
5. **Known Bad Inputs** (Log4j e afins).
- Limitação conhecida: um ataque distribuído (muitos IPs, cada um abaixo do limite) passa pelo rate limit; aí entram o cache na borda, a franquia sem excedente e o disjuntor.

### API — Lambda + Function URL (sem API Gateway)
- **Lambda com imagem de contêiner**, **arm64** (Graviton), 1024 MB (CPU escala com memória), timeout 15 s, sem provisioned concurrency.
- **Lambda Web Adapter** na imagem: traduz eventos em HTTP para o servidor Nest/Express existente — mesma imagem local e na Lambda. Readiness por **TCP** (o cold start não depende do banco).
- **Function URL com `AWS_IAM`** + OAC do CloudFront: quem descobrir a URL recebe 403 **sem a função executar** (sem custo). Permissões `lambda:InvokeFunctionUrl` e `lambda:InvokeFunction` (esta só via Function URL), restritas à distribuição.
- Por quê não API Gateway: cobra cada requisição que recebe (inclusive ataque) e, como origem do CloudFront, poderia ser acessado diretamente por quem descobrisse o endpoint, pulando o WAF.
- **Consequências para clientes** (o futuro `apps/web`):
  - requisições com corpo (POST/PUT/PATCH) enviam **`x-amz-content-sha256`** com o SHA-256 do corpo (exigência da Lambda para payloads assinados pelo OAC) — Web Crypto no navegador, num wrapper de `fetch`;
  - o token do admin vai em **`X-Authorization: Bearer …`**: o CloudFront substitui `Authorization` pela própria assinatura;
  - upload envia o **arquivo cru como corpo** (não multipart), para o hash ser calculável.
- **Sem VPC** (Neon e serviços AWS acessíveis com TLS/IAM; VPC exigiria NAT de ~US$ 32/mês).
- **Logs**: formato JSON, nível de sistema `WARN` (sem as linhas START/END/REPORT por invocação — um flood não vira fatura de CloudWatch), retenção de 14 dias.
- **O Terraform cria a função, mas não gerencia a versão da imagem** (ignora `image_uri`): quem troca a imagem é o pipeline — um `apply` nunca reverte um deploy.
- **ECR** com tags imutáveis, lifecycle das últimas 10 imagens e scan na publicação.

### Adaptações na API (código)
- **Prefixo global `/api`** em todos os ambientes (local e produção usam os mesmos caminhos; Swagger em `/api/docs` fora de produção; cookie de refresh em `/api/auth/refresh`).
- **Token em `X-Authorization`** (ver acima); Swagger documenta o esquema.
- **Upload com o arquivo cru no corpo** (`Content-Type: image/*`), limite **4 MB** (payload da Lambda é 6 MB e binários trafegam em base64, +33%). O tipo real continua vindo dos magic bytes.
- **Cache**: toda resposta da API sai com `Cache-Control: no-store`, exceto GETs públicos (`/api/portfolio`, `/api/projects`, `/api/cv`) com `public, max-age=60` — um flood da mesma URL é respondido pela borda sem invocar a Lambda; nada do admin é cacheado.
- **IP do cliente** para rate limit vem de um header confiável configurável (`CLIENT_IP_HEADER=x-viewer-ip` em produção; socket local em dev). `TRUST_PROXY`/`X-Forwarded-For` deixam de ser usados: as entradas iniciais do XFF são do cliente.
- **Driver S3 do storage** (`STORAGE_DRIVER=s3`), com credenciais da role da Lambda (sem chaves em env). O banco guarda só a key; a URL pública vem de `UPLOADS_PUBLIC_URL`.
- **Endpoint `GET /api/health`** público (app + `SELECT 1`); usado só pelo smoke test (sem sonda periódica, para o Neon hibernar).
- **Rate limit da aplicação persistido no Postgres**, nas rotas sensíveis (login, refresh, contato, CV): instâncias da Lambda não compartilham memória. O limite genérico fica no WAF.
- **Migrations fora do runtime**: `prisma migrate deploy` no pipeline, pela conexão **direta** do Neon. O Prisma CLI ainda entra no `node_modules` da imagem (peer opcional do `@prisma/client` resolvido no lockfile), sem uso em runtime; removê-lo fica para quando o cold start medido justificar.
- **Conexões Neon**: app usa a string **pooled** (PgBouncer); migrations e backup, a **direta**. TLS obrigatório; certificados públicos.
- **Postgres 18** local, no CI e no Neon.

### Segredos
- **SSM Parameter Store (SecureString, gratuito)** é a fonte única:
  - JWT access/refresh: gerados pelo Terraform (`random_password`) e gravados no SSM.
  - URLs do Neon (pooled e direta): gravadas no SSM por `make db-secrets` (valor digitado, nunca em arquivo).
- A Lambda recebe os valores como variáveis de ambiente (criptografadas em repouso), lidas do SSM pelo Terraform. Secrets Manager não compensa aqui (US$ 0,40/segredo/mês e latência no cold start).
- O CI lê a URL direta do SSM via OIDC — **nenhum segredo de banco no GitHub**; o GitHub guarda só identificadores (ARNs, nomes).

### CI/CD (GitHub Actions)
- **Provedor OIDC do GitHub**; roles com trust restrito ao repositório e à branch `main`, permissões mínimas por workflow (API: push no ECR, update da função, leitura da URL direta; backup: leitura da URL direta e escrita no bucket de backups; web: sync do bucket e invalidação do CDN — pronta para o `apps/web`).
- **Workflow da API**: lint + e2e (Postgres 18 como serviço) → build **arm64** (runner ARM nativo) → push no ECR → `migrate deploy` → atualização da Lambda → smoke test. Deploys serializados e nunca cancelados no meio.
- **Workflow de backup** (diário): `pg_dump` pela conexão direta → bucket de backups (lifecycle de 30 dias).
- **Workflow do web**: fora de escopo (nasce com o `apps/web`).

### Observabilidade e custo
- **Disjuntor de custo**: um tópico SNS exclusivo aciona uma Lambda mínima que zera a concorrência reservada da API. O site estático segue no ar; a API responde erro até `make api-enable`. Dois gatilhos:
  - **rápido**: alarme na soma de `Duration` da API acima de 90 s de compute em 5 min (métricas chegam em minutos). Calibrado para que, mesmo sustentado logo abaixo do limite o mês inteiro, o custo fique dentro do orçamento (~US$ 5 após a cota gratuita da Lambda);
  - **reserva**: Budget a 100% (real), cujos dados de cobrança chegam com horas, até um dia, de atraso.
  - O Terraform ignora a concorrência reservada da função: um `apply` nunca religa a API por engano depois do disjuntor.
- **AWS Budgets**: US$ 11/mês, e-mail em 50/80/100% (real) e 100% (previsto). O Budget sozinho **alerta, não bloqueia**.
- **Cost Anomaly Detection** com e-mail diário.
- **Alarmes** → SNS → e-mail: `5xxErrorRate` do CloudFront (≥ 10% em 5 min) e o disparo do disjuntor.
- **Endurecimento**: todos os buckets recusam acesso sem TLS; registro **CAA** no DNS (só a Amazon emite certificados para o domínio); ECR guarda as 5 imagens mais recentes (~1 GB cada).
- **Riscos residuais aceitos** (documentados, sem custo fixo para eliminar):
  - a role de deploy do CI lê a configuração da Lambda (incluindo segredos nas variáveis de ambiente) — equivalente ao acesso que ela já tem ao banco para migrar; o trust OIDC restringe a role ao `main` deste repositório;
  - um ataque distribuído com caminhos aleatórios gera leituras 404 no S3 (US$ 0,40 por milhão), não absorvidas pelo cache;
  - a app conecta no Neon com o usuário dono do banco; um usuário sem DDL só para a app é melhoria futura.
- Estimativa mensal: CloudFront, WAF e Route 53 cobertos pelo plano (US$ 0); Lambda, S3, ECR, CloudWatch e SNS em centavos ou nas cotas gratuitas; **total ~US$ 0–1**. Custo residual sob ataque distribuído: invocações da Lambda que passarem pelo WAF e pelo cache — limitado pelo disjuntor.

### Makefile (targets de nuvem)
- `aws-configure`, `aws-login`, `tf-bootstrap`, `tf-init`, `tf-plan`, `tf-apply`, `aws` e `tf` (comandos avulsos), `tf-fmt`, `ci-lint`, `db-secrets`, `seed-prod` (admin de produção no Neon), `api-publish` (primeira imagem / fallback), `plan-subscribe` (plano Free do CloudFront), `api-enable` (religa a API após o disjuntor), `smoke`. Todos via containers, como o usuário do host.

## Testing Decisions

- **Um bom teste** verifica comportamento observável por fora (HTTP), não detalhes internos. Vale para a API e para a infraestrutura publicada.
- **Seam 1 — e2e HTTP da API**, cobrindo as adaptações:
  - rate limit compartilhado entre instâncias (contador no Postgres);
  - chave do rate limit vem do header confiável, ignorando `X-Forwarded-For` forjado;
  - token aceito só em `X-Authorization`;
  - upload cru acima de 4 MB → 413; corpo que não é imagem → 400;
  - `/api/health` 200.
  - Driver S3, OAC, WAF e cache de borda não são testáveis sem a AWS; ficam no smoke test.
- **Seam 2 — smoke test pós-deploy** (target `smoke` e etapa do pipeline): `/api/health` 200; `/api/portfolio` 200 com `Cache-Control` público; `/api/admin/profile` 401 com `no-store`; `/api/docs` 404; raiz 200 com HSTS; deep link do SPA 200; `/uploads/<inexistente>` 404; HTTP → HTTPS 301.
- **Checagem estática**: `terraform fmt`/`validate` (target `tf-fmt`) e actionlint + shellcheck nos workflows (target `ci-lint`).
- Restore do backup executado manualmente uma vez em um branch do Neon e documentado.

## Out of Scope

- Aplicação `apps/web` e seu workflow de deploy (apenas hosting, role e o contrato de cliente — hash do corpo, `X-Authorization`, upload cru — definidos).
- Ambiente de staging e branches de preview do Neon.
- Terraform em CI (plan em PR / apply automático).
- Planos pagos do CloudFront (CAPTCHA, desafio JavaScript, bot control avançado) — upgrade para o Pro se ataques exigirem.
- Provisioned concurrency / aquecimento da Lambda.
- Multi-região, Multi-AZ, disaster recovery além do backup diário.
- Registro de `www.` e redirecionamentos de domínio.
- Gerenciamento do Neon via Terraform.
- Monitoramento sintético periódico (impediria o Neon de hibernar).

## Further Notes

- **Caminho de evolução** (ADR 0001): com orçamento maior ou tráfego constante, a API vai para ECS Fargate atrás de um ALB (como nova origem do mesmo CloudFront), mantendo Neon ou indo para RDS; a imagem é a mesma. Gatilhos: cold start inaceitável, uploads > 4 MB, tráfego contínuo.
- Esta spec substitui, para produção, os seguintes pontos de `backend.md`: caminhos sob `/api`, token em `X-Authorization`, upload cru de até 4 MB, IP do cliente por header confiável, rate limit global no WAF e migrations no pipeline.
- Entre o `terraform apply` e o `make plan-subscribe`, o WAF é cobrado pelo preço normal (centavos por algumas horas); rode os dois em sequência.
- O domínio `.info` costuma ter renovação mais cara que o primeiro ano na Hostinger; isso fica fora do orçamento AWS. Se o DNSSEC estiver ativo na Hostinger, desative antes de trocar os nameservers.
- Novas contas AWS podem ter cota baixa de concorrência da Lambda; suficiente para este tráfego (e zerar a concorrência, como faz o disjuntor, é sempre permitido).
- Contas novas podem já ter o monitor padrão de anomalias da AWS (limite de um por tipo); nesse caso ele é importado para o Terraform.
- Passos manuais inevitáveis (documentados em `infra/README.md`): ativar IAM Identity Center, trocar nameservers na Hostinger, criar o projeto no Neon, assinar o plano do CloudFront, confirmar e-mails do SNS.
