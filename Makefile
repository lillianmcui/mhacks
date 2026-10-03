# CH4SE backend tasks. Each package keeps its own package.json and lockfile;
# this file only strings the commands together.
export PATH := $(HOME)/.local/bin:$(PATH)

DB ?= ch4se
PACKAGES := packages/contracts packages/rules packages/stdb-bindings spacetime/module services/core-api services/seed

.PHONY: install db publish publish-clean generate seed replay seed-sample replay-sample api stub test typecheck e2e

install: ## npm install in every backend package
	@for dir in $(PACKAGES); do echo "== $$dir"; (cd $$dir && npm install --no-fund --no-audit) || exit 1; done

db: ## run a local SpacetimeDB on 127.0.0.1:3000 (foreground)
	spacetime start --listen-addr 127.0.0.1:3000

publish: ## build and publish the module to the local server, keeping data
	cd spacetime/module && spacetime publish $(DB) --server local --yes

publish-clean: ## publish and WIPE all data (clean start for a rehearsal)
	cd spacetime/module && spacetime publish $(DB) --server local --delete-data=always --yes

generate: ## regenerate packages/stdb-bindings (commit it alone: "chore(bindings): regenerate")
	cd spacetime/module && npm run generate

seed: ## load the synthetic company from data/fixtures
	cd services/seed && npm run --silent seed

replay: ## replay the MAIN event: insert -> match -> priority -> create_incident
	cd services/seed && npm run --silent replay

seed-sample: ## same as seed, with invented sample data
	cd services/seed && npm run --silent seed -- --sample

replay-sample: ## same as replay, with invented sample data
	cd services/seed && npm run --silent replay -- --sample

api: ## run the Core API against SpacetimeDB
	cd services/core-api && npm start

stub: ## run the stub Core API (no SpacetimeDB, invented data, sends nothing)
	cd services/core-api && npm run stub

test: ## unit tests
	cd packages/contracts && npm test
	cd packages/rules && npm test
	cd services/core-api && npm test

typecheck:
	@for dir in $(PACKAGES); do echo "== $$dir"; (cd $$dir && npx tsc -p .) || exit 1; done

e2e: ## full lifecycle against a real module, in a throwaway database (needs `make db`)
	cd spacetime/module && spacetime publish ch4se-test --server local --delete-data=always --yes
	cd services/core-api && SPACETIMEDB_DATABASE=ch4se-test npm run test:e2e
