/*
  멀티 지뢰찾기 - 무료 GitHub Pages + Firebase 버전
  Firebase 설정은 아래 firebaseConfig만 바꾸면 됩니다.
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// ============================================================
// ★ Firebase Console에서 받은 값을 여기에 붙여 넣으세요.
// ============================================================
const firebaseConfig = {
  apiKey: "여기에_apiKey",
  authDomain: "여기에_authDomain",
  databaseURL: "여기에_databaseURL",
  projectId: "여기에_projectId",
  storageBucket: "여기에_storageBucket",
  messagingSenderId: "여기에_messagingSenderId",
  appId: "여기에_appId"
};

const ROWS = 31, COLS = 17, MINES = 150;
let app, auth, db, currentUid = null, currentRoom = null, currentNick = null;
let unsubscribeRoom = null, selectedCell = null, roomState = null;

const $ = id => document.getElementById(id);
const home = $('page-home'), game = $('page-game');

function configured(){ return !firebaseConfig.apiKey.startsWith('여기에_') && !firebaseConfig.projectId.startsWith('여기에_'); }
function showToast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2200); }
function setHomeStatus(msg){ $('home-status').textContent=msg; }
function randomCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
function emptyBoard(){ return Array.from({length:ROWS},()=>Array(COLS).fill(0)); }
function makeBoard(){
  const mines=new Set();
  while(mines.size<MINES) mines.add(Math.floor(Math.random()*ROWS*COLS));
  const board=emptyBoard();
  for(const p of mines){ const r=Math.floor(p/COLS),c=p%COLS; board[r][c]=-1; }
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c]!==-1){
    let n=0; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&board[rr][cc]===-1)n++;} board[r][c]=n;
  }
  return board;
}
function randomMines(){
  const mines=[]; while(mines.length<MINES){const p=Math.floor(Math.random()*ROWS*COLS);if(!mines.includes(p))mines.push(p);} return mines;
}
function makeGame(){
  return { rows:ROWS, cols:COLS, mines:MINES, minePositions:randomMines(), opened:{}, flags:{}, status:'playing', createdAt:Date.now(), players:{} };
}
function posKey(r,c){return `${r}_${c}`;}
function fromKey(k){const [r,c]=k.split('_').map(Number);return [r,c];}
function mineSet(state){return new Set(state.minePositions||[]);}
function neighbors(r,c){const out=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<ROWS&&cc>=0&&cc<COLS)out.push([rr,cc]);}return out;}
function counts(state){
  const m=mineSet(state); const out={};
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=r*COLS+c;if(m.has(p)){out[posKey(r,c)]=-1;continue;}let n=0;for(const [rr,cc] of neighbors(r,c))if(m.has(rr*COLS+cc))n++;out[posKey(r,c)]=n;} return out;
}
function floodOpen(state,r,c){
  const m=mineSet(state), cnt=counts(state), opened={...(state.opened||{})}; const q=[[r,c]], seen=new Set();
  while(q.length){const [rr,cc]=q.shift(),k=posKey(rr,cc);if(seen.has(k)||opened[k]||state.flags?.[k])continue;seen.add(k);if(m.has(rr*COLS+cc))continue;opened[k]=currentUid;if(cnt[k]===0)for(const [nr,nc] of neighbors(rr,cc))q.push([nr,nc]);}
  return opened;
}
function isWin(state){
  const m=mineSet(state), flags=state.flags||{}; return [...m].every(p=>flags[posKey(Math.floor(p/COLS),p%COLS)]);
}
function isConfiguredError(){ if(!configured()){setHomeStatus('먼저 README의 Firebase 설정을 완료해주세요.'); return true;} return false; }

async function boot(){
  if(!configured()){setHomeStatus('Firebase 설정 전용 파일입니다. README를 따라 설정하면 바로 사용할 수 있어요!');return;}
  try{
    app=initializeApp(firebaseConfig); auth=getAuth(app); db=getDatabase(app);
    await signInAnonymously(auth);
    onAuthStateChanged(auth,u=>{if(u)currentUid=u.uid;});
  }catch(e){console.error(e);setHomeStatus('Firebase 연결에 실패했어요. 설정값과 Authentication을 확인해주세요.');}
}

async function createRoom(){
  if(isConfiguredError())return; const nick=$('nickname').value.trim(); if(!nick){setHomeStatus('닉네임을 입력해주세요.');return;}
  setHomeStatus('방을 만드는 중…');
  let code='';
  for(let i=0;i<8;i++){const candidate=randomCode(), snap=await get(ref(db,`rooms/${candidate}`));if(!snap.exists()){code=candidate;break;}}
  if(!code){setHomeStatus('방 생성에 실패했어요. 다시 시도해주세요.');return;}
  const state=makeGame(); state.players[currentUid]={nick,joinedAt:Date.now()};
  await set(ref(db,`rooms/${code}`),state); enterRoom(code,nick);
}
async function joinRoom(){
  if(isConfiguredError())return; const nick=$('nickname').value.trim(),code=$('room-code').value.trim();
  if(!nick)return setHomeStatus('닉네임을 입력해주세요.'); if(!/^\d{6}$/.test(code))return setHomeStatus('6자리 방 코드를 입력해주세요.');
  setHomeStatus('방을 찾는 중…'); const rr=ref(db,`rooms/${code}`),snap=await get(rr);
  if(!snap.exists())return setHomeStatus('존재하지 않는 방이에요. 코드를 확인해주세요.');
  const state=snap.val(); if(state.status!=='playing')return setHomeStatus('이미 끝난 방이에요. 새 방을 만들어주세요.');
  await update(rr,{[`players/${currentUid}`]:{nick,joinedAt:Date.now()}}); enterRoom(code,nick);
}
function enterRoom(code,nick){
  currentRoom=code;currentNick=nick; home.classList.remove('active');game.classList.add('active');$('room-code-display').textContent=code; listenRoom();
  onDisconnect(ref(db,`rooms/${code}/players/${currentUid}`)).remove();
}
function listenRoom(){
  if(unsubscribeRoom)unsubscribeRoom(); unsubscribeRoom=onValue(ref(db,`rooms/${currentRoom}`),snap=>{roomState=snap.val();if(!roomState){leaveRoom(false);return;}renderRoom();});
}
function renderRoom(){
  if(!roomState)return; $('mine-count').textContent=MINES; $('flag-count').textContent=Object.keys(roomState.flags||{}).length;
  $('game-status').textContent=roomState.status==='playing'?'게임 진행 중':roomState.status==='won'?'🎉 모든 지뢰를 찾았습니다!':'💥 지뢰가 터졌습니다!';
  const ps=$('players');ps.innerHTML='';Object.values(roomState.players||{}).forEach(p=>{const s=document.createElement('span');s.className='player';s.textContent=p.nick+(p.nick===currentNick?' (나)':'');ps.appendChild(s);});
  renderBoard(); if(roomState.status!=='playing')showResult(roomState.status);
}
function renderBoard(){
  const board=$('board');board.innerHTML='';const cnt=counts(roomState),m=mineSet(roomState),opened=roomState.opened||{},flags=roomState.flags||{};
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const k=posKey(r,c),b=document.createElement('button');b.className='cell';b.dataset.r=r;b.dataset.c=c;
    if(flags[k]){b.classList.add('flag');b.textContent='🚩';}
    else if(opened[k]){b.classList.add('open');const n=cnt[k];if(n>0){b.textContent=n;b.classList.add(`n${n}`);}}
    if(roomState.status!=='playing'&&m.has(r*COLS+c)){b.classList.add('mine');b.textContent='💣';}
    b.addEventListener('click',()=>openAction(r,c));board.appendChild(b);
  }
}
function openAction(r,c){if(!roomState||roomState.status!=='playing')return;if(roomState.opened?.[posKey(r,c)])return;selectedCell=[r,c];$('action-title').textContent=`${r+1}행 ${c+1}열`; $('action-modal').classList.remove('hidden');}
function closeAction(){$('action-modal').classList.add('hidden');selectedCell=null;}
async function dig(){if(!selectedCell)return;const [r,c]=selectedCell;closeAction();const p=r*COLS+c,k=posKey(r,c);if(roomState.flags?.[k])return showToast('먼저 깃발을 해제해주세요.');
  const rr=ref(db,`rooms/${currentRoom}`);await runTransaction(rr,s=>{if(!s||s.status!=='playing'||s.opened?.[k])return s;const mines=new Set(s.minePositions||[]);if(mines.has(p)){s.status='lost';s.opened={...(s.opened||{}),[k]:currentUid};return s;}s.opened=floodOpen(s,r,c);return s;});
}
async function toggleFlag(){if(!selectedCell)return;const [r,c]=selectedCell;closeAction();const k=posKey(r,c),rr=ref(db,`rooms/${currentRoom}`);await runTransaction(rr,s=>{if(!s||s.status!=='playing'||s.opened?.[k])return s;s.flags=s.flags||{};if(s.flags[k])delete s.flags[k];else s.flags[k]=currentUid;if(isWin(s))s.status='won';return s;});}
function showResult(status){$('result-emoji').textContent=status==='won'?'🎉':'💥';$('result-title').textContent=status==='won'?'성공!':'실패!';$('result-text').textContent=status==='won'?'모든 지뢰에 깃발을 세웠어요!':'지뢰를 밟았어요! 다음 판에 도전해보세요.';$('result-modal').classList.remove('hidden');}
async function again(){if(!currentRoom)return;const old=currentRoom;const newCode=randomCode();const state=makeGame();state.players[currentUid]={nick:currentNick,joinedAt:Date.now()};await set(ref(db,`rooms/${newCode}`),state);await set(ref(db,`rooms/${old}/players/${currentUid}`),null);$('result-modal').classList.add('hidden');if(unsubscribeRoom)unsubscribeRoom();enterRoom(newCode,currentNick);}
async function leaveRoom(showHome=true){$('result-modal').classList.add('hidden');$('action-modal').classList.add('hidden');if(unsubscribeRoom){unsubscribeRoom();unsubscribeRoom=null;}if(currentRoom&&currentUid)await set(ref(db,`rooms/${currentRoom}/players/${currentUid}`),null).catch(()=>{});currentRoom=null;roomState=null;if(showHome){game.classList.remove('active');home.classList.add('active');setHomeStatus('');}}

$('create-room').onclick=createRoom;$('join-room').onclick=joinRoom;$('dig-btn').onclick=dig;$('flag-btn').onclick=toggleFlag;$('cancel-btn').onclick=closeAction;$('leave-room').onclick=()=>leaveRoom(true);$('result-leave-btn').onclick=()=>leaveRoom(true);$('again-btn').onclick=again;
$('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(currentRoom);showToast('방 코드를 복사했어요!')}catch{showToast('코드를 직접 복사해주세요.')}};
$('room-code').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,6));
boot();
