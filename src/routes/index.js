const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const user = results[0];
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) throw err;

                if (isMatch) {
                    // Set session and redirect to homepage
                    req.session.user = user;
                    res.redirect('/');
                } else {
                    res.send('Incorrect password');
                }
            });
        } else {
            res.send('User not found');
        }
    });
});

router.post('/register', (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) throw err;

        db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err, results) => {
            if (err) throw err;
            res.redirect('/login');
        });
    });
});

module.exports = (app) => {
    app.use('/', router);
};