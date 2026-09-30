from pathlib import Path

app_js = r'''import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyATN0RAboQ4C4CFbaCMQ6OVI-aFTdCAX0I",
  authDomain: "mulmi-a0342.firebaseapp.com",
  databaseURL: "https://mulmi-a0342-default-rtdb.firebaseio.com",
  projectId: "mulmi-a0342",
  storageBucket: "mulmi-a0342.firebasestorage.app",
  messagingSenderId: "343509428835",
  appId: "1:343509428835:web:173ffd2dc94239f311a656"
};

const ROWS = 31;
const COLS = 17;
const MINES = 150;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUid = null;
let currentRoom = null;
let currentNick = null;
let roomState = null;
let unsubscribeRoom = null;
let selectedCell = null;
let resultShown = false;
let firebaseReady = false;

const $ = id => document.getElementById(id);

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function setHomeStatus(msg) {
  $("home-status").textContent = msg;
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function posKey(r, c) {
  return `${r}_${c}`;
}

function neighbors(r, c) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) result.push([rr, cc]);
    }
  }
  return result;
}

function randomMines() {
  const mines = [];
  while (mines.length < MINES) {
    const p = Math.floor(Math.random() * ROWS * COLS);
    if (!mines.includes(p)) mines.push(p);
  }
  return mines;
}

function makeGame() {
  return {
    rows: ROWS,
    cols: COLS,
    mines: MINES,
    minePositions: randomMines(),
    opened: {},
    flags: {},
    firstDigDone: false,
    status: "playing",
    createdAt: Date.now(),
    players: {}
  };
}

function mineSet(state) {
  return new Set(state.minePositions || []);
}

function counts(state) {
  const mines = mineSet(state);
  const result = {};

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = r * COLS + c;
      const key = posKey(r, c);

      if (mines.has(p)) {
        result[key] = -1;
        continue;
      }

      let count = 0;
      for (const [rr, cc] of neighbors(r, c)) {
        if (mines.has(rr * COLS + cc)) count++;
      }
      result[key] = count;
    }
  }

  return result;
}

function fiveByFive(r, c) {
  const result = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) result.push([rr, cc]);
    }
  }
  return result;
}

function floodOpen(state, startR, startC) {
  const mines = mineSet(state);
  const opened = { ...(state.opened || {}) };
  const flags = state.flags || {};
  const queue = [[startR, startC]];
  const seen = new Set();

  while (queue.length) {
    const [r, c] = queue.shift();
    const key = posKey(r, c);

    if (seen.has(key) || opened[key] || flags[key]) continue;
    seen.add(key);

    if (mines.has(r * COLS + c)) continue;

    opened[key] = currentUid;

    for (const [nr, nc] of neighbors(r, c)) {
      const nk = posKey(nr, nc);
      if (!seen.has(nk) && !mines.has(nr * COLS + nc) && !flags[nk]) {
        queue.push([nr, nc]);
      }
    }
  }

  return opened;
}

function isWin(state) {
  const mines = mineSet(state);
  const flags = state.flags || {};

  for (const p of mines) {
    const r = Math.floor(p / COLS);
    const c = p % COLS;
    if (!flags[posKey(r, c)]) return false;
  }
  return true;
}

async function boot() {
  try {
    const credential = await signInAnonymously(auth);
    currentUid = credential.user.uid;
    firebaseReady = true;
    setHomeStatus("");
  } catch (error) {
    console.error(error);
    setHomeStatus("Firebase 연결에 실패했어요. Authentication 설정을 확인해주세요.");
  }
}

function checkReady() {
  if (!firebaseReady || !currentUid) {
    setHomeStatus("아직 게임 서버에 연결 중이에요. 잠시 후 다시 눌러주세요.");
    return false;
  }
  return true;
}

async function createRoom() {
  if (!checkReady()) return;

  const nick = $("nickname").value.trim();
  if (!nick) {
    setHomeStatus("닉네임을 입력해주세요.");
    return;
  }

  setHomeStatus("방을 만드는 중…");

  try {
    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = randomCode();
      const snapshot = await get(ref(db, `rooms/${candidate}`));
      if (!snapshot.exists()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      setHomeStatus("방 생성에 실패했어요. 다시 시도해주세요.");
      return;
    }

    const state = makeGame();
    state.players[currentUid] = { nick, joinedAt: Date.now() };
    await set(ref(db, `rooms/${code}`), state);
    enterRoom(code, nick);
  } catch (error) {
    console.error(error);
    setHomeStatus("방을 만들 수 없어요. Firebase 설정이나 인터넷 연결을 확인해주세요.");
  }
}

async function joinRoom() {
  if (!checkReady()) return;

  const nick = $("nickname").value.trim();
  const code = $("room-code").value.trim();

  if (!nick) {
    setHomeStatus("닉네임을 입력해주세요.");
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    setHomeStatus("6자리 방 코드를 입력해주세요.");
    return;
  }

  setHomeStatus("방을 찾는 중…");

  try {
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      setHomeStatus("존재하지 않는 방이에요. 코드를 확인해주세요.");
      return;
    }

    const state = snapshot.val();

    if (state.status !== "playing") {
      setHomeStatus("이미 끝난 방이에요. 새 방을 만들어주세요.");
      return;
    }

    await update(roomRef, {
      [`players/${currentUid}`]: { nick, joinedAt: Date.now() }
    });

    enterRoom(code, nick);
  } catch (error) {
    console.error(error);
    setHomeStatus("방에 들어갈 수 없어요. 인터넷 연결을 확인해주세요.");
  }
}

function enterRoom(code, nick) {
  currentRoom = code;
  currentNick = nick;
  resultShown = false;

  $("page-home").classList.remove("active");
  $("page-game").classList.add("active");
  $("room-code-display").textContent = code;

  listenRoom();
  onDisconnect(ref(db, `rooms/${code}/players/${currentUid}`)).remove();
}

function listenRoom() {
  if (unsubscribeRoom) unsubscribeRoom();

  unsubscribeRoom = onValue(ref(db, `rooms/${currentRoom}`), snapshot => {
    roomState = snapshot.val();

    if (!roomState) {
      leaveRoom(false);
      return;
    }

    renderRoom();
  });
}

function renderRoom() {
  if (!roomState) return;

  const flagCount = Object.keys(roomState.flags || {}).length;
  $("mine-count").textContent = Math.max(0, MINES - flagCount);
  $("flag-count").textContent = flagCount;

  $("game-status").textContent =
    roomState.status === "playing"
      ? "게임 진행 중"
      : roomState.status === "won"
        ? "🎉 모든 지뢰를 찾았습니다!"
        : "💥 지뢰가 터졌습니다!";

  const players = $("players");
  players.innerHTML = "";

  Object.values(roomState.players || {}).forEach(player => {
    const span = document.createElement("span");
    span.className = "player";
    span.textContent = player.nick + (player.nick === currentNick ? " (나)" : "");
    players.appendChild(span);
  });

  renderBoard();

  if (roomState.status !== "playing" && !resultShown) {
    resultShown = true;
    showResult(roomState.status);
  }
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  const cnt = counts(roomState);
  const mines = mineSet(roomState);
  const opened = roomState.opened || {};
  const flags = roomState.flags || {};

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = posKey(r, c);
      const button = document.createElement("button");

      button.className = "cell";
      button.dataset.r = r;
      button.dataset.c = c;

      if (flags[key]) {
        button.classList.add("flag");
        button.textContent = "🚩";
      } else if (opened[key]) {
        button.classList.add("open");
        const number = cnt[key];
        if (number > 0) {
          button.textContent = number;
          button.classList.add(`n${number}`);
        }
      }

      if (roomState.status !== "playing" && mines.has(r * COLS + c)) {
        button.classList.add("mine");
        button.textContent = "💣";
      }

      button.addEventListener("click", () => openAction(r, c, button));
      board.appendChild(button);
    }
  }
}

function openAction(r, c, cellElement) {
  if (!roomState || roomState.status !== "playing") return;

  const key = posKey(r, c);
  if (roomState.opened?.[key]) return;

  selectedCell = [r, c];

  $("action-title").textContent = `${r + 1}행 ${c + 1}열`;

  const modal = $("action-modal");
  const card = modal.querySelector(".modal-card");

  modal.classList.remove("hidden");
  card.style.left = "0px";
  card.style.top = "0px";

  requestAnimationFrame(() => {
    const rect = cellElement.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const margin = 8;

    let left = rect.left + rect.width / 2 - cardRect.width / 2;
    let top = rect.top - cardRect.height - 10;

    if (left < margin) left = margin;
    if (left + cardRect.width > window.innerWidth - margin) {
      left = window.innerWidth - cardRect.width - margin;
    }

    if (top < margin) top = rect.bottom + 10;
    if (top + cardRect.height > window.innerHeight - margin) {
      top = window.innerHeight - cardRect.height - margin;
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  });
}

function closeAction() {
  $("action-modal").classList.add("hidden");
  selectedCell = null;
}

async function dig() {
  if (!selectedCell) return;

  const [r, c] = selectedCell;
  closeAction();

  const p = r * COLS + c;
  const key = posKey(r, c);

  if (roomState.flags?.[key]) {
    showToast("먼저 깃발을 해제해주세요.");
    return;
  }

  try {
    await runTransaction(ref(db, `rooms/${currentRoom}`), state => {
      if (!state || state.status !== "playing") return state;

      const opened = state.opened || {};
      const flags = state.flags || {};

      if (opened[key] || flags[key]) return state;

      const mines = new Set(state.minePositions || []);

      if (!state.firstDigDone) {
        state.firstDigDone = true;

        if (mines.has(p)) {
          state.status = "lost";
          state.opened = { ...opened, [key]: currentUid };
          return state;
        }

        for (const [rr, cc] of fiveByFive(r, c)) {
          const pp = rr * COLS + cc;
          const kk = posKey(rr, cc);

          if (!mines.has(pp) && !flags[kk]) {
            state.opened = {
              ...(state.opened || {}),
              [kk]: currentUid
            };
          }
        }

        return state;
      }

      if (mines.has(p)) {
        state.status = "lost";
        state.opened = { ...opened, [key]: currentUid };
        return state;
      }

      state.opened = floodOpen(state, r, c);
      return state;
    });
  } catch (error) {
    console.error(error);
    showToast("땅 파기에 실패했어요.");
  }
}

async function toggleFlag() {
  if (!selectedCell) return;

  const [r, c] = selectedCell;
  closeAction();

  const key = posKey(r, c);

  try {
    await runTransaction(ref(db, `rooms/${currentRoom}`), state => {
      if (!state || state.status !== "playing") return state;

      const opened = state.opened || {};
      if (opened[key]) return state;

      state.flags = state.flags || {};

      if (state.flags[key]) delete state.flags[key];
      else state.flags[key] = currentUid;

      if (isWin(state)) state.status = "won";

      return state;
    });
  } catch (error) {
    console.error(error);
    showToast("깃발을 세울 수 없어요.");
  }
}

function showResult(status) {
  $("result-emoji").textContent = status === "won" ? "🎉" : "💥";
  $("result-title").textContent = status === "won" ? "성공!" : "실패!";
  $("result-text").textContent =
    status === "won"
      ? "모든 지뢰에 깃발을 세웠어요!"
      : "지뢰를 밟았어요! 다음 판에 도전해보세요.";

  $("result-modal").classList.remove("hidden");
}

async function again() {
  if (!currentRoom) return;

  try {
    let newCode = "";

    for (let i = 0; i < 10; i++) {
      const candidate = randomCode();
      const snapshot = await get(ref(db, `rooms/${candidate}`));

      if (!snapshot.exists()) {
        newCode = candidate;
        break;
      }
    }

    if (!newCode) {
      showToast("새 방을 만들지 못했어요.");
      return;
    }

    const state = makeGame();
    state.players[currentUid] = {
      nick: currentNick,
      joinedAt: Date.now()
    };

    await set(ref(db, `rooms/${newCode}`), state);
    await set(ref(db, `rooms/${currentRoom}/players/${currentUid}`), null);

    $("result-modal").classList.add("hidden");

    if (unsubscribeRoom) {
      unsubscribeRoom();
      unsubscribeRoom = null;
    }

    enterRoom(newCode, currentNick);
  } catch (error) {
    console.error(error);
    showToast("새 게임을 만들 수 없어요.");
  }
}

async function leaveRoom(showHome = true) {
  $("result-modal").classList.add("hidden");
  $("action-modal").classList.add("hidden");

  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  if (currentRoom && currentUid) {
    await set(ref(db, `rooms/${currentRoom}/players/${currentUid}`), null).catch(() => {});
  }

  currentRoom = null;
  roomState = null;
  selectedCell = null;

  if (showHome) {
    $("page-game").classList.remove("active");
    $("page-home").classList.add("active");
    setHomeStatus("");
  }
}

$("create-room").onclick = createRoom;
$("join-room").onclick = joinRoom;
$("dig-btn").onclick = dig;
$("flag-btn").onclick = toggleFlag;
$("cancel-btn").onclick = closeAction;
$("leave-room").onclick = () => leaveRoom(true);
$("result-leave-btn").onclick = () => leaveRoom(true);
$("again-btn").onclick = again;

if ($("copy-code")) {
  $("copy-code").onclick = async () => {
    try {
      await navigator.clipboard.writeText(currentRoom);
      showToast("방 코드를 복사했어요!");
    } catch {
      showToast("코드를 직접 복사해주세요.");
    }
  };
}

$("room-code").addEventListener("input", event => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
});

boot();
'''

