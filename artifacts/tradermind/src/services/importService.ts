/**
 * importService.ts  —  Prompt 23
 * CSV / JSON trade import with column mapping, validation, and duplicate detection.
 * 100% offline — never touches any external endpoint.
 */

import { db, Trade, defaultPostTradeReview } from '../db/database';
import { tradeService } from './tradeService';
import { normalizeImportedTradeFields } from '../lib/tradeClassification';
import { parseTradingDateTimeInput } from '../lib/tradingTime';

// ─── Column mapping ──────────────────────────────────────────────────────────

export const IMPORT_FIELDS = [
  { key: 'symbol',       label: 'نماد',                required: true  },
  { key: 'direction',    label: 'جهت (long/short)',     required: true  },
  { key: 'entryPrice',   label: 'قیمت ورود',            required: true  },
  { key: 'exitPrice',    label: 'قیمت خروج',            required: false },
  { key: 'stopLoss',     label: 'حد ضرر',               required: false },
  { key: 'takeProfit',   label: 'حد سود',               required: false },
  { key: 'positionSize', label: 'حجم پوزیشن',           required: false },
  { key: 'profitLoss',   label: 'سود/زیان',             required: false },
  { key: 'rMultiple',    label: 'R Multiple',            required: false },
  { key: 'riskPercentage', label: 'درصد ریسک',          required: false },
  { key: 'riskAmount',   label: 'مبلغ ریسک',            required: false },
  { key: 'result',       label: 'نتیجه (win/loss/…)',   required: false },
  { key: 'openedAt',     label: 'تاریخ/ساعت ورود',      required: false },
  { key: 'closedAt',     label: 'تاریخ/ساعت خروج',      required: false },
  { key: 'fees',         label: 'سایر هزینه‌ها (Fee)',   required: false },
  { key: 'commission',   label: 'کمیسیون',              required: false },
  { key: 'spread',       label: 'اسپرد (هزینه)',         required: false },
  { key: 'swap',         label: 'سواپ (علامت‌دار؛ منفی = هزینه)', required: false },
  { key: 'market',       label: 'بازار',                required: false },
  { key: 'tags',         label: 'تگ‌ها',               required: false },
  { key: 'notes',        label: 'یادداشت',              required: false },
  { key: 'tradingSession', label: 'سشن معاملاتی',       required: false },
  { key: 'setupType',    label: 'نوع ستاپ',             required: false },
  { key: 'entryReason',  label: 'دلیل ورود',            required: false },
  { key: 'lesson',       label: 'درس',                  required: false },
  { key: 'ignore',       label: '— نادیده گرفتن —',    required: false },
] as const;

export type ImportFieldKey = typeof IMPORT_FIELDS[number]['key'];

export type ColumnMapping = Record<string, ImportFieldKey>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedRecord {
  raw: Record<string, string>;
  mapped: Partial<Record<ImportFieldKey, string>>;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  duplicateTradeId: string | null;
}

