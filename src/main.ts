import './style.css';
import { calculateElectricityBill, sanitizeNumber } from './calculator';
import { cloneRateConfig, loadRateConfig } from './rate-config';
import type { BillSummary, RateConfig, SlabCalculation, TariffSlab } from './types';

type ViewName = 'calculator' | 'rates';

interface AppState {
  activeView: ViewName;
  totalUnit: number;
  loadCount: number;
  demandCharge: number;
  meterRent: number;
  vatPercentage: number;
  customerType: string;
  currency: string;
  slabs: TariffSlab[];
  defaultConfig: RateConfig | null;
  configMessage: string;
  loadedFromJson: boolean;
}

const MIN_LOAD_COUNT = 1;
const MAX_LOAD_COUNT = 8;

const state: AppState = {
  activeView: 'calculator',
  totalUnit: 210.66,
  loadCount: 1,
  demandCharge: 42,
  meterRent: 40,
  vatPercentage: 5,
  customerType: 'Residential',
  currency: 'BDT',
  slabs: [],
  defaultConfig: null,
  configMessage: 'Loading rates...',
  loadedFromJson: false
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root element was not found.');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="BD Bill home"><span class="brand-icon">⚡</span><span>BD Bill</span></a>
    <nav class="nav-tabs desktop-nav" aria-label="Primary navigation">
      <button type="button" class="nav-link" data-view="calculator"><span>⌘</span><strong>Calculator</strong></button>
      <button type="button" class="nav-link" data-view="rates"><span>☷</span><strong>Rates</strong></button>
    </nav>
    <button type="button" class="sync-button" id="syncButton" title="Reload JSON rates" aria-label="Reload JSON rates">↻</button>
  </header>

  <main class="app-shell">
    <div class="status-pill" id="statusPill"><span></span><strong>Loading rates...</strong></div>
    <section id="calculatorView"></section>
    <section id="ratesView" hidden></section>
  </main>

  <nav class="bottom-tabs" aria-label="Mobile navigation">
    <button type="button" class="bottom-tab" data-view="calculator"><span>⌘</span><strong>Calculator</strong></button>
    <button type="button" class="bottom-tab" data-view="rates"><span>☷</span><strong>Rates</strong></button>
  </nav>
`;

const elements = {
  calculatorView: getElement<HTMLElement>('calculatorView'),
  ratesView: getElement<HTMLElement>('ratesView'),
  statusPill: getElement<HTMLElement>('statusPill'),
  syncButton: getElement<HTMLButtonElement>('syncButton'),
  navButtons: Array.prototype.slice.call(document.querySelectorAll<HTMLButtonElement>('[data-view]')) as HTMLButtonElement[]
};

function setStateFromConfig(config: RateConfig): void {
  state.loadCount = clampLoadCount(config.loadCount);
  state.demandCharge = config.demandCharge;
  state.meterRent = config.meterRent;
  state.vatPercentage = config.vatPercentage;
  state.customerType = config.customerType;
  state.currency = config.currency;
  state.slabs = config.slabs.map((slab) => ({ ...slab }));
}

async function initialize(): Promise<void> {
  const result = await loadRateConfig();
  state.defaultConfig = cloneRateConfig(result.config);
  state.loadedFromJson = result.loadedFromJson;
  state.configMessage = result.message;
  setStateFromConfig(result.config);
  bindShellEvents();
  render();
}

function bindShellEvents(): void {
  elements.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view as ViewName;
      render();
    });
  });

  elements.syncButton.addEventListener('click', async () => {
    state.configMessage = 'Loading rates...';
    renderStatus();
    const result = await loadRateConfig();
    state.defaultConfig = cloneRateConfig(result.config);
    state.loadedFromJson = result.loadedFromJson;
    state.configMessage = result.message;
    setStateFromConfig(result.config);
    render();
  });
}

function render(): void {
  const summary = getSummary();
  renderStatus();
  renderNavigation();
  renderCalculator(summary);
  renderRates(summary);
  elements.calculatorView.hidden = state.activeView !== 'calculator';
  elements.ratesView.hidden = state.activeView !== 'rates';
}

function renderStatus(): void {
  elements.statusPill.className = `status-pill ${state.loadedFromJson ? 'success' : 'warning'}`;
  elements.statusPill.innerHTML = `<span></span><strong>${state.configMessage}</strong>`;
}

function renderNavigation(): void {
  elements.navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === state.activeView));
}

function getSummary(): BillSummary {
  return calculateElectricityBill({
    totalUnit: state.totalUnit,
    loadCount: state.loadCount,
    demandCharge: state.demandCharge,
    meterRent: state.meterRent,
    vatPercentage: state.vatPercentage,
    slabs: state.slabs
  });
}

function renderCalculator(summary: BillSummary): void {
  const usedSlabs = summary.slabCalculations.filter((slab) => slab.usedUnit > 0);
  elements.calculatorView.innerHTML = `
    <div class="page-heading compact-heading">
      <div><p class="eyebrow">Residential Utility Calculator</p><h1>Calculate your electricity bill.</h1><p>Minimal, accurate, and JSON-powered bill calculation for Bangladesh electricity slabs.</p></div>
    </div>

    <div class="dashboard-grid">
      <div class="main-column">
        <form class="card bill-card" id="billForm">
          <div class="card-title"><span>☷</span><h2>Bill Parameters</h2></div>
          <div class="input-grid">
            ${renderInput('totalUnit', 'Total Consumed Unit', state.totalUnit, 'kWh')}
            ${renderLoadStepper()}
            ${renderInput('demandCharge', 'Demand Charge', state.demandCharge, 'BDT', '৳')}
            ${renderInput('vatPercentage', 'VAT', state.vatPercentage, '%')}
            ${renderInput('meterRent', 'Meter Rent', state.meterRent, 'BDT', '৳')}
          </div>
        </form>

        <section class="card slab-card">
          <div class="section-header"><div><p class="eyebrow">Usage Details</p><h2>Slab Breakdown</h2></div><span class="chip">${state.customerType}</span></div>
          <div class="table-wrap">
            <table class="data-table responsive-table">
              <thead><tr><th>Step</th><th>Stepped charge details</th><th class="numeric">Amount</th></tr></thead>
              <tbody>${usedSlabs.map((slab, index) => renderCalculatorSlabRow(slab, index, usedSlabs.length)).join('')}${renderSteppedChargeSummary(summary.energyCharge)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="card summary-card">
        <p class="eyebrow">Payable Amount</p><h2>Bill Summary</h2>
        <div class="summary-lines">
          ${renderSummaryLine('Energy Charge', summary.energyCharge)}
          ${renderSummaryLine('Demand Charge', summary.totalDemandCharge)}
          ${renderSummaryLine('Meter Rent', summary.meterRent)}
          <div class="line-separator"></div>
          ${renderSummaryLine('Subtotal', summary.subtotal)}
          ${renderSummaryLine(`VAT <small>${formatNumber(state.vatPercentage)}%</small>`, summary.vatAmount)}
        </div>
        <div class="total-card bottom-total"><span>Total Payable Bill</span><strong>${formatCurrency(summary.totalBill)}</strong></div>
        <button type="button" class="primary-action" id="downloadButton">Print A5 PDF Statement</button>
      </aside>
    </div>
  `;
  bindCalculatorEvents();
}

function renderRates(summary: BillSummary): void {
  elements.ratesView.innerHTML = `
    <div class="page-heading compact-heading"><div><p class="eyebrow">JSON Rate Management</p><h1>Rate configuration.</h1><p>Update tariff rates, global billing parameters, and reset values from the loaded JSON file.</p></div></div>
    <div class="rates-grid">
      <section class="rate-table-card cardless">
        <div class="section-header rate-header"><div><p class="eyebrow">Tariff Slabs</p><h2>Editable Rates</h2></div><button type="button" class="dashed-action compact" id="addSlabButton">＋ Add Slab</button></div>
        <div class="rate-table-wrap"><table class="rate-table responsive-table"><thead><tr><th>Slab Range</th><th>Rate</th><th>Max Amount</th><th class="numeric">Action</th></tr></thead><tbody>${state.slabs.map((slab, index) => renderRateConfigRow(slab, index)).join('')}</tbody></table></div>
      </section>
      <aside class="card global-card">
        <div class="card-title"><span>☷</span><h2>Global Parameters</h2></div>
        <div class="global-form">
          ${renderInput('rateVatPercentage', 'Value Added Tax', state.vatPercentage, '%')}
          ${renderInput('rateDemandCharge', 'Demand Charge', state.demandCharge, 'BDT / kW')}
          ${renderInput('rateMeterRent', 'Meter Rent', state.meterRent, 'BDT')}
        </div>
        <div class="preview-box"><span>Current preview</span><strong>${formatCurrency(summary.totalBill)}</strong></div>
        <button type="button" class="primary-action" id="saveRatesButton">Apply Changes</button>
        <button type="button" class="ghost-action" id="resetDefaultsButton">Reset to Defaults</button>
      </aside>
    </div>
  `;
  bindRatesEvents();
}

function renderInput(id: string, label: string, value: number, suffix: string, prefix = ''): string {
  return `<label class="field" for="${id}"><span>${label}</span><div class="input-shell">${prefix ? `<em>${prefix}</em>` : ''}<input id="${id}" type="number" min="0" step="${id === 'totalUnit' ? '0.000001' : '0.01'}" value="${id === 'totalUnit' ? formatDecimalInput(value) : value}" /><b>${suffix}</b></div></label>`;
}

function renderLoadStepper(): string {
  return `<div class="field"><span>Load Count</span><div class="stepper-shell" aria-label="Load count stepper"><button type="button" class="stepper-button" id="decreaseLoadCount" aria-label="Decrease load count" ${state.loadCount <= MIN_LOAD_COUNT ? 'disabled' : ''}>-</button><div class="stepper-value"><input id="loadCount" type="number" min="${MIN_LOAD_COUNT}" max="${MAX_LOAD_COUNT}" step="1" value="${state.loadCount}" aria-label="Load count" /><small>kW</small></div><button type="button" class="stepper-button" id="increaseLoadCount" aria-label="Increase load count" ${state.loadCount >= MAX_LOAD_COUNT ? 'disabled' : ''}>+</button></div><small class="field-help">Use - / + to change by 1. Maximum ${MAX_LOAD_COUNT}.</small></div>`;
}

function renderCalculatorSlabRow(slab: SlabCalculation, index: number, totalUsedRows: number): string {
  return `<tr class="${index === totalUsedRows - 1 ? 'active-row' : ''}"><td data-label="Step"><span class="dot dot-${index % 7}"></span>Step ${index + 1}</td><td data-label="Details" class="charge-detail">${formatUnitSix(slab.usedUnit)} kWh at ৳${formatRate(slab.rate)} per kWh</td><td data-label="Amount" class="numeric strong">${formatCurrency(slab.amount)}</td></tr>`;
}

function renderSteppedChargeSummary(energyCharge: number): string {
  return `<tr class="summary-row"><td data-label="Summary" colspan="2">Summary of stepped charges</td><td data-label="Amount" class="numeric strong">${formatCurrency(energyCharge)}</td></tr>`;
}

function renderRateConfigRow(slab: TariffSlab, index: number): string {
  const maxAmount = slab.maxUnit === null ? 'Open' : `${formatCurrency(slab.maxUnit * slab.rate)}`;
  return `<tr><td data-label="Slab Range"><span class="bar bar-${index % 7}"></span><input class="inline-input range-input" value="${escapeHtml(slab.title)}" data-slab-title="${index}" /></td><td data-label="Rate"><input class="inline-input" type="number" min="0" step="0.01" value="${slab.rate}" data-slab-rate="${index}" /></td><td data-label="Max Amount">${maxAmount}</td><td data-label="Action" class="numeric"><button type="button" class="icon-button" data-remove-slab="${index}" ${state.slabs.length <= 1 ? 'disabled' : ''}>×</button></td></tr>`;
}

function renderSummaryLine(label: string, value: number): string {
  return `<div class="summary-line"><span>${label}</span><strong>${formatCurrency(value)}</strong></div>`;
}

function bindCalculatorEvents(): void {
  ['totalUnit', 'demandCharge', 'vatPercentage', 'meterRent'].forEach((id) => {
    const input = getElement<HTMLInputElement>(id);
    input.addEventListener('input', () => { updateStateFromCalculatorInputs(); render(); });
  });
  const loadInput = getElement<HTMLInputElement>('loadCount');
  loadInput.addEventListener('input', () => { state.loadCount = clampLoadCount(loadInput.value); render(); });
  getElement<HTMLButtonElement>('decreaseLoadCount').addEventListener('click', () => { state.loadCount = clampLoadCount(state.loadCount - 1); render(); });
  getElement<HTMLButtonElement>('increaseLoadCount').addEventListener('click', () => { state.loadCount = clampLoadCount(state.loadCount + 1); render(); });
  getElement<HTMLButtonElement>('downloadButton').addEventListener('click', printA5PdfStatement);
}

function bindRatesEvents(): void {
  const rateVat = getElement<HTMLInputElement>('rateVatPercentage');
  const demand = getElement<HTMLInputElement>('rateDemandCharge');
  const meter = getElement<HTMLInputElement>('rateMeterRent');
  rateVat.addEventListener('input', () => { state.vatPercentage = sanitizeNumber(rateVat.value); render(); });
  demand.addEventListener('input', () => { state.demandCharge = sanitizeNumber(demand.value); render(); });
  meter.addEventListener('input', () => { state.meterRent = sanitizeNumber(meter.value); render(); });
  document.querySelectorAll<HTMLInputElement>('[data-slab-rate]').forEach((input) => input.addEventListener('input', () => { const index = Number(input.dataset.slabRate); if (state.slabs[index]) { state.slabs[index].rate = sanitizeNumber(input.value); render(); } }));
  document.querySelectorAll<HTMLInputElement>('[data-slab-title]').forEach((input) => input.addEventListener('input', () => { const index = Number(input.dataset.slabTitle); if (state.slabs[index]) state.slabs[index].title = input.value; }));
  document.querySelectorAll<HTMLButtonElement>('[data-remove-slab]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.removeSlab); state.slabs.splice(index, 1); render(); }));
  getElement<HTMLButtonElement>('addSlabButton').addEventListener('click', () => { state.slabs.push({ id: `slab-${Date.now()}`, title: 'New Slab', fromUnit: 0, toUnit: null, maxUnit: null, rate: 0 }); render(); });
  getElement<HTMLButtonElement>('resetDefaultsButton').addEventListener('click', () => { if (!state.defaultConfig) return; setStateFromConfig(cloneRateConfig(state.defaultConfig)); render(); });
}

function updateStateFromCalculatorInputs(): void {
  state.totalUnit = sanitizeNumber(getElement<HTMLInputElement>('totalUnit').value);
  state.demandCharge = sanitizeNumber(getElement<HTMLInputElement>('demandCharge').value);
  state.vatPercentage = sanitizeNumber(getElement<HTMLInputElement>('vatPercentage').value);
  state.meterRent = sanitizeNumber(getElement<HTMLInputElement>('meterRent').value);
}

function clampLoadCount(value: unknown): number {
  const parsed = Math.round(sanitizeNumber(value));
  return Math.min(MAX_LOAD_COUNT, Math.max(MIN_LOAD_COUNT, parsed || MIN_LOAD_COUNT));
}

function printA5PdfStatement(): void {
  const summary = getSummary();
  const usedSlabs = summary.slabCalculations.filter((slab) => slab.usedUnit > 0);
  const reportDate = new Date();
  const invoiceNo = `BD-${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}-${String(Math.round(summary.totalUnit * 100)).padStart(5, '0')}`;
  const slabRows = usedSlabs.map((slab, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(`${formatUnitSix(slab.usedUnit)} kWh at ৳${formatRate(slab.rate)} per kWh`)}</td><td class="amount">${escapeHtml(formatCurrency(slab.amount))}</td></tr>`).join('');
  const reportHtml = buildA5ReportHtml(summary, slabRows, reportDate, invoiceNo);
  printHtmlDirectly(reportHtml);
}

