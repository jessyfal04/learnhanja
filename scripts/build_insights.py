"""Build Korean Hanja reference data from local HanjaLevels and Unicode Unihan"""
import argparse
import csv
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--cjk-data', type=Path, required=True)
parser.add_argument('--unihan', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
levels = json.loads((root / 'client/data/levels.json').read_text())
characters = {c for g in levels['groups'] for c in g['characters']}
with zipfile.ZipFile(args.unihan) as archive:
    readings = archive.read('Unihan_Readings.txt').decode().splitlines()
    irg = archive.read('Unihan_IRGSources.txt').decode().splitlines()
for line in readings:
    if '\tkHangul\t' in line:
        characters.add(chr(int(line.split('\t')[0][2:], 16)))
records = {c: {} for c in sorted(characters)}
for line in readings + irg:
    if not line or line.startswith('#'):
        continue
    code, key, value = line.split('\t')
    char = chr(int(code[2:], 16))
    if char not in records:
        continue
    if key == 'kHangul':
        records[char]['hangul'] = list(dict.fromkeys(v.split(':')[0] for v in value.split()))
    if key == 'kDefinition':
        records[char]['definition'] = value
    if key == 'kTotalStrokes':
        records[char]['unicodeStrokes'] = value
with (args.cjk_data / 'in/HanjaLevels.tsv').open() as source:
    for row in csv.reader(source, delimiter='\t'):
        if row[0] in records:
            records[row[0]].update(sound=row[2], hun=row[3], radical=row[6], strokes=int(row[8]))
records['旣']['variants'] = ['既']
records.setdefault('既', {})['variants'] = ['旣']
result = {'sources': {'local': 'Local HanjaLevels export; snapshot 2026-09-19', 'unihan': 'Unicode Unihan 17.0.0 Korean readings and stroke counts', 'unihanURL': 'https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip', 'variantURL': 'https://dict.variants.moe.edu.tw/dictView.jsp?ID=19555&la=0'}, 'characters': records}
(root / 'client/data/insights.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Wrote {len(records)} Korean Hanja records')
