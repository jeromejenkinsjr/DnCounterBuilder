// D&D 5e Encounter Builder - Iteration 1
// Uses Open5e API to generate plausible encounters

// App state
const AppState = {
	monsters: [], // Cached monster data
	currentEncounter: null,
	isFetching: false,
	error: null,
};

// DOM Elements
const dom = {
	// Input elements
	partyLevelInput: document.getElementById("party-level"),
	partySizeInput: document.getElementById("party-size"),
	themeSelect: document.getElementById("theme"),

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
	summaryText: document.getElementById("summary-text"),
	monsterCount: document.getElementById("monster-count"),

	// Monster container
	monstersContainer: document.getElementById("monsters-container"),

	// Modal elements
	monsterModal: document.getElementById("monster-modal"),
	closeModalBtn: document.getElementById("close-modal"),
	modalMonsterName: document.getElementById("modal-monster-name"),
	modalCr: document.getElementById("modal-cr"),
	modalType: document.getElementById("modal-type"),
	modalSize: document.getElementById("modal-size"),
	modalAc: document.getElementById("modal-ac"),
	modalHp: document.getElementById("modal-hp"),
	open5eLink: document.getElementById("open5e-link"),

	// Error message
	errorMessage: document.getElementById("error-message"),
};

// CR ranges based on party level (Iteration 1 rules)
const CR_RANGES = {
	1: { min: 0, max: 1 },
	2: { min: 0, max: 1 },
	3: { min: 1, max: 2 },
	4: { min: 1, max: 2 },
	5: { min: 2, max: 4 },
	6: { min: 2, max: 4 },
	7: { min: 4, max: 6 },
	8: { min: 4, max: 6 },
	9: { min: 6, max: 8 },
	10: { min: 6, max: 8 },
};

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

	// Set initial theme to "Any" in dropdown
	dom.themeSelect.value = "any";

	// Set initial view state - all hidden, ready for first generation
	setView("idle");

	console.log("D&D 5e Encounter Builder initialised");
}

