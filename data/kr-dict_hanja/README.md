# KRDict Hanja TSV Export

Convert KRDict (국립국어원 한국어기초사전) dumps to a Hanja-focused TSV.

Source: [official KRDict full-dictionary download](https://krdict.korean.go.kr/download/downloadPopup). The current input is the complete XML ZIP dated 2025-12-19; no website scraping or runtime API call is used.

## Requirements
- Python 3.10+
- KRDict dump as a ZIP (preferred), or XML files.

## Generate TSV
From repo root:

```bash
python data/kr-dict_hanja/krdict_hanja_to_tsv.py \
  --input ./data/kr-dict_hanja/kr-dict-20251219.zip \
  --out ./data/kr-dict_hanja/krdict_hanja.tsv
```

When a new KRDict ZIP arrives (e.g., `kr-dict-YYYYMMDD.zip`), update the filename in `--input` and rerun the command.

## Notes
- `scripts/build_vocabulary.py` combines this TSV with the frequency ranks and generates the compact browser catalog at `client/data/vocabulary.json`.
- The running app consumes only the generated JSON; no TSV or XML parsing happens at runtime.
- Only entries with a detected Hanja value are written.
