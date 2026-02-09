// D&D 5e Encounter Builder - Iteration 2
// Uses Open5e API to generate XP-balanced encounters

// App state
const AppState = {
	monsters: [], // Cached monster data
	currentEncounter: null,
	isFetching: false,
	error: null,
	themeFallback: false,
};

// DOM Elements
const dom = {
	// Input elements
	partyLevelInput: document.getElementById("party-level"),
	partySizeInput: document.getElementById("party-size"),
	themeSelect: document.getElementById("theme"),
	difficultySelect: document.getElementById("difficulty"),

	// Buttons
	generateBtn: document.getElementById("generate-btn"),
	regenerateBtn: document.getElementById("regenerate-btn"),
	retryBtn: document.getElementById("retry-btn"),

	// UI Containers
	loadingState: document.getElementById("loading-state"),
	errorState: document.getElementById("error-state"),
	resultsDisplay: document.getElementById("results-display"),

	// Summary elements
	summaryLevel: document.getElementById("summary-level"),
	summarySize: document.getElementById("summary-size"),
	summaryTheme: document.getElementById("summary-theme"),
	summaryDifficulty: document.getElementById("summary-difficulty"),
	summaryMonsterCount: document.getElementById("summary-monster-count"),
	summaryBaseXP: document.getElementById("summary-base-xp"),
	summaryMultiplier: document.getElementById("summary-multiplier"),
	summaryAdjustedXP: document.getElementById("summary-adjusted-xp"),
	summaryTargetXP: document.getElementById("summary-target-xp"),
	themeFallbackNote: document.getElementById("theme-fallback"),
	resultLabel: document.getElementById("result-label"),

	// Monster container
	monstersContainer: document.getElementById("monsters-container"),

	// Modal elements
	monsterModal: document.getElementById("monster-modal"),
	closeModalBtn: document.getElementById("close-modal"),
	modalMonsterName: document.getElementById("modal-monster-name"),
	modalCr: document.getElementById("modal-cr"),
	modalXp: document.getElementById("modal-xp"),
	modalType: document.getElementById("modal-type"),
	modalSize: document.getElementById("modal-size"),
	modalAc: document.getElementById("modal-ac"),
	modalHp: document.getElementById("modal-hp"),
	open5eLink: document.getElementById("open5e-link"),

	// Error message
	errorMessage: document.getElementById("error-message"),
};

// XP Thresholds by Character Level (DMG p.82)
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

// Monster XP by CR (DMG p.275)
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

// Encounter Multipliers (DMG p.82)
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

// Tolerance for success (±15%)
const TOLERANCE = 0.15;
const MAX_ATTEMPTS = 300;
const MIN_ATTEMPTS = 50;

// Single source of truth for UI state management
function setView(state) {
	// Reset all view states first with absolute certainty
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsDisplay.classList.add("hidden");

	// Reset button states
	dom.generateBtn.disabled = false;
	dom.generateBtn.innerHTML =
		'<i class="fas fa-dice-d20"></i> Generate Encounter';
	AppState.isFetching = false;

	// Show the correct state
	switch (state) {
		case "loading":
			dom.loadingState.classList.remove("hidden");
			dom.generateBtn.disabled = true;
			dom.generateBtn.innerHTML =
				'<i class="fas fa-spinner fa-spin"></i> Generating...';
			AppState.isFetching = true;
			break;

		case "error":
			dom.errorState.classList.remove("hidden");
			dom.regenerateBtn.disabled = false;
			break;

		case "results":
			dom.resultsDisplay.classList.remove("hidden");
			dom.regenerateBtn.disabled = false;
			break;

		case "idle":
		default:
			dom.regenerateBtn.disabled = true;
			break;
	}
}

// Initialise the app
function init() {
	// Event listeners
	dom.generateBtn.addEventListener("click", generateEncounter);
	dom.regenerateBtn.addEventListener("click", regenerateEncounter);
	dom.retryBtn.addEventListener("click", generateEncounter);
	dom.closeModalBtn.addEventListener("click", () => hideModal());

	// Close modal when clicking outside
	dom.monsterModal.addEventListener("click", (e) => {
		if (e.target === dom.monsterModal) hideModal();
	});

	// Set initial values
	dom.themeSelect.value = "any";
	dom.difficultySelect.value = "medium";

	// Set initial view state
	setView("idle");

	console.log("D&D 5e Encounter Builder - Iteration 2 initialised");
}

