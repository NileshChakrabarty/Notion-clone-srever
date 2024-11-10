const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const emailValidator = require('email-validator');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MySQL Database connection pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    connectionLimit: 10, // Set the maximum number of connections
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10000,
});

// Test Database Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MySQL database');
    connection.release();
});

// Basic route for testing
app.get("/", (req, res) => {
    res.send("Hello");
});

// Setup Users Table
app.get('/api/setup-users-table', (req, res) => {
    const createUsersTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.query(createUsersTableQuery, (err) => {
        if (err) {
            return res.status(500).json({ message: 'Error creating users table', error: err });
        }
        res.status(200).json({ message: 'Users table created successfully' });
    });
});

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body; // Include username

    // Validate inputs
    if (!email || !emailValidator.validate(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    

    try {
        // Check if user already exists
        const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10); // Use await here
        const insertUserQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'; // Include username
        await db.promise().query(insertUserQuery, [username, email, hashedPassword]); // Use await for the insert

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate inputs
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

// Setup Database and Notes Table
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
            return res.status(500).json({ message: 'Error creating table', error: err });
        }
        res.status(200).json({ message: 'Notes table created successfully' });
    });
});

// 1. Get All Notes (Read)
app.get('/api/notes', async (req, res) => {
    const query = 'SELECT * FROM Notes';
    try {
        const [results] = await db.promise().query(query);
        res.json(results);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 2. Get Note by ID (Read)
app.get('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM Notes WHERE id = ?';
    try {
        const [results] = await db.promise().query(query, [id]);
        if (results.length === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json(results[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 3. Create a New Note (Create)
app.post('/api/notes', async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
    }
    const query = 'INSERT INTO Notes (title, content) VALUES (?, ?)';
    try {
        const [results] = await db.promise().query(query, [title, content]);
        res.status(201).json({ id: results.insertId, title, content });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. Update a Note (Update)
app.put('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
    }
    const query = 'UPDATE Notes SET title = ?, content = ? WHERE id = ?';
    try {
        const [results] = await db.promise().query(query, [title, content, id]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json({ message: 'Note updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 5. Delete a Note (Delete)
app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM Notes WHERE id = ?';
    try {
        const [results] = await db.promise().query(query, [id]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Note not found' });
        }
        res.json({ message: 'Note deleted successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
