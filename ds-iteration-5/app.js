// D&D 5e Encounter Builder - Iteration 5
// Adds export and import functionality for sharing and backup

// App state
const AppState = {
	monsters: [], // Cached monster data with roles
	currentEncounter: null,
	isFetching: false,
	error: null,
	themeFallback: false,
	styleMatchResult: "any", // Track style matching result
	savedEncounters: [], // Saved encounters array
	viewState: "idle", // Track current view state
	currentSource: "generated", // Track if current encounter is generated, saved, or imported
};

// App version for export/import compatibility
const APP_VERSION = 5;

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

	// Hidden file input
	fileInput: document.getElementById("file-input"),

	// Buttons
	generateBtn: document.getElementById("generate-btn"),
	regenerateBtn: document.getElementById("regenerate-btn"),
	libraryBtn: document.getElementById("library-btn"),
	retryBtn: document.getElementById("retry-btn"),
	adjustParamsBtn: document.getElementById("adjust-params-btn"),
	saveEncounterBtn: document.getElementById("save-encounter-btn"),
	exportEncounterBtn: document.getElementById("export-encounter-btn"),
	importEncounterBtn: document.getElementById("import-encounter-btn"),
	exportLibraryBtn: document.getElementById("export-library-btn"),
	importLibraryBtn: document.getElementById("import-library-btn"),
	clearLibraryBtn: document.getElementById("clear-library-btn"),
	backToGeneratorBtn: document.getElementById("back-to-generator-btn"),
	startGeneratingBtn: document.getElementById("start-generating-btn"),
	importToEmptyBtn: document.getElementById("import-to-empty-btn"),
	closeLibraryBtn: document.getElementById("close-library-btn"),

	// Confirmation modal elements
	confirmCancelBtn: document.getElementById("confirm-cancel-btn"),
	confirmOkBtn: document.getElementById("confirm-ok-btn"),
	closeConfirmModal: document.getElementById("close-confirm-modal"),

	// Toast element
	successToast: document.getElementById("success-toast"),
	toastMessage: document.getElementById("toast-message"),

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
	summarySource: document.getElementById("summary-source"),
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
const MAX_ATTEMPTS = 600;
const MIN_ATTEMPTS = 100;

// Role definitions for encounter styles
const ENCOUNTER_STYLES = {
	any: "Any",
	bruisers: "Bruisers",
	skirmish: "Skirmish",
	spellcasters: "Spellcasters",
	swarm: "Swarm",
};

// Validation schema for encounter data
const ENCOUNTER_SCHEMA = {
	required: {
		iteration: "number",
		id: "string",
		timestamp: "number",
		inputs: "object",
		encounter: "object",
	},
	inputs: {
		required: {
			partyLevel: "number",
			partySize: "number",
			theme: "string",
			difficulty: "string",
			selectedStyle: "string",
		},
	},
	encounter: {
		required: {
			monsters: "array",
			monsterCount: "number",
			baseXP: "number",
			adjustedXP: "number",
			targetXP: "number",
		},
	},
};

// ==================== UTILITY FUNCTIONS ====================

function showToast(message, duration = 3000) {
	dom.toastMessage.textContent = message;
	dom.successToast.classList.remove("hidden");

	setTimeout(() => {
		dom.successToast.classList.add("hidden");
	}, duration);
}

function showModal(modalElement) {
	modalElement.classList.remove("hidden");
}

function hideModal(modalElement) {
	modalElement.classList.add("hidden");
}

