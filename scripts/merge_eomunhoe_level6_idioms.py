#!/usr/bin/env python3
"""Merge the preserved 어문회 6급 TSV into the browser idiom catalog."""

import csv
import json
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/idioms/eomunhoe_level6_sajaseongeo.tsv"
CATALOG = ROOT / "client/data/idioms.json"
SOURCE_ID = "eomunhoe6"


def key(korean, hanja):
    return korean.strip(), unicodedata.normalize("NFKC", hanja.strip())


def main():
    with SOURCE.open(encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file, delimiter="\t")
        if reader.fieldnames != ["한자", "독음", "뜻"]:
            raise ValueError(f"Unexpected TSV columns: {reader.fieldnames}")
        rows = list(reader)

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = catalog["entries"]
    by_key = {key(entry["korean"], entry["hanja"]): entry for entry in entries}
    seen = set()

    for order, row in enumerate(rows, 1):
        hanja, korean, meaning = (row[column].strip() for column in ("한자", "독음", "뜻"))
        if not hanja or not korean or not meaning:
            raise ValueError(f"Incomplete TSV entry at row {order + 1}")
        entry_key = key(korean, hanja)
        if entry_key in seen:
            raise ValueError(f"Duplicate TSV entry at row {order + 1}")
        seen.add(entry_key)

        entry = by_key.get(entry_key)
        if entry is None:
            entry = {"korean": korean, "hanja": hanja, "partial": False, "sources": [], "sourceOrders": {}}
            entries.append(entry)
            by_key[entry_key] = entry
        if SOURCE_ID not in entry["sources"]:
            entry["sources"].append(SOURCE_ID)
        entry["sourceOrders"][SOURCE_ID] = order
        entry["meaning"] = meaning

    source_info = {
        "id": SOURCE_ID,
        "name": "어문회 6급 사자성어 목록",
        "shortName": "어문회 6급",
        "total": len(rows),
    }
    catalog["sources"] = [source for source in catalog["sources"] if source["id"] != SOURCE_ID] + [source_info]
    catalog["total"] = len(entries)
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Merged {len(rows)} 어문회 6급 entries; {len(entries)} unique idioms total")


if __name__ == "__main__":
    main()
