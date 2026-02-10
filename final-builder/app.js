/**
 * D&D 5e Encounter Builder — Iteration 5 (Vanilla JS)
 * Builds on Iteration 4 and keeps all behaviour working, adding:
 * - Export Encounter (JSON download)
 * - Import Encounter (JSON file picker + validation + restore + save to library)
 *
 * IMPORTANT: No changes to generation logic, XP maths, or role heuristics.
 */

const APP_ITERATION = 5;

const API_BASE = "https://api.open5e.com/monsters/?limit=100";
const REQUEST_CAP = 10;

// Search controls
const TARGET_ATTEMPTS = 550;
const TOLERANCE = 0.15;

// Theme handling
const THEME_MIN_POOL_STRICT = 30;

// Variety constraints
const DUPLICATE_MAX = 2;

// localStorage key
const STORAGE_KEY = "dd5e_encounter_library_v1";

// -------------------- DMG DATA (unchanged) --------------------

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

	exportBtn: document.getElementById("exportBtn"),
	importBtn: document.getElementById("importBtn"),
	importFileInput: document.getElementById("importFileInput"),

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

	toast: document.getElementById("toast"),
};

// -------------------- App state --------------------

let lastInputs = null; // last used form values (enables Reroll)
let lastRenderedEncounter = null; // full encounter payload (serialisable)
let isGenerating = false;

// -------------------- UI state (mutually exclusive) --------------------

function setView(state) {
	dom.loadingState.classList.add("hidden");
	dom.errorState.classList.add("hidden");
	dom.resultsState.classList.add("hidden");
	dom.libraryState.classList.add("hidden");

	// Button enabled rules
	dom.generateBtn.disabled = false;
	dom.viewLibraryBtn.disabled = false;

	dom.regenBtn.disabled = !lastInputs;
	dom.saveBtn.disabled = !lastRenderedEncounter;
	dom.exportBtn.disabled = !lastRenderedEncounter;

	// Import should always be usable (even in error/results/library),
	// but not during generation.
	dom.importBtn.disabled = false;

	if (isGenerating) {
		dom.generateBtn.disabled = true;
		dom.regenBtn.disabled = true;
		dom.saveBtn.disabled = true;
		dom.exportBtn.disabled = true;
		dom.viewLibraryBtn.disabled = true;
		dom.importBtn.disabled = true;
	}

	if (state === "loading") dom.loadingState.classList.remove("hidden");
	else if (state === "error") dom.errorState.classList.remove("hidden");
	else if (state === "results") dom.resultsState.classList.remove("hidden");
	else if (state === "library") dom.libraryState.classList.remove("hidden");
}

// -------------------- Toast messages (non-state) --------------------

let toastTimer = null;
function showToast(message, type = "ok") {
	dom.toast.textContent = message;
	dom.toast.classList.remove("hidden", "ok", "err");
	dom.toast.classList.add(type === "err" ? "err" : "ok");

	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		dom.toast.classList.add("hidden");
	}, 1800);
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