function formatCR(cr) {
	if (!cr && cr !== 0) return "Unknown";

	if (typeof cr === "number") {
		return cr === 0 ? "0" : cr.toString();
	}

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

function parseCR(cr) {
	if (!cr && cr !== 0) return 0;

	if (typeof cr === "number") return cr;

	if (typeof cr === "string") {
		if (cr.includes("/")) {
			const parts = cr.split("/");
			if (parts.length === 2) {
				return parseFloat(parts[0]) / parseFloat(parts[1]);
			}
		}

		const parsed = parseFloat(cr);
		return isNaN(parsed) ? 0 : parsed;
	}

	return 0;
}

function getMonsterCR(monster) {
	return monster.cr || monster.challenge_rating || 0;
}

function getMonsterXP(monster) {
	const cr = getMonsterCR(monster);

	let crKey = cr;
	if (typeof cr === "number") {
		crKey = cr.toString();
	}

	if (cr === 0.125) crKey = "1/8";
	else if (cr === 0.25) crKey = "1/4";
	else if (cr === 0.5) crKey = "1/2";

	return CR_TO_XP[crKey] || 0;
}

function calculateEncounterXP(monsters) {
	if (!monsters || monsters.length === 0) {
		return { baseXP: 0, adjustedXP: 0, multiplier: 1 };
	}

	const baseXP = monsters.reduce((total, monster) => {
		return total + getMonsterXP(monster);
	}, 0);

	const multiplier = ENCOUNTER_MULTIPLIERS[Math.min(monsters.length, 15)] || 4;
	const adjustedXP = Math.floor(baseXP * multiplier);

	return { baseXP, adjustedXP, multiplier };
}

function getTargetXP(partyLevel, partySize, difficulty) {
	const thresholds = XP_THRESHOLDS[partyLevel];
	if (!thresholds) return 0;

	const baseXP = thresholds[difficulty] || thresholds.medium;
	return baseXP * partySize;
}

function weightedRandom(min, max, weights) {
	if (max - min + 1 !== weights.length) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	let random = Math.random() * totalWeight;

	for (let i = 0; i < weights.length; i++) {
		random -= weights[i];
		if (random <= 0) {
			return min + i;
		}
	}

	return min;
}

// ==================== MONSTER PROCESSING FUNCTIONS ====================

function parseMonsterSpeed(speed) {
	let speedText = "";
	let speedValue = 0;
	let speedFormatted = "";

	try {
		if (!speed) {
			return { speedText: "", speedValue: 0, speedFormatted: "Unknown" };
		}

		if (typeof speed === "string") {
			speedText = speed.toLowerCase();
			speedFormatted = speed;

			const match = speedText.match(/\d+/);
			if (match) {
				speedValue = parseInt(match[0]);
			}
		} else if (typeof speed === "object" && !Array.isArray(speed)) {
			const parts = [];
			for (const [type, value] of Object.entries(speed)) {
				if (value) {
					parts.push(`${type} ${value}`);
					if (typeof value === "string") {
						speedText += ` ${type} ${value.toLowerCase()}`;
					} else {
						speedText += ` ${type} ${value}`;
					}
				}
			}

			speedFormatted = parts.join(", ");
			speedText = speedText.toLowerCase().trim();

			if (speed.walk) {
				const walkMatch = speed.walk.toString().match(/\d+/);
				if (walkMatch) speedValue = parseInt(walkMatch[0]);
			} else {
				const match = speedText.match(/\d+/);
				if (match) speedValue = parseInt(match[0]);
			}
		} else if (typeof speed === "number") {
			speedValue = speed;
			speedText = `${speed} ft.`;
			speedFormatted = `${speed} ft.`;
		} else {
			speedText = String(speed).toLowerCase();
			speedFormatted = String(speed);

			const match = speedText.match(/\d+/);
			if (match) speedValue = parseInt(match[0]);
		}
	} catch (error) {
		console.warn("Error parsing monster speed:", error, "Speed value:", speed);
		return { speedText: "", speedValue: 0, speedFormatted: "Unknown" };
	}

	return {
		speedText: speedText || "",
		speedValue: speedValue || 0,
		speedFormatted: speedFormatted || "Unknown",
	};
}

async function fetchMonsters(theme = "any", forceFetch = false) {
	if (AppState.monsters.length > 0 && !forceFetch) {
		console.log("Using cached monster data");
		return AppState.monsters;
	}

	if (AppState.isFetching) {
		console.log("Already fetching monsters, using cache");
		return AppState.monsters;
	}

	AppState.isFetching = true;
	AppState.error = null;

	try {
		console.log("Fetching monster data from Open5e...");

		const response = await fetch(
			"https://api.open5e.com/monsters/?limit=10000",
		);

		if (!response.ok) {
			throw new Error(`API request failed with status ${response.status}`);
		}

		const data = await response.json();

		if (!data.results || data.results.length === 0) {
			throw new Error("No monsters found in API response");
		}

		console.log(`Fetched ${data.results.length} monsters from Open5e`);

		const processedMonsters = data.results.map((monster) => {
			const speedData = parseMonsterSpeed(monster.speed);
			const rawCR = parseCR(getMonsterCR(monster));

			let role = "standard";

			if (rawCR >= 5) {
				role = "boss";
			} else if (rawCR >= 2) {
				const typeLower = (monster.type || "").toLowerCase();
				const nameLower = (monster.name || "").toLowerCase();
				const descLower = (monster.desc || "").toLowerCase();

				if (
					typeLower.includes("mage") ||
					nameLower.includes("mage") ||
					nameLower.includes("wizard") ||
					nameLower.includes("sorcerer") ||
					nameLower.includes("warlock") ||
					descLower.includes("spell")
				) {
					role = "spellcaster";
				} else if (speedData.speedValue >= 40) {
					role = "skirmisher";
				}
			} else if (rawCR < 1 && monster.hit_points && monster.hit_points <= 20) {
				role = "minion";
			}

			return {
				...monster,
				speed_text: speedData.speedText,
				speed_value: speedData.speedValue,
				speed_formatted: speedData.speedFormatted,
				cr: getMonsterCR(monster),
				role: role,
			};
		});

		AppState.monsters = processedMonsters;
		console.log(
			`Processed ${AppState.monsters.length} monsters with roles assigned`,
		);

		return AppState.monsters;
	} catch (error) {
		console.error("Error fetching monsters:", error);
		AppState.error = error.message;

		if (AppState.monsters.length > 0) {
			console.log("Using cached monsters due to fetch error");
			return AppState.monsters;
		}

		throw error;
	} finally {
		AppState.isFetching = false;
	}
}

function filterMonstersByTheme(monsters, theme) {
	if (theme === "any") {
		return monsters;
	}

	const themeLower = theme.toLowerCase();

	return monsters.filter((monster) => {
		const type = (monster.type || "").toLowerCase();
		const name = (monster.name || "").toLowerCase();

		switch (themeLower) {
			case "aberrations":
				return (
					type.includes("aberration") ||
					name.includes("aberration") ||
					name.includes("beholder") ||
					name.includes("mind flayer") ||
					name.includes("illithid")
				);

			case "beasts":
				return (
					type.includes("beast") ||
					type.includes("animal") ||
					(type.includes("monstrosity") && !type.includes("dragon"))
				);

			case "constructs":
				return (
					type.includes("construct") ||
					name.includes("construct") ||
					name.includes("golem")
				);

			case "dragons":
				return (
					type.includes("dragon") ||
					name.includes("dragon") ||
					name.includes("wyrm") ||
					name.includes("drake")
				);

			case "elementals":
				return (
					type.includes("elemental") ||
					name.includes("elemental") ||
					type.includes("genie")
				);

			case "fey":
				return (
					type.includes("fey") ||
					name.includes("fey") ||
					name.includes("sprite") ||
					name.includes("pixie")
				);

			case "fiends":
				return (
					type.includes("fiend") ||
					name.includes("demon") ||
					name.includes("devil") ||
					name.includes("hell") ||
					name.includes("abyssal")
				);

			case "giants":
				return (
					type.includes("giant") ||
					name.includes("giant") ||
					name.includes("ogre") ||
					name.includes("troll")
				);

			case "humanoids":
				return (
					type.includes("humanoid") ||
					name.includes("human") ||
					name.includes("elf") ||
					name.includes("dwarf") ||
					name.includes("goblin") ||
					name.includes("orc") ||
					name.includes("kobold")
				);

			case "monstrosities":
				return (
					type.includes("monstrosity") &&
					!type.includes("dragon") &&
					!name.includes("dragon")
				);

			case "oozes":
				return (
					type.includes("ooze") ||
					name.includes("ooze") ||
					name.includes("slime")
				);

			case "plants":
				return (
					type.includes("plant") ||
					name.includes("plant") ||
					name.includes("fungus") ||
					name.includes("mushroom")
				);

			case "undead":
				return (
					type.includes("undead") ||
					name.includes("zombie") ||
					name.includes("skeleton") ||
					name.includes("ghost") ||
					name.includes("wraith") ||
					name.includes("lich")
				);

			default:
				return true;
		}
	});
}

function filterMonstersByStyle(monsters, style) {
	if (style === "any") {
		return monsters;
	}

	return monsters.filter((monster) => {
		const role = monster.role || "standard";
		const hp = monster.hit_points || 0;
		const ac = monster.armor_class || monster.armour_class || 0;
		const speed = monster.speed_value || 0;

		switch (style) {
			case "bruisers":
				return hp >= 50 && ac >= 15;

			case "skirmish":
				return speed >= 40 || role === "skirmisher";

			case "spellcasters":
				return (
					role === "spellcaster" ||
					(monster.type || "").toLowerCase().includes("mage") ||
					(monster.name || "").toLowerCase().includes("mage") ||
					(monster.name || "").toLowerCase().includes("wizard")
				);

			case "swarm":
				const cr = parseCR(getMonsterCR(monster));
				return cr <= 1 && hp <= 20;

			default:
				return true;
		}
	});
}

function monsterMatchesStyle(monster, style) {
	if (style === "any") return true;

	const role = monster.role || "standard";
	const hp = monster.hit_points || 0;
	const ac = monster.armor_class || monster.armour_class || 0;
	const speed = monster.speed_value || 0;

	switch (style) {
		case "bruisers":
			return hp >= 50 && ac >= 15;

		case "skirmish":
			return speed >= 40 || role === "skirmisher";

		case "spellcasters":
			return (
				role === "spellcaster" ||
				(monster.type || "").toLowerCase().includes("mage") ||
				(monster.name || "").toLowerCase().includes("mage") ||
				(monster.name || "").toLowerCase().includes("wizard")
			);

		case "swarm":
			const cr = parseCR(getMonsterCR(monster));
			return cr <= 1 && hp <= 20;

		default:
			return true;
	}
}

function calculateVarietyScore(monsters) {
	if (monsters.length <= 1) return 1.0;

	const uniqueNames = new Set(monsters.map((m) => m.name));
	const uniqueCount = uniqueNames.size;

	const types = monsters.map((m) => m.type || "Unknown");
	const uniqueTypes = new Set(types);

	const roles = monsters.map((m) => m.role || "standard");
	const uniqueRoles = new Set(roles);

	const nameScore = uniqueCount / monsters.length;
	const typeScore = uniqueTypes.size / Math.max(types.length, 1);
	const roleScore = uniqueRoles.size / Math.max(roles.length, 1);

	return nameScore * 0.5 + typeScore * 0.3 + roleScore * 0.2;
}

// ==================== ENCOUNTER GENERATION FUNCTIONS ====================

function attemptGenerateEncounter(
	eligibleMonsters,
	targetXP,
	selectedStyle,
	preferVariety,
	styleToMatch = "any",
) {
	const maxMonsters = Math.min(6, Math.floor(targetXP / 50));
	const minMonsters = 1;
	const weights = [0.1, 0.3, 0.3, 0.2, 0.05, 0.05];
	const monsterCount = weightedRandom(minMonsters, maxMonsters, weights);

	const encounterMonsters = [];
	let attempts = 0;
	const maxAttempts = 1000;

	while (encounterMonsters.length < monsterCount && attempts < maxAttempts) {
		attempts++;

		const randomIndex = Math.floor(Math.random() * eligibleMonsters.length);
		const monster = eligibleMonsters[randomIndex];

		if (
			preferVariety &&
			encounterMonsters.some((m) => m.name === monster.name)
		) {
			continue;
		}

		const monsterXP = getMonsterXP(monster);
		const testMonsters = [...encounterMonsters, monster];
		const testXP = calculateEncounterXP(testMonsters).adjustedXP;
		const maxAllowedXP = targetXP * (1 + TOLERANCE * 2);

		if (testXP <= maxAllowedXP) {
			encounterMonsters.push(monster);
		}
	}

	if (encounterMonsters.length === 0) {
		return null;
	}

	const { baseXP, adjustedXP, multiplier } =
		calculateEncounterXP(encounterMonsters);

	let styleMatch = { level: "any", matchedCount: 0 };
	if (styleToMatch !== "any") {
		const matchedMonsters = encounterMonsters.filter((m) =>
			monsterMatchesStyle(m, styleToMatch),
		);
		const matchRatio = matchedMonsters.length / encounterMonsters.length;

		if (matchRatio === 1) {
			styleMatch = { level: "matched", matchedCount: matchedMonsters.length };
		} else if (matchRatio >= 0.5) {
			styleMatch = { level: "partial", matchedCount: matchedMonsters.length };
		} else {
			styleMatch = { level: "fell-back", matchedCount: matchedMonsters.length };
		}
	}

	const varietyScore = calculateVarietyScore(encounterMonsters);
	const hasDuplicates =
		new Set(encounterMonsters.map((m) => m.name)).size <
		encounterMonsters.length;

	const variety = {
		preferred: preferVariety,
		hasDuplicates: hasDuplicates,
		score: varietyScore,
		reason: preferVariety
			? hasDuplicates
				? "some-duplicates"
				: "no-duplicates"
			: "not-applicable",
	};

	const xpDiff = Math.abs(adjustedXP - targetXP);
	const xpDiffPercent = xpDiff / targetXP;
	const success = xpDiffPercent <= TOLERANCE;

	return {
		monsters: encounterMonsters,
		baseXP,
		adjustedXP,
		multiplier,
		targetXP,
		styleMatch,
		variety,
		success,
	};
}

function evaluateEncounter(
	encounter,
	targetXP,
	selectedStyle,
	preferVariety,
	styleToMatch = "any",
) {
	let score = 0;

	const xpDiff = Math.abs(encounter.adjustedXP - targetXP);
	const xpDiffPercent = xpDiff / targetXP;

	if (xpDiffPercent <= TOLERANCE) {
		score += 60;
	} else {
		const xpScore = 60 * (1 - Math.min(xpDiffPercent / 0.5, 1));
		score += xpScore;
	}

	if (styleToMatch !== "any") {
		const matchRatio =
			encounter.styleMatch.matchedCount / encounter.monsters.length;

		if (encounter.styleMatch.level === "matched") {
			score += 30;
		} else if (encounter.styleMatch.level === "partial") {
			score += 20 * matchRatio;
		} else {
			score += 10 * matchRatio;
		}
	} else {
		score += 30;
	}

	if (preferVariety) {
		if (!encounter.variety.hasDuplicates) {
			score += 10;
		} else {
			score += 5 * encounter.variety.score;
		}
	} else {
		score += 10;
	}

	if (encounter.monsters.length <= 3) {
		score += 5;
	}

	return score;
}

function generateEncounterAttempts(
	eligibleMonsters,
	targetXP,
	selectedStyle,
	preferVariety,
	styleToMatch = "any",
) {
	let bestEncounter = null;
	let bestScore = -Infinity;

	const monsterCount = eligibleMonsters.length;
	const attempts = Math.max(
		MIN_ATTEMPTS,
		Math.min(MAX_ATTEMPTS, Math.floor(monsterCount * 0.1)),
	);

	console.log(
		`Attempting ${attempts} encounters with ${monsterCount} eligible monsters...`,
	);

	for (let i = 0; i < attempts; i++) {
		const encounter = attemptGenerateEncounter(
			eligibleMonsters,
			targetXP,
			selectedStyle,
			preferVariety,
			styleToMatch,
		);

		if (!encounter) continue;

		const score = evaluateEncounter(
			encounter,
			targetXP,
			selectedStyle,
			preferVariety,
			styleToMatch,
		);

		if (score > bestScore) {
			bestScore = score;
			bestEncounter = encounter;

			if (score >= 100) {
				console.log(`Perfect encounter found at attempt ${i + 1}`);
				break;
			}
		}
	}

	if (!bestEncounter) {
		throw new Error(
			"Unable to generate a suitable encounter. Please try different parameters.",
		);
	}

	console.log(`Selected encounter with score ${bestScore.toFixed(2)}`);
	return bestEncounter;
}

// ==================== UI STATE MANAGEMENT ====================

function setView(state) {
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsDisplay.classList.add("hidden");
	dom.libraryDisplay.classList.add("hidden");

	dom.generateBtn.disabled = false;
	dom.generateBtn.innerHTML =
		'<i class="fas fa-dice-d20"></i> Generate Encounter';
	AppState.isFetching = false;
	AppState.viewState = state;

	switch (state) {
		case "loading":
			dom.loadingState.classList.remove("hidden");
			dom.generateBtn.disabled = true;
			dom.generateBtn.innerHTML =
				'<i class="fas fa-spinner fa-spin"></i> Generating...';
			AppState.isFetching = true;
			dom.libraryBtn.disabled = true;
			dom.saveEncounterBtn.disabled = true;
			dom.exportEncounterBtn.disabled = true;
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
			dom.exportEncounterBtn.disabled = false;
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
			dom.exportEncounterBtn.disabled = true;
			break;
	}
}

async function generateEncounter() {
	const partyLevel = parseInt(dom.partyLevelInput.value) || 1;
	const partySize = parseInt(dom.partySizeInput.value) || 4;
	const theme = dom.themeSelect.value || "any";
	const difficulty = dom.difficultySelect.value || "medium";
	const selectedStyle = dom.encounterStyleSelect.value || "any";
	const preferVariety = dom.preferVarietyCheckbox.checked;
	const lockTheme = dom.lockThemeCheckbox.checked;
	const lockStyle = dom.lockStyleCheckbox.checked;

	if (partyLevel < 1 || partyLevel > 10) {
		showToast("Party level must be between 1 and 10");
		return;
	}

	if (partySize < 1 || partySize > 10) {
		showToast("Party size must be between 1 and 10");
		return;
	}

	setView("loading");

	try {
		const allMonsters = await fetchMonsters(theme, false);

		if (allMonsters.length === 0) {
			throw new Error("No monsters available. Please try again.");
		}

		const targetXP = getTargetXP(partyLevel, partySize, difficulty);

		let eligibleMonsters = allMonsters;

		if (theme !== "any" || lockTheme) {
			eligibleMonsters = filterMonstersByTheme(allMonsters, theme);

			if (eligibleMonsters.length === 0 && theme !== "any") {
				eligibleMonsters = allMonsters;
				AppState.themeFallback = true;
			} else {
				AppState.themeFallback = false;
			}
		}

		if (selectedStyle !== "any" || lockStyle) {
			const styleFiltered = filterMonstersByStyle(
				eligibleMonsters,
				selectedStyle,
			);

			if (styleFiltered.length === 0 && selectedStyle !== "any") {
				AppState.styleMatchResult = "fell-back";
			} else {
				eligibleMonsters = styleFiltered;
				AppState.styleMatchResult = "filtered";
			}
		} else {
			AppState.styleMatchResult = "any";
		}

		const encounter = generateEncounterAttempts(
			eligibleMonsters,
			targetXP,
			selectedStyle,
			preferVariety,
			lockStyle ? selectedStyle : "any",
		);

		AppState.currentEncounter = {
			partyLevel,
			partySize,
			theme,
			difficulty,
			selectedStyle,
			targetXP,
			encounter,
		};

		AppState.currentSource = "generated";

		renderResults();
		setView("results");
	} catch (error) {
		console.error("Error generating encounter:", error);
		AppState.error = error.message;
		dom.errorMessage.textContent =
			error.message || "An unknown error occurred.";
		setView("error");
	}
}

function regenerateEncounter() {
	if (!AppState.currentEncounter) {
		generateEncounter();
		return;
	}

	const { partyLevel, partySize, theme, difficulty, selectedStyle } =
		AppState.currentEncounter;

	dom.partyLevelInput.value = partyLevel;
	dom.partySizeInput.value = partySize;
	dom.themeSelect.value = theme;
	dom.difficultySelect.value = difficulty;
	dom.encounterStyleSelect.value = selectedStyle;

	generateEncounter();
}

// ==================== EXPORT/IMPORT FUNCTIONS ====================

function validateEncounterData(data) {
	try {
		const required = ENCOUNTER_SCHEMA.required;
		for (const [field, type] of Object.entries(required)) {
			if (!(field in data)) {
				throw new Error(`Missing required field: ${field}`);
			}
			if (typeof data[field] !== type) {
				throw new Error(
					`Invalid type for field ${field}: expected ${type}, got ${typeof data[field]}`,
				);
			}
		}

		if (data.iteration > APP_VERSION) {
			throw new Error(
				`Encounter file was created with a newer version (${data.iteration}) of the app. Please update the app.`,
			);
		}

		const inputsRequired = ENCOUNTER_SCHEMA.inputs.required;
		for (const [field, type] of Object.entries(inputsRequired)) {
			if (!(field in data.inputs)) {
				throw new Error(`Missing required input field: ${field}`);
			}
			if (typeof data.inputs[field] !== type) {
				throw new Error(
					`Invalid type for input field ${field}: expected ${type}, got ${typeof data.inputs[field]}`,
				);
			}
		}

		const encounterRequired = ENCOUNTER_SCHEMA.encounter.required;
		for (const [field, type] of Object.entries(encounterRequired)) {
			if (!(field in data.encounter)) {
				throw new Error(`Missing required encounter field: ${field}`);
			}
			if (typeof data.encounter[field] !== type) {
				throw new Error(
					`Invalid type for encounter field ${field}: expected ${type}, got ${typeof data.encounter[field]}`,
				);
			}
		}

		if (
			!Array.isArray(data.encounter.monsters) ||
			data.encounter.monsters.length === 0
		) {
			throw new Error("Encounter must contain at least one monster");
		}

		const requiredMonsterFields = ["name", "cr", "xp", "type", "ac", "hp"];
		data.encounter.monsters.forEach((monster, index) => {
			requiredMonsterFields.forEach((field) => {
				if (!(field in monster)) {
					throw new Error(
						`Monster ${index + 1} missing required field: ${field}`,
					);
				}
			});
		});

		if (
			data.encounter.baseXP <= 0 ||
			data.encounter.adjustedXP <= 0 ||
			data.encounter.targetXP <= 0
		) {
			throw new Error("XP values must be positive numbers");
		}

		return true;
	} catch (error) {
		console.error("Encounter validation failed:", error);
		throw error;
	}
}

function prepareEncounterForSave(source = "generated") {
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

	return {
		iteration: APP_VERSION,
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
		source: source,

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

		resultLabel: success ? "On target" : "Closest match",
	};
}

function exportCurrentEncounter() {
	try {
		if (!AppState.currentEncounter) {
			showToast("No encounter to export. Please generate an encounter first.");
			return;
		}

		const encounterData = prepareEncounterForSave(AppState.currentSource);
		const jsonString = JSON.stringify(encounterData, null, 2);

		const difficulty = AppState.currentEncounter.difficulty;
		const level = AppState.currentEncounter.partyLevel;
		const timestamp = Date.now();
		const filename = `encounter_lvl${level}_${difficulty}_${timestamp}.json`;

		const blob = new Blob([jsonString], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		showToast("Encounter exported successfully!");
		console.log("Encounter exported:", filename);
	} catch (error) {
		console.error("Error exporting encounter:", error);
		showToast("Failed to export encounter: " + error.message);
	}
}

function exportEntireLibrary() {
	try {
		if (AppState.savedEncounters.length === 0) {
			showToast("No encounters in library to export.");
			return;
		}

		const libraryData = {
			iteration: APP_VERSION,
			exportedAt: Date.now(),
			exportedFrom: "D&D 5e Encounter Builder",
			count: AppState.savedEncounters.length,
			encounters: AppState.savedEncounters,
		};

		const jsonString = JSON.stringify(libraryData, null, 2);
		const timestamp = Date.now();
		const filename = `encounter_library_${timestamp}.json`;

		const blob = new Blob([jsonString], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		showToast(`Exported ${AppState.savedEncounters.length} encounters!`);
		console.log("Library exported:", filename);
	} catch (error) {
		console.error("Error exporting library:", error);
		showToast("Failed to export library: " + error.message);
	}
}

function handleFileImport(event) {
	const file = event.target.files[0];
	if (!file) return;

	dom.fileInput.value = "";

	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			const fileContent = e.target.result;
			const data = JSON.parse(fileContent);

			if (data.encounters && Array.isArray(data.encounters)) {
				importEncounterLibrary(data);
			} else {
				importSingleEncounter(data);
			}
		} catch (error) {
			console.error("Error importing file:", error);
			showToast("Invalid or incompatible encounter file.");
		}
	};

	reader.onerror = function () {
		showToast("Error reading file. Please try again.");
	};

	reader.readAsText(file);
}

function importSingleEncounter(data) {
	try {
		validateEncounterData(data);

		const existingIndex = AppState.savedEncounters.findIndex(
			(e) => e.id === data.id,
		);

		if (existingIndex !== -1) {
			AppState.savedEncounters[existingIndex] = data;
			showToast("Updated existing encounter in library.");
		} else {
			AppState.savedEncounters.unshift(data);
			showToast("Encounter imported successfully!");
		}

		saveEncounterToStorage();
		loadImportedEncounter(data);
	} catch (error) {
		console.error("Error importing encounter:", error);
		showToast("Import failed: " + error.message);
	}
}

function importEncounterLibrary(libraryData) {
	try {
		if (
			!libraryData.iteration ||
			!libraryData.encounters ||
			!Array.isArray(libraryData.encounters)
		) {
			throw new Error("Invalid library file format");
		}

		if (libraryData.iteration > APP_VERSION) {
			throw new Error(
				`Library file was created with a newer version (${libraryData.iteration}) of the app. Please update the app.`,
			);
		}

		let importedCount = 0;
		let skippedCount = 0;

		libraryData.encounters.forEach((encounter) => {
			try {
				validateEncounterData(encounter);

				const exists = AppState.savedEncounters.some(
					(e) => e.id === encounter.id,
				);

				if (!exists) {
					AppState.savedEncounters.unshift(encounter);
					importedCount++;
				} else {
					skippedCount++;
				}
			} catch (encounterError) {
				console.warn("Skipping invalid encounter in library:", encounterError);
				skippedCount++;
			}
		});

		saveEncounterToStorage();

		let message = `Imported ${importedCount} encounter(s)`;
		if (skippedCount > 0) {
			message += `, skipped ${skippedCount} (already exist or invalid)`;
		}
		showToast(message);

		if (AppState.viewState === "library") {
			renderLibraryView();
		}
	} catch (error) {
		console.error("Error importing library:", error);
		showToast("Import failed: " + error.message);
	}
}

// ==================== LIBRARY MANAGEMENT ====================

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

function saveEncounterToStorage() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.savedEncounters));
		console.log(
			`Saved ${AppState.savedEncounters.length} encounters to localStorage`,
		);
	} catch (error) {
		console.error("Error saving encounters to localStorage:", error);
		showToast(
			"Failed to save encounter. LocalStorage may be full or unavailable.",
		);
	}
}

