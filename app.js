/*
  멀티 지뢰찾기
  GitHub Pages + Firebase Realtime Database

  게임판: 31행 × 17열
  지뢰: 150개
*/

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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


// ============================================================
// Firebase 설정
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyATN0RAboQ4C4CFbaCMQ6OVI-aFTdCAX0I",
  authDomain: "mulmi-a0342.firebaseapp.com",
  databaseURL: "https://mulmi-a0342-default-rtdb.firebaseio.com",
  projectId: "mulmi-a0342",
  storageBucket: "mulmi-a0342.firebasestorage.app",
  messagingSenderId: "343509428835",
  appId: "1:343509428835:web:173ffd2dc94239f311a656"
};


// ============================================================
// 게임 설정
// ============================================================

const ROWS = 31;
const COLS = 17;
const MINES = 150;


// ============================================================
// 전역 상태
// ============================================================

let app = null;
let auth = null;
let db = null;

let currentUid = null;
let currentRoom = null;
let currentNick = null;

let roomState = null;
let selectedCell = null;
let unsubscribeRoom = null;

let firebaseReady = false;
let resultShown = false;


// ============================================================
// HTML 요소
// ============================================================

const $ = id => document.getElementById(id);

const home = $("page-home");
const game = $("page-game");


// ============================================================
// 기본 함수
// ============================================================

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


function setHomeStatus(message) {
  const status = $("home-status");

  if (status) {
    status.textContent = message;
  }
}


function randomCode() {
  return String(
    Math.floor(100000 + Math.random() * 900000)
  );
}


function posKey(row, col) {
  return `${row}_${col}`;
}


function neighbors(row, col) {
  const result = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {

      if (dr === 0 && dc === 0) continue;

      const r = row + dr;
      const c = col + dc;

      if (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS
      ) {
        result.push([r, c]);
      }
    }
  }

  return result;
}


// ============================================================
// 지뢰 생성
// ============================================================

function randomMines() {

  const mines = new Set();

  while (mines.size < MINES) {

    const position =
      Math.floor(Math.random() * ROWS * COLS);

    mines.add(position);
  }

  return [...mines];
}


// ============================================================
// 새 게임 만들기
// ============================================================

function makeGame() {

  return {
    rows: ROWS,
    cols: COLS,
    mines: MINES,

    minePositions: randomMines(),

    opened: {},
    flags: {},

    status: "playing",

    createdAt: Date.now(),

    players: {}
  };
}


// ============================================================
// 지뢰 위치 세기
// ============================================================

function mineSet(state) {

  return new Set(
    state?.minePositions || []
  );
}


function counts(state) {

  const mines = mineSet(state);

  const result = {};

  for (let r = 0; r < ROWS; r++) {

    for (let c = 0; c < COLS; c++) {

      const position = r * COLS + c;
      const key = posKey(r, c);

      if (mines.has(position)) {

        result[key] = -1;
        continue;
      }

      let count = 0;

      for (const [nr, nc] of neighbors(r, c)) {

        const neighborPosition =
          nr * COLS + nc;

        if (mines.has(neighborPosition)) {
          count++;
        }
      }

      result[key] = count;
    }
  }

  return result;
}


// ============================================================
// 빈 칸 자동 열기
// ============================================================

function floodOpen(state, row, col) {

  const mines = mineSet(state);
  const numbers = counts(state);

  const opened = {
    ...(state.opened || {})
  };

  const queue = [[row, col]];
  const visited = new Set();

  while (queue.length > 0) {

    const [r, c] = queue.shift();
    const key = posKey(r, c);

    if (visited.has(key)) continue;

    if (opened[key]) continue;

    if (state.flags?.[key]) continue;

    visited.add(key);

    const position = r * COLS + c;

    if (mines.has(position)) continue;

    opened[key] = currentUid;

    if (numbers[key] === 0) {

      for (const [nr, nc] of neighbors(r, c)) {

        queue.push([nr, nc]);
      }
    }
  }

  return opened;
}


