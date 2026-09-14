import { api } from "./api.js";
import { state } from "./state.js";
import { toggledSelection, withLevelSelection } from "./selection.js";
import { koreanError, setLoading, setOptions, showMessage } from "./ui.js";

const deckSelect = document.getElementById("deckSelect");
const noteTypeSelect = document.getElementById("noteTypeSelect");
const characterFieldSelect = document.getElementById("characterFieldSelect");
const idiomDeckSelect = document.getElementById("idiomDeckSelect");
const idiomNoteTypeSelect = document.getElementById("idiomNoteTypeSelect");
const idiomFieldSelect = document.getElementById("idiomFieldSelect");

export async function loadCatalog() {
	try {
		state.catalog = await api("/api/levels");
		renderCatalog();
	} catch (error) {
		showMessage("danger", koreanError(error, "급수별 한자 목록을 불러올 수 없습니다"));
	}
}

export async function loadMetadata() {
	const status = document.getElementById("ankiStatus");
	status.className = "tag is-medium is-warning is-light";
	status.textContent = "연결 중…";
	try {
		const metadata = await api("/api/anki");
		setOptions(deckSelect, metadata.decks, ["어문회::A. 독음", "日中韓漢字::A. Reco::A. Reco Hanja", "한자"]);
		setOptions(idiomDeckSelect, metadata.decks, ["어문회::D. 사자성어", "사자성어"]);
		status.className = "tag is-medium is-success is-light";
		status.textContent = `연결됨 · 규격 ${metadata.version}`;
		await Promise.all([loadNoteTypes(), loadIdiomNoteTypes()]);
	} catch (error) {
		status.className = "tag is-medium is-danger is-light";
		status.textContent = "앙키를 사용할 수 없음";
		showMessage("warning", "급수별 한자 목록은 사용할 수 있지만 앙키 상태는 확인할 수 없습니다");
	}
}

export async function loadNoteTypes() {
	if (!deckSelect.value) return;
	const result = await api(`/api/anki/note-types?deck=${encodeURIComponent(deckSelect.value)}`);
	setOptions(noteTypeSelect, result.noteTypes, ["Hanja", "CJK Story"]);
	await loadFields();
}

export async function loadFields() {
	if (!noteTypeSelect.value) return;
	const result = await api(`/api/anki/fields?noteType=${encodeURIComponent(noteTypeSelect.value)}`);
	setOptions(characterFieldSelect, result.fields, ["Char", "Hanja", "漢字", "Character"]);
}

export async function loadIdiomNoteTypes() {
	if (!idiomDeckSelect.value) return;
	const result = await api(`/api/anki/note-types?deck=${encodeURIComponent(idiomDeckSelect.value)}`);
	setOptions(idiomNoteTypeSelect, result.noteTypes, ["사자성어"]);
	await loadIdiomFields();
}

export async function loadIdiomFields() {
	if (!idiomNoteTypeSelect.value) return;
	const result = await api(`/api/anki/fields?noteType=${encodeURIComponent(idiomNoteTypeSelect.value)}`);
	setOptions(idiomFieldSelect, result.fields, ["Char", "Hanja", "한자", "漢字", "Idiom", "Sound"]);
}

export async function refreshStatus() {
	const button = document.getElementById("refreshStatusButton");
	setLoading(button, true);
	try {
		state.ankiStatus = await api("/api/anki/status", {method: "POST", body: JSON.stringify({deck: deckSelect.value, noteType: noteTypeSelect.value, characterField: characterFieldSelect.value})});
		renderCatalog();
		showMessage("success", `앙키에서 한자 ${state.ankiStatus.total}자의 상태를 확인했습니다`);
	} catch (error) {
		showMessage("danger", koreanError(error, "앙키 상태를 확인할 수 없습니다"));
	} finally {
		setLoading(button, false);
	}
}

