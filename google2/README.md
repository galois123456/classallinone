# 생기부 작성 도우미 · 구글 ver1.02

## 이번 UI 수정

상단 메뉴를 한 줄로 정리했습니다. 좁은 태블릿에서는 이메일을 숨기고 일부 버튼 표기를 짧게 표시합니다.
반영 비율은 선택 사항입니다. 비워 두면 경고를 표시하지 않고 학기말 점수 칸을 비웁니다.
모든 평가의 반영 비율 합계가 100%일 때만 학기말 인쇄 체크박스를 선택할 수 있습니다.
지필평가를 추가하지 않고 수행평가만 사용해도 됩니다.
계산식: 학기말 환산 = ∑{(받은 점수 ÷ 평가 만점) × 반영 비율} : 소수 셋째 자리에서 반올림하여 둘째 자리까지 표시
기존 점수·반영 비율·로그인·저장 설정은 유지합니다. 파일을 기존 폴더에 덮어쓰면 됩니다.


## 이번 버전의 평가 기능

지필·수행평가 및 학기말 점수 업데이트

- 평가 기준에서 수행평가 추가 왼쪽의 지필평가 추가를 누르면 1회고사, 다시 누르면 2회고사가 생깁니다.
- 지필평가는 항목 추가 없이 객관식 만점·논서술형 만점을 설정합니다. 기본값은 60점·40점이며 학교 기준에 맞게 수정하고 기준 저장을 누르세요.
- 학생 점수에서 두 점수를 각각 입력합니다. 각 점수는 0점부터 해당 만점까지이며 소수 둘째 자리까지 지원합니다. 두 점수의 합계가 지필평가 원점수입니다.
- 평가별 최종 반영 비율(%)을 입력한 뒤 해당 평가 카드의 기준 저장·재검증을 누릅니다.
- 반영 비율 합계는 100%여야 합니다. 반영하지 않는 평가는 0%로 설정할 수 있습니다.
- 학기말 환산 점수 = 각 평가의 (받은 점수 / 만점 * 반영 비율)의 합계입니다. 항목별 중간값을 반올림하지 않고 최종 합계만 소수 셋째 자리에서 반올림하여 둘째 자리까지 표시합니다.
- 미입력·기준 미설정·불가 점수·100%가 아닌 비율 합계가 있으면 학기말 점수를 확정해 표시하지 않습니다. 0% 평가의 미입력 점수는 학기말 계산에 영향을 주지 않습니다.
- 인쇄의 체크리스트에서 지필평가 / 수행평가 / 학기말 환산 점수를 각각 선택할 수 있습니다. 전체 명단과 개별 안내장 모두 적용됩니다.
- 인쇄에서 평가를 숨겨도 학기말 점수는 전체 평가의 반영 비율로 계산합니다. 선택한 원점수 합계는 인쇄에 선택한 평가만 더한 값입니다.
- 인쇄 체크는 반마다 저장됩니다. 반별 공통문구와 전체명단 제목 아래 문구도 유지합니다.
- 기존 수행평가 점수·예외 점수·명단·암호화 통합 백업을 유지합니다. 이전 자료의 반영 비율은 임의로 정하지 않고 미설정으로 둡니다.
- 새 지필평가 자료가 있는 백업은 웹 3.18 또는 구글 1.02 이상에서 복원하세요. 기존 백업은 새 버전으로 복원할 수 있습니다.


웹 ver3.18의 편집기를 유지하고 Google 로그인 + 개인 Google Drive 저장으로 전환한 버전입니다.
GitHub `classallinone` 저장소의 **google2** 폴더에 올리고, Vercel에서 이 폴더를 Root Directory로 선택합니다.
기존 google 폴더와 기존 Vercel 프로젝트는 그대로 두고, 새 Vercel 프로젝트를 만드세요.

## 1. GitHub와 Vercel

1. ZIP을 풀면 `google2` 폴더가 나옵니다.
2. `classallinone` 저장소에 폴더째 업로드·커밋합니다. 최종 경로는 `classallinone/google2/package.json`입니다. `google2/google2`가 되지 않게 확인하세요.
3. Vercel에서 Add New → Project → 기존 `classallinone` 저장소를 다시 Import합니다.
4. Project Name은 다른 프로젝트와 겹치지 않는 이름, 예를 들어 `school-record-google`로 정합니다.
5. Root Directory: `google2`, Framework Preset: Other, Build Command: `npm run build`, Output Directory: `dist`, Install Command: `npm ci`입니다. Node.js는 22.x를 사용합니다.
6. 먼저 Deploy하여 고정 배포 주소를 확인합니다. 환경변수가 아직 없으면 화면은 열리지만 로그인은 설정 오류로 표시됩니다. 정상적인 중간 단계입니다.
7. 아래 Google 설정과 환경변수를 입력한 뒤 Production으로 Redeploy합니다.

**중요:** `google2`는 GitHub 안의 폴더 이름입니다. 사이트 주소는 `https://프로젝트명.vercel.app`이며 뒤에 `/google2`를 붙이지 않습니다. 기존 사이트의 하위 URL에 붙이는 구성이 아닙니다.

