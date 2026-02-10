// D&D 5e Encounter Builder - Iteration 4
// Adds encounter saving, refinement controls, and library management

// App state
const AppState = {
	monsters: [], // Cached monster data with roles
	currentEncounter: null,
	isFetching: false,
	error: null,
	themeFallback: false,
	styleMatchResult: "any", // Track style matching result
	savedEncounters: [], // NEW: Saved encounters array
	viewState: "idle", // NEW: Track current view state
};

// LocalStorage key for saved encounters
const STORAGE_KEY = "dndEncounterBuilder_savedEncounters";

// DOM Elements
const dom = {
	// Input elements
	partyLevelInput: document.getElementById("party-level"),
	partySizeInput: document.getElementById("party-size"),
	themeSelect: document.getElementById("theme"),
	difficultySelect: document.getElementById("difficulty"),
	encounterStyleSelect: document.getElementById("encounter-style"),
	preferVarietyCheckbox: document.getElementById("prefer-variety"),
	lockThemeCheckbox: document.getElementById("lock-theme"),
	lockStyleCheckbox: document.getElementById("lock-style"),

	// Buttons
	generateBtn: document.getElementById("generate-btn"),
	regenerateBtn: document.getElementById("regenerate-btn"),
	libraryBtn: document.getElementById("library-btn"),
	retryBtn: document.getElementById("retry-btn"),
	adjustParamsBtn: document.getElementById("adjust-params-btn"),
	saveEncounterBtn: document.getElementById("save-encounter-btn"),
	clearLibraryBtn: document.getElementById("clear-library-btn"),
	backToGeneratorBtn: document.getElementById("back-to-generator-btn"),
	startGeneratingBtn: document.getElementById("start-generating-btn"),
	closeLibraryBtn: document.getElementById("close-library-btn"),

	// Confirmation modal elements
	confirmCancelBtn: document.getElementById("confirm-cancel-btn"),
	confirmOkBtn: document.getElementById("confirm-ok-btn"),
	closeConfirmModal: document.getElementById("close-confirm-modal"),

	// UI Containers
	loadingState: document.getElementById("loading-state"),
	errorState: document.getElementById("error-state"),
	resultsDisplay: document.getElementById("results-display"),
	libraryDisplay: document.getElementById("library-display"),
	libraryEmpty: document.getElementById("library-empty"),
	libraryContent: document.getElementById("library-content"),

	// Summary elements
	summaryLevel: document.getElementById("summary-level"),
	summarySize: document.getElementById("summary-size"),
	summaryTheme: document.getElementById("summary-theme"),
	summaryDifficulty: document.getElementById("summary-difficulty"),
	summaryStyle: document.getElementById("summary-style"),
	summaryStyleMatch: document.getElementById("summary-style-match"),
	summaryVariety: document.getElementById("summary-variety"),
	summaryMonsterCount: document.getElementById("summary-monster-count"),
	summaryBaseXP: document.getElementById("summary-base-xp"),
	summaryMultiplier: document.getElementById("summary-multiplier"),
	summaryAdjustedXP: document.getElementById("summary-adjusted-xp"),
	summaryTargetXP: document.getElementById("summary-target-xp"),
	themeFallbackNote: document.getElementById("theme-fallback"),
	resultLabel: document.getElementById("result-label"),
	savedCount: document.getElementById("saved-count"),

	// Monster container
	monstersContainer: document.getElementById("monsters-container"),

	// Library container
	encountersGrid: document.getElementById("encounters-grid"),

	// Modal elements
	monsterModal: document.getElementById("monster-modal"),
	confirmModal: document.getElementById("confirm-modal"),
	closeModalBtn: document.getElementById("close-modal"),
	modalMonsterName: document.getElementById("modal-monster-name"),
	modalRole: document.getElementById("modal-role"),
	modalCr: document.getElementById("modal-cr"),
	modalXp: document.getElementById("modal-xp"),
	modalType: document.getElementById("modal-type"),
	modalSize: document.getElementById("modal-size"),
	modalAc: document.getElementById("modal-ac"),
	modalHp: document.getElementById("modal-hp"),
	modalSpeed: document.getElementById("modal-speed"),
	open5eLink: document.getElementById("open5e-link"),
	confirmTitle: document.getElementById("confirm-title"),
	confirmMessage: document.getElementById("confirm-message"),

	// Error message
	errorMessage: document.getElementById("error-message"),
};

// XP Thresholds by Character Level (DMG p.82) - UNCHANGED from Iteration 2
const XP_THRESHOLDS = {
	1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
	2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
	3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
	4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
	5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
	6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
	7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
	8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
	9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
	10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
};

// Monster XP by CR (DMG p.275) - UNCHANGED from Iteration 2
const CR_TO_XP = {
	0: 10,
	"1/8": 25,
	"1/4": 50,
	"1/2": 100,
	1: 200,
	2: 450,
	3: 700,
	4: 1100,
	5: 1800,
	6: 2300,
	7: 2900,
	8: 3900,
	9: 5000,
	10: 5900,
	11: 7200,
	12: 8400,
	13: 10000,
	14: 11500,
	15: 13000,
	16: 15000,
	17: 18000,
	18: 20000,
	19: 22000,
	20: 25000,
};

// Encounter Multipliers (DMG p.82) - UNCHANGED from Iteration 2
const ENCOUNTER_MULTIPLIERS = {
	1: 1,
	2: 1.5,
	3: 2,
	4: 2,
	5: 2,
	6: 2,
	7: 2.5,
	8: 2.5,
	9: 2.5,
	10: 2.5,
	11: 3,
	12: 3,
	13: 3,
	14: 3,
	15: 4,
};

// Tolerance for success (±15%) - UNCHANGED from Iteration 2
const TOLERANCE = 0.15;
const MAX_ATTEMPTS = 600; // Increased from 300 for better quality
const MIN_ATTEMPTS = 100; // Increased from 50

// Role definitions for encounter styles
const ENCOUNTER_STYLES = {
	any: "Any",
	bruisers: "Bruisers",
	skirmish: "Skirmish",
	spellcasters: "Spellcasters",
	swarm: "Swarm",
};

// NEW in Iteration 4: Single source of truth for UI state management
function setView(state) {
	// Reset all view states first with absolute certainty
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsDisplay.classList.add("hidden");
	dom.libraryDisplay.classList.add("hidden");

	// Reset button states
	dom.generateBtn.disabled = false;
	dom.generateBtn.innerHTML =
		'<i class="fas fa-dice-d20"></i> Generate Encounter';
	AppState.isFetching = false;
	AppState.viewState = state;

	// Show the correct state
	switch (state) {
		case "loading":
			dom.loadingState.classList.remove("hidden");
			dom.generateBtn.disabled = true;
			dom.generateBtn.innerHTML =
				'<i class="fas fa-spinner fa-spin"></i> Generating...';
			AppState.isFetching = true;
			dom.libraryBtn.disabled = true;
			dom.saveEncounterBtn.disabled = true;
			break;

		case "error":
			dom.errorState.classList.remove("hidden");
			dom.regenerateBtn.disabled = false;
			dom.libraryBtn.disabled = false;
			break;

		case "results":
			dom.resultsDisplay.classList.remove("hidden");
			dom.regenerateBtn.disabled = false;
			dom.libraryBtn.disabled = false;
			dom.saveEncounterBtn.disabled = false;
			dom.closeLibraryBtn.classList.add("hidden");
			break;

		case "library":
			dom.libraryDisplay.classList.remove("hidden");
			dom.libraryBtn.disabled = true;
			dom.generateBtn.disabled = false;
			dom.regenerateBtn.disabled = true;
			dom.closeLibraryBtn.classList.remove("hidden");
			renderLibraryView();
			break;

		case "idle":
		default:
			dom.regenerateBtn.disabled = true;
			dom.libraryBtn.disabled = false;
			dom.saveEncounterBtn.disabled = true;
			break;
	}
}

