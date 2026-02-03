
// const mongoose = require('mongoose');
// const User = require('../models/User');
// const MoneyAdd = require('../models/moneyAdd');
// const VagetableExpense = require('../models/moneyExpenses');
// const MealUser = require('../models/mealUser');



// /* =========================
//    INDEX
// ========================= */



// exports.getIndex = async (req, res) => {
//     try {
//         const userId = new mongoose.Types.ObjectId(req.session.user.id)
            
//         // 🔹 Total Income
//         const incomeResult = await MoneyAdd.aggregate([
//             { $match: { groupId: req.session.user.groupId} },
//             {
//                 $group: {
//                     _id: null,
//                     total: { $sum: "$entry_amount" }
//                 }
//             }
//         ]);

//         const incomeTotal = incomeResult[0]?.total || 0;

//         // 🔹 Total Expense
//         const expenseResult = await VagetableExpense.aggregate([
//             { $match: { groupId: req.session.user.groupId} },
//             {
//                 $group: {
//                     _id: null,
//                     total: { $sum: "$entry_amount" }
//                 }
//             }
//         ]);

//         const expenseTotal = expenseResult[0]?.total || 0;

//         // 🔹 Available Balance
//         const availableBalance = incomeTotal - expenseTotal;
        
//         // 🔹 Grand Total Food Count
//         const mealUsers = await MealUser.find({ groupId: req.session.user.groupId});

//         let grandTotalFood = 0;
//         mealUsers.forEach(u =>
//             u.meals.forEach(m => (grandTotalFood += m.food_count))
//         );

//         // 🔥 Per Meal Price
//         const perMealPrice =
//             grandTotalFood > 0
//                 ? (expenseTotal / grandTotalFood).toFixed(2)
//                 : 0;

        
//                 // ===============================
//         // 🔹 RECENT ACTIVITY (Dashboard)
//         // ===============================
//         const groupId = req.session.user.groupId;
        

//         // 1️⃣ Recent Money Add (Income)
//         const moneyLogs = await MoneyAdd.find({ groupId: req.session.user.groupId})
//           .populate('user', 'name')
//           .sort({ createdAt: -1 })
//           .limit(5)
//           .lean()
//           .then(items =>
//             items.map(i => ({
//               date: i.entry_date,
//               name: i.user?.name || 'Unknown',
//               category: i.entry_title,
//               amount: i.entry_amount,
//               type: 'Income'
//             }))
//           );

//         // 2️⃣ Recent Expenses
//         const expenseLogs = await VagetableExpense.find({ groupId: req.session.user.groupId})
//           .populate('user', 'name')
//           .sort({ createdAt: -1 })
//           .limit(5)
//           .lean()
//           .then(items =>
//             items.map(i => ({
//               date: i.entry_date,
//               name: i.user?.name || 'Unknown',
//               category: i.vag_name,
//               amount: i.entry_amount,
//               type: 'Expense'
//             }))
//           );

//         // 3️⃣ Recent Meal Adds
//         const mealLogs = await MealUser.find({ groupId: req.session.user.groupId})
//           .populate('user', 'name')
//           .sort({ updatedAt: -1 })
//           .limit(5)
//           .lean()
//           .then(users =>
//             users.flatMap(u =>
//               u.meals.map(m => ({
//                 date: m.date,
//                 name: u.user?.name || 'Unknown',
//                 category: u.name,
//                 amount: m.food_count,
//                 type: 'Meal'
//               }))
//             )
//           );

//         // 🔥 Merge + Sort
//         const recentTransactions = [
//           ...moneyLogs,
//           ...expenseLogs,
//           ...mealLogs
//         ]
//           .sort((a, b) => new Date(b.date) - new Date(a.date))
//           .slice(0, 10);


//         res.render('host/index', {
//             incomeTotal,
//             expenseTotal,
//             availableBalance,
//             grandTotalFood,
//             perMealPrice,
//             recentTransactions 
//         });

//     } catch (error) {
//         console.error(error);
//         res.render('host/index', {
//             incomeTotal: 0,
//             expenseTotal: 0,
//             availableBalance: 0,
//             grandTotalFood: 0,
//             perMealPrice: 0
//         });
//     }
// };







// /* =========================
//    ADD ENTRY PAGE
// ========================= */
// exports.getAddEntry = (req, res) => {
//     const title = req.query.title || '';

//     res.render('host/Add-Entry', {
//         title
//     });
// };


// /* =========================
//    POST ADD ENTRY
// ========================= */

// exports.postAddEntry = async (req, res) => {
//     try {
//         const { entry_title, entry_amount, entry_date } = req.body;

//         const memberName = entry_title.trim().toLowerCase();
//         const userId = req.session.user.id;
            

//         // 1️⃣ Money add
//         await MoneyAdd.create({
//             entry_title: memberName,
//             entry_amount: Number(entry_amount),
//             entry_date,
//             groupId: req.session.user.groupId,
//             user: userId
//         });

//         // 2️⃣ MealUser আছে কিনা check
//         const mealUser = await MealUser.findOne({
//             name: memberName,
//             user: userId
//         });

//         // 3️⃣ না থাকলে নতুন MealUser বানাও
//         if (!mealUser) {
//             await MealUser.create({
//                 name: memberName,
//                 meals: [],
//                 user: userId
//             });
//         }

//         res.redirect('/moneyAdded');

//     } catch (err) {
//         console.error(err);
//         res.status(500).send('Money add failed');
//     }
// };



