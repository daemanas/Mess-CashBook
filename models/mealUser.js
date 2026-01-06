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
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

module.exports = mongoose.model('MealUser', mealUserSchema);
