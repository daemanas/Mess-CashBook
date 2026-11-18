const isAuth = require('./isAuth');

module.exports = (req, res, next) => {
    isAuth(req, res, () => {
        const user = req.session.user;
        if (user.role !== 'admin' || !user.groupId) {
            return res.status(403).render('host/error', {
                status: 403,
                message: 'Administrator access required',
                hint: 'This page is only available to the mess administrator.'
            });
        }
        next();
    });
};
