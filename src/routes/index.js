const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', { isLoggedIn: req.session.isLoggedIn });
});

router.get('/login', (req, res) => {
    const successMessage = req.session.successMessage;
    delete req.session.successMessage; // Clear the success message after displaying it
    res.render('login', { isLoggedIn: req.session.isLoggedIn, successMessage });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const lowerCaseUsername = username.toLowerCase();

    try {
        const result = await db.query('SELECT * FROM users WHERE LOWER(username) = $1', [lowerCaseUsername]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                req.session.isLoggedIn = true;
                req.session.username = username; // Store the username in the session
                req.session.isAdmin = user.is_admin; // Store the admin status in the session
                res.redirect('/');
            } else {
                res.render('login', { error: 'Incorrect username or password', isLoggedIn: req.session.isLoggedIn });
            }
        } else {
            res.render('login', { error: 'Incorrect username or password', isLoggedIn: req.session.isLoggedIn });
        }
    } catch (err) {
        console.error('Error querying the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/register', (req, res) => {
    res.render('register', { isLoggedIn: req.session.isLoggedIn });
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const lowerCaseUsername = username.toLowerCase();
    const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{10,}$/;

    if (!passwordPattern.test(password)) {
        return res.render('register', { error: 'Password must be at least 10 characters long and include at least 1 number, 1 uppercase letter, and 1 symbol.', isLoggedIn: req.session.isLoggedIn });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [lowerCaseUsername, hash]);
        req.session.successMessage = 'Registration successful! Please log in.';
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

router.get('/submission', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }
    res.render('submission', { isLoggedIn: req.session.isLoggedIn });
});

router.post('/submission', async (req, res) => {
    const { date, type, shortDescription, additionalInfo } = req.body;
    const username = req.session.username;

    try {
        await db.query('INSERT INTO submissions (date, type, short_description, additional_info, username) VALUES ($1, $2, $3, $4, $5)', [date, type, shortDescription, additionalInfo, username]);
        res.redirect('/');
    } catch (err) {
        console.error('Error inserting into the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/history', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    const username = req.session.username;
    const successMessage = req.session.successMessage;
    delete req.session.successMessage; // Clear the success message after displaying it

    try {
        const result = await db.query('SELECT * FROM submissions WHERE username = $1 ORDER BY date DESC', [username]);
        res.render('history', { isLoggedIn: req.session.isLoggedIn, isAdmin: req.session.isAdmin, submissions: result.rows, successMessage });
    } catch (err) {
        console.error('Error querying the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/delete-submission', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send('Forbidden');
    }

    const { id } = req.body;

    try {
        await db.query('DELETE FROM submissions WHERE id = $1', [id]);
        req.session.successMessage = 'Submission deleted successfully!';
        res.redirect('/history');
    } catch (err) {
        console.error('Error deleting from the database:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = (app) => {
    app.use('/', router);
};