function buildA5ReportHtml(summary: BillSummary, slabRows: string, reportDate: Date, invoiceNo: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>BD Bill Statement - ${invoiceNo}</title><style>${getA5ReportCss()}</style></head><body><main class="page"><header class="report-header"><div><div class="brand-row"><span class="brand-mark">⚡</span><span>BD Bill</span></div><p class="subtitle">A5 electricity bill statement generated from JSON tariff rates.</p></div><div class="invoice-meta"><strong>Statement</strong>No: ${escapeHtml(invoiceNo)}<br />Date: ${escapeHtml(formatDate(reportDate))}</div></header><section class="summary-band"><div class="mini-card"><span>Total Consumed Unit</span><strong>${escapeHtml(formatUnitSix(summary.totalUnit))} kWh</strong></div><div class="mini-card"><span>Customer Type</span><strong>${escapeHtml(state.customerType)}</strong></div><div class="mini-card"><span>Load Count</span><strong>${state.loadCount} kW</strong></div><div class="mini-card"><span>VAT</span><strong>${escapeHtml(formatNumber(state.vatPercentage))}%</strong></div></section><h2>Stepped Charge Breakdown</h2><table><thead><tr><th style="width:14%">Step</th><th>Charge Details</th><th style="width:28%;text-align:right">Amount</th></tr></thead><tbody>${slabRows}<tr class="summary-row"><td colspan="2">Summary of stepped charges</td><td class="amount">${escapeHtml(formatCurrency(summary.energyCharge))}</td></tr></tbody></table><section class="totals"><div class="total-line"><span>Energy Charge</span><strong>${escapeHtml(formatCurrency(summary.energyCharge))}</strong></div><div class="total-line"><span>Demand Charge</span><strong>${escapeHtml(formatCurrency(summary.totalDemandCharge))}</strong></div><div class="total-line"><span>Meter Rent</span><strong>${escapeHtml(formatCurrency(summary.meterRent))}</strong></div><div class="total-line"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(summary.subtotal))}</strong></div><div class="total-line"><span>VAT Amount</span><strong>${escapeHtml(formatCurrency(summary.vatAmount))}</strong></div><div class="grand-total"><span>Total Payable Bill</span><strong>${escapeHtml(formatCurrency(summary.totalBill))}</strong></div></section><p class="note">This bill opens directly in the browser print dialog. Choose Save as PDF and keep paper size A5 for best output.</p><footer class="footer"><span>Generated by BD Bill</span><span>Rates source: electricity-rates.json</span></footer></main></body></html>`;
}

function getA5ReportCss(): string {
  return `@page{size:A5 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:Inter,Segoe UI,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:128mm;min-height:190mm;margin:0 auto;background:#fff}.report-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #dbe4f0;padding-bottom:14px;margin-bottom:16px}.brand-row{display:flex;align-items:center;gap:8px;font-weight:800;font-size:22px;color:#004ac6;letter-spacing:-.03em}.brand-mark{width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:white;background:linear-gradient(135deg,#2563eb,#14b8a6);font-size:18px}.subtitle{margin:5px 0 0;color:#64748b;font-size:11px;line-height:1.45}.invoice-meta{text-align:right;font-size:10px;color:#475569;line-height:1.7}.invoice-meta strong{display:block;color:#0f172a;font-size:12px;letter-spacing:.04em;text-transform:uppercase}.summary-band{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}.mini-card{border:1px solid #e2e8f0;border-radius:14px;padding:10px;background:#f8fafc}.mini-card span{display:block;color:#64748b;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}.mini-card strong{display:block;font-size:15px;color:#0f172a}h2{font-size:14px;margin:16px 0 8px;letter-spacing:-.02em}table{width:100%;border-collapse:collapse;font-size:10px}thead th{text-align:left;background:#f1f5f9;color:#475569;padding:8px;border:1px solid #e2e8f0;font-weight:800;text-transform:uppercase;letter-spacing:.06em}tbody td{padding:8px;border:1px solid #e2e8f0;vertical-align:top}.amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}.summary-row td{background:#f8fafc;font-weight:800}.totals{margin-top:14px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}.total-line{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;font-size:10px;border-bottom:1px solid #e2e8f0}.total-line strong{font-variant-numeric:tabular-nums}.grand-total{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;color:white;background:linear-gradient(135deg,#2563eb,#14b8a6)}.grand-total span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;opacity:.9}.grand-total strong{font-size:24px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.note{margin-top:14px;border-radius:12px;background:#eff6ff;color:#1e3a8a;padding:10px;font-size:9px;line-height:1.55}.footer{display:flex;justify-content:space-between;gap:12px;color:#64748b;font-size:9px;margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0}@media print{html,body{background:#fff}.page{width:auto;min-height:auto;margin:0}}`;
}

function printHtmlDirectly(html: string): void {
  const oldFrame = document.getElementById('a5PrintFrame');
  if (oldFrame) oldFrame.remove();
  const frame = document.createElement('iframe');
  frame.id = 'a5PrintFrame';
  frame.title = 'A5 PDF print frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.visibility = 'hidden';
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    alert('Print frame could not be created. Please try again.');
    frame.remove();
    return;
  }
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frame.onload = () => {
    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 200);
  };
  frameWindow.onafterprint = () => setTimeout(() => frame.remove(), 400);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} was not found.`);
  return element as T;
}

function formatCurrency(value: number): string {
  return `৳ ${new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}
function formatUnitSix(value: number): string {
  return new Intl.NumberFormat('en-BD', { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value);
}
function formatRate(value: number): string {
  return new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
function formatDecimalInput(value: number): string {
  return String(value);
}
function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-BD', { year: 'numeric', month: 'short', day: '2-digit' }).format(value);
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

initialize();
