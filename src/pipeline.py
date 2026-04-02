from typing import Dict, List, Set, Tuple, Optional
import sys, time

from .providers import VocabProvider, KhanjaScrapeProvider
from .cache import read_cached_vocab, write_cached_vocab
from .constants import REQUEST_DELAY
from .freq import load_freq_maps

def get_vocab_for_chars(
    chars: Set[str],
    per_char_limit: int,
    verbose: bool = False,
    use_cache: bool = True,
    write_cache: bool = True,
    progress: bool = False,
    provider: Optional[VocabProvider] = None,
) -> Dict[str, List[Tuple[str, str, str]]]:
    out: Dict[str, List[Tuple[str, str, str]]] = {}
    total = len(chars)

    RESET = "\x1b[0m"; GREEN = "\x1b[32m"; YELLOW = "\x1b[33m"; RED = "\x1b[31m"; DIM = "\x1b[2m"

    def show_bar(i: int, emoji: str, color: str, msg: str):
        if not progress:
            return
        width = 24
        filled = int(width * i / total) if total else width
        bar = "█" * filled + "░" * (width - filled)
        pct = int(100 * i / total) if total else 100
        sys.stdout.write("\r" + f"{color}{emoji}{RESET} [{bar}] {pct:3d}% {msg}{DIM}" + RESET + " " * 8)
        sys.stdout.flush()

    if provider is None:
        provider = KhanjaScrapeProvider()

    for idx, ch in enumerate(sorted(chars), start=1):
        ucode = f"U+{ord(ch):04X}"

        cached: List[Tuple[str, str, str]] = []
        if use_cache:
            cached = read_cached_vocab(ch)
        if cached:
            used = cached[:per_char_limit]
            out[ch] = used
            if progress:
                show_bar(idx, "📦", GREEN, f"{idx}/{total} {ch} {ucode} cache hit n={len(cached)} → using={len(used)}")
            elif verbose:
                print(f"[debug] {idx}/{total} {ch} {ucode}: cache hit n={len(cached)} -> using={len(used)}")
            continue

        if progress:
            show_bar(idx - 1, "🌐", YELLOW, f"{idx}/{total} {ch} {ucode} fetching…")
        elif verbose:
            if not use_cache:
                print(f"[debug] {idx}/{total} {ch} {ucode}: cache disabled -> fetch")
            else:
                print(f"[debug] {idx}/{total} {ch} {ucode}: cache miss -> fetch")
        try:
            vocab = provider.get_for_char(ch, per_char_limit, verbose=(verbose and not progress))
            out[ch] = vocab
            if write_cache:
                write_cached_vocab(ch, vocab)
            if progress:
                show_bar(idx, "✅", GREEN, f"{idx}/{total} {ch} {ucode} fetched n={len(vocab)}{' +cached' if write_cache else ''}")
            elif verbose:
                print(f"[debug] {idx}/{total} {ch} {ucode}: fetched n={len(vocab)}")
            time.sleep(REQUEST_DELAY)
        except Exception as e:
            if progress:
                show_bar(idx, "❌", RED, f"{idx}/{total} {ch} {ucode} failed: {str(e).split(':')[0]}")
            elif verbose:
                print(f"[warn] {idx}/{total} {ch} {ucode}: fetch failed: {e}")
            out[ch] = []

    if progress:
        sys.stdout.write("\n")
        sys.stdout.flush()
    return out

from .text import to_unified

def filter_vocab_by_allowed(
    vocab_map: Dict[str, List[Tuple[str, str, str]]],
    allowed: Set[str],
    must_have_any: Set[str] | None = None,
    char_order: Optional[Dict[str, int]] = None,
    freq_pkm: Optional[Dict[str, int]] = None,
    freq_nikl: Optional[Dict[str, int]] = None,
) -> List[Tuple[str, str, str, str, int, int, int]]:
    rows: List[Tuple[str, str, str, str, int, int, int]] = []
    allowed_unified = {to_unified(c) for c in allowed}
    require_any = {to_unified(c) for c in (must_have_any or set())}
    freq_pkm = freq_pkm or {}
    freq_nikl = freq_nikl or {}

    for src_char, items in vocab_map.items():
        for hanja_word, hangul, gloss in items:
            hw = to_unified(hanja_word)
            # remove empty entries: must have hanja, and at least one of hangul/gloss
            if not hw.strip():
                continue
            if not ((hangul or '').strip() or (gloss or '').strip()):
                continue
            if not all((c in allowed_unified) for c in hw):
                continue
            if require_any and not any((c in require_any) for c in hw):
                continue
            idx = char_order.get(src_char, -1) if char_order else -1
            pkm_rank = freq_pkm.get(hangul, 0)
            nikl_rank = freq_nikl.get(hangul, 0)
            rows.append((hw, hangul, gloss, src_char, idx, pkm_rank, nikl_rank))

    best: Dict[Tuple[str, str], Tuple[str, str, str, str, int, int, int]] = {}
    for r in rows:
        key = (r[0], r[1])
        prev = best.get(key)
        if prev is None or r[4] > prev[4]:
            best[key] = r
    return list(best.values())
