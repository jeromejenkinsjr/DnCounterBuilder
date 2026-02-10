/**
 * D&D 5e Encounter Builder — Iteration 4 (Vanilla JS)
 * Builds on Iteration 3 and keeps all behaviour working, adding:
 * - Save Encounter to localStorage
 * - Library view (browse, view details, delete, clear all)
 * - Lock Theme / Lock Style strictness toggles
 * - XP deviation percentage display in library cards
 *
 * IMPORTANT: No changes to XP tables, CR tables, or role heuristics.
 */

const API_BASE = "https://api.open5e.com/monsters/?limit=100";
const REQUEST_CAP = 10;

// Search controls (fast enough)
const TARGET_ATTEMPTS = 550;
const TOLERANCE = 0.15;

// Theme handling
const THEME_MIN_POOL_STRICT = 30;

// Variety constraints
const DUPLICATE_MAX = 2;

// localStorage key
const STORAGE_KEY = "dd5e_encounter_library_v1";

// -------------------- DMG DATA (unchanged from Iteration 2/3) --------------------

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

const CR_XP = new Map([
	["0", 10],
	["0.125", 25],
	["0.25", 50],
	["0.5", 100],
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
	lockTheme: document.getElementById("lockTheme"),
	lockStyle: document.getElementById("lockStyle"),

	generateBtn: document.getElementById("generateBtn"),
	regenBtn: document.getElementById("regenBtn"),
	saveBtn: document.getElementById("saveBtn"),

	viewLibraryBtn: document.getElementById("viewLibraryBtn"),
	backFromLibraryBtn: document.getElementById("backFromLibraryBtn"),
	clearLibraryBtn: document.getElementById("clearLibraryBtn"),

	loadingState: document.getElementById("loadingState"),
	errorState: document.getElementById("errorState"),
	resultsState: document.getElementById("resultsState"),
	libraryState: document.getElementById("libraryState"),

	errorMessage: document.getElementById("errorMessage"),
	retryBtn: document.getElementById("retryBtn"),

	resultBadge: document.getElementById("resultBadge"),
	summaryGrid: document.getElementById("summaryGrid"),
	summaryLine: document.getElementById("summaryLine"),
	countPill: document.getElementById("countPill"),
	monsterList: document.getElementById("monsterList"),

	libraryGrid: document.getElementById("libraryGrid"),
	libraryEmpty: document.getElementById("libraryEmpty"),

	modal: document.getElementById("monsterModal"),
	modalTitle: document.getElementById("modalTitle"),
	modalBody: document.getElementById("modalBody"),
	modalLink: document.getElementById("modalLink"),
	closeModalBtn: document.getElementById("closeModalBtn"),
	closeModalBtn2: document.getElementById("closeModalBtn2"),
};

// -------------------- App state --------------------

let lastInputs = null; // last used form values
let lastRenderedEncounter = null; // full encounter payload (serialisable)
let isGenerating = false;

// -------------------- UI state (mutually exclusive) --------------------

function setView(state) {
	// Mutually exclusive: hide all, then show one.
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsState.classList.add("hidden");
	dom.libraryState.classList.add("hidden");

	// Button enabled rules
	dom.generateBtn.disabled = false;
	dom.viewLibraryBtn.disabled = false;

	dom.regenBtn.disabled = !lastInputs;
	dom.saveBtn.disabled = !lastRenderedEncounter;

	if (isGenerating) {
		dom.generateBtn.disabled = true;
		dom.regenBtn.disabled = true;
		dom.saveBtn.disabled = true;
		dom.viewLibraryBtn.disabled = true;
	}

	if (state === "loading") {
		dom.loadingState.classList.remove("hidden");
	} else if (state === "error") {
		dom.errorState.classList.remove("hidden");
	} else if (state === "results") {
		dom.resultsState.classList.remove("hidden");
	} else if (state === "library") {
		dom.libraryState.classList.remove("hidden");
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

function titleCaseWord(s) {
	if (!s) return "";
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

function open5eMonsterUrl(monster) {
	const slug = monster.slug || monster.document__slug;
	if (slug) return `https://open5e.com/monsters/${encodeURIComponent(slug)}`;
	return "https://open5e.com/monsters/";
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

// -------------------- Role classification (UNCHANGED heuristics from Iteration 3) --------------------

function classifyRole(monster) {
	const crNum = parseCR(monster.cr);

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

	if (text.includes("spellcasting") || /\bspell\b/.test(text))
		return "spellcaster";

	const speedStr = (monster.speed || "").toString().toLowerCase();
	const speedMatch = speedStr.match(/(\d+)\s*ft/);
	const speed = speedMatch ? Number(speedMatch[1]) : null;
	if (speed != null && speed >= 40) return "skirmisher";

	const ac = monster.armour_class ?? monster.armor_class ?? monster.ac ?? null;
	const hp = monster.hit_points ?? monster.hp ?? null;

	const acNum = ac != null ? Number(ac) : null;
	const hpNum = hp != null ? Number(hp) : null;

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

	if (highAC || highHP) return "bruiser";

	if (crNum != null && crNum <= 0.5) return "swarm";
	if (hpNum != null && hpNum < hpBaseline * 0.75) return "swarm";

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

// -------------------- Theme pools + refinement toggles --------------------

/**
 * Iteration 4: Lock Theme override
 * - If lockTheme enabled and theme pool is too small: FAIL (no fallback to Any).
 * - If lockTheme disabled: keep Iteration 3 fallback behaviour.
 */
function buildCandidatePools(allMonsters, theme, lockTheme) {
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
		if (lockTheme) {
			throw new Error(
				"No valid encounter found for this theme with current constraints.",
			);
		}
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

// -------------------- Picking encounters + variety rules --------------------

function pickEncounterFromPool(pool, preferVariety) {
	const count = randInt(1, 4);
	const shuffled = shuffleInPlace([...pool]);

	const picked = [];
	const counts = new Map(); // key -> count

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

	// Fill remaining (respect variety preference and duplicate cap)
	let safety = 0;
	while (picked.length < count && safety < 250) {
		safety++;
		const m = shuffled[randInt(0, shuffled.length - 1)];
		const key = m.slug || m.name;
		const current = counts.get(key) || 0;

		let maxAllowed = allowDupes ? DUPLICATE_MAX : 1;

		// If preferVariety but pool is genuinely too small, allow duplicates (still max 2).
		if (!allowDupes && pool.length < count) maxAllowed = DUPLICATE_MAX;

		if (current < maxAllowed) {
			counts.set(key, current + 1);
			picked.push(m);
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

function roleCounts(monsters) {
	const counts = { bruiser: 0, skirmisher: 0, spellcaster: 0, swarm: 0 };
	for (const m of monsters) {
		const r = classifyRole(m);
		counts[r] = (counts[r] || 0) + 1;
	}
	return counts;
}

/**
 * Style match rule (Iteration 3):
 * - style any => matched
 * - 1 monster => that monster should match
 * - 2–4 monsters => at least 2 match the role
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

// -------------------- Search / scoring (Iteration 3 logic + Iteration 4 Lock Style) --------------------

/**
 * Iteration 4: Lock Style override
 * - If lockStyle enabled and style != any:
 *   - Reject any attempt that isn't FULLY matched.
 *   - If nothing works after attempts, FAIL with a clear error.
 */
function findBestEncounter(pool, targetXP, style, preferVariety, lockStyle) {
	let best = null;
	const roleWanted = styleToRole(style);

	for (let i = 0; i < TARGET_ATTEMPTS; i++) {
		const monsters = pickEncounterFromPool(pool, preferVariety);

		const baseXP = baseXPForEncounter(monsters);
		if (baseXP == null) continue;

		const mult = encounterMultiplier(monsters.length);
		const adjustedXP = Math.round(baseXP * mult);

		const xpScore =
			targetXP === 0 ? 999 : Math.abs(adjustedXP - targetXP) / targetXP;

		const styleStatus = styleMatchStatus(monsters, style);

		// Lock style: hard filter
		if (lockStyle && roleWanted !== "any" && styleStatus.status !== "matched") {
			continue;
		}

		const dup = duplicateReport(monsters);

		// Soft penalties (Iteration 3)
		let stylePenalty = 0;
		if (roleWanted !== "any") {
			if (styleStatus.status === "matched") stylePenalty = 0;
			else if (styleStatus.status === "partial") stylePenalty = 0.08;
			else stylePenalty = 0.18;
		}

		let varietyPenalty = 0;
		if (preferVariety && dup.anyDupes) varietyPenalty = 0.08;

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

		// Early exit: XP on target + style matched (if requested / locked)
		const xpOk = xpScore <= TOLERANCE;
		const styleOk = roleWanted === "any" || styleStatus.status === "matched";
		const varietyOk =
			!preferVariety || !dup.anyDupes || pool.length < monsters.length;

		if (xpOk && styleOk && varietyOk) {
			best.label = "on_target";
			return best;
		}
	}

	// If lock style was enabled and we found nothing, show required error.
	if (!best) {
		if (lockStyle && styleToRole(style) !== "any") {
			throw new Error("No encounter meets the selected style requirements.");
		}
		throw new Error(
			"Could not generate a suitable encounter from the available monster pool.",
		);
	}

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

function renderSummary(payload) {
	const { inputs, output, quality } = payload;

	const {
		partyLevel,
		partySize,
		theme,
		difficulty,
		style,
		preferVariety,
		lockTheme,
		lockStyle,
	} = inputs;

	const {
		monsters,
		baseXP,
		multiplier,
		adjustedXP,
		targetXP,
		resultLabel,
		didThemeFallback,
		themePoolSize,
	} = output;

	const { styleMatch, varietyResult } = quality;

	dom.summaryGrid.innerHTML = "";

	const themeLabel = theme === "any" ? "Any" : theme;
	const themeText = didThemeFallback
		? `${themeLabel} (fell back to Any — theme pool too small: ${themePoolSize})`
		: themeLabel;

	dom.summaryGrid.appendChild(kv("Party level", String(partyLevel)));
	dom.summaryGrid.appendChild(kv("Party size", String(partySize)));
	dom.summaryGrid.appendChild(kv("Theme", themeText));
	dom.summaryGrid.appendChild(kv("Difficulty", titleCaseWord(difficulty)));

	dom.summaryGrid.appendChild(kv("Encounter style", styleLabel(style)));
	dom.summaryGrid.appendChild(kv("Style match", styleMatch));
	dom.summaryGrid.appendChild(
		kv("Variety", preferVariety ? "Prefer variety" : "Any"),
	);
	dom.summaryGrid.appendChild(kv("Variety result", varietyResult));

	dom.summaryGrid.appendChild(
		kv("Lock theme", lockTheme ? "Enabled" : "Disabled"),
	);
	dom.summaryGrid.appendChild(
		kv("Lock style", lockStyle ? "Enabled" : "Disabled"),
	);

	dom.summaryGrid.appendChild(kv("Monster count", String(monsters.length)));
	dom.summaryGrid.appendChild(kv("Base XP", String(baseXP)));
	dom.summaryGrid.appendChild(kv("Multiplier", `x${multiplier}`));
	dom.summaryGrid.appendChild(kv("Adjusted XP", String(adjustedXP)));
	dom.summaryGrid.appendChild(kv("Target XP", String(targetXP)));

	const delta = adjustedXP - targetXP;
	dom.summaryGrid.appendChild(
		kv("Difference", `${delta >= 0 ? "+" : ""}${delta}`),
	);

	if (resultLabel === "on_target") {
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
		const ac = m.ac ?? "—";
		const hp = m.hp ?? "—";
		const speed = m.speed ?? "—";
		const role = m.role ?? "—";
		const xp = m.xp ?? "—";

		const li = document.createElement("li");
		li.className = "monster-item";
		li.innerHTML = `
      <div class="monster-top">
        <div class="monster-name">${escapeHtml(m.name)}</div>
        <div class="meta">
          <span class="tag">Role: ${escapeHtml(titleCaseWord(role))}</span>
          <span class="tag">CR: ${escapeHtml(crDisp)}</span>
          <span class="tag">XP: ${escapeHtml(String(xp))}</span>
          <span class="tag">Type: ${escapeHtml(String(type))}</span>
          <span class="tag">Size: ${escapeHtml(String(size))}</span>
          <span class="tag">AC: ${escapeHtml(String(ac))}</span>
          <span class="tag">HP: ${escapeHtml(String(hp))}</span>
          <span class="tag">Speed: ${escapeHtml(String(speed))}</span>
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
	dom.modalTitle.textContent = monster.name || "Monster";
	dom.modalLink.href = open5eMonsterUrl(monster);

	dom.modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><div class="k">Role</div><div class="v">${escapeHtml(titleCaseWord(monster.role || "—"))}</div></div>
      <div class="detail"><div class="k">CR</div><div class="v">${escapeHtml(String(crDisp))}</div></div>
      <div class="detail"><div class="k">XP (by CR)</div><div class="v">${escapeHtml(String(monster.xp ?? "—"))}</div></div>
      <div class="detail"><div class="k">Type</div><div class="v">${escapeHtml(String(monster.type ?? "—"))}</div></div>
      <div class="detail"><div class="k">Size</div><div class="v">${escapeHtml(String(monster.size ?? "—"))}</div></div>
      <div class="detail"><div class="k">Alignment</div><div class="v">${escapeHtml(String(monster.alignment ?? "—"))}</div></div>
      <div class="detail"><div class="k">AC</div><div class="v">${escapeHtml(String(monster.ac ?? "—"))}</div></div>
      <div class="detail"><div class="k">HP</div><div class="v">${escapeHtml(String(monster.hp ?? "—"))}</div></div>
      <div class="detail"><div class="k">Speed</div><div class="v">${escapeHtml(String(monster.speed ?? "—"))}</div></div>
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

// -------------------- Encounter object normalisation (JSON-safe) --------------------

/**
 * Converts Open5e monster objects into a compact, JSON-safe structure for:
 * - rendering consistently
 * - saving to localStorage
 */
function toSavedMonster(monster) {
	const crNum = parseCR(monster.cr);
	const xp = crNum == null ? null : monsterXPFromCR(crNum);

	const ac = monster.armour_class ?? monster.armor_class ?? monster.ac ?? null;
	const hp = monster.hit_points ?? monster.hp ?? null;

	return {
		name: monster.name,
		slug: monster.slug || monster.document__slug || null,
		cr: monster.cr,
		xp: xp ?? null,
		role: classifyRole(monster),
		type: monster.type ?? null,
		size: monster.size ?? null,
		ac: ac != null ? String(ac) : null,
		hp: hp != null ? String(hp) : null,
		speed: monster.speed ?? null,
		alignment: monster.alignment ?? null,
	};
}

function toOpen5eLikeMonster(savedMonster) {
	// For rendering/modals, we can treat saved monsters as “monster objects”.
	// Keep the same property names we use elsewhere.
	return {
		...savedMonster,
		// compatibility fields
		document__slug: savedMonster.slug,
	};
}

// -------------------- Quality readouts (Iteration 3 + required display strings) --------------------

function computeQuality(monsters, style, preferVariety, pool) {
	const styleWanted = styleToRole(style);
	const styleInfo = styleMatchStatus(monsters, style);

	let styleMatch = "Matched";
	if (styleWanted !== "any") {
		if (styleInfo.status === "matched") styleMatch = "Matched";
		else if (styleInfo.status === "partial") styleMatch = "Partial";
		else styleMatch = "Fell back";
	}

	const dup = duplicateReport(monsters);
	let varietyResult = "No duplicates";
	if (preferVariety) {
		if (dup.anyDupes) varietyResult = "Some duplicates due to limited pool";
		else varietyResult = "No duplicates";
	} else {
		varietyResult = dup.anyDupes ? "Some duplicates" : "No duplicates";
	}

	return { styleMatch, varietyResult };
}

// -------------------- Generation flow --------------------

async function generateEncounterFromInputs(inputs) {
	const partyLevel = clampInt(inputs.partyLevel, 1, 10, 5);
	const partySize = clampInt(inputs.partySize, 1, 6, 4);
	const theme = (inputs.theme || "any").toLowerCase();
	const difficulty = (inputs.difficulty || "medium").toLowerCase();
	const style = (inputs.style || "any").toLowerCase();
	const preferVariety = !!inputs.preferVariety;
	const lockTheme = !!inputs.lockTheme;
	const lockStyle = !!inputs.lockStyle;

	isGenerating = true;
	setView("loading");

	try {
		const allMonsters = await getMonstersCached();

		const { pool, didThemeFallback, themePoolSize } = buildCandidatePools(
			allMonsters,
			theme,
			lockTheme,
		);

		const targetXP = partyTargetXP(partyLevel, partySize, difficulty);

		const best = findBestEncounter(
			pool,
			targetXP,
			style,
			preferVariety,
			lockStyle,
		);

		// Turn picked monsters into a serialisable format (also used for rendering).
		const savedMonsters = best.monsters.map(toSavedMonster);

		const baseXP = savedMonsters.reduce((sum, m) => sum + (m.xp ?? 0), 0);
		const multiplier = best.mult;
		const adjustedXP = Math.round(baseXP * multiplier);

		const quality = computeQuality(best.monsters, style, preferVariety, pool);

		const payload = {
			inputs: {
				partyLevel,
				partySize,
				theme,
				difficulty,
				style,
				preferVariety,
				lockTheme,
				lockStyle,
				didThemeFallback,
			},
			output: {
				monsters: savedMonsters,
				baseXP,
				multiplier,
				adjustedXP,
				targetXP,
				resultLabel: best.label, // "on_target" | "closest_match"
				didThemeFallback,
				themePoolSize,
			},
			quality: {
				styleMatch: quality.styleMatch,
				varietyResult: quality.varietyResult,
			},
			metadata: {
				timestamp: Date.now(),
			},
		};

		// Store "last" references for reroll / return from library
		lastInputs = {
			partyLevel,
			partySize,
			theme,
			difficulty,
			style,
			preferVariety,
			lockTheme,
			lockStyle,
		};
		lastRenderedEncounter = payload;

		// Render
		renderSummary(payload);
		renderMonsters(payload.output.monsters.map(toOpen5eLikeMonster));

		isGenerating = false;
		setView("results");
	} catch (err) {
		isGenerating = false;
		dom.errorMessage.textContent = err?.message || "Unknown error.";
		setView("error");
	}
}

// -------------------- localStorage Library Helpers (required) --------------------

function loadSavedEncounters() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveEncounter(encounterPayload) {
	// Full encounter object must be JSON-safe.
	const library = loadSavedEncounters();

	const id = `enc_${Date.now()}_${Math.random().toString(16).slice(2)}`;

	const entry = {
		id,
		timestamp: Date.now(),
		// Save FULL encounter object (inputs + outputs + quality + metadata)
		...encounterPayload,
		metadata: {
			...(encounterPayload.metadata || {}),
			timestamp: Date.now(),
		},
	};

	library.unshift(entry); // newest first
	localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
	return entry;
}

function deleteEncounter(id) {
	const library = loadSavedEncounters().filter((e) => e.id !== id);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

function clearEncounterLibrary() {
	localStorage.removeItem(STORAGE_KEY);
}

// -------------------- Library rendering + comparison (display only) --------------------

function deviationText(adjusted, target) {
	if (!target || target === 0) return "—";
	const pct = Math.round((Math.abs(adjusted - target) / target) * 100);
	const over = adjusted - target;
	if (over === 0) return "0% on target";
	return `${over > 0 ? "+" : "−"}${pct}% ${over > 0 ? "over" : "under"} target`;
}

function resultBadgeText(label) {
	return label === "on_target" ? "✅ On target" : "⚠️ Closest match";
}

function renderLibrary() {
	const library = loadSavedEncounters();
	dom.libraryGrid.innerHTML = "";

	if (!library.length) {
		dom.libraryEmpty.classList.remove("hidden");
		return;
	}
	dom.libraryEmpty.classList.add("hidden");

	for (const entry of library) {
		const inputs = entry.inputs || {};
		const out = entry.output || {};
		const quality = entry.quality || {};
		const monsters = out.monsters || [];
		const adjusted = out.adjustedXP ?? 0;
		const target = out.targetXP ?? 0;

		const theme = inputs.theme ?? "any";
		const style = inputs.style ?? "any";

		const card = document.createElement("div");
		card.className = "library-card";

		card.innerHTML = `
      <div class="library-top">
        <div class="library-title">${escapeHtml(resultBadgeText(out.resultLabel))}</div>
        <span class="pill ${out.resultLabel === "on_target" ? "ok" : "warn"}">${escapeHtml(titleCaseWord(inputs.difficulty || "—"))}</span>
      </div>

      <div class="library-meta">
        <span class="tag">Theme: ${escapeHtml(theme === "any" ? "Any" : theme)}</span>
        <span class="tag">Style: ${escapeHtml(styleLabel(style))}</span>
        <span class="tag">Count: ${escapeHtml(String(monsters.length))}</span>
        <span class="tag">Adj/Target: ${escapeHtml(String(adjusted))}/${escapeHtml(String(target))}</span>
        <span class="tag">Deviation: ${escapeHtml(deviationText(adjusted, target))}</span>
      </div>

      <div class="library-actions">
        <button class="btn primary" data-action="view" data-id="${escapeHtml(entry.id)}">View</button>
        <button class="btn danger" data-action="delete" data-id="${escapeHtml(entry.id)}">Delete</button>
      </div>

      <p class="small muted" style="margin-top:10px;">
        Style: ${escapeHtml(quality.styleMatch || "—")} · Variety: ${escapeHtml(quality.varietyResult || "—")}
      </p>
    `;

		card.querySelector('[data-action="view"]').addEventListener("click", () => {
			// Re-open encounter layout from saved entry
			openSavedEncounter(entry.id);
		});

		card
			.querySelector('[data-action="delete"]')
			.addEventListener("click", () => {
				deleteEncounter(entry.id);
				renderLibrary();
			});

		dom.libraryGrid.appendChild(card);
	}
}

function openSavedEncounter(id) {
	const library = loadSavedEncounters();
	const entry = library.find((e) => e.id === id);
	if (!entry) return;

	// Save as "lastRenderedEncounter" so Back restores correctly
	lastRenderedEncounter = entry;

	// Optionally update form to match saved inputs (nice DM tool behaviour)
	const inputs = entry.inputs || {};
	if (inputs.partyLevel != null) dom.partyLevel.value = inputs.partyLevel;
	if (inputs.partySize != null) dom.partySize.value = inputs.partySize;
	if (inputs.theme != null) dom.theme.value = inputs.theme;
	if (inputs.difficulty != null) dom.difficulty.value = inputs.difficulty;
	if (inputs.style != null) dom.style.value = inputs.style;
	dom.preferVariety.checked = !!inputs.preferVariety;
	dom.lockTheme.checked = !!inputs.lockTheme;
	dom.lockStyle.checked = !!inputs.lockStyle;

	// Render the saved encounter
	renderSummary(entry);
	renderMonsters((entry.output?.monsters || []).map(toOpen5eLikeMonster));

	setView("results");
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
		lockTheme: dom.lockTheme.checked,
		lockStyle: dom.lockStyle.checked,
	};
	await generateEncounterFromInputs(inputs);
});

dom.regenBtn.addEventListener("click", async () => {
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
		lockTheme: dom.lockTheme.checked,
		lockStyle: dom.lockStyle.checked,
	};
	await generateEncounterFromInputs(inputs);
});

dom.retryBtn.addEventListener("click", async () => {
	const inputs = {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
		lockTheme: dom.lockTheme.checked,
		lockStyle: dom.lockStyle.checked,
	};
	await generateEncounterFromInputs(inputs);
});

dom.saveBtn.addEventListener("click", () => {
	if (!lastRenderedEncounter) return;
	const saved = saveEncounter(lastRenderedEncounter);
	// Small UX feedback without adding a new state
	dom.saveBtn.textContent = "Saved!";
	dom.saveBtn.disabled = true;
	setTimeout(() => {
		dom.saveBtn.textContent = "Save encounter";
		dom.saveBtn.disabled = false;
		setView("results");
	}, 700);
});

dom.viewLibraryBtn.addEventListener("click", () => {
	renderLibrary();
	setView("library");
});

dom.backFromLibraryBtn.addEventListener("click", () => {
	// Returning restores last generated encounter (if any), otherwise idle view.
	if (lastRenderedEncounter) {
		renderSummary(lastRenderedEncounter);
		renderMonsters(
			(lastRenderedEncounter.output?.monsters || []).map(toOpen5eLikeMonster),
		);
		setView("results");
	} else {
		// Nothing generated yet -> show nothing but keep UI clean by hiding library
		setView("error");
		dom.errorMessage.textContent =
			"No encounter generated yet. Generate an encounter first.";
	}
});

dom.clearLibraryBtn.addEventListener("click", () => {
	const ok = window.confirm(
		"Clear all saved encounters? This cannot be undone.",
	);
	if (!ok) return;
	clearEncounterLibrary();
	renderLibrary();
});

// Initialise
document.addEventListener("DOMContentLoaded", () => {
	isGenerating = false;
	setView("error");
	dom.errorMessage.textContent =
		"Generate an encounter to begin, or open your saved encounter library.";
});
