import { PrismaClient, SeatStatus } from '@prisma/client';

const prisma = new PrismaClient();

/** Layout 2+2: A B | corredor | C D */
const COLUMNS = [
  { column: 0, label: 'A' },
  { column: 1, label: 'B' },
  { column: 2, label: 'C' },
  { column: 3, label: 'D' },
] as const;

const ROW_COUNT = 10;

type TripSeed = {
  origin: string;
  destination: string;
  departureAt: Date;
  arrivalAt: Date;
  priceCents: number;
  companyName: string;
  /** Labels already taken (SOLD) for demo, e.g. ['1A', '3C'] */
  soldLabels?: string[];
  heldLabels?: string[];
};

function buildSeats(opts: {
  soldLabels: string[];
  heldLabels: string[];
}) {
  const seats: {
    label: string;
    row: number;
    column: number;
    status: SeatStatus;
  }[] = [];

  for (let row = 1; row <= ROW_COUNT; row++) {
    for (const col of COLUMNS) {
      const label = `${row}${col.label}`;
      let status: SeatStatus = SeatStatus.AVAILABLE;
      if (opts.soldLabels.includes(label)) status = SeatStatus.SOLD;
      else if (opts.heldLabels.includes(label)) status = SeatStatus.HELD;
      seats.push({ label, row, column: col.column, status });
    }
  }

  return seats;
}

async function main() {
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
      soldLabels: ['1A', '1B', '2C', '5A', '5B', '8D'],
      heldLabels: ['3A'],
    },
    {
      origin: 'Aracaju',
      destination: 'Salvador',
      departureAt: new Date('2026-09-10T15:00:00.000Z'),
      arrivalAt: new Date('2026-09-10T21:15:00.000Z'),
      priceCents: 9900,
      companyName: 'Costa Verde',
      soldLabels: ['1A', '1B', '1C', '1D', '4B', '6A', '7C', '9A', '10D'],
      heldLabels: ['2A', '2B'],
    },
    {
      origin: 'Aracaju',
      destination: 'Salvador',
      departureAt: new Date('2026-09-10T22:00:00.000Z'),
      arrivalAt: new Date('2026-09-11T04:45:00.000Z'),
      priceCents: 7900,
      companyName: 'Nordeste Express',
      soldLabels: ['4A', '4B'],
      heldLabels: [],
    },
    {
      origin: 'Salvador',
      destination: 'Aracaju',
      departureAt: new Date('2026-09-10T10:00:00.000Z'),
      arrivalAt: new Date('2026-09-10T16:00:00.000Z'),
      priceCents: 8900,
      companyName: 'Costa Verde',
      soldLabels: ['2C', '2D', '6A'],
      heldLabels: ['1A'],
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
    `Seeded ${trips.length} trips with ${ROW_COUNT * COLUMNS.length} seats each`,
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
