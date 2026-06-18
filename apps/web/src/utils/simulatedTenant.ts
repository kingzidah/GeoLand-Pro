/**
 * Deterministically derives plausible tenant details from a plot ID.
 * Used only in the simulation map's popups — purely client-side display data,
 * not persisted, so the simulation never creates fake user/lease records.
 */

const FIRST_NAMES = [
  'Kwame', 'Ama', 'Kofi', 'Akosua', 'Yaw', 'Abena', 'Kwabena', 'Adwoa',
  'Kwesi', 'Efua', 'Kojo', 'Esi', 'Kwaku', 'Akua', 'Yaa', 'Fiifi',
  'Nana', 'Adjoa', 'Kweku', 'Afia',
];

const LAST_NAMES = [
  'Mensah', 'Owusu', 'Asante', 'Boateng', 'Appiah', 'Agyeman', 'Darko',
  'Acheampong', 'Sarpong', 'Amponsah', 'Frimpong', 'Adjei', 'Ofori',
  'Antwi', 'Yeboah', 'Gyamfi', 'Osei', 'Kusi', 'Bonsu', 'Annan',
];

const OCCUPATIONS = [
  'Teacher', 'Nurse', 'Civil Servant', 'Trader', 'Farmer', 'Driver',
  'Software Engineer', 'Accountant', 'Electrician', 'Tailor', 'Mechanic',
  'Banker', 'Police Officer', 'Pharmacist', 'Carpenter', 'Caterer',
];

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

export interface SimulatedTenant {
  fullName: string;
  phone: string;
  occupation: string;
  leaseStart: string; // ISO date
  monthlyRentGHS: number;
  totalPaidMonths: number;
  arrearsGHS: number;
}

export function getSimulatedTenant(plotId: string): SimulatedTenant {
  const rand = mulberry32(hashSeed(plotId));

  const firstName = pick(FIRST_NAMES, rand);
  const lastName = pick(LAST_NAMES, rand);
  const occupation = pick(OCCUPATIONS, rand);

  const phoneSuffix = String(Math.floor(rand() * 9_000_000) + 1_000_000);
  const phone = `+233 ${phoneSuffix.slice(0, 2)} ${phoneSuffix.slice(2, 5)} ${phoneSuffix.slice(5)}`;

  const monthsAgo = Math.floor(rand() * 36) + 1;
  const leaseStart = new Date();
  leaseStart.setMonth(leaseStart.getMonth() - monthsAgo);

  const monthlyRentGHS = Math.round((300 + rand() * 900) / 10) * 10;
  const totalPaidMonths = Math.max(0, monthsAgo - Math.floor(rand() * 3));
  const arrearsMonths = Math.max(0, monthsAgo - totalPaidMonths);
  const arrearsGHS = arrearsMonths * monthlyRentGHS;

  return {
    fullName: `${firstName} ${lastName}`,
    phone,
    occupation,
    leaseStart: leaseStart.toISOString(),
    monthlyRentGHS,
    totalPaidMonths,
    arrearsGHS,
  };
}
