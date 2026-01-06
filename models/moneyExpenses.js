const mongoose = require('mongoose') ;
const vegetableExpenseSchema = new mongoose.Schema({
    entry_date : {
        type : Date,
        required : true
    },
    vag_name : {
        type : String,
        required : true
    },
    entry_amount : {
        type : Number,
        required : true
    },
    user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
}

})

module.exports = mongoose.model('VagetableExpense' , vegetableExpenseSchema )