from typing import List, Tuple
from pathlib import Path
import shutil

def write_tsv(rows: List[Tuple[str, str, str, str, int, int, int]], outpath: Path):
    outpath.parent.mkdir(parents=True, exist_ok=True)
    with outpath.open("w", encoding="utf-8") as f:
        f.write("Hanja\tHangul\tEnglish\tPokemonRank\tNIKLRank\n")
        for hanja_word, hangul, gloss, _src, _idx, pkm_rank, nikl_rank in rows:
            f.write(f"{hanja_word}\t{hangul}\t{gloss}\t{pkm_rank}\t{nikl_rank}\n")

def ensure_bulma(outdir: Path):
    target = outdir / "bulma.css"
    if target.exists():
        return
    src = Path("out/bulma.css")
    if src.exists():
        shutil.copyfile(src, target)

def write_html(rows: List[Tuple[str, str, str, str, int, int, int]], outpath: Path, title: str = "Hanja Vocabulary", subtitle: str | None = None):
    outpath.parent.mkdir(parents=True, exist_ok=True)
    ensure_bulma(outpath.parent)
    def esc(s: str) -> str:
        return (s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                )
    count = len(rows)
    html = [
        "<!DOCTYPE html>",
        "<html lang=\"en\">",
        "<head>",
        "  <meta charset=\"UTF-8\">",
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        f"  <title>{esc(title)}</title>",
        "  <link rel=\"stylesheet\" href=\"bulma.css\">",
        "  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
        "  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
        "  <link href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap\" rel=\"stylesheet\">",
        "  <style>.nowrap{white-space:nowrap} .hanja{font-family:'Noto Serif KR','Noto Serif CJK KR',serif;font-size:1.8rem;line-height:1.2} .table td,.table th{vertical-align:middle}</style>",
        "</head>",
        "<body>",
        "  <section class=\"section\">",
        "    <div class=\"container\">",
        f"      <h1 class=\"title\">{esc(title)}</h1>",
        (f"      <p class=\"subtitle\">{esc(subtitle)}</p>" if subtitle else ""),

        "      <div class=\"box\">",
        "        <div class=\"columns is-multiline is-vcentered\">",
        "          <div class=\"column is-half-tablet is-two-fifths-desktop\">",
        "            <div class=\"field\">",
        "              <label class=\"label\">Filter</label>",
        "              <div class=\"control\">",
        "                <input id=\"filterInput\" class=\"input\" type=\"text\" placeholder=\"Type to filter\">",
        "              </div>",
        "              <p class=\"help\">Matches Hanja+Hangul+English or Hanja-only.</p>",
        "            </div>",
        "          </div>",
        "          <div class=\"column is-one-quarter-tablet is-one-fifth-desktop\">",
        "            <div class=\"field\">",
        "              <label class=\"label\">Max frequency rank</label>",
        "              <div class=\"control\">",
        "                <input id=\"freqInput\" class=\"input\" type=\"number\" min=\"1\" placeholder=\"e.g., 5000\">",
        "              </div>",
        "              <p class=\"help\">Pass if Pokémon or NIKL rank ≤ value.</p>",
        "            </div>",
        "          </div>",
        "          <div class=\"column is-one-quarter-tablet is-one-fifth-desktop\">",
        "            <div class=\"field\">",
        "              <label class=\"label\">Options</label>",
        "              <div class=\"control\">",
        "                <label class=\"checkbox\">",
        "                  <input id=\"hanjaOnlyToggle\" type=\"checkbox\"> Hanja column only",
        "                </label>",
        "              </div>",
        "              <p class=\"help\">Avoid Hangul/English matches.</p>",
        "            </div>",
        "          </div>",
        "          <div class=\"column is-one-quarter-tablet is-one-fifth-desktop\">",
        "            <div class=\"field\">",
        "              <label class=\"label\">Sort</label>",
        "              <div class=\"control\">",
        "                <div class=\"select is-fullwidth\">",
        "                  <select id=\"sortSelect\">",
        "                    <option value=\"recent\" selected>Recent</option>",
        "                    <option value=\"hanja-asc\">Hanja ↑</option>",
        "                    <option value=\"hanja-desc\">Hanja ↓</option>",
        "                    <option value=\"hangul-asc\">Hangul ↑</option>",
        "                    <option value=\"hangul-desc\">Hangul ↓</option>",
        "                    <option value=\"english-asc\">English ↑</option>",
        "                    <option value=\"english-desc\">English ↓</option>",
        "                  </select>",
        "                </div>",
        "              </div>",
        "            </div>",
        "          </div>",
        "          <div class=\"column has-text-right is-full-tablet is-one-fifth-desktop\">",
        f"            <div id=\"countInfo\" class=\"tag is-info is-light\">Showing <strong>{count}</strong> of <strong>{count}</strong></div>",
        "          </div>",
        "        </div>",
        "      </div>",
        "      <div class=\"table-container\">",
        "        <table class=\"table is-striped is-hoverable is-fullwidth\">",
        "          <thead>",
        "            <tr><th>Hanja</th><th>Hangul</th><th>English</th><th>Pokémon Rank</th><th>NIKL Rank</th></tr>",
        "          </thead>",
        "          <tbody id=\"vocabBody\">",
    ]
    for hanja_word, hangul, gloss, _src, idx, pkm_rank, nikl_rank in rows:
        html.append(
            f"            <tr data-recency=\"{idx}\" data-pkm=\"{pkm_rank}\" data-nikl=\"{nikl_rank}\""
            f" data-hanja=\"{esc(hanja_word).lower()}\" data-hangul=\"{esc(hangul).lower()}\" data-english=\"{esc(gloss).lower()}\">"
            f"<td class=\"nowrap hanja has-text-weight-semibold\">{esc(hanja_word)}</td>"
            f"<td>{esc(hangul)}</td>"
            f"<td>{esc(gloss)}</td>"
            f"<td>{pkm_rank if pkm_rank else ''}</td>"
            f"<td>{nikl_rank if nikl_rank else ''}</td>"
            f"</tr>"
        )
    html += [
        "          </tbody>",
        "        </table>",
        "      </div>",
        "    </div>",
        "  </section>",
        "  <footer class=\"footer\">",
        "    <div class=\"content has-text-centered\">",
        "      <p>",
        "        Thanks to <a href=\"https://krdict.korean.go.kr/\">KRDict</a> (국립국어원 한국어기초사전).",
        "        Vocabulary data is used under <a href=\"https://creativecommons.org/licenses/by-sa/4.0/\">CC BY-SA</a> where applicable.",
        "        When using the web parser, some entries are sourced from <a href=\"https://koreanhanja.app/\">koreanhanja.app</a>.",
        "      </p>",
        "      <p>Built with Bulma.</p>",
        "    </div>",
        "  </footer>",
        "  <script>",
        "  (function(){",
        "    const body = document.getElementById('vocabBody');",
        "    const filterInput = document.getElementById('filterInput');",
        "    const sortSelect = document.getElementById('sortSelect');",
        "    const countInfo = document.getElementById('countInfo');",
        "    const hanjaOnlyToggle = document.getElementById('hanjaOnlyToggle');",
        "    const freqInput = document.getElementById('freqInput');",
        "    const rows = Array.from(body.querySelectorAll('tr'));",
        "    const total = rows.length;",
        "    function normalize(s){ return (s||'').toLowerCase(); }",
        "    function visibleColText(tr, idx){ return (tr.children[idx] ? tr.children[idx].innerText : '').toLowerCase(); }",
        "    function apply(){",
        "      const q = normalize(filterInput.value);",
        "      const hanjaOnly = hanjaOnlyToggle.checked;",
        "      const freqLimitRaw = freqInput.value ? parseInt(freqInput.value, 10) : 0;",
        "      let visible = [];",
        "      rows.forEach(tr => {",
        "        const text = hanjaOnly ? tr.dataset.hanja : (tr.dataset.hanja + ' ' + tr.dataset.hangul + ' ' + tr.dataset.english);",
        "        let show = !q || text.indexOf(q) !== -1;",
        "        if(show && freqLimitRaw > 0){",
        "          const p = parseInt(tr.dataset.pkm || '0', 10);",
        "          const n = parseInt(tr.dataset.nikl || '0', 10);",
        "          const passFreq = (p > 0 && p <= freqLimitRaw) || (n > 0 && n <= freqLimitRaw);",
        "          show = passFreq;",
        "        }",
        "        tr.style.display = show ? '' : 'none';",
        "        if(show) visible.push(tr);",
        "      });",
        "      const mode = sortSelect.value;",
        "      const cmp = (a,b) => {",
        "        if(mode === 'recent'){",
        "          const ia = parseInt(a.dataset.recency||'-1', 10);",
        "          const ib = parseInt(b.dataset.recency||'-1', 10);",
        "          return ib - ia;",
        "        }",
        "        const [col,dirRaw] = mode.split('-');",
        "        const dir = dirRaw === 'desc' ? -1 : 1;",
        "        const idx = col === 'hanja' ? 0 : (col === 'hangul' ? 1 : 2);",
        "        const ta = visibleColText(a, idx);",
        "        const tb = visibleColText(b, idx);",
        "        return ta.localeCompare(tb) * dir;",
        "      };",
        "      visible.sort(cmp);",
        "      visible.forEach(tr => body.appendChild(tr));",
        "      if(countInfo){ countInfo.innerHTML = 'Showing <strong>' + visible.length + '</strong> of <strong>' + total + '</strong>'; }",
        "    }",
        "    filterInput.addEventListener('input', apply);",
        "    sortSelect.addEventListener('change', apply);",
        "    hanjaOnlyToggle.addEventListener('change', apply);",
        "    freqInput.addEventListener('input', apply);",
        "    apply();",
        "  })();",
        "  </script>",
        "</body>",
        "</html>",
    ]
    outpath.write_text("\n".join(html), encoding="utf-8")
