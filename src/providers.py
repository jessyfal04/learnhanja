from typing import List, Tuple, Dict, Optional, Iterator
from urllib.parse import quote
from pathlib import Path
import csv
import requests
from bs4 import BeautifulSoup

from .constants import HEADERS
from .text import to_unified, only_hanja

class VocabProvider:
    def get_for_char(self, char: str, per_char_limit: int, verbose: bool = False) -> List[Tuple[str, str, str]]:
        raise NotImplementedError

class KhanjaScrapeProvider(VocabProvider):
    def get_for_char(self, char: str, per_char_limit: int, verbose: bool = False) -> List[Tuple[str, str, str]]:
        return scrape_vocab_from_khanja(char, per_char_limit, verbose)

def scrape_vocab_from_khanja(char: str, per_char_limit: int, verbose: bool = False) -> List[Tuple[str, str, str]]:
    url = f"https://koreanhanja.app/{quote(char)}"
    if verbose:
        print(f"[debug] GET {url}")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    results: List[Tuple[str, str, str]] = []

    table = soup.select_one("table.similar-words")
    if table:
        for tr in table.select("tr"):
            tds = tr.find_all("td")
            if len(tds) < 1:
                continue
            hanja_text = to_unified(tds[0].get_text(strip=True))
            if not hanja_text or not only_hanja(hanja_text):
                continue
            hangul_text = ""
            gloss_text = ""
            if len(tds) >= 2:
                hangul_text = tds[1].get_text(strip=True)
            if len(tds) >= 3:
                gloss_text = tds[2].get_text(" ", strip=True)
            results.append((hanja_text, hangul_text, gloss_text))
            if len(results) >= per_char_limit:
                return results

    if not results:
        candidate_selectors = [
            "table td a", "table td", "section a", "ul li a", "ul li"
        ]
        seen = set()
        import re
        for sel in candidate_selectors:
            for node in soup.select(sel):
                text = to_unified(node.get_text(" ", strip=True))
                tokens = re.split(r"\s+|\(|\)|\[|\]|—|-|–|·|•|:|：|,|，", text)
                hanja_candidates = [t for t in tokens if only_hanja(t)]
                if not hanja_candidates:
                    continue
                hanja_word = hanja_candidates[0]
                if hanja_word in seen:
                    continue
                seen.add(hanja_word)
                results.append((hanja_word, "", ""))
                if len(results) >= per_char_limit:
                    return results
    if verbose:
        print(f"[debug] parsed {len(results)} entries for {char}")
    return results


# --- KRDict TSV provider ---


def _looks_like_hanja(s: str) -> bool:
    return bool(s and only_hanja(to_unified(s)))


def _iter_tsv_rows(tsv_path: Path) -> Iterator[Tuple[str, str, str]]:
    with tsv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            hanja = (row.get('hanja') or '').strip()
            word = (row.get('word') or '').strip()
            gloss = (row.get('meaning_en') or '').strip()
            if not hanja or not _looks_like_hanja(hanja):
                continue
            yield hanja, word, gloss


class KRDictProvider(VocabProvider):
    def __init__(self, tsv_path: Optional[Path] = None):
        self.tsv_path = tsv_path
        self._index: Dict[str, List[Tuple[str, str, str]]] = {}
        self._loaded = False

    def _resolve_tsv(self) -> Optional[Path]:
        if self.tsv_path and self.tsv_path.exists():
            return self.tsv_path
        default = Path('data/kr-dict_hanja/krdict_hanja.tsv')
        if default.exists():
            return default
        return None

    def _load(self):
        if self._loaded:
            return
        tsv = self._resolve_tsv()
        if not tsv:
            self._loaded = True
            return

        idx: Dict[str, List[Tuple[str, str, str]]] = {}
        for hanja, word, gloss in _iter_tsv_rows(tsv):
            hw = to_unified(hanja)
            gloss_text = gloss
            seen_chars = set()
            for ch in hw:
                if not only_hanja(ch):
                    continue
                if ch in seen_chars:
                    continue
                seen_chars.add(ch)
                idx.setdefault(ch, []).append((hw, word, gloss_text))

        self._index = idx
        self._loaded = True

    def get_for_char(self, char: str, per_char_limit: int, verbose: bool = False) -> List[Tuple[str, str, str]]:
        self._load()
        rows = self._index.get(char, [])
        if verbose:
            print(f"[krdict] {char} -> {len(rows)} entries")
        return rows[:per_char_limit]
