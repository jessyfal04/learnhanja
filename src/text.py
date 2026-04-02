import re, unicodedata

# CJK ranges: Unified + Compatibility
CJK_RE = re.compile(r"^[\u3400-\u9FFF\uF900-\uFAFF]+$")

def is_hanja_char(c: str) -> bool:
    cp = ord(c)
    return (0x3400 <= cp <= 0x9FFF) or (0xF900 <= cp <= 0xFAFF)

def only_hanja(s: str) -> bool:
    s = unicodedata.normalize("NFKC", s)
    return bool(CJK_RE.match(s))

# Normalize common compatibility forms
COMPAT_MAP = str.maketrans({
    "金": "金", "李": "李", "樂": "樂", "年": "年", "六": "六", "來": "來",
    "車": "車", "茶": "茶", "蘭": "蘭", "林": "林",
})

def to_unified(s: str) -> str:
    return unicodedata.normalize("NFKC", s).translate(COMPAT_MAP)

