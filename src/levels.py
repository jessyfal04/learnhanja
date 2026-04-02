from typing import List, Set, Dict
from pathlib import Path
import requests
from bs4 import BeautifulSoup

from .constants import LEVEL_DIR, HANMUN_LEVEL_URL, DEFAULT_LEVEL_CHARS, HEADERS
from .text import to_unified, is_hanja_char

def scrape_hanmun_level(level: int) -> List[str]:
    url = HANMUN_LEVEL_URL.get(level)
    if not url:
        raise ValueError(f"No URL configured for level {level}.")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    chars: List[str] = []
    content = soup.select_one(".mw-parser-output") or soup

    for td in content.select("table td"):
        text = to_unified(td.get_text(strip=True))
        for ch in text:
            if is_hanja_char(ch):
                chars.append(ch)

    if len(set(chars)) < 40:
        for tag in content.select("ul li, p"):
            text = to_unified(tag.get_text(" ", strip=True))
            for ch in text:
                if is_hanja_char(ch):
                    chars.append(ch)

    seen = set(); ordered = []
    for ch in chars:
        if ch not in seen:
            seen.add(ch); ordered.append(ch)
    return ordered

def get_level_chars_from_files(levels: List[int]) -> Set[str]:
    chars: Set[str] = set()
    for lv in levels:
        path = LEVEL_DIR / f"{lv}.tsv"
        if not path.exists():
            try:
                scraped = scrape_hanmun_level(lv)
                chars.update(scraped)
            except Exception:
                chars.update(DEFAULT_LEVEL_CHARS.get(lv, []))
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s:
                continue
            for ch in s:
                if is_hanja_char(ch):
                    chars.add(to_unified(ch))
    return chars

