const isAuth = require('./isAuth');

/**
 * Mess-only pages (meals, billing, settlement, members).
 * Personal accounts have no groupId and must never reach these routes,
 * even by typing the URL manually.
 */
module.exports = (req, res, next) => {
    isAuth(req, res, () => {
        const user = req.session.user;
        const isMess = ['admin', 'member'].includes(user.role) && Boolean(user.groupId);

        if (!isMess) {
            return res.status(403).render('host/error', {
                status: 403,
                message: 'Not available for personal accounts',
                hint: 'Meal and group features belong to Mess / Group accounts. Open Settings to review your account type.'
            });
        }
        next();
    });
};
