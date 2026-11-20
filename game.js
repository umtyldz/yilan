const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const killsDisplay = document.getElementById('kills-display');
const playerNameDisplay = document.getElementById('player-name-display');
const roomInput = document.getElementById('room-input');
const adminControls = document.getElementById('admin-controls');
const closeRoomBtn = document.getElementById('close-room-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const deathVignette = document.getElementById('death-vignette');
const respawnOverlay = document.getElementById('respawn-overlay');
const respawnTimerNumber = document.getElementById('respawn-timer-number');
const gameOverScreen = document.getElementById('game-over-screen');
const emojiBar = document.getElementById('emoji-bar');

const socket = io();

// --- SES MOTORU (Web Audio API) ---
let soundEnabled = true;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
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

function playPowerSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
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
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('oda') || urlParams.get('room');
        if (roomParam && roomInput) roomInput.value = roomParam.trim();
    } catch (e) {}

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

        this.baseRadius = 11;
        this.segmentSpacing = 8;
        this.speed = 2.6;
        this.boostSpeed = 5.0;

        this.segments = [];
        this.isBoosting = false;
        this.isPlayer = isPlayer;
        this.color = color;
        this.name = name;
        this.boostFrameCount = 0;
        this.boostTimer = 0;
        this.boostCooldown = 0;

        // Avcı skoru & Koruma & Güçler
        this.kills = 0;
        this.shieldUntil = Date.now() + 3000;
        this.activePower = null;
        this.powerExpires = 0;

        // Chat
        this.chatMessage = '';
        this.chatTimer = 0;

        const initialLength = 15;
        for (let i = 0; i < initialLength; i++) {
            this.segments.push({ x: this.x - i * this.segmentSpacing, y: this.y });
        }
    }

    getCurrentRadius() {
        const isTitan = this.activePower === 'titan' && this.powerExpires > Date.now();
        const base = this.baseRadius + Math.min(this.segments.length * 0.07, 18);
        return isTitan ? base * 1.8 : base;
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

        const hasSpeedPower = this.activePower === 'speed' && this.powerExpires > Date.now();

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
        let currentSpeed = isCurrentlyBoosting ? this.boostSpeed : this.speed;
        if (hasSpeedPower) currentSpeed *= 1.45; // Turbo güç çarpanı

        // Boost sırasında yem bırakma (turbo gücündeyken kuyruk puanı eksilmez!)
        if (isCurrentlyBoosting && this.isPlayer) {
            this.boostFrameCount++;
            if (this.boostFrameCount >= 8) {
                this.boostFrameCount = 0;
                if (!hasSpeedPower) {
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
                } else {
                    playBoostSound();
                }
            }
        }

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

        // Performans Culling
        let isAnySegmentVisible = false;
        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            if (s.x >= view.l && s.x <= view.r && s.y >= view.t && s.y <= view.b) {
                isAnySegmentVisible = true;
                break;
            }
        }
        if (!isAnySegmentVisible) return;

        const isGhost = this.activePower === 'ghost' && this.powerExpires > Date.now();
        const baseAlpha = isGhost ? 0.22 : 1.0; // Hayalet modu kamuflajı

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
            const a = (0.45 + 0.55 * ratio) * baseAlpha;
            ctx.fillStyle = i === 0 ? `rgba(${rgb}, ${baseAlpha})` : `rgba(${rgb}, ${a})`;
            ctx.fill();
        }
        ctx.restore();

        const head = this.segments[0];
        if (head.x >= view.l && head.x <= view.r && head.y >= view.t && head.y <= view.b) {
            // Gözler
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(this.angle);
            const eyeOffset = currentRadius * 0.45;
            const eyeRadius = Math.max(2.5, currentRadius * 0.28);
            const pupilRadius = eyeRadius * 0.45;

            ctx.fillStyle = `rgba(255, 255, 255, ${baseAlpha})`;
            ctx.beginPath();
            ctx.arc(eyeOffset * 0.8, -eyeOffset, eyeRadius, 0, Math.PI * 2);
            ctx.arc(eyeOffset * 0.8, eyeOffset, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(0, 0, 0, ${baseAlpha})`;
            ctx.beginPath();
            ctx.arc(eyeOffset * 0.9, -eyeOffset, pupilRadius, 0, Math.PI * 2);
            ctx.arc(eyeOffset * 0.9, eyeOffset, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Yeniden Doğuş Koruma Kalkanı (Neon Enerji Halkası)
            if (this.shieldUntil > Date.now()) {
                const pulse = (Math.sin(Date.now() / 100) + 1) / 2;
                ctx.save();
                ctx.beginPath();
                ctx.arc(head.x, head.y, currentRadius + 10 + pulse * 4, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 255, 204, ${0.4 + pulse * 0.5})`;
                ctx.lineWidth = 3;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#00ffcc';
                ctx.stroke();
                ctx.restore();
            }

            // Aktif Güç Geri Sayım Barı
            if (this.activePower && this.powerExpires > Date.now()) {
                const totalDur = { magnet: 10000, ghost: 6000, titan: 8000, speed: 6000 }[this.activePower] || 7000;
                const rem = Math.max(0, this.powerExpires - Date.now()) / totalDur;
                const pColor = { magnet: '#ffff00', ghost: '#aa88ff', titan: '#ff3366', speed: '#00ffff' }[this.activePower] || '#fff';
                const pEmoji = { magnet: '🧲', ghost: '👻', titan: '🍄', speed: '⚡' }[this.activePower] || '⭐';

                ctx.save();
                ctx.beginPath();
                ctx.arc(head.x, head.y, currentRadius + 15, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * rem));
                ctx.strokeStyle = pColor;
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.font = '12px "Segoe UI Emoji", sans-serif';
                ctx.fillText(pEmoji, head.x, head.y - currentRadius - 20);
                ctx.restore();
            }

            // İsim ve Avcı İkonu
            ctx.save();
            ctx.font = 'bold 12px Segoe UI';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#000000';
            const killTag = this.kills > 0 ? ` [💀${this.kills}]` : '';
            ctx.fillText(this.name + killTag, head.x, head.y - currentRadius - 8);
            ctx.restore();

            // Konuşma Balonu Çizimi (Büyük ve Net)
            if (this.chatMessage && this.chatTimer > Date.now()) {
                this.drawChatBubble(ctx, head.x, head.y - currentRadius - 26);
            }
        }
    }

    drawChatBubble(ctx, x, y) {
        ctx.save();
        ctx.font = 'bold 20px "Segoe UI Emoji", "Apple Color Emoji", Segoe UI, sans-serif';
        const metrics = ctx.measureText(this.chatMessage);
        const paddingX = 14;
        const paddingY = 8;
        const bubbleW = Math.max(48, metrics.width + paddingX * 2);
        const bubbleH = 34;
        const bx = x - bubbleW / 2;
        const by = y - bubbleH;
        const radius = 10;

        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + bubbleW - radius, by);
        ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + radius);
        ctx.lineTo(bx + bubbleW, by + bubbleH - radius);
        ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - radius, by + bubbleH);
        ctx.lineTo(x + 6, by + bubbleH);
        ctx.lineTo(x, by + bubbleH + 7);
        ctx.lineTo(x - 6, by + bubbleH);
        ctx.lineTo(bx + radius, by + bubbleH);
        ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();

        ctx.fillStyle = 'rgba(22, 22, 32, 0.96)';
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;
        ctx.fill();

        ctx.lineWidth = 2;
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
    isDeadWatching: false,
    isRespawning: false,
    deathTime: 0,
    deathCameraPos: { x: 2500, y: 2500 },
    roomName: '',
    isAdmin: false,
    currentCameraScale: 1.0,
    input: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        isActive: false,
        joystick: { active: false, identifier: null, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    },
    foods: [],
    powerUps: []
};

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
        
        // İlk girişte geri sayım sayacı
        gameState.isRespawning = true;
        gameState.player = null;
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';

        let secondsLeft = 5;
        if (respawnOverlay && respawnTimerNumber) {
            respawnTimerNumber.textContent = secondsLeft;
            respawnOverlay.classList.remove('hidden');
        }

        if (respawnIntervalId) clearInterval(respawnIntervalId);
        respawnIntervalId = setInterval(() => {
            secondsLeft--;
            if (respawnTimerNumber) respawnTimerNumber.textContent = secondsLeft;
            if (secondsLeft <= 0) {
                clearInterval(respawnIntervalId);
                respawnIntervalId = null;
                if (respawnOverlay) respawnOverlay.classList.add('hidden');
                gameState.isRespawning = false;
                joinGame();
            }
        }, 1000);

        localStorage.setItem('slither_username', finalName);
        localStorage.setItem('slither_color', selectedSnakeColor);
    });
}

