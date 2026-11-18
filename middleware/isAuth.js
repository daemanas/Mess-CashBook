module.exports = (req, res, next) => {
    if (!req.session || !req.session.isLoggedIn || !req.session.user || !req.session.user.id) {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    }
    next();
};
