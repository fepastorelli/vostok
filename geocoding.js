"use strict";

const placeForm = byId("place-form");
const placeQuery = byId("place-query");
const placeStatus = byId("place-status");
const placeResults = byId("place-results");
const maxSuggestions = 5;
const suggestionCache = new Map();
let lookupVersion = 0;
let debounceTimer;
let lookupRequest;
let requestAfter = 0;
let blockedUntil = 0;
let suggestions = [];
let activeSuggestion = -1;

function clearPlaceResults() {
  suggestions = [];
  activeSuggestion = -1;
  placeResults.replaceChildren();
  placeResults.hidden = true;
  placeQuery.setAttribute("aria-expanded", "false");
  placeQuery.removeAttribute("aria-activedescendant");
}

function cancelLookup() {
  lookupVersion++;
  clearTimeout(debounceTimer);
  lookupRequest?.abort();
  lookupRequest = null;
  clearPlaceResults();
}

async function photon(path, params, controller) {
  if (Date.now() < blockedUntil) throw new Error("Limite de buscas");
  const wait = requestAfter - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  if (controller.signal.aborted) return [];
  if (Date.now() < blockedUntil) throw new Error("Limite de buscas");
  requestAfter = Date.now() + 1000;

  const url = new URL(path, "https://photon.komoot.io");
  url.search = new URLSearchParams(params);
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) blockedUntil = Date.now() + 30000;
    if (!response.ok) throw new Error("Falha na geocodificação");
    const payload = await response.json();
    if (!Array.isArray(payload.features)) throw new Error("Resposta de busca inválida");
    return payload.features;
  } finally {
    clearTimeout(timeout);
  }
}

const brazilianStates = {
  Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA", Ceará: "CE",
  "Distrito Federal": "DF", "Espírito Santo": "ES", Goiás: "GO", Maranhão: "MA",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", Pará: "PA",
  Paraíba: "PB", Paraná: "PR", Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", Rondônia: "RO", Roraima: "RR",
  "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE", Tocantins: "TO",
};

function localityLabel(fields) {
  const isCity = fields.type === "city" || ["city", "town", "village", "municipality"].includes(fields.osm_value);
  const city = fields.city || (isCity ? fields.name : "") || fields.municipality ||
    fields.town || fields.village;
  const state = fields.state;
  const stateCode = fields.countrycode?.toUpperCase() === "BR" && Object.hasOwn(brazilianStates, state)
    ? brazilianStates[state] : state;
  if (!city) return state || fields.country || "Localidade selecionada";
  if (!stateCode || city === stateCode) return city;
  return `${city}, ${stateCode}`;
}

function photonPlace(feature) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (feature?.geometry?.type !== "Point" || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const fields = feature.properties || {};
  const street = [fields.street, fields.housenumber].filter(Boolean).join(", ");
  const parts = [fields.name, street, fields.district, fields.locality, fields.city,
    fields.county, fields.state, fields.postcode, fields.country];
  const name = [...new Set(parts.filter((part) => typeof part === "string" && part.trim()))].join(", ");
  return name ? { name, locality: localityLabel(fields), latitude, longitude } : null;
}

function selectSuggestion(place) {
  cancelLookup();
  placeQuery.value = place.name;
  placeStatus.textContent = "Local selecionado.";
  choosePlace(place);
  finishPlaceSearch();
}

function setActiveSuggestion(index) {
  activeSuggestion = index;
  Array.from(placeResults.children).forEach((item, position) => {
    item.setAttribute("aria-selected", position === index);
  });
  const item = placeResults.children[index];
  placeQuery.setAttribute("aria-activedescendant", item.id);
}

