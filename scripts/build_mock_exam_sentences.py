#!/usr/bin/env python3
"""Build offline mock-exam reading sentences from the bundled KRDict XML"""

import argparse
import collections
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/kr-dict_hanja/kr-dict-20251219.zip"
CONFIG = ROOT / "client/data/mock-exam.json"
VOCABULARY = ROOT / "client/data/vocabulary.json"
OUTPUT = ROOT / "client/data/mock-exam-sentences.json"
HANJA = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")


def feat(element, name):
    if element is None:
        return ""
    return next((part.get("val", "").strip() for part in element.findall("feat") if part.get("att") == name), "")


def reading_targets(configs, catalog):
    targets = {}
    for level, config in configs.items():
        contexts = [section.get("readingContext") for section in config["format"]["sections"]]
        contexts = [context for context in contexts if context and context.get("kind") == "sentence"]
        if not contexts:
            continue
        allowed = {character["hanja"] for character in config["characters"]}
        level_targets = {}
        counts = collections.Counter()
        for hanja, reading, _, definitions, *_ in catalog:
            if not definitions or not any(definition.strip() for definition in definitions):
                continue
            if all(character in allowed for character in hanja):
                counts[hanja] += 1
                for context in contexts:
                    if len(hanja) == len(reading) == context["wordLength"] and all("가" <= ch <= "힣" for ch in reading):
                        level_targets[(hanja, reading)] = context
        targets[level] = {key: context for key, context in level_targets.items() if counts[key[0]] == 1}
    return targets


def build():
    configs = json.loads(CONFIG.read_text(encoding="utf-8"))
    catalog = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    targets = reading_targets(configs, catalog)
    result = {level: {} for level in targets}
    target_index = collections.defaultdict(list)
    for level, entries in targets.items():
        for key, context in entries.items():
            target_index[key].append((level, context))

    with zipfile.ZipFile(SOURCE) as archive:
        for name in archive.namelist():
            if not name.endswith(".xml"):
                continue
            with archive.open(name) as source:
                for _, entry in ET.iterparse(source, events=("end",)):
                    if entry.tag != "LexicalEntry":
                        continue
                    reading = feat(entry.find("Lemma"), "writtenForm")
                    hanja = unicodedata.normalize("NFKC", feat(entry, "origin"))
                    key = (hanja, reading)
                    if key in target_index:
                        first_sense = entry.find("Sense")
                        if first_sense is not None:
                            for example in first_sense.findall("SenseExample"):
                                if feat(example, "type") != "문장":
                                    continue
                                sentence = feat(example, "example")
                                if sentence.count(reading) != 1 or HANJA.search(sentence) or "\n" in sentence:
                                    continue
                                sentence = sentence.replace(reading, hanja, 1)
                                if reading in sentence:
                                    continue
                                for level, context in target_index[key]:
                                    if context["minCharacters"] <= len(sentence) <= context["maxCharacters"]:
                                        result[level].setdefault(hanja, []).append(sentence)
                    entry.clear()

    return {
        "source": "국립국어원 한국어기초사전 2025-12-19 (CC BY-SA 2.0 KR)",
        "levels": {
            level: {hanja: list(dict.fromkeys(sentences)) for hanja, sentences in sorted(words.items())}
            for level, words in result.items()
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the generated file without updating it")
    arguments = parser.parse_args()
    rendered = json.dumps(build(), ensure_ascii=False, separators=(",", ":")) + "\n"
    if arguments.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != rendered:
            raise SystemExit("mock-exam-sentences.json is out of date")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
    data = json.loads(rendered)
    for level, words in data["levels"].items():
        print(f"{level}급: {len(words)} words, {sum(map(len, words.values()))} sentences")


if __name__ == "__main__":
    main()