function saveCurrentEncounter() {
	try {
		if (!AppState.currentEncounter) {
			showToast("No encounter to save. Please generate an encounter first.");
			return;
		}

		const encounterToSave = prepareEncounterForSave(AppState.currentSource);

		AppState.savedEncounters.unshift(encounterToSave);
		saveEncounterToStorage();

		dom.saveEncounterBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
		dom.saveEncounterBtn.disabled = true;

		setTimeout(() => {
			if (dom.saveEncounterBtn) {
				dom.saveEncounterBtn.innerHTML =
					'<i class="fas fa-save"></i> Save Encounter';
				dom.saveEncounterBtn.disabled = false;
			}
		}, 2000);

		showToast("Encounter saved to library!");
		console.log("Encounter saved with ID:", encounterToSave.id);
	} catch (error) {
		console.error("Error saving encounter:", error);
		showToast("Failed to save encounter: " + error.message);
	}
}

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

function clearEncounterLibrary() {
	AppState.savedEncounters = [];
	saveEncounterToStorage();
	console.log("Cleared all saved encounters");
	showToast("Library cleared successfully.");
}

function exportSingleEncounterFromLibrary(encounterId) {
	const encounter = AppState.savedEncounters.find((e) => e.id === encounterId);
	if (!encounter) {
		showToast("Encounter not found.");
		return;
	}

	try {
		const jsonString = JSON.stringify(encounter, null, 2);

		const difficulty = encounter.inputs.difficulty;
		const level = encounter.inputs.partyLevel;
		const timestamp = encounter.timestamp || Date.now();
		const filename = `encounter_lvl${level}_${difficulty}_${timestamp}.json`;

		const blob = new Blob([jsonString], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		showToast("Encounter exported successfully!");
		console.log("Encounter exported from library:", filename);
	} catch (error) {
		console.error("Error exporting encounter from library:", error);
		showToast("Failed to export encounter: " + error.message);
	}
}

// ==================== RENDERING FUNCTIONS ====================

function renderResults() {
	if (!AppState.currentEncounter) return;

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

	dom.summaryLevel.textContent = partyLevel;
	dom.summarySize.textContent = `${partySize} adventurer${partySize !== 1 ? "s" : ""}`;
	dom.summaryTheme.textContent =
		theme === "any"
			? "Any (Random)"
			: theme.charAt(0).toUpperCase() + theme.slice(1);
	dom.summaryDifficulty.textContent =
		difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
	dom.summaryStyle.textContent = ENCOUNTER_STYLES[selectedStyle] || "Any";

	dom.summaryStyleMatch.textContent =
		styleMatch.level === "matched"
			? "Matched"
			: styleMatch.level === "partial"
				? "Partial"
				: styleMatch.level === "fell-back"
					? "Fell back"
					: "Any";
	dom.summaryStyleMatch.className = "summary-value " + styleMatch.level;

	if (variety.preferred) {
		dom.summaryVariety.textContent = variety.hasDuplicates
			? "Some duplicates"
			: "No duplicates";
	} else {
		dom.summaryVariety.textContent = "Not preferred";
	}

	dom.summarySource.textContent = "Newly Generated";
	dom.summarySource.className = "summary-value";

	dom.summaryMonsterCount.textContent = monsters.length;
	dom.summaryBaseXP.textContent = baseXP.toLocaleString() + " XP";
	dom.summaryMultiplier.textContent = `×${multiplier}`;
	dom.summaryAdjustedXP.textContent = adjustedXP.toLocaleString() + " XP";
	dom.summaryTargetXP.textContent = targetXP.toLocaleString() + " XP";

	if (AppState.themeFallback) {
		dom.themeFallbackNote.classList.remove("hidden");
	} else {
		dom.themeFallbackNote.classList.add("hidden");
	}

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

	dom.monstersContainer.innerHTML = "";

	monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

		const roleClass = `role-${monster.role}`;

		monsterCard.innerHTML = `
            <div class="monster-header">
                <h3 class="monster-name">${monster.name}</h3>
                <span class="monster-cr">CR: ${formatCR(monster.cr)}</span>
                <span class="monster-xp">${getMonsterXP(monster).toLocaleString()} XP</span>
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
                    <span class="detail-value">${monster.armor_class || monster.armour_class || "Unknown"}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Hit Points</span>
                    <span class="detail-value">${monster.hit_points || "Unknown"}</span>
                </div>
                <div class="monster-detail">
                    <span class="detail-label">Speed</span>
                    <span class="detail-value">${monster.speed_formatted || "Unknown"}</span>
                </div>
                <button class="view-details-btn" data-index="${index}">
                    <i class="fas fa-search"></i> View Details
                </button>
            </div>
        `;

		dom.monstersContainer.appendChild(monsterCard);

		const viewDetailsBtn = monsterCard.querySelector(".view-details-btn");
		viewDetailsBtn.addEventListener("click", () => {
			showMonsterModal(monster);
		});
	});
}

