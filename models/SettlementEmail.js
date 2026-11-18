const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    email: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    messageId: { type: String, default: null },
    error: { type: String, default: null }
}, { _id: false });

const skippedRecipientSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    reason: { type: String, required: true }
}, { _id: false });

const settlementEmailSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true },
    groupId: { type: String, required: true, index: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    format: { type: String, enum: ['pdf', 'pdf-excel'], required: true },
    status: { type: String, enum: ['sending', 'sent', 'partial', 'failed'], default: 'sending' },
    recipients: { type: [recipientSchema], default: [] },
    skippedRecipients: { type: [skippedRecipientSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('SettlementEmail', settlementEmailSchema);
