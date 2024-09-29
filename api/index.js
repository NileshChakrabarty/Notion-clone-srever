
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const emailValidator = require('email-validator');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());

// MySQL Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

// Connect to MySQL
db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MySQL database');
});
app.get('/api/setup-users-table', (req, res) => {
    // SQL query to create users table
    const createUsersTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    // Execute the query
    db.query(createUsersTableQuery, (err) => {
        if (err) {
            return res.status(500).json({ message: 'Error creating users table', error: err });
        }
        res.status(200).json({ message: 'Users table created successfully' });
    });
});

// Register endpoint
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;

    // Validate email
    if (!email || !emailValidator.validate(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password
    if (!password) {
        return res.status(400).json({ message: 'Password cannot be empty' });
    }

    const checkUserQuery = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserQuery, [email], (err, result) => {
        if (err) {
            return res.status(500).json({ message: 'Server error', error: err });
        }
        if (result.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                return res.status(500).json({ message: 'Error hashing password', error: err });
            }

            const insertUserQuery = 'INSERT INTO users (email, password) VALUES (?, ?)';
            db.query(insertUserQuery, [email, hashedPassword], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: 'Database error', error: err });
                }
                res.status(201).json({ message: 'User registered successfully' });
            });
        });
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !emailValidator.validate(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    if (!password) {
        return res.status(400).json({ message: 'Password cannot be empty' });
    }

    const query = 'SELECT * FROM users WHERE email = ?';
    db.query(query, [email], (err, result) => {
        if (err) {
            return res.status(500).json({ message: 'Server error', error: err });
        }
        if (result.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }

        const user = result[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: 'Error comparing passwords', error: err });
            }
            if (isMatch) {
                return res.json({ message: 'Login successful' });
            } else {
                return res.status(400).json({ message: 'Invalid credentials' });
            }
        });
    });
});
app.get('/api/setup-database', (req, res) => {
    // Query to create database if it doesn't exist
    const createDatabaseQuery = 'CREATE DATABASE IF NOT EXISTS notesApp';
    
    // Query to use the database
    const useDatabaseQuery = 'USE notesApp';
    
    // Query to create Notes table
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS Notes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    // Execute the queries
    db.query(createDatabaseQuery, (err) => {
        if (err) {
            return res.status(500).json({ message: 'Error creating database', error: err });
        }
        db.query(useDatabaseQuery, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error selecting database', error: err });
            }
            db.query(createTableQuery, (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Error creating table', error: err });
                }
                res.status(200).json({ message: 'Database and table created successfully' });
            });
        });
    });
});
// 1. Get All Notes (Read)
app.get('/api/notes', (req, res) => {
    const query = 'SELECT * FROM Notes';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// 2. Get Note by ID (Read)
app.get('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM Notes WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json(results[0]);
    });
});

// 3. Create a New Note (Create)
app.post('/api/notes', (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
    }
    const query = 'INSERT INTO Notes (title, content) VALUES (?, ?)';
    db.query(query, [title, content], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: results.insertId, title, content });
    });
});

// 4. Update a Note (Update)
app.put('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
    }
    const query = 'UPDATE Notes SET title = ?, content = ? WHERE id = ?';
    db.query(query, [title, content, id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json({ message: 'Note updated successfully' });
    });
});

// 5. Delete a Note (Delete)
app.delete('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM Notes WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json({ message: 'Note deleted successfully' });
    });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});