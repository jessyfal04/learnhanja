#!/usr/bin/env python3
"""Merge the preserved 어문회 6급 TSVs into the browser idiom catalog."""

import csv
import json
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "client/data/idioms.json"
LEVELS = ROOT / "client/data/levels.json"
LEGACY_SOURCE_IDS = {"eomunhoe6"}
CANONICAL_HANJA = str.maketrans({"教": "敎", "絕": "絶", "姊": "姉", "青": "靑"})
SOURCE_METADATA = {
    "exam": {
        "name": "꼭 시험에 나오는 고사성어",
        "shortName": "시험 교재",
        "sourceUrl": "https://product.kyobobook.co.kr/detail/S000215142650",
    },
    "nikl": {
        "name": "국립국어원 한국어 교육 어휘 내용 개발(3단계), 4.3절",
        "shortName": "국립국어원",
        "sourceUrl": "https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800",
        "license": "공공누리 제4유형: 출처표시, 비상업적 이용, 변경금지",
    },
    "master_6": {
        "name": "한자능력검정시험 마스터 6급·6급Ⅱ",
        "shortName": "어문회 6급 (마스터)",
        "sourceUrl": "https://product.kyobobook.co.kr/detail/S000000525684",
    },
    "onebook_6": {
        "name": "어문회 한자능력검정시험 6급 한 권으로 끝내기",
        "shortName": "어문회 6급 (한권)",
        "sourceUrl": "https://product.kyobobook.co.kr/detail/S000216865870",
    },
}
SOURCES = (
    {
        "id": "master_6",
        "path": ROOT / "data/idioms/master_6.tsv",
        "columns": ("한자", "독음"),
    },
    {
        "id": "onebook_6",
        "path": ROOT / "data/idioms/onebook_6.tsv",
        "columns": ("Hanja", "Hangeul"),
    },
)


def key(korean, hanja):
    return korean.strip(), unicodedata.normalize("NFKC", hanja.strip())


def canonicalize_hanja(hanja):
    return hanja.translate(CANONICAL_HANJA)


def read_source(source, catalog_characters):
    with source["path"].open(encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file, delimiter="\t")
        if reader.fieldnames != list(source["columns"]):
            raise ValueError(f"Unexpected TSV columns in {source['path'].name}: {reader.fieldnames}")
        raw_rows = list(reader)

    rows = []
    seen = set()
    for order, row in enumerate(raw_rows, 1):
        hanja_column, korean_column = source["columns"]
        hanja = canonicalize_hanja(row[hanja_column].strip())
        korean = row[korean_column].strip()
        if not hanja or not korean:
            raise ValueError(f"Incomplete TSV entry in {source['path'].name} at row {order + 1}")
        entry_key = key(korean, hanja)
        if entry_key in seen:
            raise ValueError(f"Duplicate TSV entry in {source['path'].name} at row {order + 1}")
        seen.add(entry_key)
        unknown = sorted({character for character in hanja if "\u3400" <= character <= "\u9fff" and character not in catalog_characters})
        if unknown:
            raise ValueError(f"Characters outside the 3,500-character catalog in {source['path'].name} at row {order + 1}: {''.join(unknown)}")
        rows.append({"hanja": hanja, "korean": korean})
    return rows


def main():
    levels = json.loads(LEVELS.read_text(encoding="utf-8"))
    catalog_characters = {character for group in levels["groups"] for character in group["characters"]}
    source_rows = {source["id"]: read_source(source, catalog_characters) for source in SOURCES}

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = catalog["entries"]
    managed_source_ids = LEGACY_SOURCE_IDS | set(source_rows)
    for entry in entries:
        entry["hanja"] = canonicalize_hanja(entry["hanja"])
        had_managed_source = any(source_id in managed_source_ids for source_id in entry["sources"])
        entry["sources"] = [source_id for source_id in entry["sources"] if source_id not in managed_source_ids]
        for source_id in managed_source_ids:
            entry["sourceOrders"].pop(source_id, None)
            entry.get("sourceMeanings", {}).pop(source_id, None)
        if had_managed_source:
            entry.pop("meaning", None)
        if not entry.get("sourceMeanings"):
            entry.pop("sourceMeanings", None)
    entries[:] = [entry for entry in entries if entry["sources"]]
    by_key = {key(entry["korean"], entry["hanja"]): entry for entry in entries}

    for source_id, rows in source_rows.items():
        for order, row in enumerate(rows, 1):
            entry_key = key(row["korean"], row["hanja"])
            entry = by_key.get(entry_key)
            if entry is None:
                entry = {"korean": row["korean"], "hanja": row["hanja"], "partial": False, "sources": [], "sourceOrders": {}}
                entries.append(entry)
                by_key[entry_key] = entry
            entry["sources"].append(source_id)
            entry["sourceOrders"][source_id] = order

    source_totals = {source["id"]: source["total"] for source in catalog["sources"]}
    source_totals.update({source_id: len(rows) for source_id, rows in source_rows.items()})
    catalog["sources"] = [
        {"id": source_id, **metadata, "total": source_totals[source_id]}
        for source_id, metadata in SOURCE_METADATA.items()
    ]
    catalog["total"] = len(entries)
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    summary = ", ".join(f"{source_id} {len(rows)}" for source_id, rows in source_rows.items())
    print(f"Merged {summary}; {len(entries)} unique idioms total")


if __name__ == "__main__":
    main()
