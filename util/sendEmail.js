const nodemailer = require('nodemailer');

module.exports = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'YOUR_EMAIL@gmail.com',
            pass: 'YOUR_APP_PASSWORD'
        }
    });

    await transporter.sendMail({
        from: 'CashBook <YOUR_EMAIL@gmail.com>',
        to: email,
        subject: 'Your OTP Code',
        html: `<h2>Your OTP: ${otp}</h2>`
    });
};
