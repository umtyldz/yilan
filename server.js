const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

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

const POWER_TYPES = ['magnet', 'ghost', 'titan', 'speed'];
function spawnPowerUp() {
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    return {
        id: 'pw_' + Math.random().toString(36).substr(2, 9),
        type: type,
        x: 200 + Math.random() * (ARENA_WIDTH - 400),
        y: 200 + Math.random() * (ARENA_HEIGHT - 400),
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        radius: 12
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
            room.adminId = null;
        }
    }
}

// Power-up hareket döngüsü (kaçış fiziği)
setInterval(() => {
    rooms.forEach((room, roomName) => {
        if (!room.powerUps) room.powerUps = [];
        // Maksimum 3 güç küresi
        while (room.powerUps.length < 3) {
            room.powerUps.push(spawnPowerUp());
        }

        const playersArr = Array.from(room.players.values());
        for (const pw of room.powerUps) {
            // Yakındaki yılanlardan yavaşça kaçma
            for (const p of playersArr) {
                const dx = pw.x - p.x;
                const dy = pw.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 320 && dist > 1) {
                    pw.vx += (dx / dist) * 0.25;
                    pw.vy += (dy / dist) * 0.25;
                }
            }

            // Hız sınırlama ve sürtünme
            const spd = Math.hypot(pw.vx, pw.vy);
            if (spd > 3.0) {
                pw.vx = (pw.vx / spd) * 3.0;
                pw.vy = (pw.vy / spd) * 3.0;
            }
            pw.x += pw.vx;
            pw.y += pw.vy;
            pw.vx *= 0.98;
            pw.vy *= 0.98;

            // Duvarlardan sekme
            if (pw.x < 50) { pw.x = 50; pw.vx = Math.abs(pw.vx); }
            if (pw.x > ARENA_WIDTH - 50) { pw.x = ARENA_WIDTH - 50; pw.vx = -Math.abs(pw.vx); }
            if (pw.y < 50) { pw.y = 50; pw.vy = Math.abs(pw.vy); }
            if (pw.y > ARENA_HEIGHT - 50) { pw.y = ARENA_HEIGHT - 50; pw.vy = -Math.abs(pw.vy); }
        }

        io.to(roomName).emit('powerUpsSync', room.powerUps);
    });
}, 100);

io.on('connection', (socket) => {
    socket.data.room = null;

    socket.on('joinRoom', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const roomName = cleanStr(payload.roomName, 30);
        const playerName = cleanStr(payload.playerName, 24) || 'Yılan';
        const color = COLOR_RE.test(payload.color) ? payload.color : '#00ffcc';
        if (!roomName) return;

        leaveRoom(socket);

        socket.join(roomName);
        socket.data.room = roomName;

        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                name: roomName,
                adminId: socket.id,
                players: new Map(),
                foods: Array.from({ length: 400 }, () => spawnFood()),
                powerUps: [spawnPowerUp(), spawnPowerUp(), spawnPowerUp()]
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
            kills: 0,
            activePower: null,
            powerExpires: 0,
            shieldUntil: Date.now() + 3000,
            isAdmin: isAdmin
        };

        room.players.set(socket.id, playerData);

        socket.emit('init', {
            id: socket.id,
            players: Array.from(room.players.values()),
            foods: room.foods,
            powerUps: room.powerUps,
            arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
            isAdmin: isAdmin
        });

        socket.to(roomName).emit('playerJoined', playerData);
    });

    socket.on('updatePosition', ({ data } = {}) => {
        const room = rooms.get(socket.data.room);
        if (!room || !room.players.has(socket.id) || !data || typeof data !== 'object') return;

        const player = room.players.get(socket.id);
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
        if (foodIndex === -1) return;

        const food = room.foods[foodIndex];
        if (Math.hypot(food.x - player.x, food.y - player.y) > 350) return;

        room.foods.splice(foodIndex, 1);
        const newFood = spawnFood();
        room.foods.push(newFood);
        io.to(roomName).emit('foodUpdate', { eatenId: foodId, newFood: newFood });
    });

    socket.on('powerUpCollected', ({ powerId } = {}) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (!room || !room.players.has(socket.id) || !room.powerUps) return;

        const player = room.players.get(socket.id);
        const index = room.powerUps.findIndex(p => p.id === powerId);
        if (index === -1) return;

        const pw = room.powerUps[index];
        if (Math.hypot(pw.x - player.x, pw.y - player.y) > 150) return;

        room.powerUps.splice(index, 1);
        const durations = { magnet: 10000, ghost: 6000, titan: 8000, speed: 6000 };
        const duration = durations[pw.type] || 7000;

        player.activePower = pw.type;
        player.powerExpires = Date.now() + duration;

        io.to(roomName).emit('playerPowerApplied', {
            id: socket.id,
            powerType: pw.type,
            duration: duration
        });

        // Yeni bir güç küresi doğur
        setTimeout(() => {
            if (room && room.powerUps && room.powerUps.length < 3) {
                room.powerUps.push(spawnPowerUp());
            }
        }, 3000);
    });

    socket.on('playerDied', (payload) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (room && room.players.has(socket.id)) {
            const player = room.players.get(socket.id);
            const killerId = payload ? payload.killerId : null;

            // Avcı skoru artışı (öldüren kişiye +1)
            if (killerId && room.players.has(killerId)) {
                const killer = room.players.get(killerId);
                killer.kills = (killer.kills || 0) + 1;
                io.to(roomName).emit('killRecorded', {
                    killerId: killer.id,
                    killerName: killer.name,
                    victimId: player.id,
                    victimName: player.name,
                    killerKills: killer.kills
                });
            }

            room.players.delete(socket.id);
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
