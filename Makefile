.PHONY: dev test audit ci

dev:
	npm run dev

test:
	npm test

audit:
	npm audit --audit-level=high

ci: test audit
