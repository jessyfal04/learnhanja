# Idiom sources

The two source lists are preserved independently:

- `exam_idioms.tsv`: 247 entries from *꼭 시험에 나오는 고사성어*, including the original book page number
- `idioms.txt`: 214 entries from section 4.3 of the National Institute of Korean Language report *한국어 교육 어휘 내용 개발(3단계)*

The browser uses `client/data/idioms.json`, where shared entries appear once and retain both source identifiers. The merged catalog contains 383 unique entries. The exam source is the default filter and page sorting uses the book page from `exam_idioms.tsv`.

NIKL source page: https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800

License for the NIKL report: 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지)