// Initialise the app
function init() {
	// Event listeners for generation
	dom.generateBtn.addEventListener("click", generateEncounter);
	dom.regenerateBtn.addEventListener("click", regenerateEncounter);
	dom.retryBtn.addEventListener("click", generateEncounter);
	dom.adjustParamsBtn.addEventListener("click", () => setView("idle"));

	// Event listeners for library and saving
	dom.libraryBtn.addEventListener("click", () => setView("library"));
	dom.saveEncounterBtn.addEventListener("click", saveCurrentEncounter);
	dom.clearLibraryBtn.addEventListener("click", showClearLibraryConfirmation);
	dom.backToGeneratorBtn.addEventListener("click", () => setView("idle"));
	dom.startGeneratingBtn.addEventListener("click", () => setView("idle"));
	dom.closeLibraryBtn.addEventListener("click", () => {
		if (AppState.currentEncounter) {
			setView("results");
		} else {
			setView("idle");
		}
	});

	// Modal event listeners
	dom.closeModalBtn.addEventListener("click", () =>
		hideModal(dom.monsterModal),
	);
	dom.closeConfirmModal.addEventListener("click", () =>
		hideModal(dom.confirmModal),
	);

	// Close modals when clicking outside
	dom.monsterModal.addEventListener("click", (e) => {
		if (e.target === dom.monsterModal) hideModal(dom.monsterModal);
	});

	dom.confirmModal.addEventListener("click", (e) => {
		if (e.target === dom.confirmModal) hideModal(dom.confirmModal);
	});

	// Confirmation modal actions
	dom.confirmCancelBtn.addEventListener("click", () =>
		hideModal(dom.confirmModal),
	);
	dom.confirmOkBtn.addEventListener("click", handleConfirmAction);

	// Set initial values
	dom.themeSelect.value = "any";
	dom.difficultySelect.value = "medium";
	dom.encounterStyleSelect.value = "any";
	dom.preferVarietyCheckbox.checked = true;
	dom.lockThemeCheckbox.checked = false;
	dom.lockStyleCheckbox.checked = false;

	// Load saved encounters from localStorage
	loadSavedEncounters();

	// Set initial view state
	setView("idle");

	console.log("D&D 5e Encounter Builder - Iteration 4 initialised");
}

// NEW in Iteration 4: Load saved encounters from localStorage
function loadSavedEncounters() {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			AppState.savedEncounters = JSON.parse(saved);
			console.log(`Loaded ${AppState.savedEncounters.length} saved encounters`);
		} else {
			AppState.savedEncounters = [];
			console.log("No saved encounters found in localStorage");
		}
	} catch (error) {
		console.error("Error loading saved encounters:", error);
		AppState.savedEncounters = [];
	}
}

// NEW in Iteration 4: Save encounters to localStorage
function saveEncounterToStorage() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.savedEncounters));
		console.log(
			`Saved ${AppState.savedEncounters.length} encounters to localStorage`,
		);
	} catch (error) {
		console.error("Error saving encounters to localStorage:", error);
		alert("Failed to save encounter. LocalStorage may be full or unavailable.");
	}
}

// NEW in Iteration 4: Prepare encounter data for saving
function prepareEncounterForSave() {
	if (!AppState.currentEncounter) {
		throw new Error("No encounter to save");
	}

	const {
		partyLevel,
		partySize,
		theme,
		difficulty,
		selectedStyle,
		targetXP,
		encounter,
	} = AppState.currentEncounter;
	const { monsters, adjustedXP, styleMatch, variety, success } = encounter;
	const { baseXP, multiplier } = calculateEncounterXP(monsters);

	// Extract essential monster data (keep it lightweight)
	const monsterData = monsters.map((monster) => ({
		name: monster.name,
		slug: monster.slug || "",
		cr: monster.cr || monster.challenge_rating || "Unknown",
		xp: getMonsterXP(monster),
		role: monster.role || "unknown",
		type: monster.type || "Unknown",
		size: monster.size || "Unknown",
		ac: monster.armor_class || monster.armour_class || "Unknown",
		hp: monster.hit_points || "Unknown",
		speed: monster.speed_formatted || "Unknown",
	}));

	// Create save object
	return {
		id:
			"encounter_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
		timestamp: Date.now(),
		dateString: new Date().toLocaleDateString("en-GB", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}),

		// Input parameters
		inputs: {
			partyLevel,
			partySize,
			theme,
			difficulty,
			selectedStyle,
			preferVariety: dom.preferVarietyCheckbox.checked,
			lockTheme: dom.lockThemeCheckbox.checked,
			lockStyle: dom.lockStyleCheckbox.checked,
			themeFallback: AppState.themeFallback,
		},

		// Encounter data
		encounter: {
			monsters: monsterData,
			monsterCount: monsters.length,
			baseXP,
			multiplier,
			adjustedXP,
			targetXP,
			xpDeviation: (Math.abs(adjustedXP - targetXP) / targetXP) * 100,
			xpDeviationType:
				adjustedXP > targetXP
					? "over"
					: adjustedXP < targetXP
						? "under"
						: "exact",

			// Quality metrics
			styleMatch: {
				level: styleMatch.level,
				matchedCount: styleMatch.matchedCount || 0,
			},
			variety: {
				preferred: variety.preferred,
				hasDuplicates: variety.hasDuplicates || false,
				reason: variety.reason || "not-applicable",
			},
			success: success || false,
		},

		// Result label (for display)
		resultLabel: success ? "On target" : "Closest match",
	};
}

// NEW in Iteration 4: Save current encounter
function saveCurrentEncounter() {
	try {
		if (!AppState.currentEncounter) {
			alert("No encounter to save. Please generate an encounter first.");
			return;
		}

		const encounterToSave = prepareEncounterForSave();

		// Add to saved encounters
		AppState.savedEncounters.unshift(encounterToSave); // Add to beginning (most recent first)

		// Save to localStorage
		saveEncounterToStorage();

		// Update UI
		dom.saveEncounterBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
		dom.saveEncounterBtn.disabled = true;

		// Reset button after 2 seconds
		setTimeout(() => {
			if (dom.saveEncounterBtn) {
				dom.saveEncounterBtn.innerHTML =
					'<i class="fas fa-save"></i> Save Encounter';
				dom.saveEncounterBtn.disabled = false;
			}
		}, 2000);

		console.log("Encounter saved with ID:", encounterToSave.id);
	} catch (error) {
		console.error("Error saving encounter:", error);
		alert("Failed to save encounter: " + error.message);
	}
}

// NEW in Iteration 4: Delete individual encounter
function deleteSavedEncounter(encounterId) {
	const initialLength = AppState.savedEncounters.length;
	AppState.savedEncounters = AppState.savedEncounters.filter(
		(encounter) => encounter.id !== encounterId,
	);

	if (AppState.savedEncounters.length < initialLength) {
		saveEncounterToStorage();
		console.log("Deleted encounter with ID:", encounterId);
		return true;
	}

	return false;
}

// NEW in Iteration 4: Clear all saved encounters
function clearEncounterLibrary() {
	AppState.savedEncounters = [];
	saveEncounterToStorage();
	console.log("Cleared all saved encounters");
}

// NEW in Iteration 4: Show confirmation modal
let pendingAction = null;

function showClearLibraryConfirmation() {
	if (AppState.savedEncounters.length === 0) {
		alert("No saved encounters to clear.");
		return;
	}

	dom.confirmTitle.textContent = "Clear All Saved Encounters";
	dom.confirmMessage.textContent = `Are you sure you want to permanently delete all ${AppState.savedEncounters.length} saved encounters? This action cannot be undone.`;

	pendingAction = {
		type: "clearLibrary",
		data: null,
	};

	showModal(dom.confirmModal);
}

// NEW in Iteration 4: Show delete confirmation
function showDeleteConfirmation(encounterId, encounterName) {
	dom.confirmTitle.textContent = "Delete Saved Encounter";
	dom.confirmMessage.textContent = `Are you sure you want to delete the encounter "${encounterName}"? This action cannot be undone.`;

	pendingAction = {
		type: "deleteEncounter",
		data: encounterId,
	};

	showModal(dom.confirmModal);
}

