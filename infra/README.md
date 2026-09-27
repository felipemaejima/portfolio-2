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

### 1. Acesso à conta (IAM Identity Center)
Credenciais temporárias via SSO em vez de access keys de longa duração.

1. No console AWS, na região `us-east-1`, ative o **IAM Identity Center**, crie seu usuário (você recebe um e-mail
   para definir a senha e o MFA) e atribua a ele o permission set `AdministratorAccess` nesta conta.
   Anote a **AWS access portal URL** (algo como `https://d-xxxxxxxxxx.awsapps.com/start`).
2. `make aws-configure` e responda:
   - *SSO session name*: `portfolio`
   - *SSO start URL*: a URL do portal; *SSO region*: `us-east-1`; *registration scopes*: Enter (padrão)
   - abra no navegador a URL exibida, confira o código e autorize
   - escolha a conta/role; *default client Region*: `us-east-1`; *output format*: `json`
   - *profile name*: digite **`portfolio`** (a sugestão da CLI é outra; os comandos do `make` usam este nome)
3. Nas próximas vezes, `make aws-login` (a sessão expira em algumas horas). O login usa o fluxo de *device code*:
   a CLI roda num container e mostra uma URL + código para você abrir no navegador.

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
make tf-apply         # certificado, CloudFront + WAF, Lambda, CI roles, alertas, disjuntor (~10–20 min)
make plan-subscribe   # coloca CloudFront + WAF + hosted zone no plano de preço fixo Free
```
Rode o `plan-subscribe` logo após o apply: até lá, o WAF é cobrado pelo preço normal (centavos). A saída deve
mostrar `"status": "ACTIVE"`. O plano Free **não tem cobrança excedente** — passar da franquia (1M requisições,
100 GB) ou sofrer um ataque não gera fatura. O Terraform ainda não tem recurso para essa assinatura, por isso ela é
feita pela AWS CLI com os ARNs de `terraform output plan_resource_arns`.

Se o apply falhar no `aws_ce_anomaly_monitor` por limite, a conta já tem o monitor padrão da AWS (só é permitido
um desse tipo). Pegue o ARN em *Billing and Cost Management → Cost Anomaly Detection* e traga-o para o Terraform:
`make tf ARGS='import aws_ce_anomaly_monitor.services <arn>'`, depois `make tf-apply` de novo.

Confirme o e-mail de assinatura do SNS que chega em seguida (alertas de erro). Budgets e anomalias não pedem
confirmação.

### 7. GitHub e primeiro deploy
1. `make tf ARGS='output github_variables'` e crie cada chave em **Settings → Secrets and variables → Actions →
   Variables** do repositório (são identificadores, não segredos — os segredos ficam no SSM).
   Faça isso **antes** de levar este código ao `main`: todo push no `main` que toque a API dispara o deploy.
2. Leve o código ao `main` (merge do PR) ou, se já estiver lá, rode o workflow manualmente em
   **Actions → api → Run workflow**. Ele roda: testes → imagem → **migrations no Neon** → release na Lambda → smoke.
   Até este passo o banco está vazio: a imagem do passo 6 ainda não tem tabelas para ler.
3. `make seed-prod` — cria o admin de produção no Neon (e-mail e senha digitados, nunca salvos). Não faz nada se
   já existir um admin.

### 8. Conferir
`make smoke DOMAIN=<dominio>` — deve terminar sem `FAIL`.

## Dia a dia
| Tarefa | Comando |
|---|---|
| Ver/aplicar mudanças de infra | `make tf-plan` / `make tf-apply` |
| Formatar e validar Terraform | `make tf-fmt` |
| Trocar credenciais do banco | `make db-secrets` e depois `make tf-apply` (a Lambda recebe o novo valor) |
| Deploy manual da API (fallback) | `make api-publish` e `make aws ARGS='lambda update-function-code --function-name <nome> --image-uri <uri>'` |
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

1. **WAF** (no plano): reputação de IP, rate limit por IP (geral e em `/api/auth/*`), regras gerenciadas.
2. **Plano de preço fixo**: tráfego acima da franquia não é cobrado; bloqueios nem contam.
3. **Cache na borda**: GETs públicos da API ficam 60 s no CloudFront — um flood da mesma URL não invoca a Lambda.
4. **Origens privadas**: S3 e a Function URL só aceitam requisições assinadas pela distribuição (OAC); ninguém
   contorna o WAF.
5. **Disjuntor**: a concorrência da API vai a zero automaticamente se ela consumir mais de 90 s de compute em
   5 minutos (dispara em minutos) ou se o Budget passar de 100% (US$ 11; dados de cobrança chegam com atraso). O site
   estático continua no ar e você recebe e-mail. Investigue e religue com `make api-enable` — um `terraform apply`
   nunca religa sozinho.

Budgets também avisam por e-mail em 50/80% e na previsão de estouro.

## Contrato para o front (`apps/web`)
Consequências do OAC na frente da Lambda que o cliente precisa seguir:
- Requisições com corpo (POST/PUT/PATCH) enviam `x-amz-content-sha256` com o SHA-256 (hex) do corpo exato enviado.
- O token vai em `X-Authorization: Bearer <token>` — o CloudFront sobrescreve `Authorization` com a assinatura dele.
- Upload: o corpo é o próprio arquivo (`Content-Type: image/png` etc.), não multipart.
