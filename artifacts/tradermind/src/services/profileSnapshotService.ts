/**
 * profileSnapshotService.ts — Prompt 18
 * مدیریت نسخه‌های پروفایل و تصحیح‌های کاربر (Profile Versioning & Privacy Controls)
 */
import { db, ProfileSnapshot, ProfileCorrection } from '../db/database';
import { InsightCorrection } from './traderProfileService';

// ── Snapshots ──────────────────────────────────────────────────────────────

/** ذخیره یک snapshot از پروفایل فعلی */
export async function saveProfileSnapshot(
  label: string,
  profileDataJson: string,
  tradeCount: number,
  closedCount: number,
): Promise<ProfileSnapshot> {
  const snap: ProfileSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    data: profileDataJson,
    tradeCount,
    closedCount,
    createdAt: Date.now(),
  };
  await db.profileSnapshots.add(snap);
  return snap;
}

/** بارگذاری همه snapshot‌ها به ترتیب تاریخ (جدیدترین اول) */
export async function loadProfileSnapshots(): Promise<ProfileSnapshot[]> {
  const snaps = await db.profileSnapshots.orderBy('createdAt').toArray();
  return snaps.reverse();
}

/** حذف یک snapshot */
export async function deleteProfileSnapshot(id: string): Promise<void> {
  await db.profileSnapshots.delete(id);
}

/** حداکثر تعداد snapshot‌های نگه‌داری‌شده (قدیمی‌ترین حذف می‌شود) */
const MAX_SNAPSHOTS = 20;

/** نگه‌داری snapshot — اگر بیش از MAX_SNAPSHOTS باشد، قدیمی‌ترین حذف می‌شود */
export async function saveProfileSnapshotAutoManaged(
  label: string,
  profileDataJson: string,
  tradeCount: number,
  closedCount: number,
): Promise<ProfileSnapshot> {
  const snap = await saveProfileSnapshot(label, profileDataJson, tradeCount, closedCount);
  const all = await loadProfileSnapshots();
  if (all.length > MAX_SNAPSHOTS) {
    const toDelete = all.slice(MAX_SNAPSHOTS);
    await Promise.all(toDelete.map(s => deleteProfileSnapshot(s.id)));
  }
  return snap;
}

// ── Corrections / Privacy Controls ─────────────────────────────────────────

/** ذخیره یا به‌روزرسانی یک تصحیح بینش */
export async function saveProfileCorrection(
  insightId: string,
  action: 'reject' | 'irrelevant',
  note?: string,
): Promise<void> {
  const corr: ProfileCorrection = {
    id: insightId,
    action,
    note,
    correctedAt: Date.now(),
  };
  await db.profileCorrections.put(corr);
}

/** حذف تصحیح یک بینش (بازگشت به حالت عادی) */
export async function deleteProfileCorrection(insightId: string): Promise<void> {
  await db.profileCorrections.delete(insightId);
}

/** بارگذاری همه تصحیح‌ها به صورت Record<insightId, InsightCorrection> */
export async function loadProfileCorrections(): Promise<Record<string, InsightCorrection>> {
  const all = await db.profileCorrections.toArray();
  const result: Record<string, InsightCorrection> = {};
  for (const c of all) {
    result[c.id] = {
      action: c.action,
      note: c.note,
      correctedAt: c.correctedAt,
    };
  }
  return result;
}

/** حذف همه تصحیح‌ها */
export async function clearAllProfileCorrections(): Promise<void> {
  await db.profileCorrections.clear();
}

// ── Auto-snapshot on milestone ─────────────────────────────────────────────

/** تولید برچسب فارسی برای snapshot */
export function generateSnapshotLabel(tradeCount: number): string {
  const now = new Date();
  const persianMonths = [
    'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
    'مهر','آبان','آذر','دی','بهمن','اسفند',
  ];
  const month = persianMonths[now.getMonth()];
  const year = now.getFullYear();
  return `${month} ${year} — ${tradeCount} معامله`;
}

/** milestone‌های snapshot خودکار: هر ۱۰، ۲۵، ۵۰، ۱۰۰ معامله */
export function isMilestoneCount(count: number): boolean {
  if (count <= 0) return false;
  if (count < 50)  return count % 10 === 0;
  if (count < 200) return count % 25 === 0;
  return count % 50 === 0;
}
