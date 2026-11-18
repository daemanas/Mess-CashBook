const nodemailer = require('nodemailer');

let transport;

function getTransport() {
    if (transport) return transport;
    transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 2525,
        secure: Number(process.env.SMTP_PORT) === 465,
        requireTLS: Number(process.env.SMTP_PORT) !== 465,
        connectionTimeout: 10000,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    return transport;
}

function otpTemplate({ heading, otp, note }) {
    return `
        <div style="margin:0;padding:32px 16px;background:#f4f8fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3ecf7;border-radius:16px;">
                <tr>
                    <td style="padding:32px;">
                        <p style="margin:0 0 4px;color:#1768e0;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">CashBook</p>
                        <h1 style="margin:0 0 16px;color:#0f1e3d;font-size:22px;">${heading}</h1>
                        <p style="margin:0 0 20px;color:#5a6b86;font-size:14px;line-height:1.6;">Use the verification code below to continue. This code is valid for 5 minutes.</p>
                        <div style="padding:18px;background:#eef5ff;border:1px solid #d3e2f2;border-radius:12px;text-align:center;">
                            <span style="color:#0f1e3d;font-size:30px;font-weight:700;letter-spacing:8px;">${otp}</span>
                        </div>
                        <p style="margin:20px 0 0;color:#7a88a0;font-size:13px;">${note}</p>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

async function sendOtpEmail({ to, otp, purpose = 'registration' }) {
    const isReset = purpose === 'reset';
    const heading = isReset ? 'Reset your password' : 'Verify your email';
    const note = isReset
        ? 'If you did not request a password reset, you can safely ignore this email.'
        : 'If you did not create a CashBook account, you can ignore this email.';

    await getTransport().sendMail({
        from: `CashBook <${process.env.MAIL_FROM}>`,
        to,
        subject: isReset ? 'CashBook password reset code' : 'CashBook email verification code',
        html: otpTemplate({ heading, otp, note })
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function settlementEmailTemplate({ member, groupName, periodLabel }) {
    const statusColor = member.status === 'RECEIVE'
        ? '#13805e'
        : member.status === 'DUE' ? '#b44b53' : '#64748b';
    const money = value => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);

    return `
        <div style="margin:0;padding:28px 14px;background:#f2f5f8;font-family:Arial,sans-serif;color:#243447;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #d8e1e9;border-radius:14px;overflow:hidden;">
                <tr><td style="padding:22px 28px;background:#18334b;color:#ffffff;">
                    <div style="color:#c9a96e;font-size:12px;font-weight:bold;letter-spacing:2px;">MESSBOOK</div>
                    <h1 style="margin:8px 0 0;font-size:21px;">Monthly Final Settlement</h1>
                    <p style="margin:5px 0 0;color:#d6e2ee;">${escapeHtml(groupName)} · ${escapeHtml(periodLabel)}</p>
                </td></tr>
                <tr><td style="padding:26px 28px;">
                    <p style="margin:0 0 14px;">Dear ${escapeHtml(member.name || 'Member')},</p>
                    <p style="margin:0 0 20px;line-height:1.6;color:#536477;">Your monthly MESSBOOK settlement report for ${escapeHtml(periodLabel)} is ready. The attached PDF contains the complete group report.</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d8e1e9;">
                        <tr><td style="padding:10px 12px;border-bottom:1px solid #e6ebf0;">Total Food Count</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #e6ebf0;font-weight:bold;">${escapeHtml(member.foodCount)}</td></tr>
                        <tr><td style="padding:10px 12px;border-bottom:1px solid #e6ebf0;">Amount Paid</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #e6ebf0;font-weight:bold;">${escapeHtml(money(member.paidAmount))}</td></tr>
                        <tr><td style="padding:10px 12px;border-bottom:1px solid #e6ebf0;">Payable Amount</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #e6ebf0;font-weight:bold;">${escapeHtml(money(member.payableAmount))}</td></tr>
                        <tr><td style="padding:10px 12px;">Final Balance</td><td align="right" style="padding:10px 12px;font-weight:bold;">${escapeHtml(money(member.finalBalance))}</td></tr>
                    </table>
                    <p style="margin:18px 0 0;">Status: <strong style="color:${statusColor};">${escapeHtml(member.status)}</strong></p>
                </td></tr>
                <tr><td style="padding:15px 28px;background:#f7f9fb;color:#728093;font-size:12px;">This report was generated by MESSBOOK. Please contact your group administrator if you have questions.</td></tr>
            </table>
        </div>
    `;
}

async function sendSettlementEmail({ to, subject, html, attachments }) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) {
        throw new Error('Settlement email requires SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM configuration.');
    }

    return getTransport().sendMail({
        from: `MESSBOOK <${process.env.MAIL_FROM}>`,
        to,
        subject,
        html,
        attachments
    });
}

module.exports = { sendOtpEmail, sendSettlementEmail, settlementEmailTemplate };
