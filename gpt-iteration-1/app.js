/**
 * Iteration 1 — D&D 5e Encounter Builder (Vanilla JS)
 * - Fetch monsters from Open5e
 * - Light filtering by CR range and optional theme (monster.type)
 * - Randomly choose 1–4 monsters, avoid duplicates where possible
 * - Session cache in-memory to avoid refetching every regenerate
 * - Pagination with request cap to prevent infinite loops
 */

const API_BASE = "https://api.open5e.com/monsters/";
const REQUEST_CAP = 10; // hard cap to prevent infinite loops
const MIN_CANDIDATES = 120; // aim to gather enough to pick varied encounters

// In-memory session cache (resets on page refresh)
const cache = {
	allMonsters: null, // array of monster objects
	fetchedAt: null,
};

// DOM
const form = document.getElementById("encounterForm");
const partyLevelInput = document.getElementById("partyLevel");
const partySizeInput = document.getElementById("partySize");
const themeSelect = document.getElementById("theme");

const generateBtn = document.getElementById("generateBtn");
const regenBtn = document.getElementById("regenBtn");

const statusEl = document.getElementById("status");
const resultsSection = document.getElementById("results");

const summaryGrid = document.getElementById("summaryGrid");
const summaryLine = document.getElementById("summaryLine");
const countPill = document.getElementById("countPill");
const monsterList = document.getElementById("monsterList");

