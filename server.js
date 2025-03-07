const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { initSocket } = require('./socket');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use('/', apiRoutes);
initSocket(io);

server.listen(3000, () => {
    console.log('LOG: Server 3000-portda ishlamoqda');
});

pool.connect((err) => {
    if (err) console.error('ERROR: Neon bazasiga ulanishda xatolik:', err.message);
    else console.log('LOG: Neon bazasiga muvaffaqiyatli ulandi');
});