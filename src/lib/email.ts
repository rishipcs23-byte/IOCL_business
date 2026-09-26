/**
 * email.ts — Centralised e-mail utility for IOCL Petrol Pump Management System
 *
 * SMTP Credentials (configured in .env / .env.local):
 *   SMTP_HOST        — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT        — SMTP port (587 for TLS, 465 for SSL)
 *   SMTP_SECURE      — "true" for SSL/port-465, "false" for STARTTLS/port-587
 *   SMTP_USER        — Gmail / SMTP email username (SENDER)
 *   SMTP_PASS        — Gmail App Password or SMTP password
 *   ALERT_EMAIL_FROM — Sender display name + address
 *
 * RECIPIENTS:
 *   Recipient email addresses (Owner Email & Manager Email) are stored in
 *   the application database (SystemSetting table: EMAIL_OWNER, EMAIL_MANAGER).
 *
 * CRITICAL BUSINESS RULE:
 *   Low-stock email alerts MUST ONLY be triggered using the VERIFIED PHYSICAL STOCK
 *   obtained from the physical tank dip at End Duty.
 *   NEVER trigger alerts from theoretical/book stock.
 *   If BOTH MS and HSD are ≤ 6000 L, ONE COMBINED email alert is sent for both fuels.
 *   Alerts trigger only on threshold crossing (<= 6000 L) and reset when physical stock > 6000 L.
 */

import nodemailer from 'nodemailer';
import { db } from './db';
import { sendSmsAlert } from './sms';

// ---------------------------------------------------------------------------
// Config & Recipient Helpers
// ---------------------------------------------------------------------------

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number((process.env.SMTP_PORT || '587').trim()) || 587;
  const secure = (process.env.SMTP_SECURE || '').trim() === 'true';
  const user = (process.env.SMTP_USER || '').trim();
  const rawPass = (process.env.SMTP_PASS || '').trim();
  const pass = rawPass.replace(/\s+/g, '');

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  };
}