// exports.getAddExpense =( req, res) => {
//     res.render('host/AddExpense' , {
        

//     });

// }

// exports.postAddExpense = async (req, res) => {
//   try {
//     const { entry_date, vag_name, entry_amount } = req.body;

//     const titles = Array.isArray(vag_name) ? vag_name : [vag_name];
//     const amounts = Array.isArray(entry_amount) ? entry_amount : [entry_amount];

//     const userId = req.session.user.id;
//     const groupId = req.session.user.groupId;
        

//     for (let i = 0; i < titles.length; i++) {
//       await VagetableExpense.create({
//         entry_date,
//         vag_name: titles[i],
//         entry_amount: Number(amounts[i]),
//         user: userId,        // 👈 কে add করছে
//         groupId: groupId     // 👈 কোন গ্রুপের data
//       });
//     }

//     res.redirect('/expentionAdded');

//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Error saving vegetable expense");
//   }
// };


// exports.getSetting = (req, res) => {
//     if (!req.session.user) {
//         return res.redirect('/login');
//     }

//     res.render('host/Settings', {
//         user: req.session.user,

//     });
// };



// exports.getReports = (req, res) => {
//     res.render('host/Reports' , {
         


//     });
// };


// exports.getTransactions = async (req, res) => {
//     try {
//         const groupId = req.session.user.groupId;

//         const page = parseInt(req.query.page) || 1;
//         const limit = 10;
//         const skip = (page - 1) * limit;

//         const { from, to, type, search } = req.query;

//         let dateFilter = {};
//         if (from && to) {
//             dateFilter = {
//                 $gte: new Date(from),
//                 $lte: new Date(to)
//             };
//         }

//         /* ===== INCOME ===== */
//         let incomes = [];
//         if (!type || type === 'income') {
//             incomes = await MoneyAdd.find({
//                 groupId,
//                 ...(from && to && { entry_date: dateFilter }),
//                 ...(search && {
//                     entry_title: { $regex: search, $options: 'i' }
//                 })
//             });
//         }

//         /* ===== EXPENSE ===== */
//         let expenses = [];
//         if (!type || type === 'expense') {
//             expenses = await VagetableExpense.find({
//                 groupId,
//                 ...(from && to && { entry_date: dateFilter }),
//                 ...(search && {
//                     vag_name: { $regex: search, $options: 'i' }
//                 })
//             });
//         }

//         /* ===== MERGE ===== */
//         let transactions = [
//             ...incomes.map(i => ({
//                 date: i.entry_date,
//                 title: i.entry_title,
//                 category: 'Income',
//                 amount: i.entry_amount,
//                 type: 'income'
//             })),
//             ...expenses.map(e => ({
//                 date: e.entry_date,
//                 title: e.vag_name,
//                 category: 'Expense',
//                 amount: e.entry_amount,
//                 type: 'expense'
//             }))
//         ].sort((a, b) => new Date(b.date) - new Date(a.date));

//         const totalItems = transactions.length;
//         const totalPages = Math.ceil(totalItems / limit);

//         const paginatedTransactions = transactions.slice(skip, skip + limit);

//         res.render('host/Transactions', {
//             transactions: paginatedTransactions,
//             currentPage: page,
//             totalPages,
//             filters: { from, to, type, search }
//         });

//     } catch (error) {
//         console.error(error);
//         res.render('host/Transactions', {
//             transactions: [],
//             currentPage: 1,
//             totalPages: 1,
//             filters: {}
//         });
//     }
// };


// exports.getMoneyAdded = async (req, res) => {
//   try {
        
//     const entries = await MoneyAdd.find({ groupId: req.session.user.groupId});

//     // const entries = await MoneyAdd.find({ filter });

//     const groupedData = {};
//     let grandTotal = 0;

//     entries.forEach(e => {
//       const title = e.entry_title;
//       const amount = Number(e.entry_amount);

//       if (!groupedData[title]) {
//         groupedData[title] = {
//           title,
//           entries: [],
//           total: 0
//         };
//       }

//       groupedData[title].entries.push(e);
//       groupedData[title].total += amount;
//       grandTotal += amount;
//     });

//     const groups = Object.values(groupedData);

//     res.render('host/moneyAdded', {
//       groups,
//       grandTotal
//     });

//   } catch (error) {
//     console.error(error);
//     res.render('host/moneyAdded', {
//       groups: [],
//       grandTotal: 0
//     });
//   }
// };


// exports.getExpenseAdded = async (req, res) => {
//   try {
//     const groupId = req.session.user.groupId;
        

//     // 🔥 group-wise expense fetch
//     const expenses = await VagetableExpense
//       .find({ groupId: req.session.user.groupId})
//       .sort({ entry_date: -1 });

//     const groupedByDate = {};
//     let grandTotal = 0;

//     expenses.forEach(item => {
//       const dateKey = item.entry_date.toISOString().split('T')[0];

//       if (!groupedByDate[dateKey]) {
//         groupedByDate[dateKey] = {
//           date: item.entry_date,
//           items: [],
//           total: 0
//         };
//       }

//       groupedByDate[dateKey].items.push({
//         _id: item._id,  //add new
//         name: item.vag_name,
//         amount: item.entry_amount
//       });

//       groupedByDate[dateKey].total += Number(item.entry_amount);
//     });

//     // Object → Array
//     const expenseCards = Object.values(groupedByDate);

//     // 🔥 Grand Total
//     expenseCards.forEach(card => {
//       grandTotal += card.total;
//     });

