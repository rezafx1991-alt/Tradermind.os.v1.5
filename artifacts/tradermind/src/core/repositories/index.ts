/**
 * لایه انتزاعی Repository — PROMPT 9
 *
 * این Interface‌ها تضمین می‌کنند که منطق برنامه
 * مستقیماً به IndexedDB (Dexie) وابسته نباشد.
 * در آینده برای Android می‌توان Implementation جداگانه‌ای
 * (مثلاً SQLite یا Room) ارائه داد بدون تغییر در لایه بالاتر.
 */

// ── Repository پایه ──────────────────────────────────────
export interface IRepository<T, K = string> {
  getAll(): Promise<T[]>;
  getById(id: K): Promise<T | undefined>;
  add(item: T): Promise<void>;
  update(item: T): Promise<void>;
  delete(id: K): Promise<void>;
  clear(): Promise<void>;
}

// ── ذخیره‌سازی کلید-مقدار (تنظیمات) ────────────────────
export interface IKeyValueStore {
  get<T = string>(key: string): T | null;
  set<T = string>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
  keys(): string[];
}

// ── ذخیره‌سازی فایل ──────────────────────────────────────
export interface IFileStore {
  /**
   * ذخیره فایل و بازگرداندن شناسه/مسیر منطقی
   * Web: base64 در IndexedDB
   * Android: مسیر فایل در storage داخلی
   */
  saveFile(data: Blob | string, name: string): Promise<string>;
  readFile(id: string): Promise<Blob | null>;
  deleteFile(id: string): Promise<void>;
}

// ── Repository‌های اختصاصی ────────────────────────────────
export interface IStrategyRepository<T> extends IRepository<T> {
  getActive(): Promise<T[]>;
  getByName(name: string): Promise<T | undefined>;
}

export interface ITradeRepository<T> extends IRepository<T> {
  getByStatus(status: string): Promise<T[]>;
  getBySymbol(symbol: string): Promise<T[]>;
  getByDateRange(from: number, to: number): Promise<T[]>;
}

export interface IJournalRepository<T> extends IRepository<T> {
  getByDate(date: string): Promise<T | undefined>;
  getByDateRange(from: string, to: string): Promise<T[]>;
}

export interface IAnalysisRepository<T> extends IRepository<T> {
  getByStrategy(strategyId: string): Promise<T[]>;
  getByStatus(status: string): Promise<T[]>;
}

// ── قرارداد سرویس پشتیبان‌گیری ───────────────────────────
export interface IBackupService {
  exportAll(): Promise<void>;
  exportEncrypted(password: string): Promise<void>;
  validateFile(file: File): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
  importReplace(data: unknown): Promise<void>;
  importMerge(data: unknown): Promise<{ added: number; updated: number; skipped: number }>;
  resetAll(): Promise<void>;
}

// ── قرارداد سرویس رمزنگاری ───────────────────────────────
export interface ICryptoService {
  hashCredential(password: string): Promise<{ salt: string; hash: string; iterations: number }>;
  verifyCredential(password: string, stored: { salt: string; hash: string; iterations: number }): Promise<boolean>;
  encrypt(plaintext: string, password: string): Promise<string>;
  decrypt(encrypted: string, password: string): Promise<string>;
  sha256(data: string): Promise<string>;
}
