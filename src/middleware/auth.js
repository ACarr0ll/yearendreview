module.exports = (req, res, next) => {
    res.locals.isLoggedIn = req.session && req.session.user;
    next();
};