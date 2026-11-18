const isMess = require('./isMess');

module.exports = (req, res, next) => {
    isMess(req, res, () => {
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
