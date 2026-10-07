import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, Trade, Strategy, Phase, Step, Rule, AnalysisSession, DailyJournal, JournalMedia, dataUrlToBlob } from '../db/database';
import { securityService } from '../security/securityService';
import { APP_VERSION, DB_VERSION, BACKUP_FORMAT_VERSION, SCHEMA_VERSION } from '../constants/version';
import { getNetPnl } from '../lib/tradeHelpers';

export { APP_VERSION, DB_VERSION, BACKUP_FORMAT_VERSION, SCHEMA_VERSION };

const STORAGE_KEY_HISTORY = 'tradermind-backup-history';
const STORAGE_KEY_APP = 'tradermind-app-storage';
const STORAGE_KEY_LAST = 'tradermind-last-backup';

// ─────────────────────────────────────────────
// انواع
// ─────────────────────────────────────────────
export interface BackupMetadata {
  appName: string;
  backupVersion: string;
  appVersion: string;
  databaseVersion: number;
  /** نسخه Schema — اضافه شده در v3.0 */
  schemaVersion: number;
  createdAt: string;
  totalRecords: number;
  /** SHA-256 از JSON رشته‌ای داده‌ها — برای بررسی یکپارچگی */
  checksum?: string;
  /** آیا داده‌ها رمزگذاری شده‌اند؟ */
  encrypted?: boolean;
}

export interface BackupData {
  metadata: BackupMetadata;
  data: {
    strategies: Strategy[];
    phases: Phase[];
    steps: Step[];
    rules: Rule[];
    analysisSessions: AnalysisSession[];
    trades: Trade[];
    dailyJournals: DailyJournal[];
    settings: Record<string, string>;
    // فیلدهای اختیاری — ممکن است در نسخه‌های قدیمی‌تر وجود نداشته باشند
    symbolProfiles?: unknown[];
    learningAuditTrail?: unknown[];
    profileSnapshots?: unknown[];
    profileCorrections?: unknown[];
    knowledgeCategories?: unknown[];
    replayDatasets?: unknown[];
    replayPlaylists?: unknown[];
    marketContextSessions?: unknown[];
    tradeEvents?: unknown[];
    tradeVersions?: unknown[];
    chartScreenshots?: unknown[];
    riskViolations?: unknown[];
    riskProfiles?: unknown[];
    riskGroups?: unknown[];
    replaySessions?: unknown[];
    replayDecisions?: unknown[];
    knowledgeNotes?: unknown[];
    preTradeChecklists?: unknown[];
    dailyFocus?: unknown[];
    screenshotGroups?: unknown[];
    visualPatterns?: unknown[];
    screenshotCollections?: unknown[];
    accounts?: unknown[];
    tradingBoxes?: unknown[];
    performanceReviews?: unknown[];
    journalSessions?: unknown[];
    journalOptions?: unknown[];
    journalSessionAnalyses?: unknown[];
    strategyVersions?: unknown[];
    journalTradeData?: unknown[];
    journalSessionEvents?: unknown[];
    journalTriggers?: unknown[];
    journalMedia?: unknown[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: BackupMetadata;
  parsedData?: BackupData['data'];
  needsPassword?: boolean;
}

export interface MergeStats {
  added: number;
  updated: number;
  skipped: number;
}

export interface BackupHistoryItem {
  id: string;
  createdAt: string;
  size: number;
  type: 'export' | 'import';
  mode?: 'replace' | 'merge';
  status: 'success' | 'failed';
  recordCount: number;
  encrypted?: boolean;
}

// ─────────────────────────────────────────────
// ساخت payload داده
// ─────────────────────────────────────────────
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خواندن تصویر برای پشتیبان‌گیری انجام نشد'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

async function serializeChartScreenshots(records: unknown[]): Promise<unknown[]> {
  return Promise.all(records.map(async (record: any) => {
    if (!record || typeof record !== 'object') return record;
    const imageBlob = record.imageBlob;
    if (imageBlob instanceof Blob) {
      try {
        return {
          ...record,
          dataUrl: await blobToDataUrl(imageBlob),
          imageBlob: null,
        };
      } catch {
        return { ...record, imageBlob: null };
      }
    }
    // JSON serialization of a Blob from an older exporter produces {}.
    return { ...record, imageBlob: null };
  }));
}

function restoreChartScreenshots(records: unknown[] | undefined): unknown[] {
  return (records ?? []).map((record: any) => {
    if (!record || typeof record !== 'object') return record;
    if (record.imageBlob instanceof Blob) return record;
    if (typeof record.dataUrl === 'string' && record.dataUrl.startsWith('data:')) {
      try {
        return { ...record, imageBlob: dataUrlToBlob(record.dataUrl), dataUrl: '' };
      } catch {
        return record;
      }
    }
    return record;
  });
}

async function serializeJournalMedia(records: JournalMedia[]): Promise<unknown[]> {
  return Promise.all(records.map(async record => ({
    ...record,
    dataUrl: await blobToDataUrl(record.blob),
    blob: null,
  })));
}

function restoreJournalMedia(records: unknown[] | undefined): unknown[] {
  return (records ?? []).map((record: any) => {
    if (!record || typeof record !== 'object') throw new Error('رکورد رسانه ژورنال معتبر نیست.');
    if (record.blob instanceof Blob) return record;
    if (typeof record.dataUrl === 'string' && record.dataUrl.startsWith('data:')) {
      const { dataUrl, ...metadata } = record;
      return { ...metadata, blob: dataUrlToBlob(dataUrl) };
    }
    throw new Error(`فایل رسانه ژورنال «${record.fileName ?? 'بدون نام'}» در پشتیبان ناقص است.`);
  });
}

async function buildBackupData() {
  const [
    strategies, phases, steps, rules, analysisSessions, trades, dailyJournals,
    symbolProfiles, learningAuditTrail, profileSnapshots, profileCorrections,
    knowledgeNotes, knowledgeCategories, replayDatasets, replaySessions,
    replayDecisions, replayPlaylists, marketContextSessions, tradeEvents,
    tradeVersions, riskProfiles, riskViolations, riskGroups, performanceReviews,
    preTradeChecklists, dailyFocus, chartScreenshots, screenshotGroups,
    visualPatterns, screenshotCollections, accounts, tradingBoxes,
    journalSessions, journalOptions, journalSessionAnalyses, strategyVersions,
    journalTradeData, journalSessionEvents, journalMedia, journalTriggers,
  ] =
    await Promise.all([
      db.strategies.toArray(),
      db.phases.toArray(),
      db.steps.toArray(),
      db.rules.toArray(),
      db.analysisSessions.toArray(),
      db.trades.toArray(),
      db.dailyJournals.toArray(),
      db.symbolProfiles.toArray(),
      db.learningAuditTrail.toArray(),
      db.profileSnapshots.toArray(),
      db.profileCorrections.toArray(),
      db.knowledgeNotes.toArray(),
      db.knowledgeCategories.toArray(),
      db.replayDatasets.toArray(),
      db.replaySessions.toArray(),
      db.replayDecisions.toArray(),
      db.replayPlaylists.toArray(),
      db.marketContextSessions.toArray(),
      db.tradeEvents.toArray(),
      db.tradeVersions.toArray(),
      db.riskProfiles.toArray(),
      db.riskViolations.toArray(),
      db.riskGroups.toArray(),
      db.performanceReviews.toArray(),
      db.preTradeChecklists.toArray(),
      db.dailyFocus.toArray(),
      db.chartScreenshots.toArray(),
      db.screenshotGroups.toArray(),
      db.visualPatterns.toArray(),
      db.screenshotCollections.toArray(),
      db.accounts.toArray(),
      db.tradingBoxes.toArray(),
      db.journalSessions.toArray(),
      db.journalOptions.toArray(),
      db.journalSessionAnalyses.toArray(),
      db.strategyVersions.toArray(),
      db.journalTradeData.toArray(),
      db.journalSessionEvents.toArray(),
      db.journalMedia.toArray(),
      db.journalTriggers.toArray(),
    ]);
  const serializedChartScreenshots = await serializeChartScreenshots(chartScreenshots);
  const serializedJournalMedia = await serializeJournalMedia(journalMedia);

  const settings = backupService.exportSettings();
  const allRecords = [
    strategies, phases, steps, rules, analysisSessions, trades, dailyJournals,
    symbolProfiles, learningAuditTrail, profileSnapshots, profileCorrections,
    knowledgeNotes, knowledgeCategories, replayDatasets, replaySessions,
    replayDecisions, replayPlaylists, marketContextSessions, tradeEvents,
    tradeVersions, riskProfiles, riskViolations, riskGroups, performanceReviews,
    preTradeChecklists, dailyFocus, serializedChartScreenshots, screenshotGroups,
    visualPatterns, screenshotCollections, accounts, tradingBoxes,
    journalSessions, journalOptions, journalSessionAnalyses, strategyVersions,
    journalTradeData, journalSessionEvents, serializedJournalMedia, journalTriggers,
  ];
  const totalRecords = allRecords.reduce((sum, records) => sum + records.length, 0);

  const data: BackupData['data'] = {
    strategies, phases, steps, rules, analysisSessions, trades, dailyJournals, settings,
    symbolProfiles, learningAuditTrail, profileSnapshots, profileCorrections,
    knowledgeNotes, knowledgeCategories, replayDatasets, replaySessions,
    replayDecisions, replayPlaylists, marketContextSessions, tradeEvents,
    tradeVersions, riskProfiles, riskViolations, riskGroups, performanceReviews,
    preTradeChecklists, dailyFocus, chartScreenshots: serializedChartScreenshots, screenshotGroups,
    visualPatterns, screenshotCollections, accounts, tradingBoxes,
    journalSessions, journalOptions, journalSessionAnalyses, strategyVersions,
    journalTradeData, journalSessionEvents, journalMedia: serializedJournalMedia, journalTriggers,
  };

  // محاسبه Checksum برای بررسی یکپارچگی
  const dataJson = JSON.stringify(data);
  const checksum = await securityService.sha256(dataJson);

  const metadata: BackupMetadata = {
    appName: 'TraderMind',
    backupVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    databaseVersion: DB_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    totalRecords,
    checksum,
  };

  return { data, metadata, totalRecords };
}

// ─────────────────────────────────────────────
// ساخت و دانلود ZIP
// ─────────────────────────────────────────────
async function buildAndDownloadZip(
  payload: BackupData,
  filename: string,
  trades: any[],
): Promise<number> {
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload, null, 2));

