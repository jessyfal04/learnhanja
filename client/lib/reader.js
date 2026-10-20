import {ankiRecentCharacters, ankiRecentlyIntroducedCharacters} from "./anki-connect.js";
import {state} from "./state.js";
import {loadStaticJSON} from "./static-data.js";
import {loadVocabularyCatalog} from "./vocabulary-data.js";
import {entryHanja, entryKey} from "./game-data.js";
import {convertKorean, loadReaderExposure, passageText, recordReaderSession, saveReaderExposure, selectCharacters, selectReaderWords} from "./reader-data.js";
import {openInsights} from "./insights.js";

const $ = (id) => document.getElementById(id);
const session = {segments: [], mode: "mixed", entries: new Map(), revealed: new Set(), missed: new Set(), finished: false};
let catalog;
let references;

function status(message, error = false) {
	$("readerStatus").textContent = message;
	$("readerStatus").className = `help mt-3 ${error ? "has-text-danger" : "has-text-info"}`;
}

async function ensureCatalog() {
	catalog ||= await loadVocabularyCatalog();
	return catalog;
}

function manualCharacters() {
	return new Set(Array.from($("readerManual").value.normalize("NFKC")).filter((char) => /^\p{Script=Han}$/u.test(char)));
}

async function syllabusCharacters() {
	const data = await loadStaticJSON("/data/levels-sangong.json");
	const variants = new Set(Object.keys(data.variants || {}));
	return new Set(data.groups.flatMap((group) => group.characters).filter((char) => !variants.has(char)));
}

async function readerCharacters(source, stats) {
	const manual = manualCharacters();
	let failed = new Set();
	let introduced = new Set();
	const connection = state.ankiStatusSource;
	if ((source === "failed" || source === "introduced") && connection) {
		const config = {deck: connection.deck, field: connection.field};
		if (source === "failed") failed = await ankiRecentCharacters(config);
		else introduced = await ankiRecentlyIntroducedCharacters(config);
	}
	if (source === "failed" && failed.size && failed.size < 5 && state.ankiStatus) {
		const more = selectCharacters("learned", {status: state.ankiStatus, failed, exposures: stats.characters, limit: 6});
		for (const character of more) failed.add(character);
	}
	const chosen = source === "introduced" ? introduced : source === "failed" ? failed : source === "selected" ? new Set([...state.selected, ...manual]) : source === "syllabus" ? await syllabusCharacters() : null;
	const list = selectCharacters(source === "introduced" || source === "failed" || source === "selected" || source === "syllabus" ? "selected" : "learned", {status: state.ankiStatus, selected: chosen || manual, failed, exposures: stats.characters, limit: 6});
	if (!list.length && manual.size) return selectCharacters("selected", {selected: manual, exposures: stats.characters, limit: 6});
	return list;
}

