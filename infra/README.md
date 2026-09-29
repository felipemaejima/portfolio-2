# Infraestrutura (AWS + Neon)

Decisões e porquês: [`docs/specs/infra.md`](../docs/specs/infra.md) e [ADR 0001](../docs/adr/0001-api-em-lambda.md).
Tudo roda em containers via `make` — não é preciso instalar AWS CLI nem Terraform.

```
infra/
  bootstrap/   bucket do estado do Terraform (aplicado uma vez, estado local)
  main/        todo o resto (estado remoto no bucket acima)
  smoke.sh     checagens pós-deploy contra produção
```

## Primeira implantação

A ordem importa: alguns recursos dependem de passos fora da AWS (DNS na Hostinger, projeto no Neon, primeira imagem).
Pré-requisitos: conta AWS no **Paid plan** (os créditos continuam valendo; o plano de preço fixo do CloudFront não
aceita contas no Free plan), Docker e o domínio comprado na Hostinger.

### 0. Proteger a conta root
A root tem poder total sobre a conta (inclusive fechá-la) e não pode ser restringida. Ela não é usada no dia a dia.

1. Entre como root e ative **MFA** (app autenticador ou chave de segurança) em *Security credentials*.
2. Confira que a root **não tem access keys** (se tiver, apague).
3. Em *Account → IAM user and role access to Billing information*, clique em **Activate**: sem isso, seu usuário
   SSO não enxerga custos nem budgets.
4. Saia da root. Daqui em diante, só o usuário do Identity Center.

### 1. Acesso à conta (IAM Identity Center)
Credenciais temporárias via SSO em vez de access keys de longa duração.

1. No console AWS, na região `us-east-1`, ative o **IAM Identity Center**, crie seu usuário (você recebe um e-mail
   para definir a senha e o MFA) e atribua a ele o permission set `AdministratorAccess` nesta conta.
   Anote a **AWS access portal URL** (algo como `https://d-xxxxxxxxxx.awsapps.com/start`).
   Em *Settings → Authentication → Multi-factor authentication*: exija MFA **em todo login**, apenas app
   autenticador ou chave de segurança (sem SMS). No permission set, uma sessão curta (1–4 h) basta.
2. `make aws-configure` e responda:
   - *SSO session name*: `portfolio`
   - *SSO start URL*: a URL do portal; *SSO region*: `us-east-1`; *registration scopes*: Enter (padrão)
   - abra no navegador a URL exibida, confira o código e autorize
   - escolha a conta/role; *default client Region*: `us-east-1`; *output format*: `json`
   - *profile name*: digite **`portfolio`** (a sugestão da CLI é outra; os comandos do `make` usam este nome)
3. Nas próximas vezes, `make aws-login` (a sessão expira em algumas horas). O login usa o fluxo de *device code*:
   a CLI roda num container e mostra uma URL + código para você abrir no navegador. Só aprove códigos que **você**
   acabou de gerar no terminal — aprovar um código recebido de outra pessoa entrega a sessão a ela (phishing).

Teste: `make aws ARGS='sts get-caller-identity'` mostra sua conta.

### 2. Estado do Terraform
`make tf-bootstrap` — cria o bucket versionado que guarda o estado. O estado **deste** passo fica local em
`infra/bootstrap/terraform.tfstate` (ignorado pelo git); se perdido, reimporte o bucket.

### 3. Banco (Neon)
1. Crie um projeto no Neon na região **AWS us-east-1** com **Postgres 18** (mesma major do ambiente local e do CI).
2. Copie as duas connection strings do banco: **pooled** (host com `-pooler`, usada pela API) e **direct**
   (migrations, seed e backup).
3. `make db-secrets` — cole as duas; elas vão para o SSM Parameter Store como SecureString, sem passar por arquivo.

### 4. Variáveis
`cp infra/main/terraform.tfvars.example infra/main/terraform.tfvars` e preencha domínio, repositório e e-mail.

### 5. DNS primeiro
Os certificados só validam depois que o domínio aponta para o Route 53, e o repositório de imagens precisa existir
antes da Lambda. Crie só esses dois recursos:

```sh
make tf-init
make tf-apply ARGS='-target=aws_route53_zone.main -target=aws_ecr_repository.api'
```

`-target` é para situações excepcionais como esta (bootstrap); no dia a dia, aplique tudo.

