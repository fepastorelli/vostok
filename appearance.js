"use strict";

const themeToggle = document.getElementById("theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const skinPreference = "vostok-skin";
const mobileLayout = window.matchMedia("(max-width: 36rem)");
const locationToggle = document.getElementById("location-toggle");
const placeSearch = document.getElementById("place-search");
const cityPicker = document.getElementById("city-picker");
const cityOptions = document.getElementById("city-options");
const calendarNav = document.getElementById("calendar-nav");
const previousDay = document.getElementById("previous");
const nextDay = document.getElementById("next");
const recentCitiesKey = "vostok-recent-cities";
const recentCitiesLimit = 5;
let recentCities = [];

try {
  const saved = JSON.parse(localStorage.getItem(recentCitiesKey));
  if (Array.isArray(saved)) {
    recentCities = saved.filter((place) => typeof place?.name === "string" &&
      typeof place.locality === "string" && Number.isFinite(place.latitude) &&
      Math.abs(place.latitude) <= 90 && Number.isFinite(place.longitude) &&
      Math.abs(place.longitude) <= 180).slice(0, recentCitiesLimit);
  }
} catch {
  // A seleção continua disponível sem histórico.
}

function sameCity(first, second) {
  return first.latitude === second.latitude && first.longitude === second.longitude;
}

function rememberCity(place) {
  if (place.locality) {
    recentCities = [place, ...recentCities.filter((item) =>
      item.locality !== place.locality && !sameCity(item, place))].slice(0, recentCitiesLimit);
    try {
      localStorage.setItem(recentCitiesKey, JSON.stringify(recentCities));
    } catch {
      // As cidades da sessão permanecem disponíveis.
    }
  }
}

function setLocationPanel(open) {
  placeSearch.hidden = !open;
  locationToggle.setAttribute("aria-expanded", open);
}

function finishPlaceSearch() {
  if (placeSearch.hidden) return;
  setLocationPanel(false);
  locationToggle.focus({ preventScroll: true });
}

function renderCityOptions() {
  const seen = new Set([placeLabel(livePlace)]);
  cityOptions.replaceChildren();
  for (const place of [...recentCities, saoPaulo]) {
    const label = placeLabel(place);
    if (seen.has(label) || sameCity(place, livePlace)) continue;
    seen.add(label);
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      cancelLookup();
      choosePlace(place);
      finishPlaceSearch();
    });
    item.append(button);
    cityOptions.append(item);
  }
  cityPicker.hidden = seen.size === 1;
}

locationToggle.addEventListener("click", () => {
  if (!placeSearch.hidden) {
    cancelLookup();
    finishPlaceSearch();
    return;
  }
  renderCityOptions();
  setLocationPanel(true);
  document.getElementById("place-query").focus();
});

placeSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelLookup();
    finishPlaceSearch();
  }
});

function arrangeLayout(event) {
  const active = document.activeElement;
  if (event.matches) {
    document.getElementById("day-previous-slot").append(previousDay);
    document.getElementById("day-next-slot").append(nextDay);
  } else {
    calendarNav.prepend(previousDay);
    calendarNav.append(nextDay);
  }
  if (active && document.activeElement !== active && active.getClientRects().length) {
    active.focus({ preventScroll: true });
  }
}

if (mobileLayout.matches) arrangeLayout(mobileLayout);
mobileLayout.addEventListener("change", arrangeLayout);

function applySkin(value) {
  const skin = value === "retro" ? "retro" : "original";
  const retro = skin === "retro";
  document.documentElement.dataset.skin = skin;
  themeColor.content = retro ? "#8B1D12" : "#032E29";
  themeToggle.setAttribute("aria-pressed", retro);
  themeToggle.title = retro ? "Ativar tema Original" : "Ativar tema Retrô";
}

try {
  applySkin(localStorage.getItem(skinPreference));
} catch {
  applySkin("original");
}

themeToggle.addEventListener("click", () => {
  const skin = document.documentElement.dataset.skin === "retro" ? "original" : "retro";
  applySkin(skin);
  try {
    localStorage.setItem(skinPreference, skin);
  } catch {
    // A escolha permanece disponível nesta sessão.
  }
});
