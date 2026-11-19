"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const finalScoreElement = document.getElementById("final-score");

const startScreen = document.getElementById("start-screen");
const gameOverScreen = document.getElementById("game-over-screen");
const leaderboardOverlay = document.getElementById("leaderboard-overlay");
const leaderboardList = document.getElementById("leaderboard-list");
const emptyLeaderboard = document.getElementById("empty-leaderboard");

const STORAGE_KEY = "coinDashLeaderboard";
const MAX_SCORES = 5;
const GROUND_Y = 330;

let audioContext = null;
let soundEnabled = true;
let gameRunning = false;
let animationId = null;
let lastTime = 0;
let score = 0;
let elapsed = 0;
let obstacleTimer = 0;
let coinTimer = 0;

const player = {
  x: 90,
  y: GROUND_Y - 42,
  width: 38,
  height: 42,
  velocityY: 0,
  grounded: true
};

const obstacles = [];
const coins = [];

function getLeaderboard() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved
      .filter(item =>
        item &&
        typeof item.name === "string" &&
        Number.isFinite(item.score)
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (error) {
    console.warn("Could not read leaderboard:", error);
    return [];
  }
}

function saveLeaderboard(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    return true;
  } catch (error) {
    console.warn("Could not save leaderboard:", error);
    return false;
  }
}

function updateBestScore() {
  const scores = getLeaderboard();
  bestScoreElement.textContent = scores[0] ? scores[0].score : "0";
}

function renderLeaderboard() {
  const scores = getLeaderboard();
  leaderboardList.replaceChildren();

  emptyLeaderboard.classList.toggle("hidden", scores.length > 0);

  scores.forEach((entry, index) => {
    const item = document.createElement("li");
    item.append(document.createTextNode(`${entry.name} `));

    const points = document.createElement("span");
    points.textContent = `${entry.score} pts`;
    item.append(points);

    leaderboardList.append(item);
  });
}