async function generate(source = $("readerSource").value) {
	const button = $("readerGenerate");
	button.classList.add("is-loading");
	status("목표 한자와 어휘를 고르는 중…");
	try {
		const entries = await ensureCatalog();
		const stats = loadReaderExposure();
		const subject = $("readerSubject").value === "free" ? $("readerFreeSubject").value.trim() : $("readerSubject").value;
		const characters = await readerCharacters(source, stats);
		if (!characters.length) { $("readerOptions").open = true; throw new Error(source === "failed" ? "오늘 틀린 독음 한자를 찾지 못했습니다. 다른 한자를 선택하거나 직접 입력하세요" : "목표 한자가 없습니다. 다른 한자를 선택하거나 직접 입력하세요"); }
		const words = selectReaderWords(entries, characters, {knownWords: state.knownWords, markedWords: state.markedWords, exposures: stats.characters, recentWords: stats.recentWords});
		if (words.length < 3) throw new Error("선택한 한자로 쓸 수 있는 사전 어휘가 부족합니다. 한자를 더 선택하세요");
		if (!subject) throw new Error("주제를 입력하세요");
		const familiar = entries.filter((entry) => state.knownWords.has(entry.hangul)).sort((a, b) => (a.niklRank || 999999) - (b.niklRank || 999999)).map((entry) => entry.hangul).filter((word) => word.length > 1 && word.length < 15).slice(0, 35);
		status("한국어 글을 만드는 중…");
		const response = await fetch("/api/reader/generate", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({subject, length: $("readerLength").value, words: words.map((word) => ({hangul: word.hangul, hanja: word.hanja})), familiar, avoid: stats.recentWords.slice(0, 8).map((key) => key.split("\u0000")[0])})});
		if (!response.ok) throw new Error((await response.text()).trim() || `서버 요청 실패 (${response.status})`);
		const result = await response.json();
		if (!Array.isArray(result.segments)) throw new Error("서버가 올바른 글을 돌려주지 않았습니다");
		const known = new Map(words.map((word) => [entryKey(word), word]));
		if (result.segments.some((part) => part.hanja && !known.has(`${part.text}\u0000${part.hanja}`))) throw new Error("사전에 없는 한자 표기가 포함되었습니다");
		showPassage(result.segments, entries);
		button.textContent = "다른 글 만들기";
		status(`목표 한자 ${characters.join(" · ")} · ${state.knownWordsSource ? "Migaku 어휘 반영" : "Migaku 없이 생성"}`);
	} catch (error) { status(error.message || "글을 만들 수 없습니다", true); }
	finally { button.classList.remove("is-loading"); }
}

async function convert() {
	const text = $("readerPaste").value;
	if (!text.trim()) { status("바꿀 한국어 글을 붙여넣으세요", true); return; }
	try {
		const entries = await ensureCatalog();
		const knownOnly = $("readerKnownOnly").checked;
		const known = state.ankiStatus && new Set(Object.entries(state.ankiStatus.characters).filter(([, info]) => info.status === "known" && !info.suspended).map(([char]) => char));
		const manual = manualCharacters();
		const allowed = knownOnly ? new Set([...(known || []), ...manual]) : null;
		if (knownOnly && !allowed.size) throw new Error("학습한 독음 상태가 없습니다. 연결 탭에서 새로고침하거나 한자를 직접 입력하세요");
		const segments = convertKorean(text, entries, allowed);
		showPassage(segments, entries);
		status(`오프라인 변환 완료 · ${segments.filter((part) => part.hanja).length}곳 표시 · 애매한 단어는 그대로 두었습니다`);
	} catch (error) { status(error.message || "변환할 수 없습니다", true); }
}

function showPassage(segments, entries) {
	session.segments = segments;
	session.entries = new Map(entries.map((entry) => [entryKey(entry), entry]));
	session.mode = "mixed";
	session.revealed = new Set();
	session.missed = new Set();
	session.finished = false;
	$("readerSummary").textContent = "";
	$("readerDetails").classList.add("is-hidden");
	$("readerResult").classList.remove("is-hidden");
	renderPassage();
}

function renderPassage() {
	const container = $("readerPassage");
	container.replaceChildren();
	for (const [index, part] of session.segments.entries()) {
		if (!part.hanja || session.mode === "hangul") { container.append(document.createTextNode(part.text)); continue; }
		const button = document.createElement("button");
		button.type = "button";
		button.className = "reader-word";
		button.setAttribute("aria-label", session.mode === "practice" ? `${part.hanja} 독음 보기` : `${part.hanja} 풀이 보기`);
		button.textContent = session.mode === "practice" && session.revealed.has(index) ? `${part.hanja} (${part.text})` : part.hanja;
		button.addEventListener("click", () => inspectWord(index));
		container.append(button);
	}
	for (const button of document.querySelectorAll(".reader-mode")) button.classList.toggle("is-link", button.dataset.mode === session.mode);
}