// NEW in Iteration 4: Handle confirmation actions
function handleConfirmAction() {
	if (!pendingAction) {
		hideModal(dom.confirmModal);
		return;
	}

	switch (pendingAction.type) {
		case "clearLibrary":
			clearEncounterLibrary();
			renderLibraryView();
			break;

		case "deleteEncounter":
			if (deleteSavedEncounter(pendingAction.data)) {
				renderLibraryView();
			}
			break;
	}

	pendingAction = null;
	hideModal(dom.confirmModal);
}

// NEW in Iteration 4: Render library view
function renderLibraryView() {
	if (AppState.savedEncounters.length === 0) {
		dom.libraryEmpty.classList.remove("hidden");
		dom.libraryContent.classList.add("hidden");
		dom.savedCount.textContent = "0";
	} else {
		dom.libraryEmpty.classList.add("hidden");
		dom.libraryContent.classList.remove("hidden");
		dom.savedCount.textContent = AppState.savedEncounters.length.toString();

		// Clear current grid
		dom.encountersGrid.innerHTML = "";

		// Render each saved encounter
		AppState.savedEncounters.forEach((encounter) => {
			const encounterCard = document.createElement("div");
			encounterCard.className = "encounter-card";

			// Calculate XP deviation display
			const deviation = encounter.encounter.xpDeviation;
			const deviationType = encounter.encounter.xpDeviationType;
			let deviationText = "";
			let deviationClass = "";

			if (deviation < 0.1) {
				// Less than 0.1% difference
				deviationText = "Exactly on target";
				deviationClass = "exact";
			} else {
				const percentage = deviation.toFixed(1);
				if (deviationType === "over") {
					deviationText = `+${percentage}% over target`;
					deviationClass = "over";
				} else {
					deviationText = `-${percentage}% under target`;
					deviationClass = "under";
				}
			}

			// Get style match text
			let styleMatchText = "Any";
			if (encounter.inputs.selectedStyle !== "any") {
				switch (encounter.encounter.styleMatch.level) {
					case "matched":
						styleMatchText = "Matched";
						break;
					case "partial":
						styleMatchText = "Partial";
						break;
					case "fell-back":
						styleMatchText = "Fell back";
						break;
				}
			}

			encounterCard.innerHTML = `
                <div class="encounter-card-header">
                    <div>
                        <div class="encounter-card-title">
                            ${encounter.inputs.theme === "any" ? "Any Theme" : encounter.inputs.theme.charAt(0).toUpperCase() + encounter.inputs.theme.slice(1)} 
                            ${encounter.inputs.selectedStyle === "any" ? "" : " • " + ENCOUNTER_STYLES[encounter.inputs.selectedStyle]}
                        </div>
                        <div class="encounter-card-date">${encounter.dateString}</div>
                    </div>
                    <button class="encounter-card-delete" data-id="${encounter.id}" title="Delete encounter">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="encounter-card-details">
                    <div class="encounter-card-detail">
                        <span class="encounter-card-label">Difficulty:</span>
                        <span class="encounter-card-value">${encounter.inputs.difficulty.charAt(0).toUpperCase() + encounter.inputs.difficulty.slice(1)}</span>
                    </div>
                    <div class="encounter-card-detail">
                        <span class="encounter-card-label">Party:</span>
                        <span class="encounter-card-value">Level ${encounter.inputs.partyLevel} × ${encounter.inputs.partySize}</span>
                    </div>
                    <div class="encounter-card-detail">
                        <span class="encounter-card-label">Style Match:</span>
                        <span class="encounter-card-value">${styleMatchText}</span>
                    </div>
                    <div class="encounter-card-detail">
                        <span class="encounter-card-label">Monsters:</span>
                        <span class="encounter-card-value">${encounter.encounter.monsterCount}</span>
                    </div>
                </div>
                <div class="encounter-card-xp">
                    <div class="encounter-card-xp-item">
                        <span class="encounter-card-label">Adjusted XP:</span>
                        <span class="encounter-card-value">${encounter.encounter.adjustedXP.toLocaleString()}</span>
                    </div>
                    <div class="encounter-card-xp-item">
                        <span class="encounter-card-label">Target XP:</span>
                        <span class="encounter-card-value">${encounter.encounter.targetXP.toLocaleString()}</span>
                    </div>
                    <div class="encounter-card-deviation ${deviationClass}">
                        ${deviationText}
                    </div>
                </div>
                <div class="encounter-card-actions">
                    <button class="btn-secondary view-encounter-btn" data-id="${encounter.id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn-secondary regenerate-from-btn" data-id="${encounter.id}">
                        <i class="fas fa-redo"></i> Regenerate
                    </button>
                </div>
            `;

			dom.encountersGrid.appendChild(encounterCard);

			// Add event listeners to buttons
			const deleteBtn = encounterCard.querySelector(".encounter-card-delete");
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				showDeleteConfirmation(
					encounter.id,
					`${encounter.inputs.theme} ${encounter.inputs.selectedStyle !== "any" ? ENCOUNTER_STYLES[encounter.inputs.selectedStyle] : ""}`,
				);
			});

			const viewBtn = encounterCard.querySelector(".view-encounter-btn");
			viewBtn.addEventListener("click", () => viewSavedEncounter(encounter.id));

			const regenerateBtn = encounterCard.querySelector(".regenerate-from-btn");
			regenerateBtn.addEventListener("click", () =>
				regenerateFromSavedEncounter(encounter.id),
			);
		});
	}
}

// NEW in Iteration 4: View saved encounter details
function viewSavedEncounter(encounterId) {
	const encounter = AppState.savedEncounters.find((e) => e.id === encounterId);
	if (!encounter) {
		alert("Encounter not found.");
		return;
	}

	// Restore input values
	dom.partyLevelInput.value = encounter.inputs.partyLevel;
	dom.partySizeInput.value = encounter.inputs.partySize;
	dom.themeSelect.value = encounter.inputs.theme;
	dom.difficultySelect.value = encounter.inputs.difficulty;
	dom.encounterStyleSelect.value = encounter.inputs.selectedStyle;
	dom.preferVarietyCheckbox.checked = encounter.inputs.preferVariety;
	dom.lockThemeCheckbox.checked = encounter.inputs.lockTheme;
	dom.lockStyleCheckbox.checked = encounter.inputs.lockStyle;

	// Create a mock current encounter for display
	// Note: We can't fully recreate the original monster objects, but we can display the saved data
	AppState.currentEncounter = {
		partyLevel: encounter.inputs.partyLevel,
		partySize: encounter.inputs.partySize,
		theme: encounter.inputs.theme,
		difficulty: encounter.inputs.difficulty,
		selectedStyle: encounter.inputs.selectedStyle,
		targetXP: encounter.encounter.targetXP,
		encounter: {
			monsters: encounter.encounter.monsters.map((m) => ({
				name: m.name,
				slug: m.slug,
				cr: m.cr,
				role: m.role,
				type: m.type,
				size: m.size,
				armor_class: m.ac,
				hit_points: m.hp,
				speed_formatted: m.speed,
				// Add dummy functions for compatibility
				challenge_rating: m.cr,
				armour_class: m.ac,
			})),
			adjustedXP: encounter.encounter.adjustedXP,
			styleMatch: encounter.encounter.styleMatch,
			variety: encounter.encounter.variety,
			success: encounter.encounter.success,
		},
	};

	AppState.themeFallback = encounter.inputs.themeFallback;

	// Render the encounter display
	renderEncounterFromSaved(encounter);
	setView("results");
}