export interface ImportPreview {
  headers: string[];
  rows: ParsedRecord[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // بررسی delimiter (کاما یا سمی‌کالن)
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim()); current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Auto-map columns ────────────────────────────────────────────────────────

const AUTO_MAP_HINTS: Record<string, ImportFieldKey> = {
  symbol: 'symbol', ticker: 'symbol', pair: 'symbol', instrument: 'symbol',
  direction: 'direction', side: 'direction', type: 'direction', buy_sell: 'direction',
  entry: 'entryPrice', entry_price: 'entryPrice', entryprice: 'entryPrice', open: 'entryPrice', open_price: 'entryPrice', openprice: 'entryPrice',
  exit: 'exitPrice', exit_price: 'exitPrice', exitprice: 'exitPrice', close: 'exitPrice', close_price: 'exitPrice', closeprice: 'exitPrice',
  sl: 'stopLoss', stop: 'stopLoss', stop_loss: 'stopLoss', stoploss: 'stopLoss',
  tp: 'takeProfit', target: 'takeProfit', take_profit: 'takeProfit', takeprofit: 'takeProfit', takeprofitprice: 'takeProfit',
  pnl: 'profitLoss', profit: 'profitLoss', profitloss: 'profitLoss', profit_loss: 'profitLoss', loss: 'profitLoss', pl: 'profitLoss', p_l: 'profitLoss',
  size: 'positionSize', positionsize: 'positionSize', volume: 'positionSize', qty: 'positionSize', quantity: 'positionSize',
  r: 'rMultiple', r_multiple: 'rMultiple', rmultiple: 'rMultiple',
  risk_pct: 'riskPercentage', risk_percent: 'riskPercentage', riskpercentage: 'riskPercentage',
  risk_amount: 'riskAmount', riskamount: 'riskAmount', risk: 'riskAmount',
  result: 'result', outcome: 'result', win_loss: 'result',
  date: 'openedAt', openedat: 'openedAt', open_time: 'openedAt', entry_time: 'openedAt', datetime: 'openedAt',
  close_time: 'closedAt', closedat: 'closedAt', exit_time: 'closedAt', exit_date: 'closedAt',
  fee: 'fees', fees: 'fees', commission: 'commission', comm: 'commission', spread: 'spread', swap: 'swap',
  market: 'market', asset_class: 'market',
  tag: 'tags', tags: 'tags', labels: 'tags',
  note: 'notes', notes: 'notes', comment: 'notes', comments: 'notes',
  session: 'tradingSession', trading_session: 'tradingSession', tradingsession: 'tradingSession',
  setup: 'setupType', setup_type: 'setupType', setuptype: 'setupType',
  reason: 'entryReason', entry_reason: 'entryReason', entryreason: 'entryReason',
  lesson: 'lesson', learning: 'lesson',
};

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const key = h.toLowerCase().replace(/\s+/g, '_');
    if (AUTO_MAP_HINTS[key]) {
      mapping[h] = AUTO_MAP_HINTS[key];
    } else {
      mapping[h] = 'ignore';
    }
  }
  return mapping;
}

// ─── Normalise direction ─────────────────────────────────────────────────────

function normaliseDirection(val: string): 'long' | 'short' | null {
  const v = val.toLowerCase().trim();
  if (['long', 'buy', 'b', 'l', '1', 'خرید'].includes(v)) return 'long';
  if (['short', 'sell', 's', '-1', '0', 'فروش'].includes(v)) return 'short';
  return null;
}

function normaliseResult(val: string): Trade['result'] | null {
  const v = val.toLowerCase().trim();
  const map: Record<string, Trade['result']> = {
    win: 'win', سود: 'win', profit: 'win', w: 'win',
    loss: 'loss', ضرر: 'loss', l: 'loss',
    breakeven: 'breakeven', be: 'breakeven', 'سر به سر': 'breakeven',
    'partial-win': 'partial-win', 'سود جزئی': 'partial-win', pw: 'partial-win',
    'partial-loss': 'partial-loss', 'ضرر جزئی': 'partial-loss', pl: 'partial-loss',
    open: 'open', باز: 'open',
    cancelled: 'cancelled', cancel: 'cancelled', لغو: 'cancelled',
  };
  return map[v] ?? null;
}

