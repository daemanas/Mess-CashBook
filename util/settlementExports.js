const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const REPORT_BLUE = '#18334B';
const REPORT_GOLD = '#C9A96E';
const REPORT_TEXT = '#213244';
const REPORT_MUTED = '#64748B';
const REPORT_BORDER = '#CBD5E1';

function formatMoney(value) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN');
}

function buildPdf({ data, groupName, adminName, generatedAt = new Date() }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 40, right: 40, bottom: 45, left: 40 },
            bufferPages: true
        });
        const chunks = [];
        const fontRegular = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
        const fontBold = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
        doc.registerFont('Report', fontRegular);
        doc.registerFont('Report-Bold', fontBold);
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 40;
        const tableWidth = pageWidth - margin * 2;
        const columns = [
            { label: 'Member Name', width: 220, align: 'left' },
            { label: 'Food Count', width: 78, align: 'right' },
            { label: 'Amount Paid', width: 112, align: 'right' },
            { label: 'Payable', width: 112, align: 'right' },
            { label: 'Final Balance', width: 120, align: 'right' },
            { label: 'Status', width: 119, align: 'center' }
        ];
        const drawPageHeader = () => {
            doc.rect(0, 0, pageWidth, 76).fill(REPORT_BLUE);
            doc.fillColor('#FFFFFF').font('Report-Bold').fontSize(18)
                .text('MESSBOOK', margin, 17, { lineBreak: false });
            doc.fillColor(REPORT_GOLD).font('Report-Bold').fontSize(10)
                .text('MONTHLY FINAL SETTLEMENT', margin, 43, { lineBreak: false });
            doc.fillColor('#FFFFFF').font('Report').fontSize(10)
                .text(groupName, pageWidth - margin - 340, 20, {
                    width: 340,
                    align: 'right',
                    ellipsis: true,
                    lineBreak: false
                });
            doc.fillColor('#D6E2EE').font('Report').fontSize(8)
                .text(`${data.period.label}  ·  Generated ${formatDate(generatedAt)}`, pageWidth - margin - 340, 42, {
                    width: 340,
                    align: 'right',
                    lineBreak: false
                });
            doc.y = 92;
        };

        const drawTableHeader = () => {
            const y = doc.y;
            let x = margin;
            columns.forEach(column => {
                doc.rect(x, y, column.width, 26).fill(REPORT_BLUE);
                doc.fillColor('#FFFFFF').font('Report-Bold').fontSize(8)
                    .text(column.label, x + 7, y + 8, {
                        width: column.width - 14,
                        align: column.align,
                        lineBreak: false
                    });
                x += column.width;
            });
            doc.y = y + 26;
        };

        const drawRow = (values, index, emphasize = false) => {
            const y = doc.y;
            const rowHeight = 24;
            let x = margin;
            columns.forEach((column, columnIndex) => {
                doc.rect(x, y, column.width, rowHeight)
                    .fillAndStroke(emphasize ? '#EAF0F5' : (index % 2 ? '#F7F9FB' : '#FFFFFF'), REPORT_BORDER);
                doc.fillColor(REPORT_TEXT)
                    .font(emphasize ? 'Report-Bold' : 'Report')
                    .fontSize(8)
                    .text(String(values[columnIndex] ?? ''), x + 7, y + 7, {
                        width: column.width - 14,
                        align: column.align,
                        lineBreak: false,
                        ellipsis: true
                    });
                x += column.width;
            });
            doc.y = y + rowHeight;
        };

        drawPageHeader();
        doc.fillColor(REPORT_TEXT).font('Report-Bold').fontSize(10)
            .text('Financial Summary', margin, doc.y);
        doc.moveDown(0.45);

        const summaryRows = [
            ['Total Expenses', formatMoney(data.expenseTotal), 'Total Food Count', String(data.grandTotalFood)],
            ['Per Meal Price', formatMoney(data.perMealPrice), 'Total Money Added', formatMoney(data.totals.paid)],
            ['Total Payable', formatMoney(data.totals.payable), 'Total Receive', formatMoney(data.totals.receive)],
            ['Total Due', formatMoney(data.totals.due), 'Members', String(data.settlement.length)]
        ];
        const summaryTop = doc.y;
        const summaryColumnWidth = (tableWidth - 24) / 2;
        summaryRows.forEach((row, index) => {
            const y = summaryTop + index * 23;
            [0, 2].forEach((offset, pairIndex) => {
                const x = margin + pairIndex * (summaryColumnWidth + 24);
                doc.fillColor(REPORT_MUTED).font('Report').fontSize(8)
                    .text(row[offset], x, y, { width: summaryColumnWidth * 0.62, lineBreak: false });
                doc.fillColor(REPORT_TEXT).font('Report-Bold').fontSize(8)
                    .text(row[offset + 1], x + summaryColumnWidth * 0.62, y, {
                        width: summaryColumnWidth * 0.38,
                        align: 'right',
                        lineBreak: false
                    });
            });
        });
        doc.y = summaryTop + summaryRows.length * 23 + 12;

        doc.fillColor(REPORT_TEXT).font('Report-Bold').fontSize(10)
            .text('Member-wise Settlement', margin, doc.y);
        doc.moveDown(0.45);
        drawTableHeader();

        data.settlement.forEach((row, index) => {
            if (doc.y + 24 > pageHeight - 54) {
                doc.addPage();
                drawPageHeader();
                drawTableHeader();
            }
            drawRow([
                row.name,
                row.foodCount,
                formatMoney(row.paidAmount),
                formatMoney(row.payableAmount),
                formatMoney(row.finalBalance),
                row.status
            ], index);
        });

        if (doc.y + 94 > pageHeight - 54) {
            doc.addPage();
            drawPageHeader();
        }
        doc.moveDown(0.55);
        drawRow([
            'Grand Total',
            data.grandTotalFood,
            formatMoney(data.totals.paid),
            formatMoney(data.totals.payable),
            formatMoney(data.totals.paid - data.totals.payable),
            ''
        ], data.settlement.length, true);
        doc.moveDown(0.55);
        doc.fillColor(REPORT_MUTED).font('Report').fontSize(8)
            .text('Receive means the member paid more than their share; Due means an outstanding balance remains. CLEAR means the member is settled.', margin, doc.y, {
                width: tableWidth
            });
        doc.moveDown(0.6);
        doc.fillColor(REPORT_TEXT).font('Report-Bold').fontSize(8)
            .text(`Authorized Admin: ${adminName || 'Mess Administrator'}`, margin, doc.y, { width: tableWidth });

        const pageRange = doc.bufferedPageRange();
        for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
            doc.switchToPage(index);
            doc.fillColor(REPORT_MUTED).font('Report').fontSize(8)
                .text(`MESSBOOK · ${data.period.label}`, margin, pageHeight - 58, {
                    width: tableWidth * 0.7,
                    lineBreak: false
                });
            doc.text(`Page ${index + 1} of ${pageRange.count}`, margin + tableWidth * 0.7, pageHeight - 58, {
                width: tableWidth * 0.3,
                align: 'right',
                lineBreak: false
            });
        }
        doc.end();
    });
}

