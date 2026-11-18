const isAuth = require('./isAuth');
const User = require('../models/User');

/**
 * Mess-only pages (meals, billing, settlement, members).
 * Personal accounts have no groupId and must never reach these routes,
 * even by typing the URL manually.
 */
module.exports = (req, res, next) => {
    isAuth(req, res, () => {
        const sessionUser = req.session.user;
        User.findById(sessionUser.id)
            .select('name email role groupId messName isVerified')
            .lean()
            .then(account => {
                if (!account || !account.isVerified) {
                    return res.status(403).render('host/error', {
                        status: 403,
                        message: 'Your group account is unavailable or unverified.',
                        hint: 'Contact your group admin if you believe this is a mistake.'
                    });
                }
                if (!['admin', 'member'].includes(account.role) || !account.groupId) {
                    return res.status(403).render('host/error', {
                        status: 403,
                        message: 'Not available for personal accounts',
                        hint: 'Meal and group features belong to Mess / Group accounts. Open Settings to review your account type.'
                    });
                }

                req.session.user = {
                    ...sessionUser,
                    name: account.name,
                    email: account.email,
                    role: account.role,
                    groupId: account.groupId,
                    messName: account.messName || null
                };
                return next();
            })
            .catch(next);
    });
};
