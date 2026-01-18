import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  columns: Array<{
    key: string;
    header: string;
    width?: number;
  }>;
  rows: Array<Record<string, string | number | Date | null>>;
  summary?: Record<string, string | number>;
}

export async function generatePDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(data.title, { align: 'center' });

      if (data.subtitle) {
        doc.fontSize(12).font('Helvetica').text(data.subtitle, { align: 'center' });
      }

      doc.fontSize(10).text(`Generated: ${data.generatedAt.toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      const columnWidth = (doc.page.width - 100) / data.columns.length;
      let xPosition = 50;

      doc.fontSize(10).font('Helvetica-Bold');

      data.columns.forEach((col) => {
        doc.text(col.header, xPosition, tableTop, {
          width: col.width || columnWidth,
          align: 'left',
        });
        xPosition += col.width || columnWidth;
      });

      // Draw header line
      doc.moveTo(50, tableTop + 15)
        .lineTo(doc.page.width - 50, tableTop + 15)
        .stroke();

      // Table rows
      let rowTop = tableTop + 25;
      doc.font('Helvetica').fontSize(9);

      for (const row of data.rows) {
        // Check if we need a new page
        if (rowTop > doc.page.height - 100) {
          doc.addPage();
          rowTop = 50;
        }

        xPosition = 50;

        data.columns.forEach((col) => {
          let value = row[col.key];

          if (value instanceof Date) {
            value = value.toLocaleString();
          } else if (value === null || value === undefined) {
            value = '-';
          }

          doc.text(String(value), xPosition, rowTop, {
            width: col.width || columnWidth,
            align: 'left',
          });
          xPosition += col.width || columnWidth;
        });

        rowTop += 20;
      }

      // Summary
      if (data.summary && Object.keys(data.summary).length > 0) {
        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica-Bold').text('Summary');
        doc.fontSize(10).font('Helvetica');

        for (const [key, value] of Object.entries(data.summary)) {
          doc.text(`${key}: ${value}`);
        }
      }

      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
          .text(
            `Page ${i + 1} of ${pageCount} | NetWatch Pro Report`,
            50,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - 100 }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function generateCSV(data: ReportData): string {
  const headers = data.columns.map(col => col.header).join(',');

  const rows = data.rows.map(row => {
    return data.columns.map(col => {
      let value = row[col.key];

      if (value instanceof Date) {
        value = value.toISOString();
      } else if (value === null || value === undefined) {
        value = '';
      }

      // Escape quotes and wrap in quotes if contains comma
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    }).join(',');
  }).join('\n');

  return `${headers}\n${rows}`;
}

export function generateExcel(data: ReportData): Buffer {
  const workbook = XLSX.utils.book_new();

  // Prepare data for worksheet
  const wsData = [
    // Title row
    [data.title],
    data.subtitle ? [data.subtitle] : [],
    [`Generated: ${data.generatedAt.toLocaleString()}`],
    [], // Empty row
    // Headers
    data.columns.map(col => col.header),
    // Data rows
    ...data.rows.map(row =>
      data.columns.map(col => {
        const value = row[col.key];
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value ?? '';
      })
    ),
  ].filter(row => row.length > 0);

  // Add summary if present
  if (data.summary && Object.keys(data.summary).length > 0) {
    wsData.push([]);
    wsData.push(['Summary']);
    for (const [key, value] of Object.entries(data.summary)) {
      wsData.push([key, value]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  worksheet['!cols'] = data.columns.map(col => ({
    wch: col.width ? Math.floor(col.width / 7) : 15,
  }));

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export function generateReport(data: ReportData, format: ReportFormat): Promise<Buffer | string> {
  switch (format) {
    case 'pdf':
      return generatePDF(data);
    case 'csv':
      return Promise.resolve(generateCSV(data));
    case 'xlsx':
      return Promise.resolve(generateExcel(data));
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
