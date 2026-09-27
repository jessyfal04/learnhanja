#!/usr/bin/env python3
import argparse
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/cheonjamun/wikisource.txt"
LEVELS = ROOT / "client/data/levels.json"
INSIGHTS = ROOT / "client/data/insights.json"
OUTPUT = ROOT / "client/data/cheonjamun.json"
VARIANT_PATTERN = re.compile(r"\{\{另\|([^|}]+)\|([^}]+)\}\}")
HAN_PATTERN = re.compile(r"[\u3400-\u9fff\U00020000-\U0002ffff]")
KOREAN_STUDY_FORMS = {
	"珎": "珍",
	"迩": "邇",
	"盖": "蓋",
	"毀": "毁",
	"絜": "潔",
	"竸": "競",
	"清": "淸",
	"慎": "愼",
	"随": "隨",
	"顛": "顚",
	"撡": "操",
	"啟": "啓",
	"綵": "彩",
	"既": "旣",
	"羣": "群",
	"稾": "稿",
	"隸": "隷",
	"恆": "恒",
	"晉": "晋",
	"青": "靑",
	"嶽": "岳",
	"雞": "鷄",
	"緜": "綿",
	"茲": "玆",
	"勑": "勅",
	"即": "卽",
	"䟽": "疏",
	"颻": "搖",
	"翫": "玩",
	"𡓜": "牆",
	"飡": "餐",
	"粮": "糧",
	"笋": "筍",
	"舉": "擧",
	"烝": "蒸",
	"牋": "箋",
	"並": "竝",
	"研": "妍",
}
READING_OVERRIDES = {"虢": "괵", "輶": "유", "嵇": "혜"}


def normalized_lookup(values):
	lookup = {}
	for value in values:
		lookup.setdefault(unicodedata.normalize("NFKC", value), value)
	return lookup


def parse_segment(segment):
	tokens = []
	position = 0
	for match in VARIANT_PATTERN.finditer(segment):
		append_plain(tokens, segment[position:match.start()])
		display = match.group(1)
		alternatives = [value for value in re.split(r"[、,]", match.group(2)) if value]
		if any(len(value) != len(display) for value in alternatives):
			raise ValueError(f"variant length mismatch: {match.group(0)}")
		for index, character in enumerate(display):
			tokens.append({"display": character, "variants": [value[index] for value in alternatives]})
		position = match.end()
	append_plain(tokens, segment[position:])
	return tokens


def append_plain(tokens, text):
	text = re.sub(r"-\{([^}]+)\}-", r"\1", text)
	for character in text:
		if HAN_PATTERN.fullmatch(character):
			tokens.append({"display": character, "variants": []})


def choose_match(token, catalog, insights):
	candidates = [KOREAN_STUDY_FORMS.get(token["display"], token["display"])]
	for lookup in (catalog, insights):
		for candidate in candidates:
			matched = lookup.get(unicodedata.normalize("NFKC", candidate))
			if matched:
				return matched
	return unicodedata.normalize("NFKC", candidates[0])


def build():
	levels = json.loads(LEVELS.read_text())
	insight_data = json.loads(INSIGHTS.read_text())
	catalog = normalized_lookup(character for group in levels["groups"] for character in group["characters"])
	insights = normalized_lookup(insight_data["characters"])
	sentences = []
	all_display = []
	for number, line in enumerate(SOURCE.read_text().splitlines(), 1):
		if not line.strip():
			continue
		parts = re.split(r"\s+", line.strip())
		if len(parts) != 2:
			raise ValueError(f"line {number} must contain two phrases")
		tokens = [parse_segment(part) for part in parts]
		if [len(phrase) for phrase in tokens] != [4, 4]:
			raise ValueError(f"line {number} must contain two four-character phrases")
		for phrase in tokens:
			for token in phrase:
				token["match"] = choose_match(token, catalog, insights)
				if token["display"] in READING_OVERRIDES:
					token["reading"] = READING_OVERRIDES[token["display"]]
				if not token["variants"]:
					token.pop("variants")
				all_display.append(token["display"])
		sentences.append({"number": len(sentences) + 1, "phrases": tokens})
	if len(sentences) != 125 or len(all_display) != 1000 or len(set(all_display)) != 1000:
		raise ValueError("source must contain 125 sentences and 1,000 unique display characters")
	return {
		"title": "千字文",
		"author": "周興嗣",
		"edition": "중국어 위키문헌 저본",
		"sourceUrl": "https://zh.wikisource.org/w/index.php?title=千字文&oldid=5752664",
		"license": "원전 퍼블릭 도메인 · 전사 CC BY-SA 4.0",
		"total": 1000,
		"sentences": sentences,
	}


def serialize(data):
	return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("--check", action="store_true")
	args = parser.parse_args()
	contents = serialize(build())
	if args.check:
		if not OUTPUT.exists() or OUTPUT.read_text() != contents:
			raise SystemExit("client/data/cheonjamun.json is out of date")
		return
	OUTPUT.write_text(contents)


if __name__ == "__main__":
	main()
