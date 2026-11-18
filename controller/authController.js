const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const generateGroupId = require('../util/generateGroupId');
const { sendOtpEmail } = require('../util/mailer');

const ACCOUNT_TYPES = ['personal', 'admin', 'member'];
const OTP_TTL_MS = 5 * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function otpMatches(stored, provided) {
    if (typeof stored !== 'string' || typeof provided !== 'string') return false;
    const a = Buffer.from(stored);
    const b = Buffer.from(provided.trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createUniqueGroupId() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = generateGroupId();
        const taken = await User.exists({ groupId: candidate });
        if (!taken) return candidate;
    }
    throw new Error('Could not allocate a group ID');
}

/* ======================
   OTP GENERATION
====================== */
exports.getGenerateOtp = (req, res) => {
    res.render('auth/generateOTP', {
        email: normalizeEmail(req.query.email),
        error: null
    });
};

exports.postGenerateOtp = async (req, res, next) => {
    const email = normalizeEmail(req.body.email);
    const renderError = (error, status = 400) =>
        res.status(status).render('auth/generateOTP', { email, error });

    if (!isEmail(email)) {
        return renderError('Enter a valid email address.');
    }

    try {
        const existing = await User.findOne({ email });

        // Never touch an account that is already registered — the old flow
        // cleared isVerified here, which allowed re-registration to overwrite it.
        if (existing && existing.password && existing.isVerified) {
            return renderError('This email is already registered. Please log in instead.');
        }

        const otp = createOtp();
        const otpExpires = new Date(Date.now() + OTP_TTL_MS);

        if (existing) {
            existing.otp = otp;
            existing.otpExpires = otpExpires;
            await existing.save();
        } else {
            await User.create({ email, otp, otpExpires, isVerified: false });
        }

        await sendOtpEmail({ to: email, otp, purpose: 'registration' });

        return res.redirect(`/register?email=${encodeURIComponent(email)}`);
    } catch (error) {
        console.error('OTP delivery failed:', error.message);
        return renderError('We could not send the code right now. Please try again in a moment.', 502);
    }
};

/* ======================
   REGISTER
====================== */
exports.getRegister = (req, res) => {
    res.render('auth/register', {
        form: { email: normalizeEmail(req.query.email) },
        error: null
    });
};

exports.postRegister = async (req, res, next) => {
    const form = {
        name: typeof req.body.name === 'string' ? req.body.name.trim() : '',
        email: normalizeEmail(req.body.email),
        accountType: ACCOUNT_TYPES.includes(req.body.accountType) ? req.body.accountType : '',
        messName: typeof req.body.messName === 'string' ? req.body.messName.trim() : '',
        groupId: typeof req.body.groupId === 'string' ? req.body.groupId.trim().toUpperCase() : ''
    };
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

    const renderError = (error, status = 400) =>
        res.status(status).render('auth/register', { form, error });

    if (!form.name) return renderError('Enter your full name.');
    if (!isEmail(form.email)) return renderError('Enter a valid email address.');
    if (!otp) return renderError('Enter the verification code sent to your email.');
    if (password.length < MIN_PASSWORD_LENGTH) {
        return renderError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
    if (password !== confirmPassword) return renderError('Passwords do not match.');
    if (!form.accountType) return renderError('Choose an account type to continue.');

    try {
        const user = await User.findOne({ email: form.email });
        if (!user) return renderError('Request a verification code for this email first.');
        if (user.password && user.isVerified) {
            return renderError('This email is already registered. Please log in instead.');
        }
        if (!otpMatches(user.otp, otp)) return renderError('The verification code is incorrect.');
        if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
            return renderError('The verification code has expired. Request a new one.');
        }

        let role;
        let groupId = null;
        let messName = null;

        if (form.accountType === 'personal') {
            role = 'personal';
        } else if (form.accountType === 'admin') {
            if (!form.messName) return renderError('Enter a name for your mess.');
            role = 'admin';
            groupId = await createUniqueGroupId();
            messName = form.messName;
        } else {
            if (!form.groupId) return renderError('Enter the Group ID of the mess you want to join.');
            const groupAdmin = await User.findOne({
                groupId: form.groupId,
                role: 'admin',
                isVerified: true
            }).select('messName groupId');
            if (!groupAdmin) return renderError('No mess was found for that Group ID.');
            role = 'member';
            groupId = groupAdmin.groupId;
            messName = groupAdmin.messName || null;
        }

        user.name = form.name;
        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        user.role = role;
        user.groupId = groupId;
        user.messName = messName;
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        return res.redirect('/login?registered=1');
    } catch (error) {
        console.error('Registration failed:', error);
        return next(error);
    }
};

