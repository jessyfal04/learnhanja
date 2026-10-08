import { initializeInsights, openInsights, renderInsights } from "./insights.js?v=21";
import { initializeCheonjamun, renderCheonjamun } from "./cheonjamun.js?v=8";
import { characterFieldChanged, clearSelection, loadCatalog, loadFields, loadIdiomFields, loadIdiomNoteTypes, loadMetadata, loadNoteTypes, refreshAuxiliaryStatus, refreshAuxiliaryStatuses, refreshIdiomStatus, refreshStatus, selectStatus } from "./anki.js?v=11";
import { autoSaveSelection, initializeFileSave, openBrowserFile, saveBrowserFile } from "./saves.js?v=5";
import { hideMessage } from "./ui.js";
import { initializeIdiomLevels, loadIdioms, renderIdioms } from "./idioms.js?v=17";
import { buildVocabulary, renderVocabulary, scheduleVocabulary } from "./vocab.js?v=8";
import { showView } from "./views.js?v=2";
import { initializeKnownWords } from "./known-words.js?v=1";
import { queryFieldID, queryFromSearch, urlWithQuery } from "./url-query.js?v=1";
import { initializeGames } from "./games.js?v=4";

let queryRoutingReady = false;
let queryRouteQueued = false;

function currentView() {
	return window.location.hash.slice(1);
}

function updateQueryURL(view, value) {
	if (currentView() !== view) return;
	const nextURL = urlWithQuery(window.location.href, value);
	window.history.replaceState(window.history.state, "", nextURL);
}

function applyLocationQuery(runSearch = false) {
	const view = currentView();
	const fieldID = queryFieldID(view);
	if (!fieldID) return;
	const query = queryFromSearch(window.location.search) ?? "";
	document.getElementById(fieldID).value = query;
	if (!runSearch) return;
	if (view === "vocabulary") renderVocabulary();
	if (view === "idioms") renderIdioms();
	if (view === "insights" && query.trim()) void openInsights(query);
}

function routeLocation() {
	showView(currentView());
	applyLocationQuery(queryRoutingReady);
}

function scheduleLocationRoute() {
	if (queryRouteQueued) return;
	queryRouteQueued = true;
	queueMicrotask(() => {
		queryRouteQueued = false;
		routeLocation();
	});
}

document.getElementById("messageClose").addEventListener("click", hideMessage);
document.getElementById("refreshAnkiButton").addEventListener("click", loadMetadata);
document.getElementById("deckSelect").addEventListener("change", loadNoteTypes);
document.getElementById("noteTypeSelect").addEventListener("change", loadFields);
document.getElementById("characterFieldSelect").addEventListener("change", characterFieldChanged);
document.getElementById("idiomDeckSelect").addEventListener("change", loadIdiomNoteTypes);
document.getElementById("idiomNoteTypeSelect").addEventListener("change", loadIdiomFields);
document.getElementById("refreshStatusButton").addEventListener("click", () => { void refreshStatus({autoSelect: true}); void refreshAuxiliaryStatuses(); });
document.getElementById("moyangDeckSelect").addEventListener("change", () => { void refreshAuxiliaryStatus("moyang"); });
document.getElementById("huneumDeckSelect").addEventListener("change", () => { void refreshAuxiliaryStatus("huneum"); });
document.getElementById("refreshIdiomStatusButton").addEventListener("click", refreshIdiomStatus);
document.getElementById("selectKnownButton").addEventListener("click", () => selectStatus("known"));
document.getElementById("selectNewButton").addEventListener("click", () => selectStatus("new"));
document.getElementById("clearSelectionButton").addEventListener("click", clearSelection);
document.getElementById("buildVocabButton").addEventListener("click", () => buildVocabulary());
document.addEventListener("hanja-selection-change", scheduleVocabulary);
document.addEventListener("hanja-known-words-change", renderVocabulary);
document.addEventListener("hanja-status-change", () => { renderVocabulary(); renderIdioms(); });
document.getElementById("vocabFilter").addEventListener("input", (event) => { renderVocabulary(); updateQueryURL("vocabulary", event.target.value); });
for (const id of ["vocabKnowledgeFilter", "vocabSort", "maxRank"]) document.getElementById(id).addEventListener("input", renderVocabulary);
document.getElementById("saveFileButton").addEventListener("click", saveBrowserFile);
document.getElementById("openFileButton").addEventListener("click", openBrowserFile);
document.addEventListener("hanja-selection-change", autoSaveSelection);
document.querySelector("#connectionTab a").addEventListener("click", (event) => { event.preventDefault(); showView("connection"); });
document.querySelector("#charactersTab a").addEventListener("click", (event) => { event.preventDefault(); showView("characters"); });
document.querySelector("#cheonjamunTab a").addEventListener("click", (event) => { event.preventDefault(); showView("cheonjamun"); });
document.querySelector("#vocabularyTab a").addEventListener("click", (event) => { event.preventDefault(); showView("vocabulary"); });
document.querySelector("#idiomsTab a").addEventListener("click", (event) => { event.preventDefault(); showView("idioms"); });
document.querySelector("#gamesTab a").addEventListener("click", (event) => { event.preventDefault(); showView("games"); });
document.getElementById("idiomFilter").addEventListener("input", (event) => { renderIdioms(); updateQueryURL("idioms", event.target.value); });
for (const id of ["idiomSourceFilter", "idiomLevelFilter", "idiomSort", "idiomSelectedOnly"]) document.getElementById(id).addEventListener("input", renderIdioms);
document.addEventListener("hanja-idiom-status-change", renderIdioms);

document.querySelector("#insightsTab a").addEventListener("click", (event) => { event.preventDefault(); showView("insights"); });
document.getElementById("insightInput").addEventListener("input", (event) => updateQueryURL("insights", event.target.value));
initializeCheonjamun();
initializeKnownWords();
initializeGames();
window.addEventListener("hashchange", scheduleLocationRoute);
window.addEventListener("popstate", scheduleLocationRoute);
applyLocationQuery();
showView(currentView());
initializeInsights();
await Promise.all([loadCatalog(), loadIdioms()]);
initializeIdiomLevels();
renderCheonjamun();
renderInsights();
queryRoutingReady = true;
applyLocationQuery(true);
await loadMetadata();
await initializeFileSave();
