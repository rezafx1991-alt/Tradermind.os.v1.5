import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildSpreadsheetWorkbook } from '../backupService';

describe('Spreadsheet export', () => {
  it('creates a multi-sheet XLSX archive with embedded media', async () => {
    const workbook = await buildSpreadsheetWorkbook([
      { name: 'معاملات', rows: [['نماد', 'سود خالص'], ['EURUSD', 90]] },
      { name: 'اسکرین‌شات‌ها', rows: [['شناسه', 'شماره تصویر'], ['shot-1', 1]] },
    ], [{
      row: 2,
      mime: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }]);

    const zip = await JSZip.loadAsync(workbook);
    expect(zip.file('xl/workbook.xml')).not.toBeNull();
    expect(zip.file('xl/worksheets/sheet1.xml')).not.toBeNull();
    expect(zip.file('xl/worksheets/sheet2.xml')).not.toBeNull();
    expect(zip.file('xl/drawings/drawing2.xml')).not.toBeNull();
    expect(zip.file('xl/media/image1.png')).not.toBeNull();

    const workbookXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbookXml).toContain('معاملات');
    expect(workbookXml).toContain('اسکرین‌شات‌ها');
  });
});