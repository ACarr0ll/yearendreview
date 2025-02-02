const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

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
                req.session.user = user;
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

module.exports = (app) => {
    app.use('/', router);
};