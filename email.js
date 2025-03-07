const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { pool } = require('./db');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'qobilovfirdavs2002@gmail.com',
        pass: 'mwhqcmpfrdppskns',
    },
});

const resetCodes = {};

async function sendResetCode(req, res) {
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
}

async function resetPassword(req, res) {
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
}

module.exports = { sendResetCode, resetPassword };