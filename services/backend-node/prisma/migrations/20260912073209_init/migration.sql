-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DETECTION', 'HINDCAST', 'ATTRIBUTION', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "satellite_scenes" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "satellite" TEXT NOT NULL,
    "acquisitionAt" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "geomWkt" TEXT,
    "bandInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satellite_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "userId" TEXT,
    "bullJobId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spills" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "areaKm2" DOUBLE PRECISION NOT NULL,
    "geomWkt" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "estimatedAgeHours" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_runs" (
    "id" TEXT NOT NULL,
    "spillId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "originTimestamp" TIMESTAMP(3) NOT NULL,
    "timeWindowHours" INTEGER NOT NULL DEFAULT 24,
    "simulationMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_points" (
    "id" TEXT NOT NULL,
    "driftRunId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geomWkt" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "phase" TEXT NOT NULL,
    "seqIndex" INTEGER NOT NULL,

    CONSTRAINT "drift_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vessels" (
    "id" TEXT NOT NULL,
    "mmsi" TEXT NOT NULL,
    "imo" TEXT,
    "name" TEXT,
    "flag" TEXT,
    "vesselType" TEXT,
    "lengthM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ais_tracks" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "mmsi" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geomWkt" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "speedKnots" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "navStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ais_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_results" (
    "id" TEXT NOT NULL,
    "spillId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "proximityScore" DOUBLE PRECISION NOT NULL,
    "temporalScore" DOUBLE PRECISION NOT NULL,
    "trajectoryScore" DOUBLE PRECISION NOT NULL,
    "anomalyScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_versions" (
    "id" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "artifactUrl" TEXT,
    "metrics" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "content" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "satellite_scenes_sceneId_key" ON "satellite_scenes"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "spills_analysisId_key" ON "spills"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "drift_runs_spillId_key" ON "drift_runs"("spillId");

-- CreateIndex
CREATE INDEX "drift_points_driftRunId_phase_seqIndex_idx" ON "drift_points"("driftRunId", "phase", "seqIndex");

-- CreateIndex
CREATE UNIQUE INDEX "vessels_mmsi_key" ON "vessels"("mmsi");

-- CreateIndex
CREATE INDEX "ais_tracks_mmsi_timestamp_idx" ON "ais_tracks"("mmsi", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_results_spillId_vesselId_key" ON "attribution_results"("spillId", "vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "model_versions_modelType_version_key" ON "model_versions"("modelType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "reports_analysisId_key" ON "reports"("analysisId");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "satellite_scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spills" ADD CONSTRAINT "spills_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_runs" ADD CONSTRAINT "drift_runs_spillId_fkey" FOREIGN KEY ("spillId") REFERENCES "spills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_points" ADD CONSTRAINT "drift_points_driftRunId_fkey" FOREIGN KEY ("driftRunId") REFERENCES "drift_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ais_tracks" ADD CONSTRAINT "ais_tracks_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_spillId_fkey" FOREIGN KEY ("spillId") REFERENCES "spills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
