const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', { isLoggedIn: req.session.isLoggedIn });
});

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                req.session.isLoggedIn = true;
                res.redirect('/');
            } else {
                res.send('Incorrect password');
            }
        } else {
            res.send('User not found');
        }
    } catch (err) {
        console.error('Error querying the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const hash = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
        res.redirect('/login');
    } catch (err) {
        console.error('Error inserting into the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/');
    });
});

module.exports = (app) => {
    app.use('/', router);
};