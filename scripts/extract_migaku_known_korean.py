#!/usr/bin/env python3
"""
Extract Korean known words from Migaku's Chrome extension database.

The Migaku extension stores its user DB as a gzip-compressed SQLite database
inside Chrome IndexedDB blob storage. This script discovers the newest blob,
unwraps the gzip payload, queries WordList, and prints/exports the result.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import tempfile
import unicodedata
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


EXTENSION_ID = "dmeppfcidcpcocleneopiblmpnbokhep"
GZIP_MAGIC = b"\x1f\x8b\x08"


def candidate_blobs(profile_dir: Path) -> list[Path]:
    blob_root = (
        profile_dir
        / "IndexedDB"
        / f"chrome-extension_{EXTENSION_ID}_0.indexeddb.blob"
    )
    if not blob_root.exists():
        return []
    return sorted(
        (p for p in blob_root.rglob("*") if p.is_file()),
        key=lambda p: (p.stat().st_mtime, p.stat().st_size),
        reverse=True,
    )


def decompress_sqlite_from_blob(blob_path: Path) -> bytes:
    data = blob_path.read_bytes()
    for match in re.finditer(re.escape(GZIP_MAGIC), data):
        offset = match.start()
        try:
            decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
            sqlite_bytes = decompressor.decompress(data[offset:]) + decompressor.flush()
        except zlib.error:
            continue
        if sqlite_bytes.startswith(b"SQLite format 3"):
            return sqlite_bytes
    raise RuntimeError(f"No gzip-compressed SQLite payload found in {blob_path}")


def connect_extracted_db(profile_dir: Path) -> tuple[sqlite3.Connection, Path, tempfile.TemporaryDirectory[str]]:
    errors: list[str] = []
    for blob_path in candidate_blobs(profile_dir):
        try:
            sqlite_bytes = decompress_sqlite_from_blob(blob_path)
        except Exception as exc:
            errors.append(f"{blob_path}: {exc}")
            continue
        tmpdir = tempfile.TemporaryDirectory(prefix="migaku-core-")
        db_path = Path(tmpdir.name) / "core.db"
        db_path.write_bytes(sqlite_bytes)
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            conn.execute("select 1 from WordList limit 1").fetchone()
        except sqlite3.Error as exc:
            conn.close()
            tmpdir.cleanup()
            errors.append(f"{blob_path}: {exc}")
            continue
        return conn, blob_path, tmpdir
    details = "\n".join(errors) if errors else "no candidate blob files found"
    raise RuntimeError(f"Could not open Migaku WordList database:\n{details}")


def query_words(
    conn: sqlite3.Connection,
    language: str,
    status: str,
    distinct: bool,
    include_tracked_unknown: bool,
) -> list[dict[str, object]]:
    if include_tracked_unknown:
        where = "language = ? and del = 0 and (knownStatus = ? or tracked = 1)"
    else:
        where = "language = ? and del = 0 and knownStatus = ?"

    sql = f"""
        select
            dictForm as word,
            secondary,
            partOfSpeech,
            tracked,
            knownStatus,
            isModern,
            created,
            mod
        from WordList
        where {where}
        order by dictForm collate nocase, secondary, partOfSpeech
    """

    conn.row_factory = sqlite3.Row
    rows = [dict(row) for row in conn.execute(sql, (language, status))]
    for row in rows:
        row["word"] = unicodedata.normalize("NFC", str(row["word"]))
        row["secondary"] = unicodedata.normalize("NFC", str(row["secondary"]))
    if not distinct:
        return rows

    grouped: dict[str, dict[str, object]] = {}
    for row in rows:
        word = str(row["word"])
        if word not in grouped:
            grouped[word] = {
                "word": word,
                "secondary": row["secondary"],
                "partOfSpeech": row["partOfSpeech"],
                "tracked": row["tracked"],
                "rowCount": 0,
            }
        grouped[word]["tracked"] = max(int(grouped[word]["tracked"]), int(row["tracked"]))
        grouped[word]["rowCount"] = int(grouped[word]["rowCount"]) + 1
    return sorted(grouped.values(), key=lambda row: str(row["word"]).casefold())


def migaku_word_lists(conn: sqlite3.Connection, language: str) -> dict[str, list[str]]:
    statuses: dict[str, set[str]] = {}
    tracked: set[str] = set()
    for word, status, is_tracked in conn.execute(
        "select dictForm, knownStatus, tracked from WordList where language = ? and del = 0",
        (language,),
    ):
        word = unicodedata.normalize("NFC", str(word))
        statuses.setdefault(word, set()).add(status)
        if is_tracked:
            tracked.add(word)

    return {
        "known": sorted((word for word, values in statuses.items() if "KNOWN" in values), key=str.casefold),
        "learning": sorted((word for word, values in statuses.items() if "LEARNING" in values), key=str.casefold),
        "tracked": sorted(tracked, key=str.casefold),
        "ignored": sorted((
            word for word, values in statuses.items()
            if "IGNORED" in values and "KNOWN" not in values
        ), key=str.casefold),
    }


def write_csv(rows: list[dict[str, object]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        output.write_text("", encoding="utf-8")
        return
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def default_profile() -> Path:
    return Path.home() / ".config" / "google-chrome" / "Default"


def known_word_data(profile: Path, database: Path | None = None) -> tuple[list[str], list[str], str]:
    if database:
        conn = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
        blob = str(database)
        tmpdir = None
    else:
        conn, source, tmpdir = connect_extracted_db(profile)
        blob = str(source)
    try:
        rows = query_words(conn, "ko", "KNOWN", True, False)
        known = [str(row["word"]) for row in rows if str(row["word"]).strip()]
        marked = sorted({
            unicodedata.normalize("NFC", str(row[0])).strip()
            for row in conn.execute("select dictForm from WordList where language = 'ko' and del = 0 and tracked = 1")
            if str(row[0]).strip()
        }, key=str.casefold)
        return known, marked, blob
    finally:
        conn.close()
        if tmpdir:
            tmpdir.cleanup()


def serve_words(profile: Path, database: Path | None, host: str, port: int, allowed_origins: list[str]) -> None:
    class Handler(BaseHTTPRequestHandler):
        def allowed_origin(self) -> str | None:
            origin = self.headers.get("Origin")
            if not origin:
                return None
            if origin in allowed_origins or re.fullmatch(r"http://(?:127\.0\.0\.1|localhost|\[::\]|\[::1\]):\d+", origin):
                return origin
            return ""

        def cors_headers(self) -> None:
            origin = self.allowed_origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self) -> None:
            if self.allowed_origin() == "":
                self.send_error(403)
                return
            self.send_response(204)
            self.cors_headers()
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_POST(self) -> None:
            if self.path != "/":
                self.send_error(404)
                return
            if self.allowed_origin() == "":
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length > 4096:
                    self.send_error(413)
                    return
                request = json.loads(self.rfile.read(length))
                if request.get("action") != "getKnownWords":
                    payload = {"result": None, "error": "Unknown action"}
                else:
                    words, marked_words, source = known_word_data(profile, database)
                    payload = {"result": {"words": words, "markedWords": marked_words, "source": source}, "error": None}
            except Exception as exc:
                payload = {"result": None, "error": str(exc)}
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.cors_headers()
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Migaku known words on http://{host}:{port}", file=sys.stderr)
    server.serve_forever()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract Migaku Korean known words from Chrome IndexedDB."
    )
    parser.add_argument("--profile", type=Path, default=default_profile())
    parser.add_argument("--database", type=Path, help="Read an existing extracted core.db")
    parser.add_argument("--serve", action="store_true", help="Serve known words to LearnHanja")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766, help="AnkiConnect port + 1")
    parser.add_argument("--allow-origin", action="append", default=["https://local.jessyfal04.dev"], help="Additional browser origin")
    parser.add_argument("--txt-output", type=Path, help="Write one known word per line")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--status", default="KNOWN")
    parser.add_argument("--all-rows", action="store_true", help="Keep duplicate WordList rows")
    parser.add_argument(
        "--tracked-unknown",
        action="store_true",
        help="Also include tracked UNKNOWN rows, useful for matching the tracked bucket",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--format",
        choices=["text", "json", "jsonl"],
        default="text",
        help="stdout format. json includes counts and categorized word lists.",
    )
    parser.add_argument("--stats", action="store_true", help="Print counts and categorized word lists as JSON")
    args = parser.parse_args()

    if args.serve:
        serve_words(args.profile, args.database, args.host, args.port, args.allow_origin)
        return 0

    if args.database:
        conn = sqlite3.connect(f"file:{args.database}?mode=ro", uri=True)
        blob_path = args.database
        tmpdir = None
    else:
        conn, blob_path, tmpdir = connect_extracted_db(args.profile)
    try:
        rows = query_words(
            conn=conn,
            language=args.language,
            status=args.status,
            distinct=not args.all_rows,
            include_tracked_unknown=args.tracked_unknown,
        )
        if args.output:
            write_csv(rows, args.output)
        if args.txt_output:
            args.txt_output.parent.mkdir(parents=True, exist_ok=True)
            words = dict.fromkeys(str(row["word"]) for row in rows if str(row["word"]).strip())
            args.txt_output.write_text("\n".join(words) + "\n", encoding="utf-8")

        word_lists = migaku_word_lists(conn, args.language)
        counts = {name: len(words) for name, words in word_lists.items()}
        summary = {
            "profile": str(args.profile),
            "blob": str(blob_path),
            "language": args.language,
            "status": args.status,
            "distinct": not args.all_rows,
            "count": len(rows),
            "migakuCounts": counts,
            "csv": str(args.output) if args.output else None,
        }

        print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)
        if args.stats or args.format == "json":
            print(json.dumps(
                {"counts": counts, "words": word_lists},
                ensure_ascii=False,
                indent=2,
            ))
        elif args.format == "jsonl":
            for row in rows:
                print(json.dumps(row, ensure_ascii=False))
        else:
            for row in rows:
                print(row["word"])
    finally:
        conn.close()
        if tmpdir:
            tmpdir.cleanup()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        try:
            sys.stdout.close()
        finally:
            raise SystemExit(0)
