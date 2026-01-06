const mongoose = require('mongoose');
const MoneyAdd = require('../models/moneyAdd');
const VagetableExpense = require('../models/moneyExpenses');
const MealUser = require('../models/mealUser');


/* =========================
   INDEX
========================= */


exports.getIndex = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id)
        // 🔹 Total Income
        const incomeResult = await MoneyAdd.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$entry_amount" }
                }
            }
        ]);

        const incomeTotal = incomeResult[0]?.total || 0;

        // 🔹 Total Expense
        const expenseResult = await VagetableExpense.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$entry_amount" }
                }
            }
        ]);

        const expenseTotal = expenseResult[0]?.total || 0;

        // 🔹 Available Balance
        const availableBalance = incomeTotal - expenseTotal;

        // 🔹 Grand Total Food Count
        const mealUsers = await MealUser.find({ user: userId });

        let grandTotalFood = 0;
        mealUsers.forEach(u =>
            u.meals.forEach(m => (grandTotalFood += m.food_count))
        );

        // 🔥 Per Meal Price
        const perMealPrice =
            grandTotalFood > 0
                ? (expenseTotal / grandTotalFood).toFixed(2)
                : 0;

        res.render('host/index', {
            incomeTotal,
            expenseTotal,
            availableBalance,
            grandTotalFood,
            perMealPrice
        });

    } catch (error) {
        console.error(error);
        res.render('host/index', {
            incomeTotal: 0,
            expenseTotal: 0,
            availableBalance: 0,
            grandTotalFood: 0,
            perMealPrice: 0
        });
    }
};







/* =========================
   ADD ENTRY PAGE
========================= */
exports.getAddEntry = (req, res) => {
    const title = req.query.title || '';

    res.render('host/Add-Entry', {
        title
    });
};


/* =========================
   POST ADD ENTRY
========================= */
exports.postAddEntry = async (req, res, next) => {
    try {
        const { entry_title, entry_amount, entry_date } = req.body;

//         const newEntry = new MoneyAdd({
//             entry_title: entry_title.trim().toLowerCase(),
//             entry_amount: Number(entry_amount),
//             entry_date,
//             user: req.session.user.id
//         });


//         await newEntry.save();
//         res.redirect('/moneyAdded');

//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Error saving entry');
//     }
// }; 
        await MoneyAdd.create({
            entry_title: entry_title.trim().toLowerCase(),
            entry_amount: Number(entry_amount),
            entry_date,
            user: req.session.user.id
        });

        res.redirect('/moneyAdded');
    } catch (err) {
        console.error(err);
        res.status(500).send('Money add failed');
    }
};


exports.getAddExpense =( req, res) => {
    res.render('host/AddExpense' , {
        

    });

}

exports.postAddExpense =async (req, res) => {

    try {
        const {entry_date, vag_name, entry_amount } = req.body ;
        const titles = Array.isArray(vag_name) ? vag_name : [vag_name];
        const amounts = Array.isArray(entry_amount) ? entry_amount : [entry_amount];
        
        for (let i = 0 ; i < vag_name.length ; i++) {
            await VagetableExpense.create({
                entry_date,
                vag_name : titles[i],
                entry_amount : Number(amounts[i]),
                user: req.session.user.id
            });
        }
        res.redirect('/expentionAdded');

    } catch (error) {
        console.error(error)
        res.ststus(500).send("Error saving vagetable expense")
    }
}


/* =========================
   OTHER PAGES
========================= */
// exports.getSetting = (req, res) => {
//     res.render('host/Settings' , {
//          


//     });
// };


exports.getSetting = (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.render('host/Settings', {
        user: req.session.user,
         


    });
};



exports.getReports = (req, res) => {
    res.render('host/Reports' , {
         


    });
};

exports.getTransactions = (req, res) => {
    res.render('host/Transactions' , {
         


    });

};





