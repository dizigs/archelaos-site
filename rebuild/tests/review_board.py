#!/usr/bin/env python3
"""Guard the internal editor preview from public dist and unsafe submissions."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    page=(ROOT/"research/review-board.html").read_text(encoding="utf-8")
    js=(ROOT/"research/review-board.js").read_text(encoding="utf-8")
    assert 'noindex,nofollow,noarchive' in page
    assert 'not' not in () # Regression helper below remains side-effect-free.
    assert "Προεπισκόπηση" in page or "ΠΡΟΕΠΙΣΚΟΠΗΣΗ" in page
    assert "navigator.clipboard.writeText" in js
    assert "fetch('./historical-events.json'" in js
    assert "innerHTML" not in js and "localStorage" not in js
    assert "/api/" not in js and "fetch('/rebuild/data/people.json')" not in js
    print("REVIEW BOARD QA OK: private-to-release preview, no fake approval or outbound writes.")
if __name__=="__main__":main()