//     res.render('host/AddedExpention', {
//       expenseCards,
//       grandTotal
//     });

//   } catch (error) {
//     console.error(error);
//     res.render('host/AddedExpention', {
//       expenseCards: [],
//       grandTotal: 0
//     });
//   }
// };


// exports.getAddMeal = async (req, res) => {
//   try {
//     const groupId = req.session.user.groupId;

//     // 🔥 group-wise unique member list
//     const members = await MoneyAdd.distinct(
//       'entry_title',
//       { groupId }
//     );

//     res.render('host/AddMeal', {
//       members
//     });

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Failed to load members');
//   }
// };




// exports.postAddMeal = async (req, res) => {
//   try {
//     const { name, food_count } = req.body;

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const memberName = name.trim().toLowerCase();
//     const groupId = req.session.user.groupId;
//     const userId = req.session.user.id;

//     // 🔍 group-wise member check
//     let user = await MealUser.findOne({
//       name: memberName,
//       groupId
//     });

//     // 🆕 member না থাকলে create
//     if (!user) {
//       user = await MealUser.create({
//         name: memberName,
//         meals: [],
//         groupId,
//         user: userId
//       });
//     }

//     // 🔁 আজকের meal আছে কিনা
//     const alreadyAdded = user.meals.find(
//       m => m.date.getTime() === today.getTime()
//     );

//     if (alreadyAdded) {
//       return res.status(400).send('আজকের খাবার কাউন্ট আগেই অ্যাড করা হয়েছে');
//     }

//     // ➕ add today meal
//     user.meals.push({
//       date: today,
//       food_count: Number(food_count)
//     });

//     await user.save();
//     res.redirect('/AddedMeal');

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Error adding meal');
//   }
// };



// exports.getAddedMeal = async (req, res) => {
//   try {
//     const groupId = req.session.user.groupId;

//     const users = await MealUser.find({ groupId });

//     let grandTotalFood = 0;

//     const usersWithTotal = users.map(user => {
//       let userTotal = 0;

//       user.meals.forEach(m => {
//         userTotal += Number(m.food_count);
//       });

//       grandTotalFood += userTotal;

//       return {
//         ...user.toObject(),
//         userTotal
//       };
//     });

//     res.render('host/AddedMeal', {
//       users: usersWithTotal,
//       grandTotalFood
//     });

//   } catch (error) {
//     console.error(error);
//     res.render('host/AddedMeal', {
//       users: [],
//       grandTotalFood: 0
//     });
//   }
// };


// exports.getMealBilling = async (req, res) => {
//   try {
//     const groupId = req.session.user.groupId;
        

//     // 🔹 Total Expense (GROUP WISE)
//     const expenseResult = await VagetableExpense.aggregate([
//       { $match: { groupId } },
//       {
//         $group: {
//           _id: null,
//           total: { $sum: "$entry_amount" }
//         }
//       }
//     ]);

//     const expenseTotal = expenseResult[0]?.total || 0;

//     // 🔹 All users with meals (GROUP WISE)
//     const users = await MealUser.find({ groupId });

//     // 🔹 Grand Total Food Count
//     let grandTotalFood = 0;
//     users.forEach(user => {
//       user.meals.forEach(m => {
//         grandTotalFood += Number(m.food_count);
//       });
//     });

//     // 🔹 Per Meal Price
//     const perMealPrice =
//       grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

//     // 🔥 User-wise billing
//     const billingUsers = users.map(user => {
//       let userTotalFood = 0;

//       user.meals.forEach(m => {
//         userTotalFood += Number(m.food_count);
//       });

//       const payableAmount = userTotalFood * perMealPrice;

//       return {
//         name: user.name,
//         userTotalFood,
//         payableAmount: payableAmount.toFixed(2)
//       };
//     });

//     res.render('host/MealBilling', {
//       perMealPrice: perMealPrice.toFixed(2),
//       billingUsers,
//       grandTotalFood,
//       expenseTotal
//     });

//   } catch (error) {
//     console.error(error);
//     res.render('host/MealBilling', {
//       perMealPrice: 0,
//       billingUsers: [],
//       grandTotalFood: 0,
//       expenseTotal: 0
//     });
//   }
// };




// exports.getFinalSettlement = async (req, res) => {
//   try {
//     if (!req.session.user || !req.session.user.groupId) {
//       return res.redirect('/login');
//     }

//     const groupId = req.session.user.groupId;
        

//     /* =====================
//        1️⃣ Total Expense (GROUP)
//     ===================== */
//     const expenseResult = await VagetableExpense.aggregate([
//       { $match: { groupId } },
//       {
//         $group: {
//           _id: null,
//           total: { $sum: "$entry_amount" }
//         }
//       }
//     ]);

//     const expenseTotal = expenseResult[0]?.total || 0;

//     /* =====================
//        2️⃣ Meal Data (GROUP)
//     ===================== */
//     const users = await MealUser.find({ groupId });

//     let grandTotalFood = 0;
//     users.forEach(u => {
//       u.meals.forEach(m => {
//         grandTotalFood += Number(m.food_count) || 0;
//       });
//     });

//     const perMealPrice =
//       grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

//     /* =====================
//        3️⃣ Payments (GROUP)
//     ===================== */
//     const payments = await MoneyAdd.aggregate([
//       { $match: { groupId } },
//       {
//         $group: {
//           _id: "$entry_title",
//           totalPaid: { $sum: "$entry_amount" }
//         }
//       }
//     ]);

