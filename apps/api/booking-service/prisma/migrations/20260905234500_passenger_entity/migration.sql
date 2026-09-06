-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Passenger_email_idx" ON "Passenger"("email");
CREATE INDEX "Passenger_document_idx" ON "Passenger"("document");

-- Migrate embedded passenger columns → Passenger rows
ALTER TABLE "Reservation" ADD COLUMN "passengerId" TEXT;

INSERT INTO "Passenger" ("id", "name", "email", "document", "phone", "birthDate", "createdAt", "updatedAt")
SELECT
  'pax_' || "id",
  "passengerName",
  "passengerEmail",
  "passengerDocument",
  "passengerPhone",
  "passengerBirthDate",
  "createdAt",
  "updatedAt"
FROM "Reservation";

UPDATE "Reservation"
SET "passengerId" = 'pax_' || "id";

ALTER TABLE "Reservation" ALTER COLUMN "passengerId" SET NOT NULL;

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_passengerId_fkey"
  FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Reservation_passengerId_idx" ON "Reservation"("passengerId");

-- Drop embedded columns + indexes
DROP INDEX IF EXISTS "Reservation_passengerEmail_idx";
DROP INDEX IF EXISTS "Reservation_passengerDocument_idx";

ALTER TABLE "Reservation" DROP COLUMN "passengerName";
ALTER TABLE "Reservation" DROP COLUMN "passengerEmail";
ALTER TABLE "Reservation" DROP COLUMN "passengerDocument";
ALTER TABLE "Reservation" DROP COLUMN "passengerPhone";
ALTER TABLE "Reservation" DROP COLUMN "passengerBirthDate";
