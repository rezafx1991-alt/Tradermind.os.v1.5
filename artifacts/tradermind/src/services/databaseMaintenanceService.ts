/**
 * databaseMaintenanceService.ts — PART 2
 * سرویس نگهداری دیتابیس: پیدا کردن و پاکسازی داده‌های یتیم (Orphan)
 * تمام عملیات cleanup در یک transaction اجرا می‌شود.
 */

import { db } from '../db/database';

// ── نتایج بررسی یتیم‌ها ─────────────────────────────────────────────────────

export interface OrphanReport {
  orphanTradeEvents: string[];
  orphanTradeVersions: string[];
  orphanRiskViolations: string[];
  orphanScreenshots: string[];
  orphanLearningLogs: string[];
  total: number;
}

// ── سرویس نگهداری ────────────────────────────────────────────────────────────

export const databaseMaintenanceService = {

  /**
   * پیدا کردن tradeEvent هایی که tradeId آن‌ها در جدول trades وجود ندارد
   */
  async findOrphanTradeEvents(): Promise<string[]> {
    const allEvents = await db.tradeEvents.toArray();
    const tradeIds = new Set((await db.trades.toArray()).map(t => t.id));
    return allEvents
      .filter(e => !tradeIds.has(e.tradeId))
      .map(e => e.id);
  },

  /**
   * پیدا کردن tradeVersion هایی که tradeId آن‌ها در جدول trades وجود ندارد
   */
  async findOrphanTradeVersions(): Promise<string[]> {
    const allVersions = await db.tradeVersions.toArray();
    const tradeIds = new Set((await db.trades.toArray()).map(t => t.id));
    return allVersions
      .filter(v => !tradeIds.has(v.tradeId))
      .map(v => v.id);
  },

  /**
   * پیدا کردن riskViolation هایی که tradeId آن‌ها در جدول trades وجود ندارد
   */
  async findOrphanRiskViolations(): Promise<string[]> {
    const allViolations = await db.riskViolations.toArray();
    const tradeIds = new Set((await db.trades.toArray()).map(t => t.id));
    return allViolations
      .filter(v => v.tradeId != null && !tradeIds.has(v.tradeId))
      .map(v => v.id);
  },

  /**
   * پیدا کردن chartScreenshot هایی که tradeId آن‌ها در جدول trades وجود ندارد
   */
  async findOrphanScreenshots(): Promise<string[]> {
    const allScreenshots = await db.chartScreenshots.toArray();
    const tradeIds = new Set((await db.trades.toArray()).map(t => t.id));
    return allScreenshots
      .filter(s => s.tradeId != null && !tradeIds.has(s.tradeId!))
      .map(s => s.id);
  },

  /**
   * پیدا کردن learningAuditTrail هایی که tradeId آن‌ها در جدول trades وجود ندارد
   */
  async findOrphanLearningLogs(): Promise<string[]> {
    const allLogs = await db.learningAuditTrail.toArray();
    const tradeIds = new Set((await db.trades.toArray()).map(t => t.id));
    return allLogs
      .filter(l => l.tradeId != null && !tradeIds.has(l.tradeId))
      .map(l => l.id);
  },

  /**
   * PART 4: پاکسازی Screenshot های یتیم (بدون tradeId معتبر)
   * عملیات در یک transaction انجام می‌شود.
   */
  async cleanupOrphanScreenshots(): Promise<number> {
    const orphanIds = await databaseMaintenanceService.findOrphanScreenshots();
    if (orphanIds.length === 0) return 0;

    await db.transaction('rw', [db.chartScreenshots], async () => {
      await db.chartScreenshots.bulkDelete(orphanIds);
    });

    return orphanIds.length;
  },

  /**
   * گزارش کامل از تمام یتیم‌های دیتابیس
   */
  async getOrphanReport(): Promise<OrphanReport> {
    const [
      orphanTradeEvents,
      orphanTradeVersions,
      orphanRiskViolations,
      orphanScreenshots,
      orphanLearningLogs,
    ] = await Promise.all([
      databaseMaintenanceService.findOrphanTradeEvents(),
      databaseMaintenanceService.findOrphanTradeVersions(),
      databaseMaintenanceService.findOrphanRiskViolations(),
      databaseMaintenanceService.findOrphanScreenshots(),
      databaseMaintenanceService.findOrphanLearningLogs(),
    ]);

    return {
      orphanTradeEvents,
      orphanTradeVersions,
      orphanRiskViolations,
      orphanScreenshots,
      orphanLearningLogs,
      total:
        orphanTradeEvents.length +
        orphanTradeVersions.length +
        orphanRiskViolations.length +
        orphanScreenshots.length +
        orphanLearningLogs.length,
    };
  },

  /**
   * پاکسازی تمام یتیم‌ها در یک transaction واحد (Atomic)
   * تمام عملیات delete در یک تراکنش اجرا می‌شوند تا consistency حفظ شود.
   */
  async cleanupOrphans(): Promise<OrphanReport> {
    // ابتدا گزارش می‌گیریم
    const report = await databaseMaintenanceService.getOrphanReport();

    if (report.total === 0) return report;

    await db.transaction(
      'rw',
      [
        db.tradeEvents,
        db.tradeVersions,
        db.riskViolations,
        db.chartScreenshots,
        db.learningAuditTrail,
      ],
      async () => {
        // حذف tradeEvent های یتیم
        if (report.orphanTradeEvents.length > 0) {
          await db.tradeEvents.bulkDelete(report.orphanTradeEvents);
        }
        // حذف tradeVersion های یتیم
        if (report.orphanTradeVersions.length > 0) {
          await db.tradeVersions.bulkDelete(report.orphanTradeVersions);
        }
        // حذف riskViolation های یتیم
        if (report.orphanRiskViolations.length > 0) {
          await db.riskViolations.bulkDelete(report.orphanRiskViolations);
        }
        // حذف chartScreenshot های یتیم
        if (report.orphanScreenshots.length > 0) {
          await db.chartScreenshots.bulkDelete(report.orphanScreenshots);
        }
        // حذف learningAuditTrail های یتیم
        if (report.orphanLearningLogs.length > 0) {
          await db.learningAuditTrail.bulkDelete(report.orphanLearningLogs);
        }
      }
    );

    return report;
  },
};
