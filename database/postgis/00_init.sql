-- PostGIS initialization script
-- Runs automatically on first PostgreSQL container start via /docker-entrypoint-initdb.d/

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
