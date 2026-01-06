const express = require('express');
const userRouter = express.Router();

const userController = require('../controller/userController');
const isAuth = require('../middleware/isAuth');

userRouter.get('/',isAuth , userController.getIndex);
// userRouter.get('/deshboard', userController.getdeshboard);
userRouter.get('/add-entry',isAuth , userController.getAddEntry);
userRouter.post('/add-entry', isAuth , userController.postAddEntry);

userRouter.get('/add-expense', isAuth , userController.getAddExpense);
userRouter.post('/add-expense', isAuth , userController.postAddExpense);

userRouter.get('/add-Meal',isAuth , userController.getAddMeal);
userRouter.post('/add-Meal', isAuth , userController.postAddMeal);

// userRouter.get('/MoneyAdd/:memberId', userController.getNewMoneyAdd);
// userRouter.post('/MoneyAdd', userController.postNewMoneyAdd);

userRouter.get('/setting', isAuth ,userController.getSetting)
userRouter.get('/reports', userController.getReports);
userRouter.get('/transactions', userController.getTransactions);
userRouter.get('/moneyAdded', userController.getMoneyAdded);
userRouter.get('/expentionAdded', userController.getExpenseAdded);
userRouter.get('/AddedMeal', userController.getAddedMeal);
userRouter.get('/getMealBilling', userController.getMealBilling);
userRouter.get('/getFinalSettlement',  userController.getFinalSettlement);


// deleted routes
// userRouter.post('/delete-entry', isAuth , userController.postDeleteEntry);
// userRouter.post('/delete-expense', isAuth , userController.postDeleteExpense);
// userRouter.post('/delete-meal', isAuth , userController.postDeleteMeal);


userRouter.post(
    '/money-delete-group/:title',
    userController.deleteMoneyGroup
);

userRouter.post(
    '/expense-delete-date/:date',
    userController.deleteExpenseByDate
);

userRouter.post(
    '/meal-delete-user/:id',
    userController.deleteMealUser
);



module.exports = userRouter;