function renderLibraryView() {
	if (AppState.savedEncounters.length === 0) {
		dom.libraryEmpty.classList.remove("hidden");
		dom.libraryContent.classList.add("hidden");
		dom.savedCount.textContent = "0";
	} else {
		dom.libraryEmpty.classList.add("hidden");
		dom.libraryContent.classList.remove("hidden");
		dom.savedCount.textContent = AppState.savedEncounters.length.toString();

		dom.encountersGrid.innerHTML = "";

		AppState.savedEncounters.forEach((encounter) => {
			const encounterCard = document.createElement("div");
			encounterCard.className = "encounter-card";

			const deviation = encounter.encounter.xpDeviation;
			const deviationType = encounter.encounter.xpDeviationType;
			let deviationText = "";
			let deviationClass = "";

			if (deviation < 0.1) {
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

			const sourceIndicator =
				encounter.source === "imported" ? " (Imported)" : "";

			encounterCard.innerHTML = `
                <div class="encounter-card-header">
                    <div>
                        <div class="encounter-card-title">
                            ${encounter.inputs.theme === "any" ? "Any Theme" : encounter.inputs.theme.charAt(0).toUpperCase() + encounter.inputs.theme.slice(1)} 
                            ${encounter.inputs.selectedStyle === "any" ? "" : " • " + ENCOUNTER_STYLES[encounter.inputs.selectedStyle]}
                            ${sourceIndicator}
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
                    <button class="btn-export export-encounter-btn" data-id="${encounter.id}">
                        <i class="fas fa-file-export"></i> Export
                    </button>
                </div>
            `;

			dom.encountersGrid.appendChild(encounterCard);

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

			const exportBtn = encounterCard.querySelector(".export-encounter-btn");
			exportBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				exportSingleEncounterFromLibrary(encounter.id);
			});
		});
	}
}