// Show modal with monster details
function showModal(monster) {
	// Use correct field names with fallbacks
	const cr = monster.cr || monster.challenge_rating || "Unknown";
	const type = monster.type || "Unknown";
	const size = monster.size || "Unknown";
	const ac = monster.armor_class || monster.armour_class || "Unknown";
	const hp = monster.hit_points || "Unknown";
	const xp = getMonsterXP(monster);

	dom.modalMonsterName.textContent = monster.name;
	dom.modalCr.textContent = formatCR(cr);
	dom.modalXp.textContent = xp.toLocaleString() + " XP";
	dom.modalType.textContent = type;
	dom.modalSize.textContent = size;
	dom.modalAc.textContent = ac;
	dom.modalHp.textContent = hp;

	// Set Open5e link to WEBSITE (not API)
	if (monster.slug) {
		// Link to the Open5e website, not the API
		dom.open5eLink.href = `https://open5e.com/monsters/${monster.slug}`;
	} else {
		// Fallback to general monsters page on website
		dom.open5eLink.href = "https://open5e.com/monsters";
	}

	dom.monsterModal.classList.remove("hidden");
}

// Hide modal
function hideModal() {
	dom.monsterModal.classList.add("hidden");
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

// Get monster XP based on CR
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

// Get XP threshold for party
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

// Get encounter multiplier based on monster count
function getEncounterMultiplier(monsterCount) {
	if (monsterCount <= 0) return 1;

	// Use the table, default to x4 for 15+ monsters
	return ENCOUNTER_MULTIPLIERS[Math.min(monsterCount, 15)] || 4;
}

// Calculate encounter XP values
function calculateEncounterXP(monsters) {
	const baseXP = monsters.reduce(
		(sum, monster) => sum + getMonsterXP(monster),
		0,
	);
	const multiplier = getEncounterMultiplier(monsters.length);
	const adjustedXP = Math.round(baseXP * multiplier);

	return { baseXP, multiplier, adjustedXP };
}

// Score an encounter based on how close it is to target
function scoreEncounter(adjustedXP, targetXP) {
	const difference = Math.abs(adjustedXP - targetXP);
	const percentageDiff = difference / targetXP;

	// Lower score is better (closer to target)
	return percentageDiff;
}

// Fetch monsters from Open5e API with pagination
async function fetchMonsters() {
	// Return cached data if available
	if (AppState.monsters.length > 0) {
		console.log(
			`Using cached monster data (${AppState.monsters.length} monsters)`,
		);
		return AppState.monsters;
	}

	console.log("Fetching monsters from Open5e API...");

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

			// Filter out monsters without CR, XP data, or with invalid CR
			const validMonsters = data.results.filter((monster) => {
				const cr = parseCR(getMonsterCR(monster));
				const xp = getMonsterXP(monster);

				// Only include monsters with valid CR and XP values
				return (
					cr !== null &&
					cr !== undefined &&
					xp > 0 &&
					monster.name &&
					monster.type
				);
			});

			monsters.push(...validMonsters);
			console.log(
				`Fetched ${validMonsters.length} valid monsters from page ${requestCount}`,
			);

			// Check for next page
			nextUrl = data.next;

			// Small delay to be nice to the API
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log(`Total monsters fetched: ${monsters.length}`);

		// Cache the results
		AppState.monsters = monsters;

		return monsters;
	} catch (error) {
		console.error("Error fetching monsters:", error);
		throw new Error(`Failed to fetch monster data: ${error.message}`);
	}
}

// Filter monsters based on theme
function filterMonsters(monsters, theme) {
	if (!monsters || monsters.length === 0) {
		return [];
	}

	console.log(`Filtering monsters for theme: ${theme}`);

	const filtered = monsters.filter((monster) => {
		// Check theme
		if (theme !== "any") {
			if (
				!monster.type ||
				!monster.type.toLowerCase().includes(theme.toLowerCase())
			) {
				return false;
			}
		}

		return true;
	});

	console.log(`Found ${filtered.length} monsters after filtering`);
	return filtered;
}