// NEW in Iteration 4: Render saved encounter (simplified version)
function renderEncounterFromSaved(savedEncounter) {
	const encounter = AppState.currentEncounter.encounter;

	// Update summary
	dom.summaryLevel.textContent = savedEncounter.inputs.partyLevel;
	dom.summarySize.textContent = `${savedEncounter.inputs.partySize} adventurer${savedEncounter.inputs.partySize !== 1 ? "s" : ""}`;
	dom.summaryTheme.textContent =
		savedEncounter.inputs.theme === "any"
			? "Any (Random)"
			: savedEncounter.inputs.theme.charAt(0).toUpperCase() +
				savedEncounter.inputs.theme.slice(1);
	dom.summaryDifficulty.textContent =
		savedEncounter.inputs.difficulty.charAt(0).toUpperCase() +
		savedEncounter.inputs.difficulty.slice(1);
	dom.summaryStyle.textContent =
		ENCOUNTER_STYLES[savedEncounter.inputs.selectedStyle] || "Any";

	// Style match display with color coding
	dom.summaryStyleMatch.textContent =
		savedEncounter.encounter.styleMatch.level === "matched"
			? "Matched"
			: savedEncounter.encounter.styleMatch.level === "partial"
				? "Partial"
				: savedEncounter.encounter.styleMatch.level === "fell-back"
					? "Fell back"
					: "Any";
	dom.summaryStyleMatch.className =
		"summary-value " + savedEncounter.encounter.styleMatch.level;

	// Variety display
	if (savedEncounter.encounter.variety.preferred) {
		dom.summaryVariety.textContent = savedEncounter.encounter.variety
			.hasDuplicates
			? "Some duplicates"
			: "No duplicates";
	} else {
		dom.summaryVariety.textContent = "Not preferred";
	}

	dom.summaryMonsterCount.textContent = savedEncounter.encounter.monsterCount;
	dom.summaryBaseXP.textContent =
		savedEncounter.encounter.baseXP.toLocaleString() + " XP";
	dom.summaryMultiplier.textContent = `×${savedEncounter.encounter.multiplier}`;
	dom.summaryAdjustedXP.textContent =
		savedEncounter.encounter.adjustedXP.toLocaleString() + " XP";
	dom.summaryTargetXP.textContent =
		savedEncounter.encounter.targetXP.toLocaleString() + " XP";

	// Show theme fallback note if applicable
	if (savedEncounter.inputs.themeFallback) {
		dom.themeFallbackNote.classList.remove("hidden");
	} else {
		dom.themeFallbackNote.classList.add("hidden");
	}

	// Update result label
	dom.resultLabel.innerHTML = "";
	dom.resultLabel.className = "result-label";

	const percentageDiff = savedEncounter.encounter.xpDeviation / 100; // Convert back to decimal
	const xpOnTarget = percentageDiff <= TOLERANCE;
	const styleOnTarget =
		savedEncounter.inputs.selectedStyle === "any" ||
		savedEncounter.encounter.styleMatch.level === "matched";

	if (xpOnTarget && styleOnTarget) {
		dom.resultLabel.classList.add("success");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-check-circle"></i> On target (XP and style)';
	} else if (xpOnTarget) {
		dom.resultLabel.classList.add("success");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-check-circle"></i> On target (XP only)';
	} else if (styleOnTarget) {
		dom.resultLabel.classList.add("warning");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Closest match (style good, XP off)';
	} else {
		dom.resultLabel.classList.add("warning");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Closest match (both XP and style off)';
	}

	// Clear previous monsters
	dom.monstersContainer.innerHTML = "";

	// Render each monster card
	savedEncounter.encounter.monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

		// Role class for styling
		const roleClass = `role-${monster.role}`;

		monsterCard.innerHTML = `
            <div class="monster-header">
                <h3 class="monster-name">${monster.name}</h3>
                <span class="monster-cr">CR: ${formatCR(monster.cr)}</span>
                <span class="monster-xp">${monster.xp.toLocaleString()} XP</span>
                <div class="monster-role ${roleClass}">${monster.role.charAt(0).toUpperCase() + monster.role.slice(1)}</div>
            </div>
            <div class="monster-body">
                <div class="monster-detail">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${monster.type}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Size</span>
                    <span class="detail-value">${monster.size}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Armour Class</span>
                    <span class="detail-value">${monster.ac}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Hit Points</span>
                    <span class="detail-value">${monster.hp}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Speed</span>
                    <span class="detail-value">${monster.speed}</span>
                </div>
                <button class="view-details-btn" data-index="${index}">
                    <i class="fas fa-search"></i> View Details
                </button>
            </div>
        `;

		dom.monstersContainer.appendChild(monsterCard);

		// Add event listener to the view details button
		const viewDetailsBtn = monsterCard.querySelector(".view-details-btn");
		viewDetailsBtn.addEventListener("click", () => {
			showSavedMonsterModal(monster);
		});
	});
}

// NEW in Iteration 4: Show modal for saved monster
function showSavedMonsterModal(monster) {
	dom.modalMonsterName.textContent = monster.name;
	dom.modalRole.textContent =
		monster.role.charAt(0).toUpperCase() + monster.role.slice(1);
	dom.modalCr.textContent = formatCR(monster.cr);
	dom.modalXp.textContent = monster.xp.toLocaleString() + " XP";
	dom.modalType.textContent = monster.type;
	dom.modalSize.textContent = monster.size;
	dom.modalAc.textContent = monster.ac;
	dom.modalHp.textContent = monster.hp;
	dom.modalSpeed.textContent = monster.speed;

	// Set Open5e link if slug is available
	if (monster.slug) {
		dom.open5eLink.href = `https://open5e.com/monsters/${monster.slug}`;
	} else {
		// Fallback to search
		dom.open5eLink.href = `https://open5e.com/monsters/?search=${encodeURIComponent(monster.name)}`;
	}

	showModal(dom.monsterModal);
}

// NEW in Iteration 4: Regenerate from saved encounter
function regenerateFromSavedEncounter(encounterId) {
	const savedEncounter = AppState.savedEncounters.find(
		(e) => e.id === encounterId,
	);
	if (!savedEncounter) {
		alert("Encounter not found.");
		return;
	}

	// Restore input values
	dom.partyLevelInput.value = savedEncounter.inputs.partyLevel;
	dom.partySizeInput.value = savedEncounter.inputs.partySize;
	dom.themeSelect.value = savedEncounter.inputs.theme;
	dom.difficultySelect.value = savedEncounter.inputs.difficulty;
	dom.encounterStyleSelect.value = savedEncounter.inputs.selectedStyle;
	dom.preferVarietyCheckbox.checked = savedEncounter.inputs.preferVariety;
	dom.lockThemeCheckbox.checked = savedEncounter.inputs.lockTheme;
	dom.lockStyleCheckbox.checked = savedEncounter.inputs.lockStyle;

	// Generate new encounter with same parameters
	generateEncounter();
}

// Show modal helper function
function showModal(modalElement) {
	modalElement.classList.remove("hidden");
}

function hideModal(modalElement) {
	modalElement.classList.add("hidden");
}

// Robust speed parsing helper for Open5e's varied speed formats
function parseMonsterSpeed(speed) {
	// Default values
	let speedText = "";
	let speedValue = 0;
	let speedFormatted = "";

	try {
		// Case 1: speed is undefined or null
		if (!speed) {
			return { speedText: "", speedValue: 0, speedFormatted: "Unknown" };
		}

		// Case 2: speed is a string (e.g., "30 ft., fly 60 ft.")
		if (typeof speed === "string") {
			speedText = speed.toLowerCase();
			speedFormatted = speed;

			// Extract first number from the string
			const match = speedText.match(/\d+/);
			if (match) {
				speedValue = parseInt(match[0]);
			}
		}

		// Case 3: speed is an object (e.g., {walk: "30 ft.", fly: "60 ft."})
		else if (typeof speed === "object" && !Array.isArray(speed)) {
			// Build a formatted string from all speed types
			const parts = [];
			for (const [type, value] of Object.entries(speed)) {
				if (value) {
					parts.push(`${type} ${value}`);

					// For text search, add to speedText
					if (typeof value === "string") {
						speedText += ` ${type} ${value.toLowerCase()}`;
					} else {
						speedText += ` ${type} ${value}`;
					}
				}
			}

			speedFormatted = parts.join(", ");
			speedText = speedText.toLowerCase().trim();

			// Try to get walk speed first, then first numeric value
			if (speed.walk) {
				const walkMatch = speed.walk.toString().match(/\d+/);
				if (walkMatch) speedValue = parseInt(walkMatch[0]);
			} else {
				// Look for any number in the combined string
				const match = speedText.match(/\d+/);
				if (match) speedValue = parseInt(match[0]);
			}
		}

		// Case 4: speed is a number (unlikely but handle it)
		else if (typeof speed === "number") {
			speedValue = speed;
			speedText = `${speed} ft.`;
			speedFormatted = `${speed} ft.`;
		}

		// Case 5: speed is an array or other type - convert to string
		else {
			speedText = String(speed).toLowerCase();
			speedFormatted = String(speed);

			const match = speedText.match(/\d+/);
			if (match) speedValue = parseInt(match[0]);
		}
	} catch (error) {
		console.warn("Error parsing monster speed:", error, "Speed value:", speed);
		// Return safe defaults
		return { speedText: "", speedValue: 0, speedFormatted: "Unknown" };
	}

	return {
		speedText: speedText || "",
		speedValue: speedValue || 0,
		speedFormatted: speedFormatted || "Unknown",
	};
}