socket.on('init', ({ id, players, foods, powerUps, arena, isAdmin }) => {
    ARENA_WIDTH = arena.width;
    ARENA_HEIGHT = arena.height;
    gameState.snakes.clear();
    gameState.player = null;
    gameState.isGameOver = false;
    gameState.isDeadWatching = false;
    gameState.isRespawning = false;
    gameState.currentCameraScale = 1.0;
    if (deathVignette) deathVignette.classList.add('hidden');
    if (respawnOverlay) respawnOverlay.classList.add('hidden');
    if (gameOverScreen) gameOverScreen.classList.add('hidden');

    gameState.isAdmin = isAdmin;
    adminControls.classList.toggle('hidden', !isAdmin);

    gameState.foods = foods.slice();
    if (Array.isArray(powerUps)) gameState.powerUps = powerUps.slice();

    players.forEach(p => {
        const s = new Snake(p.id, p.x, p.y, p.id === id, p.color, p.name);
        s.setLength(p.length || 15);
        s.angle = s.targetAngle = p.angle || 0;
        s.kills = p.kills || 0;
        s.shieldUntil = p.shieldUntil || (Date.now() + 3000);
        s.activePower = p.activePower || null;
        s.powerExpires = p.powerExpires || 0;
        gameState.snakes.set(p.id, s);
        if (p.id === id) {
            gameState.player = s;
            playerNameDisplay.textContent = s.name;
            scoreEl.textContent = s.segments.length;
            if (killsDisplay) killsDisplay.textContent = `${s.kills} 💀`;
        }
    });

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    if (emojiBar) emojiBar.classList.remove('hidden');
    gameState.isStarted = true;
});