/* ======================
   LOGIN
====================== */
exports.getLogin = (req, res) => {
    let notice = null;
    if (req.query.registered) notice = 'Your account is ready. Sign in to continue.';
    if (req.query.reset) notice = 'Your password has been updated. Sign in with the new password.';

    res.render('auth/login', {
        email: normalizeEmail(req.query.email),
        error: null,
        notice
    });
};

exports.postLogin = async (req, res, next) => {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const renderError = (error, status = 401) =>
        res.status(status).render('auth/login', { email, error, notice: null });

    try {
        const user = await User.findOne({ email });
        // Identical message for unknown email and wrong password, so the form
        // cannot be used to discover which emails are registered.
        if (!user || !user.password) return renderError('Email or password is incorrect.');
        if (!user.isVerified) return renderError('Finish your registration before signing in.', 403);

        const matches = await bcrypt.compare(password, user.password);
        if (!matches) return renderError('Email or password is incorrect.');

        const sessionUser = {
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role,
            groupId: user.groupId,
            messName: user.messName || null
        };

        // Capture before regenerating: regenerate creates a brand new session.
        const destination = req.session.returnTo || '/';

        // Regenerate to prevent session fixation.
        return req.session.regenerate(regenerateError => {
            if (regenerateError) return next(regenerateError);

            req.session.isLoggedIn = true;
            req.session.user = sessionUser;

            return req.session.save(saveError => {
                if (saveError) return next(saveError);
                return res.redirect(destination);
            });
        });
    } catch (error) {
        return next(error);
    }
};

/* ======================
   LOGOUT
====================== */
exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('cb.sid');
        res.redirect('/login');
    });
};

/* ======================
   FORGOT / RESET PASSWORD
====================== */
exports.getForgotPassword = (req, res) => {
    res.render('auth/forgot-password', { email: '', error: null });
};

exports.postForgotPassword = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const renderError = (error, status = 400) =>
        res.status(status).render('auth/forgot-password', { email, error });

    if (!isEmail(email)) return renderError('Enter a valid email address.');

    try {
        const user = await User.findOne({ email });

        // The response is always the same, so this page cannot be used to
        // discover which emails have accounts.
        if (user && user.password) {
            const otp = createOtp();
            user.otp = otp;
            user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
            await user.save();
            await sendOtpEmail({ to: email, otp, purpose: 'reset' });
        }

        return res.render('auth/reset-password', {
            email,
            notice: 'If that email is registered, a reset code is on its way. It expires in 5 minutes.',
            error: null
        });
    } catch (error) {
        console.error('Password reset request failed:', error.message);
        return renderError('We could not send the code right now. Please try again in a moment.', 502);
    }
};

exports.getResetPassword = (req, res) => {
    res.render('auth/reset-password', {
        email: normalizeEmail(req.query.email),
        notice: null,
        error: null
    });
};

exports.postResetPassword = async (req, res, next) => {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

    const renderError = (error, status = 400) =>
        res.status(status).render('auth/reset-password', { email, notice: null, error });

    if (!isEmail(email)) return renderError('Enter a valid email address.');
    if (!otp) return renderError('Enter the reset code from your email.');
    if (password.length < MIN_PASSWORD_LENGTH) {
        return renderError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
    if (password !== confirmPassword) return renderError('Passwords do not match.');

    try {
        const user = await User.findOne({ email });
        if (!user) return renderError('The reset code is invalid or has expired.');
        if (!otpMatches(user.otp, otp)) return renderError('The reset code is invalid or has expired.');
        if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
            return renderError('The reset code has expired. Request a new one.');
        }

        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        return res.redirect('/login?reset=1');
    } catch (error) {
        return next(error);
    }
};