function renderEncounterFromSaved(savedEncounter) {
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

	if (savedEncounter.encounter.variety.preferred) {
		dom.summaryVariety.textContent = savedEncounter.encounter.variety
			.hasDuplicates
			? "Some duplicates"
			: "No duplicates";
	} else {
		dom.summaryVariety.textContent = "Not preferred";
	}

	let sourceText = "Newly Generated";
	let sourceClass = "";

	if (savedEncounter.source === "imported") {
		sourceText = "Imported";
		sourceClass = "imported";
	} else if (savedEncounter.source === "saved") {
		sourceText = "From Library";
	}

	dom.summarySource.textContent = sourceText;
	dom.summarySource.className = "summary-value " + sourceClass;

	dom.summaryMonsterCount.textContent = savedEncounter.encounter.monsterCount;
	dom.summaryBaseXP.textContent =
		savedEncounter.encounter.baseXP.toLocaleString() + " XP";
	dom.summaryMultiplier.textContent = `×${savedEncounter.encounter.multiplier}`;
	dom.summaryAdjustedXP.textContent =
		savedEncounter.encounter.adjustedXP.toLocaleString() + " XP";
	dom.summaryTargetXP.textContent =
		savedEncounter.encounter.targetXP.toLocaleString() + " XP";

	if (savedEncounter.inputs.themeFallback) {
		dom.themeFallbackNote.classList.remove("hidden");
	} else {
		dom.themeFallbackNote.classList.add("hidden");
	}

	dom.resultLabel.innerHTML = "";
	dom.resultLabel.className = "result-label";

	const percentageDiff = savedEncounter.encounter.xpDeviation / 100;
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

	dom.monstersContainer.innerHTML = "";

	savedEncounter.encounter.monsters.forEach((monster, index) => {
		const monsterCard = document.createElement("div");
		monsterCard.className = "monster-card";

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

		const viewDetailsBtn = monsterCard.querySelector(".view-details-btn");
		viewDetailsBtn.addEventListener("click", () => {
			showSavedMonsterModal(monster);
		});
	});
}