socket.on('playerJoined', (p) => {
    const s = new Snake(p.id, p.x, p.y, false, p.color, p.name);
    s.setLength(p.length || 15);
    s.kills = p.kills || 0;
    s.shieldUntil = p.shieldUntil || (Date.now() + 3000);
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

socket.on('killRecorded', ({ killerId, killerKills }) => {
    const k = gameState.snakes.get(killerId);
    if (k) {
        k.kills = killerKills;
        if (k.isPlayer && killsDisplay) {
            killsDisplay.textContent = `${killerKills} 💀`;
        }
    }
});

socket.on('playerPowerApplied', ({ id, powerType, duration }) => {
    const s = gameState.snakes.get(id);
    if (s) {
        s.activePower = powerType;
        s.powerExpires = Date.now() + duration;
        if (s.isPlayer) playPowerSound();
    }
});

socket.on('powerUpsSync', (powerUps) => {
    if (Array.isArray(powerUps)) gameState.powerUps = powerUps;
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
    if (gameState.isStarted && !gameState.isGameOver && !gameState.isDeadWatching && !gameState.isRespawning) joinGame();
});

// Sunucuya pozisyon gönderme
setInterval(() => {
    if (gameState.isStarted && gameState.player && !gameState.isGameOver && !gameState.isDeadWatching && !gameState.isRespawning) {
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

// Çarpışma ve Güç Kontrolleri
function checkCollisions() {
    if (gameState.isGameOver || gameState.isDeadWatching || gameState.isRespawning || !gameState.isStarted || !gameState.player) return;

    const head = gameState.player.segments[0];
    const prevHead = { x: gameState.player.prevX, y: gameState.player.prevY };
    const myRadius = gameState.player.getCurrentRadius();

    // Duvar çarpışması
    const margin = 20;
    if (head.x <= margin || head.x >= ARENA_WIDTH - margin || head.y <= margin || head.y >= ARENA_HEIGHT - margin) {
        die(null);
        return;
    }

    // Diğer yılanlarla çarpışma (koruma kalkanı yoksa)
    const protectedNow = gameState.player.shieldUntil > Date.now();
    if (!protectedNow) {
        for (const [id, snake] of gameState.snakes) {
            if (id === socket.id) continue;
            const otherRadius = snake.getCurrentRadius();
            const collisionThreshold = myRadius * 0.75 + otherRadius * 0.75;

            for (let i = 0; i < snake.segments.length; i++) {
                const seg1 = snake.segments[i];
                const seg2 = snake.segments[i + 1] || seg1;

                const d1 = distToSegment(head.x, head.y, seg1.x, seg1.y, seg2.x, seg2.y);
                const d2 = distToSegment(prevHead.x, prevHead.y, seg1.x, seg1.y, seg2.x, seg2.y);

                if (d1 < collisionThreshold || d2 < collisionThreshold) {
                    die(snake.id);
                    return;
                }
            }
        }
    }

    // Güç Küresi Çarpışması
    for (let i = gameState.powerUps.length - 1; i >= 0; i--) {
        const pw = gameState.powerUps[i];
        const dist = Math.hypot(head.x - pw.x, head.y - pw.y);
        if (dist < myRadius + pw.radius + 6) {
            gameState.powerUps.splice(i, 1);
            socket.emit('powerUpCollected', { roomName: gameState.roomName, powerId: pw.id });
        }
    }

    // Yem Çarpışması & Manyetik Çekim
    const hasMagnet = gameState.player.activePower === 'magnet' && gameState.player.powerExpires > Date.now();
    for (let i = gameState.foods.length - 1; i >= 0; i--) {
        const food = gameState.foods[i];
        const dist = Math.hypot(head.x - food.x, head.y - food.y);

        // Manyetik çekim etkisi
        if (hasMagnet && dist < 320 && dist > myRadius) {
            food.x += (head.x - food.x) * 0.15;
            food.y += (head.y - food.y) * 0.15;
        }

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

// Ölüm ve 3-4 saniyelik gecikmeli yas ekranı
function die(killerId) {
    if (gameState.isGameOver || gameState.isDeadWatching) return;
    gameState.isDeadWatching = true;
    gameState.deathTime = Date.now();
    playDieSound();

    if (deathVignette) deathVignette.classList.remove('hidden');
    if (emojiBar) emojiBar.classList.add('hidden');

    // Kamera ölüm noktasında kalsın
    if (gameState.player) {
        gameState.deathCameraPos = { x: gameState.player.x, y: gameState.player.y };
    }

    const drops = [];
    if (gameState.player && gameState.player.segments) {
        const step = Math.max(1, Math.floor(gameState.player.segments.length / 40));
        for (let i = 0; i < gameState.player.segments.length; i += step) {
            drops.push({ x: gameState.player.segments[i].x, y: gameState.player.segments[i].y });
        }
    }

    socket.emit('playerDied', {
        roomName: gameState.roomName,
        killerId: killerId,
        drops: drops
    });

    const finalLen = gameState.player ? gameState.player.segments.length : 15;
    const finalKills = gameState.player ? gameState.player.kills : 0;

    // 3.5 saniye boyunca oyuncu kendi ölümünü ve etrafı izlesin, sonra menü açılsın
    setTimeout(() => {
        if (!gameState.isDeadWatching) return;
        gameState.isDeadWatching = false;
        gameState.isGameOver = true;

        const finalScoreEl = document.getElementById('final-score');
        if (finalScoreEl) finalScoreEl.textContent = finalLen;
        const finalKillsEl = document.getElementById('final-kills');
        if (finalKillsEl) finalKillsEl.textContent = finalKills;

        if (gameOverScreen) gameOverScreen.classList.remove('hidden');
    }, 3500);
}

// Avcı skoruna göre dinamik yeniden doğma süresi hesaplama
function calculateRespawnDelay() {
    const myKills = (gameState.player && gameState.player.kills) || 0;
    const allKills = Array.from(gameState.snakes.values()).map(s => s.kills || 0).sort((a, b) => a - b);
    let median = 0;
    if (allKills.length > 0) {
        median = allKills[Math.floor(allKills.length / 2)];
    }

    // Usta avcılar (medyan üstü): 3-4 saniye, düşük/yeni girenler: 7-8 saniye
    if (myKills > median + 2) return 3;
    if (myKills > median) return 4;
    if (myKills === median && myKills > 0) return 5;
    return 7;
}

let respawnIntervalId = null;

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        if (gameOverScreen) gameOverScreen.classList.add('hidden');
        if (deathVignette) deathVignette.classList.add('hidden');

        // Sayaca geçerken eski yılan referansını temizle ve respawning durumuna geç
        gameState.isRespawning = true;
        gameState.player = null;

        if (respawnIntervalId) {
            clearInterval(respawnIntervalId);
            respawnIntervalId = null;
        }

        let secondsLeft = calculateRespawnDelay();
        if (respawnOverlay && respawnTimerNumber) {
            respawnTimerNumber.textContent = secondsLeft;
            respawnOverlay.classList.remove('hidden');
        }

        respawnIntervalId = setInterval(() => {
            secondsLeft--;
            if (respawnTimerNumber) respawnTimerNumber.textContent = secondsLeft;
            if (secondsLeft <= 0) {
                clearInterval(respawnIntervalId);
                respawnIntervalId = null;
                if (respawnOverlay) respawnOverlay.classList.add('hidden');
                gameState.isRespawning = false;
                joinGame();
            }
        }, 1000);
    });
}

// Input Handlers
function handleInput(clientX, clientY) {
    if (!gameState.isStarted || !gameState.player || gameState.isGameOver || gameState.isDeadWatching || gameState.isRespawning) return;
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

let lastMouseClickTime = 0;
window.addEventListener('mousedown', (e) => {
    if (!gameState.isStarted || gameState.isGameOver || gameState.isDeadWatching || gameState.isRespawning || !gameState.player) return;
    if (e.target.closest('#emoji-bar') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    const now = Date.now();
    if (now - lastMouseClickTime < 320) {
        gameState.player.triggerBoost();
    }
    lastMouseClickTime = now;
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gameState.player && !gameState.isDeadWatching) {
        gameState.player.triggerBoost();
    }
});

let lastTouchTime = 0;
window.addEventListener('touchstart', (e) => {
    if (!gameState.isStarted || gameState.isGameOver || gameState.isDeadWatching || gameState.isRespawning) return;
    if (e.target.closest('#emoji-bar') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
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
    if (!gameState.isStarted || gameState.isGameOver || gameState.isDeadWatching || gameState.isRespawning || !gameState.player) return;
    if (e.target.closest('#emoji-bar')) return;
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

window.addEventListener('touchend', (e) => {
    if (e.target.closest('#emoji-bar')) return;
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
    const camX = gameState.player ? gameState.player.x : gameState.deathCameraPos.x;
    const camY = gameState.player ? gameState.player.y : gameState.deathCameraPos.y;
    const mapSize = 140;
    const mapX = canvas.width - mapSize - 20;
    const mapY = 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapSize, mapSize);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    const scale = mapSize / ARENA_WIDTH;
    const radarFoodRadiusSq = 1200 * 1200;

    for (let i = 0; i < gameState.foods.length; i++) {
        const food = gameState.foods[i];
        const dx = food.x - camX;
        const dy = food.y - camY;
        if (dx * dx + dy * dy <= radarFoodRadiusSq) {
            ctx.fillStyle = food.color;
            ctx.fillRect(mapX + food.x * scale, mapY + food.y * scale, 1.5, 1.5);
        }
    }

    // Güç kürelerini radarda parlat
    for (const pw of gameState.powerUps) {
        ctx.beginPath();
        ctx.arc(mapX + pw.x * scale, mapY + pw.y * scale, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffff00';
        ctx.fill();
    }

    // Yılanları çiz (Hayalet modundakiler radarda görünmez!)
    for (const [id, snake] of gameState.snakes) {
        const isGhost = snake.activePower === 'ghost' && snake.powerExpires > Date.now();
        if (isGhost && !snake.isPlayer) continue;

        const head = snake.segments[0];
        ctx.beginPath();
        ctx.arc(mapX + head.x * scale, mapY + head.y * scale, snake.isPlayer ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = snake.color;
        ctx.fill();

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
        const killTag = sn.kills > 0 ? ` 💀${sn.kills}` : '';
        nameSpan.textContent = `${i + 1}. ${sn.name}${killTag}`;
        const scoreSpan = document.createElement('span');
        scoreSpan.textContent = sn.segments.length;
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState.player && !gameState.isDeadWatching) return;

    const camX = gameState.player ? gameState.player.x : gameState.deathCameraPos.x;
    const camY = gameState.player ? gameState.player.y : gameState.deathCameraPos.y;

    let targetScale = 1.0;
    if (gameState.player) {
        const pRadius = gameState.player.getCurrentRadius();
        targetScale = Math.max(0.65, Math.min(1.0, 11 / pRadius));
    }
    gameState.currentCameraScale += (targetScale - gameState.currentCameraScale) * 0.05;
    const scale = gameState.currentCameraScale;

    const halfW = (canvas.width / 2) / scale;
    const halfH = (canvas.height / 2) / scale;
    view.l = camX - halfW - 80;
    view.r = camX + halfW + 80;
    view.t = camY - halfH - 80;
    view.b = camY + halfH + 80;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

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
        ctx.fill();
    }

    // Hareketli Güç Kürelerini Çiz (Süzülen neon küreler)
    const pwEmojis = { magnet: '🧲', ghost: '👻', titan: '🍄', speed: '⚡' };
    const pwColors = { magnet: '#ffff00', ghost: '#aa88ff', titan: '#ff3366', speed: '#00ffff' };
    for (const pw of gameState.powerUps) {
        if (pw.x < view.l || pw.x > view.r || pw.y < view.t || pw.y > view.b) continue;
        const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
        const col = pwColors[pw.type] || '#ffff00';

        ctx.save();
        ctx.beginPath();
        ctx.arc(pw.x, pw.y, pw.radius + pulse * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(25, 25, 35, 0.85)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = col;
        ctx.shadowBlur = 15;
        ctx.shadowColor = col;
        ctx.stroke();

        ctx.font = '14px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(pwEmojis[pw.type] || '⭐', pw.x, pw.y + 1);
        ctx.restore();
    }

    // Yılanları çiz
    for (const [id, snake] of gameState.snakes) {
        snake.draw(ctx);
    }

    ctx.restore();

    if (gameState.isStarted) {
        drawJoystick();
        drawMiniMap();
        updateLeaderboard();
    }
}

// --- EMOJİ SOHBETİ & KAYDIRMA ETKİLEŞİMİ ---
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

    // Emoji panelindeki tıklama ve dokunmaların yılanı yönlendirmesini kesin olarak engelle
    ['mousedown', 'touchstart', 'pointerdown', 'mousemove', 'touchmove'].forEach(evt => {
        bar.addEventListener(evt, (e) => {
            e.stopPropagation();
        }, { passive: false });
    });

    // Masaüstünde fare tekerleğiyle yatay kaydırma
    bar.addEventListener('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        bar.scrollLeft += e.deltaY;
    }, { passive: false });

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
    if (!gameState.isStarted || gameState.isGameOver || gameState.isDeadWatching || !gameState.player) return;
    socket.emit('sendChat', { text: text });
}

function scheduleNextRandomQuote() {
    const delay = 22000 + Math.random() * 16000;
    setTimeout(() => {
        if (gameState.isStarted && !gameState.isGameOver && !gameState.isDeadWatching && gameState.player) {
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