function ensureAudio() {
  if (!soundEnabled) return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playTone(frequency, duration, type = "sine", volume = 0.08, endFrequency = frequency) {
  const audio = ensureAudio();
  if (!audio) return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    now + duration
  );

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playJumpSound() {
  playTone(360, 0.13, "square", 0.045, 620);
}

function playCoinSound() {
  playTone(660, 0.10, "sine", 0.07, 990);
  window.setTimeout(() => playTone(990, 0.12, "sine", 0.05, 1320), 75);
}

function playGameOverSound() {
  playTone(300, 0.30, "sawtooth", 0.05, 95);
}

function resetGame() {
  score = 0;
  elapsed = 0;
  obstacleTimer = 0;
  coinTimer = 0;
  obstacles.length = 0;
  coins.length = 0;

  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
  player.grounded = true;

  scoreElement.textContent = "0";
  document.getElementById("save-message").textContent = "";
  document.getElementById("player-name").value = "";
}

function startGame() {
  if (gameRunning) return;

  ensureAudio();
  resetGame();

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  gameRunning = true;
  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function jump() {
  if (!gameRunning) return;

  if (player.grounded) {
    player.velocityY = -650;
    player.grounded = false;
    playJumpSound();
  }
}

function endGame() {
  if (!gameRunning) return;

  gameRunning = false;
  cancelAnimationFrame(animationId);
  playGameOverSound();

  finalScoreElement.textContent = score;
  gameOverScreen.classList.remove("hidden");
}

function addObstacle() {
  const height = 30 + Math.random() * 32;
  obstacles.push({
    x: canvas.width + 10,
    y: GROUND_Y - height,
    width: 24 + Math.random() * 18,
    height
  });
}

function addCoin() {
  coins.push({
    x: canvas.width + 10,
    y: GROUND_Y - 80 - Math.random() * 90,
    radius: 10,
    collected: false
  });
}

function overlaps(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function collectCoins() {
  for (const coin of coins) {
    if (coin.collected) continue;

    const coinBox = {
      x: coin.x - coin.radius,
      y: coin.y - coin.radius,
      width: coin.radius * 2,
      height: coin.radius * 2
    };

    if (overlaps(player, coinBox)) {
      coin.collected = true;
      score += 10;
      playCoinSound();
    }
  }
}

function update(delta) {
  elapsed += delta;

  const speed = Math.min(420, 260 + elapsed * 5);

  player.velocityY += 1500 * delta;
  player.y += player.velocityY * delta;

  if (player.y + player.height >= GROUND_Y) {
    player.y = GROUND_Y - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  obstacleTimer += delta;
  coinTimer += delta;

  if (obstacleTimer > Math.max(0.75, 1.45 - elapsed * 0.012)) {
    addObstacle();
    obstacleTimer = 0;
  }

  if (coinTimer > 1.8) {
    addCoin();
    coinTimer = 0;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= speed * delta;
    if (overlaps(player, obstacle)) {
      endGame();
      return;
    }
  }

  for (const coin of coins) {
    coin.x -= speed * delta;
  }

  while (obstacles.length && obstacles[0].x + obstacles[0].width < 0) {
    obstacles.shift();
    score += 1;
  }

  while (coins.length && coins[0].x + coins[0].radius < 0) {
    coins.shift();
  }

  collectCoins();
  scoreElement.textContent = score;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background decorations
  ctx.fillStyle = "#ffffff18";
  for (let i = 0; i < 6; i++) {
    const x = (i * 170 + 45 - elapsed * 12) % (canvas.width + 100);
    ctx.beginPath();
    ctx.arc(x, 75 + (i % 3) * 35, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground
  ctx.fillStyle = "#43d9a3";
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  ctx.fillStyle = "#b8ffe5";
  ctx.fillRect(0, GROUND_Y, canvas.width, 5);

  // Player
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillStyle = "#17243a";
  ctx.fillRect(player.x + 25, player.y + 9, 5, 5);

  // Obstacles
  ctx.fillStyle = "#ff6b6b";
  for (const obstacle of obstacles) {
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }

  // Coins
  for (const coin of coins) {
    if (coin.collected) continue;

    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff2bd";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function gameLoop(timestamp) {
  if (!gameRunning) return;

  const delta = Math.min((timestamp - lastTime) / 1000, 0.04);
  lastTime = timestamp;

  update(delta);
  draw();

  if (gameRunning) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function saveCurrentScore() {
  const nameInput = document.getElementById("player-name");
  const message = document.getElementById("save-message");
  const name = nameInput.value.trim().slice(0, 16) || "Player";

  const scores = getLeaderboard();
  scores.push({
    name,
    score,
    date: new Date().toISOString()
  });

  scores.sort((a, b) => b.score - a.score);
  const topScores = scores.slice(0, MAX_SCORES);

  if (!saveLeaderboard(topScores)) {
    message.textContent = "Could not save scores in this browser.";
    return;
  }

  message.textContent = "Score saved!";
  updateBestScore();
  renderLeaderboard();
}

document.getElementById("start-button").addEventListener("click", startGame);
document.getElementById("restart-button").addEventListener("click", startGame);
document.getElementById("save-score-button").addEventListener("click", saveCurrentScore);

document.getElementById("leaderboard-button").addEventListener("click", () => {
  renderLeaderboard();
  leaderboardOverlay.classList.remove("hidden");
});

document.getElementById("close-leaderboard-button").addEventListener("click", () => {
  leaderboardOverlay.classList.add("hidden");
});

leaderboardOverlay.addEventListener("click", event => {
  if (event.target === leaderboardOverlay) {
    leaderboardOverlay.classList.add("hidden");
  }
});

document.getElementById("clear-scores-button").addEventListener("click", () => {
  if (!window.confirm("Clear all saved leaderboard scores?")) return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    updateBestScore();
    renderLeaderboard();
  } catch (error) {
    console.warn("Could not clear leaderboard:", error);
  }
});

document.getElementById("sound-button").addEventListener("click", event => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
  event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));

  if (soundEnabled) ensureAudio();
});

window.addEventListener("keydown", event => {
  if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
    event.preventDefault();

    if (!gameRunning && !gameOverScreen.classList.contains("hidden")) {
      return;
    }

    if (!gameRunning && !startScreen.classList.contains("hidden")) {
      startGame();
    } else {
      jump();
    }
  }

  if (event.code === "Escape") {
    leaderboardOverlay.classList.add("hidden");
  }
});

canvas.addEventListener("pointerdown", () => {
  if (!gameRunning && !startScreen.classList.contains("hidden")) {
    startGame();
  } else {
    jump();
  }
});

updateBestScore();
draw();