function showMonsterModal(monster) {
	dom.modalMonsterName.textContent = monster.name;
	dom.modalRole.textContent =
		monster.role.charAt(0).toUpperCase() + monster.role.slice(1);
	dom.modalCr.textContent = formatCR(monster.cr);
	dom.modalXp.textContent = getMonsterXP(monster).toLocaleString() + " XP";
	dom.modalType.textContent = monster.type || "Unknown";
	dom.modalSize.textContent = monster.size || "Unknown";
	dom.modalAc.textContent =
		monster.armor_class || monster.armour_class || "Unknown";
	dom.modalHp.textContent = monster.hit_points || "Unknown";
	dom.modalSpeed.textContent = monster.speed_formatted || "Unknown";

	if (monster.slug) {
		dom.open5eLink.href = `https://open5e.com/monsters/${monster.slug}`;
	} else {
		dom.open5eLink.href = `https://open5e.com/monsters/?search=${encodeURIComponent(monster.name)}`;
	}

	showModal(dom.monsterModal);
}

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

	if (monster.slug) {
		dom.open5eLink.href = `https://open5e.com/monsters/${monster.slug}`;
	} else {
		dom.open5eLink.href = `https://open5e.com/monsters/?search=${encodeURIComponent(monster.name)}`;
	}

	showModal(dom.monsterModal);
}

