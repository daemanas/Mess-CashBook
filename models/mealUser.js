const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    food_count: {
        type: Number,
        required: true
    }
});

const mealUserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    meals: [mealSchema],
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

module.exports = mongoose.model('MealUser', mealUserSchema);
