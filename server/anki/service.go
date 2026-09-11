package anki

import (
	"context"
	"fmt"
	"html"
	"regexp"
	"sort"
	"strings"

	"hanjavocab/server/model"
)

const notesBatchSize = 500

var tagPattern = regexp.MustCompile(`<[^>]*>`)

type Service struct {
	client *Client
}

type StatusRequest struct {
	Deck           string `json:"deck"`
	NoteType       string `json:"noteType"`
	CharacterField string `json:"characterField"`
}

type noteInfo struct {
	NoteID int64                `json:"noteId"`
	Fields map[string]noteField `json:"fields"`
}

type noteField struct {
	Value string `json:"value"`
}

func NewService(client *Client) *Service {
	return &Service{client: client}
}

func (s *Service) Metadata(ctx context.Context) (model.AnkiMetadata, error) {
	var metadata model.AnkiMetadata
	if err := s.client.invoke(ctx, "version", nil, &metadata.Version); err != nil {
		return metadata, err
	}
	if err := s.client.invoke(ctx, "deckNames", nil, &metadata.Decks); err != nil {
		return metadata, err
	}
	if err := s.client.invoke(ctx, "modelNames", nil, &metadata.NoteTypes); err != nil {
		return metadata, err
	}
	sort.Strings(metadata.Decks)
	sort.Strings(metadata.NoteTypes)
	metadata.Connected = true
	return metadata, nil
}

func (s *Service) Fields(ctx context.Context, noteType string) ([]string, error) {
	noteType = strings.TrimSpace(noteType)
	if noteType == "" {
		return nil, fmt.Errorf("note type is required")
	}
	var fields []string
	err := s.client.invoke(ctx, "modelFieldNames", map[string]string{"modelName": noteType}, &fields)
	return fields, err
}

func (s *Service) NoteTypes(ctx context.Context, deck string) ([]string, error) {
	deck = strings.TrimSpace(deck)
	if deck == "" {
		return nil, fmt.Errorf("deck is required")
	}
	var noteTypes []string
	if err := s.client.invoke(ctx, "modelNames", nil, &noteTypes); err != nil {
		return nil, err
	}
	matched := make([]string, 0, len(noteTypes))
	for _, noteType := range noteTypes {
		query := `deck:"` + escapeQuery(deck) + `" note:"` + escapeQuery(noteType) + `"`
		ids, err := s.findNotes(ctx, query)
		if err != nil {
			return nil, err
		}
		if len(ids) > 0 {
			matched = append(matched, noteType)
		}
	}
	sort.Strings(matched)
	return matched, nil
}

func (s *Service) Status(ctx context.Context, request StatusRequest) (model.AnkiStatus, error) {
	request.Deck = strings.TrimSpace(request.Deck)
	request.NoteType = strings.TrimSpace(request.NoteType)
	request.CharacterField = strings.TrimSpace(request.CharacterField)
	if request.Deck == "" || request.NoteType == "" || request.CharacterField == "" {
		return model.AnkiStatus{}, fmt.Errorf("deck, note type, and character field are required")
	}

	fields, err := s.Fields(ctx, request.NoteType)
	if err != nil {
		return model.AnkiStatus{}, err
	}
	if !contains(fields, request.CharacterField) {
		return model.AnkiStatus{}, fmt.Errorf("character field %q does not exist on note type %q", request.CharacterField, request.NoteType)
	}

	query := `deck:"` + escapeQuery(request.Deck) + `" note:"` + escapeQuery(request.NoteType) + `"`
	allIDs, err := s.findNotes(ctx, query)
	if err != nil {
		return model.AnkiStatus{}, err
	}
	knownIDs, err := s.findNotes(ctx, query+" -is:new")
	if err != nil {
		return model.AnkiStatus{}, err
	}
	newIDs, err := s.findNotes(ctx, query+" is:new")
	if err != nil {
		return model.AnkiStatus{}, err
	}
	suspendedIDs, err := s.findNotes(ctx, query+" is:suspended")
	if err != nil {
		return model.AnkiStatus{}, err
	}
	notes, err := s.notesInfo(ctx, allIDs)
	if err != nil {
		return model.AnkiStatus{}, err
	}

	return buildStatus(notes, request, idSet(knownIDs), idSet(newIDs), idSet(suspendedIDs)), nil
}

func (s *Service) findNotes(ctx context.Context, query string) ([]int64, error) {
	var ids []int64
	err := s.client.invoke(ctx, "findNotes", map[string]string{"query": query}, &ids)
	return ids, err
}

func (s *Service) notesInfo(ctx context.Context, ids []int64) ([]noteInfo, error) {
	notes := make([]noteInfo, 0, len(ids))
	for start := 0; start < len(ids); start += notesBatchSize {
		end := min(start+notesBatchSize, len(ids))
		var batch []noteInfo
		if err := s.client.invoke(ctx, "notesInfo", map[string][]int64{"notes": ids[start:end]}, &batch); err != nil {
			return nil, err
		}
		notes = append(notes, batch...)
	}
	return notes, nil
}

type characterAggregate struct {
	status model.CharacterStatusInfo
	known  bool
	new    bool
}

func buildStatus(notes []noteInfo, request StatusRequest, known, newCards, suspended map[int64]bool) model.AnkiStatus {
	aggregates := make(map[string]*characterAggregate)
	for _, note := range notes {
		field, ok := note.Fields[request.CharacterField]
		if !ok {
			continue
		}
		for _, character := range extractHanja(field.Value) {
			aggregate := aggregates[character]
			if aggregate == nil {
				aggregate = &characterAggregate{}
				aggregates[character] = aggregate
			}
			aggregate.status.NoteCount++
			aggregate.known = aggregate.known || known[note.NoteID]
			aggregate.new = aggregate.new || newCards[note.NoteID]
			aggregate.status.Suspended = aggregate.status.Suspended || suspended[note.NoteID]
		}
	}

	result := model.AnkiStatus{Characters: make(map[string]model.CharacterStatusInfo, len(aggregates))}
	for character, aggregate := range aggregates {
		switch {
		case aggregate.known:
			aggregate.status.Status = model.StatusKnown
			result.Known++
		case aggregate.new:
			aggregate.status.Status = model.StatusNew
			result.New++
		default:
			aggregate.status.Status = model.StatusUnknown
			result.Unknown++
		}
		result.Characters[character] = aggregate.status
		result.Total++
	}
	return result
}

func cleanField(value string) string {
	return strings.TrimSpace(html.UnescapeString(tagPattern.ReplaceAllString(value, "")))
}

func extractHanja(value string) []string {
	seen := make(map[rune]bool)
	var characters []string
	for _, r := range cleanField(value) {
		if !isHanja(r) || seen[r] {
			continue
		}
		seen[r] = true
		characters = append(characters, string(r))
	}
	return characters
}

func isHanja(r rune) bool {
	return r >= 0x3400 && r <= 0x9fff || r >= 0xf900 && r <= 0xfaff
}

func escapeQuery(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(value, `"`, `\"`)
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func idSet(ids []int64) map[int64]bool {
	set := make(map[int64]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set
}