## 2. Google 설정

기존 Google Cloud 프로젝트를 사용해도 됩니다. 이 사이트용 **웹 애플리케이션 OAuth 클라이언트**를 별도로 만들면 다른 사이트의 로그인 설정과 구분하기 쉽습니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 사용할 프로젝트를 선택합니다.
2. APIs & Services → Library에서 **Google Drive API**를 검색하여 사용 설정합니다.
3. Google Auth Platform에서 Branding, Audience, Data Access를 설정합니다. 앱 이름은 생기부 작성 도우미로 지정합니다. 테스트 상태라면 Test users에 본인 Google 이메일을 추가합니다.
4. 요청하는 범위는 `openid`, `email`, `https://www.googleapis.com/auth/drive.appdata`입니다. Drive 전체 파일 접근 권한은 필요 없습니다.
5. Clients → Create client → **Web application**을 선택합니다. 웹 서버 로그인용 클라이언트이며 AI agent 전용 클라이언트가 아닙니다.
6. Authorized redirect URIs에 아래 주소를 **정확히** 추가합니다.

   `https://프로젝트명.vercel.app/api/auth/callback`

7. Authorized JavaScript origins를 입력한다면 `https://프로젝트명.vercel.app`만 입력합니다. 이 앱은 서버 리디렉션 방식이라 redirect URI 설정이 핵심입니다.
8. 생성된 Client ID와 Client secret을 Vercel 환경변수로 넣습니다.
9. 홈페이지 URL이 필요한 경우 사이트 주소, 개인정보처리방침 URL은 `https://프로젝트명.vercel.app/privacy.html`을 사용합니다. 공개 배포 전 운영자 연락처 등 실제 운영 방식에 맞게 내용을 확인하세요.

기존 Google 클라이언트를 재사용하는 경우 기존 사이트의 redirect URI를 지우지 말고 위 URI를 추가합니다. 장기 사용에서는 테스트/프로덕션 상태를 확인하세요. 외부 앱의 Testing 상태에서는 이 앱처럼 Drive 권한을 요청한 refresh token이 통상 7일 후 만료되어 재연결이 필요합니다. 게시·검증 화면에서 Google이 요구하는 항목은 해당 계정 정책에 따라 완료하세요.

## 3. Vercel 환경변수 — 네 개

Vercel → 새 프로젝트 → Settings → Environment Variables에서 Production 환경에 등록합니다. 비밀 값은 GitHub 파일에 입력하지 마세요.