function makeEncounterId(ts = Date.now()) {
	return `enc_${ts}_${Math.random().toString(16).slice(2)}`;
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

// -------------------- Role classification (UNCHANGED heuristics) --------------------

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
	const counts = new Map();

	const allowDupes = !preferVariety;

	for (const m of shuffled) {
		if (picked.length >= count) break;
		const key = m.slug || m.name;
		if (!counts.has(key)) {
			counts.set(key, 1);
			picked.push(m);
		}
	}

	let safety = 0;
	while (picked.length < count && safety < 250) {
		safety++;
		const m = shuffled[randInt(0, shuffled.length - 1)];
		const key = m.slug || m.name;
		const current = counts.get(key) || 0;

		let maxAllowed = allowDupes ? DUPLICATE_MAX : 1;
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

// -------------------- Search / scoring + Lock Style --------------------

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

		// Hard filter if Lock Style is enabled
		if (lockStyle && roleWanted !== "any" && styleStatus.status !== "matched") {
			continue;
		}

		const dup = duplicateReport(monsters);

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

		const xpOk = xpScore <= TOLERANCE;
		const styleOk = roleWanted === "any" || styleStatus.status === "matched";
		const varietyOk =
			!preferVariety || !dup.anyDupes || pool.length < monsters.length;

		if (xpOk && styleOk && varietyOk) {
			best.label = "on_target";
			return best;
		}
	}

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

	const themeLabel = inputs.theme === "any" ? "Any" : inputs.theme;
	const themeText = output.didThemeFallback
		? `${themeLabel} (fell back to Any — theme pool too small: ${output.themePoolSize})`
		: themeLabel;

	dom.summaryGrid.innerHTML = "";

	dom.summaryGrid.appendChild(kv("Party level", String(inputs.partyLevel)));
	dom.summaryGrid.appendChild(kv("Party size", String(inputs.partySize)));
	dom.summaryGrid.appendChild(kv("Theme", themeText));
	dom.summaryGrid.appendChild(
		kv("Difficulty", titleCaseWord(inputs.difficulty)),
	);

	dom.summaryGrid.appendChild(kv("Encounter style", styleLabel(inputs.style)));
	dom.summaryGrid.appendChild(kv("Style match", quality.styleMatch));
	dom.summaryGrid.appendChild(
		kv("Variety", inputs.preferVariety ? "Prefer variety" : "Any"),
	);
	dom.summaryGrid.appendChild(kv("Variety result", quality.varietyResult));

	dom.summaryGrid.appendChild(
		kv("Lock theme", inputs.lockTheme ? "Enabled" : "Disabled"),
	);
	dom.summaryGrid.appendChild(
		kv("Lock style", inputs.lockStyle ? "Enabled" : "Disabled"),
	);

	dom.summaryGrid.appendChild(
		kv("Monster count", String(output.monsters.length)),
	);
	dom.summaryGrid.appendChild(kv("Base XP", String(output.baseXP)));
	dom.summaryGrid.appendChild(kv("Multiplier", `x${output.multiplier}`));
	dom.summaryGrid.appendChild(kv("Adjusted XP", String(output.adjustedXP)));
	dom.summaryGrid.appendChild(kv("Target XP", String(output.targetXP)));

	const delta = output.adjustedXP - output.targetXP;
	dom.summaryGrid.appendChild(
		kv("Difference", `${delta >= 0 ? "+" : ""}${delta}`),
	);

	if (output.resultLabel === "on_target") {
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
          <span class="tag">CR: ${escapeHtml(String(crDisp))}</span>
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

// -------------------- Encounter normalisation (JSON-safe) --------------------

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
	return { ...savedMonster, document__slug: savedMonster.slug };
}

// -------------------- Quality readouts --------------------

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

function ensureExportShape(payload) {
	// Iteration/version + required identity fields for export/import.
	const ts = payload?.metadata?.timestamp ?? Date.now();
	const id = payload?.id ?? payload?.metadata?.id ?? makeEncounterId(ts);

	return {
		iteration: APP_ITERATION,
		id,
		timestamp: ts,
		...payload,
		metadata: {
			...(payload.metadata || {}),
			id,
			timestamp: ts,
		},
	};
}

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

		const savedMonsters = best.monsters.map(toSavedMonster);

		const baseXP = savedMonsters.reduce((sum, m) => sum + (m.xp ?? 0), 0);
		const multiplier = best.mult;
		const adjustedXP = Math.round(baseXP * multiplier);

		const quality = computeQuality(best.monsters, style, preferVariety, pool);

		const payload = ensureExportShape({
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
				resultLabel: best.label, // on_target | closest_match
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
		});

		// Enable Reroll from generated inputs
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

// -------------------- localStorage Library Helpers --------------------

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

function writeLibrary(entries) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function saveEncounter(encounterPayload) {
	const library = loadSavedEncounters();
	const ts = Date.now();
	const id = makeEncounterId(ts);

	const entry = ensureExportShape({
		...encounterPayload,
		id,
		timestamp: ts,
		metadata: { ...(encounterPayload.metadata || {}), id, timestamp: ts },
	});

	library.unshift(entry);
	writeLibrary(library);
	return entry;
}

function saveEncounterExact(encounterPayload) {
	// Used for import: keep the original id/timestamp if possible.
	const library = loadSavedEncounters();
	const incoming = ensureExportShape(encounterPayload);

	const exists = library.some((e) => e.id === incoming.id);
	const toStore = exists
		? ensureExportShape({
				...incoming,
				id: makeEncounterId(incoming.timestamp),
				metadata: {
					...(incoming.metadata || {}),
					id: makeEncounterId(incoming.timestamp),
				},
			})
		: incoming;

	library.unshift(toStore);
	writeLibrary(library);
	return toStore;
}

function deleteEncounter(id) {
	const library = loadSavedEncounters().filter((e) => e.id !== id);
	writeLibrary(library);
}

function clearEncounterLibrary() {
	localStorage.removeItem(STORAGE_KEY);
}

// -------------------- Library rendering + comparison --------------------

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

		card
			.querySelector('[data-action="view"]')
			.addEventListener("click", () => openSavedEncounter(entry.id));
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

	// When viewing a saved encounter, this is still a "loaded encounter".
	lastRenderedEncounter = ensureExportShape(entry);

	// Populate form to match
	const inputs = entry.inputs || {};
	if (inputs.partyLevel != null) dom.partyLevel.value = inputs.partyLevel;
	if (inputs.partySize != null) dom.partySize.value = inputs.partySize;
	if (inputs.theme != null) dom.theme.value = inputs.theme;
	if (inputs.difficulty != null) dom.difficulty.value = inputs.difficulty;
	if (inputs.style != null) dom.style.value = inputs.style;
	dom.preferVariety.checked = !!inputs.preferVariety;
	dom.lockTheme.checked = !!inputs.lockTheme;
	dom.lockStyle.checked = !!inputs.lockStyle;

	// If we open from library, we do NOT automatically enable Reroll,
	// because "Reroll" is tied to the last generation run.
	// The user can explicitly generate again.
	lastInputs = null;

	renderSummary(lastRenderedEncounter);
	renderMonsters((entry.output?.monsters || []).map(toOpen5eLikeMonster));
	setView("results");
}

