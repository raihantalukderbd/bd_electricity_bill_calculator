import type { BillInput, BillSummary, SlabCalculation, TariffSlab } from './types';

export const fallbackTariffSlabs: TariffSlab[] = [
  { id: 'slab-1', title: '0 - 50', fromUnit: 0, toUnit: 50, maxUnit: 50, rate: 4.63 },
  { id: 'slab-2', title: '51 - 75', fromUnit: 51, toUnit: 75, maxUnit: 25, rate: 5.26 },
  { id: 'slab-3', title: '76 - 200', fromUnit: 76, toUnit: 200, maxUnit: 125, rate: 7.2 },
  { id: 'slab-4', title: '201 - 300', fromUnit: 201, toUnit: 300, maxUnit: 100, rate: 7.59 },
  { id: 'slab-5', title: '301 - 400', fromUnit: 301, toUnit: 400, maxUnit: 100, rate: 8.02 },
  { id: 'slab-6', title: '401 - 600', fromUnit: 401, toUnit: 600, maxUnit: 200, rate: 12.67 },
  { id: 'slab-7', title: 'Above 600', fromUnit: 601, toUnit: null, maxUnit: null, rate: 14.61 }
];

export function calculateElectricityBill(input: BillInput): BillSummary {
  let remainingUnit = sanitizeNumber(input.totalUnit);

  const slabCalculations: SlabCalculation[] = input.slabs.map((slab) => {
    const usedUnit = slab.maxUnit === null
      ? Math.max(remainingUnit, 0)
      : Math.min(Math.max(remainingUnit, 0), slab.maxUnit);

    remainingUnit -= usedUnit;

    return {
      ...slab,
      usedUnit: roundSix(usedUnit),
      amount: roundTwo(usedUnit * sanitizeNumber(slab.rate))
    };
  });

  const energyCharge = roundTwo(slabCalculations.reduce((sum, slab) => sum + slab.amount, 0));
  const totalDemandCharge = roundTwo(sanitizeNumber(input.loadCount) * sanitizeNumber(input.demandCharge));
  const meterRent = roundTwo(sanitizeNumber(input.meterRent));
  const subtotal = roundTwo(energyCharge + totalDemandCharge + meterRent);
  const vatAmount = roundTwo(subtotal * (sanitizeNumber(input.vatPercentage) / 100));
  const totalBill = roundTwo(subtotal + vatAmount);

  return {
    totalUnit: sanitizeNumber(input.totalUnit),
    energyCharge,
    totalDemandCharge,
    meterRent,
    subtotal,
    vatAmount,
    totalBill,
    slabCalculations
  };
}

export function sanitizeNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function roundTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundSix(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}
