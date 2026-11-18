const express = require('express');
const userRouter = express.Router();

const userController = require('../controller/userController');
const isAuth = require('../middleware/isAuth');
const isMess = require('../middleware/isMess');
const isAdmin = require('../middleware/isAdmin');

/* Dashboard */
userRouter.get('/', isAuth, userController.getIndex);

/* Income / contribution entries */
userRouter.get('/add-entry', isAuth, userController.getAddEntry);
userRouter.post('/add-entry', isAuth, userController.postAddEntry);

/* Expenses */
userRouter.get('/add-expense', isAuth, userController.getAddExpense);
userRouter.post('/add-expense', isAuth, userController.postAddExpense);

/* Meal entry and mutations — group admins; meal viewing — group accounts */
userRouter.get('/add-Meal', isAdmin, userController.getAddMeal);
userRouter.post('/add-Meal', isAdmin, userController.postAddMeal);
userRouter.get('/AddedMeal', isMess, userController.getAddedMeal);
userRouter.get('/meal-billing', isMess, userController.getMealBilling);
userRouter.get('/final-settlement', isMess, userController.getFinalSettlement);
userRouter.get('/finalSettlement/export/pdf', isAdmin, userController.getFinalSettlementPdf);
userRouter.get('/finalSettlement/export/excel', isAdmin, userController.getFinalSettlementExcel);
userRouter.post('/finalSettlement/email', isAdmin, userController.postEmailFinalSettlement);

/* Account & reporting */
userRouter.get(['/setting', '/settings'], isAuth, userController.getSetting);
userRouter.post('/settings/update-profile', isAuth, userController.postUpdateProfile);
userRouter.post('/settings/update-group', isAuth, userController.postUpdateGroup);
userRouter.post('/settings/change-password', isAuth, userController.postChangePassword);
userRouter.get('/reports', isAuth, userController.getReports);
userRouter.get('/transactions', isAuth, userController.getTransactions);
userRouter.get('/moneyAdded', isAuth, userController.getMoneyAdded);
userRouter.get('/expentionAdded', isAuth, userController.getExpenseAdded);
userRouter.get('/year-history', isAuth, userController.getYearHistory);
userRouter.get('/year-history/:year', isAuth, userController.getYearDetails);

/* Group cards / whole-day deletes */
userRouter.post('/money-delete-group/:title', isAuth, userController.deleteMoneyGroup);
userRouter.post('/expense-delete-date/:date', isAuth, userController.deleteExpenseByDate);

/* Single-record deletes */
userRouter.post('/expense-delete-single/:id', isAuth, userController.deleteSingleExpense);
userRouter.post('/money-delete-single/:id', isAuth, userController.deleteSingleMoney);

/* Meal ledger deletes — group admin enforced in middleware and controller */
userRouter.post('/meal-delete-user/:id', isAdmin, userController.deleteMealUser);
userRouter.post('/meal-delete-single/:userId/:mealId', isAdmin, userController.deleteSingleMeal);

/* Group members — group accounts can view; only admins can change roles */
userRouter.get('/settings/members', isMess, userController.getGroupMembers);
userRouter.post('/settings/members/:id/make-admin', isAdmin, userController.makeAdmin);
userRouter.post('/settings/members/:id/remove-admin', isAdmin, userController.removeAdminRole);
userRouter.post('/settings/members/:id/remove', isAdmin, userController.removeMember);

module.exports = userRouter;
