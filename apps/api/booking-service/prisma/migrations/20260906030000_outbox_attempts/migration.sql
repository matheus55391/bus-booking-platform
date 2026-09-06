-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboxEvent" ADD COLUMN "lastError" TEXT;
ALTER TABLE "OutboxEvent" ADD COLUMN "poisonedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutboxEvent_poisonedAt_createdAt_idx" ON "OutboxEvent"("poisonedAt", "createdAt");