// ============================================================
// 승리 확인
// ============================================================

function isWin(state) {

  const mines = mineSet(state);
  const flags = state.flags || {};

  for (const position of mines) {

    const row = Math.floor(position / COLS);
    const col = position % COLS;

    const key = posKey(row, col);

    if (!flags[key]) {
      return false;
    }
  }

  return true;
}


// ============================================================
// Firebase 초기화
// ============================================================

async function boot() {

  try {

    setHomeStatus("게임 서버에 연결하는 중…");

    app = initializeApp(firebaseConfig);

    auth = getAuth(app);

    db = getDatabase(app);

    /*
      중요:
      signInAnonymously가 끝난 뒤 바로 UID를 사용한다.
      기존 코드에서는 onAuthStateChanged보다
      방 만들기가 먼저 실행될 가능성이 있었다.
    */

    const credential =
      await signInAnonymously(auth);

    currentUid = credential.user.uid;

    firebaseReady = true;

    onAuthStateChanged(auth, user => {

      if (user) {
        currentUid = user.uid;
      }

    });

    setHomeStatus("");

    console.log("Firebase 연결 성공");

  } catch (error) {

    console.error("Firebase 초기화 실패:", error);

    firebaseReady = false;

    setHomeStatus(
      "Firebase 연결에 실패했어요. 잠시 후 다시 시도해주세요."
    );
  }
}


// ============================================================
// Firebase 준비 확인
// ============================================================

function checkReady() {

  if (!firebaseReady || !db || !currentUid) {

    setHomeStatus(
      "아직 게임 서버에 연결 중이에요. 잠시 후 다시 눌러주세요."
    );

    return false;
  }

  return true;
}


// ============================================================
// 방 생성
// ============================================================

async function createRoom() {

  if (!checkReady()) return;

  const nickname =
    $("nickname").value.trim();

  if (!nickname) {

    setHomeStatus(
      "닉네임을 입력해주세요."
    );

    return;
  }

  setHomeStatus("방을 만드는 중…");

  try {

    let roomCode = "";

    /*
      이미 존재하는 방과 겹치지 않는
      6자리 방 번호를 찾는다.
    */

    for (let i = 0; i < 20; i++) {

      const candidate = randomCode();

      const snapshot =
        await get(
          ref(db, `rooms/${candidate}`)
        );

      if (!snapshot.exists()) {

        roomCode = candidate;

        break;
      }
    }

    if (!roomCode) {

      setHomeStatus(
        "방 번호를 만들지 못했어요. 다시 시도해주세요."
      );

      return;
    }

    const state = makeGame();

    state.players[currentUid] = {

      nick: nickname,

      joinedAt: Date.now()
    };


    await set(
      ref(db, `rooms/${roomCode}`),
      state
    );


    console.log(
      "방 생성 성공:",
      roomCode
    );


    enterRoom(
      roomCode,
      nickname
    );

  } catch (error) {

    console.error(
      "방 생성 실패:",
      error
    );

    setHomeStatus(
      "방 생성에 실패했어요. Firebase 설정이나 인터넷 연결을 확인해주세요."
    );
  }
}


// ============================================================
// 방 참여
// ============================================================

