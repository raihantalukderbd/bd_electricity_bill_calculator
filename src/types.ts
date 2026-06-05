export interface TariffSlab {
  id: string;
  title: string;
  fromUnit: number;
  toUnit: number | null;
  maxUnit: number | null;
  rate: number;
}

export interface RateConfig {
  currency: string;
  vatPercentage: number;
  loadCount: number;
  demandCharge: number;
  meterRent: number;
  customerType: string;
  slabs: TariffSlab[];
}

export interface SlabCalculation extends TariffSlab {
  usedUnit: number;
  amount: number;
}

export interface BillInput {
  totalUnit: number;
  loadCount: number;
  demandCharge: number;
  meterRent: number;
  vatPercentage: number;
  slabs: TariffSlab[];
}

export interface BillSummary {
  totalUnit: number;
  energyCharge: number;
  totalDemandCharge: number;
  meterRent: number;
  subtotal: number;
  vatAmount: number;
  totalBill: number;
  slabCalculations: SlabCalculation[];
}
