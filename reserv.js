// Kerakli kutubxonalarni import qilish
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const multer = require('multer');

// Express ilovasini sozlash
const app = express();
app.use(cors()); // Cross-Origin so‘rovlarni yoqish
app.use(express.json()); // JSON so‘rovlarni qayta ishlash

// HTTP server va Socket.IO ni yaratish
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } }); // Barcha domenlardan ulanishga ruxsat

// Ma’lumotlar bazasi ulanishi (NeonDB)
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_IvTi7DPg2wOt@ep-restless-dawn-a80hwsr5-pooler.eastus2.azure.neon.tech/chatapp?sslmode=require',
});

// Foydalanuvchilar va xabarlar uchun o‘zgaruvchilar
const users = {}; // Socket ID -> username
const deliveredMessages = new Set(); // Yuborilgan xabarlar ID’lari
const resetCodes = {}; // Parol tiklash kodlari

// Jadval yaratish
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

// Email yuborish uchun Nodemailer sozlamasi
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'qobilovfirdavs2002@gmail.com', // Gmail manzilingiz
        pass: 'mwhqcmpfrdppskns', // Gmail App Password
    },
});

// Fayl yuklash uchun Multer sozlamasi
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// HTTP endpointlar
// Root endpoint
app.get('/', (req, res) => {
    res.json({ message: "Server ishlayapti!", status: "OK" });
});

// Ro‘yxatdan o‘tish
app.post('/register', async (req, res) => {
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

// Kirish
app.post('/login', async (req, res) => {
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

// Foydalanuvchilarni qidirish
app.get('/users', async (req, res) => {
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

// Xabarlar tarixini olish
app.get('/messages', async (req, res) => {
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

// Xabarni o‘chirish
app.delete('/messages/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [id]);
        io.emit('message_deleted', id);
        console.log('LOG: Xabar o‘chirildi, ID:', id);
        res.json({ message: 'Xabar o‘chirildi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Xabar o‘chirishda xatolik:', err.message);
        res.status(500).json({ message: 'Xabar o‘chirishda xatolik' });
    }
});

// Xabarni tahrirlash
app.put('/messages/:id', async (req, res) => {
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
        io.emit('message_edited', { id, content });
        console.log('LOG: Xabar tahrirlandi, ID:', id);
        res.json({ message: 'Xabar tahrirlandi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Xabar tahrirlashda xatolik:', err.message);
        res.status(500).json({ message: 'Xabar tahrirlashda xatolik' });
    }
});

// Fayl yuklash
app.post('/upload', upload.single('file'), async (req, res) => {
    const { sender, receiver } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;
    try {
        const result = await pool.query(
            'INSERT INTO messages(content, sender, receiver, type) VALUES($1, $2, $3, $4) RETURNING *',
            [fileUrl, sender, receiver, req.file.mimetype.startsWith('audio') ? 'audio' : req.file.mimetype.startsWith('video') ? 'video' : 'file']
        );
        const message = result.rows[0];
        io.emit('chat message', message);
        const receiverSocket = Object.keys(users).find(id => users[id] === receiver);
        if (receiverSocket) {
            io.to(receiverSocket).emit('message_delivered', message.id);
            deliveredMessages.add(message.id);
        }
        res.json({ message: 'Fayl yuklandi', fileUrl });
    } catch (err) {
        console.error('ERROR: Fayl yuklashda xatolik:', err.message);
        res.status(500).json({ message: 'Fayl yuklashda xatolik' });
    }
});

// Parolni tiklash uchun kod yuborish
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Email topilmadi', status: 'ERROR' });
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        resetCodes[email] = code;
        console.log('LOG: Tasdiqlash kodi yaratildi:', code);

        const mailOptions = {
            from: 'qobilovfirdavs2002@gmail.com',
            to: email,
            subject: 'Parolni Tiklash Kodingiz',
            text: `Sizning parolni tiklash kodingiz: ${code}. Uni 5 daqiqa ichida ishlating!`,
        };

        await transporter.sendMail(mailOptions);
        console.log('LOG: Email yuborildi:', email);
        res.json({ message: 'Tasdiqlash kodi emailga yuborildi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Email yuborishda xatolik:', err.message);
        res.status(500).json({ message: 'Email yuborishda xatolik', error: err.message });
    }
});

// Parolni yangilash
app.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    try {
        if (resetCodes[email] !== code) {
            return res.status(400).json({ message: 'Noto‘g‘ri tasdiqlash kodi', status: 'ERROR' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
        delete resetCodes[email];
        console.log('LOG: Parol yangilandi, Email:', email);
        res.json({ message: 'Parol muvaffaqiyatli yangilandi', status: 'OK' });
    } catch (err) {
        console.error('ERROR: Parol yangilashda xatolik:', err.message);
        res.status(500).json({ message: 'Parol yangilashda xatolik', error: err.message });
    }
});

// Socket.IO ulanishlari
io.on('connection', (socket) => {
    console.log('LOG: Foydalanuvchi ulandi, Socket ID:', socket.id);

    // Username o‘rnatish
    socket.on('setUsername', (username) => {
        if (username && typeof username === 'string') {
            users[socket.id] = username;
            console.log('LOG: Username o‘rnatildi:', username, 'Socket ID:', socket.id, 'Aktiv users:', Object.values(users));
            io.emit('userList', Object.values(users));
        } else {
            console.log('ERROR: Username noto‘g‘ri:', username);
        }
    });

    // Chat xabari
    socket.on('chat message', async (msg, senderId, receiverId) => {
        console.log('LOG: Xabar keldi:', msg, 'Kimdan:', senderId, 'Kimga:', receiverId);
        console.log('LOG: Aktiv users:', Object.values(users));
        try {
            const result = await pool.query(
                'INSERT INTO messages(content, sender, receiver, type) VALUES($1, $2, $3, $4) RETURNING *',
                [msg, senderId, receiverId, 'text']
            );
            const message = result.rows[0];
            const receiverSocket = Object.keys(users).find(id => users[id] === receiverId);
            if (receiverSocket) {
                socket.to(receiverSocket).emit('chat message', message);
                deliveredMessages.add(message.id);
                socket.to(receiverSocket).emit('message_delivered', message.id);
                console.log('LOG: Xabar yuborildi, Receiver Socket:', receiverSocket);
            } else {
                console.log('LOG: Qabul qiluvchi topilmadi, Aktiv users:', Object.values(users));
            }
            socket.emit('chat message', message); // Senderga qaytarish
        } catch (err) {
            console.error('ERROR: Bazaga saqlashda xatolik:', err.message);
        }
    });

    // Reaksiya qo‘shish
    socket.on('reaction', (messageId, reaction) => {
        console.log('LOG: Reaksiya qo‘shildi:', messageId, reaction);
        io.emit('reaction_added', { messageId, reaction });
    });

    // Ulanish uzilishi
    socket.on('disconnect', () => {
        console.log('LOG: Foydalanuvchi uzildi, Socket ID:', socket.id);
        delete users[socket.id];
        io.emit('userList', Object.values(users));
    });
});

// Serverni ishga tushirish
server.listen(3000, () => {
    console.log('LOG: Server 3000-portda ishlamoqda');
});

// Ma’lumotlar bazasi ulanishini tekshirish
pool.connect((err) => {
    if (err) console.error('ERROR: Neon bazasiga ulanishda xatolik:', err.message);
    else console.log('LOG: Neon bazasiga muvaffaqiyatli ulandi');
});