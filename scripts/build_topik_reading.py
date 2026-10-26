#!/usr/bin/env python3
"""Extract locally held TOPIK II reading papers from the Migaku EPUBs."""

import argparse
import base64
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


CHOICES = "①②③④"
NS = "{http://www.w3.org/1999/xhtml}"


def content(element):
    return " ".join("".join(element.itertext()).split())


def read_paper(path):
    paper = {"id": path.name.split("_")[0], "title": path.name.split("_")[0] + " TOPIK II", "questions": []}
    with ZipFile(path) as archive:
        files = sorted(name for name in archive.namelist() if re.search(r"/reading-\d+\.xhtml$", name))
        instruction = ""
        for name in files:
            root = ET.fromstring(archive.read(name))
            body = root.find(f"{NS}body")
            common = []
            pending = []
            question = None
            after_answer = False
            for element in body:
                tag = element.tag.removeprefix(NS)
                kind = element.get("class", "")
                if tag == "h1":
                    continue
                if kind == "instruction":
                    instruction = content(element)
                    if after_answer:
                        common = []
                        pending = []
                    continue
                if tag == "h2":
                    if pending:
                        common = pending
                        pending = []
                    number = int(re.search(r"\d+", element.get("id", "")).group())
                    question = {"number": number, "instruction": instruction if len(instruction) >= 12 else "다음을 읽고 가장 알맞은 답을 고르십시오.", "shared": list(common), "prompt": [], "choices": [], "answer": None, "images": [], "_choice_text": []}
                    paper["questions"].append(question)
                    after_answer = False
                    continue
                if tag == "img":
                    if question is None:
                        raise ValueError(f"image before question: {name}")
                    image_path = str(Path(name).parent / element.get("src"))
                    suffix = Path(image_path).suffix.lower()
                    mime = "image/png" if suffix == ".png" else "image/jpeg"
                    question["images"].append("data:" + mime + ";base64," + base64.b64encode(archive.read(image_path)).decode("ascii"))
                    continue
                if tag != "p":
                    continue
                value = content(element)
                if not value:
                    continue
                if question is None:
                    common.append(value)
                elif after_answer:
                    pending.append(value)
                elif kind == "answer":
                    match = re.search("[①②③④]", value)
                    if not match:
                        raise ValueError(f"missing answer {paper['id']} #{question['number']}")
                    question["answer"] = CHOICES.index(match.group())
                    after_answer = True
                elif kind == "choice" or question["_choice_text"]:
                    question["_choice_text"].append(value)
                else:
                    question["prompt"].append(value)
    numbers = [item["number"] for item in paper["questions"]]
    if numbers != list(range(1, 51)):
        raise ValueError(f"{paper['id']}: expected questions 1–50, got {numbers}")
    for item in paper["questions"]:
        choice_text = " ".join(item.pop("_choice_text"))
        parts = re.split("([①②③④])", choice_text)
        if len(parts) == 9 and not parts[0].strip() and parts[1::2] == list(CHOICES):
            item["choices"] = [part.strip() for part in parts[2::2]]
        if len(item["choices"]) != 4 or item["answer"] not in range(4):
            raise ValueError(f"{paper['id']} #{item['number']}: invalid choices or answer")
    return paper


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("epub_dir", type=Path, help="directory containing *_TOPIK_II_Reading_Listening_Migaku.epub")
    parser.add_argument("--output", type=Path, default=Path("client/data/topik-reading.json"))
    args = parser.parse_args()
    sources = sorted(args.epub_dir.glob("*_TOPIK_II_Reading_Listening_Migaku.epub"))
    if not sources:
        parser.error("no TOPIK II Migaku EPUBs found")
    papers = [read_paper(source) for source in sources]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"durationSeconds": 4200, "papers": papers}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(papers)} papers, {sum(len(p['questions']) for p in papers)} questions to {args.output}")


if __name__ == "__main__":
    main()
