const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateOtp = require('../util/generateOtp');

/* ======================
   CREATE OTP PAGE
====================== */
exports.getCreateOtp = (req, res) => {
    res.render('auth/create-otp', { otp: null, email: null });
};

/* ======================
   GENERATE OTP (NO EMAIL)
====================== */
exports.generateOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.render('auth/create-otp', {
                otp: null,
                email: null,
                error: 'Email is required'
            });
        }

        const otp = generateOtp();

        await User.findOneAndUpdate(
            { email },
            {
                email,
                otp,
                otpExpires: Date.now() + 5 * 60 * 1000, // 5 min
                isVerified: false
            },
            { upsert: true }
        );

        // 🔥 OTP screen এ দেখানো হচ্ছে
        res.render('auth/create-otp', {
            otp,
            email
        });

    } catch (error) {
        console.error(error);
        res.render('auth/create-otp', {
            otp: null,
            email: null,
            error: 'OTP generation failed'
        });
    }
};

/* ======================
   REGISTER PAGE
====================== */
exports.getRegister = (req, res) => {
    res.render('auth/register');
};

/* ======================
   REGISTER (OTP REQUIRED)
====================== */
exports.postRegister = async (req, res) => {
    try {
        const { name, email, otp, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.send('Please generate OTP first');
        }

        if (user.otp !== otp) {
            return res.send('Invalid OTP');
        }

        if (user.otpExpires < Date.now()) {
            return res.send('OTP expired');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        user.name = name;
        user.password = hashedPassword;
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save();

        res.redirect('/login');

    } catch (err) {
        console.error(err);
        res.status(500).send('Register failed');
    }
};

/* ======================
   LOGIN
====================== */
exports.getLogin = (req, res) => {
    res.render('auth/login');
};

exports.postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.send('Invalid email');

        if (!user.isVerified) {
            return res.send('Please complete registration first');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.send('Invalid password');

        req.session.isLoggedIn = true;
        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email
        };

        res.redirect('/');

    } catch (err) {
        console.error(err);
        res.status(500).send('Login failed');
    }
};

/* ======================
   LOGOUT
====================== */
exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
};



