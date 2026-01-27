const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authController = require('../controller/authController');



router.get('/create-mess-DA@1-otp', authController.getCreateOtp);
router.post('/generate-otp', authController.generateOtp);

router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

router.get('/logout', authController.logout);

// Forgot password
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);

router.get('/reset-password', authController.getResetPassword);
router.post('/reset-password', authController.postResetPassword);




module.exports = router;
