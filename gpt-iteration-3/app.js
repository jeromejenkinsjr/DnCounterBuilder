/**
 * D&D 5e Encounter Builder — Iteration 3 (Vanilla JS)
 * Builds on Iteration 2 XP balancing, adding “encounter quality”:
 * - Encounter Style dropdown (soft constraint via role heuristics)
 * - Prefer variety toggle (avoid duplicates if possible)
 * - Stronger theme handling: 100% on-theme unless pool too small (fallback clearly reported)
 * - Quality readout in summary: style match + variety result
 *
 * Still NO tactics/terrain/narrative.
 */

const API_BASE = "https://api.open5e.com/monsters/?limit=100";
const REQUEST_CAP = 10;

// Search controls (keep fast enough)
const TARGET_ATTEMPTS = 550; // within requested 400–800 range
const TOLERANCE = 0.15; // ±15%

// Theme handling
const THEME_MIN_POOL_STRICT = 30; // if theme pool smaller, allow fallback to Any
const THEME_FORCE_ON_THEME = true;

// Variety constraints
const DUPLICATE_MAX = 2; // never more than 2 of same monster (even without variety toggle)

// -------------------- DMG DATA (keep in one clean place) --------------------

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
	monsters: null,
	fetchedAt: null,
};

// -------------------- DOM --------------------

const dom = {
	form: document.getElementById("encounterForm"),
	partyLevel: document.getElementById("partyLevel"),
	partySize: document.getElementById("partySize"),
	theme: document.getElementById("theme"),
	difficulty: document.getElementById("difficulty"),
	style: document.getElementById("style"),
	preferVariety: document.getElementById("preferVariety"),

	generateBtn: document.getElementById("generateBtn"),
	regenBtn: document.getElementById("regenBtn"),

	loadingState: document.getElementById("loadingState"),
	errorState: document.getElementById("errorState"),
	resultsState: document.getElementById("resultsState"),

	errorMessage: document.getElementById("errorMessage"),
	retryBtn: document.getElementById("retryBtn"),

	resultBadge: document.getElementById("resultBadge"),
	summaryGrid: document.getElementById("summaryGrid"),
	summaryLine: document.getElementById("summaryLine"),
	countPill: document.getElementById("countPill"),
	monsterList: document.getElementById("monsterList"),

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
		dom.regenBtn.disabled = !lastInputs;
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

function escapeHtml(str) {
	return String(str)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function normaliseType(type) {
	return (type || "").toString().trim().toLowerCase();
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

// -------------------- CR parsing + XP --------------------

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

function crToXpKey(crNumber) {
	if (crNumber === 0) return "0";
	if (crNumber === 0.125) return "0.125";
	if (crNumber === 0.25) return "0.25";
	if (crNumber === 0.5) return "0.5";
	return String(crNumber);
}

function monsterXPFromCR(crNumber) {
	const key = crToXpKey(crNumber);
	return CR_XP.get(key) ?? null;
}

function formatCRDisplay(crRaw) {
	const n = parseCR(crRaw);
	if (n === null) return "—";
	if (n === 0.5) return "½";
	if (n === 0.25) return "¼";
	if (n === 0.125) return "⅛";
	if (Number.isInteger(n)) return String(n);
	return String(n);
}

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
		if (xp == null) return null;
		sum += xp;
	}
	return sum;
}

function open5eMonsterUrl(monster) {
	const slug = monster.slug || monster.document__slug;
	if (slug) return `https://open5e.com/monsters/${encodeURIComponent(slug)}`;
	return "https://open5e.com/monsters/";
}

// -------------------- Fetching + cache --------------------

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
		url = data.next;
	}

	// Only keep monsters that are “XP-eligible”.
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

// -------------------- Role classification (heuristics) --------------------

/**
 * Role: exactly ONE of:
 * - spellcaster
 * - skirmisher
 * - bruiser
 * - swarm
 *
 * Heuristics are intentionally lightweight and explainable.
 * We pick in an order that makes sense for “identity”:
 * spellcaster -> skirmisher -> bruiser -> swarm (fallback).
 */
