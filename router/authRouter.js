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


module.exports = router;
