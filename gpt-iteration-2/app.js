/**
 * D&D 5e Encounter Builder — Iteration 2 (Vanilla JS)
 * Adds DMG-style XP balancing:
 * - XP thresholds (levels 1–10) + party size multiplier
 * - CR -> XP mapping (fractions included)
 * - Encounter multipliers by number of monsters
 * - Search approach: many random attempts, score by closeness to target, tolerance band
 *
 * Still:
 * - Open5e monsters endpoint
 * - Pagination + session cache
 * - Theme filtering + robust fallback to Any
 * - 1–4 monsters total
 * - Mutually exclusive UI states
 */

const API_BASE = "https://api.open5e.com/monsters/?limit=100";
const REQUEST_CAP = 10; // prevent infinite pagination loops
const TARGET_ATTEMPTS = 450; // search attempts per generation
const TOLERANCE = 0.15; // ±15% band for "On target"
const THEME_MIN_POOL = 30; // if theme yields fewer than this, we fall back to Any

// -------------------- DMG DATA (hard-coded) --------------------

// XP thresholds per character (DMG), levels 1–10
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

// Monster XP by CR (DMG)
const CR_XP = new Map([
	["0", 10],
	["0.125", 25], // 1/8
	["0.25", 50], // 1/4
	["0.5", 100], // 1/2
	["1", 200],
	["2", 450],
	["3", 700],
	["4", 1100],
	["5", 1800],
	["6", 2300],
	["7", 2900],
	["8", 3900],
	["9", 5000],
	["10", 5900],
]);

// Encounter multipliers (DMG)
function encounterMultiplier(count) {
	if (count <= 1) return 1;
	if (count === 2) return 1.5;
	if (count >= 3 && count <= 6) return 2;
	if (count >= 7 && count <= 10) return 2.5;
	if (count >= 11 && count <= 14) return 3;
	return 4;
}

// -------------------- Session cache --------------------

const Cache = {
	monsters: null, // array
	fetchedAt: null,
};

// -------------------- DOM --------------------

const dom = {
	form: document.getElementById("encounterForm"),
	partyLevel: document.getElementById("partyLevel"),
	partySize: document.getElementById("partySize"),
	theme: document.getElementById("theme"),
	difficulty: document.getElementById("difficulty"),

	generateBtn: document.getElementById("generateBtn"),
	regenBtn: document.getElementById("regenBtn"),

	// state containers
	loadingState: document.getElementById("loadingState"),
	errorState: document.getElementById("errorState"),
	resultsState: document.getElementById("resultsState"),

	errorMessage: document.getElementById("errorMessage"),
	retryBtn: document.getElementById("retryBtn"),

	// results
	resultBadge: document.getElementById("resultBadge"),
	summaryGrid: document.getElementById("summaryGrid"),
	summaryLine: document.getElementById("summaryLine"),
	countPill: document.getElementById("countPill"),
	monsterList: document.getElementById("monsterList"),

	// modal
	modal: document.getElementById("monsterModal"),
	modalTitle: document.getElementById("modalTitle"),
	modalBody: document.getElementById("modalBody"),
	modalLink: document.getElementById("modalLink"),
	closeModalBtn: document.getElementById("closeModalBtn"),
	closeModalBtn2: document.getElementById("closeModalBtn2"),
};

let lastInputs = null;

// -------------------- UI state (mutually exclusive) --------------------

function setView(state) {
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsState.classList.add("hidden");

	dom.generateBtn.disabled = false;
	dom.regenBtn.disabled = !lastInputs;

	if (state === "loading") {
		dom.loadingState.classList.remove("hidden");
		dom.generateBtn.disabled = true;
		dom.regenBtn.disabled = true;
	} else if (state === "error") {
		dom.errorState.classList.remove("hidden");
		dom.regenBtn.disabled = !lastInputs; // only allow reroll if we have previous inputs
	} else if (state === "results") {
		dom.resultsState.classList.remove("hidden");
		dom.regenBtn.disabled = false;
	}
}

// -------------------- Helpers --------------------

