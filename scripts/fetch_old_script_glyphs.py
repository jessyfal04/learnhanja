#!/usr/bin/env python3
"""Inventory Commons old-script SVGs for all official 6급 exam characters"""

import argparse
import base64
import hashlib
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
EXAM_DATA = ROOT / "client/data/mock-exam.json"
ALIASES_DATA = ROOT / "client/data/mock-exam-old-script-files.json"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "LearnHanjaOldScriptProbe/1.0 (https://github.com/jessyfal04/learnhanja)"
FORMS = ("seal", "bronze", "oracle", "ancient", "bigseal")


def fetch(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as response:
                return response.read()
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            retry_after = error.headers.get("Retry-After")
            time.sleep(int(retry_after) if retry_after and retry_after.isdigit() else 30 * (attempt + 1) if error.code == 429 else 2 ** attempt)
            continue
        except URLError:
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def query_files(characters, aliases):
    titles = []
    for character in characters:
        for form in FORMS:
            titles.append((character, form, f"File:{character}-{form}.svg"))
            titles.extend((character, form, f"File:{filename}") for filename in aliases.get(character, {}).get("forms", {}).get(form, []))
    matches = {character: {} for character in characters}
    for offset in range(0, len(titles), 50):
        batch = titles[offset:offset + 50]
        expected = {title: (character, form) for character, form, title in batch}
        url = API + "?" + urlencode({
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url|mime|size|sha1",
            "titles": "|".join(expected),
        })
        response = json.loads(fetch(url))
        if response.get("error") or "query" not in response:
            raise ValueError(f"Commons API failed for batch {offset // 50 + 1}: {response.get('error', response)}")
        for page in response["query"]["pages"]:
            title = page["title"]
            if title not in expected:
                raise ValueError(f"unexpected Commons title: {title}")
            character, form = expected[title]
            info = page.get("imageinfo", [])
            if info and info[0].get("mime") == "image/svg+xml":
                matches[character].setdefault(form, []).append({
                    "url": info[0]["url"],
                    "page": info[0]["descriptionurl"],
                    "bytes": info[0]["size"],
                    "sha1": info[0]["sha1"],
                    "resolvedFilename": unquote(Path(urlparse(info[0]["url"]).path).name),
                    "requestedFilename": title.removeprefix("File:"),
                })
    return matches


def cache_file(cache_dir, character, form, url):
    digest = hashlib.sha256(url.encode()).hexdigest()[:16]
    return cache_dir / f"U+{ord(character):04X}-{form}-{digest}.json"


def save_cache_index(cache_dir, output):
    entries = {}
    for path in sorted(cache_dir.glob("U+*.json")):
        item = json.loads(path.read_text(encoding="utf-8"))
        entries.setdefault(item["character"], {}).setdefault(item["form"], []).append({
            "image": item["image"],
            "page": item["page"],
            "filename": item.get("filename"),
        })
    (output / "base64-cache.json").write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return sum(len(images) for forms in entries.values() for images in forms.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "out/old-script-6")
    parser.add_argument("--reuse", action="store_true", help="Use an existing manifest instead of querying Commons again")
    parser.add_argument("--download", action="store_true", help="Populate the temporary base64 cache from matched SVGs")
    parser.add_argument("--character", help="Download forms for one 6급 character")
    parser.add_argument("--max-downloads", type=int, help="Stop after this many new SVG downloads; useful for a small trial")
    parser.add_argument("--delay", type=float, default=5.0, help="Seconds between SVG downloads (default: 5)")
    args = parser.parse_args()
    if args.delay < 0 or args.max_downloads is not None and args.max_downloads < 1:
        parser.error("--delay must be nonnegative and --max-downloads must be positive")
    exam = json.loads(EXAM_DATA.read_text(encoding="utf-8"))["6"]
    aliases = json.loads(ALIASES_DATA.read_text(encoding="utf-8"))
    characters = [entry["hanja"] for entry in exam["characters"]]
    if len(characters) != 450 or len(set(characters)) != 450:
        raise ValueError("expected 450 distinct official 6급 exam characters")
    if args.character and args.character not in characters:
        parser.error("--character must be an official 6급 character")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output / "manifest.json"
    if args.reuse:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schemaVersion") != 2 or manifest.get("forms") != list(FORMS) or manifest.get("total") != len(characters):
            raise ValueError("existing manifest does not match the 6급 five-form inventory")
        matches = manifest["characters"]
    else:
        matches = query_files(characters, aliases)
    cache_dir = args.output / "cache"
    cache_dir.mkdir(exist_ok=True)
    counts = {form: sum(bool(matches[character].get(form)) for character in characters) for form in FORMS}
    distribution = {str(count): sum(len(matches[character]) == count for character in characters) for count in range(len(FORMS) + 1)}
    manifest = {
        "schemaVersion": 2,
        "source": API,
        "aliasSource": str(ALIASES_DATA.relative_to(ROOT)),
        "grade": "6급",
        "total": len(characters),
        "forms": list(FORMS),
        "formCounts": counts,
        "formsPerCharacter": distribution,
        "allForms": [character for character in characters if len(matches[character]) == len(FORMS)],
        "noForms": [character for character in characters if not matches[character]],
        "characters": matches,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    new_downloads = 0
    try:
        if args.download:
            for character in characters:
                if args.character and character != args.character:
                    continue
                for form in FORMS:
                    for info in matches[character].get(form, []):
                        path = cache_file(cache_dir, character, form, info["url"])
                        if path.exists():
                            continue
                        if args.max_downloads is not None and new_downloads >= args.max_downloads:
                            break
                        if new_downloads:
                            time.sleep(args.delay)
                        image = fetch(info["url"])
                        if len(image) > 1 << 20 or b"<svg" not in image[:1000]:
                            raise ValueError(f"Commons did not return a valid SVG for {character} {form}")
                        entry = {
                            "character": character,
                            "form": form,
                            "filename": info["requestedFilename"],
                            "image": "data:image/svg+xml;base64," + base64.b64encode(image).decode("ascii"),
                            "page": info["page"],
                        }
                        path.write_text(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
                        new_downloads += 1
                if args.max_downloads is not None and new_downloads >= args.max_downloads:
                    break
    finally:
        cached = save_cache_index(cache_dir, args.output)
    print(f"Matched SVG files: {sum(len(images) for forms in matches.values() for images in forms.values())}")
    print("Forms: " + ", ".join(f"{form}={counts[form]}" for form in FORMS))
    print("Forms per character: " + ", ".join(f"{count}={distribution[str(count)]}" for count in range(len(FORMS) + 1)))
    print(f"All forms: {len(manifest['allForms'])}; any form: {len(characters) - len(manifest['noForms'])}; none: {len(manifest['noForms'])}")
    print(f"Base64 cached images: {cached}; new downloads: {new_downloads}")
    print(f"Manifest: {args.output / 'manifest.json'}")
    print(f"Base64 cache: {args.output / 'base64-cache.json'}")


if __name__ == "__main__":
    main()
