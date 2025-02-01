require('dotenv').config();
const mysql = require('mysql');

const connection = mysql.createConnection(process.env.MYSQL_URL);

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
        return;
    }
    console.log('Connected to the database.');
});

module.exports = connection;