# Idiom sources

The three source lists are preserved independently:

- `exam_idioms.tsv`: 247 entries from *꼭 시험에 나오는 고사성어*, including the original book page number
- `idioms.txt`: 214 entries from section 4.3 of the National Institute of Korean Language report *한국어 교육 어휘 내용 개발(3단계)*
- `eomunhoe_level6_sajaseongeo.tsv`: 75 supplied 어문회 6급 entries, with Korean readings and meanings

The browser uses `client/data/idioms.json`, where shared entries appear once and retain all source identifiers. The merged catalog contains 430 unique entries. The exam source is the default filter and page sorting uses the book page from `exam_idioms.tsv`. Run `python3 scripts/merge_eomunhoe_level6_idioms.py` to merge the preserved 어문회 TSV again.

NIKL source page: https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800

License for the NIKL report: 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지)