// Show modal with monster details
function showModal(monster) {
	// Use correct field names with fallbacks
	const cr = monster.cr || monster.challenge_rating || "Unknown";
	const type = monster.type || "Unknown";
	const size = monster.size || "Unknown";
	const ac = monster.armor_class || monster.armour_class || "Unknown";
	const hp = monster.hit_points || "Unknown";

	dom.modalMonsterName.textContent = monster.name;
	dom.modalCr.textContent = formatCR(cr);
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

// Get monster armor class with proper field fallback
function getMonsterAC(monster) {
	// Use armor_class or armour_class (both should work)
	return monster.armor_class || monster.armour_class || "Unknown";
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

			// Filter out monsters without CR or with invalid CR
			const validMonsters = data.results.filter((monster) => {
				const cr = parseCR(getMonsterCR(monster));
				return cr !== null && cr !== undefined && monster.name && monster.type;
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

// Filter monsters based on party level and theme
function filterMonsters(monsters, partyLevel, theme) {
	if (!monsters || monsters.length === 0) {
		return [];
	}

	const crRange = CR_RANGES[partyLevel];
	if (!crRange) {
		throw new Error(`Invalid party level: ${partyLevel}`);
	}

	console.log(
		`Filtering monsters for party level ${partyLevel} (CR ${crRange.min}-${crRange.max}), theme: ${theme}`,
	);

	const filtered = monsters.filter((monster) => {
		// Check CR range using proper field fallback
		const cr = parseCR(getMonsterCR(monster));
		if (cr < crRange.min || cr > crRange.max) {
			return false;
		}

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

// Select random monsters for encounter
function selectMonsters(filteredMonsters, theme) {
	if (filteredMonsters.length === 0) {
		return [];
	}

	// Determine number of monsters (1-4)
	const monsterCount = Math.floor(Math.random() * 4) + 1;
	console.log(`Selecting ${monsterCount} monsters for encounter`);

	const selectedMonsters = [];
	const usedIndices = new Set();

	// Try to avoid duplicates
	for (let i = 0; i < monsterCount; i++) {
		// If we've used all available monsters, break
		if (usedIndices.size >= filteredMonsters.length) {
			console.log("Not enough unique monsters available, using duplicates");
			break;
		}

		let randomIndex;
		let attempts = 0;
		const maxAttempts = 50; // Prevent infinite loop

		// Try to find a monster we haven't used yet
		do {
			randomIndex = Math.floor(Math.random() * filteredMonsters.length);
			attempts++;

			// If we've tried too many times, allow duplicates but limit to 2 of same type
			if (attempts >= maxAttempts) {
				// Count how many times we've already used this monster
				const monsterName = filteredMonsters[randomIndex].name;
				const sameMonsterCount = selectedMonsters.filter(
					(m) => m.name === monsterName,
				).length;

				// Allow at most 2 of the same monster (as per requirements)
				if (sameMonsterCount >= 2) {
					// Try another random monster
					randomIndex = Math.floor(Math.random() * filteredMonsters.length);
				}
				break;
			}
		} while (usedIndices.has(randomIndex));

		usedIndices.add(randomIndex);
		selectedMonsters.push({ ...filteredMonsters[randomIndex] });
	}

	return selectedMonsters;
}

// Generate encounter summary text
function generateSummaryText(partyLevel, partySize, theme, monsterCount) {
	const levelText = getLevelDescription(partyLevel);
	const themeText = theme === "any" ? "varied" : theme;

	const templates = [
		`A ${levelText} skirmish suited for a level ${partyLevel} party of ${partySize}.`,
		`A ${themeText} encounter for ${partySize} adventurers of level ${partyLevel}.`,
		`A ${monsterCount}-monster ${themeText} confrontation for a level ${partyLevel} party.`,
		`A ${levelText} engagement with ${themeText} creatures for ${partySize} heroes.`,
	];

	return templates[Math.floor(Math.random() * templates.length)];
}

// Get descriptive text for party level
function getLevelDescription(level) {
	if (level <= 2) return "beginner";
	if (level <= 4) return "moderate";
	if (level <= 6) return "challenging";
	if (level <= 8) return "dangerous";
	return "deadly";
}

// Render the encounter results
function renderEncounter(partyLevel, partySize, theme, monsters) {
	// Update summary
	dom.summaryLevel.textContent = partyLevel;
	dom.summarySize.textContent = `${partySize} adventurer${partySize !== 1 ? "s" : ""}`;
	dom.summaryTheme.textContent =
		theme === "any"
			? "Any (Random)"
			: theme.charAt(0).toUpperCase() + theme.slice(1);

	// Generate and set summary text
	const summaryText = generateSummaryText(
		partyLevel,
		partySize,
		theme,
		monsters.length,
	);
	dom.summaryText.textContent = summaryText;

	// Update monster count
	dom.monsterCount.textContent = `${monsters.length} monster${monsters.length !== 1 ? "s" : ""}`;

	// Clear previous monsters
	dom.monstersContainer.innerHTML = "";

	// Render each monster card
	monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

		// Use correct field names with fallbacks
		const cr = getMonsterCR(monster);
		const ac = getMonsterAC(monster);
		const hp = monster.hit_points || "Unknown";

		monsterCard.innerHTML = `
            <div class="monster-header">
                <h3 class="monster-name">${monster.name}</h3>
                <span class="monster-cr">CR: ${formatCR(cr)}</span>
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
		monsters,
	};

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

		// Validate inputs
		if (isNaN(partyLevel) || partyLevel < 1 || partyLevel > 10) {
			throw new Error("Please enter a valid party level (1-10)");
		}

		if (isNaN(partySize) || partySize < 1 || partySize > 6) {
			throw new Error("Please enter a valid party size (1-6)");
		}

		// Set loading state - this will hide all other views
		setView("loading");

		// Fetch monsters (will use cache if available)
		let allMonsters = await fetchMonsters();

		// Filter monsters based on party level and theme
		let filteredMonsters = filterMonsters(allMonsters, partyLevel, theme);

		// If no monsters match the theme, fall back to "Any"
		if (filteredMonsters.length === 0 && theme !== "any") {
			console.log(
				`No ${theme} monsters found for this CR range, falling back to Any theme`,
			);
			filteredMonsters = filterMonsters(allMonsters, partyLevel, "any");
		}

		// If still no monsters, throw error
		if (filteredMonsters.length === 0) {
			throw new Error(
				"No suitable monsters found for the selected parameters. Try adjusting party level or theme.",
			);
		}

		// Select random monsters
		const selectedMonsters = selectMonsters(filteredMonsters, theme);

		// Render the encounter
		renderEncounter(partyLevel, partySize, theme, selectedMonsters);
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

	const {
		partyLevel,
		partySize,
		theme,
		monsters: previousMonsters,
	} = AppState.currentEncounter;

	try {
		// Set loading state
		setView("loading");

		// Get filtered monsters again (from cache)
		const filteredMonsters = filterMonsters(
			AppState.monsters,
			partyLevel,
			theme,
		);

		// If no monsters match, try with "Any" theme
		let availableMonsters = filteredMonsters;
		if (filteredMonsters.length === 0 && theme !== "any") {
			availableMonsters = filterMonsters(AppState.monsters, partyLevel, "any");
		}

		if (availableMonsters.length === 0) {
			throw new Error(
				"No suitable monsters available for regeneration with these parameters.",
			);
		}

		// Select new random monsters
		const selectedMonsters = selectMonsters(availableMonsters, theme);

		// Render the new encounter
		renderEncounter(partyLevel, partySize, theme, selectedMonsters);
	} catch (error) {
		// Show error state
		dom.errorMessage.textContent = error.message;
		console.error("Error regenerating encounter:", error);
		setView("error");
	}
}

// Initialise the app when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