function getSender(): string {
  const envFrom = (process.env.ALERT_EMAIL_FROM || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  if (envFrom) return envFrom;
  if (user) return `"Petrol Bunk System" <${user}>`;
  return `"Petrol Bunk System" <noreply@petrolbunk.local>`;
}

export interface SmtpDiagnosticResult {
  smtpConfigured: boolean;
  smtpUser: string;
  smtpPasswordPresent: boolean;
  smtpPasswordLength: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  verifySuccess: boolean;
  verifyMessage: string;
}

export async function diagnoseSmtpConfig(): Promise<SmtpDiagnosticResult> {
  const cfg = getSmtpConfig();
  const rawPass = (process.env.SMTP_PASS || '').trim();

  const isConfigured = !!(cfg.host && cfg.auth.user && cfg.auth.pass);
  const passwordLength = rawPass.length;

  const result: SmtpDiagnosticResult = {
    smtpConfigured: isConfigured,
    smtpUser: cfg.auth.user || 'Not Configured',
    smtpPasswordPresent: passwordLength > 0,
    smtpPasswordLength: passwordLength,
    smtpHost: cfg.host,
    smtpPort: cfg.port,
    smtpSecure: cfg.secure,
    verifySuccess: false,
    verifyMessage: '',
  };

  if (!isConfigured) {
    result.verifyMessage = 'SMTP credentials incomplete in environment variables.';
    return result;
  }

  try {
    const transporter = nodemailer.createTransport(cfg);
    await transporter.verify();
    result.verifySuccess = true;
    result.verifyMessage = '✓ Nodemailer transporter.verify() succeeded! Gmail SMTP connection verified.';
  } catch (err: any) {
    const safeError = rawPass
      ? err?.message?.replace(new RegExp(rawPass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '****')
      : err?.message;
    result.verifySuccess = false;
    result.verifyMessage = `✕ transporter.verify() failed: ${safeError || 'SMTP connection failed'}`;
  }

  return result;
}

/** Default low-stock threshold in litres (inclusive: ≤ threshold triggers alert) */
export const LOW_FUEL_THRESHOLD_LITRES = Number(process.env.LOW_FUEL_THRESHOLD_LITRES) || 7000;

export async function ensureDefaultEmailRecipientsMigrated(): Promise<void> {
  try {
    if ((db as any).emailRecipient) {
      const count = await (db as any).emailRecipient.count();
      if (count === 0) {
        let ownerEmail = '';
        let managerEmail = '';
        try {
          const settings = await (db as any).systemSetting.findMany({
            where: { key: { in: ['EMAIL_OWNER', 'EMAIL_MANAGER'] } }
          });
          for (const s of settings) {
            if (s.key === 'EMAIL_OWNER') ownerEmail = s.value;
            if (s.key === 'EMAIL_MANAGER') managerEmail = s.value;
          }
        } catch (_) {}

        if (!ownerEmail && process.env.ALERT_EMAIL_TO) {
          ownerEmail = process.env.ALERT_EMAIL_TO.trim();
        }

        if (ownerEmail && ownerEmail.includes('@')) {
          await (db as any).emailRecipient.create({
            data: {
              name: 'Owner',
              email: ownerEmail.trim().toLowerCase(),
              active: true,
              dutyReportsEnabled: true,
              lowFuelAlertsEnabled: true,
            }
          });
        }
        if (managerEmail && managerEmail.includes('@') && managerEmail.trim().toLowerCase() !== (ownerEmail ? ownerEmail.trim().toLowerCase() : '')) {
          await (db as any).emailRecipient.create({
            data: {
              name: 'Manager',
              email: managerEmail.trim().toLowerCase(),
              active: true,
              dutyReportsEnabled: true,
              lowFuelAlertsEnabled: true,
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('[EMAIL MIGRATION] Error migrating default email recipients:', err);
  }
}

/** Fetch recipient email addresses dynamically from database EmailRecipient model */
export async function getEmailRecipients(type: 'DUTY_REPORT' | 'LOW_STOCK_ALERT' | 'ALL' = 'ALL'): Promise<string[]> {
  try {
    await ensureDefaultEmailRecipientsMigrated();

    let recipientsList: any[] = [];
    if ((db as any).emailRecipient) {
      const whereClause: any = { active: true };
      if (type === 'DUTY_REPORT') whereClause.dutyReportsEnabled = true;
      if (type === 'LOW_STOCK_ALERT') whereClause.lowFuelAlertsEnabled = true;

      recipientsList = await (db as any).emailRecipient.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' }
      });
    }

    const emails: string[] = recipientsList
      .map(r => r.email ? r.email.trim() : '')
      .filter(e => e && e.includes('@'));

    if (emails.length > 0) {
      return Array.from(new Set(emails));
    }

    // Fallback if no database recipients configured
    if (process.env.ALERT_EMAIL_TO) {
      return [process.env.ALERT_EMAIL_TO.trim()];
    }
    return [];
  } catch (e) {
    console.error('[EMAIL] Failed to fetch email recipients from DB:', e);
    return process.env.ALERT_EMAIL_TO ? [process.env.ALERT_EMAIL_TO.trim()] : [];
  }
}

/** Returns true if SMTP credentials are provided */
function isSmtpConfigured(): boolean {
  const cfg = getSmtpConfig();
  return !!(cfg.host && cfg.auth.user && cfg.auth.pass);
}

/** Create a nodemailer transporter. Returns null if config is missing. */
function createTransporter() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport(getSmtpConfig());
}

/** Record email delivery status into EmailLog table (logs each recipient separately) */
async function logEmailDelivery(
  emailType: string,
  reference: string | null,
  recipients: string[],
  status: 'SENT' | 'FAILED',
  errorMessage?: string,
  smsStatus?: 'SENT' | 'FAILED' | 'SKIPPED',
  smsErrorMessage?: string
) {
  try {
    if ((db as any).emailLog) {
      for (const rec of recipients) {
        await (db as any).emailLog.create({
          data: {
            emailType,
            reference,
            recipients: rec.trim(),
            status,
            errorMessage: errorMessage ? errorMessage.slice(0, 500) : null,
            smsStatus: smsStatus || null,
            smsErrorMessage: smsErrorMessage ? smsErrorMessage.slice(0, 500) : null,
          }
        });
      }
    }
  } catch (err) {
    console.error('[EMAIL LOG] Failed to record email log in DB:', err);
  }
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatLitres(litres: number): string {
  return litres.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' L';
}

function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimestamp(date?: Date | string | null): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// 1. REAL TEST EMAIL ACTION
// ---------------------------------------------------------------------------

export async function sendTestEmail(explicitRecipients?: string[]): Promise<{ success: boolean; message: string }> {
  const recipients = explicitRecipients && explicitRecipients.length > 0
    ? explicitRecipients
    : await getEmailRecipients();

  if (recipients.length === 0) {
    return {
      success: false,
      message: 'No recipient email addresses configured. Please save Owner Email and Manager Email in System Configuration.',
    };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return {
      success: false,
      message: 'SMTP credentials not configured in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).',
    };
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Test Email — IOCL Petrol Pump System</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#2563eb;padding:24px 32px;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#bfdbfe;letter-spacing:2px;text-transform:uppercase;">⛽ IOCL PETROL PUMP SYSTEM</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;">✓ Real-Time Email Delivery Test</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.5;">
              Congratulations! Your server-side e-mail delivery pipeline is <strong>100% active and working</strong>.
            </p>
            <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#111827;background:#f9fafb;">
              <tr>
                <td style="border-bottom:1px solid #e5e7eb;width:40%;"><strong>Email Provider</strong></td>
                <td style="border-bottom:1px solid #e5e7eb;">Gmail SMTP (${process.env.SMTP_HOST || 'smtp.gmail.com'})</td>
              </tr>
              <tr>
                <td style="border-bottom:1px solid #e5e7eb;"><strong>Sender Address</strong></td>
                <td style="border-bottom:1px solid #e5e7eb;">${getSender()}</td>
              </tr>
              <tr>
                <td><strong>Configured Recipients</strong></td>
                <td>${recipients.join(', ')}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;color:#4b5563;line-height:1.5;">
              The system will now automatically send:
              <br>• <strong>Daily Duty Closing Summary Reports</strong> after every successful End Duty.
              <br>• <strong>Low Fuel Stock Alerts</strong> when verified physical tank dip stock falls ≤ 6,000 L.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              Test email generated on ${formatTimestamp(new Date())} | IOCL Bunk Accounting System
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: getSender(),
      to: recipients.join(', '),
      subject: `✓ Test Email — IOCL Petrol Pump Delivery Pipeline Active`,
      html,
      text: `✓ Test Email Success!\nSender: ${getSender()}\nRecipients: ${recipients.join(', ')}\nEmail pipeline is 100% active and ready for automatic duty closing reports and low stock alerts.`,
    });

    await logEmailDelivery('TEST_EMAIL', 'System Config', recipients, 'SENT');
    return {
      success: true,
      message: `✓ Test email sent successfully to: ${recipients.join(', ')}`,
    };
  } catch (err: any) {
    const safeErrorMsg = err?.message
      ? err.message.replace(new RegExp(process.env.SMTP_PASS || '___', 'gi'), '****')
      : 'SMTP Connection Failed';

    await logEmailDelivery('TEST_EMAIL', 'System Config', recipients, 'FAILED', safeErrorMsg);
    return {
      success: false,
      message: `✕ Email delivery failed: ${safeErrorMsg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. LOW FUEL STOCK ALERT (MS, HSD, OR COMBINED BOTH)
// ---------------------------------------------------------------------------

export interface LowStockAlertPayload {
  fuelType: 'MS' | 'HSD' | 'BOTH';
  dutyNumber: number;
  msStock?: {
    physicalStock: number;
    bookStock?: number | null;
    isCorrected?: boolean;
    correctionReason?: string;
  };
  hsdStock?: {
    physicalStock: number;
    bookStock?: number | null;
    isCorrected?: boolean;
    correctionReason?: string;
  };
}

export async function sendLowFuelStockAlert(
  payload: LowStockAlertPayload,
  explicitRecipients?: string[]
): Promise<void> {
  const recipients = explicitRecipients && explicitRecipients.length > 0
    ? explicitRecipients
    : await getEmailRecipients('LOW_STOCK_ALERT');

  if (recipients.length === 0) {
    console.warn(`[EMAIL] Low stock alert skipped — no recipients configured for Duty #${payload.dutyNumber}.`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn(`[EMAIL] Low stock alert skipped — SMTP credentials not configured for Duty #${payload.dutyNumber}.`);
    return;
  }

  const isBoth = payload.fuelType === 'BOTH';
  const alertTitle = isBoth
    ? '🚨 LOW FUEL STOCK ALERT — BOTH MS (PETROL) & HSD (DIESEL) LOW'
    : `🚨 LOW ${payload.fuelType} STOCK ALERT`;

  const bannerText = isBoth
    ? `BOTH <strong>Motor Spirit (MS Petrol)</strong> and <strong>High Speed Diesel (HSD)</strong> verified physical stocks have fallen to or below the <strong>${formatLitres(LOW_FUEL_THRESHOLD_LITRES)}</strong> alert threshold.`
    : `${payload.fuelType === 'MS' ? 'Motor Spirit (Petrol)' : 'High Speed Diesel'} (${payload.fuelType}) verified physical stock has fallen to or below the <strong>${formatLitres(LOW_FUEL_THRESHOLD_LITRES)}</strong> alert threshold.`;

  const fuelStockTable = `
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:14px;color:#111827;">
      <tr style="background:#f9fafb;">
        <td style="border-bottom:1px solid #e5e7eb;width:40%;"><strong>Duty Session</strong></td>
        <td style="border-bottom:1px solid #e5e7eb;">Duty #${payload.dutyNumber}</td>
      </tr>
      ${payload.msStock ? `
      <tr style="background:#fef2f2;">
        <td style="border-bottom:1px solid #e5e7eb;"><strong>⚠️ MS (Petrol) Physical Stock</strong></td>
        <td style="border-bottom:1px solid #e5e7eb;font-weight:700;color:#dc2626;font-size:16px;">
          ${formatLitres(payload.msStock.physicalStock)} ${payload.msStock.isCorrected ? '✏️' : ''}
          ${payload.msStock.bookStock !== null && payload.msStock.bookStock !== undefined ? `<span style="font-size:12px;color:#6b7280;font-weight:normal;">(Book Stock: ${formatLitres(payload.msStock.bookStock)})</span>` : ''}
        </td>
      </tr>` : ''}
      ${payload.hsdStock ? `
      <tr style="background:#fef2f2;">
        <td style="border-bottom:1px solid #e5e7eb;"><strong>⚠️ HSD (Diesel) Physical Stock</strong></td>
        <td style="border-bottom:1px solid #e5e7eb;font-weight:700;color:#dc2626;font-size:16px;">
          ${formatLitres(payload.hsdStock.physicalStock)} ${payload.hsdStock.isCorrected ? '✏️' : ''}
          ${payload.hsdStock.bookStock !== null && payload.hsdStock.bookStock !== undefined ? `<span style="font-size:12px;color:#6b7280;font-weight:normal;">(Book Stock: ${formatLitres(payload.hsdStock.bookStock)})</span>` : ''}
        </td>
      </tr>` : ''}
      <tr>
        <td><strong>Alert Threshold</strong></td>
        <td>≤ ${formatLitres(LOW_FUEL_THRESHOLD_LITRES)} (inclusive)</td>
      </tr>
    </table>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${alertTitle}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#dc2626;padding:24px 32px;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#fecaca;letter-spacing:2px;text-transform:uppercase;">⛽ IOCL PETROL PUMP SYSTEM</p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${alertTitle}</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#fef2f2;padding:20px 32px;border-bottom:1px solid #fecaca;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#991b1b;line-height:1.5;">${bannerText}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Verified Physical Stock Summary</p>
            ${fuelStockTable}

            <p style="margin:20px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Stock Data Source</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;background:#f0fdf4;padding:10px 14px;border-left:4px solid #16a34a;border-radius:4px;">
              ✅ Verified Physical Stock from End Duty physical tank dip calibration chart. Theoretical book stock is NOT used for alerts.
            </p>

            <p style="margin:16px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Action Required</p>
            <p style="margin:0;font-size:14px;color:#374151;">
              Please arrange for a fuel delivery order immediately to avoid stock outage.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              Automated alert generated at ${formatTimestamp(new Date())} | Duty #${payload.dutyNumber}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = isBoth
    ? `🚨 LOW FUEL STOCK ALERT — BOTH MS & HSD LOW (Duty #${payload.dutyNumber})`
    : `🚨 LOW ${payload.fuelType} STOCK ALERT — ${formatLitres(payload.msStock?.physicalStock || payload.hsdStock?.physicalStock || 0)} (Duty #${payload.dutyNumber})`;

  let smsMessage = '';
  if (isBoth) {
    smsMessage = `IOCL ALERT: BOTH MS & HSD stock is LOW.\nMS: ${formatLitres(payload.msStock?.physicalStock || 0)}\nHSD: ${formatLitres(payload.hsdStock?.physicalStock || 0)}\nThreshold: ${formatLitres(LOW_FUEL_THRESHOLD_LITRES)}\nPlease arrange replenishment.`;
  } else {
    smsMessage = `IOCL ALERT: ${payload.fuelType} stock is LOW.\nPhysical stock: ${formatLitres(payload.msStock?.physicalStock || payload.hsdStock?.physicalStock || 0)}.\nThreshold: ${formatLitres(LOW_FUEL_THRESHOLD_LITRES)}.\nPlease arrange replenishment.`;
  }

  console.log(`[ALERT LOGIC] Triggering alerts for ${payload.fuelType}...`);
  console.log(`[ALERT LOGIC] Physical Stock: MS=${payload.msStock?.physicalStock ?? 'N/A'}, HSD=${payload.hsdStock?.physicalStock ?? 'N/A'}, Threshold=${LOW_FUEL_THRESHOLD_LITRES} L`);

  const smsResult = await sendSmsAlert(smsMessage);
  const smsStatus = smsResult.success ? 'SENT' : (smsResult.message.includes('skipped') ? 'SKIPPED' : 'FAILED');

  console.log(`[SMS] ${smsStatus}: ${smsResult.message}`);

  try {
    await transporter.sendMail({
      from: getSender(),
      to: recipients.join(', '),
      subject,
      html,
      text: `${alertTitle}\nDuty #${payload.dutyNumber}\nRecipients: ${recipients.join(', ')}\nAction required: Order fuel delivery immediately.`,
    });
    await logEmailDelivery('LOW_STOCK_ALERT', `Duty #${payload.dutyNumber} (${payload.fuelType})`, recipients, 'SENT', undefined, smsStatus, smsResult.success ? undefined : smsResult.message);
    console.log(`[EMAIL] SENT: Low stock alert (${payload.fuelType}) sent to ${recipients.join(', ')}`);
  } catch (err: any) {
    await logEmailDelivery('LOW_STOCK_ALERT', `Duty #${payload.dutyNumber} (${payload.fuelType})`, recipients, 'FAILED', err?.message, smsStatus, smsResult.success ? undefined : smsResult.message);
    console.error(`[EMAIL] FAILED: Failed to send low ${payload.fuelType} stock alert:`, err);
  }
}

// ---------------------------------------------------------------------------
// 3. DUTY CLOSING REPORT
// ---------------------------------------------------------------------------

export interface DutyClosingReportData {
  dutyNumber: number;
  managerName: string;
  startTime: Date | string;
  endTime: Date | string | null;

  // Stock details
  ms?: {
    openingStock: number;
    receipts: number;
    sales: number;
    bookStock: number;
    physicalStock: number;
    dipCm?: number;
    isCorrected?: boolean;
    correctionReason?: string;
    variance: number;
  };
  hsd?: {
    openingStock: number;
    receipts: number;
    sales: number;
    bookStock: number;
    physicalStock: number;
    dipCm?: number;
    isCorrected?: boolean;
    correctionReason?: string;
    variance: number;
  };

  // Readings & Meter Totals
  meterReadings?: {
    gunName: string;
    fuelType: string;
    startReading: number;
    endReading: number;
    totalLitres: number;
    saleAmount: number;
  }[];

  // Price Periods / Price Changes
  pricePeriods?: {
    fuelType: string;
    oldPrice: number;
    newPrice: number;
    effectiveFrom: Date | string;
  }[];

  // Staff Assignments
  staffAssignments?: {
    staffName: string;
    role?: string;
    pumpName?: string;
  }[];

  // Financial Breakdown
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  settlementStatus: 'BALANCED' | 'SHORTAGE' | 'SURPLUS';

  totalFuelSales: number;
  totalOilSales: number;
  totalExpenses: number;
  totalCreditGiven: number;
  totalCreditCollections: number;

  // Digital Breakdown
  digitalPayments?: {
    upi?: number;
    card?: number;
    phonePe?: number;
    other?: number;
    total?: number;
  };

  bankDepositedCash?: number;
  responsibleEmployee?: string;
}

export async function sendDutyClosingReport(
  data: DutyClosingReportData,
  explicitRecipients?: string[]
): Promise<void> {
  const recipients = explicitRecipients && explicitRecipients.length > 0
    ? explicitRecipients
    : await getEmailRecipients('DUTY_REPORT');

  if (recipients.length === 0) {
    console.warn(`[EMAIL] Duty closing report skipped — no recipients configured for Duty #${data.dutyNumber}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn(`[EMAIL] Duty closing report skipped — SMTP not configured for Duty #${data.dutyNumber}`);
    return;
  }

  const varianceRow = (label: string, fuel?: DutyClosingReportData['ms']) => {
    if (!fuel) return '';
    const varSign = fuel.variance > 0.01 ? '+' : '';
    const varColor = fuel.variance < -0.01 ? '#dc2626' : fuel.variance > 0.01 ? '#16a34a' : '#374151';
    const varLabel = fuel.variance < -0.01 ? 'SHORTAGE' : fuel.variance > 0.01 ? 'SURPLUS' : 'BALANCED';
    return `
      <tr><td colspan="2" style="padding:6px 8px;background:#f9fafb;font-weight:700;font-size:11px;text-transform:uppercase;color:#4b5563;">${label}</td></tr>
      <tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">Opening Stock</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatLitres(fuel.openingStock)}</td></tr>
      <tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">Receipts (+)</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">+${formatLitres(fuel.receipts)}</td></tr>
      <tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">Sales Dispensed (−)</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">−${formatLitres(fuel.sales)}</td></tr>
      <tr style="background:#eff6ff;"><td style="padding:4px 8px;border-bottom:1px solid #dbeafe;font-weight:700;">Book Stock (Theoretical)</td><td style="padding:4px 8px;border-bottom:1px solid #dbeafe;text-align:right;font-weight:700;color:#1d4ed8;">${formatLitres(fuel.bookStock)}</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:4px 8px;border-bottom:1px solid #dcfce7;font-weight:700;">Verified Physical Stock${fuel.isCorrected ? ' ✏️' : ''}</td><td style="padding:4px 8px;border-bottom:1px solid #dcfce7;text-align:right;font-weight:700;color:#15803d;">${formatLitres(fuel.physicalStock)}</td></tr>
      ${fuel.dipCm !== undefined ? `<tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">Physical Dip Reading</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fuel.dipCm.toFixed(1)} cm</td></tr>` : ''}
      ${fuel.isCorrected && fuel.correctionReason ? `<tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#92400e;">Correction Reason</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11px;color:#92400e;">${fuel.correctionReason}</td></tr>` : ''}
      <tr style="background:${varColor}11;"><td style="padding:4px 8px;font-weight:700;color:${varColor};">Stock Variation</td><td style="padding:4px 8px;text-align:right;font-weight:700;color:${varColor};">${varSign}${formatLitres(fuel.variance)} ${varLabel}</td></tr>
    `;
  };

  const cashColor = data.settlementStatus === 'SHORTAGE' ? '#dc2626' : data.settlementStatus === 'SURPLUS' ? '#16a34a' : '#374151';

  const staffRows = data.staffAssignments && data.staffAssignments.length > 0
    ? data.staffAssignments.map(s => `<tr><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">${s.staffName}</td><td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${s.pumpName || s.role || 'Staff'}</td></tr>`).join('')
    : '<tr><td colspan="2" style="padding:4px 8px;color:#9ca3af;font-size:12px;">No staff assigned</td></tr>';

  const meterRows = data.meterReadings && data.meterReadings.length > 0
    ? data.meterReadings.map(m => `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">${m.gunName} (${m.fuelType})</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${m.startReading.toFixed(2)} → ${m.endReading.toFixed(2)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${formatLitres(m.totalLitres)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(m.saleAmount)}</td>
      </tr>
    `).join('')
    : '';

  const digitalTotal = data.digitalPayments?.total || 0;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Duty Closing Report #${data.dutyNumber}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="650" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0f172a;padding:24px 32px;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;">⛽ IOCL PETROL PUMP MANAGEMENT SYSTEM</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;">Duty #${data.dutyNumber} — Closing Report</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Manager: ${data.managerName} &nbsp;|&nbsp; ${formatTimestamp(data.startTime)} – ${formatTimestamp(data.endTime)}</p>
          </td>
        </tr>

        <!-- Tank Stock -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Underground Tank Stock Summary</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#111827;">
            ${varianceRow('MS (Motor Spirit / Petrol)', data.ms)}
            ${varianceRow('HSD (High Speed Diesel)', data.hsd)}
          </table>
        </td></tr>

        <!-- Meter Readings -->
        ${meterRows ? `
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Nozzle Meter Sales</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#111827;">
            <tr style="background:#f9fafb;font-weight:700;">
              <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">Gun</td>
              <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">Readings</td>
              <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">Volume</td>
              <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">Amount</td>
            </tr>
            ${meterRows}
          </table>
        </td></tr>` : ''}

        <!-- Staff -->
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Staff Assignments</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#111827;">
            ${staffRows}
          </table>
        </td></tr>

        <!-- Financial Settlement -->
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Cash &amp; Revenue Settlement</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#111827;">
            <tr style="background:#f9fafb;"><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Total Fuel Sales Revenue</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${formatCurrency(data.totalFuelSales)}</td></tr>
            <tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Oil &amp; Lubricant Sales</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(data.totalOilSales)}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Credit Sales (−)</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(data.totalCreditGiven)}</td></tr>
            <tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Credit Recoveries (+)</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(data.totalCreditCollections)}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Duty Expenses (−)</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(data.totalExpenses)}</td></tr>
            ${digitalTotal > 0 ? `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">Digital / UPI Payments (−)</td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatCurrency(digitalTotal)}</td></tr>` : ''}
            <tr style="background:#eff6ff;"><td style="padding:6px 8px;border-bottom:1px solid #dbeafe;font-weight:700;">Expected Physical Cash</td><td style="padding:6px 8px;border-bottom:1px solid #dbeafe;text-align:right;font-weight:700;">${formatCurrency(data.expectedCash)}</td></tr>
            <tr style="background:#f0fdf4;"><td style="padding:6px 8px;border-bottom:1px solid #dcfce7;font-weight:700;">Actual Bank Deposited Cash</td><td style="padding:6px 8px;border-bottom:1px solid #dcfce7;text-align:right;font-weight:700;">${formatCurrency(data.actualCash)}</td></tr>
            <tr style="background:${cashColor}11;"><td style="padding:6px 8px;font-weight:700;color:${cashColor};">Cash Settlement (${data.settlementStatus})</td><td style="padding:6px 8px;text-align:right;font-weight:700;color:${cashColor};">${formatCurrency(Math.abs(data.cashDifference))}</td></tr>
          </table>
        </td></tr>

        ${data.responsibleEmployee ? `
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0;font-size:12px;color:#92400e;background:#fff8e1;padding:8px 12px;border-left:3px solid #f59e0b;border-radius:4px;">
            ⚠️ <strong>Shortage Assigned To:</strong> ${data.responsibleEmployee}
          </p>
        </td></tr>` : ''}

        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;margin-top:24px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Automated report generated at ${formatTimestamp(new Date())} | Duty #${data.dutyNumber}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: getSender(),
      to: recipients.join(', '),
      subject: `📋 Duty #${data.dutyNumber} Closing Report — ${data.settlementStatus} | Manager: ${data.managerName}`,
      html,
      text: `DUTY #${data.dutyNumber} CLOSING REPORT\nManager: ${data.managerName}\nPeriod: ${formatTimestamp(data.startTime)} - ${formatTimestamp(data.endTime)}\nExpected Cash: ${formatCurrency(data.expectedCash)}\nActual Cash: ${formatCurrency(data.actualCash)}\nStatus: ${data.settlementStatus} ${formatCurrency(Math.abs(data.cashDifference))}`,
    });
    await logEmailDelivery('DUTY_REPORT', `Duty #${data.dutyNumber}`, recipients, 'SENT');
    console.log(`[EMAIL] ✅ Duty #${data.dutyNumber} closing report sent to ${recipients.join(', ')}`);
  } catch (err: any) {
    await logEmailDelivery('DUTY_REPORT', `Duty #${data.dutyNumber}`, recipients, 'FAILED', err?.message);
    console.error(`[EMAIL] ❌ Failed to send duty closing report:`, err);
  }
}
