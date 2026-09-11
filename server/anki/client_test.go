package anki

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClientInvoke(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Action  string         `json:"action"`
			Version int            `json:"version"`
			Params  map[string]any `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.Action != "deckNames" || request.Version != 6 {
			t.Fatalf("unexpected request: %#v", request)
		}
		_, _ = w.Write([]byte(`{"result":["Hanja"],"error":null}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, time.Second)
	var decks []string
	if err := client.invoke(context.Background(), "deckNames", nil, &decks); err != nil {
		t.Fatal(err)
	}
	if len(decks) != 1 || decks[0] != "Hanja" {
		t.Fatalf("unexpected decks: %#v", decks)
	}
}

func TestClientReportsAnkiError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"result":null,"error":"boom"}`))
	}))
	defer server.Close()

	err := NewClient(server.URL, time.Second).invoke(context.Background(), "version", nil, new(int))
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("expected Anki error, got %v", err)
	}
}
