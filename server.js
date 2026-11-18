require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;

const rootDir = require('./util/pathUtil');
const User = require('./models/User');
const { buildAccountView } = require('./util/account');
const userRouter = require('./router/userRouter');
const authRouter = require('./router/authRouter');

const app = express();

/* =========================
   VIEW ENGINE
========================= */
app.set('view engine', 'ejs');
app.set('views', 'views');

/* =========================
   STATIC & BODY PARSER
========================= */
app.use(express.static(path.join(rootDir, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =========================
   SESSION
========================= */
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
    app.set('trust proxy', 1);
}

app.use(
    session({
        name: 'cb.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            collectionName: 'sessions',
            ttl: 60 * 60 * 24
        }),
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction,
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

/* =========================
   ACCOUNT CONTEXT
   The authenticated identity is always re-read from the database, so a stale
   or tampered session cookie can never grant access to another group's data.
========================= */
const guests = buildAccountView(null);

app.use(async (req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = null;
    res.locals.account = guests;

    if (!req.session || !req.session.isLoggedIn || !req.session.user || !req.session.user.id) {
        return next();
    }

    try {
        const freshUser = await User.findById(req.session.user.id)
            .select('name email role groupId messName isVerified')
            .lean();

        if (!freshUser) {
            // Account was removed while the session was still alive.
            return req.session.destroy(() => next());
        }

        req.session.user = {
            id: String(freshUser._id),
            name: freshUser.name,
            email: freshUser.email,
            role: freshUser.role,
            groupId: freshUser.groupId,
            messName: freshUser.messName || null
        };

        res.locals.user = req.session.user;
        res.locals.account = buildAccountView(req.session.user);
    } catch (error) {
        // Keep the app usable during a temporary database hiccup.
        console.error('Account refresh failed:', error.message);
        res.locals.user = req.session.user;
        res.locals.account = buildAccountView(req.session.user);
    }

    next();
});

/* =========================
   ROUTES
========================= */
app.use(authRouter);
app.use(userRouter);

app.use((req, res) => {
    res.status(404).render('host/error', {
        status: 404,
        message: 'We could not find that page',
        hint: 'The link may be outdated, or the page may have moved.'
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('host/error', {
        status: 500,
        message: 'Something went wrong',
        hint: 'Please try again. If the problem continues, sign out and back in.'
    });
});

/* =========================
   DATABASE + SERVER
========================= */
const PORT = process.env.PORT || 3000;

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('MongoDB connection failed', error);
    });

module.exports = app;