// Format CR for display
function formatCR(cr) {
	if (!cr && cr !== 0) return "Unknown";

	// CR can be a number or fraction string
	if (typeof cr === "number") {
		return cr === 0 ? "0" : cr.toString();
	}

	// Handle fraction strings like "1/2", "1/4"
	if (typeof cr === "string") {
		if (cr.includes("/")) {
			const parts = cr.split("/");
			if (parts.length === 2) {
				const num = parseFloat(parts[0]) / parseFloat(parts[1]);
				return num === 0.5
					? "½"
					: num === 0.25
						? "¼"
						: num === 0.125
							? "⅛"
							: cr;
			}
		}
	}

	return cr;
}

// Parse CR value to number for comparison
function parseCR(cr) {
	if (!cr && cr !== 0) return 0;

	if (typeof cr === "number") return cr;

	if (typeof cr === "string") {
		// Handle fractions like "1/2", "1/4"
		if (cr.includes("/")) {
			const parts = cr.split("/");
			if (parts.length === 2) {
				return parseFloat(parts[0]) / parseFloat(parts[1]);
			}
		}

		// Try to parse as float
		const parsed = parseFloat(cr);
		return isNaN(parsed) ? 0 : parsed;
	}

	return 0;
}

// Get monster CR with proper field fallback
function getMonsterCR(monster) {
	// Use cr field first, then challenge_rating as fallback
	return monster.cr || monster.challenge_rating || 0;
}

// Get monster XP based on CR - UNCHANGED from Iteration 2
function getMonsterXP(monster) {
	const cr = getMonsterCR(monster);

	// Convert CR to string for lookup (handles fractions)
	let crKey;
	if (typeof cr === "number") {
		crKey = cr.toString();
	} else {
		crKey = cr;
	}

	// Look up XP value
	if (CR_TO_XP.hasOwnProperty(crKey)) {
		return CR_TO_XP[crKey];
	}

	// If not found, try to parse as number
	const crValue = parseCR(cr);

	// Find closest CR in table
	let closestXP = 0;
	for (const [key, value] of Object.entries(CR_TO_XP)) {
		const keyValue = parseCR(key);
		if (crValue >= keyValue && value > closestXP) {
			closestXP = value;
		}
	}

	return closestXP || 0;
}

// Get monster armor class with proper field fallback
function getMonsterAC(monster) {
	// Use armor_class or armour_class (both should work)
	return monster.armor_class || monster.armour_class || "Unknown";
}

// Get monster speed - UPDATED to use robust parser
function getMonsterSpeed(monster) {
	const speedInfo = parseMonsterSpeed(monster.speed);
	return speedInfo.speedValue;
}

// Classify monster role using heuristics - FIXED with robust speed handling
function classifyMonsterRole(monster) {
	try {
		const cr = parseCR(getMonsterCR(monster));
		const hp = parseInt(monster.hit_points) || 0;
		const ac = parseInt(getMonsterAC(monster)) || 0;

		// Use robust speed parser instead of direct access
		const speedInfo = parseMonsterSpeed(monster.speed);
		const speedValue = speedInfo.speedValue;
		const speedText = speedInfo.speedText;

		// Heuristic 1: Check for spellcasting indicators
		// Look in actions, special_abilities, or other text fields
		// Safely handle missing fields
		const textFields = [
			monster.actions || "",
			monster.special_abilities || "",
			monster.legendary_actions || "",
			monster.reactions || "",
		]
			.join(" ")
			.toLowerCase();

		const spellIndicators = [
			"spell",
			"magic",
			"cast",
			"enchant",
			"arcane",
			"divine",
			"sorcer",
			"wizard",
			"warlock",
			"druid",
		];
		const isSpellcaster = spellIndicators.some((indicator) =>
			textFields.includes(indicator),
		);

		if (isSpellcaster) {
			return "spellcaster";
		}

		// Heuristic 2: Swarm/Minion - low CR or low HP for CR
		// CR 1/2 or lower is considered swarm material
		if (cr <= 0.5) {
			return "swarm";
		}

		// Low HP for its CR (less than 20 HP per CR point, with minimum)
		const hpPerCR = hp / Math.max(cr, 0.5);
		if (hpPerCR < 20 && hp < 30) {
			return "swarm";
		}

		// Heuristic 3: Skirmisher - high speed (40+ ft) or mobile
		// Use speedValue from robust parser
		if (speedValue >= 40) {
			return "skirmish";
		}

		// Check for mobility in speed text using safe speedText
		const mobilityIndicators = ["fly", "climb", "burrow", "swim", "hover"];
		const hasMobility = mobilityIndicators.some((indicator) =>
			speedText.includes(indicator),
		);

		if (hasMobility && speedValue >= 30) {
			return "skirmish";
		}

		// Heuristic 4: Bruiser - high HP or high AC
		// High HP: more than 50 HP per CR point, with minimum HP
		if (hpPerCR > 50 && hp > 40) {
			return "bruiser";
		}

		// High AC: 17+ is considered high for most monsters
		if (ac >= 17) {
			return "bruiser";
		}

		// Heuristic 5: Tough HP total (absolute value)
		if (hp > 100) {
			return "bruiser";
		}

		// Default fallback based on remaining characteristics
		if (hp > 50 || ac > 15) {
			return "bruiser";
		} else if (speedValue >= 30) {
			return "skirmish";
		} else {
			return "unknown";
		}
	} catch (error) {
		console.warn("Error classifying monster role for:", monster.name, error);
		// Safe fallback classification
		const hp = parseInt(monster.hit_points) || 0;
		const ac = parseInt(getMonsterAC(monster)) || 0;

		if (hp > 50 || ac > 15) {
			return "bruiser";
		} else {
			return "unknown";
		}
	}
}

// Get XP threshold for party - UNCHANGED from Iteration 2
function getPartyThreshold(partyLevel, partySize, difficulty) {
	if (!XP_THRESHOLDS[partyLevel]) {
		throw new Error(`Invalid party level: ${partyLevel}`);
	}

	const perCharacter = XP_THRESHOLDS[partyLevel][difficulty];
	if (!perCharacter) {
		throw new Error(`Invalid difficulty: ${difficulty}`);
	}

	return perCharacter * partySize;
}

// Get encounter multiplier based on monster count - UNCHANGED from Iteration 2
function getEncounterMultiplier(monsterCount) {
	if (monsterCount <= 0) return 1;

	// Use the table, default to x4 for 15+ monsters
	return ENCOUNTER_MULTIPLIERS[Math.min(monsterCount, 15)] || 4;
}

// Calculate encounter XP values - UNCHANGED from Iteration 2
function calculateEncounterXP(monsters) {
	const baseXP = monsters.reduce(
		(sum, monster) => sum + getMonsterXP(monster),
		0,
	);
	const multiplier = getEncounterMultiplier(monsters.length);
	const adjustedXP = Math.round(baseXP * multiplier);

	return { baseXP, multiplier, adjustedXP };
}

// Check if encounter matches selected style
function evaluateStyleMatch(monsters, selectedStyle) {
	if (selectedStyle === "any") {
		return { match: true, level: "any", matchedCount: monsters.length };
	}

	// Count monsters matching the selected style
	const matchingMonsters = monsters.filter((monster) => {
		const role = monster.role || classifyMonsterRole(monster);
		return role === selectedStyle;
	});

	const matchedCount = matchingMonsters.length;

	// Evaluate match level
	if (monsters.length === 1) {
		// Single monster must match the style
		return {
			match: matchedCount === 1,
			level: matchedCount === 1 ? "matched" : "fell-back",
			matchedCount,
		};
	} else {
		// For 2+ monsters, at least 2 should match (or majority for 3-4 monsters)
		const requiredMatches = Math.max(2, Math.floor(monsters.length / 2));

		if (matchedCount >= requiredMatches) {
			return { match: true, level: "matched", matchedCount };
		} else if (matchedCount >= 1) {
			return { match: false, level: "partial", matchedCount };
		} else {
			return { match: false, level: "fell-back", matchedCount };
		}
	}
}