| 이름 | 값 |
| --- | --- |
| `APP_URL` | `https://프로젝트명.vercel.app` — 경로·쿼리 없이 실제 고정 배포 주소 |
| `GOOGLE_CLIENT_ID` | Google의 웹 클라이언트 ID, 끝이 `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | 같은 웹 클라이언트의 Client secret |
| `SESSION_SECRET` | 새로 생성한 무작위 문자열, 32자 이상. 아래 명령으로 64자 생성 권장 |

GitHub Codespaces 또는 Node.js가 설치된 터미널에서 다음 명령을 실행하여 SESSION_SECRET을 생성할 수 있습니다.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

SESSION_SECRET은 로그인 정보를 암호화하는 서버용 키이며 사용자 로그인 비밀번호나 JSON 백업 비밀번호가 아닙니다. `.env.example`의 예시 문구를 그대로 쓰지 마세요. Client secret과 SESSION_SECRET은 Sensitive로 등록하세요. 환경변수 저장 후 **Redeploy**해야 적용됩니다.

Preview 배포는 고정 Production 주소와 다르므로 이 구성의 로그인 검증은 Production에서 진행합니다. Vercel 접근 보호가 켜져 있으면 방문자에게 Vercel 로그인을 먼저 요구할 수 있습니다. 공유하려는 경우 해당 프로젝트의 Deployment Protection 설정을 확인하세요.

## 4. 기존 자료 옮기기

1. 기존 Supabase 웹 버전 또는 오프라인 버전의 전체 설정에서 **암호화 통합 JSON 백업**을 내려받습니다.
2. 새 구글 사이트에서 사용할 Google 계정으로 로그인합니다.
3. 전체 설정 → 통합 복원에서 백업 파일과 기존 백업 비밀번호를 입력합니다.
4. 상단 지금 저장을 누르고 **Drive 저장 완료**를 확인합니다.
5. 새로고침하여 학생·기록·수행평가·반별 안내 문구가 유지되는지 확인합니다.

Supabase 자료를 자동으로 가져오거나 삭제하지 않습니다. 새 버전은 Supabase 환경변수·SQL이 필요 없습니다. 같은 이메일이어도 기존 Supabase 계정과 Google 저장소는 별개입니다.

## 5. 유지한 기능

- 학생 누가기록, 교과 활동 통합 관리, 문장 매크로, 활동 보조 관리, 수행 평가의 다섯 화면
- 공통 학생 명단, 반 관리, 모바일 UI, 다크모드, 입력칸 높이 저장
- 수행평가 점수 검증, 모바일 평가 선택·합계, 반별 안내 문구와 인쇄
- 전체 명단 인쇄 시 반 제목 바로 아래 공통 문구 출력
- 12자 이상 별도 비밀번호로 암호화한 JSON 백업·복원, 이전 통합 JSON 호환
- 마지막 입력 후 3초 자동 저장. 진행 중 요청은 겹치지 않고 최신 변경을 모아 저장
- 일시적 실패는 10초 → 30초 → 60초로 최대 3회 재시도 후 중단. 권한·계정·자료 형식 오류는 반복하지 않음
- 지금 저장은 응답을 확인한 뒤 완료 표시. 변경 없는 자료는 파일을 다시 쓰지 않음
- 동일 브라우저의 같은 계정은 편집 탭 하나만 허용. 다른 기기의 변경은 버전·ETag로 확인하고 충돌 선택 제공

## 6. 로그인과 저장 위치

로그인은 암호화된 HttpOnly·Secure 쿠키로 유지합니다. 새로고침할 때 서버가 세션을 확인하며, 만료된 Google 액세스 토큰은 서버에서 갱신합니다. 세션 쿠키는 30일 유효하며 정상적으로 다시 접속하면 갱신됩니다. 로그아웃, 브라우저 쿠키 삭제, Google 권한 취소·만료, SESSION_SECRET 변경 시 다시 로그인해야 합니다. 무기한 로그인 보장은 아닙니다.

자료는 각 사용자 Google Drive의 **앱 전용 숨김 공간(appDataFolder)**에 압축 저장됩니다. 일반 Drive 파일 목록에는 보이지 않습니다. `schoolRecordGoogle=workspace-v1`로 이 앱 파일만 조회합니다. 이 프로젝트의 다른 앱 자료를 조회·변경하지 않습니다. Google 계정을 바꾸면 별도 자료로 열립니다.

편집 중 미저장 자료는 계정별로 브라우저에 임시 보관합니다. 인증 토큰은 브라우저 JavaScript나 localStorage에 공개하지 않습니다. Vercel은 로그인과 Drive 요청을 처리하며 사용자 자료를 별도 데이터베이스에 저장하지 않습니다. 단, 전송 처리 중에는 서버 메모리에 자료가 존재합니다. JSON 백업의 비밀번호 암호화는 내려받은 파일에 적용되며 Drive 자동 저장을 종단간 암호화하는 기능은 아닙니다.

기존 8MB 원문 제한을 유지하고 Vercel 전송 한도에 맞춰 gzip 압축 후 3MiB 제한을 추가했습니다. 한도를 넘으면 자료를 버리지 않고 오류와 백업 안내를 표시합니다. API 요청 실패나 Drive 오류가 기존 Google/Supabase 자료를 초기화하지 않습니다.

## 7. 오류 확인

| 표시 | 확인할 내용 |
| --- | --- |
| `redirect_uri_mismatch` | Google에 등록한 `/api/auth/callback` 주소와 APP_URL의 도메인·철자 일치 |
| OAuth 설정 오류 | ID/Secret이 같은 웹 클라이언트인지, Vercel에 실제 값 입력·재배포했는지 |
| Google Drive 접근 실패 | Drive API 사용 설정, 앱 데이터 권한 허용, 학교 계정의 관리자 제한 |
| 로그인 유지가 풀림 | Testing 상태의 7일 만료, 쿠키 삭제, 권한 취소, 30일 세션 만료 |
| 다른 기기와 충돌 | 현재 기기 자료를 백업한 뒤 Drive 자료 또는 현재 기기 자료 중 선택 |
| 앱 저장 파일 중복 | 첫 연결을 여러 기기에서 동시에 시작해 서로 다른 자료가 생긴 경우 자동 덮어쓰기를 중단. 기기 자료를 백업하고 파일을 확인해야 함 |
| 저장공간 부족 | 해당 사용자의 Google Drive 용량 확인 |

로그아웃 전 저장 실패가 있으면 미저장 자료 보호를 위해 로그아웃을 중단합니다. Google 다시 연결 후 저장하거나 암호화 백업을 먼저 받으세요.

## 개발·검증

```sh
npm ci
npm run check
npm test
npm run build
```

빌드는 Google 비밀 값 없이 가능합니다. API의 환경변수는 Vercel 실행 시 사용합니다. HTML 파일을 더블클릭하거나 GitHub Pages로만 실행하는 버전은 아닙니다. 실제 Google 로그인·Drive 실계정 요청은 배포 후 확인해야 합니다. 자동 테스트에는 Google 응답을 모의한 인증·저장 테스트와 다섯 편집기의 DOM 실행 검증이 포함됩니다.

## 확인한 공식 문서

- [Google 웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google 토큰 만료](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google Drive 앱 데이터 폴더](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Drive 파일 업데이트](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update)
- [Vercel Node.js 함수](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel 함수 한도](https://vercel.com/docs/functions/limitations)

made by yoonsungho
