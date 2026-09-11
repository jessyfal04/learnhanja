import { clearSelection, loadCatalog, loadFields, loadMetadata, loadNoteTypes, refreshStatus, selectStatus } from "./anki.js";
import { deleteLocal, loadLocal, openBrowserFile, refreshSaves, saveBrowserFile, saveLocal } from "./saves.js";
import { hideMessage } from "./ui.js";
import { buildVocabulary, renderVocabulary } from "./vocab.js";
import { showView } from "./views.js";

document.getElementById("messageClose").addEventListener("click", hideMessage);
document.getElementById("refreshAnkiButton").addEventListener("click", loadMetadata);
document.getElementById("deckSelect").addEventListener("change", loadNoteTypes);
document.getElementById("noteTypeSelect").addEventListener("change", loadFields);
document.getElementById("refreshStatusButton").addEventListener("click", refreshStatus);
document.getElementById("selectKnownButton").addEventListener("click", () => selectStatus("known"));
document.getElementById("selectNewButton").addEventListener("click", () => selectStatus("new"));
document.getElementById("clearSelectionButton").addEventListener("click", clearSelection);
document.getElementById("buildVocabButton").addEventListener("click", buildVocabulary);
for (const id of ["vocabFilter", "vocabSort", "maxRank"]) document.getElementById(id).addEventListener("input", renderVocabulary);
document.getElementById("saveLocalButton").addEventListener("click", saveLocal);
document.getElementById("loadLocalButton").addEventListener("click", loadLocal);
document.getElementById("deleteLocalButton").addEventListener("click", deleteLocal);
document.getElementById("saveFileButton").addEventListener("click", saveBrowserFile);
document.getElementById("openFileButton").addEventListener("click", openBrowserFile);
document.getElementById("refreshSavesButton").addEventListener("click", refreshSaves);
document.querySelector("#charactersTab a").addEventListener("click", (event) => { event.preventDefault(); showView("characters"); });
document.querySelector("#vocabularyTab a").addEventListener("click", (event) => { event.preventDefault(); showView("vocabulary"); });

showView(window.location.hash === "#vocabulary" ? "vocabulary" : "characters");
await loadCatalog();
await Promise.all([loadMetadata(), refreshSaves()]);
