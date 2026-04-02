#!/usr/bin/env python3
"""
KRDict (국립국어원 한국어기초사전) → TSV exporter (Hangul + Hanja + meaning)

Input: KRDict ZIP (preferred), a single XML, or a directory of XMLs.
Output columns (TSV): target_code, word, sup_no, hanja, pos, definition_ko, meaning_en.
Only entries with a detected Hanja value are written.
"""

from __future__ import annotations
import argparse
import csv
import html
import io
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from typing import Iterable, Iterator, Tuple


CJK_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
HANGUL_SYLLABLE_RE = re.compile(r"[\uAC00-\uD7A3]")


def localname(tag: str) -> str:
    return tag.split('}', 1)[1] if '}' in tag else tag


def find_first_text(elem: ET.Element, paths: Iterable[str]) -> str:
    for p in paths:
        a = elem.find(p)
        if a is not None and a.text:
            t = a.text.strip()
            if t:
                return t
    return ""


def find_all_texts(elem: ET.Element, path: str) -> list[str]:
    out: list[str] = []
    for n in elem.findall(path):
        if n is not None and n.text:
            t = n.text.strip()
            if t:
                out.append(t)
    return out


def looks_like_hanja(s: str) -> bool:
    return bool(s and CJK_RE.search(s))


def extract_hanja(elem: ET.Element) -> str:
    # Try likely locations for origin/hanja
    candidates: list[str] = []
    candidates += find_all_texts(elem, ".//origin")
    candidates += find_all_texts(elem, ".//original_language_info/original_language")
    candidates += find_all_texts(elem, ".//original_language")
    candidates += find_all_texts(elem, ".//word_info/original_language_info/original_language")
    hanja = [c for c in candidates if looks_like_hanja(c)]
    if not hanja:
        return ""
    hanja.sort(key=lambda x: (len(x), x))
    return hanja[0]


def extract_definition_ko(elem: ET.Element) -> str:
    return find_first_text(elem, [
        ".//sense/definition",
        ".//sense_info/definition",
        ".//definition",
    ])


def extract_english_translation(elem: ET.Element) -> str:
    for tr in elem.findall(".//translation"):
        lang = find_first_text(tr, ["./trans_lang", "./language", "./lang"])
        if lang in ("영어", "English") or "영어" in lang or "English" in lang:
            en = find_first_text(tr, ["./trans_dfn", "./definition", "./trans_definition"])
            if en:
                return en
    return find_first_text(elem, [".//translation/trans_dfn"]) or ""


def extract_pos(elem: ET.Element) -> str:
    return find_first_text(elem, [
        ".//word_info/pos",
        ".//pos",
        ".//part_of_speech",
    ])


def extract_target_code(elem: ET.Element) -> str:
    return find_first_text(elem, [
        ".//target_code",
        ".//targetCode",
        ".//ParaWordNo",
    ])


def extract_sup_no(elem: ET.Element) -> str:
    return find_first_text(elem, [
        ".//sup_no",
        ".//supNo",
    ])


def extract_word(elem: ET.Element) -> str:
    return find_first_text(elem, [
        ".//word_info/word",
        ".//word",
        ".//entry",
        ".//headword",
    ])


def iter_items_from_xml(fp: io.BufferedReader) -> Iterator[ET.Element]:
    context = ET.iterparse(fp, events=("end",))
    for event, elem in context:
        tag = localname(elem.tag)
        if tag in {"item", "LexicalEntry"}:
            yield elem
            elem.clear()


def find_feat_value(elem: ET.Element | None, att_name: str) -> str:
    if elem is None:
        return ""
    for feat in elem.findall("./feat"):
        if feat.get("att") == att_name:
            val = (feat.get("val") or "").strip()
            if val:
                return val
    return ""


def extract_hanja_from_lexical_entry(elem: ET.Element) -> str:
    candidates: list[str] = []
    candidates.append(find_feat_value(elem, "origin"))
    candidates.append(find_feat_value(elem, "hanja"))
    for sense in elem.findall("./Sense"):
        candidates.append(find_feat_value(sense, "origin"))
    for raw in candidates:
        if not raw:
            continue
        unescaped = html.unescape(raw)
        unescaped = re.sub(r"<[^>]+>", " ", unescaped)
        chars = "".join(CJK_RE.findall(unescaped))
        if chars:
            return chars
    return ""


