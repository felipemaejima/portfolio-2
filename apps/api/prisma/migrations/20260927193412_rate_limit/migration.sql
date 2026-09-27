-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);