function showPlaces(places) {
  if (!places.length) {
    placeStatus.textContent = "Nenhum local encontrado. Tente acrescentar a cidade, o estado ou o país.";
    return;
  }
  suggestions = places;
  placeStatus.textContent = places.length === 1
    ? "Uma sugestão disponível. Use as setas e Enter para selecionar."
    : `${places.length} sugestões disponíveis. Use as setas e Enter para selecionar.`;
  places.forEach((place, index) => {
    const item = document.createElement("li");
    item.id = `place-option-${index}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.textContent = place.name;
    item.addEventListener("click", () => selectSuggestion(place));
    placeResults.append(item);
  });
  placeResults.hidden = false;
  placeQuery.setAttribute("aria-expanded", "true");
}

async function lookupPlaces(input, version) {
  if (navigator.onLine === false) {
    placeStatus.textContent = "Sem conexão. Conecte-se à internet para buscar um local.";
    return;
  }
  const cacheKey = input.toLocaleLowerCase("pt-BR");
  if (suggestionCache.has(cacheKey)) {
    showPlaces(suggestionCache.get(cacheKey));
    return;
  }
  const controller = new AbortController();
  lookupRequest = controller;
  placeStatus.textContent = "Buscando locais…";
  const brazilianPostcode = /^(\d{5})[-\s]?(\d{3})$/.exec(input);
  try {
    const params = { limit: String(maxSuggestions) };
    const features = brazilianPostcode
      ? await photon("/structured", { ...params, countrycode: "BR", postcode: `${brazilianPostcode[1]}-${brazilianPostcode[2]}` }, controller)
      : await photon("/api", { ...params, q: input }, controller);
    if (version !== lookupVersion) return;
    const places = features.map(photonPlace).filter(Boolean).slice(0, maxSuggestions);
    if (suggestionCache.size === 32) suggestionCache.delete(suggestionCache.keys().next().value);
    suggestionCache.set(cacheKey, places);
    showPlaces(places);
  } catch {
    if (version === lookupVersion) {
      placeStatus.textContent = Date.now() < blockedUntil
        ? "Limite temporário de buscas. Tente novamente em instantes."
        : "Não foi possível buscar locais. Verifique a conexão e tente novamente.";
    }
  } finally {
    if (lookupRequest === controller) lookupRequest = null;
  }
}

function scheduleSearch(delay) {
  cancelLookup();
  const input = placeQuery.value.trim().replace(/\s+/g, " ");
  if (input.length < 3) {
    placeStatus.textContent = input ? "Digite pelo menos três caracteres." : "";
    return;
  }
  placeStatus.textContent = "";
  const version = lookupVersion;
  debounceTimer = setTimeout(() => lookupPlaces(input, version), delay);
}

placeQuery.addEventListener("input", (event) => {
  if (!event.isComposing) scheduleSearch(350);
});
placeQuery.addEventListener("compositionend", () => scheduleSearch(350));
placeQuery.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Escape" || event.key === "Tab") {
    if (event.key === "Escape") event.preventDefault();
    cancelLookup();
    placeStatus.textContent = "";
    return;
  }
  if (!suggestions.length) return;
  if (event.key === "Enter") {
    event.preventDefault();
    selectSuggestion(suggestions[Math.max(0, activeSuggestion)]);
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const next = activeSuggestion < 0 && offset === -1
      ? suggestions.length - 1 : (activeSuggestion + offset + suggestions.length) % suggestions.length;
    setActiveSuggestion(next);
  }
});
placeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!suggestions.length) scheduleSearch(0);
});

function requestBrowserLocation(status = placeStatus) {
  cancelLookup();
  const version = lookupVersion;
  if (navigator.onLine === false) {
    status.textContent = "Sem conexão. Conecte-se à internet para consultar a previsão de um novo local.";
    return;
  }
  if (!navigator.geolocation) {
    status.textContent = "Localização indisponível neste navegador. Use a busca manual.";
    return;
  }

  status.textContent = "Aguardando a localização do navegador…";
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    if (version !== lookupVersion) return;
    const { latitude, longitude } = coords;
    let place = { name: "Minha localização", locality: "Minha localização", latitude, longitude };
    const controller = new AbortController();
    lookupRequest = controller;
    try {
      const features = await photon("/reverse", { lat: latitude, lon: longitude, limit: "1" }, controller);
      const match = photonPlace(features[0]);
      if (match) place = { ...match, latitude, longitude };
    } catch {
      // As coordenadas do navegador já permitem consultar a previsão.
    }
    if (version !== lookupVersion) return;
    selectSuggestion(place);
  }, ({ code }) => {
    if (version !== lookupVersion) return;
    status.textContent = code === 1
      ? "Permissão de localização negada. Use a busca manual."
      : "Não foi possível obter sua localização. Use a busca manual ou tente novamente.";
  }, { timeout: 10000, maximumAge: 0 });
}

byId("use-position").addEventListener("click", () => requestBrowserLocation());
