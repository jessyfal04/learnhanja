package levels

import "testing"

func TestEmbeddedCatalog(t *testing.T) {
	catalog, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	data := catalog.Data()
	if data.Total != 3500 || len(data.Groups) != 14 {
		t.Fatalf("unexpected catalog: total=%d groups=%d", data.Total, len(data.Groups))
	}
	if data.Groups[0].Level != "8급" || len(data.Groups[0].Characters) != 50 {
		t.Fatalf("unexpected first level: %#v", data.Groups[0])
	}
	if data.Groups[len(data.Groups)-1].Level != "1급" {
		t.Fatalf("unexpected last level: %#v", data.Groups[len(data.Groups)-1])
	}
}