// -------------------- Iteration 5: Export / Import --------------------

function exportEncounter(encounter) {
	const data = ensureExportShape(encounter);

	const level = data.inputs?.partyLevel ?? "x";
	const diff = data.inputs?.difficulty ?? "unknown";
	const ts = data.timestamp ?? Date.now();

	const filename = `encounter_lvl${level}_${diff}_${ts}.json`;
	const json = JSON.stringify(data, null, 2);

	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();

	URL.revokeObjectURL(url);
}

function validateEncounterData(data) {
	// Basic shape + compatibility rules:
	// - must contain iteration/version and not be newer than this app
	// - must include inputs + output + monsters + XP fields
	if (!data || typeof data !== "object")
		return { ok: false, reason: "not_object" };

	const iteration = data.iteration ?? data.version ?? null;
	if (typeof iteration !== "number")
		return { ok: false, reason: "missing_iteration" };
	if (iteration > APP_ITERATION) return { ok: false, reason: "newer_version" };

	if (!data.inputs || typeof data.inputs !== "object")
		return { ok: false, reason: "missing_inputs" };
	if (!data.output || typeof data.output !== "object")
		return { ok: false, reason: "missing_output" };

	const out = data.output;
	if (!Array.isArray(out.monsters) || out.monsters.length < 1)
		return { ok: false, reason: "missing_monsters" };

	// Validate minimum monster fields for restore/render
	for (const m of out.monsters) {
		if (!m || typeof m !== "object")
			return { ok: false, reason: "bad_monster" };
		if (!m.name || !m.cr)
			return { ok: false, reason: "monster_missing_fields" };
		// XP isn't strictly required to be present in older versions, but in Iter 5 export it must exist.
		// We'll require it here for reliability:
		if (typeof m.xp !== "number")
			return { ok: false, reason: "monster_missing_xp" };
	}

	// XP values required
	const xpFields = ["baseXP", "adjustedXP", "targetXP", "multiplier"];
	for (const f of xpFields) {
		if (typeof out[f] !== "number" || Number.isNaN(out[f]))
			return { ok: false, reason: `missing_${f}` };
	}

	// resultLabel required
	if (out.resultLabel !== "on_target" && out.resultLabel !== "closest_match") {
		return { ok: false, reason: "bad_result_label" };
	}

	// quality object required for full restore (Iter 5 export includes it)
	if (!data.quality || typeof data.quality !== "object")
		return { ok: false, reason: "missing_quality" };
	if (typeof data.quality.styleMatch !== "string")
		return { ok: false, reason: "missing_style_match" };
	if (typeof data.quality.varietyResult !== "string")
		return { ok: false, reason: "missing_variety_result" };

	// identity fields
	if (!data.id || typeof data.id !== "string")
		return { ok: false, reason: "missing_id" };
	if (typeof data.timestamp !== "number")
		return { ok: false, reason: "missing_timestamp" };

	return { ok: true };
}

