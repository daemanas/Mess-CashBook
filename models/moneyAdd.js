const mongoose = require('mongoose');
const expenses = require('./moneyExpenses')
const moneyAddSchema = mongoose.Schema({
    entry_title:{
        type :String,
        required : true
    },
    entry_amount:{
        type :Number,
        required : true
    },
    entry_date:{
        type :Date,
        required : true
    },
    groupId: {
        type: String,
        default: null
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
},
    {
        timestamps: true   // ✅ এখানেই দিতে হবে
    }

)








moneyAddSchema.pre('findOneAndDelete', async function(next) {
    console.log("came to deleted member")
    const memberId = this.getQuery()._id;
    await expenses.deleteMany({memberId : memberId})
    next();
})

module.exports = mongoose.model('MoneyAdd', moneyAddSchema);