style_css = r''':root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f4f5f7;
  background: #0f1115;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at 50% 0, #252936, #0f1115 65%);
}

button,
input {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

.page {
  display: none;
  width: 100%;
  min-height: 100vh;
}

.page.active {
  display: flex;
}

.home-card {
  width: min(92vw, 440px);
  margin: auto;
  padding: 34px 28px;
  background: #191c23;
  border: 1px solid #303541;
  border-radius: 24px;
  box-shadow: 0 18px 60px #0007;
  text-align: center;
}

.logo {
  font-size: 52px;
}

.home-card h1 {
  margin: 8px 0 6px;
  font-size: 32px;
}

.sub {
  margin: 0 0 28px;
  color: #aeb5c2;
}

.home-card label {
  display: block;
  text-align: left;
  margin: 14px 0 7px;
  color: #cbd0da;
  font-size: 14px;
}

.home-card input {
  width: 100%;
  padding: 14px 15px;
  border: 1px solid #3a404d;
  border-radius: 12px;
  background: #101217;
  color: #fff;
  outline: none;
}

.home-card input:focus {
  border-color: #7b8cff;
}

.home-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 20px;
}

.primary {
  background: #6878ff;
  color: white;
}

.secondary {
  background: #2a2e38;
  color: #e8ebf1;
}

.flag-action {
  background: #3b3320;
  color: #ffd76a;
}

.status {
  min-height: 20px;
  color: #ff8f8f;
  font-size: 13px;
}

.home-card details {
  text-align: left;
  color: #aeb5c2;
  font-size: 13px;
  margin-top: 18px;
}

.home-card summary {
  cursor: pointer;
  color: #dfe3eb;
}

#page-game {
  flex-direction: column;
  height: 100vh;
  min-height: 0;
}

.game-header {
  position: relative;
  flex: 0 0 10vh;
  height: 10vh;
  min-height: 68px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px max(12px, calc((100vw - 900px) / 2));
  background: #15171de8;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #2b2f38;
  z-index: 3;
}

.small-title {
  font-size: 9px;
  letter-spacing: .12em;
  color: #818999;
}

.room-line {
  font-size: 14px;
}

.room-line strong {
  letter-spacing: .18em;
  margin-left: 5px;
}

.tiny {
  padding: 5px 8px;
  margin-left: 5px;
  font-size: 11px;
  background: #2b303a;
  color: #fff;
}

.stats {
  display: flex;
  gap: 10px;
  font-size: 13px;
}

.players {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 10vh;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

.player {
  padding: 4px 8px;
  border-radius: 99px;
  background: #20242d;
  color: #dce0e8;
  font-size: 10px;
}

.game-status {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(10vh + 27px);
  text-align: center;
  font-size: 11px;
  color: #9da6b5;
  z-index: 2;
  pointer-events: none;
}

.board-wrap {
  flex: 0 0 80vh;
  height: 80vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  padding: 12px 6px;
}

.board {
  display: grid;
  grid-template-columns: repeat(17, 1fr);
  grid-template-rows: repeat(31, 1fr);
  gap: 2px;
  width: min(calc(100vw - 12px), 44vh);
  aspect-ratio: 17 / 31;
  margin: auto;
}

.cell {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-radius: 4px;
  background: #373d49;
  color: #e9edf5;
  font-size: clamp(9px, 1.8vw, 15px);
  font-weight: 800;
  touch-action: manipulation;
  transition: filter .08s, transform .08s;
}

.cell:hover {
  filter: brightness(1.12);
}

.cell:active {
  transform: scale(.94);
}

.cell.open {
  background: #20242c;
}

.cell.flag {
  background: #44391f;
  color: #ffd76a;
}

.cell.mine {
  background: #7b3030;
}

.cell.n1 { color: #70a7ff; }
.cell.n2 { color: #75d58b; }
.cell.n3 { color: #ff7777; }
.cell.n4 { color: #b38cff; }
.cell.n5,
.cell.n6,
.cell.n7,
.cell.n8 { color: #ffca6b; }

.hint {
  flex: 0 0 auto;
  text-align: center;
  color: #737c8c;
  font-size: 11px;
  margin: 2px 0 4px;
}

.leave {
  flex: 0 0 auto;
  display: block;
  margin: 0 auto 5px;
  padding: 7px 12px;
  background: #252a33;
  color: #b9c0cc;
  font-size: 11px;
}

#action-modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background: transparent;
  display: block;
  padding: 0;
}

#action-modal.hidden {
  display: none;
}

#action-modal .modal-card {
  position: fixed;
  width: 145px;
  padding: 10px;
  background: #191c23;
  border: 1px solid #424856;
  border-radius: 15px;
  box-shadow: 0 12px 35px #000b;
  text-align: center;
  pointer-events: auto;
  transform-origin: center bottom;
  animation: bubbleIn .12s ease-out;
}

#action-modal .modal-card::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 9px solid #191c23;
}

#action-modal .modal-card h2 {
  margin: 1px 0 8px;
  font-size: 11px;
  color: #aeb5c2;
  font-weight: 600;
}

.action-buttons {
  display: grid;
  gap: 6px;
  margin-top: 0;
}

.action-buttons button {
  padding: 8px;
  border-radius: 9px;
  font-size: 12px;
}

#result-modal {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0009;
}

#result-modal.hidden {
  display: none;
}

.result-card {
  width: min(92vw, 380px);
  padding: 25px;
  background: #191c23;
  border: 1px solid #343946;
  border-radius: 22px;
  box-shadow: 0 20px 70px #000b;
  text-align: center;
}

.result-emoji {
  font-size: 54px;
}

.result-card h2 {
  font-size: 28px;
  margin: 8px 0;
}

.result-card p {
  color: #aeb5c2;
}

.result-buttons {
  display: grid;
  gap: 9px;
  margin-top: 18px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 25px;
  transform: translate(-50%, 20px);
  opacity: 0;
  pointer-events: none;
  padding: 10px 15px;
  border-radius: 10px;
  background: #303641;
  color: white;
  transition: .2s;
  z-index: 30;
  font-size: 13px;
}

.toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}

@keyframes bubbleIn {
  from {
    opacity: 0;
    transform: translateY(4px) scale(.92);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 420px) {
  .game-header {
    padding: 7px 8px;
  }

  .room-line {
    font-size: 12px;
  }

  .stats {
    gap: 5px;
    font-size: 11px;
  }

  .board-wrap {
    padding: 8px 4px;
  }

  .board {
    width: min(calc(100vw - 8px), 44vh);
    gap: 1px;
  }

  .cell {
    border-radius: 3px;
  }

  .player {
    font-size: 9px;
  }
}
'''

Path("/mnt/data/app.js").write_text(app_js, encoding="utf-8")
Path("/mnt/data/style.css").write_text(style_css, encoding="utf-8")
print("created", Path("/mnt/data/app.js").stat().st_size, Path("/mnt/data/style.css").stat().st_size)
