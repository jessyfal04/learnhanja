# KRDict Hanja TSV Export

Convert KRDict (국립국어원 한국어기초사전) dumps to a Hanja-focused TSV.

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
- The main app consumes only this TSV; no XML parsing occurs elsewhere.
- Only entries with a detected Hanja value are written.