function loadImportedEncounter(encounterData) {
	AppState.currentEncounter = {
		partyLevel: encounterData.inputs.partyLevel,
		partySize: encounterData.inputs.partySize,
		theme: encounterData.inputs.theme,
		difficulty: encounterData.inputs.difficulty,
		selectedStyle: encounterData.inputs.selectedStyle,
		targetXP: encounterData.encounter.targetXP,
		encounter: {
			monsters: encounterData.encounter.monsters.map((m) => ({
				name: m.name,
				slug: m.slug,
				cr: m.cr,
				role: m.role,
				type: m.type,
				size: m.size,
				armor_class: m.ac,
				armour_class: m.ac,
				hit_points: m.hp,
				speed_formatted: m.speed,
				challenge_rating: m.cr,
			})),
			adjustedXP: encounterData.encounter.adjustedXP,
			styleMatch: encounterData.encounter.styleMatch,
			variety: encounterData.encounter.variety,
			success: encounterData.encounter.success,
		},
	};

	AppState.themeFallback = encounterData.inputs.themeFallback || false;
	AppState.currentSource = "imported";

	dom.partyLevelInput.value = encounterData.inputs.partyLevel;
	dom.partySizeInput.value = encounterData.inputs.partySize;
	dom.themeSelect.value = encounterData.inputs.theme;
	dom.difficultySelect.value = encounterData.inputs.difficulty;
	dom.encounterStyleSelect.value = encounterData.inputs.selectedStyle;
	dom.preferVarietyCheckbox.checked =
		encounterData.inputs.preferVariety || false;
	dom.lockThemeCheckbox.checked = encounterData.inputs.lockTheme || false;
	dom.lockStyleCheckbox.checked = encounterData.inputs.lockStyle || false;

	dom.regenerateBtn.disabled = true;

	renderEncounterFromSaved(encounterData);
	setView("results");
}

