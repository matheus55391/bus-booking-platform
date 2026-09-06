
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckoutSagaStatus" AS ENUM ('STARTED', 'PAYMENT_WINDOW_OPEN', 'WAITING_WEBHOOK', 'CHARGED', 'COMPLETED', 'COMPENSATING', 'COMPENSATED', 'FAILED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSaga" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "CheckoutSagaStatus" NOT NULL DEFAULT 'STARTED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOutboxEvent" (
    "id" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "poisonedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PspWebhookEvent" (
    "providerEventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "paymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PspWebhookEvent_pkey" PRIMARY KEY ("providerEventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSaga_idempotencyKey_key" ON "CheckoutSaga"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckoutSaga_reservationId_idx" ON "CheckoutSaga"("reservationId");

-- CreateIndex
CREATE INDEX "CheckoutSaga_status_idx" ON "CheckoutSaga"("status");

-- CreateIndex
CREATE INDEX "PaymentOutboxEvent_publishedAt_createdAt_idx" ON "PaymentOutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOutboxEvent_poisonedAt_createdAt_idx" ON "PaymentOutboxEvent"("poisonedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PspWebhookEvent_paymentId_idx" ON "PspWebhookEvent"("paymentId");

