#!/usr/bin/env python3
"""Build a cumulative mock-exam level from its paper specification"""

import argparse
import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "client/data/mock-exam.json"
LEVELS = ROOT / "client/data/levels-sangong.json"
INSIGHTS = ROOT / "client/data/insights.json"
GRADES = ROOT / "data/mock-exam/grades"
PAPER_SCHEMA = ROOT / "data/mock-exam/paper.schema.json"


def validate_paper(paper):
    schema = json.loads(PAPER_SCHEMA.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(paper), key=lambda error: list(map(str, error.path)))
    if errors:
        error = errors[0]
        location = ".".join(map(str, error.path)) or "paper"
        raise ValueError(f"invalid paper at {location}: {error.message}")
    sections = [name for name, _ in paper["sectionCounts"]]
    if len(sections) != len(set(sections)):
        raise ValueError("paper repeats a section type")
    contexts = paper.get("readingContexts", {})
    for name in sections:
        if name in ("sentenceSound", "sentenceMeaning", "sentenceBlank", "passage") and name not in contexts:
            raise ValueError(f"paper is missing reading context for {name}")
    if set(contexts) - set(sections):
        raise ValueError("paper has a reading context without a section")
    for name, context in contexts.items():
        expected = "paired" if name == "passage" else "blank" if name == "sentenceBlank" else "sentence"
        if context["kind"] != expected or context["minCharacters"] > context["maxCharacters"]:
            raise ValueError(f"invalid reading context for {name}")
    if "passage" in contexts and dict(paper["sectionCounts"])["passage"] != 2:
        raise ValueError("paired passage must have two questions")
    if "imageCharacter" in sections and not paper.get("pictureTargets"):
        raise ValueError("image section requires picture targets")
    if "imageCharacter" not in sections and paper.get("pictureTargets"):
        raise ValueError("picture targets require an image section")


def exam_huneum(value):
    parts = re.split(r"\s*(?:/|\|)\s*", value.strip())
    readings = []
    for part in parts:
        clean = re.sub(r"\([^)]*\)", "", part).replace(":", "").strip()
        match = re.fullmatch(r"(.+?)\s*([가-힣])", clean)
        if not match or not match.group(1).strip():
            raise ValueError(f"invalid MeaningNew: {value}")
        readings.append((match.group(1).strip(), match.group(2)))
    return readings

def build_grade(level, levels, insights, paper, meaning_new=None):
    validate_paper(paper)
    if meaning_new is None:
        raise ValueError(f"{level}급 requires an Anki MeaningNew snapshot")
    characters = []
    found = False
    for group in levels["groups"]:
        for hanja in group["characters"]:
            if hanja in levels.get("variants", {}):
                continue
            record = insights["characters"][hanja]
            meaning_source = meaning_new.get(hanja)
            if not isinstance(meaning_source, str) or not meaning_source.strip():
                raise ValueError(f"missing or invalid MeaningNew for {hanja} in {level}급")
            readings = exam_huneum(meaning_source)
            meaning, sound = readings[0]
            entry = {
                "hanja": hanja,
                "sound": sound,
                "meaning": meaning,
                "strokes": record["strokes"],
                "radical": record["radical"],
            }
            if len(readings) > 1:
                entry["sounds"] = list(dict.fromkeys(sound for _, sound in readings))
            characters.append(entry)
        if group["level"] == f"{level}급":
            found = True
            break
    if not found or len(characters) != len({entry["hanja"] for entry in characters}):
        raise ValueError(f"invalid cumulative character bank for {level}급")
    pictures = paper.get("pictureTargets", [])
    if not set(pictures) <= {entry["hanja"] for entry in characters}:
        raise ValueError(f"invalid picture targets for {level}급")
    sections = []
    for question_type, count in paper["sectionCounts"]:
        section = {"type": question_type, "count": count}
        if question_type in paper.get("readingContexts", {}):
            section["readingContext"] = paper["readingContexts"][question_type]
        sections.append(section)
    return {
        "level": f"{level}급",
        "source": paper["source"],
        "characters": characters,
        **({"pictureTargets": [{"hanja": hanja} for hanja in pictures]} if pictures else {}),
        "format": {
            "sourceLabel": paper["sourceLabel"],
            "durationSeconds": paper["durationSeconds"],
            "sections": sections,
            "scoring": paper["scoring"],
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", help="Numeric Sangong grade, for example 7; defaults to all paper specs")
    parser.add_argument("--meaning-new", type=Path, help="Override the selected grade's Anki MeaningNew snapshot")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    configs = json.loads(CONFIG.read_text(encoding="utf-8"))
    grade_dirs = {path.parent.name: path.parent for path in GRADES.glob("*/paper.json")}
    if args.level and args.level not in grade_dirs:
        raise SystemExit(f"No paper specification for {args.level}급")
    levels = json.loads(LEVELS.read_text(encoding="utf-8"))
    insights = json.loads(INSIGHTS.read_text(encoding="utf-8"))
    meaning_path = args.meaning_new or GRADES.parent / "anki-meaning-new.json"
    meaning_new = json.loads(meaning_path.read_text(encoding="utf-8"))
    for level in [args.level] if args.level else sorted(grade_dirs, key=int):
        paper = json.loads((grade_dirs[level] / "paper.json").read_text(encoding="utf-8"))
        grade = build_grade(level, levels, insights, paper, meaning_new)
        if args.check:
            if configs.get(level) != grade:
                raise SystemExit(f"{level}급 mock exam data is out of date")
        else:
            configs[level] = grade
    if not args.check:
        CONFIG.write_text(json.dumps(configs, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
