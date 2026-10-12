#!/usr/bin/env python3
"""Build a cumulative mock-exam level from its paper specification"""

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "client/data/mock-exam.json"
LEVELS = ROOT / "client/data/levels-sangong.json"
INSIGHTS = ROOT / "client/data/insights.json"
PAPERS = ROOT / "data/mock-exam-papers.json"

def build_grade(level, levels, insights, paper, meaning_new=None):
    use_meaning_new = int(level) <= 6
    if use_meaning_new and meaning_new is None:
        raise ValueError(f"{level}급 requires an Anki MeaningNew snapshot")
    characters = []
    found = False
    for group in levels["groups"]:
        for hanja in group["characters"]:
            record = insights["characters"][hanja]
            meaning_source = meaning_new.get(hanja) if use_meaning_new else record["hun"]
            if not isinstance(meaning_source, str) or " " not in meaning_source.strip():
                raise ValueError(f"missing or invalid MeaningNew for {hanja} in {level}급")
            meaning, sound = meaning_source.rsplit(" ", 1)
            characters.append({
                "hanja": hanja,
                "sound": sound,
                "meaning": meaning,
                "strokes": record["strokes"],
                "radical": record["radical"],
            })
        if group["level"] == f"{level}급":
            found = True
            break
    if not found or len(characters) != len({entry["hanja"] for entry in characters}):
        raise ValueError(f"invalid cumulative character bank for {level}급")
    pictures = paper.get("pictureTargets", {})
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
        "pictureTargets": [{"hanja": hanja, "subject": subject} for hanja, subject in pictures.items()],
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
    parser.add_argument("--meaning-new", type=Path, help="JSON mapping of Hanja to Anki MeaningNew field; required for 6급 and above")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    configs = json.loads(CONFIG.read_text(encoding="utf-8"))
    papers = json.loads(PAPERS.read_text(encoding="utf-8"))
    if args.level and args.level not in papers:
        raise SystemExit(f"No paper specification for {args.level}급")
    levels = json.loads(LEVELS.read_text(encoding="utf-8"))
    insights = json.loads(INSIGHTS.read_text(encoding="utf-8"))
    meaning_new = json.loads(args.meaning_new.read_text(encoding="utf-8")) if args.meaning_new else None
    for level in [args.level] if args.level else papers:
        grade = build_grade(level, levels, insights, papers[level], meaning_new)
        if args.check:
            if configs.get(level) != grade:
                raise SystemExit(f"{level}급 mock exam data is out of date")
        else:
            configs[level] = grade
    if not args.check:
        CONFIG.write_text(json.dumps(configs, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