// Modal
const modal = document.getElementById("monsterModal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalLink = document.getElementById("modalLink");
const closeModalBtn = document.getElementById("closeModalBtn");
const closeModalBtn2 = document.getElementById("closeModalBtn2");

// Keep last inputs for Regenerate
let lastInputs = null;

// -------------------- Utilities --------------------

function setStatus(message, type = "") {
	statusEl.textContent = message || "";
	statusEl.classList.remove("loading", "error");
	if (type) statusEl.classList.add(type);
}

function clampInt(value, min, max, fallback) {
	const n = Number.parseInt(value, 10);
	if (Number.isNaN(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/**
 * Open5e CR can be "1/2", "1/4", etc. Convert to a number for comparisons.
 */
function parseCR(crValue) {
	if (crValue == null) return null;

	// Some Open5e entries use strings like "1/2"
	if (typeof crValue === "string") {
		const s = crValue.trim();
		if (s.includes("/")) {
			const [a, b] = s.split("/").map(Number);
			if (!Number.isNaN(a) && !Number.isNaN(b) && b !== 0) return a / b;
		}
		const n = Number(s);
		return Number.isNaN(n) ? null : n;
	}

	// Sometimes it may already be numeric
	if (typeof crValue === "number") return crValue;

	return null;
}

function crRangeForPartyLevel(level) {
	// Iteration 1 rule mapping:
	// 1–2 => CR 0–1
	// 3–4 => CR 1–2
	// 5–6 => CR 2–4
	// 7–8 => CR 4–6
	// 9–10 => CR 6–8
	if (level <= 2) return { min: 0, max: 1 };
	if (level <= 4) return { min: 1, max: 2 };
	if (level <= 6) return { min: 2, max: 4 };
	if (level <= 8) return { min: 4, max: 6 };
	return { min: 6, max: 8 };
}

function normaliseType(type) {
	return (type || "").toString().trim().toLowerCase();
}

function open5eMonsterUrl(monster) {
	// Open5e sometimes provides "document__slug"; slug can also be in "slug"
	const slug = monster.slug || monster.document__slug;
	if (slug) return `https://open5e.com/monsters/${encodeURIComponent(slug)}`;
	return "https://open5e.com/monsters/";
}

function randInt(minInclusive, maxInclusive) {
	const r = Math.random();
	return Math.floor(r * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function shuffleInPlace(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// -------------------- Data Fetching --------------------

/**
 * Fetch monsters with pagination.
 * - Collects up to MIN_CANDIDATES (or until pages exhausted)
 * - Caps request count to REQUEST_CAP
 * - Stores result in cache for this session
 */
async function getAllMonstersCached() {
	if (
		cache.allMonsters &&
		Array.isArray(cache.allMonsters) &&
		cache.allMonsters.length
	) {
		return cache.allMonsters;
	}

	setStatus("Fetching monsters from Open5e…", "loading");
	generateBtn.disabled = true;
	regenBtn.disabled = true;

	let url = API_BASE;
	let monsters = [];
	let requests = 0;

	try {
		while (url && requests < REQUEST_CAP && monsters.length < MIN_CANDIDATES) {
			requests++;

			const res = await fetch(url);
			if (!res.ok) {
				throw new Error(`Open5e request failed (HTTP ${res.status}).`);
			}

			const data = await res.json();
			if (Array.isArray(data.results)) {
				monsters.push(...data.results);
			}

			url = data.next; // Open5e provides absolute next page URL or null
		}

		// Basic sanity filter: keep entries with at least a name
		monsters = monsters.filter((m) => m && m.name);

		if (!monsters.length) {
			throw new Error("No monsters returned from Open5e.");
		}

		cache.allMonsters = monsters;
		cache.fetchedAt = new Date();

		setStatus(`Loaded ${monsters.length} monsters. Ready.`, "");
		return monsters;
	} finally {
		generateBtn.disabled = false;
		// regen enabled only after first successful generation
	}
}

// -------------------- Encounter Generation --------------------

/**
 * Filter monsters by CR range and optional theme.
 * If theme filtering yields too few candidates, fallback to "Any".
 */
function getCandidates(monsters, partyLevel, theme) {
	const { min, max } = crRangeForPartyLevel(partyLevel);

	const byCR = monsters.filter((m) => {
		const cr = parseCR(m.cr);
		return cr != null && cr >= min && cr <= max;
	});

	// Theme filtering (case-insensitive against monster.type)
	const themeKey = (theme || "any").toLowerCase();
	if (themeKey === "any") {
		return { candidates: byCR, didFallback: false, range: { min, max } };
	}

	const themed = byCR.filter((m) => normaliseType(m.type) === themeKey);

	// If too strict, fallback to Any (spec: output must always be generated)
	if (themed.length < 8) {
		return { candidates: byCR, didFallback: true, range: { min, max } };
	}

	return { candidates: themed, didFallback: false, range: { min, max } };
}

/**
 * Choose 1–4 monsters total.
 * - Avoid duplicates if possible.
 * - If unavoidable, allow at most 2 of the same monster.
 */
function pickEncounterMonsters(candidates) {
	const total = randInt(1, 4);

	// Shuffle candidates so selection feels random without heavy logic
	const pool = shuffleInPlace([...candidates]);

	// If we can pick unique monsters, do so
	const unique = [];
	const seen = new Set();

	for (const m of pool) {
		const key = m.slug || m.name;
		if (!seen.has(key)) {
			unique.push(m);
			seen.add(key);
			if (unique.length >= total) break;
		}
	}

	// If we got enough unique, return them
	if (unique.length === total) return unique;

	// Otherwise, allow duplicates up to 2 of the same monster
	const result = [...unique];
	const counts = new Map();
	for (const m of result) {
		const k = m.slug || m.name;
		counts.set(k, (counts.get(k) || 0) + 1);
	}

	// Fill remaining slots
	let safety = 0;
	while (result.length < total && safety < 200) {
		safety++;
		const m = pool[randInt(0, pool.length - 1)];
		const k = m.slug || m.name;
		const c = counts.get(k) || 0;

		if (c < 2) {
			result.push(m);
			counts.set(k, c + 1);
		}
	}

	// If still short (tiny pool), just return what we have (but spec wants always output >= 1)
	return result.length ? result : [pool[0]].filter(Boolean);
}

// -------------------- Rendering --------------------

function renderSummary({ partyLevel, partySize, theme, didFallback, range }) {
	summaryGrid.innerHTML = "";

	const themeLabel = theme === "any" ? "Any" : theme;
	const themeText = didFallback
		? `${themeLabel} (fell back to Any)`
		: themeLabel;

	const items = [
		{ k: "Party level", v: String(partyLevel) },
		{ k: "Party size", v: String(partySize) },
		{ k: "Theme", v: themeText },
	];

	for (const item of items) {
		const div = document.createElement("div");
		div.className = "kv";
		div.innerHTML = `<div class="k">${escapeHtml(item.k)}</div><div class="v">${escapeHtml(item.v)}</div>`;
		summaryGrid.appendChild(div);
	}

	summaryLine.textContent = `A skirmish suited for a level ${partyLevel} party. (CR range: ${range.min}–${range.max})`;
}

function renderMonsters(monsters) {
	monsterList.innerHTML = "";
	countPill.textContent = `${monsters.length} monster${monsters.length === 1 ? "" : "s"}`;

	for (const m of monsters) {
		const cr = m.cr ?? "—";
		const type = m.type ?? "—";
		const size = m.size ?? "—";

		// AC/HP fields can vary; Open5e typically uses armour_class/hit_points
		const ac = m.armour_class ?? m.armor_class ?? m.ac ?? null;
		const hp = m.hit_points ?? m.hp ?? null;

		const li = document.createElement("li");
		li.className = "monster-item";

		li.innerHTML = `
      <div class="monster-top">
        <div class="monster-name">${escapeHtml(m.name)}</div>
        <div class="meta">
          <span class="tag">CR: ${escapeHtml(String(cr))}</span>
          <span class="tag">Type: ${escapeHtml(String(type))}</span>
          <span class="tag">Size: ${escapeHtml(String(size))}</span>
          <span class="tag">AC: ${escapeHtml(ac != null ? String(ac) : "—")}</span>
          <span class="tag">HP: ${escapeHtml(hp != null ? String(hp) : "—")}</span>
        </div>
      </div>
      <div class="monster-actions">
        <button class="btn" type="button" data-action="details">Details</button>
        <a class="btn primary" href="${open5eMonsterUrl(m)}" target="_blank" rel="noreferrer noopener">View on Open5e</a>
      </div>
    `;

		// Wire up Details button to modal
		li.querySelector('[data-action="details"]').addEventListener(
			"click",
			() => {
				openDetailsModal(m);
			},
		);

		monsterList.appendChild(li);
	}
}

function openDetailsModal(monster) {
	const cr = monster.cr ?? "—";
	const type = monster.type ?? "—";
	const size = monster.size ?? "—";
	const ac = monster.armour_class ?? monster.armor_class ?? monster.ac ?? "—";
	const hp = monster.hit_points ?? monster.hp ?? "—";
	const align = monster.alignment ?? "—";
	const speed = monster.speed ?? "—";

	modalTitle.textContent = monster.name || "Monster";
	modalLink.href = open5eMonsterUrl(monster);

	modalBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><div class="k">CR</div><div class="v">${escapeHtml(String(cr))}</div></div>
      <div class="detail"><div class="k">Type</div><div class="v">${escapeHtml(String(type))}</div></div>
      <div class="detail"><div class="k">Size</div><div class="v">${escapeHtml(String(size))}</div></div>
      <div class="detail"><div class="k">Alignment</div><div class="v">${escapeHtml(String(align))}</div></div>
      <div class="detail"><div class="k">AC</div><div class="v">${escapeHtml(String(ac))}</div></div>
      <div class="detail"><div class="k">HP</div><div class="v">${escapeHtml(String(hp))}</div></div>
      <div class="detail"><div class="k">Speed</div><div class="v">${escapeHtml(String(speed))}</div></div>
      <div class="detail"><div class="k">Source</div><div class="v">${escapeHtml(String(monster.document__title || monster.document_title || "Open5e"))}</div></div>
    </div>
  `;

	if (typeof modal.showModal === "function") {
		modal.showModal();
	} else {
		// Fallback: if <dialog> unsupported, just open Open5e
		window.open(open5eMonsterUrl(monster), "_blank", "noopener,noreferrer");
	}
}

function closeModal() {
	if (modal.open) modal.close();
}

closeModalBtn.addEventListener("click", closeModal);
closeModalBtn2.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
	// Click outside content closes
	const rect = modal.getBoundingClientRect();
	const clickedOutside =
		e.clientX < rect.left ||
		e.clientX > rect.right ||
		e.clientY < rect.top ||
		e.clientY > rect.bottom;
	if (clickedOutside) closeModal();
});

// Minimal HTML escaping for safe rendering
function escapeHtml(str) {
	return String(str)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

// -------------------- Main Flow --------------------

async function generateEncounter(inputs) {
	const partyLevel = clampInt(inputs.partyLevel, 1, 10, 3);
	const partySize = clampInt(inputs.partySize, 1, 6, 4);
	const theme = (inputs.theme || "any").toLowerCase();

	setStatus("", "");
	resultsSection.hidden = true;

	try {
		const monsters = await getAllMonstersCached();

		const { candidates, didFallback, range } = getCandidates(
			monsters,
			partyLevel,
			theme,
		);

		if (!candidates.length) {
			// This should be rare (CR ranges are broad), but handle anyway
			throw new Error(
				"No candidates found for that party level. Try a different level.",
			);
		}

		const selected = pickEncounterMonsters(candidates);

		// Render
		renderSummary({ partyLevel, partySize, theme, didFallback, range });
		renderMonsters(selected);

		resultsSection.hidden = false;
		setStatus("Encounter generated.", "");

		// Enable regenerate
		regenBtn.disabled = false;

		// Store last inputs for regenerate
		lastInputs = { partyLevel, partySize, theme };
	} catch (err) {
		console.error(err);
		setStatus(
			err.message || "Something went wrong while generating the encounter.",
			"error",
		);
	}
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const inputs = {
		partyLevel: partyLevelInput.value,
		partySize: partySizeInput.value,
		theme: themeSelect.value,
	};

	await generateEncounter(inputs);
});

regenBtn.addEventListener("click", async () => {
	// If the user changes inputs after generation, regenerate uses current form values,
	// unless lastInputs is missing (first load).
	const inputs = {
		partyLevel: partyLevelInput.value,
		partySize: partySizeInput.value,
		theme: themeSelect.value,
	};

	// If form values are blank/invalid somehow, fall back to lastInputs
	if (!inputs.partyLevel || !inputs.partySize || !inputs.theme) {
		if (lastInputs) {
			await generateEncounter(lastInputs);
			return;
		}
	}

	await generateEncounter(inputs);
});

// Optional: warm the cache on first load (comment out if you prefer lazy load)
/*
window.addEventListener("DOMContentLoaded", async () => {
  try { await getAllMonstersCached(); } catch (_) {}
});
*/