Na Hostinger, no domínio: **desative o DNSSEC** se estiver ativo (senão o domínio para de resolver) e troque os
**nameservers** pelos 4 de `name_servers` da saída acima.
A propagação leva de minutos a algumas horas. Confira com
`docker run --rm alpine nslookup -type=NS <dominio>` — deve listar os servidores `awsdns`.
**Só siga para o passo 6 depois disso**: senão o apply fica esperando a validação do certificado.

### 6. Primeira imagem, o resto e o plano do CloudFront
```sh
make api-publish      # build arm64 (emulado localmente, alguns minutos) e push no ECR
make tf-apply         # certificado, CloudFront + WAF, Lambda, CI roles, alertas, disjuntor, auditoria (~10–20 min)
make plan-subscribe   # coloca CloudFront + WAF + hosted zone no plano de preço fixo Free
```
Rode o `plan-subscribe` logo após o apply: até lá, o WAF é cobrado pelo preço normal (centavos). A saída mostra
`"status": "SYNC_IN_PROGRESS"`, que vira `ACTIVE` em instantes — confira com
`make aws ARGS="pricing-plan-manager list-subscriptions --region us-east-1 --query 'subscriptionSummaries[].[planTier,status]' --output text"`.
Se a assinatura for recusada por configuração incompatível, o console mostra o motivo: *CloudFront → a distribuição →
Pricing plan → Free* (não aceite alterações automáticas; ajuste pelo Terraform). Se reclamar que a distribuição ainda está em implantação, espere alguns minutos
(*CloudFront → Distributions*, status *Deployed*) e rode de novo. O plano Free **não tem cobrança excedente** — passar da franquia (1M requisições,
100 GB) ou sofrer um ataque não gera fatura. O Terraform ainda não tem recurso para essa assinatura, por isso ela é
feita pela AWS CLI com os ARNs de `terraform output plan_resource_arns`.

Se o apply falhar no `aws_ce_anomaly_monitor` com *Limit exceeded on dimensional spend monitor creation*, a conta já
tem o monitor padrão da AWS (só é permitido um desse tipo). Descubra o ARN:
`make aws ARGS="ce get-anomaly-monitors --query 'AnomalyMonitors[].MonitorArn' --output text"`,
coloque-o em `existing_anomaly_monitor_arn` no `terraform.tfvars` e rode `make tf-apply` de novo — o plano mostra
"1 to import" e o Terraform passa a gerenciar o monitor existente. Não use `terraform import` pela linha de comando:
depois de um apply interrompido, ele falha com *Invalid index*.

Confirme o e-mail de assinatura do SNS que chega em seguida: por ele vêm os alertas de erro do site, o aviso de
disparo do disjuntor e os achados do IAM Access Analyzer (algo acessível de fora da conta). Budgets e anomalias de
custo mandam e-mail direto, sem confirmação. O apply também liga a trilha do CloudTrail (auditoria de quem fez o quê
na conta, guardada por 1 ano).


### 7. GitHub e primeiro deploy
1. Em **Settings → Environments**, crie o environment **`production`**:
   - *Deployment branches and tags*: **Selected branches** → só `main`. Isso é obrigatório: a role de deploy na
     AWS confia no environment, e é esta regra que impede outro branch de usá-lo.
   - *Required reviewers* (opcional): você mesmo — cada deploy passa a esperar sua aprovação.
2. Em **Settings → Secrets and variables → Actions** do repositório:
   - `make tf ARGS='output github_variables'` → crie cada chave na aba **Variables** (identificadores sem nada
     sensível);
   - `make tf ARGS='output github_secrets'` → crie cada chave na aba **Secrets**. Nada ali dá acesso sozinho (as
     roles só confiam neste repositório via OIDC; os buckets são privados), mas os valores contêm o ID da conta AWS e
     os logs de um repositório público são públicos — secrets aparecem mascarados. Os workflows também mascaram o
     ID da conta em qualquer saída (`mask-aws-account-id`).
   Os segredos de verdade (URLs do banco, chaves JWT) nunca passam pelo GitHub: ficam no SSM.
   Faça os itens 1 e 2 **antes** de levar este código ao `main`: todo push no `main` que toque a API dispara o
   deploy.