function clampInt(value, min, max, fallback) {
	const n = Number.parseInt(value, 10);
	if (Number.isNaN(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

function normaliseType(type) {
	return (type || "").toString().trim().toLowerCase();
}

function escapeHtml(str) {
	return String(str)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function randInt(minInclusive, maxInclusive) {
	return (
		Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive
	);
}

function shuffleInPlace(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// Parse CR that may be "1/2", "1/4", "1/8", or numeric string
function parseCR(crValue) {
	if (crValue == null) return null;

	if (typeof crValue === "number") return crValue;

	if (typeof crValue === "string") {
		const s = crValue.trim();
		if (!s) return null;

		if (s.includes("/")) {
			const [a, b] = s.split("/").map(Number);
			if (!Number.isNaN(a) && !Number.isNaN(b) && b !== 0) return a / b;
			return null;
		}

		const n = Number(s);
		return Number.isNaN(n) ? null : n;
	}

	return null;
}

// Convert CR number to a stable key for CR_XP map
function crToXpKey(crNumber) {
	// Keep common fractions exact
	if (crNumber === 0) return "0";
	if (crNumber === 0.125) return "0.125";
	if (crNumber === 0.25) return "0.25";
	if (crNumber === 0.5) return "0.5";
	// Integers (and any other values we might include)
	return String(crNumber);
}

function monsterXPFromCR(crNumber) {
	const key = crToXpKey(crNumber);
	return CR_XP.get(key) ?? null;
}

function open5eMonsterUrl(monster) {
	const slug = monster.slug || monster.document__slug;
	if (slug) return `https://open5e.com/monsters/${encodeURIComponent(slug)}`;
	return "https://open5e.com/monsters/";
}

function formatCRDisplay(crRaw) {
	// Pretty fractions for UI
	const n = parseCR(crRaw);
	if (n === null) return "—";
	if (n === 0.5) return "½";
	if (n === 0.25) return "¼";
	if (n === 0.125) return "⅛";
	// integer-ish
	if (Number.isInteger(n)) return String(n);
	return String(n);
}

// -------------------- Fetching + caching --------------------

async function getMonstersCached() {
	if (Array.isArray(Cache.monsters) && Cache.monsters.length)
		return Cache.monsters;

	let url = API_BASE;
	let requests = 0;
	const monsters = [];

	while (url && requests < REQUEST_CAP) {
		requests++;

		const res = await fetch(url);
		if (!res.ok) throw new Error(`Open5e request failed (HTTP ${res.status}).`);

		const data = await res.json();
		if (Array.isArray(data.results)) monsters.push(...data.results);

		url = data.next; // Open5e returns next page URL or null
	}

	// Keep only monsters that can participate in XP maths:
	// - must have name + type
	// - must have CR parseable
	// - CR must map to XP (we exclude missing CR/XP)
	const cleaned = monsters.filter((m) => {
		if (!m || !m.name || !m.type) return false;
		const crNum = parseCR(m.cr);
		if (crNum === null) return false;
		const xp = monsterXPFromCR(crNum);
		return xp !== null;
	});

	if (!cleaned.length)
		throw new Error("No suitable monsters returned from Open5e.");

	Cache.monsters = cleaned;
	Cache.fetchedAt = new Date();
	return cleaned;
}

// -------------------- Filtering --------------------

function getCandidatePool(allMonsters, theme) {
	const themeKey = (theme || "any").toLowerCase();
	if (themeKey === "any") {
		return { pool: allMonsters, didFallback: false };
	}

	// Case-insensitive against monster.type.
	// Using includes() is pragmatic because Open5e types can be compound strings (e.g., "humanoid (any race)").
	const themed = allMonsters.filter((m) =>
		normaliseType(m.type).includes(themeKey),
	);

	if (themed.length < THEME_MIN_POOL) {
		return { pool: allMonsters, didFallback: true };
	}

	return { pool: themed, didFallback: false };
}

// -------------------- XP calculations --------------------

function partyTargetXP(level, size, difficulty) {
	const row = XP_THRESHOLDS[level];
	if (!row) throw new Error("Invalid party level for thresholds.");
	const perChar = row[difficulty];
	if (typeof perChar !== "number") throw new Error("Invalid difficulty.");
	return perChar * size;
}

function baseXPForEncounter(monsters) {
	let sum = 0;
	for (const m of monsters) {
		const crNum = parseCR(m.cr);
		const xp = monsterXPFromCR(crNum);
		if (xp == null) return null; // should not happen if candidates were cleaned
		sum += xp;
	}
	return sum;
}

// -------------------- Encounter generation (search) --------------------

function pickEncounterFromPool(pool) {
	const count = randInt(1, 4);
	const shuffled = shuffleInPlace([...pool]);

	// Prefer unique picks first
	const picked = [];
	const seenKey = new Map(); // key -> count

	// First pass: unique
	for (const m of shuffled) {
		if (picked.length >= count) break;
		const key = m.slug || m.name;
		if (!seenKey.has(key)) {
			seenKey.set(key, 1);
			picked.push(m);
		}
	}

	// If we still need more, allow duplicates up to 2 of the same monster
	let safety = 0;
	while (picked.length < count && safety < 200) {
		safety++;
		const m = shuffled[randInt(0, shuffled.length - 1)];
		const key = m.slug || m.name;
		const current = seenKey.get(key) || 0;
		if (current < 2) {
			seenKey.set(key, current + 1);
			picked.push(m);
		}
	}

	return picked.length ? picked : [shuffled[0]].filter(Boolean);
}

/**
 * Search for the best encounter by repeated random attempts.
 * - Score = relative distance from target (abs(adj-target)/target)
 * - If within tolerance band, label "On target" and may stop early
 * - Otherwise return closest match
 */
function findBestEncounter(pool, targetXP) {
	let best = null;

	for (let i = 0; i < TARGET_ATTEMPTS; i++) {
		const monsters = pickEncounterFromPool(pool);

		const baseXP = baseXPForEncounter(monsters);
		if (baseXP == null) continue;

		const mult = encounterMultiplier(monsters.length);
		const adjustedXP = Math.round(baseXP * mult);

		const score =
			targetXP === 0 ? 999 : Math.abs(adjustedXP - targetXP) / targetXP;

		if (!best || score < best.score) {
			best = { monsters, baseXP, mult, adjustedXP, score };
		}

		// Early success stop
		if (score <= TOLERANCE) {
			best.label = "on_target";
			return best;
		}
	}

	if (!best)
		throw new Error(
			"Could not generate a suitable encounter from the available monster pool.",
		);
	best.label = "closest_match";
	return best;
}

// -------------------- Rendering --------------------

function kv(k, v) {
	const div = document.createElement("div");
	div.className = "kv";
	div.innerHTML = `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`;
	return div;
}

function renderSummary(payload) {
	const {
		partyLevel,
		partySize,
		theme,
		didFallback,
		difficulty,
		monsters,
		baseXP,
		mult,
		adjustedXP,
		targetXP,
		label,
	} = payload;

	dom.summaryGrid.innerHTML = "";

	const themeLabel = theme === "any" ? "Any" : theme;
	const themeText = didFallback
		? `${themeLabel} (fell back to Any)`
		: themeLabel;

	const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

	dom.summaryGrid.appendChild(kv("Party level", String(partyLevel)));
	dom.summaryGrid.appendChild(kv("Party size", String(partySize)));
	dom.summaryGrid.appendChild(kv("Theme", themeText));
	dom.summaryGrid.appendChild(kv("Difficulty", diffLabel));

	dom.summaryGrid.appendChild(kv("Monster count", String(monsters.length)));
	dom.summaryGrid.appendChild(kv("Base XP", String(baseXP)));
	dom.summaryGrid.appendChild(kv("Multiplier", `x${mult}`));
	dom.summaryGrid.appendChild(kv("Adjusted XP", String(adjustedXP)));

	dom.summaryGrid.appendChild(kv("Target XP", String(targetXP)));
	const delta = adjustedXP - targetXP;
	dom.summaryGrid.appendChild(
		kv("Difference", `${delta >= 0 ? "+" : ""}${delta}`),
	);

	if (label === "on_target") {
		dom.resultBadge.textContent = "✅ On target";
		dom.resultBadge.classList.remove("warn");
		dom.resultBadge.classList.add("ok");
		dom.summaryLine.textContent = `Adjusted XP lands within ±${Math.round(TOLERANCE * 100)}% of the target threshold.`;
	} else {
		dom.resultBadge.textContent = "⚠️ Closest match";
		dom.resultBadge.classList.remove("ok");
		dom.resultBadge.classList.add("warn");
		dom.summaryLine.textContent = `No encounter landed within ±${Math.round(TOLERANCE * 100)}% after ${TARGET_ATTEMPTS} attempts — showing the closest match.`;
	}
}

function renderMonsters(monsters) {
	dom.monsterList.innerHTML = "";
	dom.countPill.textContent = `${monsters.length} monster${monsters.length === 1 ? "" : "s"}`;

	for (const m of monsters) {
		const crDisp = formatCRDisplay(m.cr);
		const type = m.type ?? "—";
		const size = m.size ?? "—";
		const ac = m.armour_class ?? m.armor_class ?? m.ac ?? "—";
		const hp = m.hit_points ?? m.hp ?? "—";

		const li = document.createElement("li");
		li.className = "monster-item";
		li.innerHTML = `
      <div class="monster-top">
        <div class="monster-name">${escapeHtml(m.name)}</div>
        <div class="meta">
          <span class="tag">CR: ${escapeHtml(crDisp)}</span>
          <span class="tag">Type: ${escapeHtml(String(type))}</span>
          <span class="tag">Size: ${escapeHtml(String(size))}</span>
          <span class="tag">AC: ${escapeHtml(String(ac))}</span>
          <span class="tag">HP: ${escapeHtml(String(hp))}</span>
        </div>
      </div>
      <div class="monster-actions">
        <button class="btn" type="button" data-action="details">Details</button>
        <a class="btn primary" href="${open5eMonsterUrl(m)}" target="_blank" rel="noreferrer noopener">View on Open5e</a>
      </div>
    `;

		li.querySelector('[data-action="details"]').addEventListener("click", () =>
			openDetailsModal(m),
		);
		dom.monsterList.appendChild(li);
	}
}

// -------------------- Modal --------------------

function openDetailsModal(monster) {
	const crDisp = formatCRDisplay(monster.cr);
	const crNum = parseCR(monster.cr);
	const xp = crNum == null ? "—" : (monsterXPFromCR(crNum) ?? "—");

	const type = monster.type ?? "—";
	const size = monster.size ?? "—";
	const ac = monster.armour_class ?? monster.armor_class ?? monster.ac ?? "—";
	const hp = monster.hit_points ?? monster.hp ?? "—";
	const align = monster.alignment ?? "—";
	const speed = monster.speed ?? "—";

	dom.modalTitle.textContent = monster.name || "Monster";
	dom.modalLink.href = open5eMonsterUrl(monster);

	dom.modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><div class="k">CR</div><div class="v">${escapeHtml(String(crDisp))}</div></div>
      <div class="detail"><div class="k">XP (by CR)</div><div class="v">${escapeHtml(String(xp))}</div></div>
      <div class="detail"><div class="k">Type</div><div class="v">${escapeHtml(String(type))}</div></div>
      <div class="detail"><div class="k">Size</div><div class="v">${escapeHtml(String(size))}</div></div>
      <div class="detail"><div class="k">Alignment</div><div class="v">${escapeHtml(String(align))}</div></div>
      <div class="detail"><div class="k">AC</div><div class="v">${escapeHtml(String(ac))}</div></div>
      <div class="detail"><div class="k">HP</div><div class="v">${escapeHtml(String(hp))}</div></div>
      <div class="detail"><div class="k">Speed</div><div class="v">${escapeHtml(String(speed))}</div></div>
    </div>
  `;

	if (typeof dom.modal.showModal === "function") {
		dom.modal.showModal();
	} else {
		window.open(open5eMonsterUrl(monster), "_blank", "noopener,noreferrer");
	}
}

function closeModal() {
	if (dom.modal.open) dom.modal.close();
}

dom.closeModalBtn.addEventListener("click", closeModal);
dom.closeModalBtn2.addEventListener("click", closeModal);
dom.modal.addEventListener("click", (e) => {
	const rect = dom.modal.getBoundingClientRect();
	const outside =
		e.clientX < rect.left ||
		e.clientX > rect.right ||
		e.clientY < rect.top ||
		e.clientY > rect.bottom;
	if (outside) closeModal();
});

// -------------------- Main generation flow --------------------

async function generateEncounter(inputs) {
	const partyLevel = clampInt(inputs.partyLevel, 1, 10, 5);
	const partySize = clampInt(inputs.partySize, 1, 6, 4);
	const theme = (inputs.theme || "any").toLowerCase();
	const difficulty = (inputs.difficulty || "medium").toLowerCase();

	try {
		setView("loading");

		const allMonsters = await getMonstersCached();

		const { pool, didFallback } = getCandidatePool(allMonsters, theme);

		// Target XP for this party + difficulty
		const targetXP = partyTargetXP(partyLevel, partySize, difficulty);

		// Find best encounter by random search attempts
		const best = findBestEncounter(pool, targetXP);

		const payload = {
			partyLevel,
			partySize,
			theme,
			didFallback,
			difficulty,
			monsters: best.monsters,
			baseXP: best.baseXP,
			mult: best.mult,
			adjustedXP: best.adjustedXP,
			targetXP,
			label: best.label,
		};

		// render
		renderSummary(payload);
		renderMonsters(best.monsters);

		// store inputs for reroll
		lastInputs = { partyLevel, partySize, theme, difficulty };

		setView("results");
	} catch (err) {
		console.error(err);
		dom.errorMessage.textContent = err?.message || "Unknown error.";
		setView("error");
	}
}

// -------------------- Events --------------------

dom.form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
	};

	await generateEncounter(inputs);
});

dom.regenBtn.addEventListener("click", async () => {
	// Use current form values for reroll (spec)
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
	};
	await generateEncounter(inputs);
});

dom.retryBtn.addEventListener("click", async () => {
	// retry uses current form values
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
	};
	await generateEncounter(inputs);
});

// Initialise
document.addEventListener("DOMContentLoaded", () => {
	setView("idle");
});