def has_sufficient_hanja(word: str, hanja: str) -> bool:
    hangul_chars = [ch for ch in word if HANGUL_SYLLABLE_RE.match(ch)]
    if not hangul_chars:
        return True  # Non-Hangul headwords (rare) pass through.
    return len(hanja) >= len(hangul_chars)


def extract_definition_ko_from_lexical_entry(elem: ET.Element) -> str:
    first_sense = elem.find("./Sense")
    return find_feat_value(first_sense, "definition")


def extract_english_from_lexical_entry(elem: ET.Element) -> str:
    for sense in elem.findall("./Sense"):
        for eq in sense.findall("Equivalent"):
            lang = find_feat_value(eq, "language")
            if "영어" in lang or "English" in lang or lang.lower().startswith("en"):
                return find_feat_value(eq, "lemma") or find_feat_value(eq, "definition")
    return ""


def extract_word_from_lexical_entry(elem: ET.Element) -> str:
    return find_feat_value(elem.find("./Lemma"), "writtenForm")


def process_xml_file(fp: io.BufferedReader) -> Iterator[Tuple[str, str, str, str, str, str, str]]:
    for item in iter_items_from_xml(fp):
        tag = localname(item.tag)
        if tag == "item":
            word = extract_word(item)
            hanja = extract_hanja(item)
            if not word or not hanja or not has_sufficient_hanja(word, hanja):
                continue
            target_code = extract_target_code(item)
            sup_no = extract_sup_no(item)
            pos = extract_pos(item)
            definition_ko = extract_definition_ko(item)
            meaning_en = extract_english_translation(item)
            yield (target_code, word, sup_no, hanja, pos, definition_ko, meaning_en)
        elif tag == "LexicalEntry":
            word = extract_word_from_lexical_entry(item)
            hanja = extract_hanja_from_lexical_entry(item)
            if not word or not hanja or not has_sufficient_hanja(word, hanja):
                continue
            target_code = item.attrib.get("val", "") or item.attrib.get("id", "")
            first_sense = item.find("./Sense")
            sup_no = first_sense.attrib.get("val", "") if first_sense is not None else ""
            pos = find_feat_value(item, "partOfSpeech")
            definition_ko = extract_definition_ko_from_lexical_entry(item)
            meaning_en = extract_english_from_lexical_entry(item)
            yield (target_code, word, sup_no, hanja, pos, definition_ko, meaning_en)


def write_tsv(rows: Iterable[Tuple[str, str, str, str, str, str, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["target_code", "word", "sup_no", "hanja", "pos", "definition_ko", "meaning_en"])
        for r in rows:
            w.writerow(r)


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert KRDict XML/ZIP to TSV for Hanja entries")
    ap.add_argument("--input", required=True, help="Path to XML, ZIP of XMLs, or a directory containing XMLs")
    ap.add_argument("--out", required=True, help="Output TSV path")
    args = ap.parse_args()

    inp = Path(args.input)
    outp = Path(args.out)

    def all_rows() -> Iterable[Tuple[str, str, str, str, str, str, str]]:
        # Prefer KRDict ZIP dumps; fallback to directory of XMLs, then single XML.
        if zipfile.is_zipfile(str(inp)):
            with zipfile.ZipFile(str(inp), "r") as z:
                names = [n for n in z.namelist() if n.lower().endswith(".xml")]
                if not names:
                    raise SystemExit("ZIP contains no .xml files")
                for n in names:
                    with z.open(n, "r") as raw:
                        buf = io.BufferedReader(raw)
                        yield from process_xml_file(buf)
            return

        if inp.is_dir():
            xmls = sorted(inp.glob("*.xml"))
            if not xmls:
                raise SystemExit("Directory contains no .xml files")
            for p in xmls:
                with p.open("rb") as raw:
                    buf = io.BufferedReader(raw)
                    yield from process_xml_file(buf)
            return

        if not inp.exists():
            raise SystemExit(f"Input not found: {inp}")

        with inp.open("rb") as raw:
            buf = io.BufferedReader(raw)
            yield from process_xml_file(buf)

    write_tsv(all_rows(), outp)
    print(f"✅ Wrote TSV: {outp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