async function joinRoom() {

  if (!checkReady()) return;

  const nickname =
    $("nickname").value.trim();

  const roomCode =
    $("room-code").value.trim();


  if (!nickname) {

    setHomeStatus(
      "닉네임을 입력해주세요."
    );

    return;
  }


  if (!/^\d{6}$/.test(roomCode)) {

    setHomeStatus(
      "6자리 방 코드를 입력해주세요."
    );

    return;
  }


  setHomeStatus(
    "방을 찾는 중…"
  );


  try {

    const roomRef =
      ref(db, `rooms/${roomCode}`);

    const snapshot =
      await get(roomRef);


    if (!snapshot.exists()) {

      setHomeStatus(
        "존재하지 않는 방이에요. 코드를 확인해주세요."
      );

      return;
    }


    const state = snapshot.val();


    if (state.status !== "playing") {

      setHomeStatus(
        "이미 끝난 방이에요. 새 방을 만들어주세요."
      );

      return;
    }


    await update(
      roomRef,
      {
        [`players/${currentUid}`]: {
          nick: nickname,
          joinedAt: Date.now()
        }
      }
    );


    enterRoom(
      roomCode,
      nickname
    );

  } catch (error) {

    console.error(
      "방 참여 실패:",
      error
    );

    setHomeStatus(
      "방 참여에 실패했어요. 잠시 후 다시 시도해주세요."
    );
  }
}


// ============================================================
// 방 입장
// ============================================================

function enterRoom(
  roomCode,
  nickname
) {

  currentRoom = roomCode;
  currentNick = nickname;

  resultShown = false;

  home.classList.remove("active");
  game.classList.add("active");

  $("room-code-display").textContent =
    roomCode;


  listenRoom();


  /*
    접속이 끊기면 해당 플레이어를
    자동으로 방에서 제거한다.
  */

  onDisconnect(
    ref(
      db,
      `rooms/${roomCode}/players/${currentUid}`
    )
  ).remove();
}


// ============================================================
// 실시간 방 감시
// ============================================================

function listenRoom() {

  if (unsubscribeRoom) {

    unsubscribeRoom();
    unsubscribeRoom = null;
  }


  const roomRef =
    ref(db, `rooms/${currentRoom}`);


  unsubscribeRoom =
    onValue(
      roomRef,
      snapshot => {

        const data = snapshot.val();

        if (!data) {

          roomState = null;

          leaveRoom(false);

          return;
        }


        roomState = data;

        renderRoom();
      },

      error => {

        console.error(
          "방 실시간 연결 오류:",
          error
        );

        showToast(
          "방 데이터를 불러오지 못했어요."
        );
      }
    );
}


// ============================================================
// 게임 화면 그리기
// ============================================================

function renderRoom() {

  if (!roomState) return;


  $("mine-count").textContent =
    MINES;


  $("flag-count").textContent =
    Object.keys(
      roomState.flags || {}
    ).length;


  if (roomState.status === "playing") {

    $("game-status").textContent =
      "게임 진행 중";

  } else if (roomState.status === "won") {

    $("game-status").textContent =
      "🎉 모든 지뢰를 찾았습니다!";

  } else {

    $("game-status").textContent =
      "💥 지뢰가 터졌습니다!";
  }


  /*
    플레이어 목록
  */

  const players =
    $("players");

  players.innerHTML = "";


  Object.values(
    roomState.players || {}
  ).forEach(player => {

    const span =
      document.createElement("span");

    span.className = "player";

    span.textContent =
      player.nick +
      (
        player.nick === currentNick
          ? " (나)"
          : ""
      );

    players.appendChild(span);
  });


  renderBoard();


  if (
    roomState.status !== "playing" &&
    !resultShown
  ) {

    resultShown = true;

    showResult(
      roomState.status
    );
  }
}


// ============================================================
// 게임판 그리기
// ============================================================

function renderBoard() {

  const board =
    $("board");

  board.innerHTML = "";


  const numbers =
    counts(roomState);

  const mines =
    mineSet(roomState);

  const opened =
    roomState.opened || {};

  const flags =
    roomState.flags || {};


  for (let r = 0; r < ROWS; r++) {

    for (let c = 0; c < COLS; c++) {

      const key =
        posKey(r, c);

      const button =
        document.createElement("button");

      button.className =
        "cell";

      button.dataset.r = r;
      button.dataset.c = c;


      /*
        깃발
      */

      if (flags[key]) {

        button.classList.add("flag");

        button.textContent = "🚩";
      }


      /*
        열린 칸
      */

      else if (opened[key]) {

        button.classList.add("open");

        const number =
          numbers[key];

        if (number > 0) {

          button.textContent =
            number;

          button.classList.add(
            `n${number}`
          );
        }
      }


      /*
        게임 종료 후 지뢰 표시
      */

      if (
        roomState.status !== "playing" &&
        mines.has(r * COLS + c)
      ) {

        button.classList.add("mine");

        button.textContent = "💣";
      }


      button.addEventListener(
        "click",
        () => openAction(r, c)
      );


      board.appendChild(button);
    }
  }
}