function parseTimestamp(val: string): number | null {
  if (!val) return null;
  // «YYYY-MM-DD HH:mm[:ss]» بدون ناحیهٔ زمانی (Z یا ±hh:mm) بر اساس تنظیم مبنای زمانی
  // (ساعت دستگاه یا بروکر). مقادیر ISO با Z (مثل خروجی CSV خود برنامه) همان UTC می‌مانند.
  const wall = val.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (wall) {
    const iso = `${wall[1]}-${wall[2].padStart(2, '0')}-${wall[3].padStart(2, '0')}T${wall[4].padStart(2, '0')}:${wall[5]}`;
    const ts = parseTradingDateTimeInput(iso);
    if (!Number.isNaN(ts)) return ts + (wall[6] ? Number(wall[6]) * 1000 : 0);
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  // تلاش با فرمت‌های رایج
  const formats = [
    val.replace(/(\d{4})[-/](\d{2})[-/](\d{2})/, '$1-$2-$3'),
    val.replace(/(\d{2})[-/](\d{2})[-/](\d{4})/, '$3-$2-$1'),
  ];
  for (const f of formats) {
    const d2 = new Date(f);
    if (!isNaN(d2.getTime())) return d2.getTime();
  }
  return null;
}

function parseOptionalNumber(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Validate a mapped record ─────────────────────────────────────────────────

function validateRecord(
  mapped: Partial<Record<ImportFieldKey, string>>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mapped.symbol?.trim()) errors.push('نماد (symbol) الزامی است');
  if (!mapped.direction?.trim()) errors.push('جهت معامله الزامی است');
  else if (!normaliseDirection(mapped.direction)) errors.push(`جهت نامعتبر: "${mapped.direction}"`);

  if (!mapped.entryPrice?.trim()) errors.push('قیمت ورود الزامی است');
  else if (isNaN(parseFloat(mapped.entryPrice))) errors.push('قیمت ورود باید عدد باشد');

  if (mapped.exitPrice && isNaN(parseFloat(mapped.exitPrice))) warnings.push('قیمت خروج باید عدد باشد');
  if (mapped.stopLoss && isNaN(parseFloat(mapped.stopLoss))) warnings.push('حد ضرر باید عدد باشد');
  if (mapped.profitLoss && isNaN(parseFloat(mapped.profitLoss))) warnings.push('سود/زیان باید عدد باشد');
  if (mapped.result && !normaliseResult(mapped.result)) warnings.push(`نتیجه نامعتبر: "${mapped.result}"`);
  if (mapped.openedAt && !parseTimestamp(mapped.openedAt)) warnings.push('تاریخ ورود قابل تجزیه نیست');

  return { errors, warnings };
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

type DuplicateCandidate = Pick<Trade, 'symbol' | 'direction' | 'entryPrice' | 'openedAt'> & {
  id: string | null;
};

async function detectDuplicate(
  symbol: string,
  direction: 'long' | 'short',
  entryPrice: number,
  openedAt: number | null,
  existingTrades: readonly DuplicateCandidate[],
): Promise<{ isDuplicate: boolean; duplicateTradeId: string | null }> {
  for (const t of existingTrades) {
    const sameSymbol = t.symbol.toLowerCase() === symbol.toLowerCase();
    const sameDir = t.direction === direction;
    // تلورانس بسیار کم (۰٫۰۰۱٪): فقط تفاوت گردکردن قیمت، نه معاملهٔ متفاوت
    const sameEntry = Math.abs(t.entryPrice - entryPrice) <= Math.abs(entryPrice) * 0.00001;
    // بدون زمان ورود نمی‌توان با اطمینان تکراری بودن را تشخیص داد
    const sameDate = openedAt != null && Math.abs(t.openedAt - openedAt) < 60_000; // ±1 min
    if (sameSymbol && sameDir && sameEntry && sameDate) {
      return { isDuplicate: true, duplicateTradeId: t.id };
    }
  }
  return { isDuplicate: false, duplicateTradeId: null };
}

// ─── CSV Preview ──────────────────────────────────────────────────────────────

export async function previewCSV(
  text: string,
  mapping: ColumnMapping,
): Promise<ImportPreview> {
  const { headers, rows } = parseCSV(text);
  const existingTrades = await db.trades.toArray();
  const knownTrades: DuplicateCandidate[] = [...existingTrades];
  const parsedRows: ParsedRecord[] = [];

  for (const raw of rows) {
    const mapped: Partial<Record<ImportFieldKey, string>> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field !== 'ignore' && raw[col] !== undefined) {
        mapped[field] = raw[col];
      }
    }
    const { errors, warnings } = validateRecord(mapped);
    let isDuplicate = false;
    let duplicateTradeId: string | null = null;
    let candidateForBatch: DuplicateCandidate | null = null;
    if (!errors.length && mapped.symbol && mapped.direction && mapped.entryPrice) {
      const dir = normaliseDirection(mapped.direction);
      const entry = parseFloat(mapped.entryPrice);
      const ts = mapped.openedAt ? parseTimestamp(mapped.openedAt) : null;
      if (dir) {
        const symbol = mapped.symbol.trim();
        const dup = await detectDuplicate(symbol, dir, entry, ts, knownTrades);
        isDuplicate = dup.isDuplicate;
        duplicateTradeId = dup.duplicateTradeId;
        if (!dup.isDuplicate && ts !== null) {
          candidateForBatch = { id: null, symbol, direction: dir, entryPrice: entry, openedAt: ts };
        }
      }
    }
    if (candidateForBatch) knownTrades.push(candidateForBatch);
    parsedRows.push({ raw, mapped, errors, warnings, isDuplicate, duplicateTradeId });
  }

  return {
    headers,
    rows: parsedRows,
    totalRows: parsedRows.length,
    validRows: parsedRows.filter(r => !r.errors.length).length,
    invalidRows: parsedRows.filter(r => r.errors.length > 0).length,
    duplicateRows: parsedRows.filter(r => r.isDuplicate).length,
  };
}

