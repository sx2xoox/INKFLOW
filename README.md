# INKFLOW · 먹의 흐름

다섯 빛깔 먹(오방색)의 기운을 다루는 탑다운 액션 로그라이트.
가장 강한 먹의 기운이 캐릭터의 3타 콤보를 통째로 바꾼다. 모든 그림은 코드로 그린 수묵화다.

- 바로 하기: https://sx2xoox.github.io/INKFLOW/
- 기획서: [docs/GDD.md](docs/GDD.md)

## 실행

기본 브랜치에 올리면 GitHub Actions가 빌드해서 GitHub Pages로 내보낸다(`.github/workflows/deploy.yml`).
로컬에서 돌릴 때는:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 정적 파일
```

## 조작

| 입력 | 동작 |
|---|---|
| W A S D / 방향키 | 걷기 |
| 마우스 | 겨누기 |
| 왼쪽 클릭 (누르고 있기) | 3타 콤보 |
| Space / 오른쪽 클릭 | 비켜 서기(대시) |
| F | 자동 휘두르기 |
| Esc | 멈춤 |
| 1–5 | 보상 카드 고르기 |

## 개발용 주소

| 주소 | 내용 |
|---|---|
| `?debug` | 1–5 키로 먹 기운 +10 (Shift는 −10), N 키로 먹귀 모두 쓰러뜨리기 |
| `?demo` | 스스로 싸우는 시연 |
| `?gallery=jeok` | 한 먹의 세 획과 상태 효과를 멈춘 채로 보기 (`cheong` `jeok` `hwang` `baek` `heuk` `plain`) |
| `?gallery=enemies` | 모든 먹귀를 색별로 보기 |

## 구조

```
src/
  ink.ts            오방색 먹, 상극·상생, 주속성 판정
  game/             게임 규칙 (렌더링과 무관)
    game.ts         물결, 피해, 콤보 진행
    characters.ts   캐릭터와 먹별 3타 콤보 정의
    moves.ts        동작 판정 모양
    enemies.ts      먹귀 정의와 행동
    items.ts        보상 카드
  render/           캔버스 붓 도구 (그림을 굽는 데 쓴다)
    brush.ts        붓질, 먹 덩이, 먹 튐
    sprites.ts      붓잡이와 먹귀 그림
    paper.ts        한지와 풍경
  gfx/              PixiJS 렌더링
    strokes.ts      GPU 붓질 셰이더
    composite.ts    한지 합성 셰이더
    inksim.ts       먹 번짐 시뮬레이션
    fx.ts           콤보 궤적과 효과
    view.ts         장면 구성
    hud.ts          화면 표시
  ui.ts             첫 화면, 보상, 끝 화면
```
