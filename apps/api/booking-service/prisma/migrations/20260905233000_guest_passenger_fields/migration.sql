-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD');

-- AlterTable: guest checkout fields (backfill for any existing rows)
ALTER TABLE "Reservation" ADD COLUMN "orderCode" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "passengerName" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "passengerEmail" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "passengerDocument" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "passengerPhone" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "passengerBirthDate" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "paymentMethod" "PaymentMethod";

UPDATE "Reservation"
SET
  "orderCode" = upper(substr(replace("id", '-', ''), 1, 3)) || '-' || substr(replace("id", '-', ''), 4, 4),
  "passengerName" = COALESCE(NULLIF("passengerName", ''), 'Passageiro'),
  "passengerEmail" = COALESCE(NULLIF("passengerEmail", ''), "userId"),
  "passengerDocument" = COALESCE(NULLIF("passengerDocument", ''), '00000000000'),
  "passengerPhone" = COALESCE(NULLIF("passengerPhone", ''), ''),
  "passengerBirthDate" = COALESCE(NULLIF("passengerBirthDate", ''), '1990-01-01'),
  "paymentMethod" = COALESCE("paymentMethod", 'PIX');

-- Fix emails that are not emails (legacy userId)
UPDATE "Reservation"
SET "passengerEmail" = 'guest@rodoviaria.local'
WHERE "passengerEmail" NOT LIKE '%@%';

ALTER TABLE "Reservation" ALTER COLUMN "orderCode" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "passengerName" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "passengerEmail" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "passengerDocument" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "passengerPhone" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "passengerBirthDate" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "paymentMethod" SET NOT NULL;

CREATE UNIQUE INDEX "Reservation_orderCode_key" ON "Reservation"("orderCode");
CREATE INDEX "Reservation_passengerEmail_idx" ON "Reservation"("passengerEmail");
CREATE INDEX "Reservation_passengerDocument_idx" ON "Reservation"("passengerDocument");
