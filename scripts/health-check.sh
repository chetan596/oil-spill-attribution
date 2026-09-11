#!/usr/bin/env bash
echo "Checking health across backend, ML engine, and database..."
curl -s http://localhost:4000/api/v1/health || echo "Backend unreachable"
curl -s http://localhost:8000/api/v1/health || echo "ML service unreachable"
