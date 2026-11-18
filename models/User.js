const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        default: null   // 🔥 required removed
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        default: null   // 🔥 required removed
    },
    otp: String,
    otpExpires: Date,
    role: {
        type: String,
        enum: ['personal', 'admin', 'member'],
        default: 'admin'
        
    },
    groupId: {
        type: String,
        default: null
    },
    // Additive and optional: existing accounts simply have no mess name.
    messName: {
        type: String,
        default: null,
        trim: true
    },
    isVerified: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('User', userSchema);
