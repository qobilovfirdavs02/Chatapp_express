const { pool } = require('./db');

const users = {};
const deliveredMessages = new Set();

function initSocket(io) {
    io.on('connection', (socket) => {
        console.log('LOG: Foydalanuvchi ulandi, Socket ID:', socket.id);

        socket.on('setUsername', (username) => {
            if (username && typeof username === 'string') {
                users[socket.id] = username;
                console.log('LOG: Username o‘rnatildi:', username, 'Socket ID:', socket.id, 'Aktiv users:', Object.values(users));
                io.emit('userList', Object.values(users));
            } else {
                console.log('ERROR: Username noto‘g‘ri:', username);
            }
        });

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
                socket.emit('chat message', message);
            } catch (err) {
                console.error('ERROR: Bazaga saqlashda xatolik:', err.message);
            }
        });

        socket.on('reaction', (messageId, reaction) => {
            console.log('LOG: Reaksiya qo‘shildi:', messageId, reaction);
            io.emit('reaction_added', { messageId, reaction });
        });

        socket.on('disconnect', () => {
            console.log('LOG: Foydalanuvchi uzildi, Socket ID:', socket.id);
            delete users[socket.id];
            io.emit('userList', Object.values(users));
        });
    });
}

module.exports = { initSocket, users, deliveredMessages };