export async function refreshIdiomStatus() {
	const button = document.getElementById("refreshIdiomStatusButton");
	setLoading(button, true);
	try {
		const result = await api("/api/anki/idiom-status", {method: "POST", body: JSON.stringify({deck: idiomDeckSelect.value, noteType: idiomNoteTypeSelect.value, idiomField: idiomFieldSelect.value})});
		const idioms = {};
		for (const [idiom, info] of Object.entries(result.idioms || {})) idioms[idiom.normalize("NFKC")] = info;
		state.idiomAnkiStatus = {...result, idioms};
		const { renderIdioms } = await import("./idioms.js");
		renderIdioms();
		showMessage("success", `앙키에서 사자성어 ${result.total}개의 상태를 확인했습니다`);
	} catch (error) {
		showMessage("danger", koreanError(error, "사자성어 앙키 상태를 확인할 수 없습니다"));
	} finally {
		setLoading(button, false);
	}
}

export function selectStatus(status) {
	const selected = new Set();
	for (const [character, info] of Object.entries(state.ankiStatus?.characters || {})) if (info.status === status) selected.add(character);
	state.selected = selected;
	updateCharacterButtons();
	updateSelectionUI();
}

export function clearSelection() {
	state.selected = new Set();
	updateCharacterButtons();
	updateSelectionUI();
}

export function renderCatalog() {
	if (!state.catalog) return;
	let known = 0;
	let fresh = 0;
	for (const group of state.catalog.groups) for (const character of group.characters) {
		const status = state.ankiStatus?.characters?.[character]?.status;
		if (status === "known") known++;
		if (status === "new") fresh++;
	}
	document.getElementById("knownCount").textContent = `학습함 ${known}`;
	document.getElementById("newCount").textContent = `새 카드 ${fresh}`;
	document.getElementById("unknownCount").textContent = `상태 없음 ${state.catalog.total - known - fresh}`;
	const groups = document.getElementById("levelGroups");
	groups.replaceChildren(...state.catalog.groups.map(renderGroup));
	updateSelectionUI();
}

function renderGroup(group) {
	const box = document.createElement("div");
	box.className = "box";
	const heading = document.createElement("div");
	heading.className = "level mb-4";
	const title = document.createElement("h3");
	title.className = "title is-5 mb-0";
	title.textContent = `${group.level} · ${group.characters.length}`;
	const actions = document.createElement("div");
	actions.className = "buttons are-small";
	actions.append(actionButton("급수 전체 선택", "is-link is-light", true), actionButton("급수 선택 해제", "is-light", false));
	heading.append(title, actions);
	box.appendChild(heading);
	const grid = document.createElement("div");
	grid.className = "hanja-grid";
	for (const value of group.characters) {
		const info = state.ankiStatus?.characters?.[value] || {status: "unknown"};
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button hanja-button ${statusClass(info.status)}`;
		button.textContent = value;
		button.title = `${group.level} · ${statusLabel(info.status)}${info.suspended ? " · 일시 중단" : ""}`;
		button.dataset.character = value;
		button.classList.toggle("is-suspended", Boolean(info.suspended));
		button.addEventListener("click", () => { state.selected = toggledSelection(state.selected, value); updateCharacterButtons(); updateSelectionUI(); });
		grid.appendChild(button);
	}
	box.appendChild(grid);
	function actionButton(label, classes, select) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `button ${classes}`;
		button.textContent = label;
		button.addEventListener("click", () => { state.selected = withLevelSelection(state.selected, group.characters.map((value) => ({value})), select); updateCharacterButtons(); updateSelectionUI(); });
		return button;
	}
	return box;
}

function updateCharacterButtons() {
	for (const button of document.querySelectorAll(".hanja-button")) {
		const selected = state.selected.has(button.dataset.character);
		button.classList.toggle("is-selected", selected);
		button.setAttribute("aria-pressed", String(selected));
	}
}

function statusClass(status) {
	if (status === "known") return "is-success is-light";
	if (status === "new") return "is-info is-light";
	return "is-light";
}

function statusLabel(status) {
	if (status === "known") return "학습함";
	if (status === "new") return "새 카드";
	return "상태 없음";
}

function updateSelectionUI() {
	document.getElementById("selectedCount").textContent = String(state.selected.size);
	document.getElementById("buildVocabButton").disabled = state.selected.size === 0;
	updateCharacterButtons();
}
