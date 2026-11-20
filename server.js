const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, './')));

const rooms = new Map();

const ARENA_WIDTH = 5000;
const ARENA_HEIGHT = 5000;

function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * (ARENA_WIDTH - 100) + 50,
        y: Math.random() * (ARENA_HEIGHT - 100) + 50,
        radius: 5 + Math.random() * 3,
        color: ['#ff3366', '#33ff66', '#3366ff', '#ffff33', '#ff33ff', '#33ffff', '#ff9933'][Math.floor(Math.random() * 7)]
    };
}

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    socket.on('joinRoom', ({ roomName, playerName, color }) => {
        socket.join(roomName);
        
        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                name: roomName,
                adminId: socket.id,
                players: new Map(),
                foods: Array.from({ length: 400 }, spawnFood)
            });
        }

        const room = rooms.get(roomName);
        const isAdmin = room.adminId === socket.id;

        const playerData = {
            id: socket.id,
            name: playerName,
            color: color,
            x: ARENA_WIDTH / 2,
            y: ARENA_HEIGHT / 2,
            angle: 0,
            segments: [], // Client will send initial segments
            isAdmin: isAdmin
        };

        room.players.set(socket.id, playerData);

        // Send current room state to the joined player
        socket.emit('init', {
            id: socket.id,
            players: Array.from(room.players.values()),
            foods: room.foods,
            arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
            isAdmin: isAdmin
        });

        // Notify others
        socket.to(roomName).emit('playerJoined', playerData);
    });

    socket.on('updatePosition', ({ roomName, data }) => {
        const room = rooms.get(roomName);
        if (room && room.players.has(socket.id)) {
            const player = room.players.get(socket.id);
            Object.assign(player, data);
            socket.to(roomName).emit('playerUpdated', player);
        }
    });

    socket.on('foodEaten', ({ roomName, foodId }) => {
        const room = rooms.get(roomName);
        if (room) {
            const foodIndex = room.foods.findIndex(f => f.id === foodId);
            if (foodIndex !== -1) {
                room.foods.splice(foodIndex, 1);
                const newFood = spawnFood();
                room.foods.push(newFood);
                io.to(roomName).emit('foodUpdate', { eatenId: foodId, newFood: newFood });
            }
        }
    });

    socket.on('playerDied', ({ roomName }) => {
        const room = rooms.get(roomName);
        if (room && room.players.has(socket.id)) {
            socket.to(roomName).emit('playerRemoved', socket.id);
            // Optionally drop food where player died
        }
    });

    socket.on('closeRoom', (roomName) => {
        const room = rooms.get(roomName);
        if (room && room.adminId === socket.id) {
            io.to(roomName).emit('roomClosed');
            rooms.delete(roomName);
        }
    });

    socket.on('disconnecting', () => {
        for (const roomName of socket.rooms) {
            if (rooms.has(roomName)) {
                const room = rooms.get(roomName);
                room.players.delete(socket.id);
                io.to(roomName).emit('playerRemoved', socket.id);

                if (room.adminId === socket.id) {
                    // Admin left, assign new admin or close
                    if (room.players.size > 0) {
                        const nextAdminId = room.players.keys().next().value;
                        room.adminId = nextAdminId;
                        io.to(nextAdminId).emit('makeAdmin');
                    } else {
                        rooms.delete(roomName);
                    }
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