// Check variety (duplicate avoidance)
function evaluateVariety(monsters, preferVariety) {
	if (!preferVariety || monsters.length <= 1) {
		return { hasDuplicates: false, reason: "not-applicable" };
	}

	// Count occurrences of each monster name
	const nameCounts = {};
	monsters.forEach((monster) => {
		const name = monster.name;
		nameCounts[name] = (nameCounts[name] || 0) + 1;
	});

	// Check for duplicates
	const duplicates = Object.entries(nameCounts).filter(
		([_, count]) => count > 1,
	);

	if (duplicates.length === 0) {
		return { hasDuplicates: false, reason: "none" };
	} else {
		// Check if duplicates exceed limit (max 2 of same monster)
		const exceedsLimit = duplicates.some(([_, count]) => count > 2);
		return {
			hasDuplicates: true,
			reason: exceedsLimit ? "exceeded-limit" : "within-limit",
			duplicateMonsters: duplicates,
		};
	}
}

// Score an encounter based on how close it is to target - ENHANCED in Iteration 3
function scoreEncounter(
	adjustedXP,
	targetXP,
	styleMatch,
	variety,
	selectedStyle,
) {
	// Base score from XP difference (same as Iteration 2)
	const xpDifference = Math.abs(adjustedXP - targetXP);
	const xpScore = xpDifference / targetXP;

	// Style bonus/penalty (NEW in Iteration 3)
	let styleScore = 0;
	if (selectedStyle !== "any") {
		if (styleMatch.level === "matched") {
			styleScore = -0.1; // Bonus for good style match
		} else if (styleMatch.level === "partial") {
			styleScore = 0.05; // Small penalty for partial match
		} else if (styleMatch.level === "fell-back") {
			styleScore = 0.2; // Larger penalty for no match
		}
	}

	// Variety bonus/penalty (NEW in Iteration 3)
	let varietyScore = 0;
	if (variety.preferred) {
		if (variety.hasDuplicates) {
			if (variety.reason === "exceeded-limit") {
				varietyScore = 0.15; // Penalty for too many duplicates
			} else {
				varietyScore = 0.05; // Small penalty for duplicates within limit
			}
		} else {
			varietyScore = -0.05; // Bonus for no duplicates
		}
	}

	// Combined score (lower is better)
	return xpScore + styleScore + varietyScore;
}

