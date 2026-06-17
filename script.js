// your code goes here
/**
 * script.js – APOD Search
 *
 * Handles:
 *  - NASA APOD API fetch by date
 *  - Displaying the image / video + metadata
 *  - Saving / deleting favourites in localStorage
 *  - "More" toggle for the favourites list
 *  - Input validation (YYYY-MM-DD, min 1995-06-16, max today)
 *
 * NASA DEMO_KEY: 40 req/day per IP; replace with your own key from api.nasa.gov
 */

/* ---- Config ---- */
const API_KEY     = "3U3cY6LzEA41pgRQYSnW8utEtD70L5h9rubwKNv0";
const APOD_URL    = "https://api.nasa.gov/planetary/apod";
const MAX_VISIBLE = 3;   // favourites shown before "More"

/* ---- DOM refs ---- */
const dateInput      = document.getElementById("date-input");
const searchBtn      = document.getElementById("search-btn");
const favBtn         = document.getElementById("fav-btn");
const apodPlaceholder= document.getElementById("apod-placeholder");
const apodImg        = document.getElementById("apod-img");
const apodVideoWrap  = document.getElementById("apod-video-wrapper");
const apodVideo      = document.getElementById("apod-video");
const apodTitle      = document.getElementById("apod-title");
const apodDate       = document.getElementById("apod-date");
const apodExplanation= document.getElementById("apod-explanation");
const statusMsg      = document.getElementById("status-msg");
const favList        = document.getElementById("favourites-list");
const favEmpty       = document.getElementById("fav-empty");
const moreBtnWrapper = document.getElementById("more-btn-wrapper");
const moreBtn        = document.getElementById("more-btn");

/* ---- State ---- */
let currentAPOD  = null;   // { title, date, url, hdurl, media_type, explanation, thumbnail_url }
let showAll      = false;

/* =========================================================
   FAVOURITES (localStorage)
   ========================================================= */

/**
 * Load the favourites array from localStorage.
 * @returns {Array}
 */
