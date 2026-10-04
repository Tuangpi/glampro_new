# Glampro — developer shortcuts.
#
# Everything runs in Docker; the host only needs Docker Engine + Compose v2.
# `make help` lists every target.

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose --env-file .env.docker
PROD_COMPOSE := docker compose -f compose.production.yaml --env-file .env.production

WEB_PORT ?= 5173
API_PORT ?= 9100

.PHONY: help
help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Environment ──────────────────────────────────────────────────────────────
.PHONY: env
env: ## Create .env.docker from the template (never overwrites an existing file)
	@test -f .env.docker || (cp .env.docker.example .env.docker && echo "Created .env.docker — replace the placeholder secrets before starting.")

# ─── Day-to-day ───────────────────────────────────────────────────────────────
.PHONY: up
up: env ## Build and start the development stack
	$(COMPOSE) up --build

.PHONY: up-d
up-d: env ## Start the development stack in the background
	$(COMPOSE) up --build -d

.PHONY: down
down: ## Stop the stack (data volumes are kept)
	$(COMPOSE) down

.PHONY: restart
restart: ## Recreate the app containers (keeps the database)
	$(COMPOSE) up -d --force-recreate api web

.PHONY: rebuild
rebuild: ## Rebuild images and refresh the node_modules volumes (run after changing a package.json)
	$(COMPOSE) up --build -d -V

.PHONY: logs
logs: ## Follow the API and web logs
	$(COMPOSE) logs -f api web

.PHONY: ps
ps: ## Show service status
	$(COMPOSE) ps

.PHONY: shell-api
shell-api: ## Open a shell in the API container
	$(COMPOSE) exec api bash

.PHONY: shell-web
shell-web: ## Open a shell in the web container
	$(COMPOSE) exec web bash

.PHONY: shell-db
shell-db: ## Open psql on the development database
	$(COMPOSE) exec database psql -U $${POSTGRES_USER:-glampro} -d $${POSTGRES_DB:-glampro}

# ─── Database ─────────────────────────────────────────────────────────────────
.PHONY: migrate
migrate: ## Apply pending migrations
	$(COMPOSE) exec -T api npm run db:migrate

.PHONY: migrate-dev
migrate-dev: ## Create + apply a migration (make migrate-dev name=add_customers)
	$(COMPOSE) exec api npm run db:migrate:dev -- --name $(name)

.PHONY: seed
seed: ## Seed development data
	$(COMPOSE) exec -T api npm run db:seed

.PHONY: generate
generate: ## Regenerate the Prisma client
	$(COMPOSE) exec -T api npm run db:generate

.PHONY: reset-db
reset-db: ## Drop and recreate the database, then migrate + seed (destructive)
	$(COMPOSE) exec -T api npm run db:reset
	$(COMPOSE) exec -T api npm run db:seed

# ─── Quality ──────────────────────────────────────────────────────────────────
.PHONY: install
install: ## Install workspace dependencies on the host (for editors and git hooks)
	npm install

.PHONY: fmt
fmt: ## Format the repository with Prettier
	npm run format

.PHONY: lint
lint: ## Run ESLint across every workspace
	npm run lint

.PHONY: typecheck
typecheck: ## Type-check every workspace
	npm run typecheck

.PHONY: test
test: ## Run every test suite
	npm run test

# The API's isolation suites are skipped unless DATABASE_URL is set, so a bare
# `npm run test` proves far less than it appears to. This runs the same suites with
# the dev database attached, which is the only way tenant isolation is actually
# exercised.
.PHONY: test-db
test-db: env ## Run every suite, including the ones that need a live database
	@set -a; . ./.env.docker; set +a; \
	DATABASE_URL="postgresql://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@localhost:$${POSTGRES_PORT:-5433}/$${POSTGRES_DB}" \
	npm run test

.PHONY: verify
verify: ## Format check + lint + typecheck + tests (what CI runs)
	npm run verify

# ─── Smoke checks ─────────────────────────────────────────────────────────────
.PHONY: health
health: ## Curl the liveness and readiness endpoints
	@echo -n "GET /health          → "; curl -fsS http://localhost:$(API_PORT)/health || echo FAILED
	@echo
	@echo -n "GET /api/health      → "; curl -fsS http://localhost:$(API_PORT)/api/health || echo FAILED
	@echo

.PHONY: smoke
smoke: health ## Verify the running stack end to end
	@echo -n "GET web (vite)       → "
	@curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:$(WEB_PORT)/ || echo FAILED
	@echo -n "GET web → API proxy  → "
	@curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:$(WEB_PORT)/api/health || echo FAILED

# ─── Production ───────────────────────────────────────────────────────────────
.PHONY: prod-up
prod-up: ## Build and start the production stack
	$(PROD_COMPOSE) up --build -d

.PHONY: prod-down
prod-down: ## Stop the production stack
	$(PROD_COMPOSE) down

.PHONY: prod-seed
prod-seed: ## Seed the single production administrator
	$(PROD_COMPOSE) run --rm migrations npx prisma db seed

.PHONY: prod-logs
prod-logs: ## Follow production logs
	$(PROD_COMPOSE) logs -f api web

# ─── Maintenance ──────────────────────────────────────────────────────────────
.PHONY: clean
clean: ## Remove build output and the node_modules volumes (keeps database volumes)
	npm run clean
	$(COMPOSE) down -v

.PHONY: nuke
nuke: ## Remove the stack AND all data volumes (destructive)
	$(COMPOSE) down --volumes --remove-orphans
