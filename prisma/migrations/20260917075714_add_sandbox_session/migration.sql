-- CreateTable
CREATE TABLE "SandboxSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "counters" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxSession_pkey" PRIMARY KEY ("id")
);