exports.getMoneyAdded = async (req, res) => {
    try {
        const entries = await MoneyAdd.find({ user: req.session.user.id })
;

        // 🔹 Group by entry_title
        const groupedData = {};
        let grandTotal = 0;

        entries.forEach(e => {
            const title = e.entry_title;
            const amount = Number(e.entry_amount);

            if (!groupedData[title]) {
                groupedData[title] = {
                    title: title,
                    entries: [],
                    total: 0
                };
            }

            groupedData[title].entries.push(e);
            groupedData[title].total += amount;
            grandTotal += amount;
        });

        // Object → Array (EJS friendly)
        const groups = Object.values(groupedData);

        res.render('host/moneyAdded', {
            groups,
            grandTotal,
        });

    } catch (error) {
        console.error(error);
        res.render('host/moneyAdded', {
            groups: [],
            grandTotal: 0
        });
    }
};

exports.getExpenseAdded = async (req, res) => {
    try {
        const expenses = await VagetableExpense.find({user: req.session.user.id}).sort({ entry_date: -1 });

        const groupedByDate = {};
        let grandTotal = 0;   // 🔥 সব কার্ডের total

        expenses.forEach(item => {
            const dateKey = item.entry_date.toISOString().split('T')[0];

            if (!groupedByDate[dateKey]) {
                groupedByDate[dateKey] = {
                    date: item.entry_date,
                    items: [],
                    total: 0
                };
            }

            groupedByDate[dateKey].items.push({
                name: item.vag_name,
                amount: item.entry_amount
            });

            groupedByDate[dateKey].total += item.entry_amount;
        });

        // Object → Array
        const expenseCards = Object.values(groupedByDate);

        // 🔥 সব card total যোগ করে grandTotal
        expenseCards.forEach(card => {
            grandTotal += card.total;
        });

        res.render('host/AddedExpention', {
            expenseCards,
            grandTotal,
             


        });

    } catch (error) {
        console.error(error);
        res.render('host/AddedExpention', {
            expenseCards: [],
            grandTotal: 0
        });
    }
};




exports.getAddMeal = (req, res) => {
    const name = req.query.name || '';

    res.render('host/AddMeal', {
        name
    });
};


exports.postAddMeal = async (req, res) => {
    try {
        const { name, food_count } = req.body;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 🔍 user আছে কিনা check
        let user = await MealUser.findOne({
            name: name.trim().toLowerCase(),
            user: req.session.user.id  
        });

        


        if (!user) {
            // 🆕 নতুন user → card তৈরি
            user = new MealUser({
                name: name.trim().toLowerCase(),
                meals: [{ date: today, food_count: Number(food_count) }],
                user: req.session.user.id
            });


        } else {
            // 🔁 user আছে → আজকের entry আছে কিনা check
            const alreadyAdded = user.meals.find(
                m => m.date.getTime() === today.getTime()
            );

            if (alreadyAdded) return res.status(400).send('আজকের খাবার কাউন্ট আগেই অ্যাড করা হয়েছে');
            

            // ➕ আজকের meal add
            user.meals.push({
                date: today,
                food_count
            });
        }

        await user.save();
        res.redirect('/AddedMeal');

    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding meal');
    }
};



exports.getAddedMeal = async (req, res) => {
    try {
        const users = await MealUser.find({
            user: req.session.user.id
        });

        let grandTotalFood = 0;   // 🔥 সব user এর total যোগ হবে

        // প্রতিটা user এর total হিসাব
        const usersWithTotal = users.map(user => {
            let userTotal = 0;

            user.meals.forEach(m => {
                userTotal += m.food_count;
            });

            // 🔥 grand total এ যোগ
            grandTotalFood += userTotal;

            return {
                ...user.toObject(),
                userTotal
            };
        });

        res.render('host/AddedMeal', {
            users: usersWithTotal,
            grandTotalFood,
             


        });

    } catch (error) {
        console.error(error);
        res.render('host/AddedMeal', {
            users: [],
            grandTotalFood: 0
        });
    }
};