async function buildExcel({ data, groupName }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MESSBOOK';
    workbook.created = new Date();
    workbook.subject = `Monthly Final Settlement - ${data.period.label}`;

    const summary = workbook.addWorksheet('Monthly Summary');
    summary.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 28 }
    ];
    summary.addRows([
        { metric: 'Group Name', value: groupName },
        { metric: 'Month and Year', value: data.period.label },
        { metric: 'Total Expenses', value: data.expenseTotal },
        { metric: 'Total Meals', value: data.grandTotalFood },
        { metric: 'Per Meal Price', value: data.perMealPrice },
        { metric: 'Total Money Added', value: data.totals.paid },
        { metric: 'Total Payable', value: data.totals.payable },
        { metric: 'Total Receive', value: data.totals.receive },
        { metric: 'Total Due', value: data.totals.due }
    ]);

    const members = workbook.addWorksheet('Member Settlement');
    members.columns = [
        { header: 'Member Name', key: 'name', width: 30 },
        { header: 'Food Count', key: 'foodCount', width: 16 },
        { header: 'Paid Amount', key: 'paidAmount', width: 18 },
        { header: 'Payable Amount', key: 'payableAmount', width: 20 },
        { header: 'Final Balance', key: 'finalBalance', width: 18 },
        { header: 'Settlement Status', key: 'status', width: 22 }
    ];
    members.addRows(data.settlement);

    const expenses = workbook.addWorksheet('Expense Details');
    expenses.columns = [
        { header: 'Expense Date', key: 'date', width: 20 },
        { header: 'Expense Title', key: 'title', width: 36 },
        { header: 'Amount', key: 'amount', width: 18 }
    ];
    expenses.addRows(data.expenseDetails.map(entry => ({
        date: entry.entry_date,
        title: entry.vag_name,
        amount: Number(entry.entry_amount) || 0
    })));

    const payments = workbook.addWorksheet('Money Added Details');
    payments.columns = [
        { header: 'Payment Date', key: 'date', width: 20 },
        { header: 'Member Name', key: 'name', width: 30 },
        { header: 'Amount', key: 'amount', width: 18 }
    ];
    payments.addRows(data.paymentDetails.map(entry => ({
        date: entry.entry_date,
        name: entry.entry_title,
        amount: Number(entry.entry_amount) || 0
    })));

    [summary, members, expenses, payments].forEach(sheet => {
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: sheet.rowCount, column: sheet.columnCount }
        };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });
    expenses.getColumn('date').numFmt = 'dd mmm yyyy';
    payments.getColumn('date').numFmt = 'dd mmm yyyy';

    [summary, members, expenses, payments].forEach(sheet => {
        const header = sheet.getRow(1);
        header.height = 24;
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18334B' } };
        header.alignment = { vertical: 'middle' };
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) row.alignment = { vertical: 'middle' };
        });
    });
    ['Total Expenses', 'Per Meal Price', 'Total Money Added', 'Total Payable', 'Total Receive', 'Total Due']
        .forEach(metric => {
            const row = summary.findRow(summary.getColumn('metric').values.indexOf(metric));
            if (row) row.getCell(2).numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
        });
    ['paidAmount', 'payableAmount', 'finalBalance'].forEach(key => {
        members.getColumn(key).numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
    });
    expenses.getColumn('amount').numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
    payments.getColumn('amount').numFmt = '₹#,##0.00;[Red]-₹#,##0.00';

    return workbook.xlsx.writeBuffer();
}

module.exports = { buildExcel, buildPdf };