async function importEncounter(file) {
	const text = await file.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error("Invalid or incompatible encounter file.");
	}

	const verdict = validateEncounterData(data);
	if (!verdict.ok) {
		if (verdict.reason === "newer_version") {
			throw new Error(
				"Invalid or incompatible encounter file. This file was exported by a newer version of the app.",
			);
		}
		throw new Error("Invalid or incompatible encounter file.");
	}

	const restored = ensureExportShape(data);

	// Store imported encounter into the saved encounters library (required).
	const stored = saveEncounterExact(restored);

	// Load it without rerunning generation.
	lastRenderedEncounter = stored;

	// Populate UI to match inputs
	const inputs = stored.inputs || {};
	dom.partyLevel.value = inputs.partyLevel ?? dom.partyLevel.value;
	dom.partySize.value = inputs.partySize ?? dom.partySize.value;
	dom.theme.value = inputs.theme ?? dom.theme.value;
	dom.difficulty.value = inputs.difficulty ?? dom.difficulty.value;
	dom.style.value = inputs.style ?? dom.style.value;
	dom.preferVariety.checked = !!inputs.preferVariety;
	dom.lockTheme.checked = !!inputs.lockTheme;
	dom.lockStyle.checked = !!inputs.lockStyle;

	// Requirement: importing disables regenerate until user explicitly regenerates
	lastInputs = null;

	renderSummary(stored);
	renderMonsters((stored.output?.monsters || []).map(toOpen5eLikeMonster));

	setView("results");
}

// -------------------- Events --------------------

function collectInputsFromForm() {
	return {
		partyLevel: dom.partyLevel.value,
		partySize: dom.partySize.value,
		theme: dom.theme.value,
		difficulty: dom.difficulty.value,
		style: dom.style.value,
		preferVariety: dom.preferVariety.checked,
		lockTheme: dom.lockTheme.checked,
		lockStyle: dom.lockStyle.checked,
	};
}

dom.form.addEventListener("submit", async (e) => {
	e.preventDefault();
	await generateEncounterFromInputs(collectInputsFromForm());
});

dom.regenBtn.addEventListener("click", async () => {
	await generateEncounterFromInputs(collectInputsFromForm());
});

dom.retryBtn.addEventListener("click", async () => {
	await generateEncounterFromInputs(collectInputsFromForm());
});

dom.saveBtn.addEventListener("click", () => {
	if (!lastRenderedEncounter) return;
	saveEncounter(lastRenderedEncounter);

	dom.saveBtn.textContent = "Saved!";
	dom.saveBtn.disabled = true;
	showToast("Encounter saved successfully", "ok");

	setTimeout(() => {
		dom.saveBtn.textContent = "Save encounter";
		dom.saveBtn.disabled = false;
		setView("results");
	}, 700);
});

dom.exportBtn.addEventListener("click", () => {
	if (!lastRenderedEncounter) return;
	exportEncounter(lastRenderedEncounter);
	showToast("Encounter exported successfully", "ok");
});

dom.importBtn.addEventListener("click", () => {
	if (isGenerating) return;
	dom.importFileInput.value = "";
	dom.importFileInput.click();
});

dom.importFileInput.addEventListener("change", async (e) => {
	const file = e.target.files && e.target.files[0];
	if (!file) return;

	try {
		await importEncounter(file);
		showToast("Encounter imported successfully", "ok");
	} catch (err) {
		dom.errorMessage.textContent =
			err?.message || "Invalid or incompatible encounter file.";
		setView("error");
		showToast("Invalid or incompatible encounter file.", "err");
	}
});

dom.viewLibraryBtn.addEventListener("click", () => {
	renderLibrary();
	setView("library");
});

dom.backFromLibraryBtn.addEventListener("click", () => {
	if (lastRenderedEncounter) {
		renderSummary(lastRenderedEncounter);
		renderMonsters(
			(lastRenderedEncounter.output?.monsters || []).map(toOpen5eLikeMonster),
		);
		setView("results");
	} else {
		setView("error");
		dom.errorMessage.textContent =
			"No encounter loaded yet. Generate or import an encounter first.";
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

// -------------------- Initialise --------------------

document.addEventListener("DOMContentLoaded", () => {
	isGenerating = false;
	setView("error");
	dom.errorMessage.textContent =
		"Generate an encounter to begin, import one, or open your saved encounter library.";
});