// ============================================================
// 칸 선택
// ============================================================

function openAction(
  row,
  col
) {

  if (
    !roomState ||
    roomState.status !== "playing"
  ) {
    return;
  }


  const key =
    posKey(row, col);


  if (
    roomState.opened?.[key]
  ) {
    return;
  }


  selectedCell = [
    row,
    col
  ];


  $("action-title").textContent =
    `${row + 1}행 ${col + 1}열`;


  $("action-modal")
    .classList
    .remove("hidden");
}


// ============================================================
// 행동창 닫기
// ============================================================

function closeAction() {

  $("action-modal")
    .classList
    .add("hidden");

  selectedCell = null;
}


// ============================================================
// 땅 파기
// ============================================================

async function dig() {

  if (!selectedCell) return;

  const [
    row,
    col
  ] = selectedCell;

  closeAction();


  const key =
    posKey(row, col);

  const position =
    row * COLS + col;


  if (
    roomState.flags?.[key]
  ) {

    showToast(
      "먼저 깃발을 해제해주세요."
    );

    return;
  }


  try {

    const roomRef =
      ref(db, `rooms/${currentRoom}`);


    await runTransaction(
      roomRef,
      state => {

        if (
          !state ||
          state.status !== "playing"
        ) {
          return state;
        }


        if (
          state.opened?.[key]
        ) {
          return state;
        }


        const mines =
          new Set(
            state.minePositions || []
          );


        /*
          지뢰를 밟음
        */

        if (
          mines.has(position)
        ) {

          state.status = "lost";

          state.opened = {
            ...(state.opened || {}),
            [key]: currentUid
          };

          return state;
        }


        /*
          안전한 칸
        */

        state.opened =
          floodOpen(
            state,
            row,
            col
          );


        return state;
      }
    );

  } catch (error) {

    console.error(
      "땅 파기 실패:",
      error
    );

    showToast(
      "동기화에 실패했어요. 다시 시도해주세요."
    );
  }
}


// ============================================================
// 깃발
// ============================================================

async function toggleFlag() {

  if (!selectedCell) return;

  const [
    row,
    col
  ] = selectedCell;

  closeAction();


  const key =
    posKey(row, col);


  try {

    const roomRef =
      ref(db, `rooms/${currentRoom}`);


    await runTransaction(
      roomRef,
      state => {

        if (
          !state ||
          state.status !== "playing"
        ) {
          return state;
        }


        if (
          state.opened?.[key]
        ) {
          return state;
        }


        state.flags =
          state.flags || {};


        /*
          이미 깃발이 있으면 제거
        */

        if (state.flags[key]) {

          delete state.flags[key];

        }

        /*
          없으면 깃발 설치
        */

        else {

          state.flags[key] =
            currentUid;
        }


        /*
          모든 지뢰에 깃발이 있으면 성공
        */

        if (isWin(state)) {

          state.status = "won";
        }


        return state;
      }
    );

  } catch (error) {

    console.error(
      "깃발 처리 실패:",
      error
    );

    showToast(
      "동기화에 실패했어요. 다시 시도해주세요."
    );
  }
}


// ============================================================
// 결과창
// ============================================================