//     const paymentMap = {};
//     payments.forEach(p => {
//       if (!p._id) return;
//       const key = p._id.trim().toLowerCase();
//       paymentMap[key] = Number(p.totalPaid);
//     });

//     /* =====================
//        4️⃣ Final Settlement
//     ===================== */
//     const settlement = users.map(user => {
//       let userFood = 0;
//       user.meals.forEach(m => {
//         userFood += Number(m.food_count) || 0;
//       });

//       const payableAmount = userFood * perMealPrice;

//       const key = user.name ? user.name.trim().toLowerCase() : '';
//       const paidAmount = paymentMap[key] || 0;

//       const finalBalance = paidAmount - payableAmount;

//       return {
//         name: user.name,
//         foodCount: userFood,
//         paidAmount: paidAmount.toFixed(2),
//         payableAmount: payableAmount.toFixed(2),
//         finalBalance: finalBalance.toFixed(2),
//         status:
//           finalBalance > 0
//             ? 'RECEIVE'
//             : finalBalance < 0
//             ? 'DUE'
//             : 'CLEAR'
//       };
//     });

//     res.render('host/FinalSettlement', {
//       settlement,
//       perMealPrice: perMealPrice.toFixed(2),
//       expenseTotal: expenseTotal.toFixed(2),
//       grandTotalFood
//     });

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Error generating settlement');
//   }
// };




// // deleteMoney
// exports.deleteMoneyGroup = async (req, res) => {
//   try {
//     // ❌ member delete করতে পারবে না
//     if (req.session.user.role !== 'admin') {
//       return res.status(403).send('Access denied');
//     }

//     const title = req.params.title.toLowerCase();

//     await MoneyAdd.deleteMany({
//       entry_title: title,
//       groupId: req.session.user.groupId// ✅ GROUP wise delete
//     });

//     res.redirect('/moneyAdded');

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Card delete failed');
//   }
// };


// exports.deleteExpenseByDate = async (req, res) => {
//   try {
//     if (req.session.user.role !== 'admin') {
//       return res.status(403).send('Access denied');
//     }

//     const dateParam = new Date(req.params.date);

//     const start = new Date(dateParam);
//     start.setHours(0, 0, 0, 0);

//     const end = new Date(dateParam);
//     end.setHours(23, 59, 59, 999);

//     await VagetableExpense.deleteMany({
//       entry_date: { $gte: start, $lte: end },
//       groupId: req.session.user.groupId// ✅ GROUP wise
//     });

//     res.redirect('/expentionAdded');

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Expense delete failed');
//   }
// };


// exports.deleteMealUser = async (req, res) => {
//   try {
//     if (req.session.user.role !== 'admin') {
//       return res.status(403).send('Access denied');
//     }

//     const mealUserId = req.params.id;

//     await MealUser.deleteOne({
//       _id: mealUserId,
//       groupId: req.session.user.groupId// ✅ only same group
//     });

//     res.redirect('/AddedMeal');

//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Meal user delete failed');
//   }
// };
   



// exports.getGroupMembers = async (req, res) => {
//   try {
//     const groupId = req.session.user.groupId;

//     const members = await User.find({ groupId })
//       .select('name email role');

//     res.render('host/groupMembers', {
//       members,
//       currentUser: req.session.user
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Failed to load members');
//   }
// };



// exports.makeAdmin = async (req, res) => {
//   try {
//     if (req.session.user.role !== 'admin') {
//       return res.status(403).send('Access denied');
//     }

//     await User.updateOne(
//       { _id: req.params.id, groupId: req.session.user.groupId },
//       { role: 'admin' }
//     );

//     res.redirect('/settings/members');

//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Failed to update role');
//   }
// };


// exports.removeMember = async (req, res) => {
//   try {
//     if (req.session.user.role !== 'admin') {
//       return res.status(403).send('Access denied');
//     }

//     await User.deleteOne({
//       _id: req.params.id,
//       groupId: req.session.user.groupId
//     });

//     res.redirect('/settings/members');

//   } catch (err) {
//     console.error(err);
//     res.status(500).send('Failed to remove member');
//   }
// };

// // singal list delete

// exports.deleteSingleExpense = async (req, res) => {
//     try {
//         const id = req.params.id;


//         await VagetableExpense.deleteOne({
//             _id: id,
//             groupId: req.session.user.groupId   // 🔐 safety
//         });

//         res.redirect('/expentionAdded');
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Single expense delete failed');
//     }
// };


// exports.deleteSingleMeal = async (req, res) => {
//     try {
//         if (req.session.user.role !== 'admin') {
//           return res.status(403).send('Access Denied')
//         }
//         const { userId, mealId } = req.params;

//         await MealUser.updateOne(
//             {
//                 _id: userId,
//                 groupId: req.session.user.groupId   // 🔐 safety
//             },
//             {
//                 $pull: {
//                     meals: { _id: mealId }
//                 }
//             }
//         );

//         res.redirect('/AddedMeal');
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Meal delete failed');
//     }
// };

// exports.deleteSingleMoney = async (req, res) => {
//     try {
        
//         if (req.session.user.role !== 'admin') {
//           return res.status(403).send('Access Denied')
//         }

//         const id = req.params.id;
        
//         await MoneyAdd.deleteOne({
//             _id: id,
//             groupId: req.session.user.groupId   // 🔐 group safety
//         });

//         res.redirect('/moneyAdded');
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Money delete failed');
//     }
// };

