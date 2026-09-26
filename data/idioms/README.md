# Idiom sources

The four source lists are preserved independently:

- `exam_idioms.tsv`: 247 entries from [*꼭 시험에 나오는 고사성어*](https://product.kyobobook.co.kr/detail/S000215142650)
- `idioms.txt`: 214 entries from section 4.3 of the National Institute of Korean Language report [*한국어 교육 어휘 내용 개발(3단계)*](https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800)
- `master_6.tsv`: 75 supplied 어문회 6급 entries from Darakwon's [*한자능력검정시험 마스터 6급·6급Ⅱ*](https://product.kyobobook.co.kr/detail/S000000525684), with Hanja and Korean readings
- `onebook_6.tsv`: 76 supplied 어문회 6급 entries from Sidae Education's [*어문회 한자능력검정시험 6급 한 권으로 끝내기*](https://product.kyobobook.co.kr/detail/S000216865870), with Hanja and Korean readings

The browser uses `client/data/idioms.json`, where shared entries appear once and retain all source identifiers. The merged catalog contains 447 unique entries. Run `python3 scripts/merge_idiom_sources.py` to merge both preserved 어문회 TSVs again. The importer converts non-catalog character variants to the Korean catalog forms without modifying the original TSVs.

NIKL source page: https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800

License for the NIKL report: 공공누리 제4유형 (출처표시, 비상업적 이용, 변경금지)
