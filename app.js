"use strict";

const periods = [
  ["Madrugada", 0, 6],
  ["Manhã", 6, 12],
  ["Tarde", 12, 18],
  ["Noite", 18, 24],
  ["Ver dia inteiro", 0, 24],
];

const cloud = "M6 17a4 4 0 1 1 1-7.9 5 5 0 0 1 9.7 1.1A3.5 3.5 0 1 1 18 17Z";
const sky = {
  sun: ["Ensolarado", "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"],
  "cloud-sun": ["Sol entre nuvens", `M14 7a4 4 0 1 1 5 5m-1-10v1m3 3 1-1m-1 5h2 M10 4l1 1 ${cloud}`],
  cloud: ["Nublado", cloud],
  "cloud-drizzle": ["Garoa", `${cloud} M8 20l-.5 1m5-1-.5 1m5-1-.5 1`],
  "cloud-rain": ["Chuva", `${cloud} M8 19l-1 3m5-3-1 3m5-3-1 3`],
  "cloud-lightning": ["Trovoada", `${cloud} M13 16l-3 4h4l-2 3`],
  "moon-star": ["Noite limpa", "M15 15A8 8 0 0 1 9 3a9 9 0 1 0 12 12 8 8 0 0 1-6 0Zm3-12v6m-3-3h6"],
  "cloud-moon": ["Lua entre nuvens", `M13 6a5 5 0 0 1 2-4 6 6 0 0 0 7 7 5 5 0 0 1-2 3 ${cloud}`],
  "cloud-fog": ["Nevoeiro", `${cloud} M4 20h16m-13 3h10`],
};

const saoPaulo = { name: "São Paulo, SP", locality: "São Paulo, SP", latitude: -23.55, longitude: -46.63, timeZone: "America/Sao_Paulo" };
const lastPlaceKey = "vostok-last-place";

function restoredPlace() {
  try {
    const place = JSON.parse(localStorage.getItem(lastPlaceKey));
    if (typeof place?.name === "string" && place.name.trim() &&
        Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
        Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180) {
      return {
        name: place.name,
        locality: typeof place.locality === "string" && place.locality.trim() ? place.locality : undefined,
        latitude: place.latitude, longitude: place.longitude,
      };
    }
  } catch {
    // O aplicativo continua disponível sem armazenamento.
  }
  return saoPaulo;
}

let livePlace = restoredPlace();
let forecastTimeZone = livePlace.timeZone || null;

function forecastUrl({ latitude, longitude, timeZone }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude, longitude,
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    current: "temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,precipitation_sum,wind_speed_10m_max,uv_index_max",
    // A sexta data fornece o término do último intervalo do calendário.
    forecast_days: "6",
    timeformat: "unixtime",
    timezone: timeZone || "auto",
  });
  return url;
}

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const fullDateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
const numericDateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
// Datas do calendário representam dias civis, independentes do fuso do navegador.
const numberFormat = new Intl.NumberFormat("pt-BR");
// Intl.NumberFormat arredonda metades para longe de zero por padrão.
const integerTemperatureFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

function calendarDates(firstDay) {
  const first = new Date(firstDay + "T00:00:00Z");
  return Array.from({ length: 5 }, (_, index) =>
    new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() + index))
  );
}

const hourSeconds = 3600;
let localClock;
let localClockZone;