  // تصاویر معاملات
  const mediaFolder = zip.folder('media');
  let mediaIndex = 1;
  for (const trade of trades) {
    if (trade.screenshots) {
      try {
        const screenshots: Array<{ id: string; dataUrl: string }> = JSON.parse(trade.screenshots);
        for (const sc of screenshots) {
          if (sc.dataUrl?.startsWith('data:')) {
            const ext = sc.dataUrl.split(';')[0].split('/')[1] || 'webp';
            const base64 = sc.dataUrl.split(',')[1];
            mediaFolder?.file(`image-${String(mediaIndex).padStart(3, '0')}.${ext}`, base64, { base64: true });
            mediaIndex++;
          }
        }
      } catch { /* تصویر نادرست نادیده گرفته می‌شود */ }
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  await deliverFile(zipBlob, filename);

  return zipBlob.size;
}

// ─────────────────────────────────────────────
// PART 8: ساخت و دانلود .gz با CompressionStream
// ─────────────────────────────────────────────
async function buildAndDownloadGz(
  payload: BackupData,
  filename: string,
): Promise<number> {
  const jsonStr = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(jsonStr);

  // CompressionStream API — مدرن و بدون نیاز به کتابخانه
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  const writePromise = (async () => {
    await writer.write(uint8Array);
    await writer.close();
  })();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  const gzBlob = new Blob([merged], { type: 'application/gzip' });
  await deliverFile(gzBlob, filename);

  return gzBlob.size;
}

/**
 * در Android WebView، کلیک روی لینک Blob ممکن است فایل را در مسیر نامعلوم
 * بفرستد یا اصلاً دانلود را کامل نکند. Web Share فایل را به پنجره استاندارد
 * Android می‌دهد تا کاربر بتواند Files/Downloads/Drive را خودش انتخاب کند.
 * در دسکتاپ و مرورگرهای بدون Web Share، دانلود معمولی با زمان کافی برای
 * خواندن Blob انجام می‌شود.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function deliverFile(blob: Blob, filename: string): Promise<void> {
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  if (isAndroidNative) {
    const path = `TraderMind/Backups/${filename}`;
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path,
      directory: Directory.Documents,
      data: base64,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
    // The file is already saved before opening Share. If the user closes the
    // share sheet, the backup remains in Documents/TraderMind/Backups.
    try {
      await Share.share({
        title: 'پشتیبان TraderMind',
        text: `فایل در Documents/TraderMind/Backups ذخیره شد. در صورت نیاز آن را با Files یا Downloads به محل دیگری منتقل کنید.`,
        files: [uri],
        dialogTitle: 'ذخیره یا ارسال نسخه پشتیبان',
      });
    } catch {
      // Cancelling the share sheet must not turn a successfully saved backup
      // into an error.
    }
    return;
  }

  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const canShareFile = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });

  if (canShareFile) {
    await navigator.share({
      title: 'پشتیبان TraderMind',
      text: `فایل ${filename} را در پوشه دلخواه ذخیره کنید.`,
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // revoke فوری روی بعضی گوشی‌ها دانلود را قبل از شروع قطع می‌کند.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** decompress یک فایل .gz و برگرداندن JSON string */
async function decompressGz(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = (async () => {
    await writer.write(new Uint8Array(arrayBuffer));
    await writer.close();
  })();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  return new TextDecoder().decode(merged);
}

// ─────────────────────────────────────────────
// ساخت Spreadsheet واقعی (.xlsx) بدون وابستگی سنگین
// ─────────────────────────────────────────────
type SpreadsheetValue = string | number | boolean | null | undefined;
type SpreadsheetSheet = { name: string; rows: SpreadsheetValue[][] };
type SpreadsheetImage = { row: number; bytes: Uint8Array; mime: string };

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function excelColumn(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function spreadsheetCell(value: SpreadsheetValue, column: number, row: number): string {
  const ref = `${excelColumn(column)}${row}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function spreadsheetSheetXml(rows: SpreadsheetValue[][], drawingId?: number): string {
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const lastRow = Math.max(1, rows.length);
  const dimension = `A1:${excelColumn(columnCount - 1)}${lastRow}`;
  const columns = Array.from({ length: columnCount }, (_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 24 : 18}" customWidth="1"/>`
  ).join('');
  const sheetData = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => spreadsheetCell(value, columnIndex, rowIndex + 1)).join('')}</row>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${sheetData}</sheetData>
  ${drawingId ? `<drawing r:id="rId1"/>` : ''}
</worksheet>`;
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime: match[1] };
  } catch {
    return null;
  }
}

function imageExtension(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  return mime.split('/')[1] || 'bin';
}

export async function buildSpreadsheetWorkbook(
  sheets: SpreadsheetSheet[],
  images: SpreadsheetImage[],
): Promise<Blob> {
  const zip = new JSZip();
  const imageSheetIndex = sheets.findIndex(sheet => sheet.name === 'اسکرین‌شات‌ها');
  const imageEntries = images.map((image, index) => ({
    ...image,
    index: index + 1,
    ext: imageExtension(image.mime),
  }));

  const sheetOverrides: string[] = [];
  const workbookSheets: string[] = [];
  const workbookRelations: string[] = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  ];

  sheets.forEach((sheet, index) => {
    const sheetNumber = index + 1;
    const hasImages = index === imageSheetIndex && imageEntries.length > 0;
    zip.file(`xl/worksheets/sheet${sheetNumber}.xml`, spreadsheetSheetXml(sheet.rows, hasImages ? 1 : undefined));
    sheetOverrides.push(`<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    workbookSheets.push(`<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheetNumber}" r:id="rId${sheetNumber + 1}"/>`);
    workbookRelations.push(`<Relationship Id="rId${sheetNumber + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/>`);

