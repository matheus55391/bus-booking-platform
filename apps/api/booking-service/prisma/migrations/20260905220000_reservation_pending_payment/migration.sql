-- Hold não pago não vive mais no Postgres.
-- ReservationStatus: PENDING_PAYMENT | CONFIRMED | EXPIRED | CANCELLED

-- 1) Remove índice parcial que referencia o enum antigo
DROP INDEX IF EXISTS "Reservation_active_trip_seat_uidx";

-- 2) Troca o enum (via coluna texto temporária)
ALTER TABLE "Reservation" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Reservation"
  ALTER COLUMN "status" TYPE TEXT
  USING ("status"::text);

DROP TYPE "ReservationStatus";

CREATE TYPE "ReservationStatus" AS ENUM (
  'PENDING_PAYMENT',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED'
);

UPDATE "Reservation"
SET "status" = CASE "status"
  WHEN 'RESERVED' THEN 'PENDING_PAYMENT'
  WHEN 'CONFIRMED' THEN 'CONFIRMED'
  WHEN 'EXPIRED' THEN 'EXPIRED'
  WHEN 'CANCELLED' THEN 'CANCELLED'
  ELSE 'CANCELLED'
END;

ALTER TABLE "Reservation"
  ALTER COLUMN "status" TYPE "ReservationStatus"
  USING ("status"::"ReservationStatus");

ALTER TABLE "Reservation"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT'::"ReservationStatus";

-- 3) No máximo um checkout em andamento por assento/viagem
CREATE UNIQUE INDEX "Reservation_active_trip_seat_uidx"
ON "Reservation" ("tripId", "seatId")
WHERE "status" = 'PENDING_PAYMENT';