function showResult(status) {

  $("result-emoji").textContent =
    status === "won"
      ? "🎉"
      : "💥";


  $("result-title").textContent =
    status === "won"
      ? "성공!"
      : "실패!";


  $("result-text").textContent =
    status === "won"
      ? "모든 지뢰에 깃발을 세웠어요!"
      : "지뢰를 밟았어요! 다음 판에 도전해보세요.";


  $("result-modal")
    .classList
    .remove("hidden");
}


// ============================================================
// 다시 플레이
// ============================================================

async function again() {

  if (
    !currentRoom ||
    !currentUid
  ) {
    return;
  }


  try {

    const oldRoom =
      currentRoom;


    /*
      새로운 방 번호 생성
    */

    let newRoom = "";

    for (let i = 0; i < 20; i++) {

      const candidate =
        randomCode();

      const snapshot =
        await get(
          ref(db, `rooms/${candidate}`)
        );

      if (!snapshot.exists()) {

        newRoom = candidate;

        break;
      }
    }


    if (!newRoom) {

      showToast(
        "새 방을 만들지 못했어요."
      );

      return;
    }


    const state =
      makeGame();


    state.players[currentUid] = {

      nick: currentNick,

      joinedAt: Date.now()
    };


    await set(
      ref(db, `rooms/${newRoom}`),
      state
    );


    await set(
      ref(
        db,
        `rooms/${oldRoom}/players/${currentUid}`
      ),
      null
    );


    $("result-modal")
      .classList
      .add("hidden");


    if (unsubscribeRoom) {

      unsubscribeRoom();

      unsubscribeRoom = null;
    }


    enterRoom(
      newRoom,
      currentNick
    );

  } catch (error) {

    console.error(
      "다시 플레이 실패:",
      error
    );

    showToast(
      "새 게임을 만들지 못했어요."
    );
  }
}


// ============================================================
// 방 나가기
// ============================================================

async function leaveRoom(
  showHome = true
) {

  $("result-modal")
    .classList
    .add("hidden");

  $("action-modal")
    .classList
    .add("hidden");


  if (unsubscribeRoom) {

    unsubscribeRoom();

    unsubscribeRoom = null;
  }


  if (
    currentRoom &&
    currentUid
  ) {

    try {

      await set(
        ref(
          db,
          `rooms/${currentRoom}/players/${currentUid}`
        ),
        null
      );

    } catch (error) {

      console.error(
        "플레이어 제거 실패:",
        error
      );
    }
  }


  currentRoom = null;
  roomState = null;
  selectedCell = null;
  resultShown = false;


  if (showHome) {

    game.classList.remove("active");

    home.classList.add("active");

    setHomeStatus("");
  }
}


// ============================================================
// 버튼 연결
// ============================================================

$("create-room")
  .addEventListener(
    "click",
    createRoom
  );


$("join-room")
  .addEventListener(
    "click",
    joinRoom
  );


$("dig-btn")
  .addEventListener(
    "click",
    dig
  );


$("flag-btn")
  .addEventListener(
    "click",
    toggleFlag
  );


$("cancel-btn")
  .addEventListener(
    "click",
    closeAction
  );


$("leave-room")
  .addEventListener(
    "click",
    () => leaveRoom(true)
  );


$("result-leave-btn")
  .addEventListener(
    "click",
    () => leaveRoom(true)
  );


$("again-btn")
  .addEventListener(
    "click",
    again
  );


// ============================================================
// 방 코드 복사
// ============================================================

$("copy-code")
  .addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          currentRoom
        );

        showToast(
          "방 코드를 복사했어요!"
        );

      } catch {

        showToast(
          "코드를 직접 복사해주세요."
        );
      }
    }
  );


// ============================================================
// 방 코드 입력 제한
// ============================================================

$("room-code")
  .addEventListener(
    "input",
    event => {

      event.target.value =
        event.target.value
          .replace(/\D/g, "")
          .slice(0, 6);
    }
  );


// ============================================================
// 시작
// ============================================================

boot();
