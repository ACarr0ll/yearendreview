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

    // Get current date and time
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    res.render('submission', { 
        isLoggedIn: req.session.isLoggedIn,
        currentDate: currentDate,
        currentTime: currentTime
    });
});

router.post('/submission', async (req, res) => {
    const { date, time, type, caseNumber, analyst, shortDescription, additionalInfo, timeTaken } = req.body;
    const username = req.session.username;

    // Combine date and time into a single timestamp
    const dateTime = new Date(`${date}T${time}`);

    try {
        await db.query(
            `INSERT INTO submissions 
            (date, type, case_number, analyst, short_description, additional_info, time_taken, username) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [dateTime, type, 
             type === 'Case' ? caseNumber : null,
             type === 'Assistance' ? analyst : null,
             shortDescription, additionalInfo, 
             timeTaken, username]
        );
        res.redirect('/history');
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/history', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    const username = req.session.username;
    const successMessage = req.session.successMessage;
    delete req.session.successMessage;

    const { startDate, monthDate, filterType } = req.query;
    let query = 'SELECT * FROM submissions WHERE username = $1';
    const queryParams = [username];

    if (filterType === 'month' && monthDate) {
        const year = new Date().getFullYear();
        query += ' AND DATE_TRUNC(\'month\', date) = DATE_TRUNC(\'month\', $2::date)';
        queryParams.push(`${year}-${monthDate}-01`);
    } else if (startDate) {
        query += ' AND DATE(date) = $2';
        queryParams.push(startDate);
    } else {
        query += ' AND DATE(date) = CURRENT_DATE';
    }

    query += ' ORDER BY date DESC';

    try {
        const result = await db.query(query, queryParams);
        res.render('history', { 
            isLoggedIn: req.session.isLoggedIn, 
            isAdmin: req.session.isAdmin, 
            submissions: result.rows,
            successMessage,
            currentDate: new Date().toISOString().split('T')[0],
            filterType: filterType || 'day'
        });
    } catch (err) {
        console.error('Error:', err.stack);
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

router.get('/edit-submission', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/login');
    }

    const { id } = req.query;
    try {
        const result = await db.query('SELECT * FROM submissions WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.redirect('/history');
        }
        res.render('edit-submission', { 
            isLoggedIn: req.session.isLoggedIn,
            submission: result.rows[0]
        });
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/edit-submission', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send('Forbidden');
    }

    const { id, date, type, caseNumber, analyst, shortDescription, additionalInfo } = req.body;

    try {
        await db.query(
            `UPDATE submissions 
            SET date = $1, 
                type = $2, 
                case_number = $3,
                analyst = $4,
                short_description = $5, 
                additional_info = $6 
            WHERE id = $7`,
            [
                date, 
                type, 
                type === 'Case' ? caseNumber : null,
                type === 'Assistance' ? analyst : null,
                shortDescription, 
                additionalInfo, 
                id
            ]
        );
        req.session.successMessage = 'Submission updated successfully!';
        res.redirect('/history');
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/future-tasks', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    try {
        const result = await db.query(
            'SELECT * FROM future_tasks WHERE username = $1 ORDER BY due_date ASC',
            [req.session.username]
        );
        res.render('future-tasks', { 
            isLoggedIn: req.session.isLoggedIn,
            tasks: result.rows
        });
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/future-tasks', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    const { title, description, dueDate, priority } = req.body;
    const username = req.session.username;

    try {
        // First verify user exists
        const userCheck = await db.query(
            'SELECT username FROM users WHERE username = $1',
            [username]
        );

        if (userCheck.rows.length === 0) {
            throw new Error('User not found');
        }

        // Then insert the task
        await db.query(
            `INSERT INTO future_tasks (title, description, due_date, priority, username)
             VALUES ($1, $2, $3, $4, $5)`,
            [title, description, dueDate, priority, username]
        );
        res.redirect('/future-tasks');
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = (app) => {
    app.use('/', router);
};