// Generate candidate encounters using retry approach
function generateCandidateEncounters(
	filteredMonsters,
	targetXP,
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

		// Select random monsters
		const selectedMonsters = [];
		for (let j = 0; j < monsterCount; j++) {
			const randomIndex = Math.floor(Math.random() * filteredMonsters.length);
			selectedMonsters.push({ ...filteredMonsters[randomIndex] });
		}

		// Calculate XP
		const { adjustedXP } = calculateEncounterXP(selectedMonsters);

		// Score this encounter
		const score = scoreEncounter(adjustedXP, targetXP);

		// Check if this is the best so far
		if (score < bestScore) {
			bestScore = score;
			bestEncounter = {
				monsters: selectedMonsters,
				adjustedXP,
				score,
			};
		}

		// Check if we found one within tolerance
		if (score <= TOLERANCE) {
			foundWithinTolerance = true;
			bestEncounter.success = true;
			console.log(`Found encounter within tolerance on attempt ${attempts}`);
			break;
		}

		// Early exit if we've tried enough and found something decent
		if (attempts >= MIN_ATTEMPTS && bestScore <= TOLERANCE * 2) {
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
	targetXP,
	encounter,
	themeFallback = false,
) {
	const { monsters, adjustedXP, success } = encounter;
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

	if (success || percentageDiff <= TOLERANCE) {
		dom.resultLabel.classList.add("success");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-check-circle"></i> On target (within tolerance)';
	} else {
		dom.resultLabel.classList.add("warning");
		dom.resultLabel.innerHTML =
			'<i class="fas fa-exclamation-triangle"></i> Closest match (outside tolerance)';
	}

	// Clear previous monsters
	dom.monstersContainer.innerHTML = "";

	// Render each monster card
	monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

		// Use correct field names with fallbacks
		const cr = getMonsterCR(monster);
		const xp = getMonsterXP(monster);
		const ac = getMonsterAC(monster);
		const hp = monster.hit_points || "Unknown";

		monsterCard.innerHTML = `
            <div class="monster-header">
                <h3 class="monster-name">${monster.name}</h3>
                <span class="monster-cr">CR: ${formatCR(cr)}</span>
                <span class="monster-xp">${xp.toLocaleString()} XP</span>
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
                <button class="view-details-btn" data-index="${index}">
                    <i class="fas fa-search"></i> View Details
                </button>
            </div>
        `;

		dom.monstersContainer.appendChild(monsterCard);

		// Add event listener to the view details button
		const viewDetailsBtn = monsterCard.querySelector(".view-details-btn");
		viewDetailsBtn.addEventListener("click", () => {
			showModal(monster);
		});
	});

	// Store current encounter for regeneration
	AppState.currentEncounter = {
		partyLevel,
		partySize,
		theme,
		difficulty,
		targetXP,
		encounter,
	};
	AppState.themeFallback = themeFallback;

	// Switch to results view - this will hide loading/error states
	setView("results");
}

// Main function to generate encounter
async function generateEncounter() {
	try {
		// Get input values
		const partyLevel = parseInt(dom.partyLevelInput.value);
		const partySize = parseInt(dom.partySizeInput.value);
		const theme = dom.themeSelect.value;
		const difficulty = dom.difficultySelect.value;

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

		// Set loading state - this will hide all other views
		setView("loading");

		// Calculate target XP
		const targetXP = getPartyThreshold(partyLevel, partySize, difficulty);
		console.log(
			`Target XP for level ${partyLevel} party of ${partySize}: ${targetXP} (${difficulty})`,
		);

		// Fetch monsters (will use cache if available)
		let allMonsters = await fetchMonsters();

		// Filter monsters based on theme
		let filteredMonsters = filterMonsters(allMonsters, theme);
		let themeFallback = false;

		// If no monsters match the theme, fall back to "Any"
		if (filteredMonsters.length < 5) {
			// Need at least a few monsters to choose from
			console.log(
				`Insufficient ${theme} monsters found (${filteredMonsters.length}), falling back to Any theme`,
			);
			filteredMonsters = filterMonsters(allMonsters, "any");
			themeFallback = true;
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

		// Generate candidate encounters
		const { bestEncounter, foundWithinTolerance } = generateCandidateEncounters(
			filteredMonsters,
			targetXP,
			MAX_ATTEMPTS,
		);

		if (!bestEncounter) {
			throw new Error(
				"Failed to generate any suitable encounters. Try adjusting parameters.",
			);
		}

		// Mark as success if within tolerance
		bestEncounter.success = foundWithinTolerance;

		// Render the encounter
		renderEncounter(
			partyLevel,
			partySize,
			theme,
			difficulty,
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

// Regenerate encounter with same parameters
function regenerateEncounter() {
	if (!AppState.currentEncounter) {
		return;
	}

	const { partyLevel, partySize, theme, difficulty, targetXP } =
		AppState.currentEncounter;

	try {
		// Set loading state
		setView("loading");

		// Filter monsters based on theme (from cache)
		let filteredMonsters = filterMonsters(AppState.monsters, theme);
		let themeFallback = AppState.themeFallback;

		// If theme fallback was used before, use it again
		if (themeFallback || filteredMonsters.length < 5) {
			filteredMonsters = filterMonsters(AppState.monsters, "any");
			themeFallback = true;
		}

		if (filteredMonsters.length === 0) {
			throw new Error("No suitable monsters available for regeneration.");
		}

		// Generate new candidate encounters
		const { bestEncounter, foundWithinTolerance } = generateCandidateEncounters(
			filteredMonsters,
			targetXP,
			Math.floor(MAX_ATTEMPTS / 2), // Fewer attempts for regeneration
		);

		if (!bestEncounter) {
			throw new Error(
				"Failed to regenerate encounter. Try generating a new one.",
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