// //





const mongoose = require('mongoose');
const User = require('../models/User');
const MoneyAdd = require('../models/moneyAdd');
const VagetableExpense = require('../models/moneyExpenses');
const MealUser = require('../models/mealUser');



exports.getIndex = async (req, res) => {
    try {
        const now = new Date();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const year = Number(req.query.year) || now.getFullYear();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        
        const groupId = req.session.user.groupId;
        
        // 🔹 Total Income
        const incomeResult = await MoneyAdd.aggregate([
            { $match:  {groupId,
               entry_date: { $gte: startDate, $lte: endDate }
            } },
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
            { $match: { groupId,
              entry_date: { $gte: startDate, $lte: endDate }
            } },
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
        const mealUsers = await MealUser.find({ groupId: req.session.user.groupId});

        let grandTotalFood = 0;
        mealUsers.forEach(u => {
          u.meals.forEach(m => {
            const d = new Date(m.date);
            if (d >= startDate && d <= endDate) {
              grandTotalFood += Number(m.food_count);
            }
          });
        });


        // 🔥 Per Meal Price
        const perMealPrice =
            grandTotalFood > 0
                ? (expenseTotal / grandTotalFood).toFixed(2)
                : 0;

        
                // ===============================
        // 🔹 RECENT ACTIVITY (Dashboard)
        // ===============================
        // const groupId = req.session.user.groupId;
        

        // 1️⃣ Recent Money Add (Income)
        const moneyLogs = await MoneyAdd.find({ groupId: req.session.user.groupId})
          .populate('user', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .then(items =>
            items.map(i => ({
              date: i.entry_date,
              name: i.user?.name || 'Unknown',
              category: i.entry_title,
              amount: i.entry_amount,
              type: 'Income'
            }))
          );

        // 2️⃣ Recent Expenses
        const expenseLogs = await VagetableExpense.find({ groupId: req.session.user.groupId})
          .populate('user', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .then(items =>
            items.map(i => ({
              date: i.entry_date,
              name: i.user?.name || 'Unknown',
              category: i.vag_name,
              amount: i.entry_amount,
              type: 'Expense'
            }))
          );

        // 3️⃣ Recent Meal Adds
        const mealLogs = await MealUser.find({ groupId: req.session.user.groupId})
          .populate('user', 'name')
          .sort({ updatedAt: -1 })
          .limit(5)
          .lean()
          .then(users =>
            users.flatMap(u =>
              u.meals.map(m => ({
                date: m.date,
                name: u.user?.name || 'Unknown',
                category: u.name,
                amount: m.food_count,
                type: 'Meal'
              }))
            )
          );

        // 🔥 Merge + Sort
        const recentTransactions = [
          ...moneyLogs,
          ...expenseLogs,
          ...mealLogs
        ]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 10);


        res.render('host/index', {
            incomeTotal,
            expenseTotal,
            availableBalance,
            grandTotalFood,
            perMealPrice,
            recentTransactions,
            month,
            year
        });

    } catch (error) {
        console.error(error);
        res.render('host/index', {
            incomeTotal: 0,
            expenseTotal: 0,
            availableBalance: 0,
            grandTotalFood: 0,
            perMealPrice: 0,
            recentTransactions:[],
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear()
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



exports.postAddEntry = async (req, res) => {
    try {
        const { entry_title, entry_amount, entry_date } = req.body;

        const memberName = entry_title.trim().toLowerCase();
        const userId = req.session.user.id;

        // 1️⃣ Money add
        await MoneyAdd.create({
            entry_title: memberName,
            entry_amount: Number(entry_amount),
            entry_date,
            groupId: req.session.user.groupId,
            user: userId,
            // month,
            // year
        });

        // 2️⃣ MealUser আছে কিনা check
        const mealUser = await MealUser.findOne({
            name: memberName,
            user: userId
        });

        // 3️⃣ না থাকলে নতুন MealUser বানাও
        if (!mealUser) {
            await MealUser.create({
                name: memberName,
                meals: [],
                user: userId
            });
        }

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

exports.postAddExpense = async (req, res) => {
  try {
    const { entry_date, vag_name, entry_amount } = req.body;

    const titles = Array.isArray(vag_name) ? vag_name : [vag_name];
    const amounts = Array.isArray(entry_amount) ? entry_amount : [entry_amount];

    const userId = req.session.user.id;
    const groupId = req.session.user.groupId;


    for (let i = 0; i < titles.length; i++) {
      await VagetableExpense.create({
        entry_date,
        vag_name: titles[i],
        entry_amount: Number(amounts[i]),
        user: userId,        // 👈 কে add করছে
        groupId: groupId,    // 👈 কোন গ্রুপের data
        // month,
        // year

      });
    }

    res.redirect('/expentionAdded');

  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving vegetable expense");
  }
};


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


exports.getTransactions = async (req, res) => {
    try {
        const now = new Date();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const year = Number(req.query.year) || now.getFullYear();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const groupId = req.session.user.groupId;

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { from, to, type, search } = req.query;

        let dateFilter = {};
        if (from && to) {
            dateFilter = {
                $gte: new Date(from),
                $lte: new Date(to)
            };
        }

        /* ===== INCOME ===== */
        let incomes = [];
        if (!type || type === 'income') {
            incomes = await MoneyAdd.find({
                groupId,
                ...(from && to && { entry_date: dateFilter }),
                ...(search && {
                    entry_title: { $regex: search, $options: 'i' },
                entry_date: { $gte: startDate, $lte: endDate },
                })
            });
        }

        /* ===== EXPENSE ===== */
        let expenses = [];
        if (!type || type === 'expense') {
            expenses = await VagetableExpense.find({
                groupId,
                ...(from && to && { entry_date: dateFilter }),
                ...(search && {
                    vag_name: { $regex: search, $options: 'i' }
                })
            });
        }

        /* ===== MERGE ===== */
        let transactions = [
            ...incomes.map(i => ({
                date: i.entry_date,
                title: i.entry_title,
                category: 'Income',
                amount: i.entry_amount,
                type: 'income'
            })),
            ...expenses.map(e => ({
                date: e.entry_date,
                title: e.vag_name,
                category: 'Expense',
                amount: e.entry_amount,
                type: 'expense'
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalItems = transactions.length;
        const totalPages = Math.ceil(totalItems / limit);

        const paginatedTransactions = transactions.slice(skip, skip + limit);

        res.render('host/Transactions', {
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages,
            filters: { from, to, type, search },
            month,
            year
        });

    } catch (error) {
        console.error(error);
        res.render('host/Transactions', {
            transactions: [],
            currentPage: 1,
            totalPages: 1,
            filters: {},
            month: new Date().getMonth()+1,
            year: new Date().getFullYear()
        });
    }
};


exports.getMoneyAdded = async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // const { month, year, startDate, endDate } = getMonthRange(req);
    const entries = await MoneyAdd.find({ groupId: req.session.user.groupId,
      entry_date: { $gte: startDate, $lte: endDate }
    });

    // const entries = await MoneyAdd.find({ filter });

    const groupedData = {};
    let grandTotal = 0;

    entries.forEach(e => {
      const title = e.entry_title;
      const amount = Number(e.entry_amount);

      if (!groupedData[title]) {
        groupedData[title] = {
          title,
          entries: [],
          total: 0
        };
      }

      groupedData[title].entries.push(e);
      groupedData[title].total += amount;
      grandTotal += amount;
    });

    const groups = Object.values(groupedData);

    res.render('host/moneyAdded', {
      groups,
      grandTotal,
      month,
      year
    });

  } catch (error) {
    console.error(error);
    res.render('host/moneyAdded', {
      groups: [],
      grandTotal: 0,
      month: new Date().getMonth()+1,
      year: new Date().getFullYear()
    });
  }
};




exports.getExpenseAdded = async (req, res) => {
  try {
    // const { month, year, startDate, endDate } = getMonthRange(req);
    // const groupId = req.session.user.groupId;
    // const filter = buildFilter(req);

    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);


    // 🔥 group-wise expense fetch
    const expenses = await VagetableExpense
      .find({ groupId: req.session.user.groupId, 
        entry_date: { $gte: startDate, $lte: endDate }
      })
      .sort({ entry_date: -1 });

    const groupedByDate = {};
    let grandTotal = 0;

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
        _id: item._id,  //add new
        name: item.vag_name,
        amount: item.entry_amount
      });

      groupedByDate[dateKey].total += Number(item.entry_amount);
    });

    // Object → Array
    const expenseCards = Object.values(groupedByDate);

    // 🔥 Grand Total
    expenseCards.forEach(card => {
      grandTotal += card.total;
    });

    res.render('host/AddedExpention', {
      expenseCards,
      grandTotal,
      month,
      year
    });

  } catch (error) {
    console.error(error);
    res.render('host/AddedExpention', {
      expenseCards: [],
      grandTotal: 0,
      month: new Date().getMonth()+1,
      year: new Date().getFullYear()
    });
  }
};


exports.getAddMeal = async (req, res) => {
  try {
    const groupId = req.session.user.groupId;

    // 🔥 group-wise unique member list
    const members = await MoneyAdd.distinct(
      'entry_title',
      { groupId }
    );

    res.render('host/AddMeal', {
      members
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to load members');
  }
};


exports.postAddMeal = async (req, res) => {
  try {
    const { name, food_count } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const memberName = name.trim().toLowerCase();
    const groupId = req.session.user.groupId;
    const userId = req.session.user.id;

    // 🔍 group-wise member check
    let user = await MealUser.findOne({
      name: memberName,
      groupId
    });

    // 🆕 member না থাকলে create
    if (!user) {
      user = await MealUser.create({
        name: memberName,
        meals: [],
        groupId,
        user: userId
      });
    }

    // 🔁 আজকের meal আছে কিনা
    const alreadyAdded = user.meals.find(
      m => m.date.getTime() === today.getTime()
    );

    if (alreadyAdded) {
      return res.status(400).send('আজকের খাবার কাউন্ট আগেই অ্যাড করা হয়েছে');
    }

    // ➕ add today meal
    user.meals.push({
      date: today,
      food_count: Number(food_count),
    });

    await user.save();
    res.redirect('/AddedMeal');

  } catch (error) {
    console.error(error);
    res.status(500).send('Error adding meal');
  }
};

exports.getAddedMeal = async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const groupId = req.session.user.groupId;

    // 🔥 শুধু group অনুযায়ী user আনো
    const users = await MealUser.find({ groupId });

    let grandTotalFood = 0;

    const usersWithTotal = users.map(user => {
      // 🔥 মাস অনুযায়ী meal filter
      const filteredMeals = user.meals.filter(m => {
        const d = new Date(m.date);
        return d >= startDate && d <= endDate;
      });

      let userTotal = 0;
      filteredMeals.forEach(m => {
        userTotal += Number(m.food_count);
      });

      grandTotalFood += userTotal;

      return {
        ...user.toObject(),
        meals: filteredMeals,   // ✅ filtered meals পাঠানো
        userTotal
      };
    });

    res.render('host/AddedMeal', {
      users: usersWithTotal,
      grandTotalFood,
      month,
      year
    });

  } catch (error) {
    console.error(error);
    res.render('host/AddedMeal', {
      users: [],
      grandTotalFood: 0,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    });
  }
};

exports.getMealBilling = async (req, res) => {
  try {
    const groupId = req.session.user.groupId;

    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    /* =====================
       🔹 Total Expense (MONTH + GROUP)
    ===================== */
    const expenseResult = await VagetableExpense.aggregate([
      {
        $match: {
          groupId,
          entry_date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$entry_amount" }
        }
      }
    ]);

    const expenseTotal = expenseResult[0]?.total || 0;

    /* =====================
       🔹 Users with filtered meals
    ===================== */
    const users = await MealUser.find({ groupId });

    let grandTotalFood = 0;

    const billingUsers = users.map(user => {
      // 🔥 Month-wise meal filter
      const filteredMeals = user.meals.filter(m => {
        const d = new Date(m.date);
        return d >= startDate && d <= endDate;
      });

      let userTotalFood = 0;
      filteredMeals.forEach(m => {
        userTotalFood += Number(m.food_count);
      });

      grandTotalFood += userTotalFood;

      return {
        name: user.name,
        userTotalFood
      };
    });

    /* =====================
       🔹 Per Meal Price
    ===================== */
    const perMealPrice =
      grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

    /* =====================
       🔹 Final Billing
    ===================== */
    const finalBillingUsers = billingUsers.map(u => ({
      ...u,
      payableAmount: (u.userTotalFood * perMealPrice).toFixed(2)
    }));

    res.render('host/MealBilling', {
      perMealPrice: perMealPrice.toFixed(2),
      billingUsers: finalBillingUsers,
      grandTotalFood,
      expenseTotal,
      month,
      year
    });

  } catch (error) {
    console.error(error);
    res.render('host/MealBilling', {
      perMealPrice: 0,
      billingUsers: [],
      grandTotalFood: 0,
      expenseTotal: 0,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    });
  }
};


exports.getFinalSettlement = async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    if (!req.session.user || !req.session.user.groupId) {
      return res.redirect('/login');
    }

    const groupId = req.session.user.groupId;

    /* =====================
       1️⃣ Total Expense (MONTH + GROUP)
    ===================== */
    const expenseResult = await VagetableExpense.aggregate([
      {
        $match: {
          groupId,
          entry_date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$entry_amount" }
        }
      }
    ]);

    const expenseTotal = expenseResult[0]?.total || 0;

    /* =====================
       2️⃣ Meal Data (MONTH + GROUP)
    ===================== */
    const users = await MealUser.find({ groupId });

    let grandTotalFood = 0;

    const usersWithFood = users.map(user => {
      const filteredMeals = user.meals.filter(m => {
        const d = new Date(m.date);
        return d >= startDate && d <= endDate;
      });

      let userFood = 0;
      filteredMeals.forEach(m => {
        userFood += Number(m.food_count) || 0;
      });

      grandTotalFood += userFood;

      return {
        ...user.toObject(),
        meals: filteredMeals,
        userFood
      };
    });

    /* =====================
       3️⃣ Per Meal Price
    ===================== */
    const perMealPrice =
      grandTotalFood > 0 ? expenseTotal / grandTotalFood : 0;

    /* =====================
       4️⃣ Paid Money (MONTH + GROUP)
    ===================== */
    const payments = await MoneyAdd.aggregate([
      {
        $match: {
          groupId,
          entry_date: { $gte: startDate, $lte: endDate }
        }
      },
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

    /* =====================
       5️⃣ Final Settlement
    ===================== */
    const settlement = usersWithFood.map(user => {
      const payableAmount = user.userFood * perMealPrice;

      const key = user.name ? user.name.trim().toLowerCase() : '';
      const paidAmount = paymentMap[key] || 0;

      const finalBalance = paidAmount - payableAmount;

      return {
        name: user.name,
        foodCount: user.userFood,
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
      grandTotalFood,
      month,
      year
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating settlement');
  }
};


exports.getYearHistory = async (req, res) => {
  try {
    const groupId = req.session.user.groupId;

    // Income year-wise
    const incomeByYear = await MoneyAdd.aggregate([
      { $match: { groupId } },
      {
        $group: {
          _id: { $year: "$entry_date" },
          totalIncome: { $sum: "$entry_amount" }
        }
      }
    ]);

    // Expense year-wise
    const expenseByYear = await VagetableExpense.aggregate([
      { $match: { groupId } },
      {
        $group: {
          _id: { $year: "$entry_date" },
          totalExpense: { $sum: "$entry_amount" }
        }
      }
    ]);

    // Merge income + expense
    const yearMap = {};

    incomeByYear.forEach(i => {
      yearMap[i._id] = {
        year: i._id,
        income: i.totalIncome,
        expense: 0
      };
    });

    expenseByYear.forEach(e => {
      if (!yearMap[e._id]) {
        yearMap[e._id] = {
          year: e._id,
          income: 0,
          expense: e.totalExpense
        };
      } else {
        yearMap[e._id].expense = e.totalExpense;
      }
    });

    const years = Object.values(yearMap)
      .sort((a, b) => b.year - a.year)
      .map(y => ({
        ...y,
        balance: y.income - y.expense
      }));

    res.render('host/YearHistory', { years });

  } catch (err) {
    console.error(err);
    res.render('host/YearHistory', { years: [] });
  }
};


exports.getYearDetails = async (req, res) => {
  try {
    const groupId = req.session.user.groupId;
    const year = Number(req.params.year);

    // Income month-wise
    const incomeByMonth = await MoneyAdd.aggregate([
      {
        $match: {
          groupId,
          entry_date: {
            $gte: new Date(year, 0, 1),
            $lte: new Date(year, 11, 31, 23, 59, 59)
          }
        }
      },
      {
        $group: {
          _id: { $month: "$entry_date" },
          income: { $sum: "$entry_amount" }
        }
      }
    ]);

    // Expense month-wise
    const expenseByMonth = await VagetableExpense.aggregate([
      {
        $match: {
          groupId,
          entry_date: {
            $gte: new Date(year, 0, 1),
            $lte: new Date(year, 11, 31, 23, 59, 59)
          }
        }
      },
      {
        $group: {
          _id: { $month: "$entry_date" },
          expense: { $sum: "$entry_amount" }
        }
      }
    ]);

    const months = [];

    for (let m = 1; m <= 12; m++) {
      const income = incomeByMonth.find(i => i._id === m)?.income || 0;
      const expense = expenseByMonth.find(e => e._id === m)?.expense || 0;

      months.push({
        month: m,
        monthName: new Date(0, m - 1).toLocaleString('en', { month: 'long' }),
        income,
        expense,
        balance: income - expense
      });
    }

    res.render('host/YearDetails', {
      year,
      months
    });

  } catch (err) {
    console.error(err);
    res.redirect('/year-history');
  }
};


// deleteMoney
exports.deleteMoneyGroup = async (req, res) => {
  try {
    // ❌ member delete করতে পারবে না
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Access denied');
    }

    const title = req.params.title.toLowerCase();

    await MoneyAdd.deleteMany({
      entry_title: title,
      groupId: req.session.user.groupId// ✅ GROUP wise delete
    });

    res.redirect('/moneyAdded');

  } catch (error) {
    console.error(error);
    res.status(500).send('Card delete failed');
  }
};


exports.deleteExpenseByDate = async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Access denied');
    }

    const dateParam = new Date(req.params.date);

    const start = new Date(dateParam);
    start.setHours(0, 0, 0, 0);

    const end = new Date(dateParam);
    end.setHours(23, 59, 59, 999);

    await VagetableExpense.deleteMany({
      entry_date: { $gte: start, $lte: end },
      groupId: req.session.user.groupId// ✅ GROUP wise
    });

    res.redirect('/expentionAdded');

  } catch (error) {
    console.error(error);
    res.status(500).send('Expense delete failed');
  }
};


exports.deleteMealUser = async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Access denied');
    }

    const mealUserId = req.params.id;

    await MealUser.deleteOne({
      _id: mealUserId,
      groupId: req.session.user.groupId// ✅ only same group
    });

    res.redirect('/AddedMeal');

  } catch (error) {
    console.error(error);
    res.status(500).send('Meal user delete failed');
  }
};


exports.getGroupMembers = async (req, res) => {
  try {
    const groupId = req.session.user.groupId;

    const members = await User.find({ groupId })
      .select('name email role');

    res.render('host/groupMembers', {
      members,
      currentUser: req.session.user
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load members');
  }
};



exports.makeAdmin = async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Access denied');
    }

    await User.updateOne(
      { _id: req.params.id, groupId: req.session.user.groupId },
      { role: 'admin' }
    );

    res.redirect('/settings/members');

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update role');
  }
};


exports.removeMember = async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).send('Access denied');
    }

    await User.deleteOne({
      _id: req.params.id,
      groupId: req.session.user.groupId
    });

    res.redirect('/settings/members');

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to remove member');
  }
};


