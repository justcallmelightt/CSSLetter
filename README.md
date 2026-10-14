# CSSLetter

<img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white"> <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white"> <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">

> [!CAUTION]
> `© 2026 Lightframe. All Rights Reserved.` <br>
> **이 Repository의 모든 파일은 소중한 개인 저작권의 보호를 받습니다. 무단 복제 및 도용을 금지합니다.** <br>
> **This repository is NOT open source.**

편지지를 고르고 직접 스타일링한 뒤, 받는 사람용 읽기 링크로 마음을 전하는 온라인 편지 앱입니다.

## 핵심 기능

- 여섯 가지 편지지 프리셋과 실시간 미리보기
- 종이색, 글자색, 포인트색, 글꼴, 크기, 줄 간격 직접 설정
- 직접 스타일링한 커스텀 편지지의 기기 내 저장과 재사용
- 작성 중인 편지의 기기 내 자동 저장
- 압축된 링크 자체에 편지 내용을 담는 별도 읽기 화면
- 지정한 날짜와 시간까지 내용을 숨기고 카운트다운하는 `나중에 열기`
- `미래의 나에게` 편지 작성과 1개월·6개월·1년 빠른 예약
- 브라우저 알림 또는 편지 링크를 담은 캘린더 알림 파일
- Tile과 함께 사용하는 선택형 Lightframe. 계정 로그인
- 모바일과 데스크톱에 맞춘 반응형 편지 작성 경험

## 개인정보와 보안

- 작성 중인 초안은 서버로 전송하지 않고 현재 브라우저의 `localStorage`에만 저장합니다.
- 공유 편지는 URL fragment에 Base64URL 형식으로 들어갑니다. 이는 전송용 인코딩이며 암호화가 아닙니다.
- 캘린더 알림 파일에는 공유 링크가 포함됩니다. 캘린더에 추가하면 선택한 일정 서비스에 링크가 저장될 수 있습니다.
- 브라우저 알림은 편지 받는 화면을 열어 두고 알림을 허용한 경우에 동작합니다. 화면을 닫은 상태의 알림은 캘린더 앱에 일정 파일을 추가해 설정할 수 있습니다.
- 공유 링크에는 비밀번호, 금융정보, 주민등록번호 등 민감한 정보를 넣지 않는 것을 권장합니다.
- 공유 데이터는 허용된 필드, 길이, 색상, 글꼴 및 수치 범위를 검사한 뒤 렌더링합니다.
- 외부 CDN 스크립트나 원격 폰트를 실행하지 않으며, 고정 버전 자산을 프로젝트에서 직접 제공합니다.
- 배포 응답에는 CSP, 클릭재킹 방지, 권한 제한 및 MIME 스니핑 방지 헤더가 포함됩니다.
  
자세한 내용은 [개인정보 보호 및 보안](./SECURITY.md)을 참고하세요.

## 빌드

```bash
npm run build
```