exports.getMealBilling = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id); // ✅ FIX

        // 🔹 Total Expense
        const expenseResult = await VagetableExpense.aggregate([
            { $match: { user: userId } },   // ✅ FIX
            {
                $group: {
                    _id: null,
                    total: { $sum: "$entry_amount" }
                }
            }
        ]);

        const expenseTotal = expenseResult[0]?.total || 0;

        // 🔹 All users with meals
        const users = await MealUser.find({
            user: userId   // ✅ FIX (consistency)
        });

        // 🔹 Grand Total Food Count
        let grandTotalFood = 0;
        users.forEach(user => {
            user.meals.forEach(m => {
                grandTotalFood += Number(m.food_count);
            });
        });

        // 🔹 Per Meal Price
        const perMealPrice =
            grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

        // 🔥 User-wise calculation
        const billingUsers = users.map(user => {
            let userTotalFood = 0;

            user.meals.forEach(m => {
                userTotalFood += Number(m.food_count);
            });

            const payableAmount = userTotalFood * perMealPrice;

            return {
                name: user.name,
                userTotalFood,
                payableAmount: payableAmount.toFixed(2)
            };
        });

        res.render('host/MealBilling', {
            perMealPrice: perMealPrice.toFixed(2),
            billingUsers,
            grandTotalFood,
            expenseTotal
        });

    } catch (error) {
        console.error(error);
        res.render('host/MealBilling', {
            perMealPrice: 0,
            billingUsers: [],
            grandTotalFood: 0,
            expenseTotal: 0
        });
    }
};






exports.getFinalSettlement = async (req, res) => {
    try {

        if (!req.session.user || !req.session.user.id) {
            return res.redirect('/login');
        }

        const userId = new mongoose.Types.ObjectId(req.session.user.id);

        const expenseResult = await VagetableExpense.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$entry_amount" }
                }
            }
        ]);
        const expenseTotal = expenseResult[0]?.total || 0;

        const users = await MealUser.find({ user: userId });

        let grandTotalFood = 0;
        users.forEach(u => {
            u.meals.forEach(m => {
                grandTotalFood += Number(m.food_count) || 0;
            });
        });

        const perMealPrice =
            grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

        const payments = await MoneyAdd.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: "$entry_title",
                    totalPaid: { $sum: "$entry_amount" }
                }
            }
        ]);

        const paymentMap = {};
        payments.forEach(p => {
            if (!p._id) return;
            const key = p._id.trim().toLowerCase();
            paymentMap[key] = Number(p.totalPaid);
        });

        const settlement = users.map(user => {
            let userFood = 0;
            user.meals.forEach(m => {
                userFood += Number(m.food_count) || 0;
            });

            const payableAmount = userFood * perMealPrice;

            const userNameKey = user.name
                ? user.name.trim().toLowerCase()
                : '';

            const paidAmount = paymentMap[userNameKey] || 0;

            const finalBalance = paidAmount - payableAmount;

            return {
                name: user.name || 'unknown',
                foodCount: userFood,
                paidAmount: paidAmount.toFixed(2),
                payableAmount: payableAmount.toFixed(2),
                finalBalance: finalBalance.toFixed(2),
                status:
                    finalBalance > 0
                        ? 'RECEIVE'
                        : finalBalance < 0
                        ? 'DUE'
                        : 'CLEAR'
            };
        });

        res.render('host/FinalSettlement', {
            settlement,
            perMealPrice: perMealPrice.toFixed(2),
            expenseTotal: expenseTotal.toFixed(2),
            grandTotalFood
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating settlement');
    }
};



// deleteMoney
exports.deleteMoneyGroup = async (req, res) => {
    try {
        const title = req.params.title.toLowerCase();

        await MoneyAdd.deleteMany({
            entry_title: title,
            user: req.session.user.id   // 🔐 শুধু নিজের data
        });

        res.redirect('/moneyAdded');

    } catch (error) {
        console.error(error);
        res.status(500).send('Card delete failed');
    }
};


exports.deleteExpenseByDate = async (req, res) => {
    try {
        const dateParam = new Date(req.params.date);

        // ওই দিনের শুরু ও শেষ
        const start = new Date(dateParam);
        start.setHours(0, 0, 0, 0);

        const end = new Date(dateParam);
        end.setHours(23, 59, 59, 999);

        await VagetableExpense.deleteMany({
            entry_date: { $gte: start, $lte: end },
            user: req.session.user.id   // 🔐 only own data
        });

        res.redirect('/expentionAdded');

    } catch (error) {
        console.error(error);
        res.status(500).send('Expense delete failed');
    }
};


exports.deleteMealUser = async (req, res) => {
    try {
        const userId = req.params.id;

        await MealUser.deleteOne({
            _id: userId,
            user: req.session.user.id   // 🔐 only own data
        });

        res.redirect('/AddedMeal');

    } catch (error) {
        console.error(error);
        res.status(500).send('Meal user delete failed');
    }
};

