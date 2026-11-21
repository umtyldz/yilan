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

// Harita ölçüleri %30 azaltıldı: 7000 x 7000
const ARENA_WIDTH = 7000;
const ARENA_HEIGHT = 7000;
const INITIAL_LENGTH = 15;
const MAX_LENGTH = 3000;
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

// 1, 3, 5, 7 puanlık kademeli yem üretimi
function spawnFood(customX, customY, customValue, customRadius, customColor) {
    let value = customValue;
    let radius = customRadius;

    if (value === undefined) {
        const rand = Math.random();
        if (rand < 0.55) {
            value = 1;
            radius = 3.5;
        } else if (rand < 0.80) {
            value = 3;
            radius = 5.5;
        } else if (rand < 0.93) {
            value = 5;
            radius = 7.5;
        } else {
            value = 7;
            radius = 9.5;
        }
    } else if (radius === undefined) {
        radius = Math.max(3.5, Math.min(22, 3 + Math.sqrt(value) * 1.8));
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        x: customX !== undefined ? customX : Math.random() * (ARENA_WIDTH - 200) + 100,
        y: customY !== undefined ? customY : Math.random() * (ARENA_HEIGHT - 200) + 100,
        value: value,
        radius: radius,
        color: customColor || ['#ff3366', '#33ff66', '#3366ff', '#ffff33', '#ff33ff', '#33ffff', '#ff9933'][Math.floor(Math.random() * 7)]
    };
}

// 50 - 100 puanlık hareketli kaçan hazine yemleri
function spawnBounty() {
    const value = Math.floor(50 + Math.random() * 51); // 50 - 100 puan
    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = 1.6 + ((value - 50) / 50) * 1.2; // 50 puan -> 1.6 hız, 100 puan -> 2.8 hız
    return {
        id: 'bty_' + Math.random().toString(36).substr(2, 9),
        x: 300 + Math.random() * (ARENA_WIDTH - 600),
        y: 300 + Math.random() * (ARENA_HEIGHT - 600),
        value: value,
        radius: 12 + ((value - 50) / 50) * 6, // 12px - 18px boyut
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        baseSpeed: baseSpeed
    };
}