export function parseCSVHeaders(text: string): { headers: string[]; sampleRows: Record<string, string>[] } {
  const { headers, rows } = parseCSV(text);
  return { headers, sampleRows: rows.slice(0, 3) };
}

// ─── Import CSV ───────────────────────────────────────────────────────────────

export async function importCSV(
  preview: ImportPreview,
  options: { skipDuplicates: boolean; skipInvalid: boolean },
): Promise<ImportResult> {
  const now = Date.now();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of preview.rows) {
    if (row.errors.length > 0 && options.skipInvalid) { skipped++; continue; }
    if (row.isDuplicate && options.skipDuplicates) { skipped++; continue; }

    const m = row.mapped;
    const direction = normaliseDirection(m.direction ?? '') ?? 'long';
    const entryPrice = parseFloat(m.entryPrice ?? '0') || 0;
    const openedAt = m.openedAt ? (parseTimestamp(m.openedAt) ?? now) : now;

    try {
      const importedTrade: Partial<Trade> = {
        symbol: (m.symbol ?? '').toUpperCase().trim(),
        direction,
        entryPrice,
        exitPrice: parseOptionalNumber(m.exitPrice),
        stopLoss: parseOptionalNumber(m.stopLoss) ?? 0,
        takeProfit: parseOptionalNumber(m.takeProfit),
        positionSize: parseOptionalNumber(m.positionSize),
        // سود ناخالص؛ کمیسیون/اسپرد/Fee هزینه‌اند و سواپ علامت‌دار است؛ همه جدا ذخیره می‌شوند
        profitLoss: parseOptionalNumber(m.profitLoss),
        rMultiple: parseOptionalNumber(m.rMultiple),
        riskPercentage: parseOptionalNumber(m.riskPercentage),
        riskAmount: parseOptionalNumber(m.riskAmount),
        fees: parseOptionalNumber(m.fees),
        commission: parseOptionalNumber(m.commission),
        spread: parseOptionalNumber(m.spread),
        swap: parseOptionalNumber(m.swap),
        result: normaliseResult(m.result ?? '') ?? 'open',
        status: 'open',
        openedAt,
        closedAt: m.closedAt ? (parseTimestamp(m.closedAt) ?? null) : null,
        market: m.market || null,
        notes: m.notes || null,
        entryReason: m.entryReason || null,
        lesson: m.lesson || null,
        tradingSession: m.tradingSession || null,
        setupType: m.setupType || null,
        tags: m.tags ? JSON.stringify(m.tags.split(/[,;،]/).map(t => t.trim()).filter(Boolean)) : '[]',
      };
      await tradeService.createTrade({
        ...importedTrade,
        ...normalizeImportedTradeFields(importedTrade),
      });
      imported++;
    } catch (e) {
      errors.push(`خطا در ردیف: ${row.raw['symbol'] || '?'} — ${e}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// ─── JSON Import ──────────────────────────────────────────────────────────────

export interface JSONValidationResult {
  valid: boolean;
  recordCount: number;
  errors: string[];
  preview: Partial<Trade>[];
}

export function validateJSONTrades(jsonText: string): JSONValidationResult {
  const errors: string[] = [];
  let records: unknown[] = [];

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).trades)) {
      records = (parsed as Record<string, unknown>).trades as unknown[];
    } else {
      errors.push('فرمت JSON نامعتبر است — باید آرایه‌ای از معاملات باشد');
      return { valid: false, recordCount: 0, errors, preview: [] };
    }
  } catch (e) {
    errors.push(`خطای parse JSON: ${e}`);
    return { valid: false, recordCount: 0, errors, preview: [] };
  }

  const preview: Partial<Trade>[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Record<string, unknown>;
    if (!r.symbol) errors.push(`ردیف ${i + 1}: فیلد symbol الزامی است`);
    if (!r.direction) errors.push(`ردیف ${i + 1}: فیلد direction الزامی است`);
    if (r.entryPrice === undefined && r.entry_price === undefined) {
      errors.push(`ردیف ${i + 1}: فیلد entryPrice الزامی است`);
    }
    if (i < 5) preview.push(r as Partial<Trade>);
  }

  return {
    valid: errors.length === 0,
    recordCount: records.length,
    errors,
    preview,
  };
}

export async function importJSON(
  jsonText: string,
  options: { skipDuplicates: boolean },
): Promise<ImportResult> {
  const now = Date.now();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  let records: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(jsonText);
    records = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown[]>).trades as Record<string, unknown>[];
  } catch {
    return { imported: 0, skipped: 0, errors: ['خطای parse JSON'] };
  }

  const existingTrades: DuplicateCandidate[] = [...await db.trades.toArray()];

  for (const r of records) {
    const symbol = String(r.symbol ?? '').toUpperCase().trim();
    const direction = normaliseDirection(String(r.direction ?? '')) ?? 'long';
    const entryPrice = parseFloat(String(r.entryPrice ?? r.entry_price ?? 0)) || 0;
    const openedAt = r.openedAt
      ? (typeof r.openedAt === 'number' ? r.openedAt : parseTimestamp(String(r.openedAt)) ?? now)
      : now;

    if (!symbol || !entryPrice) { skipped++; continue; }

    if (options.skipDuplicates) {
      const { isDuplicate } = await detectDuplicate(symbol, direction, entryPrice, openedAt, existingTrades);
      if (isDuplicate) { skipped++; continue; }
    }

    try {
      const importedTrade: Partial<Trade> = {
        symbol,
        direction,
        entryPrice,
        exitPrice: r.exitPrice != null ? parseOptionalNumber(String(r.exitPrice)) : null,
        stopLoss: parseOptionalNumber(String(r.stopLoss ?? r.stop_loss ?? '')) ?? 0,
        takeProfit: r.takeProfit != null ? parseOptionalNumber(String(r.takeProfit)) : null,
        positionSize: r.positionSize != null ? parseOptionalNumber(String(r.positionSize)) : null,
        profitLoss: r.profitLoss != null ? parseOptionalNumber(String(r.profitLoss)) : null,
        rMultiple: r.rMultiple != null ? parseOptionalNumber(String(r.rMultiple)) : null,
        riskPercentage: r.riskPercentage != null ? parseOptionalNumber(String(r.riskPercentage)) : null,
        riskAmount: r.riskAmount != null ? parseOptionalNumber(String(r.riskAmount)) : null,
        fees: r.fees != null ? parseOptionalNumber(String(r.fees)) : null,
        commission: r.commission != null ? parseOptionalNumber(String(r.commission)) : null,
        spread: r.spread != null ? parseOptionalNumber(String(r.spread)) : null,
        swap: r.swap != null ? parseOptionalNumber(String(r.swap)) : null,
        result: normaliseResult(String(r.result ?? '')) ?? 'open',
        status: r.status ? String(r.status) as Trade['status'] : 'open',
        openedAt,
        closedAt: r.closedAt
          ? (typeof r.closedAt === 'number' ? r.closedAt : parseTimestamp(String(r.closedAt)) ?? null)
          : null,
        market: r.market ? String(r.market) : null,
        notes: r.notes ? String(r.notes) : null,
        entryReason: r.entryReason ? String(r.entryReason) : null,
        lesson: r.lesson ? String(r.lesson) : null,
        tradingSession: r.tradingSession ? String(r.tradingSession) : null,
        setupType: r.setupType ? String(r.setupType) : null,
        tags: r.tags ? (Array.isArray(r.tags) ? JSON.stringify(r.tags) : String(r.tags)) : '[]',
        emotions: r.emotions ? (Array.isArray(r.emotions) ? JSON.stringify(r.emotions) : String(r.emotions)) : '[]',
      };
      const createdTrade = await tradeService.createTrade({
        ...importedTrade,
        ...normalizeImportedTradeFields(importedTrade),
      });
      existingTrades.push({
        id: createdTrade.id,
        symbol: createdTrade.symbol,
        direction: createdTrade.direction,
        entryPrice: createdTrade.entryPrice,
        openedAt: createdTrade.openedAt,
      });
      imported++;
    } catch (e) {
      errors.push(`خطا در ردیف ${symbol}: ${e}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// ─── Export trades as CSV ────────────────────────────────────────────────────

// ─── MetaTrader 4/5 HTML Report Parser ───────────────────────────────────────

export interface MT4ParseResult {
  valid: boolean;
  recordCount: number;
  errors: string[];
  preview: object[];
  trades: object[];
}

/**
 * پارس گزارش HTML تاریخچه حساب از MT4 یا MT5
 * فرمت: Account History → Save as Report (HTML)
 */
export function parseMT4HTMLReport(html: string): MT4ParseResult {
  const errors: string[] = [];

  // ایجاد DOM مجازی برای پارس HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  if (!tables.length) {
    return { valid: false, recordCount: 0, errors: ['جدول داده یافت نشد'], preview: [], trades: [] };
  }

  // جستجو برای جدولی که حاوی داده معاملات است
  let dataTable: Element | null = null;
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = Array.from(rows[ri].querySelectorAll('td,th')).map(c => c.textContent?.trim().toLowerCase() ?? '');
      // شناسایی هدر جدول MT4/MT5
      const hasMT4 = cells.some(c => c === 'ticket') && cells.some(c => c.includes('symbol') || c.includes('item'));
      const hasMT5 = cells.some(c => c === 'position') && cells.some(c => c.includes('symbol'));
      const hasMT4v2 = cells.some(c => c.includes('open time')) || cells.some(c => c.includes('close time'));
      if (hasMT4 || hasMT5 || hasMT4v2) {
        dataTable = table;
        headerRowIndex = ri;
        headers = cells;
        break;
      }
    }
    if (dataTable) break;
  }

  if (!dataTable || headerRowIndex === -1) {
    return { valid: false, recordCount: 0, errors: ['هدر جدول MT4/MT5 شناسایی نشد'], preview: [], trades: [] };
  }

  // نگاشت ستون‌های MT به فیلدهای معامله
  const findCol = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colSymbol   = findCol('symbol', 'item');
  const colType     = findCol('type', 'direction');
  const colVolume   = findCol('volume', 'size', 'lots');
  const colOpenTime = findCol('open time') !== -1
    ? findCol('open time')
    : findCol('time', 'open');
  const colOpenPx   = findCol('open price', 'price');
  const colSL       = findCol('s/l', 'sl', 'stop loss');
  const colTP       = findCol('t/p', 'tp', 'take profit');
  // در گزارش MT4 هر دو ستون زمان فقط «Time» نام دارند؛ دومی زمان بسته شدن است
  const timeCols = headers.map((h, i) => (h === 'time' ? i : -1)).filter(i => i >= 0);
  const colCloseTime= findCol('close time') !== -1
    ? findCol('close time')
    : (timeCols.length >= 2 ? timeCols[timeCols.length - 1] : -1);
  const lastPriceCol = headers.findLastIndex ? headers.findLastIndex(h => h.includes('price')) : -1;
  // اگر فقط یک ستون قیمت وجود دارد، قیمت خروج نداریم (نباید با قیمت ورود یکی شود)
  const colClosePx  = lastPriceCol === colOpenPx ? -1 : lastPriceCol;
  const colProfit   = findCol('profit');
  const colComm     = findCol('commission', 'comm');
  const colSwap     = findCol('swap');

  const allRows = Array.from(dataTable.querySelectorAll('tr'));
  const dataRows = allRows.slice(headerRowIndex + 1);

  const trades: object[] = [];

  for (const row of dataRows) {
    const cells = Array.from(row.querySelectorAll('td,th')).map(c => c.textContent?.trim() ?? '');
    if (cells.length < 5) continue;

    const typeRaw = (cells[colType] ?? '').toLowerCase().trim();
    // رد کردن ردیف‌های خلاصه (balance, credit, subtotal, ...)
    if (['balance', 'credit', 'subtotal', 'profit', 'deposit', 'withdrawal'].includes(typeRaw)) continue;
    // رد کردن ردیف‌های کاملاً خالی
    if (!typeRaw) continue;
    // فقط معاملات buy/sell (نه باز/بسته جداگانه در MT5)
    if (!['buy', 'sell', 'buy limit', 'sell limit', 'buy stop', 'sell stop', 'in', 'out'].includes(typeRaw)) continue;

    const direction = typeRaw.startsWith('buy') || typeRaw === 'in' ? 'long' : 'short';
    const symbol    = cells[colSymbol] ?? '';
    const openTime  = colOpenTime >= 0 ? cells[colOpenTime] : '';
    const closeTime = colCloseTime >= 0 ? cells[colCloseTime] : '';
    const openPx    = parseFloat(cells[colOpenPx] ?? '') || 0;
    const closePx   = colClosePx >= 0 ? parseFloat(cells[colClosePx] ?? '') : null;
    const volume    = colVolume >= 0 ? parseFloat(cells[colVolume] ?? '') : null;
    const sl        = colSL >= 0 ? parseFloat(cells[colSL] ?? '') || null : null;
    const tp        = colTP >= 0 ? parseFloat(cells[colTP] ?? '') || null : null;
    const profit    = colProfit >= 0 ? parseFloat(cells[colProfit] ?? '') : null;
    const comm      = colComm >= 0 ? parseFloat(cells[colComm] ?? '') || 0 : 0;
    const swap      = colSwap >= 0 ? parseFloat(cells[colSwap] ?? '') || 0 : 0;

    if (!symbol || !openPx) continue;

    // تبدیل تاریخ MT4 (2024.01.15 10:30) به timestamp مطابق تنظیم «مبنای زمانی»:
    // زمان‌های گزارش MT بر پایهٔ ساعت بروکر هستند، نه ساعت دستگاه.
    const parseMTDate = (d: string) => {
      if (!d) return null;
      const m = d.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T]+(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, '0')}:${m[5]}`;
      const t = parseTradingDateTimeInput(iso);
      return Number.isNaN(t) ? null : t;
    };

    const openedAt  = parseMTDate(openTime) ?? Date.now();
    const closedAt  = parseMTDate(closeTime);

    // قرارداد محاسباتی: profitLoss = سود ناخالص (ستون Profit)؛ کمیسیون و سواپ جدا ذخیره
    // می‌شوند و فقط یک بار توسط getNetPnl اعمال می‌شوند (سواپ علامت‌دار است).
    const grossProfit = profit !== null && Number.isFinite(profit) ? profit : null;
    const commission  = Math.abs(comm);
    const netProfit   = grossProfit !== null ? grossProfit - commission + swap : null;
    const result    = netProfit === null ? 'open'
      : netProfit > 0 ? 'win'
      : netProfit < 0 ? 'loss'
      : 'breakeven';

    const importedTrade: Partial<Trade> = {
      symbol,
      direction,
      market: 'Forex',
      status: 'open',
      result,
      entryPrice: openPx,
      exitPrice: closePx !== null && Number.isFinite(closePx) ? closePx : null,
      stopLoss: sl ?? openPx * (direction === 'long' ? 0.99 : 1.01),
      takeProfit: tp ?? null,
      positionSize: volume !== null && Number.isFinite(volume) ? volume : null,
      profitLoss: grossProfit,
      fees: null,
      commission: commission > 0 ? commission : null,
      swap: swap !== 0 ? swap : null,
      openedAt,
      closedAt: closedAt ?? null,
      notes: `وارد شده از گزارش MT4/MT5`,
    };
    trades.push({
      ...importedTrade,
      ...normalizeImportedTradeFields(importedTrade),
    });
  }

  if (!trades.length) {
    errors.push('هیچ ردیف معاملاتی (buy/sell) در فایل یافت نشد');
    return { valid: false, recordCount: 0, errors, preview: [], trades: [] };
  }

  return {
    valid: true,
    recordCount: trades.length,
    errors,
    preview: trades.slice(0, 3),
    trades,
  };
}

export async function exportTradesAsCSV(): Promise<string> {
  const trades = await db.trades.orderBy('openedAt').toArray();
  const headers = [
    'id', 'symbol', 'market', 'direction', 'status', 'result',
    'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit',
    'positionSize', 'riskPercentage', 'riskAmount', 'rMultiple',
    'profitLoss', 'fees', 'commission', 'spread', 'swap', 'openedAt', 'closedAt',
    'tradingSession', 'setupType', 'entryReason', 'lesson', 'notes', 'tags',
  ];

  const escapeCSV = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const dateStr = (ts: number | null) => ts ? new Date(ts).toISOString() : '';

  const rows = trades.map(t => [
    t.id, t.symbol, t.market ?? '', t.direction, t.status, t.result,
    t.entryPrice, t.exitPrice ?? '', t.stopLoss, t.takeProfit ?? '',
    t.positionSize ?? '', t.riskPercentage ?? '', t.riskAmount ?? '', t.rMultiple ?? '',
    t.profitLoss ?? '', t.fees ?? '', t.commission ?? '', t.spread ?? '', t.swap ?? '', dateStr(t.openedAt), dateStr(t.closedAt),
    t.tradingSession ?? '', t.setupType ?? '', t.entryReason ?? '', t.lesson ?? '',
    t.notes ?? '', (() => { try { return JSON.parse(t.tags ?? '[]').join(';'); } catch { return ''; } })(),
  ].map(escapeCSV).join(','));

  return [headers.join(','), ...rows].join('\n');
}
