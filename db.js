const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_IvTi7DPg2wOt@ep-restless-dawn-a80hwsr5-pooler.eastus2.azure.neon.tech/chatapp?sslmode=require',
});

pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        sender VARCHAR(50) NOT NULL,
        receiver VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(10) DEFAULT 'text'
    );
`).catch(err => console.error('ERROR: Jadval yaratishda xatolik:', err.message));

module.exports = { pool };