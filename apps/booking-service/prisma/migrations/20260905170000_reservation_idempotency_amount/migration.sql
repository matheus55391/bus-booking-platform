-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Reservation" ADD COLUMN "idempotencyKey" TEXT;

UPDATE "Reservation"
SET "idempotencyKey" = "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "Reservation" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "Reservation_idempotencyKey_key" ON "Reservation"("idempotencyKey");
