// D&D 5e Encounter Builder - Iteration 3
// Adds encounter composition constraints and improved quality

// App state
const AppState = {
	monsters: [], // Cached monster data with roles
	currentEncounter: null,
	isFetching: false,
	error: null,
	themeFallback: false,
	styleMatchResult: "any", // Track style matching result
};

// DOM Elements
const dom = {
	// Input elements
	partyLevelInput: document.getElementById("party-level"),
	partySizeInput: document.getElementById("party-size"),
	themeSelect: document.getElementById("theme"),
	difficultySelect: document.getElementById("difficulty"),
	encounterStyleSelect: document.getElementById("encounter-style"),
	preferVarietyCheckbox: document.getElementById("prefer-variety"),

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

	// Monster container
	monstersContainer: document.getElementById("monsters-container"),

	// Modal elements
	monsterModal: document.getElementById("monster-modal"),
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
	dom.encounterStyleSelect.value = "any";
	dom.preferVarietyCheckbox.checked = true;

	// Set initial view state
	setView("idle");

	console.log("D&D 5e Encounter Builder - Iteration 3 initialised");
}

// Show modal with monster details
function showModal(monster) {
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

	dom.monsterModal.classList.remove("hidden");
}

// Hide modal
function hideModal() {
	dom.monsterModal.classList.add("hidden");
}

// NEW: Robust speed parsing helper for Open5e's varied speed formats
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

// Get monster speed - UPDATED to use new robust parser
function getMonsterSpeed(monster) {
	const speedInfo = parseMonsterSpeed(monster.speed);
	return speedInfo.speedValue;
}

// NEW in Iteration 3: Classify monster role using heuristics - FIXED with robust speed handling
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

// NEW in Iteration 3: Check if encounter matches selected style
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

// NEW in Iteration 3: Check variety (duplicate avoidance)
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

// Filter monsters based on theme - ENHANCED in Iteration 3
function filterMonsters(monsters, theme, selectedStyle = "any") {
	if (!monsters || monsters.length === 0) {
		return [];
	}

	console.log(
		`Filtering monsters for theme: ${theme}, style: ${selectedStyle}`,
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

	// If theme filtering yields too few monsters, consider it insufficient
	if (filtered.length < 3 && theme !== "any") {
		console.log(
			`Theme "${theme}" yields insufficient monsters (${filtered.length}), will consider fallback`,
		);
		return filtered; // Return filtered but note it's insufficient
	}

	return filtered;
}

// Generate candidate encounters using retry approach - ENHANCED in Iteration 3
function generateCandidateEncounters(
	filteredMonsters,
	targetXP,
	selectedStyle,
	preferVariety,
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

		// Evaluate style match (NEW in Iteration 3)
		const styleMatch = evaluateStyleMatch(selectedMonsters, selectedStyle);

		// Evaluate variety (NEW in Iteration 3)
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
			if (xpWithinTolerance && styleMatch.level === "matched") {
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

// Render the encounter results - ENHANCED in Iteration 3
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
			showModal(monster);
		});
	});

	// Store current encounter for regeneration
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

	// Switch to results view - this will hide loading/error states
	setView("results");
}

// Main function to generate encounter - ENHANCED in Iteration 3
async function generateEncounter() {
	try {
		// Get input values
		const partyLevel = parseInt(dom.partyLevelInput.value);
		const partySize = parseInt(dom.partySizeInput.value);
		const theme = dom.themeSelect.value;
		const difficulty = dom.difficultySelect.value;
		const selectedStyle = dom.encounterStyleSelect.value;
		const preferVariety = dom.preferVarietyCheckbox.checked;

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

		// Fetch monsters (will use cache if available)
		let allMonsters = await fetchMonsters();

		// Filter monsters based on theme
		let filteredMonsters = filterMonsters(allMonsters, theme, selectedStyle);
		let themeFallback = false;

		// If theme filtering yields too few monsters, fall back to "Any" theme
		// NEW in Iteration 3: Stronger theme requirement - need at least 5 monsters for good variety
		if (filteredMonsters.length < 5 && theme !== "any") {
			console.log(
				`Insufficient ${theme} monsters found (${filteredMonsters.length}), falling back to Any theme`,
			);
			filteredMonsters = filterMonsters(allMonsters, "any", selectedStyle);
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

		// Generate candidate encounters with new constraints
		const { bestEncounter, foundWithinTolerance } = generateCandidateEncounters(
			filteredMonsters,
			targetXP,
			selectedStyle,
			preferVariety,
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

// Regenerate encounter with same parameters - ENHANCED in Iteration 3
function regenerateEncounter() {
	if (!AppState.currentEncounter) {
		return;
	}

	const { partyLevel, partySize, theme, difficulty, selectedStyle, targetXP } =
		AppState.currentEncounter;
	const preferVariety = dom.preferVarietyCheckbox.checked;

	try {
		// Set loading state
		setView("loading");

		// Filter monsters based on theme (from cache)
		let filteredMonsters = filterMonsters(
			AppState.monsters,
			theme,
			selectedStyle,
		);
		let themeFallback = AppState.themeFallback;

		// If theme fallback was used before, use it again
		if (themeFallback || filteredMonsters.length < 5) {
			filteredMonsters = filterMonsters(
				AppState.monsters,
				"any",
				selectedStyle,
			);
			themeFallback = true;
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