async function inspectWord(index) {
	const part = session.segments[index];
	if (session.mode === "practice") { session.revealed.add(index); renderPassage(); }
	const entry = session.entries.get(`${part.text}\u0000${part.hanja}`);
	const details = $("readerDetails");
	details.replaceChildren();
	const heading = document.createElement("strong");
	heading.textContent = `${part.hanja} · ${part.text}`;
	details.append(heading);
	const definitions = document.createElement("p");
	definitions.textContent = `뜻: ${entry?.definitions?.join(" · ") || "사전 풀이 없음"}`;
	details.append(definitions);
	if (entry?.meanings?.length) { const english = document.createElement("p"); english.textContent = `영어: ${entry.meanings.join(" · ")}`; details.append(english); }
	const chars = entryHanja(part);
	try {
		references ||= (await loadStaticJSON("/data/insights.json")).characters;
		const breakdown = document.createElement("p");
		breakdown.textContent = chars.map((char) => `${char} ${references[char]?.hangul?.join("/") || "?"} · ${references[char]?.definition || "풀이 없음"}`).join(" / ");
		details.append(breakdown);
	} catch {}
	const learning = document.createElement("p");
	learning.textContent = `앙키: ${chars.map((char) => `${char} ${state.ankiStatus?.characters?.[char]?.status === "known" ? "학습함" : "미확인"}`).join(" · ")} · Migaku: ${!state.knownWordsSource ? "미연결" : state.knownWords.has(part.text) ? "아는 단어" : state.markedWords.has(part.text) ? "표시한 단어" : "미확인"}`;
	details.append(learning);
	const explore = document.createElement("button");
	explore.type = "button";
	explore.className = "button is-small is-link is-light mt-2";
	explore.textContent = "한자 탐구 열기";
	explore.addEventListener("click", () => { void openInsights(part.hanja); });
	const miss = document.createElement("button");
	miss.type = "button";
	miss.className = "button is-small is-light mt-2 ml-2";
	miss.textContent = "이 단어 어려워요";
	miss.addEventListener("click", () => { for (const char of chars) session.missed.add(char); miss.disabled = true; miss.textContent = "기록했습니다"; });
	details.append(explore, miss);
	details.classList.remove("is-hidden");
}

function finish() {
	if (!session.segments.length || session.finished) return;
	const stats = loadReaderExposure();
	const revealedCharacters = new Set([...session.revealed].flatMap((index) => entryHanja(session.segments[index])));
	const result = recordReaderSession(stats, session.segments, {revealed: revealedCharacters, missed: session.missed});
	try { saveReaderExposure(result.stats); } catch { status("브라우저 저장소에 읽기 기록을 저장할 수 없습니다", true); }
	session.finished = true;
	const unfamiliar = [...result.words].filter((key) => !state.knownWords.has(key.split("\u0000")[0])).length;
	$("readerSummary").textContent = `읽기 완료 · 한자 ${result.characters.size}자 · 어휘 ${result.words.size}개 · 낯선 어휘 ${state.knownWordsSource ? `${unfamiliar}개` : "미확인"} · 독음 확인 ${revealedCharacters.size}자 · 어려웠던 한자 ${session.missed.size}자 · 누적 ${result.stats.sessions}회. 노출은 암기 완료로 처리하지 않습니다.`;
}

export function initializeReader() {
	$("readerSubject").addEventListener("change", () => { $("readerFreeSubjectField").classList.toggle("is-hidden", $("readerSubject").value !== "free"); });
	$("readerRescue").addEventListener("click", () => { $("readerSource").value = "failed"; void generate("failed"); });
	$("readerGenerate").addEventListener("click", () => { void generate(); });
	$("readerConvert").addEventListener("click", () => { void convert(); });
	for (const button of document.querySelectorAll(".reader-mode")) button.addEventListener("click", () => { session.mode = button.dataset.mode; renderPassage(); });
	$("readerCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(passageText(session.segments)); status("한글 글을 복사했습니다"); } catch { status("복사 권한을 확인하세요", true); } });
	$("readerFinish").addEventListener("click", finish);
}
