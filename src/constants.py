from pathlib import Path

# HTTP headers for polite scraping
HEADERS = {
    "User-Agent": "LevelHanjaBot/1.0 (+fair use; educational; contact user)"
}

# Data directories
DATA_DIR = Path("data")
LEVEL_DIR = DATA_DIR / "level"
VOCAB_DIR = DATA_DIR / "vocab"
VOCAB_DIR.mkdir(parents=True, exist_ok=True)

# Back-compat cache (kept; largely unused now)
CACHE_DIR = Path("cache"); CACHE_DIR.mkdir(exist_ok=True)
CACHE_CHARS = CACHE_DIR / "hanmun_level_chars.json"
CACHE_VOCAB = CACHE_DIR / "khanja_vocab.json"

# Known wiki pages for level character lists
HANMUN_LEVEL_URL = {
    8: "https://hanmun.fandom.com/ko/wiki/8급_배정한자_50자",
    7: "https://hanmun.fandom.com/ko/wiki/7급_배정한자_100자",
}

# Minimal built-in offline defaults to keep pipeline functional
DEFAULT_LEVEL_CHARS = {
    8: list("人日月山水火木金土中大小上下左右口目耳手足見言心力田石天白女子王車林川山")[:50],
    7: list("學校國家文武春夏秋冬東西南北男女父母兄弟姉妹先生友同新古多少")[:100],
}

# Limits and pacing
PER_CHAR_LIMIT_DEFAULT = 200
REQUEST_DELAY = 0.6

