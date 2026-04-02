from __future__ import annotations
from pathlib import Path
import json
from typing import Dict, Tuple


def _load_ranked_list(path: Path) -> Dict[str, int]:
    ranks: Dict[str, int] = {}
    if not path.exists():
        return ranks
    data = json.loads(path.read_text(encoding="utf-8"))
    for idx, word in enumerate(data, start=1):
        if not word or word == "NULL" or "_DUP" in word.upper():
            continue
        if word not in ranks:  # keep first occurrence
            ranks[word] = idx
    return ranks


def load_freq_maps(base_dir: Path = Path("data/freq")) -> Tuple[Dict[str, int], Dict[str, int]]:
    pkm = _load_ranked_list(base_dir / "Pokémon.json")
    nikl = _load_ranked_list(base_dir / "NIKL.json")
    return pkm, nikl

