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
        const result = await db.query('SELECT * FROM users WHERE username = $1', [lowerCaseUsername]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isValid = await bcrypt.compare(password, user.password);
            
            if (isValid) {
                req.session.isLoggedIn = true;
                req.session.username = lowerCaseUsername; // Ensure username is stored
                req.session.isAdmin = user.is_admin || false;
                console.log('Session after login:', req.session); // Debug log
                res.redirect('/history');
            } else {
                res.render('login', { error: 'Invalid username or password', isLoggedIn: false });
            }
        } else {
            res.render('login', { error: 'Invalid username or password', isLoggedIn: false });
        }
    } catch (err) {
        console.error('Error:', err.stack);
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
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    const { date, time, type, caseNumber, analyst, shortDescription, additionalInfo, timeTaken, taskId } = req.body;
    const username = req.session.username;

    // Combine date and time into a single timestamp
    const dateTime = new Date(`${date}T${time}`);
    const timezoneOffset = dateTime.getTimezoneOffset();
    dateTime.setMinutes(dateTime.getMinutes() + timezoneOffset);

    try {
        // Validate submission type
        const validTypes = ['Case', 'Assistance', 'Project', 'Meeting'];
        if (!validTypes.includes(type)) {
            throw new Error('Invalid submission type');
        }

        // Start a transaction
        await db.query('BEGIN');

        // Insert the submission
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

        // If this was from a future task, mark it as completed
        if (taskId) {
            await db.query(
                'UPDATE future_tasks SET status = $1 WHERE id = $2 AND username = $3',
                ['Completed', taskId, username]
            );
        }

        await db.query('COMMIT');
        res.redirect('/history');
    } catch (err) {
        await db.query('ROLLBACK');
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

    // Get filter parameters
    const filterType = req.query.filterType || 'day';
    const currentDate = new Date().toISOString().split('T')[0];
    const startDate = req.query.startDate || currentDate;
    const monthDate = req.query.monthDate || currentDate.substring(0, 7);

    try {
        let query;
        let params = [username];

        if (filterType === 'month' && monthDate) {
            // For month filter, use DATE_TRUNC to compare months
            query = `
                SELECT *, 
                    (SELECT SUM(time_taken) 
                     FROM submissions 
                     WHERE username = $1 
                     AND TO_CHAR(date, 'YYYY-MM') = $2) as total_time
                FROM submissions 
                WHERE username = $1 
                AND TO_CHAR(date, 'YYYY-MM') = $2
                ORDER BY date DESC
            `;
            params.push(monthDate);
        } else {
            // Default to day filter
            query = `
                SELECT *, 
                    (SELECT SUM(time_taken) 
                     FROM submissions 
                     WHERE username = $1 
                     AND DATE(date) = $2) as total_time
                FROM submissions 
                WHERE username = $1 
                AND DATE(date) = $2
                ORDER BY date DESC
            `;
            params.push(startDate);
        }

        const submissionsResult = await db.query(query, params);

        res.render('history', {
            isLoggedIn: req.session.isLoggedIn,
            isAdmin: req.session.isAdmin,
            submissions: submissionsResult.rows,
            totalTime: submissionsResult.rows[0]?.total_time || 0,
            successMessage,
            filterType,
            currentDate,
            startDate,
            monthDate
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

    const { id, date, time, type, caseNumber, analyst, shortDescription, additionalInfo, timeTaken } = req.body;

    try {
        // Validate submission type
        const validTypes = ['Case', 'Assistance', 'Project', 'Meeting'];
        if (!validTypes.includes(type)) {
            throw new Error('Invalid submission type');
        }

        // Create date object from form inputs
        const dateTime = new Date(`${date}T${time}`);
        
        // Validate the date
        if (isNaN(dateTime.getTime())) {
            throw new Error('Invalid date/time format');
        }

        await db.query(
            `UPDATE submissions 
            SET date = $1,
                type = $2, 
                case_number = $3,
                analyst = $4,
                short_description = $5, 
                additional_info = $6,
                time_taken = $7
            WHERE id = $8`,
            [
                dateTime,
                type, 
                type === 'Case' ? caseNumber : null,
                type === 'Assistance' ? analyst : null,
                shortDescription, 
                additionalInfo,
                parseInt(timeTaken) || 0,
                id
            ]
        );
        
        req.session.successMessage = 'Submission updated successfully!';
        res.redirect('/history');
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).send(`Error updating submission: ${err.message}`);
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
    
    console.log('Current user:', username); // Debug log

    try {
        // First verify user exists
        const userCheck = await db.query(
            'SELECT username FROM users WHERE username = $1',
            [username]
        );
        
        console.log('User check result:', userCheck.rows); // Debug log

        if (userCheck.rows.length === 0) {
            throw new Error(`User not found: ${username}`);
        }

        await db.query(
            `INSERT INTO future_tasks (title, description, due_date, priority, username)
             VALUES ($1, $2, $3, $4, $5)`,
            [title, description, dueDate, priority, username]
        );
        res.redirect('/future-tasks');
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).render('error', { 
            error: 'Failed to create task. Please try logging in again.',
            isLoggedIn: req.session.isLoggedIn 
        });
    }
});

router.post('/delete-task', async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    const { taskId } = req.body;
    const username = req.session.username;

    try {
        await db.query(
            'DELETE FROM future_tasks WHERE id = $1 AND username = $2',
            [taskId, username]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error:', err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = (app) => {
    app.use('/', router);
};