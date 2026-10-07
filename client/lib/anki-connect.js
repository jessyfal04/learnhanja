const ankiConnectURL = "http://127.0.0.1:8765";
const apiVersion = 6;
const notesBatchSize = 500;

export async function ankiMetadata() {
	const permission = await invoke("requestPermission");
	if (permission?.permission !== "granted") throw new Error("앙키 연결 권한이 거부되었습니다");
	const [decks, noteTypes] = await Promise.all([invoke("deckNames"), invoke("modelNames")]);
	return {
		connected: true,
		version: permission.version || apiVersion,
		decks: [...(decks || [])].sort(),
		noteTypes: [...(noteTypes || [])].sort(),
	};
}

export async function ankiNoteTypes(deck) {
	const noteTypes = await invoke("modelNames");
	const matches = [];
	for (const noteType of noteTypes || []) {
		const ids = await findNotes(`deck:"${escapeQuery(deck)}" note:"${escapeQuery(noteType)}"`);
		if (ids.length > 0) matches.push(noteType);
	}
	return matches.sort();
}

export async function ankiFields(noteType) {
	return invoke("modelFieldNames", {modelName: String(noteType || "").trim()});
}

export async function ankiOpenDeck(deck) {
	const name = String(deck || "").trim();
	if (!name) throw new Error("열 앙키 덱이 없습니다");
	if (await invoke("guiDeckOverview", {name}) !== true) throw new Error(`앙키에서 '${name}' 덱을 열 수 없습니다`);
}

export async function ankiCharacterStatus(config) {
	const data = await loadStatusData(config.deck, config.noteType, config.field, "한자");
	return buildCharacterStatus(data.notes, config.field, data.known, data.newCards, data.suspended);
}

export async function ankiIdiomStatus(config) {
	const data = await loadStatusData(config.deck, config.noteType, config.field, "사자성어");
	return buildIdiomStatus(data.notes, config.field, data.known, data.newCards, data.suspended);
}

async function loadStatusData(deck, noteType, field, fieldLabel) {
	deck = String(deck || "").trim();
	noteType = String(noteType || "").trim();
	field = String(field || "").trim();
	if (!deck || !noteType || !field) throw new Error(`덱, 노트 유형, ${fieldLabel} 필드가 필요합니다`);
	const fields = await ankiFields(noteType);
	if (!fields.includes(field)) throw new Error(`${fieldLabel} 필드 '${field}'을(를) 찾을 수 없습니다`);
	const query = `deck:"${escapeQuery(deck)}" note:"${escapeQuery(noteType)}"`;
	const [allIDs, knownIDs, newIDs, suspendedIDs] = await Promise.all([
		findNotes(query),
		findNotes(`${query} -is:new`),
		findNotes(`${query} is:new`),
		findNotes(`${query} is:suspended`),
	]);
	return {
		notes: await notesInfo(allIDs),
		known: new Set(knownIDs),
		newCards: new Set(newIDs),
		suspended: new Set(suspendedIDs),
	};
}

export function buildCharacterStatus(notes, field, known, newCards, suspended) {
	const aggregates = new Map();
	for (const note of notes || []) {
		for (const character of extractHanja(note.fields?.[field]?.value || "")) {
			accumulate(aggregates, character, note.noteId, known, newCards, suspended);
		}
	}
	return finishStatus(aggregates, "characters");
}

export function buildIdiomStatus(notes, field, known, newCards, suspended) {
	const aggregates = new Map();
	for (const note of notes || []) {
		const idiom = cleanField(note.fields?.[field]?.value || "").normalize("NFKC");
		if (idiom) accumulate(aggregates, idiom, note.noteId, known, newCards, suspended);
	}
	return finishStatus(aggregates, "idioms");
}

function accumulate(aggregates, key, noteID, known, newCards, suspended) {
	const value = aggregates.get(key) || {noteCount: 0, knownActive: false, newActive: false, knownSuspended: false, newSuspended: false};
	const isSuspended = suspended.has(noteID);
	value.noteCount++;
	if (known.has(noteID)) value[isSuspended ? "knownSuspended" : "knownActive"] = true;
	if (newCards.has(noteID)) value[isSuspended ? "newSuspended" : "newActive"] = true;
	aggregates.set(key, value);
}

function finishStatus(aggregates, property) {
	const values = {};
	const result = {[property]: values, known: 0, new: 0, unknown: 0, total: 0};
	for (const [key, aggregate] of aggregates) {
		let status = "unknown";
		let suspended = false;
		if (aggregate.knownActive) status = "known";
		else if (aggregate.newActive) status = "new";
		else if (aggregate.knownSuspended) {
			status = "known";
			suspended = true;
		} else if (aggregate.newSuspended) {
			status = "new";
			suspended = true;
		}
		result[status]++;
		result.total++;
		values[key] = {status, suspended, noteCount: aggregate.noteCount};
	}
	return result;
}

async function findNotes(query) {
	return invoke("findNotes", {query});
}

async function notesInfo(ids) {
	const notes = [];
	for (let start = 0; start < ids.length; start += notesBatchSize) {
		const batch = await invoke("notesInfo", {notes: ids.slice(start, start + notesBatchSize)});
		notes.push(...batch);
	}
	return notes;
}

async function invoke(action, params = {}) {
	const payload = {action, version: apiVersion, params};
	let response;
	try {
		response = await fetch(ankiConnectURL, {
			method: "POST",
			body: JSON.stringify(payload),
		});
	} catch {
		throw new Error("로컬 앙키커넥트에 연결할 수 없습니다");
	}
	if (!response.ok) throw new Error(`앙키커넥트 요청에 실패했습니다 (${response.status})`);
	const envelope = await response.json();
	if (envelope.error) throw new Error(`앙키커넥트: ${envelope.error}`);
	return envelope.result;
}

function cleanField(value) {
	if (typeof document !== "undefined") {
		const element = document.createElement("template");
		element.innerHTML = String(value || "");
		return (element.content.textContent || "").trim();
	}
	return String(value || "").replace(/<[^>]*>/gu, "").trim();
}

function extractHanja(value) {
	return Array.from(new Set(Array.from(cleanField(value).normalize("NFKC")).filter((character) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character))));
}

function escapeQuery(value) {
	return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