// Fetch monsters from Open5e API with pagination - ENHANCED with robust error handling
async function fetchMonsters() {
	// Return cached data if available
	if (AppState.monsters.length > 0) {
		console.log(
			`Using cached monster data (${AppState.monsters.length} monsters with roles)`,
		);
		return AppState.monsters;
	}

	console.log("Fetching monsters from Open5e API and classifying roles...");

	const monsters = [];
	let nextUrl = "https://api.open5e.com/monsters/?limit=100";
	let requestCount = 0;
	const maxRequests = 10; // Safety limit to prevent infinite loops

	try {
		while (nextUrl && requestCount < maxRequests) {
			requestCount++;
			console.log(`Fetching page ${requestCount}: ${nextUrl}`);

			const response = await fetch(nextUrl);

			if (!response.ok) {
				throw new Error(`API request failed with status: ${response.status}`);
			}

			const data = await response.json();

			// Process each monster with error handling
			const validMonsters = [];

			for (const monster of data.results) {
				try {
					// Validate required fields exist
					if (!monster.name || !monster.type) {
						continue; // Skip monsters without name or type
					}

					const cr = parseCR(getMonsterCR(monster));
					const xp = getMonsterXP(monster);

					// Only include monsters with valid CR and XP values
					if (cr === null || cr === undefined || xp <= 0) {
						continue;
					}

					// Classify role with error handling
					let role;
					try {
						role = classifyMonsterRole(monster);
					} catch (roleError) {
						console.warn(
							`Failed to classify role for ${monster.name}:`,
							roleError,
						);
						// Assign default role based on stats
						const hp = parseInt(monster.hit_points) || 0;
						const ac = parseInt(getMonsterAC(monster)) || 0;
						role = hp > 50 || ac > 15 ? "bruiser" : "unknown";
					}

					// Parse speed for display
					const speedInfo = parseMonsterSpeed(monster.speed);

					// Create enhanced monster object with all parsed data
					const enhancedMonster = {
						...monster,
						role,
						speed_formatted: speedInfo.speedFormatted,
					};

					validMonsters.push(enhancedMonster);
				} catch (monsterError) {
					console.warn(
						`Skipping monster due to error: ${monster.name}`,
						monsterError,
					);
					// Continue with next monster
				}
			}

			monsters.push(...validMonsters);
			console.log(
				`Successfully processed ${validMonsters.length} monsters from page ${requestCount}`,
			);

			// Check for next page
			nextUrl = data.next;

			// Small delay to be nice to the API
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log(`Total monsters successfully processed: ${monsters.length}`);

		// Cache the results
		AppState.monsters = monsters;

		if (monsters.length === 0) {
			throw new Error("No valid monsters could be processed from the API.");
		}

		return monsters;
	} catch (error) {
		console.error("Error fetching monsters:", error);
		throw new Error(`Failed to fetch monster data: ${error.message}`);
	}
}

// Filter monsters based on theme - ENHANCED with lock theme constraint
function filterMonsters(
	monsters,
	theme,
	selectedStyle = "any",
	lockTheme = false,
) {
	if (!monsters || monsters.length === 0) {
		return [];
	}

	console.log(
		`Filtering monsters for theme: ${theme}, style: ${selectedStyle}, lockTheme: ${lockTheme}`,
	);

	// First filter by theme
	let filtered = monsters;
	if (theme !== "any") {
		filtered = monsters.filter((monster) => {
			if (!monster.type) return false;
			return monster.type.toLowerCase().includes(theme.toLowerCase());
		});
		console.log(`Found ${filtered.length} monsters after theme filtering`);
	}

	// NEW in Iteration 4: Check lock theme constraint
	if (lockTheme && theme !== "any" && filtered.length < 3) {
		console.log(
			`Lock theme enabled with insufficient monsters (${filtered.length}), generation will fail`,
		);
		return filtered; // Return filtered but it's insufficient
	}

	// If theme filtering yields too few monsters and lockTheme is false, consider fallback
	if (filtered.length < 3 && theme !== "any" && !lockTheme) {
		console.log(
			`Theme "${theme}" yields insufficient monsters (${filtered.length}), will consider fallback`,
		);
		return filtered; // Return filtered but note it's insufficient
	}

	return filtered;
}

// Generate candidate encounters using retry approach - ENHANCED with lock style constraint
function generateCandidateEncounters(
	filteredMonsters,
	targetXP,
	selectedStyle,
	preferVariety,
	lockStyle,
	maxAttempts = MAX_ATTEMPTS,
) {
	if (filteredMonsters.length === 0) {
		return { bestEncounter: null, bestScore: Infinity, attempts: 0 };
	}

	let bestEncounter = null;
	let bestScore = Infinity;
	let attempts = 0;
	let foundWithinTolerance = false;

	for (let i = 0; i < maxAttempts; i++) {
		attempts++;

		// Random monster count (1-4)
		const monsterCount = Math.floor(Math.random() * 4) + 1;

		// Select random monsters with variety consideration
		const selectedMonsters = [];
		const usedIndices = new Set();

		for (let j = 0; j < monsterCount; j++) {
			// If we need variety and have used many monsters, try to avoid repeats
			let randomIndex;
			let attemptsForThisMonster = 0;

			do {
				randomIndex = Math.floor(Math.random() * filteredMonsters.length);
				attemptsForThisMonster++;

				// If we're trying too hard, just take what we can get
				if (attemptsForThisMonster > 20) break;

				// If prefer variety, try to avoid duplicate names
				if (preferVariety) {
					const candidateName = filteredMonsters[randomIndex].name;
					const alreadySelected = selectedMonsters.some(
						(m) => m.name === candidateName,
					);
					if (!alreadySelected || usedIndices.size >= filteredMonsters.length) {
						break;
					}
				} else {
					break;
				}
			} while (true);

			usedIndices.add(randomIndex);
			selectedMonsters.push({ ...filteredMonsters[randomIndex] });
		}

		// Calculate XP
		const { adjustedXP } = calculateEncounterXP(selectedMonsters);

		// Evaluate style match
		const styleMatch = evaluateStyleMatch(selectedMonsters, selectedStyle);

		// NEW in Iteration 4: Check lock style constraint
		if (
			lockStyle &&
			selectedStyle !== "any" &&
			styleMatch.level !== "matched"
		) {
			// Skip this encounter if lock style is enabled and style doesn't match
			continue;
		}

		// Evaluate variety
		const variety = {
			preferred: preferVariety,
			...evaluateVariety(selectedMonsters, preferVariety),
		};

		// Score this encounter with new criteria
		const score = scoreEncounter(
			adjustedXP,
			targetXP,
			styleMatch,
			variety,
			selectedStyle,
		);

		// Check if this is the best so far
		if (score < bestScore) {
			bestScore = score;
			bestEncounter = {
				monsters: selectedMonsters,
				adjustedXP,
				styleMatch,
				variety,
				score,
			};
		}

		// Check if we found one within tolerance AND good style match (if style specified)
		const xpPercentageDiff = Math.abs(adjustedXP - targetXP) / targetXP;
		const xpWithinTolerance = xpPercentageDiff <= TOLERANCE;

		if (selectedStyle === "any") {
			// For "any" style, only XP tolerance matters
			if (xpWithinTolerance) {
				foundWithinTolerance = true;
				bestEncounter.success = true;
				console.log(`Found encounter within tolerance on attempt ${attempts}`);
				break;
			}
		} else {
			// For specific styles, need both XP tolerance AND good style match
			// If lock style is enabled, we already filtered out non-matching encounters
			if (xpWithinTolerance && (styleMatch.level === "matched" || !lockStyle)) {
				foundWithinTolerance = true;
				bestEncounter.success = true;
				console.log(
					`Found encounter with good style match within tolerance on attempt ${attempts}`,
				);
				break;
			}
		}

		// Early exit if we've tried enough and found something decent
		if (attempts >= MIN_ATTEMPTS && bestScore <= TOLERANCE * 1.5) {
			console.log(`Found decent encounter after ${attempts} attempts`);
			break;
		}
	}

	console.log(
		`Generated ${attempts} candidate encounters. Best score: ${bestScore.toFixed(3)}`,
	);

	return {
		bestEncounter,
		bestScore,
		attempts,
		foundWithinTolerance,
	};
}

// Render the encounter results
function renderEncounter(
	partyLevel,
	partySize,
	theme,
	difficulty,
	selectedStyle,
	targetXP,
	encounter,
	themeFallback = false,
) {
	const { monsters, adjustedXP, styleMatch, variety, success } = encounter;
	const { baseXP, multiplier } = calculateEncounterXP(monsters);

	// Update summary
	dom.summaryLevel.textContent = partyLevel;
	dom.summarySize.textContent = `${partySize} adventurer${partySize !== 1 ? "s" : ""}`;
	dom.summaryTheme.textContent =
		theme === "any"
			? "Any (Random)"
			: theme.charAt(0).toUpperCase() + theme.slice(1);
	dom.summaryDifficulty.textContent =
		difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
	dom.summaryStyle.textContent = ENCOUNTER_STYLES[selectedStyle] || "Any";

	// Style match display with color coding
	dom.summaryStyleMatch.textContent =
		styleMatch.level === "matched"
			? "Matched"
			: styleMatch.level === "partial"
				? "Partial"
				: styleMatch.level === "fell-back"
					? "Fell back"
					: "Any";
	dom.summaryStyleMatch.className = "summary-value " + styleMatch.level;

	// Variety display
	if (variety.preferred) {
		dom.summaryVariety.textContent = variety.hasDuplicates
			? "Some duplicates"
			: "No duplicates";
	} else {
		dom.summaryVariety.textContent = "Not preferred";
	}

	dom.summaryMonsterCount.textContent = monsters.length;
	dom.summaryBaseXP.textContent = baseXP.toLocaleString() + " XP";
	dom.summaryMultiplier.textContent = `×${multiplier}`;
	dom.summaryAdjustedXP.textContent = adjustedXP.toLocaleString() + " XP";
	dom.summaryTargetXP.textContent = targetXP.toLocaleString() + " XP";

	// Show theme fallback note if applicable
	if (themeFallback) {
		dom.themeFallbackNote.classList.remove("hidden");
	} else {
		dom.themeFallbackNote.classList.add("hidden");
	}

	// Update result label
	dom.resultLabel.innerHTML = "";
	dom.resultLabel.className = "result-label";

	const percentageDiff = Math.abs(adjustedXP - targetXP) / targetXP;
	const xpOnTarget = percentageDiff <= TOLERANCE;
	const styleOnTarget =
		selectedStyle === "any" || styleMatch.level === "matched";

	if (xpOnTarget && styleOnTarget) {
		dom.resultLabel.classList.add("success");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-check-circle"></i> On target (XP and style)';
	} else if (xpOnTarget) {
		dom.resultLabel.classList.add("success");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-check-circle"></i> On target (XP only)';
	} else if (styleOnTarget) {
		dom.resultLabel.classList.add("warning");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Closest match (style good, XP off)';
	} else {
		dom.resultLabel.classList.add("warning");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Closest match (both XP and style off)';
	}

	// Clear previous monsters
	dom.monstersContainer.innerHTML = "";

	// Render each monster card with role indicators
	monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

		// Use correct field names with fallbacks
		const role = monster.role || classifyMonsterRole(monster);
		const cr = getMonsterCR(monster);
		const xp = getMonsterXP(monster);
		const ac = getMonsterAC(monster);
		const hp = monster.hit_points || "Unknown";
		const speedInfo = parseMonsterSpeed(monster.speed);
		const speedValue = speedInfo.speedValue;

		// Role class for styling
		const roleClass = `role-${role}`;

		monsterCard.innerHTML = `
            <div class="monster-header">
                <h3 class="monster-name">${monster.name}</h3>
                <span class="monster-cr">CR: ${formatCR(cr)}</span>
                <span class="monster-xp">${xp.toLocaleString()} XP</span>
                <div class="monster-role ${roleClass}">${role.charAt(0).toUpperCase() + role.slice(1)}</div>
            </div>
            <div class="monster-body">
                <div class="monster-detail">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${monster.type || "Unknown"}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Size</span>
                    <span class="detail-value">${monster.size || "Unknown"}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Armour Class</span>
                    <span class="detail-value">${ac}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Hit Points</span>
                    <span class="detail-value">${hp}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Speed</span>
                    <span class="detail-value">${speedInfo.speedFormatted}</span>
                </div>
                <button class="view-details-btn" data-index="${index}">
                    <i class="fas fa-search"></i> View Details
                </button>
            </div>
        `;

		dom.monstersContainer.appendChild(monsterCard);

		// Add event listener to the view details button
		const viewDetailsBtn = monsterCard.querySelector(".view-details-btn");
		viewDetailsBtn.addEventListener("click", () => {
			showModalWithMonster(monster);
		});
	});

	// Store current encounter for regeneration and saving
	AppState.currentEncounter = {
		partyLevel,
		partySize,
		theme,
		difficulty,
		selectedStyle,
		targetXP,
		encounter,
	};
	AppState.themeFallback = themeFallback;
	AppState.styleMatchResult = styleMatch.level;

	// Enable save button
	dom.saveEncounterBtn.disabled = false;

	// Switch to results view
	setView("results");
}

