# 교실 도구 Google Drive 버전

`index.html`은 기존 교실 올인원 도구에 Google 계정 로그인과 Google Drive 자동 저장을 추가한 정적 웹 앱입니다. 별도 서버와 데이터베이스를 운영하지 않습니다.

## 저장 방식

- 첫 실행 때 Google 로그인 창이 열립니다.
- OAuth 웹 클라이언트 ID를 입력하고 Google 계정으로 연결합니다.
- Drive에 기존 자료가 있으면 `Drive 자료 불러오기` 또는 `현재 자료로 Drive 파일 덮어쓰기`를 선택합니다.
- 저장 위치는 내 Drive의 `ClassroomAllInOne/classroom-all-in-one-data.json`입니다. 폴더와 JSON 파일은 Google Drive에서 직접 확인할 수 있습니다.
- 자료 변경 후 약 3초가 지나면 자동 저장합니다. 화이트보드 필기/PDF를 포함합니다.
- access token은 메모리에만 두며, 새로고침한 뒤 다시 로그인합니다. OAuth Client ID만 이 브라우저에 기억합니다.
- Drive 데이터 파일에는 학생 명단과 교사 설정이 들어갈 수 있습니다. Google Drive 공유 권한을 확인하세요. 이 앱은 JSON을 별도로 암호화하지 않습니다.

## Google Cloud 설정

1. Google Cloud Console에서 프로젝트를 만들거나 선택합니다.
2. `Google Drive API`를 사용 설정합니다.
3. OAuth 동의 화면을 설정하고 OAuth 클라이언트 ID에서 `웹 애플리케이션`을 선택합니다.
4. 승인된 JavaScript 원본에 실제 배포 사이트의 origin을 등록합니다. GitHub Pages 프로젝트 사이트라면 예: `https://galois123456.github.io` (저장소 이름 경로는 넣지 않습니다). 테스트 중에는 필요한 경우 `http://localhost:포트`를 추가합니다.
5. 앱을 열고 `Google OAuth 웹 클라이언트 ID`에 `.apps.googleusercontent.com`으로 끝나는 Client ID를 붙여넣습니다.
6. 테스트 모드로 운영한다면 OAuth 동의 화면의 테스트 사용자에 로그인할 Google 계정을 추가합니다.

이 앱은 Google Identity Services의 사용자 동의 토큰 흐름과 제한된 `drive.file` 범위를 사용합니다. 비밀 키나 클라이언트 시크릿은 HTML에 넣지 않습니다. Google OAuth 동작은 HTTPS 또는 등록된 localhost에서만 사용할 수 있습니다.

## GitHub Pages 배포

1. 이 저장소의 기존 `index.html`을 유지하려면 압축을 풀고 폴더 안의 파일을 저장소의 `google/` 폴더에 올립니다.
2. GitHub 저장소의 **Settings → Pages**에서 배포 소스를 `Deploy from a branch`, 브랜치 `main`, 폴더 `/ (root)`로 설정합니다.
3. GitHub Pages 배포가 활성화되면 `https://galois123456.github.io/classallinone/google/`에서 앱을 열고 Client ID를 입력한 뒤 Google Drive를 연결합니다.
4. Google Cloud OAuth의 승인된 JavaScript 원본에는 `https://galois123456.github.io`를 등록합니다.

Google OAuth access token은 짧은 시간만 유효합니다. 저장 요청에서 만료 안내가 나오면 Google 계정을 다시 연결하세요.
