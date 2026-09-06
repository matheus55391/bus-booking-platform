-- CreateEnum
CREATE TYPE "CheckoutSagaStatus" AS ENUM (
  'STARTED',
  'PAYMENT_WINDOW_OPEN',
  'CHARGED',
  'COMPLETED',
  'COMPENSATING',
  'COMPENSATED',
  'FAILED'
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

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSaga_idempotencyKey_key" ON "CheckoutSaga"("idempotencyKey");
CREATE INDEX "CheckoutSaga_reservationId_idx" ON "CheckoutSaga"("reservationId");
CREATE INDEX "CheckoutSaga_status_idx" ON "CheckoutSaga"("status");
