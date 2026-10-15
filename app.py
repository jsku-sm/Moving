"""Optional Streamlit entry point for the self-contained Move Lab app.

Run: streamlit run app.py
Keep index.html and requirements.txt beside this file.
All mathematical computation runs in the student's browser, not on the server.
"""
from pathlib import Path

import streamlit as st
from streamlit.components.v1 import html as render_html


def main() -> None:
    st.set_page_config(
        page_title="점과 도형의 이동 실험실",
        page_icon="♟️",
        layout="wide",
        initial_sidebar_state="collapsed",
    )
    entry = Path(__file__).resolve().with_name("index.html")
    if not entry.is_file():
        st.error("index.html 파일이 없습니다. app.py와 같은 폴더에 index.html을 함께 올려 주세요.")
        st.stop()
    try:
        content = entry.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        st.error("index.html 파일을 읽지 못했습니다. 제공된 원본 파일을 다시 올려 주세요.")
        st.stop()
    if "window.MoveLab" not in content or "coordinate-plane" not in content:
        st.error("index.html 파일이 비어 있거나 올바른 이동 실험실 파일이 아닙니다.")
        st.stop()
    # A generous explicit height prevents the default short iframe from hiding the app.
    # Scrolling must stay enabled for portrait tablets and phones.
    render_html(content, height=1500, scrolling=True)
    st.caption(
        "화면이 길면 앱 안에서 아래로 스크롤하세요. "
        "실험 위치·이동 기록은 새로고침 시 초기화되며, 교사에게 자동 전송되지 않습니다."
    )


if __name__ == "__main__":
    main()
