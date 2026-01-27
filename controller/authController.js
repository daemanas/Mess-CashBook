const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateOtp = require('../util/generateOtp');
const generateGroupId = require('../util/generateGroupId');


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





exports.postRegister = async (req, res) => {
  try {
    const { name, email, otp, password, groupId, accountType } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.send('Please generate OTP first');
    }

    // 🔐 OTP validation
    if (user.otp !== otp) {
      return res.send('Invalid OTP');
    }

    if (user.otpExpires < Date.now()) {
      return res.send('OTP expired');
    }

    let role;
    let finalGroupId;

    /* =========================
       🔥 GROUP LOGIC ONLY
    ========================= */

    // ✅ CASE 1: Group Creator (ADMIN)
    if (accountType === 'admin') {
      role = 'admin';
      finalGroupId = generateGroupId(); // 🔥 always unique
    }

    // ✅ CASE 2: Group Member
    else if (accountType === 'member') {
      if (!groupId) {
        return res.send('Group ID required');
      }

      const admin = await User.findOne({
        groupId,
        role: 'admin'
      });

      if (!admin) {
        return res.send('Invalid Group ID');
      }

      role = 'member';
      finalGroupId = groupId;
    }

    // ❌ anything else not allowed
    else {
      return res.send('Invalid account type');
    }

    // 🔒 Password hash
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Update existing OTP user
    user.name = name;
    user.password = hashedPassword;
    user.role = role;
    user.groupId = finalGroupId;
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    return res.redirect('/login');

  } catch (err) {
    console.error(err);
    return res.status(500).send('Register failed');
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
            email: user.email,
            role: user.role,
            groupId: user.groupId,
            // accountType: user.accountType
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



/*  forgate password */ 

exports.getForgotPassword = (req, res) => {
  res.render('auth/forgot-password');
};

exports.postForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.send('No account found with this email');
    }

    const otp = generateOtp();

    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
    await user.save();

    // 🔴 Email না চাইলে screen এ দেখাও
    res.render('auth/reset-password', {
      email,
      otpShown: otp   // demo purpose
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('OTP generation failed');
  }
};


exports.getResetPassword = (req, res) => {
  res.render('auth/reset-password', {
    email: null,
    otpShown: null
  });
};


exports.postResetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.send('Invalid request');

    if (user.otp !== otp) {
      return res.send('Invalid OTP');
    }

    if (user.otpExpires < Date.now()) {
      return res.send('OTP expired');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    res.redirect('/login');

  } catch (err) {
    console.error(err);
    res.status(500).send('Password reset failed');
  }
};
