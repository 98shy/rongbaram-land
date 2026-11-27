### 빙고판 공유 방

`bingo.html`은 공유 서버 없이도 현재 브라우저에 판을 저장합니다. 여러 기기에서 함께 편집하려면 `bingo-server`의 Cloudflare Worker를 배포하고 `bingo.html`의 `bingo-api` 메타 태그에 Worker 주소를 넣습니다.

1. Cloudflare에 로그인한 상태에서 `bingo-server` 폴더에서 `npx wrangler deploy`를 실행합니다.
2. 반환된 HTTPS 주소를 `bingo-api`의 `content`에 넣고 GitHub Pages를 배포합니다.
3. 만든 빙고판의 **공유 링크 복사**로 방을 엽니다. 링크를 받은 사람은 같은 방을 편집할 수 있습니다.
