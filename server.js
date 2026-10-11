

require('dotenv').config(); // 🔥 MUST be on top

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;

const rootDir = require('./util/pathUtil');
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
app.use(
    session({
        secret: process.env.SESSION_SECRET, // 🔐 env
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI, // 🔐 env
            collectionName: 'sessions'
        }),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
); 

app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.session.user || null;
    next();
});

/* =========================
   ROUTES
========================= */
app.use(authRouter);
app.use(userRouter);

/* error */ 

app.use((req, res) => {
  res.status(404).render('host/error', {
    message: 'Page not found'
  });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('host/error', {
        message: 'Something went wrong. Please try again.'
    });
});


/* =========================
   DATABASE + SERVER
========================= */
const PORT = process.env.PORT || 3000;

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('❌ MongoDB connection failed', error);
    });
