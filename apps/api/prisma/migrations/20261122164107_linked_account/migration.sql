-- CreateEnum
CREATE TYPE "LinkedAccountProvider" AS ENUM ('GOOGLE');

-- CreateTable
CREATE TABLE "LinkedAccount" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "provider" "LinkedAccountProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedAccount_provider_subject_key" ON "LinkedAccount"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedAccount_adminId_provider_key" ON "LinkedAccount"("adminId", "provider");

-- AddForeignKey
ALTER TABLE "LinkedAccount" ADD CONSTRAINT "LinkedAccount_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