// Show modal with monster details
function showModalWithMonster(monster) {
	// Use correct field names with fallbacks
	const role = monster.role || "Unknown";
	const cr = monster.cr || monster.challenge_rating || "Unknown";
	const type = monster.type || "Unknown";
	const size = monster.size || "Unknown";
	const ac = monster.armor_class || monster.armour_class || "Unknown";
	const hp = monster.hit_points || "Unknown";
	const speed = monster.speed_formatted || "Unknown";
	const xp = getMonsterXP(monster);

	dom.modalMonsterName.textContent = monster.name;
	dom.modalRole.textContent = role;
	dom.modalCr.textContent = formatCR(cr);
	dom.modalXp.textContent = xp.toLocaleString() + " XP";
	dom.modalType.textContent = type;
	dom.modalSize.textContent = size;
	dom.modalAc.textContent = ac;
	dom.modalHp.textContent = hp;
	dom.modalSpeed.textContent = speed;

	// Set Open5e link to WEBSITE (not API)
	if (monster.slug) {
		// Link to the Open5e website, not the API
		dom.open5eLink.href = `https://open5e.com/monsters/${monster.slug}`;
	} else {
		// Fallback to general monsters page on website
		dom.open5eLink.href = "https://open5e.com/monsters";
	}

	showModal(dom.monsterModal);
}

// Main function to generate encounter - ENHANCED with refinement constraints
async function generateEncounter() {
	try {
		// Get input values
		const partyLevel = parseInt(dom.partyLevelInput.value);
		const partySize = parseInt(dom.partySizeInput.value);
		const theme = dom.themeSelect.value;
		const difficulty = dom.difficultySelect.value;
		const selectedStyle = dom.encounterStyleSelect.value;
		const preferVariety = dom.preferVarietyCheckbox.checked;
		const lockTheme = dom.lockThemeCheckbox.checked;
		const lockStyle = dom.lockStyleCheckbox.checked;

		// Validate inputs
		if (isNaN(partyLevel) || partyLevel < 1 || partyLevel > 10) {
			throw new Error("Please enter a valid party level (1-10)");
		}

		if (isNaN(partySize) || partySize < 1 || partySize > 6) {
			throw new Error("Please enter a valid party size (1-6)");
		}

		if (!["easy", "medium", "hard", "deadly"].includes(difficulty)) {
			throw new Error("Please select a valid difficulty");
		}

		if (
			!["any", "bruisers", "skirmish", "spellcasters", "swarm"].includes(
				selectedStyle,
			)
		) {
			throw new Error("Please select a valid encounter style");
		}

		// Set loading state - this will hide all other views
		setView("loading");

		// Calculate target XP
		const targetXP = getPartyThreshold(partyLevel, partySize, difficulty);
		console.log(
			`Target XP for level ${partyLevel} party of ${partySize}: ${targetXP} (${difficulty})`,
		);
		console.log(
			`Selected style: ${selectedStyle}, Prefer variety: ${preferVariety}`,
		);
		console.log(`Lock theme: ${lockTheme}, Lock style: ${lockStyle}`);

		// Fetch monsters (will use cache if available)
		let allMonsters = await fetchMonsters();

		// Filter monsters based on theme with lock theme constraint
		let filteredMonsters = filterMonsters(
			allMonsters,
			theme,
			selectedStyle,
			lockTheme,
		);
		let themeFallback = false;

		// NEW in Iteration 4: Check lock theme constraint before fallback
		if (filteredMonsters.length < 3 && theme !== "any") {
			if (lockTheme) {
				throw new Error(
					'No valid encounter found for this theme with current constraints. Try disabling "Lock Theme" or choose a different theme.',
				);
			} else {
				console.log(
					`Insufficient ${theme} monsters found (${filteredMonsters.length}), falling back to Any theme`,
				);
				filteredMonsters = filterMonsters(
					allMonsters,
					"any",
					selectedStyle,
					false,
				);
				themeFallback = true;
			}
		}

		// If still no monsters, throw error
		if (filteredMonsters.length === 0) {
			throw new Error(
				"No suitable monsters found. Try adjusting your parameters.",
			);
		}

		console.log(
			`Using ${filteredMonsters.length} monsters for encounter generation`,
		);

		// Generate candidate encounters with new constraints
		const { bestEncounter, foundWithinTolerance } = generateCandidateEncounters(
			filteredMonsters,
			targetXP,
			selectedStyle,
			preferVariety,
			lockStyle,
			MAX_ATTEMPTS,
		);

		// NEW in Iteration 4: Check if generation failed due to lock style constraint
		if (!bestEncounter && lockStyle && selectedStyle !== "any") {
			throw new Error(
				'No encounter meets the selected style requirements. Try disabling "Lock Style" or choose a different style.',
			);
		}

		if (!bestEncounter) {
			throw new Error(
				"Failed to generate any suitable encounters. Try adjusting parameters.",
			);
		}

		// Mark as success if within tolerance
		bestEncounter.success = foundWithinTolerance;

		// NEW in Iteration 4: Check lock style constraint on final result
		if (
			lockStyle &&
			selectedStyle !== "any" &&
			bestEncounter.styleMatch.level !== "matched"
		) {
			throw new Error(
				'No encounter meets the selected style requirements. Try disabling "Lock Style" or choose a different style.',
			);
		}

		// Render the encounter
		renderEncounter(
			partyLevel,
			partySize,
			theme,
			difficulty,
			selectedStyle,
			targetXP,
			bestEncounter,
			themeFallback,
		);
	} catch (error) {
		// Show error state - this will hide loading and results
		dom.errorMessage.textContent = error.message;
		console.error("Error generating encounter:", error);
		setView("error");
	}
}

// Regenerate encounter with same parameters - ENHANCED with refinement constraints
function regenerateEncounter() {
	if (!AppState.currentEncounter) {
		return;
	}

	const { partyLevel, partySize, theme, difficulty, selectedStyle, targetXP } =
		AppState.currentEncounter;
	const preferVariety = dom.preferVarietyCheckbox.checked;
	const lockTheme = dom.lockThemeCheckbox.checked;
	const lockStyle = dom.lockStyleCheckbox.checked;

	try {
		// Set loading state
		setView("loading");

		// Filter monsters based on theme (from cache) with lock theme constraint
		let filteredMonsters = filterMonsters(
			AppState.monsters,
			theme,
			selectedStyle,
			lockTheme,
		);
		let themeFallback = AppState.themeFallback;

		// Apply fallback logic considering lock theme constraint
		if (filteredMonsters.length < 3 && theme !== "any") {
			if (lockTheme) {
				throw new Error(
					'No valid encounter found for this theme with current constraints. Try disabling "Lock Theme".',
				);
			} else if (themeFallback || filteredMonsters.length < 3) {
				filteredMonsters = filterMonsters(
					AppState.monsters,
					"any",
					selectedStyle,
					false,
				);
				themeFallback = true;
			}
		}

		if (filteredMonsters.length === 0) {
			throw new Error("No suitable monsters available for regeneration.");
		}

		// Generate new candidate encounters with new constraints
		const { bestEncounter, foundWithinTolerance } = generateCandidateEncounters(
			filteredMonsters,
			targetXP,
			selectedStyle,
			preferVariety,
			lockStyle,
			Math.floor(MAX_ATTEMPTS / 2), // Fewer attempts for regeneration
		);

		// Check lock style constraint
		if (!bestEncounter && lockStyle && selectedStyle !== "any") {
			throw new Error(
				'No encounter meets the selected style requirements. Try disabling "Lock Style".',
			);
		}

		if (!bestEncounter) {
			throw new Error(
				"Failed to regenerate encounter. Try generating a new one.",
			);
		}

		// Check lock style constraint on final result
		if (
			lockStyle &&
			selectedStyle !== "any" &&
			bestEncounter.styleMatch.level !== "matched"
		) {
			throw new Error(
				'No encounter meets the selected style requirements. Try disabling "Lock Style".',
			);
		}

		// Mark as success if within tolerance
		bestEncounter.success = foundWithinTolerance;

		// Render the new encounter
		renderEncounter(
			partyLevel,
			partySize,
			theme,
			difficulty,
			selectedStyle,
			targetXP,
			bestEncounter,
			themeFallback,
		);
	} catch (error) {
		// Show error state
		dom.errorMessage.textContent = error.message;
		console.error("Error regenerating encounter:", error);
		setView("error");
	}
}

// Initialise the app when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
