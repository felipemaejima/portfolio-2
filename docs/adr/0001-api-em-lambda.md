# ADR 0001 — API em AWS Lambda atrás do CloudFront, com banco no Neon

- **Status**: aceito (revisado em 2026-09-27: API Gateway substituído por Function URL + CloudFront com plano de preço fixo)
- **Data**: 2026-09-27

## Contexto

O orçamento é de ~US$ 11/mês (R$ 60) sobre US$ 100 de crédito. A arquitetura "padrão" para uma API em container
(ALB + ECS Fargate + RDS) custaria US$ 40+/mês, com ALB (~US$ 16) e RDS (~US$ 14) cobrando mesmo parados. O tráfego
esperado é baixo e intermitente. O banco foi para o Neon (Postgres serverless, fora da AWS), então a API não precisa
de VPC.

Um segundo requisito surgiu: **ataques não podem inflar o custo**. Serviços cobrados por requisição (API Gateway,
CloudFront pago por uso) transformam um flood em fatura.

Opções avaliadas para a API:

| Opção | Custo/mês | Limitações |
|---|---|---|
| Lambda + API Gateway HTTP API | ~US$ 0–1 | Cobra cada requisição recebida, inclusive ataques; como origem do CloudFront, pode ser acessado diretamente |
| **Lambda + Function URL (IAM) atrás do CloudFront com OAC** | ~US$ 0–1 | Cliente envia hash do corpo; token fora de `Authorization`; upload cru |
| EC2 `t4g.micro` | ~US$ 10 | Paga 24h; SO sob nossa responsabilidade |
| Fargate sem ALB | ~US$ 11 | IP muda a cada deploy; sem ponto estável de entrada |

## Decisão

- API no **Lambda com imagem de contêiner (arm64)** via **Lambda Web Adapter** (servidor Nest/Express inalterado).
- Exposta por uma **Function URL com autenticação IAM**, acessível apenas pelo **CloudFront via OAC**: requisições que
  não vêm da distribuição são recusadas antes de executar a função.
- Site, API (`/api/*`) e uploads numa **única distribuição CloudFront no plano de preço fixo Free**, com **WAF**
  (reputação de IP, rate limit por IP, regras gerenciadas): sem cobrança excedente, requisições bloqueadas não contam.
- **Disjuntor**: alarme de compute da API (dispara em minutos) ou Budget estourado (dados de cobrança atrasam) → SNS
  → Lambda que zera a concorrência da API.
- Banco no **Neon** (plano gratuito) via conexão pooled.

## Consequências

- Custo praticamente zero em repouso e **limitado sob ataque**: a borda absorve (WAF, plano fixo), a origem não
  pode ser contornada, e o disjuntor corta o que sobrar.
- A mesma imagem roda localmente, no Lambda e, se preciso, em ECS.
- Clientes da API seguem um contrato próprio: `x-amz-content-sha256` em requisições com corpo, token em
  `X-Authorization`, upload como arquivo cru.
- Primeira requisição após ociosidade pode levar ~1–3 s (Lambda + Neon acordando). Aceito para um portfolio.
- Upload limitado a 4 MB (payload de 6 MB em base64).
- Rate limit da aplicação precisa de armazenamento compartilhado (Postgres); o IP vem de um header gravado na borda.
- Migrations rodam no pipeline, não no start do container.
- O plano do CloudFront ainda não tem recurso no Terraform: assinatura por AWS CLI.

## Quando revisitar

Migrar a API para **ECS Fargate + ALB** (como nova origem do mesmo CloudFront) se ocorrer qualquer um:
- cold start se tornar inaceitável;
- necessidade de uploads maiores que 4 MB ou conexões longas (WebSocket/streaming);
- tráfego contínuo em que o custo por requisição supere o de uma tarefa sempre ligada;
- ataques exigirem recursos dos planos pagos (CAPTCHA, desafio JavaScript) — neste caso, primeiro subir o plano do
  CloudFront para Pro (US$ 15/mês), sem mudar a arquitetura.
