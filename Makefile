.PHONY: help setup dev build test lint clean up down seed

help:
	@echo "Oil Spill Detection & Attribution Makefile"
	@echo "  make setup     - Install all project dependencies"
	@echo "  make dev       - Run all services concurrently"
	@echo "  make up        - Start Docker background services (Postgres, Redis)"
	@echo "  make down      - Stop Docker background services"
	@echo "  make test      - Run tests across backend and ML service"
	@echo "  make lint      - Run linters across projects"
	@echo "  make seed      - Populate database with initial mock/seed data"
	@echo "  make clean     - Clean temporary build outputs and caches"

setup:
	pnpm install
	cd services/ml-python && pip install -r requirements.txt

up:
	docker-compose up -d postgres redis

down:
	docker-compose down

dev:
	pnpm dev

test:
	pnpm test
	cd services/ml-python && pytest

lint:
	pnpm lint

seed:
	node scripts/seed-db.js

clean:
	rm -rf node_modules apps/web/dist services/ml-python/__pycache__
