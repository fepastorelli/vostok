"use strict";

function createHourlyCharts(container, readout, formatTemperature, formatPercent, getSelectedHour, selectHour) {
  const charts = [
    { svg: container.querySelector("#temperature-chart"), field: "temperature" },
    { svg: container.querySelector("#rain-chart"), field: "rain" },
  ];
  const left = 38;
  const right = 18;
  const top = 15;
  const bottom = 98;
  let series = [];
  let width = 0;
  let active = -1;

  function pointX(index) {
    return left + index * (width - left - right) / Math.max(1, series.length - 1);
  }

  function positionMarker(svg, selector, index) {
    const marker = svg.querySelector(selector);
    if (!marker) return;
    marker.setAttribute("visibility", index === -1 ? "hidden" : "visible");
    if (index !== -1) marker.setAttribute("transform", `translate(${pointX(index)} 0)`);
  }

  function updateSelection() {
    const selected = series.findIndex((point) => point.time === getSelectedHour());
    for (const { svg } of charts) {
      positionMarker(svg, ".chart-cursor", active === selected ? -1 : active);
      positionMarker(svg, ".chart-selection", selected);
    }
    const current = series[active] || series[selected] || series.find((point) => point.current);
    const text = current
      ? `${current.label}${current.current ? " · Agora" : ""}${current.time === getSelectedHour() ? " · Selecionado" : ""} · Temperatura: ${formatTemperature(current.temperature)} · Chuva: ${formatPercent(current.rain)} (${current.interval})`
      : "Selecione uma hora no gráfico para consultar os valores.";
    if (readout.textContent !== text) readout.textContent = text;
  }

  function setActive(index) {
    active = index;
    updateSelection();
  }

  function commit(index) {
    const point = series[index];
    if (!point) return;
    active = -1;
    selectHour(point.time);
  }

  function draw() {
    if (!series.length) return;
    width = Math.max(240, container.clientWidth || 640);
    const tickEvery = series.length > 8 ? (width < 460 ? 6 : 3) : 1;
    const times = series.map(({ tick }, index) => {
      const last = series.length - 1;
      if (index !== last && (index % tickEvery || last - index < tickEvery / 2)) return "";
      return `<text x="${pointX(index)}" y="118" text-anchor="middle">${tick}</text>`;
    }).join("");
    const current = series.findIndex((point) => point.current);
    const nowX = pointX(current);
    const anchor = nowX > width - 40 ? "end" : "middle";
    const nowLine = current === -1 ? "" : `<path class="chart-now" d="M${nowX} ${top}V${bottom}"/><text class="chart-now-label" x="${nowX}" y="11" text-anchor="${anchor}">Agora</text>`;

    for (const { svg, field } of charts) {
      const values = series.map((point) => point[field]).filter(Number.isFinite);
      const rain = field === "rain";
      const min = rain ? 0 : Math.floor(Math.min(...values) / 5) * 5;
      const max = rain ? 100 : Math.max(min + 5, Math.ceil(Math.max(...values) / 5) * 5);
      const y = (value) => bottom - (value - min) * (bottom - top) / (max - min);
      let previous = false;
      const line = [];
      const dots = [];
      series.forEach((point, index) => {
        const value = point[field];
        if (Number.isFinite(value)) {
          const x = pointX(index);
          const yValue = y(value);
          line.push(`${previous ? "L" : "M"}${x} ${yValue}`);
          dots.push(`<circle cx="${x}" cy="${yValue}" r="2.3"/>`);
        }
        previous = Number.isFinite(value);
      });
      const guides = values.length
        ? [min, (min + max) / 2, max].map((value) =>
          `<path class="chart-grid" d="M${left} ${y(value)}H${width - right}"/><text x="31" y="${y(value) + 4}" text-anchor="end">${value.toLocaleString("pt-BR")}</text>`
        ).join("")
        : `<text x="${width / 2}" y="61" text-anchor="middle">Dados indisponíveis</text>`;
      svg.setAttribute("viewBox", `0 0 ${width} 128`);
      svg.innerHTML = `<g aria-hidden="true">${guides}${times}${nowLine}<path class="chart-line" d="${line.join(" ")}"/><g class="chart-points">${dots.join("")}</g><path class="chart-selection" d="M0 ${top}V${bottom}" visibility="hidden"/><path class="chart-cursor" d="M0 ${top}V${bottom}" visibility="hidden"/></g>`;
    }
    updateSelection();
  }

  for (const { svg } of charts) {
    const pointerIndex = (event) => {
      if (!series.length) return -1;
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return -1;
      const x = (event.clientX - rect.left) * width / rect.width;
      const index = Math.round((x - left) * (series.length - 1) / (width - left - right));
      return Math.max(0, Math.min(series.length - 1, index));
    };
    svg.addEventListener("pointermove", (event) => setActive(pointerIndex(event)));
    svg.addEventListener("click", (event) => commit(pointerIndex(event)));
    svg.addEventListener("pointerleave", () => setActive(-1));
    svg.addEventListener("blur", () => setActive(-1));
    svg.addEventListener("keydown", (event) => {
      if (!series.length || !["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      const selected = series.findIndex((point) => point.time === getSelectedHour());
      const base = active === -1 ? selected : active;
      if (event.key === "Enter" || event.key === " ") {
        const current = series.findIndex((point) => point.current);
        commit(base === -1 ? Math.max(0, current) : base);
        return;
      }
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const next = base === -1 ? (offset === -1 ? series.length - 1 : 0) : base + offset;
      const index = event.key === "Home" ? 0 : event.key === "End" ? series.length - 1 : next;
      commit(Math.max(0, Math.min(series.length - 1, index)));
    });
  }

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (container.clientWidth && Math.max(240, container.clientWidth) !== width) draw();
    }).observe(container);
  } else {
    window.addEventListener("resize", draw);
  }

  function render(points, message) {
    series = points;
    active = -1;
    const status = document.getElementById("chart-status");
    status.hidden = !message;
    status.textContent = message;
    container.hidden = Boolean(message);
    if (points.length) draw();
  }

  return { render, updateSelection: () => setActive(-1) };
}
