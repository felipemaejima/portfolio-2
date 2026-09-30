SHELL   := /bin/bash
COMPOSE := docker compose
API     := $(COMPOSE) exec api
PNPM    := $(API) pnpm --filter api
TEST_DB := postgresql://portfolio:portfolio@db-test:5432/portfolio_test

# Cloud tooling also runs in containers, as the host user (files it writes stay yours).
# AWS credentials come from IAM Identity Center (SSO): short-lived, cached in ~/.aws, no access keys.
AWS_PROFILE ?= portfolio
SSM_PREFIX  := /portfolio/prod
TTY         := $(shell [ -t 0 ] && echo -t)
CLOUD_BASE  := docker run --rm -i -u $(shell id -u):$(shell id -g) -e HOME=/home/app -e CHECKPOINT_DISABLE=1 -e AWS_PAGER= \
               -v $(HOME)/.aws:/home/app/.aws -v $(CURDIR):/work -w /work
CLOUD_RAW   := $(CLOUD_BASE) -e AWS_PROFILE=$(AWS_PROFILE)
CLOUD       := $(CLOUD_RAW) $(TTY)
# Captured output ($$(...) or pipes) must not come from a TTY: it would carry \r into values.
AWS_RAW     := $(CLOUD_RAW) amazon/aws-cli:2.37.4
AWS         := $(CLOUD) amazon/aws-cli:2.37.4
TF_RAW      := $(CLOUD_RAW) hashicorp/terraform:1.16.4 -chdir=infra/main
TF          := $(CLOUD) hashicorp/terraform:1.16.4 -chdir=infra/main
TF_BOOT     := $(CLOUD) hashicorp/terraform:1.16.4 -chdir=infra/bootstrap

.DEFAULT_GOAL := help

.PHONY: help up down logs sh install migrate migration seed studio test lint openapi build test-web reset-db \
        aws-configure aws-login tf-bootstrap tf-init tf-plan tf-apply aws tf tf-fmt ci-lint db-secrets seed-prod api-publish plan-subscribe api-restart api-enable smoke

help: ## list available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env

up: .env ## start dev stack: site/admin on WEB_PORT (5173), api with hot reload, postgres
	$(COMPOSE) up -d --build

down: ## stop all containers (volumes are kept)
	$(COMPOSE) --profile test down

logs: ## follow api and web logs
	$(COMPOSE) logs -f api web

sh: ## shell inside the api container
	$(API) sh

install: ## install workspace dependencies
	$(API) pnpm install

migrate: ## apply/create migrations from schema changes (dev)
	$(PNPM) exec prisma migrate dev

migration: ## make migration name=<name>
	@test -n "$(name)" || (echo "usage: make migration name=<name>" && exit 1)
	$(PNPM) exec prisma migrate dev --name $(name)

seed: ## create the admin from ADMIN_EMAIL/ADMIN_PASSWORD (idempotent)
	$(PNPM) seed

studio: ## open Prisma Studio on STUDIO_PORT
	$(PNPM) exec prisma studio --port 5555 --browser none

test: ## e2e suite against the throwaway db-test (args: make test t=<pattern>)
	$(COMPOSE) --profile test up -d --wait db-test
	$(API) sh -c "export DATABASE_URL=$(TEST_DB) && pnpm --filter api exec prisma migrate deploy && pnpm --filter api test $(t)"

lint: ## typecheck + oxlint (api and web)
	$(API) pnpm -r lint

test-web: ## web unit tests (API client contract)
	$(API) pnpm --filter web test

openapi: ## export apps/api/openapi.json
	$(PNPM) openapi

build: ## build the production image (portfolio-api)
	docker build -f apps/api/Dockerfile --target prod -t portfolio-api .

reset-db: ## drop dev database and reapply migrations
	$(PNPM) exec prisma migrate reset --force

# ---- AWS (see infra/README.md for the first-time runbook) -------------------------------------------------------

# Mounted into every cloud container; created by us first, or Docker would create it owned by root.
$(HOME)/.aws:
	mkdir -p $@

# SSO uses the device-code flow: the default flow waits for a browser callback on localhost *inside* the container.
aws-configure: $(HOME)/.aws ## one-time: create the SSO profile (name it "portfolio")
	$(CLOUD_BASE) $(TTY) amazon/aws-cli:2.37.4 configure sso --use-device-code

aws-login: $(HOME)/.aws ## start an SSO session (prints a URL + code to open in the browser)
	$(AWS) sso login --use-device-code

tf-bootstrap: $(HOME)/.aws ## one-time: create the Terraform state bucket (local state)
	$(TF_BOOT) init -input=false
	$(TF_BOOT) apply

tf-init: $(HOME)/.aws ## init infra/main against the state bucket
	$(TF) init -input=false -backend-config=bucket=$$($(CLOUD_RAW) hashicorp/terraform:1.16.4 -chdir=infra/bootstrap output -raw state_bucket)

tf-plan: $(HOME)/.aws ## preview infra changes (args: ARGS=...)
	$(TF) plan $(ARGS)

