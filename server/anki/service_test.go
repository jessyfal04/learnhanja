package anki

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"hanjavocab/server/model"
)

func TestStatusByCharacter(t *testing.T) {
	var mu sync.Mutex
	var queries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action string          `json:"action"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		switch request.Action {
		case "modelFieldNames":
			_, _ = w.Write([]byte(`{"result":["Char","Grade"],"error":null}`))
		case "findNotes":
			var params struct {
				Query string `json:"query"`
			}
			_ = json.Unmarshal(request.Params, &params)
			mu.Lock()
			queries = append(queries, params.Query)
			mu.Unlock()
			result := `[1,2,3]`
			switch {
			case strings.Contains(params.Query, "-is:new"):
				result = `[1]`
			case strings.Contains(params.Query, "is:suspended"):
				result = `[3]`
			case strings.Contains(params.Query, "is:new"):
				result = `[2,3]`
			}
			_, _ = w.Write([]byte(`{"result":` + result + `,"error":null}`))
		case "notesInfo":
			_, _ = w.Write([]byte(`{"result":[
				{"noteId":1,"fields":{"Char":{"value":"人"},"Grade":{"value":"8급"}}},
				{"noteId":2,"fields":{"Char":{"value":"<b>日</b>"},"Grade":{"value":"8급"}}},
				{"noteId":3,"fields":{"Char":{"value":"月"},"Grade":{"value":"7급"}}}
			],"error":null}`))
		default:
			t.Fatalf("unexpected action %q", request.Action)
		}
	}))
	defer server.Close()

	service := NewService(NewClient(server.URL, time.Second))
	result, err := service.Status(context.Background(), StatusRequest{
		Deck:           `A"B`,
		NoteType:       "Hanja",
		CharacterField: "Char",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 3 || result.Known != 1 || result.New != 2 || result.Unknown != 0 {
		t.Fatalf("unexpected counts: %#v", result)
	}
	if result.Characters["人"].Status != model.StatusKnown {
		t.Fatalf("unexpected known character: %#v", result.Characters["人"])
	}
	if !result.Characters["月"].Suspended {
		t.Fatal("expected suspended character")
	}
	if len(queries) == 0 || !strings.Contains(queries[0], `deck:"A\"B"`) {
		t.Fatalf("deck was not escaped in query: %#v", queries)
	}
}

func TestNoteTypesFiltersModelsByDeck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action string          `json:"action"`
			Params json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&request)
		switch request.Action {
		case "modelNames":
			_, _ = w.Write([]byte(`{"result":["CJK Story","Hanja"],"error":null}`))
		case "findNotes":
			var params struct {
				Query string `json:"query"`
			}
			_ = json.Unmarshal(request.Params, &params)
			if strings.Contains(params.Query, `note:"Hanja"`) {
				_, _ = w.Write([]byte(`{"result":[1],"error":null}`))
			} else {
				_, _ = w.Write([]byte(`{"result":[],"error":null}`))
			}
		default:
			t.Fatalf("unexpected action %q", request.Action)
		}
	}))
	defer server.Close()

	noteTypes, err := NewService(NewClient(server.URL, time.Second)).NoteTypes(context.Background(), "Hanja")
	if err != nil {
		t.Fatal(err)
	}
	if len(noteTypes) != 1 || noteTypes[0] != "Hanja" {
		t.Fatalf("unexpected note types: %#v", noteTypes)
	}
}

func TestStatusRejectsMissingField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"result":["Char"],"error":null}`))
	}))
	defer server.Close()

	service := NewService(NewClient(server.URL, time.Second))
	_, err := service.Status(context.Background(), StatusRequest{
		Deck: "Hanja", NoteType: "Hanja", CharacterField: "Missing",
	})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("expected missing field error, got %v", err)
	}
}

func TestNotesInfoBatchesLargeCollections(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action string `json:"action"`
		}
		_ = json.NewDecoder(r.Body).Decode(&request)
		if request.Action != "notesInfo" {
			t.Fatalf("unexpected action %q", request.Action)
		}
		calls++
		_, _ = w.Write([]byte(`{"result":[],"error":null}`))
	}))
	defer server.Close()

	ids := make([]int64, notesBatchSize+1)
	_, err := NewService(NewClient(server.URL, time.Second)).notesInfo(context.Background(), ids)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 calls, got %d", calls)
	}
}
