const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const playerNameDisplay = document.getElementById('player-name-display');
const roomInput = document.getElementById('room-input');
const adminControls = document.getElementById('admin-controls');
const closeRoomBtn = document.getElementById('close-room-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

const socket = io();

// --- SES MOTORU (Web Audio API - harici dosyasız) ---
let soundEnabled = true;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundEnabled = !soundEnabled;
        soundToggleBtn.textContent = soundEnabled ? 'Ses: AÇIK' : 'Ses: KAPALI';
        soundToggleBtn.style.color = soundEnabled ? '#00ffcc' : '#ff3366';
        if (soundEnabled) initAudio();
    });
}

function playEatSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    } catch (e) {}
}

function playDieSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    } catch (e) {}
}

function playBoostSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(320, now + 0.06);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    } catch (e) {}
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let ARENA_WIDTH = 5000;
let ARENA_HEIGHT = 5000;

// Kelime havuzları
const adjectivesPool = ["Güçlü", "Şirin", "Çılgın", "Hızlı", "Dev", "Minik", "Korkusuz", "Tatlı", "Akıllı", "Sevimli", "Deli", "Süper", "Mega", "Kral", "Şahane", "Fırtına", "Büyülü", "Gizemli", "Asi", "Mutlu", "Öfkeli", "Yetenekli", "Cesur", "Dahice", "Efsane", "Yıldızlı", "Kurnaz", "Çevik", "Karizmatik", "Zeki", "Dinamik", "Parlak", "Korkunç", "Mükemmel", "Şanslı", "Becerikli", "Zırhlı", "Uçan", "Kusursuz", "Eğlenceli"];
const nounsPool = ["Piton", "Ejder", "Ninja", "Samuray", "Kedi", "Köpek", "Penguen", "Kaplumbağa", "Maymun", "Ejderha", "Kartal", "Aslan", "Tilki", "Ayı", "Kurt", "Şahin", "Panda", "Timsah", "Köpekbalığı", "Kobra", "Anka", "Karakurt", "Gölge", "Şimşek", "Ateş", "Buz", "Demir", "Çelik", "Robot", "Uzaylı", "Hayalet", "Zombi", "Vampir", "Korsan", "Büyücü", "Şövalye", "Gladyatör", "Titan", "Cüce", "Panter"];
const usernamePools = [adjectivesPool, nounsPool];

function getRandomWordFromPool(poolIndex) {
    const pool = usernamePools[poolIndex];
    return pool[Math.floor(Math.random() * pool.length)];
}

const wordInputs = [document.getElementById('word-input-1'), document.getElementById('word-input-2')];
const usernamePreview = document.getElementById('username-preview');

function updateUsernamePreview() {
    if (usernamePreview) {
        const w1 = wordInputs[0] ? wordInputs[0].value : '';
        const w2 = wordInputs[1] ? wordInputs[1].value : '';
        usernamePreview.textContent = `${w1} ${w2}`;
        usernamePreview.style.color = selectedSnakeColor;
        usernamePreview.style.textShadow = `0 0 12px ${selectedSnakeColor}88`;
    }
}

function initUsernameInputs() {
    // URL parametresinden oda adı desteği (?oda=xxx veya ?room=xxx)
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('oda') || urlParams.get('room');
        if (roomParam && roomInput) {
            roomInput.value = roomParam.trim();
        }
    } catch (e) {}

    // Kayıtlı isim geri yükleme
    const savedName = localStorage.getItem('slither_username');
    if (savedName) {
        const parts = savedName.split(' ');
        if (parts[0] && wordInputs[0]) wordInputs[0].value = parts[0];
        if (parts[1] && wordInputs[1]) wordInputs[1].value = parts.slice(1).join(' ');
    } else {
        wordInputs.forEach((input, index) => {
            if (input) input.value = getRandomWordFromPool(index);
        });
    }

    wordInputs.forEach((input, index) => {
        if (input) {
            input.addEventListener('click', () => {
                input.value = getRandomWordFromPool(index);
                updateUsernamePreview();
            });
            input.addEventListener('input', () => updateUsernamePreview());
        }
    });

    // Kayıtlı renk geri yükleme
    const savedColor = localStorage.getItem('slither_color');
    if (savedColor) {
        colorOptions.forEach(opt => {
            if (opt.getAttribute('data-color') === savedColor) {
                colorOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                selectedSnakeColor = savedColor;
            }
        });
    }

    updateUsernamePreview();
}

