
   require('dotenv').config(); // 🔥 MUST be on top

const bcrypt = require('bcryptjs');
const User = require('../models/User');
// const generateOtp = require('../util/generateOtp');
const generateGroupId = require('../util/generateGroupId');
const nodemailer = require('nodemailer');

/* ======================
   CREATE OTP PAGE
====================== */

// function generateOTP() {
//     return Math.floor(100000 + Math.random()*900000)
// }

// exports.getGenerateOtp =(req, res) => {
//   res.render('auth/generateOTP');
// }

// global.otpStore ={};

// exports.postGenerateOtp = async (req, res) => {


//   try {

//       const {email} = req.body;

//       if (!email) {
//           return res.render('auth/generateOTP', {
//               otp: null,
//               email: null,
//               error: 'Email is required'
//           });
//       }
//       const otp = generateOTP();

//       const transporter = nodemailer.createTransport({
//           host: "smtp-relay.brevo.com",
//           port: 587,
//           secure: false,
//           service: "gmail",
//           auth: {
//               user: process.env.MAIL_USER ,
//               pass:process.env.MAIL_PASS
//           }
//       });
      

//       const mailOptions = {
//           from : process.env.MAIL_FROM ,
//           to: email,
//           subject:"this is a testing",
//           html:`<h1> hello Your OTP is - ${otp}. This otp valid for 5 minits</h1>`
//       };
//       await User.findOneAndUpdate(
//           { email },
//           {
//               email,
//               otp,
//               otpExpires: Date.now() + 5 * 60 * 1000, // 5 min
//               isVerified: false
//           },
//           { upsert: true }
//       );

//       transporter.sendMail(mailOptions, (error, info) =>{
//           if(error) {
//               console.log('Error', error)
//           } else {
//               console.log('Email send'+ info.response);
//               res.redirect('/register')
//           }
//       })
//   } catch (error) {
//      console.log(error)
//       res.render('auth/generateOTP',
//         {error : "Failed to send otp"}
//       )
//   }

// }

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.getGenerateOtp = (req, res) => {
  res.render('auth/generateOTP');
};

exports.postGenerateOtp = async (req, res) => {
  try {

      const { email } = req.body;

      if (!email) {
          return res.render('auth/generateOTP', {
              otp: null,
              email: null,
              error: 'Email is required'
          });
      }

      const otp = generateOTP();

      // 🔥 Brevo SMTP (Gmail removed)
      const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,   // smtp-relay.brevo.com
          port: 2525,   // 587
          secure: false,
          requireTLS:true,
          connectionTimeout:10000,
          auth: {
              user: process.env.MAIL_USER ,
              pass:process.env.MAIL_PASS
          }
      });

      const mailOptions = {
          from: `MessBook <${process.env.MAIL_FROM}>`,
          to: email,
          subject: "Email Verification OTP",
          html: `
            <div style="font-family:sans-serif">
              <h2>Verify Your Account</h2>
              <p>Your OTP is:</p>
              <h1 style="letter-spacing:4px">${otp}</h1>
              <p>This OTP valid for 5 minutes</p>
            </div>
          `
      };

      // OTP store (user verify before login)
      await User.findOneAndUpdate(
          { email },
          {
              email,
              otp,
              otpExpires: Date.now() + 5 * 60 * 1000,
              isVerified: false
          },
          { upsert: true }
      );

      // await ব্যবহার (callback removed)
      await transporter.sendMail(mailOptions);

      console.log("OTP SENT TO:", email);
      res.redirect('/register');

  } catch (error) {
      console.log("MAIL ERROR:", error);
      res.render('auth/generateOTP', {
        error: "Failed to send otp"
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


// group id generate

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
