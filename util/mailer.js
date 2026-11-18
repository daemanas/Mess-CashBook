const nodemailer = require('nodemailer');

function getTransport() {
    return nodemailer.createTransport({
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

module.exports = { sendOtpEmail };