3. Leve o código ao `main` (merge do PR) — isso dispara os dois workflows. Se o código já estiver lá, rode-os
   manualmente em **Actions → Run workflow**:
   - **api**: testes → imagem → **migrations no Neon** → release na Lambda → smoke. Até aqui o banco está vazio: a
     imagem do passo 6 ainda não tem tabelas para ler.
   - **web**: lint, testes e build do front → S3 → invalidação do `index.html`. Substitui a página provisória.
   Com *Required reviewers*, cada um espera sua aprovação em *Actions*.
4. `make seed-prod` — cria o admin de produção no Neon (e-mail e senha digitados, nunca salvos; não faz nada se
   já existir um admin). Usa o container da API do ambiente local para rodar o seed: precisa do `.env` e de um
   `make up` feito ao menos uma vez. Depois, entre em `https://<dominio>/admin` e preencha o conteúdo.

### 8. Conferir
`make smoke DOMAIN=<dominio>` — deve terminar sem `FAIL`.

## Dia a dia
| Tarefa | Comando |
|---|---|
| Sessão AWS expirada | `make aws-login` |
| Ver/aplicar mudanças de infra | `make tf-plan` / `make tf-apply` |
| Formatar e validar Terraform / workflows | `make tf-fmt` / `make ci-lint` |
| Trocar credenciais do banco | `make db-secrets` e depois `make tf-apply` (a Lambda recebe o novo valor) |
| Deploy manual da API (fallback) | `make api-publish` e `make aws ARGS='lambda update-function-code --function-name <nome> --image-uri <uri>'` — não roda migrations: se o código tiver migration nova, prefira o workflow |
| Religar a API após o disjuntor de custo | investigar o gasto, depois `make api-enable` |
| Checar produção | `make smoke DOMAIN=<dominio>` |

## Restaurar um backup
Os dumps diários ficam no bucket de backups por 30 dias. Restaure primeiro em um **branch** do Neon (cópia
isolada do banco), confira, e só então promova ou copie os dados:

```sh
# 1. baixar o dump para a raiz do repositório
make aws ARGS='s3 ls s3://<BACKUP_BUCKET>/'
make aws ARGS='s3 cp s3://<BACKUP_BUCKET>/<arquivo>.dump .'
# 2. restaurar no branch (connection string direta do branch)
docker run --rm -v "$PWD":/w postgres:18-alpine \
  pg_restore --clean --if-exists --no-owner -d "<url-direta-do-branch>" /w/<arquivo>.dump
```
Apague o `.dump` local depois: ele contém os dados do banco.

## Custos e proteção contra ataques
Estimativa ~US$ 0–1/mês: CloudFront, WAF e Route 53 entram no plano Free; o resto fica em centavos. As camadas, de
fora para dentro:

1. **WAF** (no plano): reputação de IP, rate limit geral por IP, regras gerenciadas. O Free não permite limitar por
   caminho (*byte match*); o brute force de login é limitado por IP na própria API.
2. **Plano de preço fixo**: tráfego acima da franquia não é cobrado; bloqueios nem contam.
3. **Cache na borda**: GETs públicos da API ficam 60 s no CloudFront — um flood da mesma URL não invoca a Lambda.
4. **Origens privadas**: S3 e a Function URL só aceitam requisições assinadas pela distribuição (OAC); ninguém
   contorna o WAF.
5. **Disjuntor**: a concorrência da API vai a zero automaticamente se ela consumir mais de 90 s de compute em
   5 minutos (dispara em minutos) ou se o Budget passar de 100% (US$ 11; dados de cobrança chegam com atraso). O site
   estático continua no ar e você recebe e-mail. Investigue e religue com `make api-enable` — um `terraform apply`
   nunca religa sozinho.

Budgets também avisam por e-mail em 50/80% e na previsão de estouro. A auditoria (CloudTrail + IAM Access Analyzer)
custa centavos de S3.


## Contrato para o front (`apps/web`)
Consequências do OAC na frente da Lambda que o cliente precisa seguir:
- Toda requisição que não seja GET/HEAD envia `x-amz-content-sha256` com o SHA-256 (hex) do corpo exato enviado —
  sem corpo (ex.: DELETE, `/auth/refresh`), o hash da string vazia. Implementado em `apps/web/src/lib/api.ts`.
- O token vai em `X-Authorization: Bearer <token>` — o CloudFront sobrescreve `Authorization` com a assinatura dele.
- Upload: o corpo é o próprio arquivo (`Content-Type: image/png` etc.), não multipart.