tf-apply: $(HOME)/.aws ## apply infra changes (args: ARGS=..., e.g. ARGS='-target=aws_route53_zone.main')
	$(TF) apply $(ARGS)

aws: $(HOME)/.aws ## any AWS CLI command, files land in the repo root (ARGS='s3 ls')
	$(AWS) $(ARGS)

tf: $(HOME)/.aws ## any other terraform command in infra/main (ARGS='output github_variables')
	$(TF) $(ARGS)

tf-fmt: $(HOME)/.aws ## format + validate Terraform
	$(TF_BOOT) fmt -recursive
	$(TF) fmt -recursive
	$(TF) validate

ci-lint: ## lint the GitHub Actions workflows (actionlint + shellcheck)
	docker run --rm -v $(CURDIR):/repo -w /repo rhysd/actionlint:1.7.12 -color

db-secrets: $(HOME)/.aws ## store the Neon connection strings in SSM (typed, never echoed or written to disk)
	@read -rsp "Neon POOLED connection string: " POOLED && echo && \
	read -rsp "Neon DIRECT connection string: " DIRECT && echo && \
	export POOLED DIRECT && \
	$(CLOUD) -e POOLED -e DIRECT --entrypoint sh amazon/aws-cli:2.37.4 -c '\
	  aws ssm put-parameter --name $(SSM_PREFIX)/database-url --type SecureString --overwrite --value "$$POOLED" >/dev/null && \
	  aws ssm put-parameter --name $(SSM_PREFIX)/direct-database-url --type SecureString --overwrite --value "$$DIRECT" >/dev/null' && \
	echo "Stored $(SSM_PREFIX)/database-url and $(SSM_PREFIX)/direct-database-url"

api-publish: $(HOME)/.aws ## build the arm64 image and push it to ECR (first deploy / manual fallback; CI does this normally)
	docker run --privileged --rm tonistiigi/binfmt:qemu-v10.2.3 --install arm64 >/dev/null
	@# Tags are immutable in ECR: a timestamp keeps re-publishing the same commit possible.
	@# No provenance/SBOM attestations: they turn the push into an image index, which Lambda rejects.
	@REPO=$$($(TF_RAW) output -raw ecr_repository_url) && TAG=manual-$$(git rev-parse --short HEAD)-$$(date +%s) && \
	$(AWS_RAW) ecr get-login-password | docker login --username AWS --password-stdin $${REPO%%/*} && \
	docker buildx build --platform linux/arm64 --provenance=false --sbom=false -f apps/api/Dockerfile --target prod -t $$REPO:$$TAG --push . && \
	echo "Pushed $$REPO:$$TAG"

plan-subscribe: $(HOME)/.aws ## one-time: put CloudFront (+ WAF + hosted zone) on the Free flat-rate plan — no overage charges
	@ARNS=$$($(TF_RAW) output -json plan_resource_arns | tr -d '[]"' | tr ',' ' ') && \
	$(AWS) pricing-plan-manager create-subscription --region us-east-1 --plan-family CloudFront --plan-tier FREE --resource-arns $$ARNS

seed-prod: $(HOME)/.aws ## create the production admin in Neon (prompts; no-op if an admin exists)
	@read -rp "Admin e-mail: " ADMIN_EMAIL && read -rsp "Admin password: " ADMIN_PASSWORD && echo && \
	DATABASE_URL=$$($(AWS_RAW) ssm get-parameter --name $(SSM_PREFIX)/direct-database-url --with-decryption \
	  --query Parameter.Value --output text) && export ADMIN_EMAIL ADMIN_PASSWORD DATABASE_URL && \
	$(COMPOSE) run --rm --no-deps -e ADMIN_EMAIL -e ADMIN_PASSWORD -e DATABASE_URL api \
	  sh -c 'pnpm --filter api build >/dev/null && node apps/api/dist/seed.js'

api-restart: $(HOME)/.aws ## new Lambda instances, e.g. after changing a secret in SSM (read only at boot)
	fn=$$($(TF_RAW) output -raw api_function_name) && \
	$(AWS) lambda update-function-configuration --region us-east-1 --function-name $$fn \
	  --description "restarted $$(date -u +%FT%TZ)" > /dev/null && \
	$(AWS) lambda wait function-updated-v2 --region us-east-1 --function-name $$fn && echo "restarted $$fn"

api-enable: $(HOME)/.aws ## turn the API back on after the cost kill switch disabled it
	$(AWS) lambda delete-function-concurrency --region us-east-1 --function-name $$($(TF_RAW) output -raw api_function_name)

smoke: ## post-deploy checks against production (DOMAIN=example.info)
	@test -n "$(DOMAIN)" || (echo "usage: make smoke DOMAIN=<domain>" && exit 1)
	docker run --rm -v $(CURDIR)/infra/smoke.sh:/smoke.sh:ro curlimages/curl:8.22.0 sh /smoke.sh $(DOMAIN)
