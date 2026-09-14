package idioms

import (
	_ "embed"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"hanjavocab/server/model"
)

const (
	niklSourceID      = "nikl"
	examSourceID      = "exam"
	niklExpectedCount = 214
	examExpectedCount = 247
)

const sourceURL = "https://www.korean.go.kr/front/reportData/reportDataView.do?report_seq=800"

//go:embed idioms.txt
var niklCatalogText string

//go:embed exam_idioms.tsv
var examCatalogText string

type Catalog struct {
	data model.IdiomCatalog
}

func Load() (*Catalog, error) {
	examEntries, err := loadExamCatalog()
	if err != nil {
		return nil, err
	}
	niklEntries, err := loadNIKLCatalog()
	if err != nil {
		return nil, err
	}

	entries := make([]model.Idiom, 0, len(examEntries)+len(niklEntries))
	byKorean := make(map[string]int, len(examEntries)+len(niklEntries))
	for _, entry := range append(examEntries, niklEntries...) {
		if index, ok := byKorean[entry.Korean]; ok {
			existing := &entries[index]
			existing.Sources = append(existing.Sources, entry.Sources...)
			for source, order := range entry.SourceOrders {
				existing.SourceOrders[source] = order
			}
			continue
		}
		byKorean[entry.Korean] = len(entries)
		entries = append(entries, entry)
	}

	return &Catalog{data: model.IdiomCatalog{
		Sources: []model.IdiomSource{
			{
				ID:        examSourceID,
				Name:      "꼭 시험에 나오는 고사성어 목록",
				ShortName: "시험 목록",
				Total:     len(examEntries),
			},
			{
				ID:        niklSourceID,
				Name:      "국립국어원 한국어 교육 어휘 내용 개발 3단계, section 4.3",
				ShortName: "국립국어원",
				SourceURL: sourceURL,
				License:   "공공누리 제4유형: 출처표시, 비상업적 이용, 변경금지",
				Total:     len(niklEntries),
			},
		},
		Total:   len(entries),
		Entries: entries,
	}}, nil
}

func loadNIKLCatalog() ([]model.Idiom, error) {
	entries := make([]model.Idiom, 0, niklExpectedCount)
	seen := make(map[string]bool, niklExpectedCount)
	for number, raw := range strings.Split(strings.TrimSpace(niklCatalogText), "\n") {
		line := strings.TrimSpace(raw)
		open := strings.IndexRune(line, '(')
		if open < 1 || !strings.HasSuffix(line, ")") {
			return nil, fmt.Errorf("invalid idiom at line %d", number+1)
		}
		sourceForm, hanja := line[:open], line[open+1:len(line)-1]
		korean := strings.TrimSuffix(sourceForm, "02")
		if len([]rune(korean)) != 4 || !allKorean(korean) || !validHanjaNotation(hanja, false) {
			return nil, fmt.Errorf("invalid idiom %q at line %d", line, number+1)
		}
		if seen[korean] {
			return nil, fmt.Errorf("duplicate idiom %q", korean)
		}
		seen[korean] = true
		entry := model.Idiom{
			Korean:       korean,
			Hanja:        hanja,
			Partial:      strings.ContainsAny(hanja, "-/"),
			Sources:      []string{niklSourceID},
			SourceOrders: map[string]int{niklSourceID: number + 1},
		}
		if sourceForm != korean {
			entry.SourceForm = sourceForm
		}
		entries = append(entries, entry)
	}
	if len(entries) != niklExpectedCount {
		return nil, fmt.Errorf("NIKL catalog contains %d entries, want %d", len(entries), niklExpectedCount)
	}
	return entries, nil
}

func loadExamCatalog() ([]model.Idiom, error) {
	lines := strings.Split(strings.TrimSpace(examCatalogText), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "hanja\thangeul\tpage" {
		return nil, fmt.Errorf("invalid exam idiom TSV header")
	}
	entries := make([]model.Idiom, 0, examExpectedCount)
	seen := make(map[string]bool, examExpectedCount)
	for number, raw := range lines[1:] {
		fields := strings.Split(raw, "\t")
		if len(fields) != 3 {
			return nil, fmt.Errorf("invalid exam idiom at line %d", number+2)
		}
		hanja, korean := strings.TrimSpace(fields[0]), strings.TrimSpace(fields[1])
		page, err := strconv.Atoi(strings.TrimSpace(fields[2]))
		if err != nil || page < 1 || !allKoreanWords(korean) || !validHanjaNotation(hanja, true) {
			return nil, fmt.Errorf("invalid exam idiom %q at line %d", raw, number+2)
		}
		if seen[korean] {
			return nil, fmt.Errorf("duplicate exam idiom %q", korean)
		}
		seen[korean] = true
		entries = append(entries, model.Idiom{
			Korean:       korean,
			Hanja:        hanja,
			Sources:      []string{examSourceID},
			SourceOrders: map[string]int{examSourceID: number + 1},
			Page:         page,
		})
	}
	if len(entries) != examExpectedCount {
		return nil, fmt.Errorf("exam catalog contains %d entries, want %d", len(entries), examExpectedCount)
	}
	return entries, nil
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

func allKoreanWords(value string) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	for _, r := range value {
		if r != ' ' && !unicode.Is(unicode.Hangul, r) {
			return false
		}
	}
	return true
}

func validHanjaNotation(value string, allowSpaces bool) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r != '-' && r != '/' && !(allowSpaces && r == ' ') && !isHanja(r) {
			return false
		}
	}
	return true
}

func isHanja(r rune) bool {
	return r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff
}
