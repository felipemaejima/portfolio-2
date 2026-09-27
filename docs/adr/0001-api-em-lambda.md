# ADR 0001 — API em AWS Lambda (imagem de contêiner) com banco no Neon

- **Status**: aceito
- **Data**: 2026-09-27

## Contexto

O orçamento é de ~US$ 11/mês (R$ 60) sobre US$ 100 de crédito. A arquitetura "padrão" para uma API em container (ALB + ECS Fargate + RDS) custaria US$ 40+/mês, com ALB (~US$ 16) e RDS (~US$ 14) cobrando mesmo parados. O tráfego esperado é baixo e intermitente (recrutadores, o próprio admin). O banco foi movido para o Neon (Postgres serverless, fora da conta AWS), então a API não precisa de VPC.

Opções avaliadas para a API:

| Opção | Custo/mês | Limitações |
|---|---|---|
| Lambda + API Gateway HTTP API | ~US$ 0–1 | Cold start ~1–2 s; payload de 6 MB; memória efêmera por instância |
| EC2 `t4g.micro` | ~US$ 10 | Paga 24h; SO sob nossa responsabilidade |
| Fargate sem ALB | ~US$ 11 | IP muda a cada deploy; sem ponto estável de entrada |

## Decisão

Rodar a API no **Lambda com imagem de contêiner (arm64)**, usando o **Lambda Web Adapter** para executar o servidor Nest/Express sem alterações, exposto por um **API Gateway HTTP API** com domínio próprio. Banco no **Neon** via conexão pooled.

## Consequências

- Custo praticamente zero em repouso; os créditos cobrem o projeto por muito mais tempo que o previsto.
- A mesma imagem roda localmente, no Lambda e, se preciso, em ECS — sem código acoplado ao Lambda.
- Primeira requisição após ociosidade pode levar ~1–3 s (Lambda + Neon acordando). Aceito para um portfolio.
- Upload limitado a 4 MB (payload de 6 MB em base64).
- Rate limit precisa de armazenamento compartilhado (Postgres) e throttling no API Gateway, pois a memória não é compartilhada entre instâncias.
- Migrations passam a rodar no pipeline, não no start do container.

## Quando revisitar

Migrar para **ECS Fargate + ALB** (mantendo Neon ou indo para RDS) se ocorrer qualquer um:
- cold start se tornar inaceitável para a experiência do site;
- necessidade de uploads maiores que 4 MB ou de conexões longas (WebSocket/streaming);
- tráfego contínuo em que o custo por requisição supere o de uma tarefa sempre ligada;
- orçamento deixar de ser a restrição principal.
