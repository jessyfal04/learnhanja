#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Minimal AnkiConnect exporter
- Query: deck:"한자" -is:new card:1 (can override with --query)
- Extracts a single hanja character per note
- Sorts by first review time (oldest first)
- Writes one char per line to data/mylists/anki.tsv
- Verbose mode prints first/last 5 with human dates

Usage: python3 anki_export.py [-v] [--query ...] [--out ...]
Requires: pip install requests, and Anki running with AnkiConnect.
"""

from __future__ import annotations
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Tuple
import argparse

import requests


ANKI_URL = "http://127.0.0.1:8765"
QUERY_DEFAULT = 'deck:"한자" -is:new card:1'
OUT_PATH_DEFAULT = Path("data/mylists/anki.tsv")


def ac_request(action: str, **params: Any) -> Any:
    payload = {"action": action, "version": 6, "params": params}
    r = requests.post(ANKI_URL, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    if data.get("error"):
        raise RuntimeError(data["error"]) 
    return data.get("result")


def human_time(ms: int) -> str:
    if ms >= (1 << 62):
        return "(no reviews)"
    return datetime.fromtimestamp(ms / 1000.0).strftime("%Y-%m-%d %H:%M:%S")


def is_hanja_char(c: str) -> bool:
    cp = ord(c)
    return (0x3400 <= cp <= 0x9FFF) or (0xF900 <= cp <= 0xFAFF)


def extract_char_from_fields(fields: Dict[str, Dict[str, Any]]) -> str:
    # Prefer obvious field names if present
    preferred = ["Hanja", "hanja", "漢字", "Character", "Char"]
    for name in preferred:
        if name in fields:
            val = fields[name].get("value", "") or ""
            for ch in val:
                if is_hanja_char(ch):
                    return ch
    # Fallback: scan all fields, pick first hanja-looking char
    # Use order metadata if available
    items: List[Tuple[int, str, Dict[str, Any]]] = []
    for k, v in fields.items():
        items.append((int(v.get("order", 0)), k, v))
    for _ord, _k, v in sorted(items):
        val = v.get("value", "") or ""
        for ch in val:
            if is_hanja_char(ch):
                return ch
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--verbose", "-v", action="store_true")
    ap.add_argument("--query", default=QUERY_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_PATH_DEFAULT)
    args, _ = ap.parse_known_args()

    card_ids: List[int] = ac_request("findCards", query=args.query) or []
    if not card_ids:
        if args.verbose:
            print("[warn] No matching cards found for:", args.query)
        return 0

    cards: List[Dict[str, Any]] = ac_request("cardsInfo", cards=card_ids) or []

    reviews_map: Dict[str, List[Dict[str, Any]]] = ac_request("getReviewsOfCards", cards=card_ids) or {}
    earliest: Dict[int, int] = {}
    for k, revs in reviews_map.items():
        if revs:
            earliest[int(k)] = min(int(r.get("id", 1 << 62)) for r in revs)

    ordered = sorted(cards, key=lambda c: (earliest.get(int(c.get("cardId", 0)), 1 << 62), int(c.get("cardId", 0))))

    seen: set[str] = set()
    ordered_chars: List[Tuple[str, int]] = []
    for c in ordered:
        ch = extract_char_from_fields(c.get("fields") or {})
        if ch and ch not in seen:
            seen.add(ch)
            ordered_chars.append((ch, earliest.get(int(c.get("cardId", 0)), 1 << 62)))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for ch, _t in ordered_chars:
            f.write(ch + "\n")

    if args.verbose:
        n = len(ordered_chars)
        head = ordered_chars[:5]
        tail = ordered_chars[-5:] if n >= 5 else []
        print("[info] Query:", args.query)
        print(f"[info] Cards: {len(cards)}  Unique chars: {n}")
        if head:
            print("[info] First 5 (oldest):")
            for ch, t in head:
                print(" ", ch, human_time(t))
        if tail:
            print("[info] Last 5 (latest):")
            for ch, t in tail:
                print(" ", ch, human_time(t))
    else:
        print(f"[done] Wrote {args.out} ({len(ordered_chars)} chars)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