const POWER_TYPES = ['magnet', 'ghost', 'titan', 'speed'];
function spawnPowerUp() {
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 1.5;
    return {
        id: 'pw_' + Math.random().toString(36).substr(2, 9),
        type: type,
        x: 300 + Math.random() * (ARENA_WIDTH - 600),
        y: 300 + Math.random() * (ARENA_HEIGHT - 600),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 13
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

// Power-up ve 50-100 Puanlık Kaçan Hazine Yemleri Hareket Döngüsü
setInterval(() => {
    rooms.forEach((room, roomName) => {
        if (!room.powerUps) room.powerUps = [];
        while (room.powerUps.length < 3) {
            room.powerUps.push(spawnPowerUp());
        }

        if (!room.bounties) room.bounties = [];
        while (room.bounties.length < 4) {
            room.bounties.push(spawnBounty());
        }

        const playersArr = Array.from(room.players.values());

        // 1. Power-up kaçış döngüsü
        for (const pw of room.powerUps) {
            for (const p of playersArr) {
                const dx = pw.x - p.x;
                const dy = pw.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 450 && dist > 1) {
                    pw.vx += (dx / dist) * 0.65;
                    pw.vy += (dy / dist) * 0.65;
                }
            }
            const spd = Math.hypot(pw.vx, pw.vy);
            if (spd > 5.0) {
                pw.vx = (pw.vx / spd) * 5.0;
                pw.vy = (pw.vy / spd) * 5.0;
            } else if (spd < 1.8) {
                const ang = Math.atan2(pw.vy, pw.vx) || (Math.random() * Math.PI * 2);
                pw.vx = Math.cos(ang) * 2.2;
                pw.vy = Math.sin(ang) * 2.2;
            }
            pw.x += pw.vx;
            pw.y += pw.vy;
            pw.vx *= 0.99;
            pw.vy *= 0.99;

            if (pw.x < 100) { pw.x = 100; pw.vx = Math.abs(pw.vx); }
            if (pw.x > ARENA_WIDTH - 100) { pw.x = ARENA_WIDTH - 100; pw.vx = -Math.abs(pw.vx); }
            if (pw.y < 100) { pw.y = 100; pw.vy = Math.abs(pw.vy); }
            if (pw.y > ARENA_HEIGHT - 100) { pw.y = ARENA_HEIGHT - 100; pw.vy = -Math.abs(pw.vy); }
        }

        // 2. 50-100 Puanlık Kaçan Hazine Yemleri Döngüsü
        for (const bty of room.bounties) {
            let maxThreatSpeed = 0;
            let nearestDist = 9999;
            let escapeDx = 0;
            let escapeDy = 0;

            for (const p of playersArr) {
                const dx = bty.x - p.x;
                const dy = bty.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 500 && dist > 1) {
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        escapeDx = dx / dist;
                        escapeDy = dy / dist;
                        maxThreatSpeed = p.isBoosting ? 5.0 : 2.6;
                    }
                }
            }

            // Yaklaşan yılanın hızına göre kaçış ivmesi
            if (nearestDist < 500) {
                const urgency = 1 - (nearestDist / 500);
                const threatMultiplier = maxThreatSpeed > 3.0 ? 1.6 : 1.0;
                const agility = 0.35 + ((bty.value - 50) / 50) * 0.35; // Yüksek puan daha çevik kaçar
                bty.vx += escapeDx * urgency * agility * threatMultiplier;
                bty.vy += escapeDy * urgency * agility * threatMultiplier;
            }

            // Hız sınırlandırması: Yüksek puanlılar biraz daha hızlı kaçabilir ama yakalanması imkansız olmaz
            const maxSpd = bty.baseSpeed * (maxThreatSpeed > 3.0 ? 1.5 : 1.15);
            const curSpd = Math.hypot(bty.vx, bty.vy);
            if (curSpd > maxSpd) {
                bty.vx = (bty.vx / curSpd) * maxSpd;
                bty.vy = (bty.vy / curSpd) * maxSpd;
            } else if (curSpd < 1.0) {
                const ang = Math.atan2(bty.vy, bty.vx) || (Math.random() * Math.PI * 2);
                bty.vx = Math.cos(ang) * 1.5;
                bty.vy = Math.sin(ang) * 1.5;
            }

            bty.x += bty.vx;
            bty.y += bty.vy;
            bty.vx *= 0.985;
            bty.vy *= 0.985;

            if (bty.x < 100) { bty.x = 100; bty.vx = Math.abs(bty.vx); }
            if (bty.x > ARENA_WIDTH - 100) { bty.x = ARENA_WIDTH - 100; bty.vx = -Math.abs(bty.vx); }
            if (bty.y < 100) { bty.y = 100; bty.vy = Math.abs(bty.vy); }
            if (bty.y > ARENA_HEIGHT - 100) { bty.y = ARENA_HEIGHT - 100; bty.vy = -Math.abs(bty.vy); }
        }

        io.to(roomName).emit('powerUpsSync', room.powerUps);
        io.to(roomName).emit('bountiesSync', room.bounties);
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

        // Yem sayısı %50 artırıldı: 1600 -> 2400 yem
        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                name: roomName,
                adminId: socket.id,
                players: new Map(),
                foods: Array.from({ length: 2400 }, () => spawnFood()),
                powerUps: [spawnPowerUp(), spawnPowerUp(), spawnPowerUp()],
                bounties: [spawnBounty(), spawnBounty(), spawnBounty(), spawnBounty()]
            });
        }

        const room = rooms.get(roomName);
        if (!room.adminId) room.adminId = socket.id;
        const isAdmin = room.adminId === socket.id;

        const playerData = {
            id: socket.id,
            name: playerName,
            color: color,
            x: 800 + Math.random() * (ARENA_WIDTH - 1600),
            y: 800 + Math.random() * (ARENA_HEIGHT - 1600),
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
            bounties: room.bounties,
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
        const food = spawnFood(x, y, 1, 3.5, color);
        room.foods.push(food);
        if (room.foods.length > 3000) {
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
        io.to(roomName).emit('foodUpdate', { eatenId: foodId, newFood: newFood, eatenValue: food.value || 1 });
    });

    socket.on('bountyEaten', ({ bountyId } = {}) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (!room || !room.players.has(socket.id) || !room.bounties) return;

        const player = room.players.get(socket.id);
        const index = room.bounties.findIndex(b => b.id === bountyId);
        if (index === -1) return;

        const bty = room.bounties[index];
        if (Math.hypot(bty.x - player.x, bty.y - player.y) > 200) return;

        room.bounties.splice(index, 1);
        io.to(roomName).emit('bountyRemoved', { bountyId: bountyId });

        // Birkaç saniye sonra yeni bir 50-100 puanlık yem doğur
        setTimeout(() => {
            if (room && room.bounties && room.bounties.length < 4) {
                const nb = spawnBounty();
                room.bounties.push(nb);
                io.to(roomName).emit('bountiesSync', room.bounties);
            }
        }, 3000);
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
        const durations = { magnet: 10000, ghost: 8000, titan: 8000, speed: 6000 };
        const duration = durations[pw.type] || 7000;

        player.activePower = pw.type;
        player.powerExpires = Date.now() + duration;

        io.to(roomName).emit('playerPowerApplied', {
            id: socket.id,
            powerType: pw.type,
            duration: duration
        });

        setTimeout(() => {
            if (room && room.powerUps && room.powerUps.length < 3) {
                room.powerUps.push(spawnPowerUp());
            }
        }, 4000);
    });

    socket.on('playerDied', (payload) => {
        const roomName = socket.data.room;
        const room = rooms.get(roomName);
        if (room && room.players.has(socket.id)) {
            const player = room.players.get(socket.id);
            const killerId = payload ? payload.killerId : null;

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

            // Ölen yılanın segmentleri üzerinden eşit dağılımlı dolgun yem saçma
            if (payload && Array.isArray(payload.drops) && payload.drops.length > 0) {
                const added = [];
                const color = player.color || '#ff3366';
                const limit = Math.min(payload.drops.length, 250);
                for (let i = 0; i < limit; i++) {
                    const d = payload.drops[i];
                    if (d && isNum(d.x) && isNum(d.y)) {
                        const jitterX = d.x + (Math.random() - 0.5) * 25;
                        const jitterY = d.y + (Math.random() - 0.5) * 25;
                        const val = d.value || 3;
                        const rad = d.radius || 7;
                        const fd = spawnFood(
                            Math.max(30, Math.min(ARENA_WIDTH - 30, jitterX)),
                            Math.max(30, Math.min(ARENA_HEIGHT - 30, jitterY)),
                            val,
                            rad,
                            color
                        );
                        room.foods.push(fd);
                        added.push(fd);
                    }
                }
                if (added.length > 0) {
                    while (room.foods.length > 3500) {
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