function loadFavourites() {
  try {
    const raw = localStorage.getItem("apod-favourites");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the favourites array to localStorage.
 * @param {Array} favs
 */
function saveFavourites(favs) {
  try {
    localStorage.setItem("apod-favourites", JSON.stringify(favs));
  } catch (err) {
    console.warn("Could not save favourites:", err);
  }
}

/**
 * Check whether a given date is already saved.
 * @param {string} date  YYYY-MM-DD
 * @returns {boolean}
 */
function isFavourite(date) {
  return loadFavourites().some(f => f.date === date);
}

/**
 * Add the current APOD to favourites.
 */
function addFavourite() {
  if (!currentAPOD) return;
  const favs = loadFavourites();
  if (favs.some(f => f.date === currentAPOD.date)) return; // duplicate guard
  favs.unshift({
    title      : currentAPOD.title,
    date       : currentAPOD.date,
    url        : currentAPOD.url,
    media_type : currentAPOD.media_type,
    thumbnail_url: currentAPOD.thumbnail_url || null
  });
  saveFavourites(favs);
  renderFavourites();
  updateFavBtn();
}

/**
 * Remove a favourite by date.
 * @param {string} date  YYYY-MM-DD
 */
function removeFavourite(date) {
  const favs = loadFavourites().filter(f => f.date !== date);
  saveFavourites(favs);
  renderFavourites();
  if (currentAPOD && currentAPOD.date === date) updateFavBtn();
}

/* =========================================================
   RENDER FAVOURITES LIST
   ========================================================= */

function renderFavourites() {
  const favs = loadFavourites();
  favList.innerHTML = "";

  if (favs.length === 0) {
    favEmpty.hidden = false;
    moreBtnWrapper.hidden = true;
    return;
  }

  favEmpty.hidden = true;

  const visible = showAll ? favs : favs.slice(0, MAX_VISIBLE);

  visible.forEach(fav => {
    const li = document.createElement("li");
    li.className = "fav-item";
    li.innerHTML = buildFavItemHTML(fav);
    li.querySelector(".fav-del-btn").addEventListener("click", () => {
      removeFavourite(fav.date);
    });
    favList.appendChild(li);
  });

  // "More" button
  if (favs.length > MAX_VISIBLE) {
    moreBtnWrapper.hidden = false;
    moreBtn.textContent = showAll ? "Less" : "More";
  } else {
    moreBtnWrapper.hidden = true;
  }
}

/**
 * Build the inner HTML string for a single favourite list item.
 * @param {{ title: string, date: string, url: string, media_type: string, thumbnail_url: string|null }} fav
 * @returns {string}
 */
function buildFavItemHTML(fav) {
  const thumbSrc = fav.media_type === "video"
    ? (fav.thumbnail_url || "")
    : fav.url;

  const thumbHTML = thumbSrc
    ? `<img src="${escapeAttr(thumbSrc)}" alt="${escapeAttr(fav.title)}" loading="lazy" />`
    : `<span>img</span>`;

  return `
    <div class="fav-thumb" aria-hidden="true">${thumbHTML}</div>
    <div class="fav-info">
      <p class="fav-name" title="${escapeAttr(fav.title)}">${escapeHTML(fav.title)}</p>
      <p class="fav-date">${escapeHTML(fav.date)}</p>
    </div>
    <button class="btn btn-danger fav-del-btn" aria-label="Delete ${escapeAttr(fav.title)} from favourites">
      Del
    </button>
  `;
}

/* =========================================================
   APOD DISPLAY
   ========================================================= */

/**
 * Fetch and display the APOD for the given date string.
 * @param {string} dateStr  YYYY-MM-DD
 */
async function fetchAPOD(dateStr) {
  setStatus("", false);
  setLoading(true);

  // Reset display
  apodPlaceholder.classList.remove("hidden");
  apodImg.classList.add("hidden");
  apodVideoWrap.classList.add("hidden");
  apodImg.src = "";
  apodVideo.src = "";
  apodTitle.textContent = "–";
  apodDate.textContent = "–";
  apodExplanation.textContent = "";
  currentAPOD = null;
  updateFavBtn();

  const params = new URLSearchParams({ api_key: API_KEY, date: dateStr, thumbs: true });

  try {
    const res = await fetch(`${APOD_URL}?${params}`);

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const msg = errData?.msg || errData?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    currentAPOD = data;
    displayAPOD(data);
  } catch (err) {
    setStatus(err.message || "Failed to fetch. Please try again.");
  } finally {
    setLoading(false);
  }
}

/**
 * Populate the APOD card with fetched data.
 * @param {Object} data  NASA APOD API response
 */
function displayAPOD(data) {
  apodTitle.textContent = data.title || "–";
  apodDate.textContent  = data.date  || "–";
  apodExplanation.textContent = data.explanation || "";

  apodPlaceholder.classList.add("hidden");

  if (data.media_type === "video") {
    apodVideoWrap.classList.remove("hidden");
    apodVideo.src = data.url || "";
    // Show thumbnail if available
    if (data.thumbnail_url) {
      apodImg.src = data.thumbnail_url;
      apodImg.classList.remove("hidden");
      apodImg.style.position = "absolute";
      apodImg.style.inset = "0";
      apodImg.style.zIndex = "1";
    }
  } else {
    apodImg.classList.remove("hidden");
    apodImg.src = data.url || "";
    apodImg.alt = data.title || "Astronomy Picture of the Day";
    apodImg.style.position = "";
    apodImg.style.inset = "";
    apodImg.style.zIndex = "";
  }

  updateFavBtn();
}

/**
 * Sync the Save/Saved state of the favourite button.
 */
function updateFavBtn() {
  if (!currentAPOD) {
    favBtn.disabled = true;
    favBtn.textContent = "Save as Favourite";
    return;
  }
  favBtn.disabled = false;
  if (isFavourite(currentAPOD.date)) {
    favBtn.textContent = "✓ Saved";
    favBtn.style.backgroundColor = "var(--muted)";
  } else {
    favBtn.textContent = "Save as Favourite";
    favBtn.style.backgroundColor = "var(--green)";
  }
}

/* =========================================================
   HELPERS
   ========================================================= */

/**
 * Display or clear the status / error message.
 */
function setStatus(msg) {
  statusMsg.textContent = msg;
}

/**
 * Toggle the loading state of the Search button.
 * @param {boolean} loading
 */
function setLoading(loading) {
  searchBtn.disabled = loading;
  searchBtn.textContent = loading ? "Loading…" : "Search APOD";
}

/**
 * Validate that the string matches YYYY-MM-DD and is a real date.
 * @param {string} str
 * @returns {boolean}
 */
function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + "T00:00:00");
  if (isNaN(d)) return false;
  // APOD started 1995-06-16; cap at today
  const min = new Date("1995-06-16T00:00:00");
  const max = new Date();
  max.setHours(23, 59, 59, 999);
  return d >= min && d <= max;
}

/** Escape HTML special chars */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape for HTML attribute values */
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

searchBtn.addEventListener("click", () => {
  const dateStr = dateInput.value.trim();
  if (!dateStr) {
    setStatus("Please enter a date.");
    return;
  }
  if (!isValidDate(dateStr)) {
    setStatus("Invalid date. Use YYYY-MM-DD (e.g. 2024-07-04) between 1995-06-16 and today.");
    return;
  }
  setStatus("");
  fetchAPOD(dateStr);
});

// Allow pressing Enter in the input field
dateInput.addEventListener("keydown", e => {
  if (e.key === "Enter") searchBtn.click();
});

// Auto-format: insert hyphens as user types (YYYY-MM-DD)
dateInput.addEventListener("input", () => {
  let v = dateInput.value.replace(/\D/g, "");
  if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
  if (v.length > 7) v = v.slice(0, 7) + "-" + v.slice(7, 9);
  dateInput.value = v;
});

favBtn.addEventListener("click", () => {
  if (!currentAPOD) return;
  if (isFavourite(currentAPOD.date)) {
    removeFavourite(currentAPOD.date);
  } else {
    addFavourite();
  }
});

moreBtn.addEventListener("click", () => {
  showAll = !showAll;
  renderFavourites();
});

/* =========================================================
   INIT
   ========================================================= */
renderFavourites();
