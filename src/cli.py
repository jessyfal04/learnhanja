from typing import Set, Tuple, Optional, Dict, List
from pathlib import Path
import argparse, re

from .constants import PER_CHAR_LIMIT_DEFAULT
from .levels import get_level_chars_from_files
from .text import is_hanja_char, to_unified
from .freq import load_freq_maps
from .providers import KhanjaScrapeProvider, KRDictProvider
from .pipeline import get_vocab_for_chars, filter_vocab_by_allowed
from .export import write_tsv, write_html

def parse_args():
    p = argparse.ArgumentParser(prog="hanjaVocab", description="Build Hanja vocab and HTML per spec.md")
    p.add_argument("--chars", type=str, default="sounds",
                   help="Either: integer level (e.g., 8), literal characters (e.g., 漢字學), a path to a text file (one char per line), or the alias 'sounds' for data/mylists/sounds.tsv.")
    p.add_argument("--levels", type=str,
                   help="Comma-separated levels (e.g. '7,8') to load from data/level/<lv>.tsv files.")
    p.add_argument("--add-chars", type=str, default="",
                   help="Additional literal characters to include in the allowed set (union).")
    p.add_argument("--must-contain", type=str, default="",
                   help="Optional: require that each vocab word contain at least one of these character(s).")
    p.add_argument("--per-char-limit", type=int, default=PER_CHAR_LIMIT_DEFAULT,
                   help="Max vocab items to collect per character (cache preferred).")
    p.add_argument("--outfile", type=Path, default=Path("out/hanja_vocab.html"),
                   help="Output file. Use .html for HTML (default) or .tsv for TSV.")
    p.add_argument("--no-cache", action="store_true", help="Disable cache read/write: always fetch and do not persist.")
    p.add_argument("--progress", action="store_true", help="Show colorful emoji progress bar during downloads.")
    p.add_argument("--verbose", "-v", action="store_true", help="Verbose logging.")
    p.add_argument("--version", action="store_true", help="Print version and exit.")
    # Source provider
    p.add_argument("--provider", choices=["krdict", "scrape"], default="krdict",
                   help="Vocabulary source: 'krdict' (default) or 'scrape' (koreanhanja.app)")
    p.add_argument("--krdict-tsv", type=Path, default=Path("kr-dict_hanja/krdict_hanja.tsv"),
                   help="Path to KRDict TSV (preferred input; no XML parsing).")
    return p.parse_args()

def resolve_allowed_chars(args) -> Tuple[Set[str], str, Optional[Dict[str, int]]]:
    parts_for_title: List[str] = []
    allowed: Set[str] = set()
    char_order: Optional[Dict[str, int]] = None

    if args.levels:
        try:
            levels = [int(x) for x in re.split(r"[,\s]+", args.levels.strip()) if x]
        except ValueError:
            raise SystemExit("--levels must be a comma-separated list of integers, e.g., --levels 7,8")
        allowed.update(get_level_chars_from_files(levels))
        parts_for_title.append(f"Levels {','.join(map(str, levels))}")

    if args.chars is not None:
        s = args.chars.strip()
        used_case = None
        try:
            lv = int(s)
            allowed.update(get_level_chars_from_files([lv]))
            parts_for_title.append(f"Level {lv}")
            used_case = "level"
        except ValueError:
            # support alias 'sounds' -> data/mylists/sounds.tsv
            if s.lower() == 'sounds':
                path = Path('data/mylists/sounds.tsv')
            else:
                path = Path(s)
            if path.exists() and path.is_file():
                text = path.read_text(encoding="utf-8")
                ordered_chars: List[str] = []
                for ch in text:
                    if is_hanja_char(ch):
                        uch = to_unified(ch)
                        ordered_chars.append(uch)
                        allowed.add(uch)
                char_order = {ch: idx for idx, ch in enumerate(ordered_chars)}
                parts_for_title.append(f"Chars file {path}")
                used_case = "file"
            else:
                for ch in s:
                    if is_hanja_char(ch):
                        allowed.add(to_unified(ch))
                parts_for_title.append("Literal chars")
                used_case = "literal"
        if args.verbose:
            print(f"[debug] --chars resolved via {used_case}")

    if args.add_chars:
        added = {to_unified(ch) for ch in args.add_chars if is_hanja_char(ch)}
        allowed.update(added)
        if added:
            parts_for_title.append(f"+{len(added)} extra chars")

    if not allowed:
        raise SystemExit("Provide at least one of --levels, --chars, or --add-chars to define the allowed set.")

    title = ", ".join(parts_for_title) if parts_for_title else "Custom"
    return allowed, title, char_order

def main():
    args = parse_args()
    if args.version:
        print("hanjaVocab 0.3.0")
        return

    allowed_chars, title, char_order = resolve_allowed_chars(args)
    print(f"[info] Allowed set size: {len(allowed_chars)} ({title})")
    if args.verbose:
        sample = ''.join(list(sorted(allowed_chars))[:30])
        if sample:
            print(f"[debug] Allowed sample: {sample}{'…' if len(allowed_chars) > 30 else ''}")

    use_progress = args.progress or args.verbose
    # Choose provider
    if args.provider == 'krdict':
        provider = KRDictProvider(tsv_path=args.krdict_tsv)
    else:
        provider = KhanjaScrapeProvider()

    vocab_map = get_vocab_for_chars(
        allowed_chars,
        args.per_char_limit,
        verbose=args.verbose,
        use_cache=(not args.no_cache),
        write_cache=(not args.no_cache),
        progress=use_progress,
        provider=provider,
    )

    freq_pkm, freq_nikl = load_freq_maps()

    must_any = {c for c in args.must_contain if is_hanja_char(c)} if args.must_contain else set()
    if args.must_contain and not must_any and args.verbose:
        print("[warn] --must-contain provided but no valid hanja characters found in it.")

    filtered = filter_vocab_by_allowed(
        vocab_map,
        allowed_chars,
        must_have_any=must_any,
        char_order=char_order,
        freq_pkm=freq_pkm,
        freq_nikl=freq_nikl,
    )
    filtered.sort(key=lambda r: (-(r[4] if r[4] is not None else -1), r[0]))

    if args.outfile.suffix.lower() == ".tsv":
        write_tsv(filtered, args.outfile)
        print(f"[done] Wrote TSV {args.outfile}")
    else:
        display_title = f"Hanja Vocab ~ {len(allowed_chars)} chars ~ {len(filtered)} entries"
        write_html(filtered, args.outfile, title=display_title, subtitle=title)
        print(f"[done] Wrote HTML {args.outfile}")