let selectedSnakeColor = '#00ffcc';
const startScreenEl = document.getElementById('start-screen');

function updateStartScreenBackground(hex) {
    if (!startScreenEl) return;
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return;
    const r = Math.round(parseInt(match[1], 16) * 0.2);
    const g = Math.round(parseInt(match[2], 16) * 0.2);
    const b = Math.round(parseInt(match[3], 16) * 0.2);
    startScreenEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.94)`;
}

const colorOptions = document.querySelectorAll('.color-option');
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        colorOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        selectedSnakeColor = option.getAttribute('data-color');
        updateUsernamePreview();
        updateStartScreenBackground(selectedSnakeColor);
    });
});

updateStartScreenBackground(selectedSnakeColor);
initUsernameInputs();

// Nokta - Çizgi parçası arasındaki en kısa mesafe (tünelleme önleme)
function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

class Snake {
    constructor(id, x, y, isPlayer = false, color = '#00ffcc', name = 'Yılan') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.angle = 0;
        this.targetAngle = 0;

        // %20 Ufak boyut & Daha sakin hız
        this.baseRadius = 11;       // Eski: 14 (%20+ daha ufak)
        this.segmentSpacing = 8;    // Eski: 10
        this.speed = 2.6;           // Eski: 3.5 (daha kontrollü)
        this.boostSpeed = 5.0;      // Eski: 6.5

        this.segments = [];
        this.isBoosting = false;
        this.isPlayer = isPlayer;
        this.color = color;
        this.name = name;
        this.boostFrameCount = 0;
        this.boostTimer = 0;
        this.boostCooldown = 0;

        // Chat ve Konuşma Balonu
        this.chatMessage = '';
        this.chatTimer = 0;

        const initialLength = 15;
        for (let i = 0; i < initialLength; i++) {
            this.segments.push({ x: this.x - i * this.segmentSpacing, y: this.y });
        }
    }

    getCurrentRadius() {
        // Skorla kalınlaşma (skor büyüdükçe kalınlık da hissedilir derecede artar)
        return this.baseRadius + Math.min(this.segments.length * 0.07, 18);
    }

    setLength(n) {
        n = Math.max(1, Math.min(Math.floor(n) || 1, 2000));
        while (this.segments.length < n) {
            const t = this.segments[this.segments.length - 1];
            this.segments.push({ x: t.x, y: t.y });
        }
        while (this.segments.length > n) this.segments.pop();
    }

    triggerBoost() {
        if (!this.isBoosting && this.boostCooldown <= 0 && this.segments.length > 15) {
            this.isBoosting = true;
            this.boostTimer = 120;
            initAudio();
        }
    }

    update(arenaWidth, arenaHeight) {
        this.prevX = this.x;
        this.prevY = this.y;

        if (this.isPlayer) {
            if (this.isBoosting) {
                this.boostTimer--;
                if (this.boostTimer <= 0 || this.segments.length <= 15) {
                    this.isBoosting = false;
                    this.boostCooldown = 60;
                }
            } else if (this.boostCooldown > 0) {
                this.boostCooldown--;
            }
        }

        const isCurrentlyBoosting = this.isBoosting && this.segments.length > 15;
        const currentSpeed = isCurrentlyBoosting ? this.boostSpeed : this.speed;

        // Boost sırasında yem bırakma ve skor düşme
        if (isCurrentlyBoosting && this.isPlayer) {
            this.boostFrameCount++;
            if (this.boostFrameCount >= 8) {
                this.boostFrameCount = 0;
                const dropped = this.segments.pop();
                scoreEl.textContent = this.segments.length;
                playBoostSound();
                if (dropped) {
                    socket.emit('dropFood', {
                        roomName: gameState.roomName,
                        x: dropped.x,
                        y: dropped.y,
                        color: this.color
                    });
                }
            }
        }

        // Dönme açısı: %20 oranında azaltıldı (eski 0.08 -> 0.064)
        const lengthFactor = this.segments.length;
        const turnSpeed = Math.max(0.012, 0.064 - (lengthFactor * 0.0008));

        let angleDiff = this.targetAngle - this.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        this.angle += angleDiff * turnSpeed;

        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        const margin = 20;
        this.x = Math.max(margin, Math.min(arenaWidth - margin, this.x));
        this.y = Math.max(margin, Math.min(arenaHeight - margin, this.y));

        this.segments[0].x = this.x;
        this.segments[0].y = this.y;

        for (let i = 1; i < this.segments.length; i++) {
            const leader = this.segments[i - 1];
            const follower = this.segments[i];
            const fdx = leader.x - follower.x;
            const fdy = leader.y - follower.y;
            const dist = Math.hypot(fdx, fdy);
            if (dist > this.segmentSpacing) {
                const angle = Math.atan2(fdy, fdx);
                follower.x = leader.x - Math.cos(angle) * this.segmentSpacing;
                follower.y = leader.y - Math.sin(angle) * this.segmentSpacing;
            }
        }
    }

    draw(ctx) {
        const currentRadius = this.getCurrentRadius();

        // Performans: Ekran sınırları (view) dışında kalan yılanları komple atla
        let isAnySegmentVisible = false;
        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            if (s.x >= view.l && s.x <= view.r && s.y >= view.t && s.y <= view.b) {
                isAnySegmentVisible = true;
                break;
            }
        }
        if (!isAnySegmentVisible) return;

        // Gövde çizimi
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        const rgb = this.hexToRgb(this.color);

        for (let i = this.segments.length - 1; i >= 0; i--) {
            const seg = this.segments[i];
            if (seg.x < view.l || seg.x > view.r || seg.y < view.t || seg.y > view.b) continue;
            const ratio = 1 - (i / this.segments.length);
            const radius = currentRadius * (0.6 + 0.4 * ratio);
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? this.color : `rgba(${rgb}, ${0.45 + 0.55 * ratio})`;
            ctx.fill();
        }
        ctx.restore();

        const head = this.segments[0];
        // Kafa ekranda görünüyorsa gözleri ve ismi çiz
        if (head.x >= view.l && head.x <= view.r && head.y >= view.t && head.y <= view.b) {
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(this.angle);
            const eyeOffset = currentRadius * 0.45;
            const eyeRadius = Math.max(2.5, currentRadius * 0.28);
            const pupilRadius = eyeRadius * 0.45;

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eyeOffset * 0.8, -eyeOffset, eyeRadius, 0, Math.PI * 2);
            ctx.arc(eyeOffset * 0.8, eyeOffset, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(eyeOffset * 0.9, -eyeOffset, pupilRadius, 0, Math.PI * 2);
            ctx.arc(eyeOffset * 0.9, eyeOffset, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.font = 'bold 12px Segoe UI';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#000000';
            ctx.fillText(this.name, head.x, head.y - currentRadius - 8);
            ctx.restore();

            // Konuşma Balonu Çizimi
            if (this.chatMessage && this.chatTimer > Date.now()) {
                this.drawChatBubble(ctx, head.x, head.y - currentRadius - 24);
            }
        }
    }

    drawChatBubble(ctx, x, y) {
        ctx.save();
        ctx.font = 'bold 14px "Segoe UI Emoji", "Apple Color Emoji", Segoe UI, sans-serif';
        const metrics = ctx.measureText(this.chatMessage);
        const paddingX = 10;
        const paddingY = 6;
        const bubbleW = Math.max(34, metrics.width + paddingX * 2);
        const bubbleH = 26;
        const bx = x - bubbleW / 2;
        const by = y - bubbleH;
        const radius = 8;

        // Balon gövdesi
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + bubbleW - radius, by);
        ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + radius);
        ctx.lineTo(bx + bubbleW, by + bubbleH - radius);
        ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - radius, by + bubbleH);
        // Kuyruk çıkıntısı
        ctx.lineTo(x + 5, by + bubbleH);
        ctx.lineTo(x, by + bubbleH + 6);
        ctx.lineTo(x - 5, by + bubbleH);
        ctx.lineTo(bx + radius, by + bubbleH);
        ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();

        ctx.fillStyle = 'rgba(25, 25, 35, 0.94)';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.color;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.chatMessage, x, by + bubbleH / 2);
        ctx.restore();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 255, 204';
    }
}

const view = { l: 0, t: 0, r: 0, b: 0 };

const gameState = {
    isStarted: false,
    snakes: new Map(),
    player: null,
    isGameOver: false,
    roomName: '',
    isAdmin: false,
    currentCameraScale: 1.0,
    input: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        isActive: false,
        joystick: { active: false, identifier: null, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    },
    foods: []
};

// Start Game
let joinInfo = null;
function joinGame() {
    initAudio();
    if (joinInfo) socket.emit('joinRoom', joinInfo);
}

const startBtn = document.getElementById('start-btn');
if (startBtn) {
    startBtn.addEventListener('click', () => {
        initAudio();
        const room = roomInput.value.trim();
        if (!room) {
            alert('Lütfen bir oda adı girin!');
            return;
        }

        const w1 = wordInputs[0].value.trim() || "Koca";
        const w2 = wordInputs[1].value.trim() || "Mavi";
        const finalName = `${w1} ${w2}`;

        gameState.roomName = room;
        joinInfo = { roomName: room, playerName: finalName, color: selectedSnakeColor };
        joinGame();

        localStorage.setItem('slither_username', finalName);
        localStorage.setItem('slither_color', selectedSnakeColor);
    });
}

socket.on('init', ({ id, players, foods, arena, isAdmin }) => {
    ARENA_WIDTH = arena.width;
    ARENA_HEIGHT = arena.height;
    gameState.snakes.clear();
    gameState.player = null;
    gameState.isGameOver = false;
    gameState.currentCameraScale = 1.0;
    gameState.spawnProtectUntil = Date.now() + 2500;
    const goScreen = document.getElementById('game-over-screen');
    if (goScreen) goScreen.classList.add('hidden');
    gameState.isAdmin = isAdmin;
    adminControls.classList.toggle('hidden', !isAdmin);

    gameState.foods = foods.slice();

    players.forEach(p => {
        const s = new Snake(p.id, p.x, p.y, p.id === id, p.color, p.name);
        s.setLength(p.length || 15);
        s.angle = s.targetAngle = p.angle || 0;
        gameState.snakes.set(p.id, s);
        if (p.id === id) {
            gameState.player = s;
            playerNameDisplay.textContent = s.name;
            scoreEl.textContent = s.segments.length;
        }
    });

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    const emojiBar = document.getElementById('emoji-bar');
    if (emojiBar) emojiBar.classList.remove('hidden');
    gameState.isStarted = true;
});

socket.on('playerJoined', (p) => {
    const s = new Snake(p.id, p.x, p.y, false, p.color, p.name);
    s.setLength(p.length || 15);
    gameState.snakes.set(p.id, s);
});

socket.on('playerUpdated', (p) => {
    const s = gameState.snakes.get(p.id);
    if (s) {
        s.targetAngle = p.angle;
        s.isBoosting = p.isBoosting;
        s.setLength(p.length || s.segments.length);

        if (Array.isArray(p.segments) && p.segments.length > 0) {
            const segLen = Math.min(s.segments.length, p.segments.length);
            for (let i = 0; i < segLen; i++) {
                s.segments[i].x += (p.segments[i].x - s.segments[i].x) * 0.4;
                s.segments[i].y += (p.segments[i].y - s.segments[i].y) * 0.4;
            }
        }

        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d > 150) {
            s.x = p.x;
            s.y = p.y;
            s.segments.forEach(seg => { seg.x = p.x; seg.y = p.y; });
        } else if (d > 1) {
            s.x += (p.x - s.x) * 0.25;
            s.y += (p.y - s.y) * 0.25;
        }
    }
});

socket.on('playerRemoved', (id) => {
    gameState.snakes.delete(id);
});

socket.on('foodUpdate', ({ eatenId, newFood }) => {
    const index = gameState.foods.findIndex(f => f.id === eatenId);
    if (index !== -1) gameState.foods.splice(index, 1);
    if (newFood) gameState.foods.push(newFood);
});

socket.on('foodsAdded', (newFoods) => {
    if (Array.isArray(newFoods)) {
        for (const f of newFoods) gameState.foods.push(f);
    }
});

socket.on('makeAdmin', () => {
    gameState.isAdmin = true;
    adminControls.classList.remove('hidden');
});

socket.on('roomClosed', () => {
    alert('Oda admin tarafından kapatıldı.');
    location.reload();
});

closeRoomBtn.addEventListener('click', () => {
    if (gameState.isAdmin) {
        socket.emit('closeRoom', gameState.roomName);
    }
});

socket.on('playerChat', ({ id, text }) => {
    const s = gameState.snakes.get(id);
    if (s) {
        s.chatMessage = text;
        s.chatTimer = Date.now() + 3500;
    }
});

socket.on('connect', () => {
    if (gameState.isStarted && !gameState.isGameOver) joinGame();
});

// Sunucuya pozisyon ve segment bilgisi gönderme
setInterval(() => {
    if (gameState.isStarted && gameState.player) {
        const segSample = [];
        const step = Math.max(1, Math.floor(gameState.player.segments.length / 50));
        for (let i = 0; i < gameState.player.segments.length; i += step) {
            segSample.push({ x: gameState.player.segments[i].x, y: gameState.player.segments[i].y });
        }

        socket.emit('updatePosition', {
            roomName: gameState.roomName,
            data: {
                x: gameState.player.x,
                y: gameState.player.y,
                angle: gameState.player.angle,
                isBoosting: gameState.player.isBoosting,
                length: gameState.player.segments.length,
                segments: segSample
            }
        });
    }
}, 45);

// Gelişmiş Çarpışma Kontrolü (Segment-Point & Tünelleme Önleyici)
function checkCollisions() {
    if (gameState.isGameOver || !gameState.isStarted || !gameState.player) return;

    const head = gameState.player.segments[0];
    const prevHead = { x: gameState.player.prevX, y: gameState.player.prevY };
    const myRadius = gameState.player.getCurrentRadius();

    // Duvar çarpışması
    const margin = 20;
    if (head.x <= margin || head.x >= ARENA_WIDTH - margin || head.y <= margin || head.y >= ARENA_HEIGHT - margin) {
        die();
        return;
    }

    // Diğer yılanlarla çarpışma (koruma süresi bittiyse)
    const protectedNow = Date.now() < (gameState.spawnProtectUntil || 0);
    if (!protectedNow) {
        for (const [id, snake] of gameState.snakes) {
            if (id === socket.id) continue;
            const otherRadius = snake.getCurrentRadius();
            const collisionThreshold = myRadius * 0.75 + otherRadius * 0.75;

            for (let i = 0; i < snake.segments.length; i++) {
                const seg1 = snake.segments[i];
                const seg2 = snake.segments[i + 1] || seg1;

                // Kafanın diğer yılanın gövde çizgisine mesafesi
                const d1 = distToSegment(head.x, head.y, seg1.x, seg1.y, seg2.x, seg2.y);
                // Önceki kare kafasının mesafesi (hızlı giderken aradan geçmeyi önler)
                const d2 = distToSegment(prevHead.x, prevHead.y, seg1.x, seg1.y, seg2.x, seg2.y);

                if (d1 < collisionThreshold || d2 < collisionThreshold) {
                    die();
                    return;
                }
            }
        }
    }

    // Yem çarpışması
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
        const food = gameState.foods[i];
        const dist = Math.hypot(head.x - food.x, head.y - food.y);
        if (dist < myRadius + food.radius) {
            gameState.foods.splice(i, 1);
            socket.emit('foodEaten', { roomName: gameState.roomName, foodId: food.id });
            const tail = gameState.player.segments[gameState.player.segments.length - 1];
            gameState.player.segments.push({ x: tail.x, y: tail.y });
            scoreEl.textContent = gameState.player.segments.length;
            playEatSound();
        }
    }
}

function die() {
    if (gameState.isGameOver) return;
    gameState.isGameOver = true;
    playDieSound();

    // Ölünce vücut segmentlerinin olduğu yere yem saçma
    const drops = [];
    if (gameState.player && gameState.player.segments) {
        const step = Math.max(1, Math.floor(gameState.player.segments.length / 40));
        for (let i = 0; i < gameState.player.segments.length; i += step) {
            drops.push({ x: gameState.player.segments[i].x, y: gameState.player.segments[i].y });
        }
    }

    socket.emit('playerDied', { roomName: gameState.roomName, drops: drops });
    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl && gameState.player) finalScoreEl.textContent = gameState.player.segments.length;
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) gameOverScreen.classList.remove('hidden');
    const emojiBar = document.getElementById('emoji-bar');
    if (emojiBar) emojiBar.classList.add('hidden');
}

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        const goScreen = document.getElementById('game-over-screen');
        if (goScreen) goScreen.classList.add('hidden');
        joinGame();
    });
}

// Input Handlers
function handleInput(clientX, clientY) {
    if (!gameState.isStarted || !gameState.player || gameState.isGameOver) return;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    if (Math.hypot(dx, dy) > 10) {
        gameState.player.targetAngle = Math.atan2(dy, dx);
    }
}

window.addEventListener('mousemove', (e) => {
    handleInput(e.clientX, e.clientY);
});

// Fare çift tıklama / basılı tutma / Space ile Hızlanma (Boost)
let lastMouseClickTime = 0;
window.addEventListener('mousedown', (e) => {
    if (!gameState.isStarted || gameState.isGameOver || !gameState.player) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    const now = Date.now();
    if (now - lastMouseClickTime < 320) {
        gameState.player.triggerBoost();
    }
    lastMouseClickTime = now;
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gameState.player) {
        gameState.player.triggerBoost();
    }
});

// Mobile Touch & Joystick (çift dokunma = boost)
let lastTouchTime = 0;
window.addEventListener('touchstart', (e) => {
    if (!gameState.isStarted || gameState.isGameOver) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    const now = Date.now();
    if (now - lastTouchTime < 320 && gameState.player) {
        gameState.player.triggerBoost();
    }
    lastTouchTime = now;
    const touch = e.touches[0];
    gameState.input.joystick.active = true;
    gameState.input.joystick.startX = touch.clientX;
    gameState.input.joystick.startY = touch.clientY;
    gameState.input.joystick.currentX = touch.clientX;
    gameState.input.joystick.currentY = touch.clientY;
    handleInput(touch.clientX, touch.clientY);
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (!gameState.isStarted || gameState.isGameOver || !gameState.player) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (gameState.input.joystick.active) {
        gameState.input.joystick.currentX = touch.clientX;
        gameState.input.joystick.currentY = touch.clientY;
        const dx = touch.clientX - gameState.input.joystick.startX;
        const dy = touch.clientY - gameState.input.joystick.startY;
        if (Math.hypot(dx, dy) > 5) {
            gameState.player.targetAngle = Math.atan2(dy, dx);
        }
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    gameState.input.joystick.active = false;
});

function drawJoystick() {
    const j = gameState.input.joystick;
    if (!j.active) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(j.startX, j.startY, 50, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.1)';
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    const dx = j.currentX - j.startX;
    const dy = j.currentY - j.startY;
    const dist = Math.min(Math.hypot(dx, dy), 50);
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.arc(j.startX + Math.cos(angle) * dist, j.startY + Math.sin(angle) * dist, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.fill();
    ctx.restore();
}

function update() {
    if (!gameState.isStarted || gameState.isGameOver) return;
    for (const [id, snake] of gameState.snakes) {
        snake.update(ARENA_WIDTH, ARENA_HEIGHT);
    }
    checkCollisions();
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    ctx.beginPath();
    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
    }
    ctx.stroke();
}

function drawMiniMap() {
    if (!gameState.player) return;
    const mapSize = 140;
    const mapX = canvas.width - mapSize - 20;
    const mapY = 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapSize, mapSize);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    const scale = mapSize / ARENA_WIDTH;
    const px = gameState.player.x;
    const py = gameState.player.y;
    const radarFoodRadiusSq = 1200 * 1200; // Sadece oyuncunun etrafındaki 1200px içindeki yemler

    // Sadece yakındaki yemleri radarda göster (uzaktaki yüzlerce yemi çizip kasmayı önler)
    for (let i = 0; i < gameState.foods.length; i++) {
        const food = gameState.foods[i];
        const dx = food.x - px;
        const dy = food.y - py;
        if (dx * dx + dy * dy <= radarFoodRadiusSq) {
            ctx.fillStyle = food.color;
            ctx.fillRect(mapX + food.x * scale, mapY + food.y * scale, 1.5, 1.5);
        }
    }

    // Yılanları çiz (yılanlar haritanın neresinde olursa olsun rakip takibi için radar noktası görünür)
    for (const [id, snake] of gameState.snakes) {
        const head = snake.segments[0];
        ctx.beginPath();
        ctx.arc(mapX + head.x * scale, mapY + head.y * scale, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = snake.color;
        ctx.fill();

        // Konuşan oyuncu için minimapte yanıp sönen konuşma balonu efekti
        if (snake.chatMessage && snake.chatTimer > Date.now()) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(mapX + head.x * scale, mapY + head.y * scale - 4, 3 + pulse * 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.6})`;
            ctx.fill();
            ctx.restore();
        }
    }
    ctx.restore();
}