function viewSavedEncounter(encounterId) {
	const encounter = AppState.savedEncounters.find((e) => e.id === encounterId);
	if (!encounter) {
		showToast("Encounter not found.");
		return;
	}

	dom.partyLevelInput.value = encounter.inputs.partyLevel;
	dom.partySizeInput.value = encounter.inputs.partySize;
	dom.themeSelect.value = encounter.inputs.theme;
	dom.difficultySelect.value = encounter.inputs.difficulty;
	dom.encounterStyleSelect.value = encounter.inputs.selectedStyle;
	dom.preferVarietyCheckbox.checked = encounter.inputs.preferVariety;
	dom.lockThemeCheckbox.checked = encounter.inputs.lockTheme;
	dom.lockStyleCheckbox.checked = encounter.inputs.lockStyle;

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
	AppState.currentSource = encounter.source || "saved";

	dom.regenerateBtn.disabled = encounter.source === "imported";

	renderEncounterFromSaved(encounter);
	setView("results");
}

// ==================== CONFIRMATION MODAL ====================

let pendingAction = null;

function showClearLibraryConfirmation() {
	if (AppState.savedEncounters.length === 0) {
		showToast("No saved encounters to clear.");
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

function showDeleteConfirmation(encounterId, encounterName) {
	dom.confirmTitle.textContent = "Delete Saved Encounter";
	dom.confirmMessage.textContent = `Are you sure you want to delete the encounter "${encounterName}"? This action cannot be undone.`;

	pendingAction = {
		type: "deleteEncounter",
		data: encounterId,
	};

	showModal(dom.confirmModal);
}

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
				showToast("Encounter deleted successfully.");
			}
			break;
	}

	pendingAction = null;
	hideModal(dom.confirmModal);
}

// ==================== INITIALIZATION ====================

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

	// Export/Import event listeners
	dom.exportEncounterBtn.addEventListener("click", exportCurrentEncounter);
	dom.importEncounterBtn.addEventListener("click", () => dom.fileInput.click());
	dom.exportLibraryBtn.addEventListener("click", exportEntireLibrary);
	dom.importLibraryBtn.addEventListener("click", () => dom.fileInput.click());
	dom.importToEmptyBtn.addEventListener("click", () => dom.fileInput.click());

	// File input event listener for imports
	dom.fileInput.addEventListener("change", handleFileImport);

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

	console.log("D&D 5e Encounter Builder - Iteration 5 initialised");
}

// Initialize the app when the DOM is loaded
document.addEventListener("DOMContentLoaded", init);
