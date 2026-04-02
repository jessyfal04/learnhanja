from typing import List, Tuple
from pathlib import Path

from .constants import VOCAB_DIR
from .text import to_unified

def vocab_cache_path_for_char(ch: str) -> Path:
    return VOCAB_DIR / f"U+{ord(ch):04X}.tsv"

def read_cached_vocab(ch: str) -> List[Tuple[str, str, str]]:
    path = vocab_cache_path_for_char(ch)
    if not path.exists():
        return []
    rows: List[Tuple[str, str, str]] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        if i == 0 and line.strip().lower().startswith("hanja\t"):
            continue
        if not line.strip():
            continue
        parts = line.split("\t")
        while len(parts) < 3:
            parts.append("")
        rows.append((to_unified(parts[0]), parts[1], parts[2]))
    return rows

def write_cached_vocab(ch: str, rows: List[Tuple[str, str, str]]):
    path = vocab_cache_path_for_char(ch)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write("Hanja\tHangul\tEnglish\n")
        for a, b, c in rows:
            f.write(f"{a}\t{b}\t{c}\n")

