import { Customer, AccountStatement, StatementRow } from '../types';
import { formatCurrency, getTodayStr } from '../utils/helpers';

/**
 * خدمة توليد ملفات PDF
 * ملاحظة: هذه نسخة مبسطة. يمكن تحسينها لاحقاً باستخدام مكتبة PDF مثل pdfkit أو html2pdf
 */
export const PDFService = {
  /**
   * توليد HTML لكشف الحساب
   */
  generateStatementHTML(
    customer: Customer,
    statement: AccountStatement,
    companyName: string = 'الشركة',
    companyLogo?: string,
    companyPhone?: string,
    companyAddress?: string
  ): string {
    const today = getTodayStr();
    const rowsHTML = statement.rows
      .map(
        row => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">${row.date}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: right;">${row.desc}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">
          ${row.debit > 0 ? formatCurrency(row.debit) : '-'}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">
          ${row.credit > 0 ? formatCurrency(row.credit) : '-'}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold;">
          ${formatCurrency(Math.abs(row.runningBalance))}
        </td>
      </tr>
    `
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>كشف حساب - ${customer.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #2c3e50;
      padding-bottom: 20px;
    }
    .header-left {
      text-align: right;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 5px;
    }
    .company-info {
      font-size: 12px;
      color: #666;
    }
    .header-right {
      text-align: left;
      max-width: 150px;
    }
    .logo {
      max-width: 120px;
      height: auto;
    }
    .title {
      text-align: center;
      font-size: 28px;
      font-weight: bold;
      color: #2c3e50;
      margin: 30px 0;
    }
    .customer-info {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-right: 4px solid #3498db;
    }
    .customer-info h3 {
      color: #2c3e50;
      margin-bottom: 15px;
      font-size: 16px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      font-size: 14px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
    }
    .info-label {
      font-weight: bold;
      color: #666;
    }
    .info-value {
      color: #333;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-box {
      background: #f0f0f0;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      border-top: 3px solid #3498db;
    }
    .summary-box.debit {
      border-top-color: #e74c3c;
    }
    .summary-box.credit {
      border-top-color: #27ae60;
    }
    .summary-box.opening {
      border-top-color: #f39c12;
    }
    .summary-box.closing {
      border-top-color: #9b59b6;
    }
    .summary-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 8px;
      font-weight: bold;
    }
    .summary-value {
      font-size: 20px;
      font-weight: bold;
      color: #2c3e50;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    thead {
      background: #2c3e50;
      color: white;
    }
    th {
      padding: 15px;
      text-align: right;
      font-size: 14px;
      font-weight: bold;
    }
    td {
      padding: 12px 15px;
      border-bottom: 1px solid #ddd;
      text-align: right;
      font-size: 13px;
    }
    tr:hover {
      background: #f9f9f9;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    .signature-section {
      display: flex;
      justify-content: space-around;
      margin-top: 40px;
      padding-top: 30px;
    }
    .signature {
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #333;
      width: 120px;
      margin: 30px auto 10px;
    }
    @media print {
      body {
        background: white;
      }
      .container {
        box-shadow: none;
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="company-name">${companyName}</div>
        <div class="company-info">
          ${companyPhone ? `الهاتف: ${companyPhone}<br>` : ''}
          ${companyAddress ? `العنوان: ${companyAddress}<br>` : ''}
          تاريخ التقرير: ${today}
        </div>
      </div>
      ${
        companyLogo
          ? `
        <div class="header-right">
          <img src="${companyLogo}" alt="شعار الشركة" class="logo">
        </div>
      `
          : ''
      }
    </div>

    <!-- Title -->
    <div class="title">كشف الحساب</div>

    <!-- Customer Info -->
    <div class="customer-info">
      <h3>بيانات العميل</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">الاسم:</span>
          <span class="info-value">${customer.name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">النوع:</span>
          <span class="info-value">${this.translateCustomerType(statement.customerType)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">الهاتف:</span>
          <span class="info-value">${customer.phone || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">البريد:</span>
          <span class="info-value">${customer.email || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">الفترة:</span>
          <span class="info-value">${statement.startDate} إلى ${statement.endDate}</span>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <div class="summary">
      <div class="summary-box opening">
        <div class="summary-label">الرصيد الافتتاحي</div>
        <div class="summary-value">${formatCurrency(Math.abs(statement.openingBalance))}</div>
      </div>
      <div class="summary-box debit">
        <div class="summary-label">إجمالي الفواتير</div>
        <div class="summary-value">${formatCurrency(statement.summary.totalDebit)}</div>
      </div>
      <div class="summary-box credit">
        <div class="summary-label">إجمالي الدفعات</div>
        <div class="summary-value">${formatCurrency(statement.summary.totalCredit)}</div>
      </div>
      <div class="summary-box closing">
        <div class="summary-label">الرصيد الختامي</div>
        <div class="summary-value">${formatCurrency(Math.abs(statement.closingBalance))}</div>
      </div>
    </div>

    <!-- Transactions Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 12%;">التاريخ</th>
          <th style="width: 35%;">البيان</th>
          <th style="width: 15%;">مدين</th>
          <th style="width: 15%;">دائن</th>
          <th style="width: 23%;">الرصيد</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>

    <!-- Statistics -->
    <div class="customer-info" style="border-right-color: #9b59b6;">
      <h3>إحصائيات الحساب</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">عدد الفواتير:</span>
          <span class="info-value">${statement.summary.totalInvoices}</span>
        </div>
        <div class="info-item">
          <span class="info-label">الفواتير المعلقة:</span>
          <span class="info-value">${statement.summary.pendingInvoicesCount}</span>
        </div>
        <div class="info-item">
          <span class="info-label">نسبة الدفع:</span>
          <span class="info-value">${statement.summary.paymentPercentage.toFixed(1)}%</span>
        </div>
        <div class="info-item">
          <span class="info-label">متوسط فترة الدفع:</span>
          <span class="info-value">${statement.summary.averagePaymentDays} أيام</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>تم إنشاء هذا التقرير بواسطة نظام الحسابات والمبيعات</p>
      <p style="margin-top: 10px; font-size: 11px;">
        هذا التقرير صادر في: ${today} الساعة: ${new Date().toLocaleTimeString('ar-EG')}
      </p>
    </div>

    <!-- Signatures -->
    <div class="signature-section">
      <div class="signature">
        <div class="signature-line"></div>
        <div>توقيع العميل</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div>توقيع الموظف</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  },

  /**
   * طباعة HTML (يفتح نافذة الطباعة)
   */
  printHTML(html: string, title: string = 'طباعة'): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      // تأخير قليل للسماح للمتصفح بتحميل المحتوى
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  },

  /**
   * تحميل HTML كملف PDF (باستخدام html2pdf إذا كان متاحاً)
   * حالياً نستخدم طريقة بسيطة: حفظ كـ HTML وتحويله يدوياً
   */
  async downloadPDF(html: string, filename: string = 'statement.pdf'): Promise<void> {
    // محاولة استخدام html2pdf إذا كان متاحاً
    try {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      document.head.appendChild(script);

      script.onload = () => {
        const element = document.createElement('div');
        element.innerHTML = html;

        const opt = {
          margin: 10,
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
        };

        // @ts-ignore
        html2pdf().set(opt).from(element).save();
      };
    } catch (error) {
      // Fallback: تحميل كـ HTML
      this.downloadHTML(html, filename.replace('.pdf', '.html'));
    }
  },

  /**
   * تحميل HTML كملف نصي
   */
  downloadHTML(html: string, filename: string = 'statement.html'): void {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * ترجمة نوع العميل
   */
  translateCustomerType(type: string): string {
    const types: Record<string, string> = {
      individual: 'فرد',
      company: 'شركة',
      wholesale: 'جملة',
      trader: 'تاجر',
    };
    return types[type] || type;
  },
};