let lastLeaderboardUpdate = 0;
function updateLeaderboard() {
    const now = performance.now();
    if (now - lastLeaderboardUpdate < 300) return;
    lastLeaderboardUpdate = now;
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    const sorted = Array.from(gameState.snakes.values()).sort((a, b) => b.segments.length - a.segments.length);
    listEl.textContent = '';
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
        const sn = sorted[i];
        const li = document.createElement('li');
        if (sn.isPlayer) li.className = 'player-row';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${i + 1}. ${sn.name}`;
        const scoreSpan = document.createElement('span');
        scoreSpan.textContent = sn.segments.length;
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState.player) return;

    // Kamera Zoom Hesabı (Yılan büyüdükçe zoom-out yapar; ekranda devasa olmaz, diğerleri ufak görünür)
    const pRadius = gameState.player.getCurrentRadius();
    const targetScale = Math.max(0.65, Math.min(1.0, 11 / pRadius));
    gameState.currentCameraScale += (targetScale - gameState.currentCameraScale) * 0.05;
    const scale = gameState.currentCameraScale;

    const halfW = (canvas.width / 2) / scale;
    const halfH = (canvas.height / 2) / scale;
    view.l = gameState.player.x - halfW - 80;
    view.r = gameState.player.x + halfW + 80;
    view.t = gameState.player.y - halfH - 80;
    view.b = gameState.player.y + halfH + 80;

    ctx.save();
    // Ekran merkezine taşı, scale et, sonra oyuncunun pozisyonuna git
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-gameState.player.x, -gameState.player.y);

    drawGrid();

    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Yemleri çiz
    for (const food of gameState.foods) {
        if (food.x < view.l || food.x > view.r || food.y < view.t || food.y > view.b) continue;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
        ctx.fillStyle = food.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = food.color;
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Yılanları çiz
    for (const [id, snake] of gameState.snakes) {
        snake.draw(ctx);
    }

    ctx.restore();

    // Arayüz elemanları (sabit ölçekte)
    if (gameState.isStarted) {
        drawJoystick();
        drawMiniMap();
        updateLeaderboard();
    }
}

// --- EMOJİ SOHET VE RANDOM REPLİKLER ---
const EMOJI_LIST = [
    '😎', '😈', '🔥', '💀', '😱', '😂', '👋', '👀', '🐍', '🚀',
    '⚡', '👑', '💥', '👻', '🍕', '🎉', '😡', '🤔', '🏆', '🥶',
    '🤯', '🤪', '🤫', '💩', '💯', '🦾', '💣', '🛡️', '⚔️', '🎯',
    '🍿', '🍭', '🌮', '🍔', '👽', '🤖', '👾', '🎃', '💎', '⭐',
    '🌟', '✨', '🎈', '🎵', '🚨', '⛔', '💤', '🥳', '🤠', '🪄'
];

const RANDOM_QUOTES = [
    'OLLEEEY!',
    'VAAAY!',
    'YAKLAŞMAYIN!',
    'YAKARIM!',
    'OLUM BAK GİT!',
    'UZAK DUR!',
    'KAÇMASANA!'
];

function initEmojiBar() {
    const bar = document.getElementById('emoji-bar');
    if (!bar) return;
    bar.innerHTML = '';
    EMOJI_LIST.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.type = 'button';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            sendChatMessage(emoji);
        });
        bar.appendChild(btn);
    });
}
initEmojiBar();

function sendChatMessage(text) {
    if (!gameState.isStarted || gameState.isGameOver || !gameState.player) return;
    socket.emit('sendChat', { text: text });
}

// 30 saniye civarında rastgele eğlenceli replik çıkarma döngüsü
function scheduleNextRandomQuote() {
    // 22 ile 38 saniye arasında rastgele zamanlama (~30sn)
    const delay = 22000 + Math.random() * 16000;
    setTimeout(() => {
        if (gameState.isStarted && !gameState.isGameOver && gameState.player) {
            const quote = RANDOM_QUOTES[Math.floor(Math.random() * RANDOM_QUOTES.length)];
            sendChatMessage(quote);
        }
        scheduleNextRandomQuote();
    }, delay);
}
scheduleNextRandomQuote();

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();
