# 교실 도구 Google Drive · Vercel 버전 1.02

GitHub 저장소를 코드 원본으로 사용하고, Vercel에서 앱과 OAuth 백엔드를 함께 실행하는 버전입니다. Google Drive 자료는 기존처럼 사용자의 Drive에 저장됩니다. Vercel에는 수업 자료를 저장하지 않습니다.

## 로그인 유지 방식

- Google 인증 코드는 Vercel API에서 교환합니다.
- 갱신 토큰은 암호화된 `HttpOnly; Secure; SameSite=Lax` 쿠키로 저장합니다. 자바스크립트가 토큰을 읽을 수 없습니다.
- 새로고침하면 서버가 쿠키를 확인해 Drive 접속을 이어갑니다.
- `연결 해제`를 누르면 Google 권한을 취소하고 브라우저 세션 쿠키를 지웁니다.
- Google에서 권한을 취소하거나 계정 보안 정책으로 토큰이 만료되면 다시 로그인해야 합니다.

## 1. GitHub에 업로드

1. 압축을 풉니다.
2. 폴더 `classroom_all_in_one_google_vercel_v1.02` 전체를 GitHub 저장소에 올립니다.
3. 커밋합니다. 같은 저장소 안에 기존 `google/` 폴더가 있어도 그대로 둘 수 있습니다.

## 2. Vercel 프로젝트 연결

1. Vercel에서 **Add New → Project**를 선택하고 해당 GitHub 저장소를 연결합니다.
2. **Root Directory**를 `classroom_all_in_one_google_vercel_v1.02`로 지정합니다.
3. Framework Preset은 Other로 둡니다. 빌드 명령과 Output Directory는 비워 둡니다.
4. Vercel이 정적 페이지와 `api/` 폴더의 서버리스 함수를 배포합니다.
5. 첫 배포 후 사용할 고정 도메인(예: `https://교실도구이름.vercel.app`)을 확인합니다. 이후 환경 변수의 `APP_ORIGIN`에는 이 주소를 사용합니다.

## 3. Google Cloud OAuth 설정

기존 OAuth 웹 클라이언트를 사용해도 됩니다.

- **승인된 JavaScript 원본**에 Vercel 도메인을 추가합니다. 예: `https://교실도구이름.vercel.app`
- **승인된 리디렉션 URI**에 다음 주소를 추가합니다. 예: `https://교실도구이름.vercel.app/api/auth/callback`
- 클라이언트 ID와 클라이언트 보안 비밀번호(Secret)를 준비합니다. Secret은 HTML이나 GitHub에 넣지 않습니다.
- Drive API 사용 설정과 OAuth 동의 화면의 `drive.file` 권한 설정은 기존 설정을 유지합니다.

## 4. Vercel 환경 변수

Vercel 프로젝트 **Settings → Environment Variables**에 Production 환경으로 등록합니다.

| 이름 | 값 |
| --- | --- |
| `APP_ORIGIN` | `https://교실도구이름.vercel.app` (끝에 `/` 없음) |
| `GOOGLE_CLIENT_ID` | Google OAuth 웹 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud에서 해당 웹 클라이언트의 보안 비밀번호 |
| `GOOGLE_REDIRECT_URI` | `https://교실도구이름.vercel.app/api/auth/callback` |
| `SESSION_ENCRYPTION_KEY` | 아래 명령으로 만든 무작위 32바이트 키를 Base64 문자열로 입력 |

Mac 터미널에서 `openssl rand -base64 32`를 실행해 키를 만들 수 있습니다. 출력된 값을 Vercel에만 입력하고 GitHub나 채팅에 올리지 마세요. 환경 변수 저장 후 **Redeploy**해야 적용됩니다.

## 5. 사용

Vercel 배포 주소를 열고 Google 계정으로 한 번 로그인합니다. 이후 새로고침해도 로그인 세션이 유지됩니다. Google Drive 상단 버튼에 연결된 이메일이 표시되고, 자료 변경은 약 3초 뒤 자동 저장됩니다. Google Drive의 파일은 `ClassroomAllInOne/classroom-all-in-one-data.json`입니다.

GitHub Pages의 기존 주소는 정적 버전으로 남습니다. 로그인 유지 기능을 쓰려면 앱을 Vercel 배포 주소에서 열어야 합니다.

## 보안 참고

- OAuth Client ID는 공개 식별자지만 Client Secret과 세션 암호화 키는 서버 환경 변수에만 둡니다.
- refresh token은 암호화된 HttpOnly 보안 쿠키로 저장합니다. 브라우저 쿠키를 지우거나 Google 권한을 취소하면 다시 로그인해야 합니다.
- Vercel 미리보기 주소는 OAuth에 등록되지 않을 수 있으므로 Production 도메인으로 로그인 테스트를 하세요.
