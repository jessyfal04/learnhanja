#!/usr/bin/env python3
"""Build the compact browser vocabulary catalog from KRDict and frequency data"""

import csv
import json
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/kr-dict_hanja/krdict_hanja.tsv"
OUTPUT = ROOT / "client/data/vocabulary.json"


def load_ranks(path):
    words = json.loads(path.read_text(encoding="utf-8"))
    ranks = {}
    for index, word in enumerate(words, 1):
        if not word or word == "NULL" or "_DUP" in word.upper():
            continue
        ranks.setdefault(word, index)
    return ranks


def is_hanja(character):
    codepoint = ord(character)
    return codepoint == 0x3007 or any(
        start <= codepoint <= end
        for start, end in (
            (0x3400, 0x4DBF),
            (0x4E00, 0x9FFF),
            (0xF900, 0xFAFF),
            (0x20000, 0x2EBEF),
            (0x30000, 0x3134F),
        )
    )


def main():
    pokemon = load_ranks(ROOT / "data/freq/Pokémon.json")
    nikl = load_ranks(ROOT / "data/freq/NIKL.json")
    entries = []
    indexes = {}
    meaning_sets = []
    definition_sets = []

    with SOURCE.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            hanja = unicodedata.normalize("NFKC", row["hanja"].strip())
            hangul = row["word"].strip()
            meaning = row["meaning_en"].strip()
            definition = row.get("definition_ko", "").strip()
            if not hanja or not hangul or not all(is_hanja(character) for character in hanja):
                continue
            key = (hanja, hangul)
            if key not in indexes:
                indexes[key] = len(entries)
                entries.append([hanja, hangul, [], [], pokemon.get(hangul, 0), nikl.get(hangul, 0)])
                meaning_sets.append(set())
                definition_sets.append(set())
            index = indexes[key]
            if meaning and meaning not in meaning_sets[index]:
                meaning_sets[index].add(meaning)
                entries[index][2].append(meaning)
            if definition and definition not in definition_sets[index]:
                definition_sets[index].add(definition)
                entries[index][3].append(definition)

    OUTPUT.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} vocabulary entries to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
