COMPOSE := docker compose
API     := $(COMPOSE) exec api
PNPM    := $(API) pnpm --filter api
TEST_DB := postgresql://portfolio:portfolio@db-test:5432/portfolio_test

.DEFAULT_GOAL := help

.PHONY: help up down logs sh install migrate migration seed studio test lint openapi build reset-db

help: ## list available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env

up: .env ## start dev stack (api with hot reload + postgres)
	$(COMPOSE) up -d --build

down: ## stop all containers (volumes are kept)
	$(COMPOSE) --profile test down

logs: ## follow api logs
	$(COMPOSE) logs -f api

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

lint: ## typecheck + oxlint
	$(PNPM) lint

openapi: ## export apps/api/openapi.json
	$(PNPM) openapi

build: ## build the production image (portfolio-api)
	docker build -f apps/api/Dockerfile --target prod -t portfolio-api .

reset-db: ## drop dev database and reapply migrations
	$(PNPM) exec prisma migrate reset --force
