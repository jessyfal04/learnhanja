package idioms

import (
	_ "embed"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"hanjavocab/server/model"
)

const expectedCount = 214

const sourceURL = "https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800"

//go:embed idioms.txt
var catalogText string

type Catalog struct {
	data model.IdiomCatalog
}

func Load() (*Catalog, error) {
	entries := make([]model.Idiom, 0, expectedCount)
	seen := make(map[string]bool, expectedCount)
	for number, raw := range strings.Split(strings.TrimSpace(catalogText), "\n") {
		line := strings.TrimSpace(raw)
		open := strings.IndexRune(line, '(')
		if open < 1 || !strings.HasSuffix(line, ")") {
			return nil, fmt.Errorf("invalid idiom at line %d", number+1)
		}
		sourceForm, hanja := line[:open], line[open+1:len(line)-1]
		korean := strings.TrimSuffix(sourceForm, "02")
		if utf8.RuneCountInString(korean) != 4 || !allKorean(korean) || !validHanjaNotation(hanja) {
			return nil, fmt.Errorf("invalid idiom %q at line %d", line, number+1)
		}
		if seen[korean] {
			return nil, fmt.Errorf("duplicate idiom %q", korean)
		}
		seen[korean] = true
		entry := model.Idiom{Korean: korean, Hanja: hanja, Partial: strings.ContainsAny(hanja, "-/")}
		if sourceForm != korean {
			entry.SourceForm = sourceForm
		}
		entries = append(entries, entry)
	}
	if len(entries) != expectedCount {
		return nil, fmt.Errorf("NIKL catalog contains %d entries, want %d", len(entries), expectedCount)
	}
	return &Catalog{data: model.IdiomCatalog{
		Source:    "국립국어원 한국어교육 어휘 내용 개발 3단계, section 4.3",
		SourceURL: sourceURL,
		License:   "공공누리 제4유형: 출처표시, 비상업적 이용, 변경금지",
		Total:     len(entries),
		Entries:   entries,
	}}, nil
}

func (c *Catalog) Data() model.IdiomCatalog {
	return c.data
}

func allKorean(value string) bool {
	for _, r := range value {
		if !unicode.Is(unicode.Hangul, r) {
			return false
		}
	}
	return true
}

func validHanjaNotation(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r != '-' && r != '/' && !isHanja(r) {
			return false
		}
	}
	return true
}

func isHanja(r rune) bool {
	return r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff
}
