const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { sendResetCode, resetPassword } = require('../email');
const { uploadFile, upload } = require('../upload');

const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: "Server ishlayapti!", status: "OK" });
});

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
            [username, email, hashedPassword]
        );
        console.log('LOG: Foydalanuvchi ro‘yxatdan o‘tdi:', result.rows[0].username);
        res.json({ message: 'Ro‘yxatdan o‘tildi!', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Ro‘yxatdan o‘tishda xatolik:', err.message);
        res.status(500).json({ message: 'Ro‘yxatdan o‘tishda xatolik', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Foydalanuvchi topilmadi', status: 'ERROR' });
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            console.log('LOG: Foydalanuvchi kirdi:', username);
            res.json({ message: 'Kirish muvaffaqiyatli!', status: 'OK', username: username });
        } else {
            res.status(400).json({ message: 'Parol xato', status: 'ERROR' });
        }
    } catch (err) {
        console.error('ERROR: Kirishda xatolik:', err.message);
        res.status(500).json({ message: 'Kirishda xatolik', error: err.message });
    }
});

router.get('/users', async (req, res) => {
    const { search } = req.query;
    try {
        const result = await pool.query(
            'SELECT username FROM users WHERE username ILIKE $1',
            [`%${search}%`]
        );
        console.log('LOG: Qidiruv natijasi:', result.rows);
        res.json(result.rows.map(row => row.username));
    } catch (err) {
        console.error('ERROR: Qidiruvda xatolik:', err.message);
        res.status(500).json({ message: 'Qidiruvda xatolik', error: err.message });
    }
});

router.get('/messages', async (req, res) => {
    const { sender, receiver } = req.query;
    try {
        const result = await pool.query(
            'SELECT * FROM messages WHERE (sender = $1 AND receiver = $2) OR (sender = $2 AND receiver = $1) ORDER BY created_at ASC',
            [sender, receiver]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('ERROR: Xabarlar tarixini olishda xatolik:', err.message);
        res.status(500).json({ message: 'Xabarlar tarixini olishda xatolik' });
    }
});

router.delete('/messages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [id]);
        req.io.emit('message_deleted', id);
        console.log('LOG: Xabar o‘chirildi, ID:', id);
        res.json({ message: 'Xabar o‘chirildi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Xabar o‘chirishda xatolik:', err.message);
        res.status(500).json({ message: 'Xabar o‘chirishda xatolik' });
    }
});

router.put('/messages/:id', async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
        const result = await pool.query('SELECT created_at FROM messages WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Xabar topilmadi', status: 'ERROR' });
        }
        const createdAt = new Date(result.rows[0].created_at);
        const now = new Date();
        const diffMinutes = (now - createdAt) / 1000 / 60;
        if (diffMinutes > 30) {
            return res.status(403).json({ message: '30 daqiqadan oshgan xabarni tahrirlab bo‘lmaydi', status: 'ERROR' });
        }
        await pool.query('UPDATE messages SET content = $1 WHERE id = $2', [content, id]);
        req.io.emit('message_edited', { id, content });
        console.log('LOG: Xabar tahrirlandi, ID:', id);
        res.json({ message: 'Xabar tahrirlandi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Xabar tahrirlashda xatolik:', err.message);
        res.status(500).json({ message: 'Xabar tahrirlashda xatolik' });
    }
});

router.post('/upload', upload.single('file'), uploadFile);

router.post('/forgot-password', sendResetCode);
router.post('/reset-password', resetPassword);

// io ni middleware orqali uzatish
router.use((req, res, next) => {
    req.io = req.app.get('io');
    next();
});

module.exports = router;