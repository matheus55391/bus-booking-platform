import { PrismaClient, SeatStatus } from '@bus/trip-prisma';

const prisma = new PrismaClient();

/** Layout 2+2: labels numéricos 1..40 (ex.: assento 15) */
const COLUMNS = 4;
const ROW_COUNT = 10;

type TripSeed = {
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  priceCents: number;
  companyName: string;
  soldLabels?: string[];
  heldLabels?: string[];
};

function buildSeats(opts: { soldLabels: string[]; heldLabels: string[] }) {
  const seats: {
    label: string;
    row: number;
    column: number;
    status: SeatStatus;
  }[] = [];

  let n = 1;
  for (let row = 1; row <= ROW_COUNT; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const label = String(n++);
      let status: SeatStatus = SeatStatus.AVAILABLE;
      if (opts.soldLabels.includes(label)) status = SeatStatus.SOLD;
      else if (opts.heldLabels.includes(label)) status = SeatStatus.HELD;
      seats.push({ label, row, column, status });
    }
  }

  return seats;
}

async function main() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Reservation"`);
  await prisma.seat.deleteMany();
  await prisma.trip.deleteMany();

  const trips: TripSeed[] = [
    {
      origin: 'Aracaju',
      destination: 'Salvador',
      departureAt: new Date('2026-09-10T08:00:00.000Z'),
      arrivalAt: new Date('2026-09-10T14:30:00.000Z'),
      priceCents: 8900,
      companyName: 'Nordeste Express',
      soldLabels: ['1', '2', '7', '17', '18', '32'],
      heldLabels: ['9'],
    },
    {
      origin: 'Aracaju',
      destination: 'Salvador',
      departureAt: new Date('2026-09-10T15:00:00.000Z'),
      arrivalAt: new Date('2026-09-10T21:15:00.000Z'),
      priceCents: 9900,
      companyName: 'Costa Verde',
      soldLabels: ['1', '2', '3', '4', '14', '21', '27', '33', '40'],
      heldLabels: ['5', '6'],
    },
    {
      origin: 'Aracaju',
      destination: 'Salvador',
      departureAt: new Date('2026-09-10T22:00:00.000Z'),
      arrivalAt: new Date('2026-09-11T04:45:00.000Z'),
      priceCents: 7900,
      companyName: 'Nordeste Express',
      soldLabels: ['13', '14'],
      heldLabels: [],
    },
    {
      origin: 'Salvador',
      destination: 'Aracaju',
      departureAt: new Date('2026-09-10T10:00:00.000Z'),
      arrivalAt: new Date('2026-09-10T16:00:00.000Z'),
      priceCents: 8900,
      companyName: 'Costa Verde',
      soldLabels: ['7', '8', '21'],
      heldLabels: ['1'],
    },
  ];

  for (const trip of trips) {
    const seats = buildSeats({
      soldLabels: trip.soldLabels ?? [],
      heldLabels: trip.heldLabels ?? [],
    });
    const availableSeats = seats.filter(
      (s) => s.status === SeatStatus.AVAILABLE,
    ).length;

    await prisma.trip.create({
      data: {
        origin: trip.origin,
        destination: trip.destination,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        priceCents: trip.priceCents,
        companyName: trip.companyName,
        availableSeats,
        seats: { create: seats },
      },
    });
  }

  console.log(
    `Seeded ${trips.length} trips with ${ROW_COUNT * COLUMNS} seats each (labels 1–40)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