// singal list delete

exports.deleteSingleExpense = async (req, res) => {
    try {
        const id = req.params.id;


        await VagetableExpense.deleteOne({
            _id: id,
            groupId: req.session.user.groupId   // 🔐 safety
        });

        res.redirect('/expentionAdded');
    } catch (error) {
        console.error(error);
        res.status(500).send('Single expense delete failed');
    }
};

exports.deleteSingleMeal = async (req, res) => {
    try {        
        // const id = req.params.id;
        if (req.session.user.role !== 'admin') {
          return res.status(403).send('Access Denied')
        }
        const { userId, mealId } = req.params;


        await MealUser.updateOne(
            {
                _id: userId,
                groupId: req.session.user.groupId   // 🔐 safety
            },
            {
                $pull: {
                    meals: { _id: mealId }
                }
            }
        );

        res.redirect('/AddedMeal');
    } catch (error) {
        console.error(error);
        res.status(500).send('Meal delete failed');
    }
};


exports.deleteSingleMoney = async (req, res) => {
    try {
        
        if (req.session.user.role !== 'admin') {
          return res.status(403).send('Access Denied')
        }
        const id = req.params.id;
        await MoneyAdd.deleteOne({
            _id: id,
            groupId: req.session.user.groupId   // 🔐 group safety
        });

        res.redirect('/moneyAdded');
    } catch (error) {
        console.error(error);
        res.status(500).send('Money delete failed');
    }
};
