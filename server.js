const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Sadece istemci dosyalarını yayınla (server.js, package.json, .git, yedek/ gizli kalır)
const PUBLIC_FILES = ['index.html', 'game.js', 'style.css'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
PUBLIC_FILES.forEach((file) => {
    app.get('/' + file, (req, res) => res.sendFile(path.join(__dirname, file)));
});

const rooms = new Map();

const ARENA_WIDTH = 5000;
const ARENA_HEIGHT = 5000;
const INITIAL_LENGTH = 15;
const MAX_LENGTH = 2000;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function cleanStr(value, max) {
    return String(value == null ? '' : value)
        .replace(/[<>&"'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function isNum(n) {
    return typeof n === 'number' && Number.isFinite(n);
}

function spawnFood(customX, customY, customRadius, customColor) {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: customX !== undefined ? customX : Math.random() * (ARENA_WIDTH - 100) + 50,
        y: customY !== undefined ? customY : Math.random() * (ARENA_HEIGHT - 100) + 50,
        radius: customRadius !== undefined ? customRadius : 4 + Math.random() * 2.5,
        color: customColor || ['#ff3366', '#33ff66', '#3366ff', '#ffff33', '#ff33ff', '#33ffff', '#ff9933'][Math.floor(Math.random() * 7)]
    };
}

function leaveRoom(socket) {
    const roomName = socket.data.room;
    if (!roomName) return;
    socket.leave(roomName);
    socket.data.room = null;

    const room = rooms.get(roomName);
    if (!room) return;

    room.players.delete(socket.id);
    io.to(roomName).emit('playerRemoved', socket.id);

    if (room.adminId === socket.id) {
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        if (room.players.size > 0) {
            const nextAdminId = room.players.keys().next().value;
            room.adminId = nextAdminId;
            io.to(nextAdminId).emit('makeAdmin');
        } else if (!roomSockets || roomSockets.size === 0) {
            rooms.delete(roomName);
        } else {
            room.adminId = null; // oda boş, ilk giren yeniden admin olur
        }
    }
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);
    socket.data.room = null;

    socket.on('joinRoom', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const roomName = cleanStr(payload.roomName, 30);
        const playerName = cleanStr(payload.playerName, 24) || 'Yılan';
        const color = COLOR_RE.test(payload.color) ? payload.color : '#00ffcc';
        if (!roomName) return;

        // Daha önce bir odadaysa (ör. ölüp tekrar oynuyorsa) önce çık
        leaveRoom(socket);

        socket.join(roomName);
        socket.data.room = roomName;

        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                name: roomName,
                adminId: socket.id,
                players: new Map(),
                foods: Array.from({ length: 400 }, () => spawnFood())
            });
        }

        const room = rooms.get(roomName);
        if (!room.adminId) room.adminId = socket.id;
        const isAdmin = room.adminId === socket.id;

        const playerData = {
            id: socket.id,
            name: playerName,
            color: color,
            x: 500 + Math.random() * (ARENA_WIDTH - 1000),
            y: 500 + Math.random() * (ARENA_HEIGHT - 1000),
            angle: 0,
            length: INITIAL_LENGTH,
            isBoosting: false,
            isAdmin: isAdmin
        };

        room.players.set(socket.id, playerData);

        socket.emit('init', {
            id: socket.id,
            players: Array.from(room.players.values()),
            foods: room.foods,
            arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
            isAdmin: isAdmin
        });

        socket.to(roomName).emit('playerJoined', playerData);
    });

    socket.on('updatePosition', ({ data } = {}) => {
        const room = rooms.get(socket.data.room);
        if (!room || !room.players.has(socket.id) || !data || typeof data !== 'object') return;

        const player = room.players.get(socket.id);
        // Sadece izin verilen alanları, doğrulayarak kabul et
        if (isNum(data.x)) player.x = Math.max(0, Math.min(ARENA_WIDTH, data.x));
        if (isNum(data.y)) player.y = Math.max(0, Math.min(ARENA_HEIGHT, data.y));
        if (isNum(data.angle)) player.angle = data.angle;
        if (isNum(data.length)) player.length = Math.max(1, Math.min(MAX_LENGTH, Math.floor(data.length)));
        player.isBoosting = data.isBoosting === true;
        if (Array.isArray(data.segments)) {
            player.segments = data.segments.slice(0, 300);
        }

        socket.to(socket.data.room).emit('playerUpdated', player);
    });

    socket.on('dropFood', (payload) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (!room || !room.players.has(socket.id) || !payload) return;
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!isNum(x) || !isNum(y)) return;
        if (x < 0 || x > ARENA_WIDTH || y < 0 || y > ARENA_HEIGHT) return;

        const color = COLOR_RE.test(payload.color) ? payload.color : '#00ffcc';
        const food = spawnFood(x, y, 4, color);
        room.foods.push(food);
        if (room.foods.length > 1000) {
            room.foods.shift();
        }
        io.to(roomName).emit('foodsAdded', [food]);
    });

    socket.on('foodEaten', ({ foodId } = {}) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (!room || !room.players.has(socket.id)) return;

        const player = room.players.get(socket.id);
        const foodIndex = room.foods.findIndex((f) => f.id === foodId);
        if (foodIndex === -1) return; // zaten yenmiş: tekrar sayılmaz

        const food = room.foods[foodIndex];
        if (Math.hypot(food.x - player.x, food.y - player.y) > 200) return; // çok uzaktan yeme = hile

        room.foods.splice(foodIndex, 1);
        const newFood = spawnFood();
        room.foods.push(newFood);
        io.to(roomName).emit('foodUpdate', { eatenId: foodId, newFood: newFood });
    });

    socket.on('playerDied', (payload) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (room && room.players.has(socket.id)) {
            const player = room.players.get(socket.id);
            room.players.delete(socket.id); // ölen oyuncu artık yeni girenlere gönderilmez
            socket.to(roomName).emit('playerRemoved', socket.id);

            // Ölen yılanın segmentleri üzerinden yem saçma
            if (payload && Array.isArray(payload.drops) && payload.drops.length > 0) {
                const added = [];
                const color = player.color || '#ff3366';
                const limit = Math.min(payload.drops.length, 120);
                for (let i = 0; i < limit; i++) {
                    const d = payload.drops[i];
                    if (d && isNum(d.x) && isNum(d.y)) {
                        const jitterX = d.x + (Math.random() - 0.5) * 20;
                        const jitterY = d.y + (Math.random() - 0.5) * 20;
                        const fd = spawnFood(
                            Math.max(20, Math.min(ARENA_WIDTH - 20, jitterX)),
                            Math.max(20, Math.min(ARENA_HEIGHT - 20, jitterY)),
                            5 + Math.random() * 3,
                            color
                        );
                        room.foods.push(fd);
                        added.push(fd);
                    }
                }
                if (added.length > 0) {
                    while (room.foods.length > 1000) {
                        room.foods.shift();
                    }
                    io.to(roomName).emit('foodsAdded', added);
                }
            }
        }
    });

    socket.on('sendChat', (payload) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (!room || !room.players.has(socket.id) || !payload) return;
        const text = String(payload.text || '').slice(0, 30).trim();
        if (!text) return;
        io.to(roomName).emit('playerChat', {
            id: socket.id,
            text: text
        });
    });

    socket.on('closeRoom', () => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (room && room.adminId === socket.id) {
            io.to(roomName).emit('roomClosed');
            rooms.delete(roomName);
        }
    });

    socket.on('disconnecting', () => {
        leaveRoom(socket);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
