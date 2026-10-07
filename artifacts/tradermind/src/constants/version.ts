/**
 * ثوابت نسخه‌بندی TraderMind
 * این فایل تنها منبع حقیقت برای شماره‌های نسخه است.
 *
 * APP_VERSION      — نسخه برنامه (Semantic Versioning: MAJOR.MINOR.PATCH)
 * DB_VERSION       — نسخه Schema پایگاه داده Dexie
 * BACKUP_FORMAT_VERSION — نسخه فرمت فایل‌های پشتیبان
 *
 * هنگام تغییر هر کدام از نسخه‌ها:
 *  - APP_VERSION:        پس از هر release قابل توجه افزایش پیدا می‌کند
 *  - DB_VERSION:         فقط با تغییر Schema پایگاه داده افزایش پیدا می‌کند
 *  - BACKUP_FORMAT_VERSION: فقط با تغییر ساختار فایل پشتیبان افزایش پیدا می‌کند
 */

export const APP_VERSION = '1.6.0';
export const DB_VERSION = 25;
export const BACKUP_FORMAT_VERSION = '3.1';
/** نسخه Schema برای فایل‌های پشتیبان */
export const SCHEMA_VERSION = 25;

/** نام کامل برنامه برای نمایش به کاربر */
export const APP_NAME = 'TraderMind';

/** نسخه کامل قابل نمایش */
export const DISPLAY_VERSION = `v${APP_VERSION}`;
