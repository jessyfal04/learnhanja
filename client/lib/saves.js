import { loadFields, loadNoteTypes, refreshStatus, renderCatalog } from "./anki.js";
import { createSnapshot, validateSnapshot } from "./persistence.js";
import { state } from "./state.js";
import { koreanError, showMessage } from "./ui.js";

const deckSelect = document.getElementById("deckSelect");
const noteTypeSelect = document.getElementById("noteTypeSelect");
const characterFieldSelect = document.getElementById("characterFieldSelect");
const fileStatus = document.getElementById("selectionFileStatus");
const handleDatabase = "hanja-vocab-files";
const handleStore = "handles";

let linkedHandle = null;
let writeQueue = Promise.resolve();
let loadingSnapshot = false;

export function currentSnapshot() {
	return createSnapshot({
		deck: deckSelect.value,
		noteType: noteTypeSelect.value,
		characterField: characterFieldSelect.value,
	}, state.selected);
}

export async function initializeFileSave() {
	if (!("showOpenFilePicker" in window)) {
		document.getElementById("saveFileButton").textContent = "파일 내려받기";
		document.getElementById("openFileButton").textContent = "파일 불러오기";
		setFileStatus("수동 저장", "is-warning is-light");
		return;
	}
	try {
		const handle = await loadStoredHandle();
		if (!handle || await handle.queryPermission({mode: "readwrite"}) !== "granted") {
			setFileStatus("파일 연결 안 됨", "is-light");
			return;
		}
		linkedHandle = handle;
		await loadFromHandle(handle);
		setFileStatus(`${handle.name} · 자동 저장`, "is-success is-light");
	} catch {
		linkedHandle = null;
		setFileStatus("파일 다시 연결 필요", "is-warning is-light");
	}
}

export async function saveBrowserFile() {
	try {
		if (!("showSaveFilePicker" in window)) {
			downloadJSON(JSON.stringify(currentSnapshot(), null, 2) + "\n");
			showMessage("success", "선택 목록 파일을 내려받았습니다");
			return;
		}
		const handle = await window.showSaveFilePicker({
			id: "hanja-vocab-selection",
			suggestedName: "한자-선택.json",
			types: [{description: "한자 선택 목록", accept: {"application/json": [".json"]}}],
		});
		await linkHandle(handle);
		await writeLinkedFile();
		showMessage("success", `${handle.name}에 연결했습니다. 선택 변경이 자동 저장됩니다`);
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", koreanError(error, "파일을 연결할 수 없습니다"));
	}
}

export async function openBrowserFile() {
	try {
		if (!("showOpenFilePicker" in window)) {
			const file = await chooseUpload();
			await applySnapshot(JSON.parse(await file.text()));
			showMessage("success", `${file.name}을 불러왔습니다. 이 브라우저에서는 자동 저장할 수 없습니다`);
			return;
		}
		const [handle] = await window.showOpenFilePicker({
			id: "hanja-vocab-selection",
			types: [{description: "한자 선택 목록", accept: {"application/json": [".json"]}}],
			multiple: false,
		});
		await loadFromHandle(handle);
		await linkHandle(handle);
		showMessage("success", `${handle.name}을 불러왔습니다. 선택 변경이 자동 저장됩니다`);
	} catch (error) {
		if (error.name !== "AbortError") showMessage("danger", koreanError(error, "파일을 불러올 수 없습니다"));
	}
}

export function autoSaveSelection() {
	if (!linkedHandle || loadingSnapshot) return;
	writeQueue = writeQueue.catch(() => {}).then(writeLinkedFile).catch((error) => {
		setFileStatus("자동 저장 실패", "is-danger is-light");
		showMessage("danger", koreanError(error, "연결된 파일에 자동 저장할 수 없습니다"));
	});
}

async function linkHandle(handle) {
	linkedHandle = handle;
	await storeHandle(handle);
	setFileStatus(`${handle.name} · 자동 저장`, "is-success is-light");
}

async function writeLinkedFile() {
	const writable = await linkedHandle.createWritable();
	await writable.write(JSON.stringify(currentSnapshot(), null, 2) + "\n");
	await writable.close();
	setFileStatus(`${linkedHandle.name} · 자동 저장`, "is-success is-light");
}

async function loadFromHandle(handle) {
	loadingSnapshot = true;
	try {
		const file = await handle.getFile();
		await applySnapshot(JSON.parse(await file.text()));
	} finally {
		loadingSnapshot = false;
	}
}

async function applySnapshot(snapshot) {
	validateSnapshot(snapshot);
	state.selected = new Set(snapshot.selected);
	renderCatalog();
	if (snapshot.deck && snapshot.noteType && snapshot.characterField && deckSelect.options.length > 0) {
		setExistingValue(deckSelect, snapshot.deck, "덱");
		await loadNoteTypes();
		setExistingValue(noteTypeSelect, snapshot.noteType, "노트 유형");
		await loadFields();
		setExistingValue(characterFieldSelect, snapshot.characterField, "한자 필드");
		await refreshStatus();
	}
}

function setExistingValue(select, value, label) {
	if (!Array.from(select.options).some((option) => option.value === value)) throw new Error(`저장된 ${label} '${value}'을(를) 사용할 수 없습니다`);
	select.value = value;
}

function setFileStatus(label, classes) {
	fileStatus.className = `tag is-medium ${classes}`;
	fileStatus.textContent = label;
}

async function storeHandle(handle) {
	try {
		const database = await openHandleDatabase();
		await new Promise((resolve, reject) => {
			const transaction = database.transaction(handleStore, "readwrite");
			transaction.objectStore(handleStore).put(handle, "selection");
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
		database.close();
	} catch {
		// The active session still keeps the file handle when IndexedDB is unavailable
	}
}

async function loadStoredHandle() {
	try {
		const database = await openHandleDatabase();
		const handle = await new Promise((resolve, reject) => {
			const request = database.transaction(handleStore).objectStore(handleStore).get("selection");
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
		database.close();
		return handle;
	} catch {
		return null;
	}
}

function openHandleDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(handleDatabase, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(handleStore);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function downloadJSON(contents) {
	const url = URL.createObjectURL(new Blob([contents], {type: "application/json"}));
	const link = document.createElement("a");
	link.href = url;
	link.download = "한자-선택.json";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function chooseUpload() {
	return new Promise((resolve, reject) => {
		const input = document.getElementById("openFileInput");
		input.value = "";
		input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new DOMException("선택한 파일이 없습니다", "AbortError"));
		input.click();
	});
}
