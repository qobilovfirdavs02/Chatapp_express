const multer = require('multer');
const { pool } = require('./db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

async function uploadFile(req, res) {
    const { sender, receiver } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;
    try {
        const result = await pool.query(
            'INSERT INTO messages(content, sender, receiver, type) VALUES($1, $2, $3, $4) RETURNING *',
            [fileUrl, sender, receiver, req.file.mimetype.startsWith('audio') ? 'audio' : req.file.mimetype.startsWith('video') ? 'video' : 'file']
        );
        const message = result.rows[0];
        req.io.emit('chat message', message);
        const { users, deliveredMessages } = require('./socket');
        const receiverSocket = Object.keys(users).find(id => users[id] === receiver);
        if (receiverSocket) {
            req.io.to(receiverSocket).emit('message_delivered', message.id);
            deliveredMessages.add(message.id);
        }
        res.json({ message: 'Fayl yuklandi', fileUrl });
    } catch (err) {
        console.error('ERROR: Fayl yuklashda xatolik:', err.message);
        res.status(500).json({ message: 'Fayl yuklashda xatolik' });
    }
}

module.exports = { upload, uploadFile };