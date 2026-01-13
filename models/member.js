const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
},
//   {
//     timestamps: true   // ✅ এখানেই দিতে হবে
//   }
);




module.exports = mongoose.model('Member', memberSchema);