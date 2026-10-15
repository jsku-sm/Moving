# 테스트 재현

완성 앱 실행에는 이 테스트 도구가 필요하지 않습니다.

## 수학 계산

Node.js 18 이상에서:

```bash
node tests/math.test.js
```

결과: 유리수 산술, 동시 치환, 평행이동 역변환, 축 대칭 두 번의 복원,
수선의 발, 축에 수직인 대응 벡터, 변환된 대표점의 방정식 만족 여부,
식 정규화, 입력 검증 등 총 3,485 assertion.

## 브라우저 통합

Python 3.10 이상과 Playwright를 설치한 환경에서:

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/browser.test.py
```

설치된 Chromium 실행 파일을 직접 사용하는 경우:

```bash
CHROMIUM_EXECUTABLE=/usr/bin/chromium python tests/browser.test.py
```

HTML을 읽어 `page.set_content()`로 렌더링하므로 외부 배포 없이 실행합니다.
정확한 배포 URL, 서버 헤더, Safari 구현, 학교 관리 정책은 이 테스트로 검증되지 않습니다.
완료 시 `tests/browser-results.json`과 `docs` 스크린샷을 갱신합니다.

## Python 문법

```bash
python -m py_compile app.py build.py
```

위 명령은 Streamlit 실제 구동 테스트가 아닙니다.
실제 환경에서는 의존성을 설치하고 `python -m streamlit run app.py`를 실행하여
화면·스크롤·일반 입력·기록 저장까지 별도로 확인해야 합니다.
