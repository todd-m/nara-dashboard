.PHONY: help install dev test lint audit ci clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci

dev: ## Start the Vite dev server
	npm run dev

test: ## Run tests with coverage (threshold lives in vite.config.js)
	npm run coverage

lint: ## Run eslint
	npm run lint

audit: ## Scan dependencies for known vulnerabilities
	npm audit --omit=dev --audit-level=high

ci: test lint audit ## Run tests, lint, and security audit

clean: ## Remove caches and coverage output
	rm -rf coverage dist
