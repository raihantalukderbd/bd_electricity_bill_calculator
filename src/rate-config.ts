import { fallbackTariffSlabs } from './calculator';
import type { RateConfig, TariffSlab } from './types';

export const fallbackRateConfig: RateConfig = {
  currency: 'BDT',
  vatPercentage: 5,
  loadCount: 1,
  demandCharge: 42,
  meterRent: 40,
  customerType: 'Residential',
  slabs: cloneSlabs(fallbackTariffSlabs)
};

export async function loadRateConfig(): Promise<{ config: RateConfig; loadedFromJson: boolean; message: string }> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}electricity-rates.json`, {
  cache: 'no-store'
});
    if (!response.ok) throw new Error(`Config request failed with ${response.status}`);
    const config = normalizeConfig(await response.json());
    return { config, loadedFromJson: true, message: 'Rates loaded' };
  } catch (error) {
    console.warn('Failed to load electricity-rates.json. Fallback config is used.', error);
    return { config: cloneRateConfig(fallbackRateConfig), loadedFromJson: false, message: 'Fallback rates used' };
  }
}

export function normalizeConfig(value: any): RateConfig {
  return {
    currency: typeof value.currency === 'string' ? value.currency : fallbackRateConfig.currency,
    vatPercentage: safeNumber(value.vatPercentage, fallbackRateConfig.vatPercentage),
    loadCount: clampLoadCount(value.loadCount, fallbackRateConfig.loadCount),
    demandCharge: safeNumber(value.demandCharge, fallbackRateConfig.demandCharge),
    meterRent: safeNumber(value.meterRent, fallbackRateConfig.meterRent),
    customerType: typeof value.customerType === 'string' ? value.customerType : fallbackRateConfig.customerType,
    slabs: Array.isArray(value.slabs) && value.slabs.length > 0
      ? value.slabs.map((slab: any, index: number) => normalizeSlab(slab, index))
      : cloneSlabs(fallbackTariffSlabs)
  };
}

export function cloneRateConfig(config: RateConfig): RateConfig {
  return { ...config, slabs: cloneSlabs(config.slabs) };
}

export function cloneSlabs(slabs: TariffSlab[]): TariffSlab[] {
  return slabs.map((slab) => ({ ...slab }));
}

function normalizeSlab(value: any, index: number): TariffSlab {
  return {
    id: typeof value.id === 'string' ? value.id : `slab-${index + 1}`,
    title: typeof value.title === 'string' ? value.title : `Slab ${index + 1}`,
    fromUnit: safeNumber(value.fromUnit, 0),
    toUnit: value.toUnit === null ? null : safeNumber(value.toUnit, 0),
    maxUnit: value.maxUnit === null ? null : safeNumber(value.maxUnit, 0),
    rate: safeNumber(value.rate, 0)
  };
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampLoadCount(value: unknown, fallback: number): number {
  const parsed = Math.round(safeNumber(value, fallback));
  return Math.min(8, Math.max(1, parsed || fallback));
}