function classifyRole(monster) {
	const crNum = parseCR(monster.cr);
	const xp = crNum == null ? null : monsterXPFromCR(crNum);

	// Text indicators for spellcasting
	const text = [
		monster.actions,
		monster.special_abilities,
		monster.reactions,
		monster.legendary_actions,
		monster.desc,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	if (text.includes("spellcasting") || /\bspell\b/.test(text)) {
		return "spellcaster";
	}

	// Skirmisher: high speed (>= 40) if speed data exists
	// Open5e "speed" often looks like "40 ft., climb 20 ft."
	const speedStr = (monster.speed || "").toString().toLowerCase();
	const speedMatch = speedStr.match(/(\d+)\s*ft/);
	const speed = speedMatch ? Number(speedMatch[1]) : null;
	if (speed != null && speed >= 40) {
		return "skirmisher";
	}

	// Bruiser: high AC OR high HP for its CR
	const ac = monster.armour_class ?? monster.armor_class ?? monster.ac ?? null;
	const hp = monster.hit_points ?? monster.hp ?? null;

	// Simple, explainable thresholds:
	// - AC >= 16 is “tough” for low-mid CRs
	// - HP >= expected baseline for CR => bruiser
	// Baseline roughness: use XP as a proxy if available, otherwise use CR itself.
	const acNum = ac != null ? Number(ac) : null;
	const hpNum = hp != null ? Number(hp) : null;

	// HP baseline by CR (lightweight): you can tune these later.
	// This is intentionally not DMG-accurate HP tables; it's a heuristic only.
	const hpBaseline =
		crNum == null
			? 0
			: crNum <= 0.5
				? 12
				: crNum <= 1
					? 22
					: crNum <= 2
						? 45
						: crNum <= 4
							? 75
							: crNum <= 6
								? 110
								: 140;

	const highAC = acNum != null && acNum >= 16;
	const highHP = hpNum != null && hpNum >= hpBaseline;

	if (highAC || highHP) {
		return "bruiser";
	}

	// Swarm/Minion: low HP for its CR OR CR <= 1/2
	if (crNum != null && crNum <= 0.5) return "swarm";
	if (hpNum != null && hpNum < hpBaseline * 0.75) return "swarm";

	// Default
	return "swarm";
}

function styleToRole(style) {
	switch (style) {
		case "skirmish":
			return "skirmisher";
		case "bruisers":
			return "bruiser";
		case "spellcasters":
			return "spellcaster";
		case "swarm":
			return "swarm";
		default:
			return "any";
	}
}

// -------------------- Candidate filtering (theme strength) --------------------

/**
 * Theme handling rules (Iteration 3):
 * - If Theme != Any:
 *   - Must be 100% on-theme unless the theme pool is too small.
 *   - If pool too small, fall back to Any and record that.
 */
function buildCandidatePools(allMonsters, theme) {
	const themeKey = (theme || "any").toLowerCase();
	if (themeKey === "any") {
		return {
			pool: allMonsters,
			didThemeFallback: false,
			themePoolSize: allMonsters.length,
		};
	}

	const themed = allMonsters.filter((m) =>
		normaliseType(m.type).includes(themeKey),
	);

	if (themed.length < THEME_MIN_POOL_STRICT) {
		return {
			pool: allMonsters,
			didThemeFallback: true,
			themePoolSize: themed.length,
		};
	}

	return {
		pool: themed,
		didThemeFallback: false,
		themePoolSize: themed.length,
	};
}

// -------------------- Encounter picking w/ variety rules --------------------

function pickEncounterFromPool(pool, preferVariety) {
	const count = randInt(1, 4);
	const shuffled = shuffleInPlace([...pool]);

	const picked = [];
	const counts = new Map(); // key -> count

	// If preferVariety: aim for unique only.
	// If not: still avoid duplicates where possible, but can use up to DUPLICATE_MAX.
	const allowDupes = !preferVariety;

	// First pass: unique
	for (const m of shuffled) {
		if (picked.length >= count) break;
		const key = m.slug || m.name;
		if (!counts.has(key)) {
			counts.set(key, 1);
			picked.push(m);
		}
	}

	// If we still need more:
	let safety = 0;
	while (picked.length < count && safety < 250) {
		safety++;
		const m = shuffled[randInt(0, shuffled.length - 1)];
		const key = m.slug || m.name;
		const current = counts.get(key) || 0;

		// PreferVariety: only allow duplicates if absolutely necessary (tiny pool).
		// Non-variety: allow duplicates up to DUPLICATE_MAX.
		const maxAllowed = allowDupes ? DUPLICATE_MAX : 1;

		if (current < maxAllowed) {
			counts.set(key, current + 1);
			picked.push(m);
		} else {
			// If preferVariety but pool is too small, we must allow duplicates (still max 2).
			if (!allowDupes && pool.length < count) {
				if (current < DUPLICATE_MAX) {
					counts.set(key, current + 1);
					picked.push(m);
				}
			}
		}
	}

	return picked.length ? picked : [shuffled[0]].filter(Boolean);
}

function duplicateReport(monsters) {
	const map = new Map();
	for (const m of monsters) {
		const k = m.slug || m.name;
		map.set(k, (map.get(k) || 0) + 1);
	}
	const anyDupes = [...map.values()].some((v) => v > 1);
	const max = Math.max(...map.values());
	return { anyDupes, max };
}

// -------------------- Scoring (XP closeness + quality) --------------------

function roleCounts(monsters) {
	const counts = { bruiser: 0, skirmisher: 0, spellcaster: 0, swarm: 0 };
	for (const m of monsters) {
		const r = classifyRole(m);
		counts[r] = (counts[r] || 0) + 1;
	}
	return counts;
}

/**
 * Style match rule:
 * - If style == any => matched
 * - If 1 monster => that monster should match the role
 * - If 2–4 monsters => at least 2 should match the role
 */
function styleMatchStatus(monsters, style) {
	const roleWanted = styleToRole(style);
	if (roleWanted === "any")
		return { status: "matched", matchedCount: 0, needed: 0, roleWanted };

	const counts = roleCounts(monsters);
	const matchedCount = counts[roleWanted] || 0;

	const needed = monsters.length === 1 ? 1 : 2;

	if (matchedCount >= needed)
		return { status: "matched", matchedCount, needed, roleWanted };
	if (matchedCount >= 1)
		return { status: "partial", matchedCount, needed, roleWanted };
	return { status: "fell_back", matchedCount, needed, roleWanted };
}

/**
 * The search chooses the best encounter by minimising a combined score:
 * - XP score (dominant): relative distance from target adjusted XP
 * - Style penalty (soft): discourage misses when style requested
 * - Variety penalty: discourage duplicates when preferVariety on
 *
 * We still short-circuit if XP is within tolerance AND style is matched (or style any).
 */
function findBestEncounter(pool, targetXP, style, preferVariety) {
	let best = null;
	const roleWanted = styleToRole(style);

	for (let i = 0; i < TARGET_ATTEMPTS; i++) {
		const monsters = pickEncounterFromPool(pool, preferVariety);

		const baseXP = baseXPForEncounter(monsters);
		if (baseXP == null) continue;

		const mult = encounterMultiplier(monsters.length);
		const adjustedXP = Math.round(baseXP * mult);

		// XP score: main objective
		const xpScore =
			targetXP === 0 ? 999 : Math.abs(adjustedXP - targetXP) / targetXP;

		// Style penalty (soft)
		const styleStatus = styleMatchStatus(monsters, style);
		let stylePenalty = 0;
		if (roleWanted !== "any") {
			if (styleStatus.status === "matched") stylePenalty = 0;
			else if (styleStatus.status === "partial") stylePenalty = 0.08;
			else stylePenalty = 0.18;
		}

		// Variety penalty (soft)
		const dup = duplicateReport(monsters);
		let varietyPenalty = 0;
		if (preferVariety) {
			if (dup.anyDupes) varietyPenalty = 0.08; // discourage duplicates
			if (dup.max > DUPLICATE_MAX) varietyPenalty = 0.5; // should never happen
		}

		// Combined score (keep XP dominant)
		const combined = xpScore + stylePenalty + varietyPenalty;

		if (!best || combined < best.combined) {
			best = {
				monsters,
				baseXP,
				mult,
				adjustedXP,
				xpScore,
				combined,
				styleStatus,
				dup,
			};
		}

		// Early exit only if XP is on target AND style is matched (if requested).
		const xpOk = xpScore <= TOLERANCE;
		const styleOk = roleWanted === "any" || styleStatus.status === "matched";
		const varietyOk =
			!preferVariety || !dup.anyDupes || pool.length < monsters.length;

		if (xpOk && styleOk && varietyOk) {
			best.label = "on_target";
			return best;
		}
	}

	if (!best)
		throw new Error(
			"Could not generate a suitable encounter from the available monster pool.",
		);
	best.label = best.xpScore <= TOLERANCE ? "on_target" : "closest_match";
	return best;
}

// -------------------- Rendering --------------------

function kv(k, v) {
	const div = document.createElement("div");
	div.className = "kv";
	div.innerHTML = `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`;
	return div;
}

function titleCaseWord(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function styleLabel(style) {
	if (style === "any") return "Any";
	if (style === "skirmish") return "Skirmish";
	if (style === "bruisers") return "Bruisers";
	if (style === "spellcasters") return "Spellcasters";
	if (style === "swarm") return "Swarm";
	return style;
}

function renderSummary(payload) {
	const {
		partyLevel,
		partySize,
		theme,
		difficulty,
		style,
		preferVariety,
		didThemeFallback,
		themePoolSize,
		monsters,
		baseXP,
		mult,
		adjustedXP,
		targetXP,
		label,
		styleStatus,
		varietyStatus,
	} = payload;

	dom.summaryGrid.innerHTML = "";

	const themeLabel = theme === "any" ? "Any" : theme;
	const themeText = didThemeFallback
		? `${themeLabel} (fell back to Any — theme pool too small: ${themePoolSize})`
		: themeLabel;

	const diffLabel = titleCaseWord(difficulty);

	dom.summaryGrid.appendChild(kv("Party level", String(partyLevel)));
	dom.summaryGrid.appendChild(kv("Party size", String(partySize)));
	dom.summaryGrid.appendChild(kv("Theme", themeText));
	dom.summaryGrid.appendChild(kv("Difficulty", diffLabel));

	dom.summaryGrid.appendChild(kv("Encounter style", styleLabel(style)));
	dom.summaryGrid.appendChild(kv("Style match", styleStatus));
	dom.summaryGrid.appendChild(
		kv("Variety", preferVariety ? "Prefer variety" : "Any"),
	);
	dom.summaryGrid.appendChild(kv("Variety result", varietyStatus));

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
		const role = classifyRole(m);

		const li = document.createElement("li");
		li.className = "monster-item";
		li.innerHTML = `
      <div class="monster-top">
        <div class="monster-name">${escapeHtml(m.name)}</div>
        <div class="meta">
          <span class="tag">Role: ${escapeHtml(titleCaseWord(role))}</span>
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
	const role = classifyRole(monster);

	dom.modalTitle.textContent = monster.name || "Monster";
	dom.modalLink.href = open5eMonsterUrl(monster);

	dom.modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><div class="k">Role</div><div class="v">${escapeHtml(titleCaseWord(role))}</div></div>
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
	const style = (inputs.style || "any").toLowerCase();
	const preferVariety = !!inputs.preferVariety;

	try {
		setView("loading");

		const allMonsters = await getMonstersCached();

		// Theme strength + fallback reporting
		const { pool, didThemeFallback, themePoolSize } = buildCandidatePools(
			allMonsters,
			theme,
		);

		const targetXP = partyTargetXP(partyLevel, partySize, difficulty);

		const best = findBestEncounter(pool, targetXP, style, preferVariety);

		// Compute quality readouts
		const styleWanted = styleToRole(style);
		const styleInfo = best.styleStatus;

		let styleResult = "Matched";
		if (styleWanted !== "any") {
			if (styleInfo.status === "matched") styleResult = "Matched";
			else if (styleInfo.status === "partial") styleResult = "Partial";
			else styleResult = "Fell back";
		}

		const dup = best.dup;
		let varietyResult = "No duplicates";
		if (preferVariety) {
			if (dup.anyDupes) {
				// If the pool is tiny, duplicates are sometimes unavoidable.
				varietyResult = "Some duplicates due to limited pool";
			} else {
				varietyResult = "No duplicates";
			}
		} else {
			varietyResult = dup.anyDupes ? "Some duplicates" : "No duplicates";
		}

		const payload = {
			partyLevel,
			partySize,
			theme,
			difficulty,
			style,
			preferVariety,
			didThemeFallback,
			themePoolSize,
			monsters: best.monsters,
			baseXP: best.baseXP,
			mult: best.mult,
			adjustedXP: best.adjustedXP,
			targetXP,
			label: best.label,
			styleStatus: styleResult,
			varietyStatus: varietyResult,
		};

		renderSummary(payload);
		renderMonsters(best.monsters);

		lastInputs = {
			partyLevel,
			partySize,
			theme,
			difficulty,
			style,
			preferVariety,
		};
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
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
	};
	await generateEncounter(inputs);
});

dom.regenBtn.addEventListener("click", async () => {
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
	};
	await generateEncounter(inputs);
});

dom.retryBtn.addEventListener("click", async () => {
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
	};
	await generateEncounter(inputs);
});

document.addEventListener("DOMContentLoaded", () => {
	setView("idle");
});
