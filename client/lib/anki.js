import { ankiCharacterStatus, ankiFields, ankiIdiomStatus, ankiMetadata, ankiNoteTypes } from "./anki-connect.js?v=2";
import { preferredDeck } from "./deck-names.js";
import { state } from "./state.js";
import { loadStaticJSON } from "./static-data.js";
import { selectedFromAnki, toggledSelection, withLevelSelection } from "./selection.js";
import { koreanError, setLoading, setOptions, showMessage } from "./ui.js";

const deckSelect = document.getElementById("deckSelect");
const noteTypeSelect = document.getElementById("noteTypeSelect");
const characterFieldSelect = document.getElementById("characterFieldSelect");
const idiomDeckSelect = document.getElementById("idiomDeckSelect");
const idiomNoteTypeSelect = document.getElementById("idiomNoteTypeSelect");
const idiomFieldSelect = document.getElementById("idiomFieldSelect");

let selectionSignature = "";
let statusRequestID = 0;
let statusPromise = null;
let autoSelectRequest = false;

export async function loadCatalog() {
	try {
		state.catalog = await loadStaticJSON("/data/levels.json");
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
		const metadata = await ankiMetadata();
		setOptions(deckSelect, metadata.decks, []);
		setOptions(idiomDeckSelect, metadata.decks, []);
		deckSelect.value = preferredDeck(metadata.decks, ["독음", "dokeum", "dogeum"]) || deckSelect.value;
		idiomDeckSelect.value = preferredDeck(metadata.decks, ["사자성어", "sajasongon", "sajaseongeo"]) || idiomDeckSelect.value;
		status.className = "tag is-medium is-success is-light";
		status.textContent = `연결됨 · 규격 ${metadata.version}`;
		await Promise.all([loadNoteTypes(), loadIdiomNoteTypes()]);
		await Promise.all([
			refreshStatus({silent: true, autoSelect: true}),
			refreshIdiomStatus({silent: true}),
		]);
	} catch (error) {
		status.className = "tag is-medium is-danger is-light";
		status.textContent = "앙키를 사용할 수 없음";
		invalidateCharacterStatus();
		state.ankiStatusError = "앙키에 연결할 수 없습니다. AnkiConnect와 연결 설정을 확인하세요";
		document.dispatchEvent(new Event("hanja-status-change"));
		showMessage("warning", koreanError(error, "급수별 한자 목록은 사용할 수 있지만 앙키 상태는 확인할 수 없습니다"));
	}
}

export async function loadNoteTypes() {
	invalidateCharacterStatus();
	const deck = deckSelect.value;
	noteTypeSelect.replaceChildren();
	characterFieldSelect.replaceChildren();
	if (!deck) return;
	const noteTypes = await ankiNoteTypes(deck);
	if (deck !== deckSelect.value) return;
	setOptions(noteTypeSelect, noteTypes, ["Hanja", "CJK Story"]);
	await loadFields();
}

export async function loadFields() {
	invalidateCharacterStatus();
	const deck = deckSelect.value;
	const noteType = noteTypeSelect.value;
	characterFieldSelect.replaceChildren();
	if (!noteType) return;
	const fields = await ankiFields(noteType);
	if (deck !== deckSelect.value || noteType !== noteTypeSelect.value) return;
	setOptions(characterFieldSelect, fields, ["Char", "Hanja", "漢字", "Character"]);
	document.dispatchEvent(new Event("hanja-anki-ready"));
}

export function characterFieldChanged() {
	invalidateCharacterStatus();
	document.dispatchEvent(new Event("hanja-anki-ready"));
}

function invalidateCharacterStatus() {
	statusRequestID++;
	statusPromise = null;
	autoSelectRequest = false;
	state.ankiStatus = null;
	state.ankiStatusLoading = false;
	state.ankiStatusError = "";
	state.ankiStatusSource = null;
	setLoading(document.getElementById("refreshStatusButton"), false);
	renderCatalog();
	document.dispatchEvent(new Event("hanja-status-change"));
}

export async function loadIdiomNoteTypes() {
	if (!idiomDeckSelect.value) return;
	const noteTypes = await ankiNoteTypes(idiomDeckSelect.value);
	setOptions(idiomNoteTypeSelect, noteTypes, ["사자성어"]);
	await loadIdiomFields();
}

export async function loadIdiomFields() {
	if (!idiomNoteTypeSelect.value) return;
	const fields = await ankiFields(idiomNoteTypeSelect.value);
	setOptions(idiomFieldSelect, fields, ["Char", "Hanja", "한자", "漢字", "Idiom", "Sound"]);
}

export function refreshStatus({silent = false, autoSelect = false} = {}) {
	if (statusPromise) {
		autoSelectRequest ||= autoSelect;
		return statusPromise;
	}
	const config = {deck: deckSelect.value, noteType: noteTypeSelect.value, field: characterFieldSelect.value};
	if (!config.deck || !config.noteType || !config.field) {
		state.ankiStatusError = "연결 탭에서 덱, 노트 유형, 한자 필드를 선택하세요";
		document.dispatchEvent(new Event("hanja-status-change"));
		return Promise.resolve(false);
	}
	const id = ++statusRequestID;
	autoSelectRequest = autoSelect;
	const button = document.getElementById("refreshStatusButton");
	setLoading(button, true);
	state.ankiStatusLoading = true;
	state.ankiStatusError = "";
	document.dispatchEvent(new Event("hanja-status-change"));
	statusPromise = (async () => {
		try {
			const result = await ankiCharacterStatus(config);
			if (id !== statusRequestID) return false;
			state.ankiStatus = result;
			state.ankiStatusSource = {...config, checkedAt: Date.now()};
			if (autoSelectRequest) state.selected = selectedFromAnki(state.catalog, result);
			renderCatalog();
			if (!silent) showMessage("success", `앙키에서 한자 ${result.total}자의 상태를 확인했습니다`);
			return true;
		} catch (error) {
			if (id !== statusRequestID) return false;
			state.ankiStatus = null;
			state.ankiStatusSource = null;
			state.ankiStatusError = koreanError(error, "앙키 상태를 확인할 수 없습니다. AnkiConnect와 연결 설정을 확인하세요");
			if (!silent) showMessage("danger", state.ankiStatusError);
			renderCatalog();
			return false;
		} finally {
			if (id === statusRequestID) {
				statusPromise = null;
				autoSelectRequest = false;
				state.ankiStatusLoading = false;
				setLoading(button, false);
				document.dispatchEvent(new Event("hanja-status-change"));
			}
		}
	})();
	return statusPromise;
}

export async function refreshIdiomStatus({silent = false} = {}) {
	const button = document.getElementById("refreshIdiomStatusButton");
	setLoading(button, true);
	try {
		state.idiomAnkiStatus = await ankiIdiomStatus({deck: idiomDeckSelect.value, noteType: idiomNoteTypeSelect.value, field: idiomFieldSelect.value});
		document.dispatchEvent(new Event("hanja-idiom-status-change"));
		if (!silent) showMessage("success", `앙키에서 사자성어 ${state.idiomAnkiStatus.total}개의 상태를 확인했습니다`);
		return true;
	} catch (error) {
		state.idiomAnkiStatus = null;
		document.dispatchEvent(new Event("hanja-idiom-status-change"));
		if (!silent) showMessage("danger", koreanError(error, "사자성어 앙키 상태를 확인할 수 없습니다"));
		return false;
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
	const signature = Array.from(state.selected).sort().join("");
	if (signature !== selectionSignature) {
		selectionSignature = signature;
		document.dispatchEvent(new Event("hanja-selection-change"));
	}
}
