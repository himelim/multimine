# 💣 멀티 지뢰찾기 — 완전 무료 GitHub Pages 버전

여러 휴대폰/PC에서 **같은 방 코드**로 들어와 하나의 지뢰찾기 판을 실시간으로 공유하는 웹게임입니다.

- 31행 × 17열
- 지뢰 150개
- 깃발 / 땅 파기
- 다른 플레이어의 행동 실시간 반영
- 방 코드 6자리
- 익명 로그인
- GitHub Pages + Firebase 무료 요금제 기준으로 시작 가능

## 1. Firebase 프로젝트 만들기

1. Firebase Console에서 새 프로젝트를 만듭니다.
2. 프로젝트 안에서 **Authentication → Sign-in method → Anonymous**를 켭니다.
3. **Realtime Database**를 만들고 데이터베이스 위치를 선택합니다.
4. 프로젝트 설정 → 앱 추가 → **Web(</>)** 앱을 추가합니다.
5. 표시되는 `firebaseConfig` 값을 복사합니다.

## 2. Firebase 설정 붙여넣기

`app.js` 맨 위의 아래 부분을 찾습니다.

```js
const firebaseConfig = {
  apiKey: "여기에_apiKey",
  authDomain: "여기에_authDomain",
  databaseURL: "여기에_databaseURL",
  projectId: "여기에_projectId",
  storageBucket: "여기에_storageBucket",
  messagingSenderId: "여기에_messagingSenderId",
  appId: "여기에_appId"
};
```

Firebase에서 받은 값을 그대로 넣습니다.

## 3. Realtime Database Rules

Firebase Console → Realtime Database → Rules에서 `firebase.rules.json`의 내용을 붙여넣고 게시합니다.

이 게임의 방 코드는 **친구에게 알려주는 비밀 코드** 역할을 합니다. 코드를 모르는 사람은 정상적인 UI로 방에 참여할 수 없습니다. 다만 6자리 숫자 코드는 완전한 암호는 아니므로, 매우 민감한 정보를 저장하는 용도로 사용하면 안 됩니다.

## 4. GitHub Pages에 올리기

이 프로젝트는 빌드가 필요 없는 순수 HTML/JS라서 훨씬 간단합니다.

1. GitHub에서 새 Repository를 만듭니다. 예: `multimine`
2. 이 폴더의 `index.html`, `style.css`, `app.js`, `firebase.rules.json`, `README.md`를 저장소 최상위에 업로드합니다.
3. GitHub 저장소의 **Settings → Pages**로 들어갑니다.
4. **Deploy from a branch**를 선택합니다.
5. Branch는 `main`, 폴더는 `/ (root)`로 선택하고 Save 합니다.
6. 잠시 기다리면 `https://사용자이름.github.io/multimine/` 형태의 주소가 생깁니다.

## 5. 친구와 테스트

1. 웹사이트에 들어갑니다.
2. 닉네임을 입력하고 **새 방 만들기**를 누릅니다.
3. 화면 위의 6자리 코드를 친구에게 보냅니다.
4. 친구가 자기 기기에서 닉네임 + 같은 코드를 입력합니다.
5. 같은 게임판에서 열기/깃발이 실시간으로 공유됩니다.

## 무료인가요?

GitHub Pages는 정적 웹사이트 호스팅에 사용할 수 있고, Firebase도 무료 요금제의 사용량 한도 안에서는 비용 없이 시작할 수 있습니다. 이용량이 크게 늘어나면 Firebase의 현재 요금제/사용량을 확인하세요.

## 참고

`firebaseConfig`는 웹 앱에서 공개되는 설정값입니다. 이것 자체를 비밀번호처럼 취급할 필요는 없습니다. 실제 접근 제어는 Firebase Authentication과 Database Rules가 담당합니다.