function localNow(timeZone, instant = new Date()) {
  if (localClockZone !== timeZone) {
    localClock = new Intl.DateTimeFormat("pt-BR", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    localClockZone = timeZone;
  }
  const { year, month, day, hour, minute } = Object.fromEntries(
    localClock.formatToParts(instant).map(({ type, value }) => [type, value])
  );
  const dayKey = `${year}-${month}-${day}`;
  const offset = (Date.parse(`${dayKey}T${hour}:${minute}Z`) - Math.floor(instant.getTime() / 60000) * 60000) / 1000;
  return { dayKey, hour: Number(hour), minute: Number(minute), offset, time: instant.getTime() / 1000 };
}

function isTimestamp(value) {
  return Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000;
}

function clockLabel(local) {
  return `${twoDigits(local.hour)}h${local.minute ? twoDigits(local.minute) : ""}`;
}

function offsetLabel(offset) {
  const minutes = Math.abs(offset) / 60;
  return `UTC${offset < 0 ? "−" : "+"}${twoDigits(Math.floor(minutes / 60))}:${twoDigits(minutes % 60)}`;
}

function rainInterval(start, end, repeated) {
  const differentDay = start.dayKey !== end.dayKey;
  const showOffset = repeated || start.offset !== end.offset;
  const label = (local) => {
    const date = differentDay ? ` de ${numericDateFormat.format(new Date(local.dayKey + "T00:00:00Z"))}` : "";
    return clockLabel(local) + (showOffset ? ` (${offsetLabel(local.offset)})` : "") + date;
  };
  return `${label(start)}–${label(end)}`;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

let dates = calendarDates(localNow(saoPaulo.timeZone).dayKey);

const byId = (id) => document.getElementById(id);
const days = byId("days");
const periodGroup = byId("periods");
const previous = byId("previous");
const next = byId("next");
const selection = { day: dateKey(dates[0]), hour: null };
let selectedPeriod = 4;
let forecast = null;
let request = null;
let loadFailed = false;
let pendingAutoLocation = true;
let followLocalPeriod = true;
let renderedLocalHour = null;
function stopAutoLocation() {
  pendingAutoLocation = false;
}

function stopAutoSelection() {
  stopAutoLocation();
  followLocalPeriod = false;
}

function periodIndex(hour) {
  return periods.findIndex(([, , end]) => hour < end);
}

function selectCurrentPeriod(now) {
  const local = currentSlot(now) || now;
  const currentDay = dates.findIndex((date) => dateKey(date) === local.dayKey);
  if (currentDay === -1 || (forecast && !forecast.availableDays.has(local.dayKey))) return;
  selection.day = local.dayKey;
  selectedPeriod = periodIndex(local.hour);
}
const unavailable = '<span class="data-note">Indisponível</span>';

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function skyMarkup(key, description, iconOnly = false) {
  if (!key) return description || unavailable;
  const [label, path] = sky[key];
  return `<span class="sky"><svg class="sky-icon ${key}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>${iconOnly ? "" : description || label}</span>`;
}

function temperatureDisplayValue(value) {
  return Math.abs(value) < 0.5 ? 0 : value;
}

function temperatureLabel(value, unit = " °C") {
  return Number.isFinite(value)
    ? `${integerTemperatureFormat.format(temperatureDisplayValue(value))}${unit}` : "Indisponível";
}

function metricMarkup(value, format) {
  return Number.isFinite(value) ? format(value) : unavailable;
}

function forecastSky(code, isDay) {
  if (code === 0) {
    if (isDay === 0) return ["moon-star"];
    if (isDay === 1) return ["sun"];
    return [null, "Céu limpo"];
  }
  if ([1, 2].includes(code)) {
    if (isDay === 0) return ["cloud-moon"];
    if (isDay === 1) return ["cloud-sun"];
    return ["cloud", "Parcialmente nublado"];
  }
  if (code === 3) return ["cloud"];
  if ([45, 48].includes(code)) return ["cloud-fog"];
  if ([51, 53, 55].includes(code)) return ["cloud-drizzle"];
  if ([56, 57].includes(code)) return ["cloud-drizzle", "Garoa congelante"];
  if ([61, 63, 65].includes(code)) return ["cloud-rain"];
  if ([66, 67].includes(code)) return ["cloud-rain", "Chuva congelante"];
  if ([71, 73, 75, 85, 86].includes(code)) return [null, "Neve"];
  if (code === 77) return [null, "Grãos de neve"];
  if ([80, 81, 82].includes(code)) return ["cloud-rain", "Pancadas de chuva"];
  if ([95, 97].includes(code)) return ["cloud-lightning"];
  if ([96, 99].includes(code)) return ["cloud-lightning", "Trovoada com granizo"];
  return [];
}

function parseForecast(payload, timeZone) {
  const hourly = payload?.hourly;
  if (!Array.isArray(hourly?.time)) throw new Error("Resposta horária inválida");
  const hours = new Map();
  hourly.time.forEach((time, index) => {
    if (!isTimestamp(time)) return;
    const rain = hourly.precipitation_probability?.[index];
    hours.set(time, {
      temperature: hourly.temperature_2m?.[index],
      rain: Number.isFinite(rain) && rain >= 0 && rain <= 100 ? rain : null,
      conditions: forecastSky(hourly.weather_code?.[index], hourly.is_day?.[index]),
    });
  });
  if (!hours.size) throw new Error("Resposta horária inválida");
  const first = Math.min(...hours.keys());
  const daily = payload.daily;
  const dailyTimes = Array.isArray(daily?.time) ? daily.time : [];
  const offset = payload.utc_offset_seconds;
  // As datas de agregação diária usam o deslocamento fixo informado pela API.
  const forecastDay = (time) => Number.isFinite(offset) ? dateKey(new Date((time + offset) * 1000))
    : localNow(timeZone, new Date(time * 1000)).dayKey;
  const firstDay = forecastDay(dailyTimes.find(isTimestamp) ?? first);
  const dates = calendarDates(firstDay);
  const slots = new Map(dates.map((date) => [dateKey(date), []]));
  const availableDays = new Set();
  const slotsByTime = new Map();
  // A grade anda em horas reais. O fuso converte cada posição em uma hora local.
  for (let time = first - 25 * hourSeconds; time <= first + 6 * 25 * hourSeconds; time += hourSeconds) {
    const local = localNow(timeZone, new Date(time * 1000));
    const day = slots.get(local.dayKey);
    if (!day) continue;
    const data = hours.get(time);
    if (data) availableDays.add(local.dayKey);
    const slot = {
      ...local, temperature: data?.temperature, conditions: data?.conditions || [],
      // A probabilidade rotulada pelo fim na API pertence ao intervalo iniciado aqui.
      rain: hours.get(time + hourSeconds)?.rain,
    };
    day.push(slot);
    slotsByTime.set(time, slot);
  }
  for (const day of slots.values()) {
    const counts = new Map();
    for (const slot of day) {
      slot.tick = clockLabel(slot);
      counts.set(slot.tick, (counts.get(slot.tick) || 0) + 1);
    }
    const occurrences = new Map();
    for (const slot of day) {
      const repeated = counts.get(slot.tick) > 1;
      const end = localNow(timeZone, new Date((slot.time + hourSeconds) * 1000));
      slot.label = repeated ? `${slot.tick} (${offsetLabel(slot.offset)})` : slot.tick;
      const repeatedEnd = slot.dayKey === end.dayKey && counts.get(clockLabel(end)) > 1;
      slot.interval = rainInterval(slot, end, repeated || repeatedEnd);
      if (repeated) {
        const count = (occurrences.get(slot.tick) || 0) + 1;
        occurrences.set(slot.tick, count);
        slot.tick += count === 1 ? "¹" : "²";
      }
    }
  }
  const summaries = new Map(dailyTimes.flatMap((time, index) => {
    if (!isTimestamp(time)) return [];
    const day = forecastDay(time);
    const rain = daily.precipitation_probability_max?.[index];
    return [[day, {
      conditions: forecastSky(daily.weather_code?.[index], 1),
      high: daily.temperature_2m_max?.[index],
      sunrise: daily.sunrise?.[index],
      sunset: daily.sunset?.[index],
      precipitation: daily.precipitation_sum?.[index],
      wind: daily.wind_speed_10m_max?.[index],
      uv: daily.uv_index_max?.[index],
      low: daily.temperature_2m_min?.[index],
      rain: Number.isFinite(rain) && rain >= 0 && rain <= 100 ? rain : null,
    }]];
  }));
  return { dates, slots, slotsByTime, first, availableDays, current: payload.current, summaries };
}

function currentTimeLabel(instant) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: forecastTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(instant).replace(":", "h");
}

function updateCurrentClock() {
  if (!forecast) return;
  const instant = new Date();
  const time = currentTimeLabel(instant);
  byId("current-clock").textContent = time;
  const day = localNow(forecastTimeZone, instant).dayKey;
  const civilDate = new Date(day + "T00:00:00Z");
  const weekday = weekdayFormat.format(civilDate).replace(/\.$/, "");
  byId("compact-date").textContent = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${numericDateFormat.format(civilDate)} · ${time}`;
}

function currentSlot(now) {
  if (!forecast) return undefined;
  const time = forecast.first + Math.floor((now.time - forecast.first) / hourSeconds) * hourSeconds;
  return forecast.slotsByTime.get(time);
}

function updateCurrentReference(now) {
  const reference = forecast.current?.time;
  const label = byId("current-temperature-label");
  let text = "Hora de referência das condições atuais indisponível.";
  let older = false;
  if (isTimestamp(reference)) {
    const modelTime = new Date(reference * 1000);
    const local = localNow(forecastTimeZone, modelTime);
    const interval = forecast.current.interval;
    const intervalSeconds = Number.isFinite(interval) && interval > 0 ? interval : 900;
    older = now.time - reference >= intervalSeconds;
    text = older
      ? `Estimativa anterior da Open-Meteo de ${numericDateFormat.format(new Date(local.dayKey + "T00:00:00Z"))} às ${currentTimeLabel(modelTime)} (horário local).`
      : `Estimativa da Open-Meteo para ${currentTimeLabel(modelTime)}.`;
  }
  const labelText = older ? "Última temperatura estimada" : "Temperatura atual";
  if (label.textContent !== labelText) label.textContent = labelText;
  const element = byId("current-reference");
  if (element.textContent !== text) element.textContent = text;
  const referenceLabel = forecast.saved ? savedForecastLabel(forecast) : older ? "Estimativa anterior" :
    isTimestamp(reference) ? "" : "Hora da estimativa indisponível";
  byId("compact-reference").textContent = referenceLabel;
  const summaryReference = byId("summary-current-reference");
  if (summaryReference) summaryReference.textContent = referenceLabel;
}

function renderCurrentConditions(now) {
  const status = byId("current-status");
  byId("current-metrics").hidden = !forecast;
  if (!forecast) {
    status.textContent = loadFailed ? "Condições atuais indisponíveis." : "Carregando condições atuais…";
    byId("current-summary").textContent = status.textContent;
    byId("compact-date").textContent = status.textContent;
    byId("compact-temperature").textContent = "";
    byId("compact-sky").textContent = "";
    byId("compact-sky").setAttribute("aria-label", "Céu indisponível");
    byId("compact-reference").textContent = "";
    return;
  }

  const current = forecast.current;
  const updated = forecast.saved ? savedForecastLabel(forecast) : `Última consulta às ${currentTimeLabel(forecast.updatedAt)} (horário local).`;
  if (status.textContent !== updated) status.textContent = updated;
  updateCurrentReference(now);

  const temperature = current?.temperature_2m;
  byId("current-temperature").innerHTML = Number.isFinite(temperature) ? temperatureLabel(temperature) : unavailable;
  byId("current-apparent").innerHTML = metricMarkup(current?.apparent_temperature, temperatureLabel);
  const conditions = forecastSky(current?.weather_code, current?.is_day);
  byId("current-sky").innerHTML = skyMarkup(...conditions);
  byId("compact-temperature").innerHTML = metricMarkup(temperature, temperatureLabel);
  byId("compact-sky").innerHTML = skyMarkup(conditions[0], conditions[1], true);
  const skyLabel = conditions[1] || sky[conditions[0]]?.[0] || "Céu indisponível";
  byId("compact-sky").setAttribute("aria-label", skyLabel);
  byId("current-summary").innerHTML = `${skyMarkup(...conditions)} <strong>${metricMarkup(temperature, temperatureLabel)}</strong><span id="summary-current-reference" class="data-note"></span>`;
  byId("summary-current-reference").textContent = byId("compact-reference").textContent;
  const humidity = current?.relative_humidity_2m;
  byId("current-humidity").innerHTML = Number.isFinite(humidity) && humidity >= 0 && humidity <= 100
    ? `${numberFormat.format(humidity)}%` : unavailable;
  const wind = current?.wind_speed_10m;
  byId("current-wind").innerHTML = Number.isFinite(wind) && wind >= 0
    ? `${numberFormat.format(wind)} km/h` : unavailable;

  const slot = currentSlot(now);
  const rain = slot?.rain;
  const rainBar = byId("current-rain-bar");
  rainBar.hidden = !Number.isFinite(rain);
  byId("current-rain").innerHTML = rainBar.hidden ? unavailable : rainLabel(rain);
  if (rainBar.hidden) {
    rainBar.removeAttribute("aria-valuenow");
  } else {
    rainBar.setAttribute("aria-valuenow", rain);
    byId("current-rain-fill").style.width = `${rain}%`;
  }
  updateCurrentClock();
  byId("current-rain-period").textContent = slot
    ? `Previsão para ${slot.interval} (horário local)` : "Intervalo atual indisponível.";
}

function rainLabel(value) {
  return Number.isFinite(value) ? `${numberFormat.format(value)}%` : "Indisponível";
}

function dailyDetails(summary) {
  const timeLabel = (value) => isTimestamp(value)
    ? currentTimeLabel(new Date(value * 1000)) : "Indisponível";
  const measured = (value, unit = "") => Number.isFinite(value) && value >= 0
    ? numberFormat.format(value) + unit : "Indisponível";
  return [
    ["Nascer do sol", timeLabel(summary?.sunrise)],
    ["Pôr do sol", timeLabel(summary?.sunset)],
    ["Precipitação total", measured(summary?.precipitation, " mm")],
    ["Vento máximo", measured(summary?.wind, " km/h")],
    ["Índice UV máximo", measured(summary?.uv)],
  ];
}

function renderCalendarSummary(today) {
  const summary = byId("calendar-summary");
  if (!forecast || !today) {
    summary.textContent = loadFailed ? "Previsão indisponível." : "Carregando previsão…";
    return;
  }
  const daily = forecast.summaries.get(today);
  const date = numericDateFormat.format(new Date(today + "T00:00:00Z"));
  summary.innerHTML = `<span>Hoje, ${date}</span><span>Mín. <strong>${metricMarkup(daily?.low, temperatureLabel)}</strong></span><span>Máx. <strong>${metricMarkup(daily?.high, temperatureLabel)}</strong></span>`;
}

function renderCalendar(today) {
  renderCalendarSummary(today);
  Array.from(days.children).forEach((button, index) => {
    const date = dates[index];
    const key = dateKey(date);
    if (key === today) button.setAttribute("aria-current", "date");
    else button.removeAttribute("aria-current");
    const weekday = weekdayFormat.format(date).replace(/\.$/, "");
    const label = `<span class="day-date"><span>${weekday}</span><strong>${numericDateFormat.format(date)}</strong></span>`;
    const summary = forecast?.summaries.get(key);
    const [icon, description] = summary?.conditions || [];
    const accessibleSummary = `${fullDateFormat.format(date)}. Céu: ${description || sky[icon]?.[0] || "indisponível"}. Mínima: ${temperatureLabel(summary?.low)}. Máxima: ${temperatureLabel(summary?.high)}. Maior probabilidade de chuva no dia: ${rainLabel(summary?.rain)}.`;
    button.setAttribute("aria-pressed", key === selection.day);
    const low = Number.isFinite(summary?.low) ? temperatureLabel(summary.low, "°") : "–";
    const high = Number.isFinite(summary?.high) ? temperatureLabel(summary.high, "°") : "–";
    const rain = Number.isFinite(summary?.rain) ? rainLabel(summary.rain) : "–";
    const condition = icon || description ? skyMarkup(icon, description, true) : "–";
    button.setAttribute("aria-label", accessibleSummary);
    button.innerHTML = `${label}<span class="day-compact"><span class="day-sky">${condition}</span><span class="compact-temperatures">${low}<span class="temperature-divider">/</span>${high}</span><span>${rain}</span></span>`;
  });
  const date = dates[selectedDayIndex()];
  const heading = byId("day-details-title");
  const label = `${fullDateFormat.format(date)}${selection.day === today ? " · Hoje" : ""}`;
  if (heading.textContent !== label) heading.textContent = label;
  const details = byId("calendar-day-details");
  const overview = byId("day-summary");
  const summary = forecast?.summaries.get(selection.day);
  if (!summary) {
    overview.textContent = "";
    details.textContent = forecast || loadFailed ? "Detalhes indisponíveis para este dia." : "Carregando detalhes…";
    return;
  }
  overview.innerHTML = `<div class="day-overview-sky">${skyMarkup(...summary.conditions)}</div>
    <div class="day-overview-temperatures">
      <span>Mín. <strong>${metricMarkup(summary.low, temperatureLabel)}</strong></span>
      <span>Máx. <strong>${metricMarkup(summary.high, temperatureLabel)}</strong></span>
    </div>`;
  const [sunrise, sunset, precipitation, wind, uv] = dailyDetails(summary);
  const rain = ["Chuva no dia", rainLabel(summary.rain)];
  const extra = [sunrise, sunset, precipitation, rain, wind, uv]
    .map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("");
  details.innerHTML = `<dl class="day-detail-grid">${extra}</dl>`;
}

function selectedDayIndex() {
  return dates.findIndex((date) => dateKey(date) === selection.day);
}

function selectedSlot() {
  if (!selection.hour) return undefined;
  const sameClock = forecast?.slots.get(selection.day)
    ?.filter((slot) => slot.hour === selection.hour.hour && slot.minute === selection.hour.minute);
  return sameClock?.find((slot) => slot.offset === selection.hour.offset) || sameClock?.[0];
}

function hourlySelectionStatus() {
  const slot = selectedSlot();
  if (!slot) {
    byId("hour-selection-status").textContent = "";
    return;
  }
  const missing = !Number.isFinite(slot.temperature) && !Number.isFinite(slot.rain) && !slot.conditions.length;
  byId("hour-selection-status").textContent =
    `${slot.label} selecionada · Chuva: ${slot.interval}${missing ? " · Dados indisponíveis para esta hora" : ""}.`;
}

function selectHour(time) {
  const [, start, end] = periods[selectedPeriod];
  const slot = forecast?.slots.get(selection.day)?.find((entry) => entry.time === time);
  if (!forecast?.availableDays.has(selection.day) || !slot || slot.hour < start || slot.hour >= end) return;
  stopAutoSelection();
  selection.hour = { hour: slot.hour, minute: slot.minute, offset: slot.offset };
  for (const row of byId("weather").querySelectorAll("[data-hour]")) {
    const selected = Number(row.dataset.hour) === time;
    row.classList.toggle("selected-hour", selected);
    row.querySelector("button").setAttribute("aria-pressed", selected);
  }
  for (const card of byId("hourly-preview").querySelectorAll("button[data-hour]")) {
    card.setAttribute("aria-pressed", Number(card.dataset.hour) === time);
  }
  revealHourlyPreview(time);
  hourlyCharts.updateSelection();
  hourlySelectionStatus();
}

function localHourKey(now) {
  return currentSlot(now)?.time ?? `${now.dayKey}T${now.hour}@${now.offset}`;
}

function revealHourlyPreview(time) {
  const rail = byId("hourly-preview");
  if (time === undefined || !(rail.scrollWidth > rail.clientWidth)) return;
  const card = rail.querySelector(`button[data-hour="${time}"]`);
  if (!card) return;
  const bounds = rail.getBoundingClientRect();
  const tile = card.getBoundingClientRect();
  if (tile.left < bounds.left) rail.scrollLeft += tile.left - bounds.left;
  if (tile.right > bounds.right) rail.scrollLeft += tile.right - bounds.right;
}

function renderHourlySummary(now) {
  const summary = byId("hourly-summary");
  if (!forecast || !now) {
    summary.textContent = loadFailed ? "Previsão horária indisponível." : "Carregando previsão…";
    return;
  }
  const slot = currentSlot(now);
  if (!slot) {
    summary.textContent = `${twoDigits(now.hour)}h · Previsão horária indisponível.`;
    return;
  }
  summary.innerHTML = `<strong>${clockLabel(slot)}</strong>${skyMarkup(...slot.conditions)}<strong>${metricMarkup(slot.temperature, temperatureLabel)}</strong><span title="Chuva: ${slot.interval}"><span class="sr-only">Chuva: </span>${metricMarkup(slot.rain, rainLabel)}</span>`;
}

function renderHourlyPreview(hourly, selectedTime) {
  const preview = byId("hourly-preview");
  preview.innerHTML = hourly.map(({ time, label, hour, minute, current, conditions, temperature, rain, interval }) => {
    const [icon, description] = conditions;
    const skyLabel = description || sky[icon]?.[0] || "Céu indisponível";
    const skyIcon = icon ? skyMarkup(icon, description, true) : "–";
    const temperatureText = temperatureLabel(temperature);
    const rainText = Number.isFinite(rain) ? rainLabel(rain) : "–";
    const accessible = `${label}, ${skyLabel}, temperatura ${temperatureText}, chuva ${rainLabel(rain)} para ${interval}`;
    return `<button type="button" class="preview-hour${current ? " preview-now" : ""}" data-hour="${time}" aria-pressed="${time === selectedTime}" aria-label="${accessible}"${current ? ' aria-current="time"' : ""}>
      <span class="preview-time">${clockLabel({ hour, minute })}</span>
      <span class="preview-sky" aria-hidden="true">${skyIcon}</span>
      <strong>${Number.isFinite(temperature) ? temperatureText : "–"}</strong>
      <span>${rainText}</span>
    </button>`;
  }).join("");
}

function render() {
  const now = forecastTimeZone ? localNow(forecastTimeZone) : null;
  renderedLocalHour = now ? localHourKey(now) : null;
  if (now && followLocalPeriod) selectCurrentPeriod(now);
  renderCurrentConditions(now);
  renderHourlySummary(now);
  renderCalendar(now?.dayKey ?? null);
  Array.from(periodGroup.children).forEach((button, index) => {
    button.setAttribute("aria-pressed", index === selectedPeriod);
  });
  const dayIndex = selectedDayIndex();
  previous.disabled = dayIndex === 0;
  next.disabled = dayIndex === dates.length - 1;
  byId("selected-date").textContent = fullDateFormat.format(dates[dayIndex]);
  const [, start, end] = periods[selectedPeriod];
  byId("date-range").textContent = `${numericDateFormat.format(dates[0])} a ${numericDateFormat.format(dates.at(-1))}`;
  const weather = byId("weather");
  weather.setAttribute("aria-busy", Boolean(request));
  if (!forecast || !forecast.availableDays.has(selection.day)) {
    const message = forecast ? "Previsão indisponível para a data selecionada."
      : loadFailed ? "Previsão indisponível. Tente atualizar a previsão." : "Carregando dados da Open-Meteo…";
    weather.innerHTML = `<tr><td colspan="4" class="data-note">${message}</td></tr>`;
    hourlyCharts.render([], message);
    byId("hourly-preview").textContent = message;
    byId("hour-selection-status").textContent = "";
    if (forecast) stopAutoLocation();
    return;
  }
  const activeTime = now ? currentSlot(now)?.time : undefined;
  const selectedTime = selectedSlot()?.time;
  const hourly = (forecast.slots.get(selection.day) || [])
    .filter((slot) => slot.hour >= start && slot.hour < end)
    .map((slot) => ({ ...slot, current: slot.time === activeTime }));
  hourlyCharts.render(hourly, "");
  renderHourlyPreview(hourly, selectedTime);
  if (selectedTime !== undefined || pendingAutoLocation) revealHourlyPreview(selectedTime ?? activeTime);
  weather.innerHTML = hourly.map(({ time, label, tick, current, conditions, temperature, rain, interval }) => {
    const marker = current ? ' <span class="now-label">Agora</span>' : "";
    const selected = time === selectedTime;
    const classes = [current ? "current-hour" : "", selected ? "selected-hour" : ""].filter(Boolean).join(" ");
    const hourDescription = label === tick ? "" : ` title="${label}" aria-label="${label}"`;
    return `<tr data-hour="${time}"${classes ? ` class="${classes}"` : ""}><th scope="row"${current ? ' aria-current="time"' : ""}><button class="hour-select" type="button" aria-pressed="${selected}"${hourDescription}>${tick}</button>${marker}</th><td>${skyMarkup(...conditions)}</td><td>${metricMarkup(temperature, temperatureLabel)}</td><td title="Probabilidade de chuva: ${interval}">${metricMarkup(rain, rainLabel)}</td></tr>`;
  }).join("");
  hourlySelectionStatus();

  if (pendingAutoLocation) {
    stopAutoLocation();
    if (!isMobileLayout && !byId("forecast-content").hidden) {
      weather.querySelector(".current-hour")?.scrollIntoView({ block: "center" });
    }
  }
}

function addChoice(parent, className, content, select) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = content;
  button.addEventListener("click", () => {
    stopAutoSelection();
    select();
  });
  parent.append(button);
  return button;
}

function navigateDay(step) {
  stopAutoSelection();
  const index = selectedDayIndex() + step;
  selection.day = dateKey(dates[index]);
  render();
  // Preserve keyboard focus when the activated arrow becomes disabled.
  if (document.activeElement === document.body) days.children[index].focus();
}

dates.forEach((_, index) => {
  addChoice(days, "day", "", () => {
    selection.day = dateKey(dates[index]);
    render();
  });
});
periods.forEach(([name, start, end], index) => {
  const hours = end - start === 6 ? `<small>${twoDigits(start)}h–${twoDigits(end - 1)}h</small>` : "";
  addChoice(periodGroup, "period", name + hours, () => {
    selectedPeriod = index;
    if (selection.hour !== null && (selection.hour.hour < start || selection.hour.hour >= end)) selection.hour = null;
    render();
  });
});
byId("sky-legend").innerHTML = Object.keys(sky).map((key) => `<li>${skyMarkup(key)}</li>`).join("");
previous.addEventListener("click", () => navigateDay(-1));
next.addEventListener("click", () => navigateDay(1));

function bindSectionToggle(buttonId, contentId, defaultCollapsed = false) {
  const button = byId(buttonId);
  const content = byId(contentId);
  const key = `vostok-${buttonId}`;

  function setCollapsed(collapsed) {
    content.hidden = collapsed;
    button.setAttribute("aria-expanded", !collapsed);
  }

  try {
    const saved = localStorage.getItem(key);
    setCollapsed(saved === null ? defaultCollapsed : saved === "collapsed");
  } catch {
    setCollapsed(defaultCollapsed);
  }
  button.addEventListener("click", () => {
    stopAutoLocation();
    setCollapsed(!content.hidden);
    try {
      localStorage.setItem(key, content.hidden ? "collapsed" : "expanded");
    } catch {
      // O controle permanece disponível sem armazenamento.
    }
  });
}

const isMobileLayout = window.matchMedia?.("(max-width: 36rem)").matches;
bindSectionToggle("current-view", "current-content");
bindSectionToggle("calendar-view", "calendar-content", isMobileLayout);
bindSectionToggle("forecast-view", "forecast-content");
bindSectionToggle("charts-view", "charts-content", isMobileLayout);

const hourlyCharts = createHourlyCharts(
  byId("hourly-charts"), byId("chart-values"), temperatureLabel, rainLabel,
  () => selectedSlot()?.time, selectHour
);
byId("weather").addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-hour]");
  if (row) selectHour(Number(row.dataset.hour));
});

byId("hourly-preview").addEventListener("click", (event) => {
  const card = event.target.closest("button[data-hour]");
  if (card) selectHour(Number(card.dataset.hour));
});

const refresh = byId("refresh");
const status = byId("data-status");

function placeLabel(place) {
  return place.locality || (place.name === saoPaulo.name ? saoPaulo.locality : "Localidade selecionada");
}

function renderPlace() {
  const city = placeLabel(livePlace);
  byId("header-city").textContent = city;
  const control = byId("location-toggle");
  control.setAttribute("aria-label", `Selecionar cidade: ${city}`);
  control.title = city;
  byId("forecast-zone").textContent = forecastTimeZone ? `Fuso horário: ${forecastTimeZone}` : "Fuso horário: aguardando previsão.";
}

const savedForecastKey = "vostok-saved-forecast-v1";

function storeForecast(placeKey, payload, timeZone, updatedAt) {
  try {
    localStorage.setItem(savedForecastKey, JSON.stringify({ placeKey, payload, timeZone, updatedAt }));
  } catch {
    // Falhas de armazenamento não afetam a previsão recebida pela rede.
  }
}

function readSavedForecast(placeKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(savedForecastKey));
    if (saved?.placeKey !== placeKey || typeof saved.timeZone !== "string" ||
        typeof saved.updatedAt !== "string") return null;
    const updatedAt = new Date(saved.updatedAt);
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.getTime() > new Date().getTime()) return null;
    const result = parseForecast(saved.payload, saved.timeZone);
    if (!result.availableDays.has(localNow(saved.timeZone).dayKey)) return null;
    return { ...result, timeZone: saved.timeZone, updatedAt, saved: true };
  } catch {
    return null;
  }
}

function savedForecastLabel(data) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: data.timeZone, dateStyle: "short", timeStyle: "short",
  }).format(data.updatedAt);
  return `Previsão salva · Atualizada em ${formatted} (${data.timeZone}).`;
}

function applyForecast(data) {
  forecastTimeZone = data.timeZone;
  forecast = data;
  dates = data.dates;
  if (selectedDayIndex() === -1) {
    selection.day = dateKey(dates[0]);
    selection.hour = null;
  }
  renderPlace();
}

async function loadForecast() {
  if (request) return;
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  forecast = null;
  loadFailed = false;
  refresh.disabled = true;
  status.textContent = "Consultando a previsão…";
  render();

  const placeKey = `${livePlace.latitude},${livePlace.longitude}`;
  try {
    const response = await fetch(forecastUrl(livePlace), { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Falha HTTP " + response.status);
    const payload = await response.json();
    if (request !== controller) return;
    const timeZone = livePlace.timeZone || payload.timezone;
    if (typeof timeZone !== "string" || !timeZone) throw new Error("Fuso da previsão ausente");
    const result = parseForecast(payload, timeZone);
    const updatedFormat = new Intl.DateTimeFormat("pt-BR", {
      timeZone, dateStyle: "short", timeStyle: "short",
    });
    const updatedAt = new Date();
    applyForecast({ ...result, timeZone, updatedAt });
    storeForecast(placeKey, payload, timeZone, updatedAt);
    status.textContent = `Última consulta bem-sucedida em ${updatedFormat.format(updatedAt)} (horário local).`;
  } catch {
    if (request !== controller) return;
    const saved = readSavedForecast(placeKey);
    if (saved) {
      applyForecast(saved);
      status.textContent = savedForecastLabel(saved);
    } else {
      loadFailed = true;
      status.textContent = "Previsão indisponível. Nenhuma previsão salva válida para este local. Verifique a conexão e tente novamente.";
    }
  } finally {
    clearTimeout(timeout);
    if (request === controller) {
      request = null;
      refresh.disabled = false;
      render();
    }
  }
}

function choosePlace(place) {
  stopAutoLocation();
  request?.abort();
  request = null;
  livePlace = place;
  forecastTimeZone = place.timeZone || null;
  followLocalPeriod = true;
  selection.day = dateKey(dates[0]);
  selection.hour = null;
  try {
    localStorage.setItem(lastPlaceKey, JSON.stringify(place));
  } catch {
    // A seleção permanece disponível nesta sessão.
  }
  rememberCity(place);
  renderPlace();
  loadForecast();
}

refresh.addEventListener("click", () => {
  stopAutoLocation();
  loadForecast();
});
window.addEventListener("wheel", stopAutoLocation, { passive: true });
window.addEventListener("touchmove", stopAutoLocation, { passive: true });
window.addEventListener("scroll", stopAutoLocation, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
    stopAutoLocation();
  }
});
function refreshLocalTime() {
  if (!forecast) return;
  const now = localNow(forecastTimeZone);
  if (forecast.saved && !forecast.availableDays.has(now.dayKey)) {
    loadForecast();
    return;
  }
  if (localHourKey(now) === renderedLocalHour) {
    updateCurrentClock();
    updateCurrentReference(now);
    return;
  }

  const active = document.activeElement;
  const focusedPreview = active?.matches(".preview-hour");
  const focusedHour = focusedPreview ? active.dataset.hour
    : active?.matches(".hour-select") ? active.closest("tr")?.dataset.hour : undefined;
  render();
  if (focusedHour !== undefined) {
    const key = `[data-hour="${Number(focusedHour)}"]`;
    const button = focusedPreview ? byId("hourly-preview").querySelector(`button${key}`)
      : byId("weather").querySelector(`${key} .hour-select`);
    button?.focus({ preventScroll: true });
  }
}

function scheduleCurrentClock() {
  setTimeout(() => {
    refreshLocalTime();
    scheduleCurrentClock();
  }, 60000 - Date.now() % 60000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshLocalTime();
});

renderPlace();
loadForecast();
scheduleCurrentClock();

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("service-worker.js").catch((error) => {
    console.warn("Não foi possível preparar a interface offline do Vostok.", error);
  });
}