    if (hasImages) {
      zip.file(`xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetNumber}.xml"/>
</Relationships>`);
      zip.file(`xl/drawings/drawing${sheetNumber}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${imageEntries.map((image, imageIndex) => `<xdr:twoCellAnchor editAs="oneCell">
  <xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${Math.max(1, image.row - 1)}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${Math.max(5, image.row + 4)}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
  <xdr:pic>
    <xdr:nvPicPr><xdr:cNvPr id="${imageIndex + 1}" name="Screenshot ${imageIndex + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
    <xdr:blipFill><a:blip r:embed="rId${imageIndex + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
    <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`).join('\n')}
</xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${sheetNumber}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${imageEntries.map(image => `<Relationship Id="rId${image.index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${image.index}.${image.ext}"/>`).join('\n')}
</Relationships>`);
      imageEntries.forEach(image => zip.file(`xl/media/image${image.index}.${image.ext}`, image.bytes));
    }
  });

  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${[...new Set(imageEntries.map(image => `<Default Extension="${image.ext}" ContentType="${xmlEscape(image.mime)}"/>`))].join('\n')}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides.join('\n')}
  ${imageSheetIndex >= 0 && imageEntries.length ? `<Override PartName="/xl/drawings/drawing${imageSheetIndex + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ''}
</Types>`);
  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr codeName="ThisWorkbook"/>
  <sheets>${workbookSheets.join('')}</sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelations.join('')}</Relationships>`);
  zip.file('xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  const workbookBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const workbookBuffer = workbookBytes.buffer.slice(
    workbookBytes.byteOffset,
    workbookBytes.byteOffset + workbookBytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([workbookBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ─────────────────────────────────────────────
// سرویس اصلی
// ─────────────────────────────────────────────
export const backupService = {
  // ────────── Export معمولی (.gz) ──────────
  async exportAll(): Promise<void> {
    const { data, metadata, totalRecords } = await buildBackupData();
    const payload: BackupData = { metadata, data };

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    const filename = `TraderMind_Backup_${dateStr}_${timeStr}.tradermind-backup.gz`;

    const size = await buildAndDownloadGz(payload, filename);

    localStorage.setItem(STORAGE_KEY_LAST, new Date().toISOString());
    this.addToHistory({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      size,
      type: 'export',
      status: 'success',
      recordCount: totalRecords,
    });
  },

  // ────────── Export رمزگذاری‌شده ──────────
  /**
   * Backup رمزگذاری‌شده با AES-GCM
   * داده‌ها با رمز عبور کاربر رمزگذاری می‌شوند.
   * بدون رمز، محتوا قابل خواندن نیست.
   */
  async exportEncrypted(password: string): Promise<void> {
    const { data, metadata, totalRecords } = await buildBackupData();

    const dataJson = JSON.stringify(data);
    const encryptedData = await securityService.encrypt(dataJson, password);

    const encPayload = {
      metadata: { ...metadata, encrypted: true, checksum: undefined },
      encryptedData,
    };

    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(encPayload, null, 2));

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    const filename = `TraderMind_Backup_Encrypted_${dateStr}_${timeStr}.zip`;

    await deliverFile(zipBlob, filename);

    localStorage.setItem(STORAGE_KEY_LAST, new Date().toISOString());
    this.addToHistory({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      size: zipBlob.size,
      type: 'export',
      status: 'success',
      recordCount: totalRecords,
      encrypted: true,
    });
  },

  // ────────── رمزگشایی Backup رمزگذاری‌شده ──────────
  async decryptBackup(file: File, password: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file('backup.json');
      if (!jsonFile) {
        errors.push('فایل backup.json در آرشیو یافت نشد.');
        return { valid: false, errors, warnings };
      }
      const jsonStr = await jsonFile.async('string');
      let parsed: any;
      try { parsed = JSON.parse(jsonStr); } catch {
        errors.push('فایل backup.json خراب است.');
        return { valid: false, errors, warnings };
      }

      if (!parsed?.metadata?.encrypted || !parsed.encryptedData) {
        errors.push('این فایل رمزگذاری‌شده نیست.');
        return { valid: false, errors, warnings };
      }

      let decryptedJson: string;
      try {
        decryptedJson = await securityService.decrypt(parsed.encryptedData, password);
      } catch {
        errors.push('رمز عبور صحیح نیست یا فایل قابل بازیابی نیست.');
        return { valid: false, errors, warnings };
      }

      let data: any;
      try { data = JSON.parse(decryptedJson); } catch {
        errors.push('داده‌های رمزگشایی‌شده خراب هستند.');
        return { valid: false, errors, warnings };
      }

      return { valid: true, errors, warnings, metadata: parsed.metadata, parsedData: data };
    } catch {
      errors.push('خطا در باز کردن فایل.');
      return { valid: false, errors, warnings };
    }
  },

  // ────────── تنظیمات ──────────
  exportSettings(): Record<string, string> {
    const settings: Record<string, string> = {};
    const val = localStorage.getItem(STORAGE_KEY_APP);
    if (val) settings[STORAGE_KEY_APP] = val;
    const customSymbols = localStorage.getItem('tradermind-custom-symbols');
    if (customSymbols) settings['tradermind-custom-symbols'] = customSymbols;
    return settings;
  },

  importSettings(settings: Record<string, string>) {
    for (const [key, value] of Object.entries(settings)) {
      localStorage.setItem(key, value);
    }
  },

  // ────────── اعتبارسنجی ──────────
  async validateFile(file: File): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (file.name.endsWith('.json')) {
      return this.validateLegacyJson(file);
    }

    // PART 8: پشتیبانی از فرمت جدید .gz
    if (file.name.endsWith('.gz') || file.name.includes('.tradermind-backup')) {
      try {
        const jsonStr = await decompressGz(file);
        let parsed: any;
        try { parsed = JSON.parse(jsonStr); } catch {
          errors.push('محتوای فایل .gz خراب است.');
          return { valid: false, errors, warnings };
        }
        return this.validateParsed(parsed, errors, warnings);
      } catch {
        errors.push('خطا در decompress فایل .gz. فایل ممکن است آسیب دیده باشد.');
        return { valid: false, errors, warnings };
      }
    }

    if (!file.name.endsWith('.zip') && file.type !== 'application/zip' && file.type !== 'application/x-zip-compressed') {
      errors.push('فرمت فایل پشتیبان پشتیبانی نمی‌شود. فایل باید .tradermind-backup.gz، ZIP یا JSON باشد.');
      return { valid: false, errors, warnings };
    }

    try {
      const zip = await JSZip.loadAsync(file);
      const backupJsonFile = zip.file('backup.json');
      if (!backupJsonFile) {
        errors.push('فایل backup.json در آرشیو پشتیبان یافت نشد.');
        return { valid: false, errors, warnings };
      }

      const jsonStr = await backupJsonFile.async('string');
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        errors.push('فایل backup.json خراب است و قابل خواندن نیست.');
        return { valid: false, errors, warnings };
      }

      if (parsed?.metadata?.encrypted) {
        return { valid: true, errors, warnings, metadata: parsed.metadata, needsPassword: true };
      }

      return this.validateParsed(parsed, errors, warnings);
    } catch {
      errors.push('خطا در باز کردن فایل ZIP. فایل ممکن است آسیب دیده باشد.');
      return { valid: false, errors, warnings };
    }
  },

  async validateLegacyJson(file: File): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.version === 1 || parsed.exportedAt) {
        warnings.push('فایل پشتیبان از نسخه قدیمی برنامه است. برخی اطلاعات ممکن است ناقص باشد.');
        const data = {
          strategies: parsed.strategies || [],
          phases: parsed.phases || [],
          steps: parsed.steps || [],
          rules: parsed.rules || [],
          analysisSessions: parsed.analysisSessions || [],
          trades: parsed.trades || [],
          dailyJournals: parsed.dailyJournals || [],
          settings: {},
        };
        const total = Object.values(data).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
        return {
          valid: true, errors, warnings,
          metadata: {
            appName: 'TraderMind',
            backupVersion: '1.0',
            appVersion: 'قدیمی',
            databaseVersion: parsed.version || 1,
            schemaVersion: 1,
            createdAt: parsed.exportedAt ? new Date(parsed.exportedAt).toISOString() : new Date().toISOString(),
            totalRecords: total,
          },
          parsedData: data,
        };
      }

      errors.push('فایل پشتیبان معتبر نیست یا متعلق به برنامه دیگری است.');
      return { valid: false, errors, warnings };
    } catch {
      errors.push('فایل JSON خراب است و قابل خواندن نیست.');
      return { valid: false, errors, warnings };
    }
  },

  async validateParsed(parsed: any, errors: string[], warnings: string[]): Promise<ValidationResult> {
    if (!parsed?.metadata) {
      errors.push('ساختار فایل پشتیبان معتبر نیست (metadata یافت نشد).');
      return { valid: false, errors, warnings };
    }
    if (parsed.metadata.appName !== 'TraderMind') {
      errors.push('این فایل متعلق به برنامه دیگری است.');
      return { valid: false, errors, warnings };
    }
    if (!parsed.metadata.backupVersion) {
      errors.push('نسخه فایل پشتیبان مشخص نیست.');
      return { valid: false, errors, warnings };
    }
    if (!parsed.data) {
      errors.push('داده‌های پشتیبان یافت نشد.');
      return { valid: false, errors, warnings };
    }

    // PART 5: بررسی schemaVersion
    if (parsed.metadata.schemaVersion && parsed.metadata.schemaVersion < SCHEMA_VERSION) {
      warnings.push(`This backup was created on an older database version (schema v${parsed.metadata.schemaVersion} → current v${SCHEMA_VERSION}). Some fields may be missing.`);
    }
    if (!parsed.metadata.schemaVersion) {
      warnings.push('This backup was created on an older database version. Some fields may be missing.');
    }

    // بررسی Checksum
    if (parsed.metadata.checksum) {
      try {
        const actualChecksum = await securityService.sha256(JSON.stringify(parsed.data));
        if (actualChecksum !== parsed.metadata.checksum) {
          errors.push('یکپارچگی فایل تأیید نشد — فایل احتمالاً تغییر کرده یا خراب است.');
          return { valid: false, errors, warnings };
        }
      } catch {
        warnings.push('بررسی یکپارچگی فایل ممکن نبود.');
      }
    }

    // بررسی ساختار آرایه‌های اصلی
    const requiredArrays = ['strategies', 'phases', 'steps', 'analysisSessions', 'trades', 'dailyJournals'];
    for (const key of requiredArrays) {
      if (parsed.data[key] !== undefined && !Array.isArray(parsed.data[key])) {
        errors.push(`ساختار داده‌های "${key}" معتبر نیست.`);
      }
    }
    if (errors.length > 0) return { valid: false, errors, warnings };

    // ── PART 7: روابط trade ──────────────────────────────────────────────
    const tradeIds = new Set((parsed.data.trades || []).map((t: any) => t.id).filter(Boolean));

    // trade → tradeEvents
    if (Array.isArray(parsed.data.tradeEvents)) {
      const orphans = parsed.data.tradeEvents.filter((e: any) => e.tradeId && !tradeIds.has(e.tradeId));
      if (orphans.length > 0) warnings.push(`${orphans.length} رویداد معامله بدون معامله معتبر (orphan tradeEvents).`);
    }
    // trade → tradeVersions
    if (Array.isArray(parsed.data.tradeVersions)) {
      const orphans = parsed.data.tradeVersions.filter((v: any) => v.tradeId && !tradeIds.has(v.tradeId));
      if (orphans.length > 0) warnings.push(`${orphans.length} نسخه معامله بدون معامله معتبر (orphan tradeVersions).`);
    }
    // trade → chartScreenshots
    if (Array.isArray(parsed.data.chartScreenshots)) {
      const corrupt = parsed.data.chartScreenshots.filter((s: any) => !s.id || (s.dataUrl === undefined && s.imageBlob === undefined));
      if (corrupt.length > 0) warnings.push(`${corrupt.length} اسکرین‌شات خراب یا بدون تصویر (corrupted screenshots).`);
      const orphans = parsed.data.chartScreenshots.filter((s: any) => s.tradeId && !tradeIds.has(s.tradeId));
      if (orphans.length > 0) warnings.push(`${orphans.length} اسکرین‌شات بدون معامله معتبر (orphan chartScreenshots).`);
    }
    // trade → riskViolations
    if (Array.isArray(parsed.data.riskViolations)) {
      const orphans = parsed.data.riskViolations.filter((r: any) => r.tradeId && !tradeIds.has(r.tradeId));
      if (orphans.length > 0) warnings.push(`${orphans.length} تخلف ریسک بدون معامله معتبر (orphan riskViolations).`);
    }
    // replaySession → replayDecisions
    if (Array.isArray(parsed.data.replaySessions) && Array.isArray(parsed.data.replayDecisions)) {
      const sessionIds = new Set((parsed.data.replaySessions || []).map((s: any) => s.id).filter(Boolean));
      const orphans = parsed.data.replayDecisions.filter((d: any) => d.sessionId && !sessionIds.has(d.sessionId));
      if (orphans.length > 0) warnings.push(`${orphans.length} تصمیم replay بدون session معتبر (orphan replayDecisions).`);
    }

    // بررسی روابط strategy
    const strategyIds = new Set((parsed.data.strategies || []).map((s: any) => s.id));
    const phaseIds = new Set((parsed.data.phases || []).map((p: any) => p.id));
    const stepIds = new Set((parsed.data.steps || []).map((s: any) => s.id));
    const orphanPhases = (parsed.data.phases || []).filter((p: any) => p.strategyId && !strategyIds.has(p.strategyId));
    if (orphanPhases.length > 0) warnings.push(`${orphanPhases.length} فاز بدون استراتژی معتبر یافت شد.`);
    const orphanSteps = (parsed.data.steps || []).filter((s: any) => s.phaseId && !phaseIds.has(s.phaseId));
    if (orphanSteps.length > 0) warnings.push(`${orphanSteps.length} مرحله بدون فاز معتبر یافت شد.`);
    const orphanRules = (parsed.data.rules || []).filter((r: any) => r.stepId && !stepIds.has(r.stepId));
    if (orphanRules.length > 0) warnings.push(`${orphanRules.length} قانون بدون مرحله معتبر یافت شد.`);

    return { valid: true, errors, warnings, metadata: parsed.metadata, parsedData: parsed.data };
  },

  // ────────── PART 6: Safe Restore ──────────
  /**
   * Flow امن بازیابی:
   * 1. Parse + Validate کامل (بدون لمس DB)
   * 2. اگر validation گذشت → Atomic Clear + bulkAdd
   * 3. در صورت شکست هر مرحله → DB دست‌نخورده می‌ماند
   */
  async safeRestore(file: File): Promise<{ success: boolean; warnings: string[]; error?: string }> {
    // مرحله ۱: parse + validate
    const validation = await this.validateFile(file);
    if (!validation.valid) {
      return { success: false, warnings: validation.warnings, error: validation.errors.join(' | ') };
    }
    const data = validation.parsedData;
    if (!data) {
      return { success: false, warnings: validation.warnings, error: 'داده‌های پارس‌شده یافت نشد.' };
    }

    // مرحله ۲: Atomic Replace — فقط پس از validation موفق
    try {
      await this.importReplace(data);
    } catch (e: unknown) {
      return {
        success: false,
        warnings: validation.warnings,
        error: `خطا در بازنویسی دیتابیس: ${(e as { message?: string })?.message ?? 'unknown'}`,
      };
    }

    return { success: true, warnings: validation.warnings };
  },

  // ────────── جایگزینی کامل ──────────
  /**
   * Atomic full restore: تمام جداول (core + extended) در یک Dexie transaction.
   * اگر هر مرحله‌ای fail شود، Dexie کل عملیات را rollback می‌کند و DB سالم می‌ماند.
   */
  async importReplace(data: BackupData['data']): Promise<void> {
    const restoredChartScreenshots = restoreChartScreenshots(data.chartScreenshots);
    const restoredJournalMedia = restoreJournalMedia(data.journalMedia);
    // همه جداول موجود در backup را در یک transaction restore می‌کنیم
    const tables = [
      db.strategies, db.phases, db.steps, db.rules,
      db.analysisSessions, db.trades, db.dailyJournals,
      db.symbolProfiles, db.learningAuditTrail, db.profileSnapshots, db.profileCorrections,
      db.knowledgeNotes, db.knowledgeCategories, db.replayDatasets, db.replaySessions,
      db.replayDecisions, db.replayPlaylists, db.marketContextSessions,
      db.tradeEvents, db.tradeVersions, db.chartScreenshots,
      db.riskProfiles, db.riskViolations, db.riskGroups, db.accounts,
      db.tradingBoxes, db.performanceReviews, db.preTradeChecklists, db.dailyFocus,
      db.screenshotGroups, db.visualPatterns, db.screenshotCollections,
      db.journalSessions, db.journalOptions, db.journalSessionAnalyses,
      db.strategyVersions, db.journalTradeData, db.journalSessionEvents, db.journalMedia, db.journalTriggers,
    ];

    await db.transaction('rw', tables, async () => {
      // ── پاکسازی همه جداول ──
      await Promise.all(tables.map(t => t.clear()));

      // ── جداول اصلی ──
      if (data.strategies?.length)      await db.strategies.bulkAdd(data.strategies as Strategy[]);
      if (data.phases?.length)          await db.phases.bulkAdd(data.phases as Phase[]);
      if (data.steps?.length)           await db.steps.bulkAdd(data.steps as Step[]);
      if (data.rules?.length)           await db.rules.bulkAdd(data.rules as Rule[]);
      if (data.analysisSessions?.length) await db.analysisSessions.bulkAdd(data.analysisSessions as AnalysisSession[]);
      if (data.trades?.length)          await db.trades.bulkAdd(data.trades as Trade[]);
      if (data.dailyJournals?.length)   await db.dailyJournals.bulkAdd(data.dailyJournals as DailyJournal[]);

      // ── جداول اضافی (اختیاری — ممکن است در backup قدیمی نباشند) ──
      if (data.symbolProfiles?.length)      await db.symbolProfiles.bulkAdd(data.symbolProfiles as any[]);
      if (data.learningAuditTrail?.length)  await db.learningAuditTrail.bulkAdd(data.learningAuditTrail as any[]);
      if (data.profileSnapshots?.length)    await db.profileSnapshots.bulkAdd(data.profileSnapshots as any[]);
      if (data.profileCorrections?.length)  await db.profileCorrections.bulkAdd(data.profileCorrections as any[]);
      if (data.knowledgeCategories?.length) await db.knowledgeCategories.bulkAdd(data.knowledgeCategories as any[]);
      if (data.replayDatasets?.length)      await db.replayDatasets.bulkAdd(data.replayDatasets as any[]);
      if (data.replayPlaylists?.length)     await db.replayPlaylists.bulkAdd(data.replayPlaylists as any[]);
      if (data.marketContextSessions?.length) await db.marketContextSessions.bulkAdd(data.marketContextSessions as any[]);
      if (data.tradeEvents?.length)       await db.tradeEvents.bulkAdd(data.tradeEvents as any[]);
      if (data.tradeVersions?.length)     await db.tradeVersions.bulkAdd(data.tradeVersions as any[]);
       if (restoredChartScreenshots.length) await db.chartScreenshots.bulkAdd(restoredChartScreenshots as any[]);
      if (data.riskProfiles?.length)     await db.riskProfiles.bulkAdd(data.riskProfiles as any[]);
      if (data.riskViolations?.length)    await db.riskViolations.bulkAdd(data.riskViolations as any[]);
      if (data.riskGroups?.length)        await db.riskGroups.bulkAdd(data.riskGroups as any[]);
      if (data.replaySessions?.length)    await db.replaySessions.bulkAdd(data.replaySessions as any[]);
      if (data.replayDecisions?.length)   await db.replayDecisions.bulkAdd(data.replayDecisions as any[]);
      if (data.knowledgeNotes?.length)    await db.knowledgeNotes.bulkAdd(data.knowledgeNotes as any[]);
      if (data.preTradeChecklists?.length) await db.preTradeChecklists.bulkAdd(data.preTradeChecklists as any[]);
      if (data.dailyFocus?.length)         await db.dailyFocus.bulkAdd(data.dailyFocus as any[]);
      if (data.accounts?.length)          await db.accounts.bulkAdd(data.accounts as any[]);
      if (data.tradingBoxes?.length)      await db.tradingBoxes.bulkAdd(data.tradingBoxes as any[]);
      if (data.performanceReviews?.length) await db.performanceReviews.bulkAdd(data.performanceReviews as any[]);
      if (data.screenshotGroups?.length) await db.screenshotGroups.bulkAdd(data.screenshotGroups as any[]);
      if (data.visualPatterns?.length) await db.visualPatterns.bulkAdd(data.visualPatterns as any[]);
      if (data.screenshotCollections?.length) await db.screenshotCollections.bulkAdd(data.screenshotCollections as any[]);
      if (data.journalSessions?.length) await db.journalSessions.bulkAdd(data.journalSessions as any[]);
      if (data.journalOptions?.length) await db.journalOptions.bulkAdd(data.journalOptions as any[]);
      if (data.journalSessionAnalyses?.length) await db.journalSessionAnalyses.bulkAdd(data.journalSessionAnalyses as any[]);
      if (data.strategyVersions?.length) await db.strategyVersions.bulkAdd(data.strategyVersions as any[]);
      if (data.journalTradeData?.length) await db.journalTradeData.bulkAdd(data.journalTradeData as any[]);
      if (data.journalSessionEvents?.length) await db.journalSessionEvents.bulkAdd(data.journalSessionEvents as any[]);
      if (data.journalTriggers?.length) await db.journalTriggers.bulkAdd(data.journalTriggers as any[]);
      if (restoredJournalMedia.length) await db.journalMedia.bulkAdd(restoredJournalMedia as any[]);
    });

    // Settings در localStorage ذخیره می‌شود — خارج از IndexedDB transaction (قابل قبول)
    if (data.settings) this.importSettings(data.settings);
  },

  // ────────── ادغام (Keep Newest) ──────────
  async importMerge(data: BackupData['data']): Promise<MergeStats> {
    const stats: MergeStats = { added: 0, updated: 0, skipped: 0 };
    const restoredChartScreenshots = restoreChartScreenshots(data.chartScreenshots);
    const restoredJournalMedia = restoreJournalMedia(data.journalMedia);

    const mergeTable = async (table: any, items: any[]) => {
      for (const item of items) {
        if (!item?.id) { stats.skipped++; continue; }
        const existing = await table.get(item.id);
        if (!existing) {
          await table.add(item);
          stats.added++;
        } else {
          const existingTime = existing.updatedAt ?? existing.createdAt ?? 0;
          const backupTime = item.updatedAt ?? item.createdAt ?? 0;
          if (backupTime > existingTime) {
            await table.put(item);
            stats.updated++;
          } else {
            stats.skipped++;
          }
        }
      }
    };

    // ادغام در یک تراکنش واحد: اگر وسط کار خطایی رخ دهد، هیچ تغییر نیمه‌کاره‌ای ذخیره نمی‌شود
    await db.transaction('rw', db.tables, async () => {
      await mergeTable(db.strategies, data.strategies || []);
      await mergeTable(db.phases, data.phases || []);
      await mergeTable(db.steps, data.steps || []);
      await mergeTable(db.rules, data.rules || []);
      await mergeTable(db.analysisSessions, data.analysisSessions || []);
      await mergeTable(db.trades, data.trades || []);
      await mergeTable(db.dailyJournals, data.dailyJournals || []);

      const extendedTables: Array<[any, unknown[] | undefined]> = [
        [db.symbolProfiles, data.symbolProfiles], [db.learningAuditTrail, data.learningAuditTrail],
        [db.profileSnapshots, data.profileSnapshots], [db.profileCorrections, data.profileCorrections],
        [db.knowledgeNotes, data.knowledgeNotes], [db.knowledgeCategories, data.knowledgeCategories],
        [db.replayDatasets, data.replayDatasets], [db.replaySessions, data.replaySessions],
        [db.replayDecisions, data.replayDecisions], [db.replayPlaylists, data.replayPlaylists],
        [db.marketContextSessions, data.marketContextSessions], [db.tradeEvents, data.tradeEvents],
        [db.tradeVersions, data.tradeVersions], [db.chartScreenshots, restoredChartScreenshots],
        [db.riskProfiles, data.riskProfiles], [db.riskViolations, data.riskViolations],
        [db.riskGroups, data.riskGroups], [db.performanceReviews, data.performanceReviews],
        [db.preTradeChecklists, data.preTradeChecklists], [db.dailyFocus, data.dailyFocus],
        [db.screenshotGroups, data.screenshotGroups], [db.visualPatterns, data.visualPatterns],
        [db.screenshotCollections, data.screenshotCollections], [db.accounts, data.accounts],
        [db.tradingBoxes, data.tradingBoxes],
        [db.journalSessions, data.journalSessions], [db.journalOptions, data.journalOptions],
        [db.journalSessionAnalyses, data.journalSessionAnalyses], [db.strategyVersions, data.strategyVersions],
        [db.journalTradeData, data.journalTradeData], [db.journalSessionEvents, data.journalSessionEvents],
        [db.journalTriggers, data.journalTriggers],
        [db.journalMedia, restoredJournalMedia],
      ];
      for (const [table, items] of extendedTables) {
        if (items?.length) await mergeTable(table, items);
      }
    });
    if (data.settings) this.importSettings(data.settings);

    return stats;
  },

  // ────────── پاک کردن همه داده‌ها ──────────
  async resetAll(): Promise<void> {
    const tables = [
      db.strategies, db.phases, db.steps, db.rules, db.analysisSessions, db.trades, db.dailyJournals,
      db.symbolProfiles, db.learningAuditTrail, db.profileSnapshots, db.profileCorrections,
      db.knowledgeNotes, db.knowledgeCategories, db.replayDatasets, db.replaySessions,
      db.replayDecisions, db.replayPlaylists, db.marketContextSessions, db.tradeEvents,
      db.tradeVersions, db.chartScreenshots, db.riskProfiles, db.riskViolations, db.riskGroups,
      db.accounts, db.tradingBoxes, db.performanceReviews, db.preTradeChecklists, db.dailyFocus,
      db.screenshotGroups, db.visualPatterns, db.screenshotCollections,
      db.journalSessions, db.journalOptions, db.journalSessionAnalyses,
      db.strategyVersions, db.journalTradeData, db.journalSessionEvents, db.journalMedia, db.journalTriggers,
    ];
    await db.transaction('rw', tables, async () => {
      await Promise.all(tables.map(table => table.clear()));
    });
    localStorage.removeItem(STORAGE_KEY_APP);
    localStorage.removeItem('tradermind-custom-symbols');
  },

  // ────────── تاریخچه ──────────
  getHistory(): BackupHistoryItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  addToHistory(item: BackupHistoryItem) {
    const history = this.getHistory();
    history.unshift(item);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 20)));
  },

  clearHistory() {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
  },

  // ────────── خروجی Spreadsheet چندبرگه ──────────
  async exportToExcel(): Promise<void> {
    const [trades, accounts, tradingBoxes, analysisSessions, dailyJournals, chartScreenshots] =
      await Promise.all([
        db.trades.toArray(),
        db.accounts.toArray(),
        db.tradingBoxes.toArray(),
        db.analysisSessions.toArray(),
        db.dailyJournals.toArray(),
        db.chartScreenshots.toArray(),
      ]);

    const dateValue = (value: unknown): SpreadsheetValue => {
      if (typeof value !== 'number' || !value) return '';
      return new Date(value).toISOString();
    };
    const jsonText = (value: unknown): SpreadsheetValue => {
      if (value == null || value === '') return '';
      try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed.join('، ') : typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
      } catch {
        return String(value);
      }
    };

    const tradeRows: SpreadsheetValue[][] = [
      ['شناسه', 'تاریخ بازشدن', 'تاریخ بسته‌شدن', 'نماد', 'جهت', 'وضعیت', 'نتیجه', 'سود/زیان خالص', 'سود/زیان خام', 'R', 'RR برنامه‌ریزی‌شده', 'حجم', 'ریسک٪', 'قیمت ورود', 'قیمت خروج', 'حد ضرر', 'هدف سود', 'جلسه', 'ستاپ', 'دلیل ورود', 'دلیل خروج', 'سایر هزینه‌ها', 'کمیسیون', 'اسپرد', 'احساسات', 'برچسب‌ها', 'یادداشت', 'درس‌آموخته'],
      ...trades.map(t => [
        t.id, dateValue(t.openedAt), dateValue(t.closedAt), t.symbol,
        t.direction === 'long' ? 'خرید (Long)' : 'فروش (Short)', t.status, t.result,
        getNetPnl(t), t.profitLoss, t.rMultiple, t.plannedRR, t.positionSize,
        t.riskPercentage, t.entryPrice, t.exitPrice, t.stopLoss, t.takeProfit,
        t.tradingSession, t.setupType, t.entryReason, t.reasonForExit, t.fees,
        t.commission, t.spread, jsonText(t.emotions), jsonText(t.tags), t.notes, t.lesson,
      ]),
    ];
    const accountRows: SpreadsheetValue[][] = [
      ['شناسه', 'نام حساب', 'بروکر', 'ارز', 'موجودی اولیه', 'موجودی فعلی', 'پیش‌فرض', 'یادداشت'],
      ...accounts.map(account => [account.id, account.name, account.broker, account.currency, account.initialBalance, account.currentBalance, account.isDefault, account.notes]),
    ];
    const boxRows: SpreadsheetValue[][] = [
      ['شناسه', 'نام باکس', 'حساب مرتبط', 'وضعیت', 'هدف معاملات', 'توضیحات', 'یادداشت'],
      ...tradingBoxes.map(box => [box.id, box.name, box.accountId ?? 'مشترک', box.status, box.targetTradeCount, box.description, box.notes]),
    ];
    const analysisRows: SpreadsheetValue[][] = [
      ['شناسه', 'عنوان', 'وضعیت', 'شروع', 'پایان', 'شناسه استراتژی', 'شناسه معامله', 'تصمیم نهایی', 'یادداشت'],
      ...analysisSessions.map(session => [session.id, session.title, session.status, dateValue(session.startedAt), dateValue(session.completedAt), session.strategyId, session.tradeId, session.finalDecision, session.notes]),
    ];
    const journalRows: SpreadsheetValue[][] = [
      ['شناسه', 'تاریخ', 'عنوان/خلاصه', 'یادداشت', 'ایجادشده'],
      ...dailyJournals.map((journal: any) => [journal.id, journal.date ?? '', journal.title ?? journal.summary ?? '', journal.notes ?? journal.content ?? '', dateValue(journal.createdAt)]),
    ];

    const screenshotRows: SpreadsheetValue[][] = [
      ['شناسه', 'معامله مرتبط', 'نماد', 'تایم‌فریم', 'نوع', 'برچسب', 'یادداشت', 'شماره تصویر'],
    ];
    const images: SpreadsheetImage[] = [];
    for (const screenshot of chartScreenshots as any[]) {
      let image: { bytes: Uint8Array; mime: string } | null = null;
      if (screenshot.imageBlob instanceof Blob) {
        image = { bytes: new Uint8Array(await screenshot.imageBlob.arrayBuffer()), mime: screenshot.imageBlob.type || 'image/png' };
      } else if (typeof screenshot.dataUrl === 'string') {
        image = dataUrlBytes(screenshot.dataUrl);
      }
      const imageNumber = image ? images.length + 1 : '';
      screenshotRows.push([screenshot.id, screenshot.tradeId, screenshot.symbol, screenshot.timeframe, screenshot.screenshotType, screenshot.label, screenshot.notes, imageNumber]);
      if (image) images.push({ ...image, row: screenshotRows.length });
    }
    // تصاویر قدیمی که هنوز داخل فیلد screenshots معامله هستند نیز export می‌شوند.
    for (const trade of trades) {
      try {
        const embedded = JSON.parse(trade.screenshots || '[]') as Array<{ dataUrl?: string; label?: string }>;
        for (const screenshot of embedded) {
          const image = typeof screenshot.dataUrl === 'string' ? dataUrlBytes(screenshot.dataUrl) : null;
          if (!image) continue;
          const imageNumber = images.length + 1;
          screenshotRows.push([`trade-${trade.id}-${imageNumber}`, trade.id, trade.symbol, '', 'trade', screenshot.label ?? '', '', imageNumber]);
          images.push({ ...image, row: screenshotRows.length });
        }
      } catch { /* تصویر قدیمی خراب است؛ داده‌های اصلی همچنان export می‌شوند */ }
    }

    const workbook = await buildSpreadsheetWorkbook([
      { name: 'معاملات', rows: tradeRows },
      { name: 'حساب‌ها', rows: accountRows },
      { name: 'باکس‌ها', rows: boxRows },
      { name: 'تحلیل‌ها', rows: analysisRows },
      { name: 'ژورنال‌ها', rows: journalRows },
      { name: 'اسکرین‌شات‌ها', rows: screenshotRows },
    ], images);
    const filename = `tradermind_spreadsheet_${new Date().toISOString().slice(0, 10)}.xlsx`;
    await deliverFile(workbook, filename);
  },
};
