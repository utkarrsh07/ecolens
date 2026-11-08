/* ==========================================================
   EcoLens — Watershed Explorer
   ----------------------------------------------------------
   Python (app.py) is the single source of truth for every
   score. This file only DISPLAYS the ECOLENS_* values that
   /api/watersheds attaches to each GeoJSON feature. It never
   re-scores a watershed.
   ========================================================== */

(function () {
  "use strict";

  // --------------------------------------------------------
  // CONFIG (read from the page, written by Python)
  // --------------------------------------------------------

  const ENGINE = readEngineConfig();

  function readEngineConfig() {
    try {
      return JSON.parse(
        document.getElementById("engineConfig").textContent
      );
    } catch (error) {
      return {
        forest_weights: {},
        water_weights: {},
        stress_weights: {},
        priority_thresholds: { Critical: 70, High: 50, Moderate: 30, Low: 0 },
        condition_weight: 0.65,
        stress_weight: 0.35
      };
    }
  }

  const COLORS = {
    critical: "#d03b3b",
    serious: "#ec835a",
    warning: "#fab219",
    good: "#0ca30c",
    poor: "#d03b3b",
    attention: "#ec835a",
    fair: "#8b93a1",
    strong: "#6da7ec",
    excellent: "#3987e5",
    missing: "#2b3846",
    accent: "#2fd8a5"
  };

  const PRIORITY_ORDER = ["Critical", "High", "Moderate", "Low"];

  const PRIORITY_COLORS = {
    Critical: COLORS.critical,
    High: COLORS.serious,
    Moderate: COLORS.warning,
    Low: COLORS.good
  };

  const CONDITION_BINS = [
    { min: 85, label: "Excellent", color: COLORS.excellent, range: "85–100" },
    { min: 70, label: "Strong", color: COLORS.strong, range: "70–84" },
    { min: 55, label: "Fair", color: COLORS.fair, range: "55–69" },
    { min: 40, label: "Needs attention", color: COLORS.attention, range: "40–54" },
    { min: -1, label: "Poor", color: COLORS.poor, range: "0–39" }
  ];

  const STRESS_BINS = [
    { min: 75, label: "Severe", color: COLORS.poor, range: "75–100" },
    { min: 50, label: "High", color: COLORS.attention, range: "50–74" },
    { min: 25, label: "Moderate", color: COLORS.fair, range: "25–49" },
    { min: 10, label: "Low", color: COLORS.strong, range: "10–24" },
    { min: -1, label: "Minimal", color: COLORS.excellent, range: "0–9" }
  ];

  const COVERAGE_BINS = [
    { min: 90, label: "Complete", color: "#86b6ef", range: "90–100%" },
    { min: 70, label: "Good", color: "#5598e7", range: "70–89%" },
    { min: 50, label: "Partial", color: "#2a78d6", range: "50–69%" },
    { min: -1, label: "Limited", color: "#184f95", range: "below 50%" }
  ];

  const GRADE_BINS = [
    { letter: "A", label: "A", color: COLORS.excellent },
    { letter: "B", label: "B", color: COLORS.strong },
    { letter: "C", label: "C", color: COLORS.fair },
    { letter: "D", label: "D", color: COLORS.attention },
    { letter: "F", label: "F", color: COLORS.poor }
  ];

  const FOREST_COMPONENTS = ["Forest Cover", "Forest Interior", "Forest Riparian"];
  const WATER_COMPONENTS = ["Benthic", "E. coli", "Phosphorus"];

  const INDICATOR_LABELS = {
    "Forest Overall": "Forest (overall)",
    "Forest Cover": "Forest cover",
    "Forest Interior": "Forest interior",
    "Forest Riparian": "Riparian forest",
    "Water Quality Overall": "Water quality (overall)",
    "Benthic": "Benthic invertebrates",
    "E. coli": "E. coli",
    "Phosphorus": "Phosphorus"
  };

  // --------------------------------------------------------
  // DATA ACCESS
  // --------------------------------------------------------

  const props = (feature) => feature.properties || {};

  const nameOf = (feature) =>
    props(feature).SUBWSHD_NAME || "Unnamed watershed";

  function indicator(feature, name) {
    const all = props(feature).ECOLENS_INDICATORS || {};
    return all[name] || { grade: null, score: null, severity: null };
  }

  function gradeLetter(feature, name) {
    const item = indicator(feature, name);
    if (item.score === null || item.score === undefined) return null;
    return String(item.grade || "").trim().toUpperCase() || null;
  }

  const isNum = (value) =>
    value !== null && value !== undefined && !Number.isNaN(Number(value));

  // --------------------------------------------------------
  // METRICS (what the map can be coloured by)
  // --------------------------------------------------------

  function conditionMetric(key, label, field, extra) {
    return Object.assign({
      key,
      label,
      group: "EcoLens scores",
      kind: "condition",
      value: (f) => props(f)[field],
      order: "asc",
      orderText: "Weakest first",
      suffix: "/100"
    }, extra || {});
  }

  function gradeMetric(key, label, indicatorName) {
    return {
      key,
      label,
      group: "Report-card grades",
      kind: "grade",
      indicatorName,
      value: (f) => indicator(f, indicatorName).score,
      display: (f) => gradeLetter(f, indicatorName),
      order: "asc",
      orderText: "Weakest grade first"
    };
  }

  const METRICS = [
    {
      key: "priority",
      label: "Restoration priority",
      group: "EcoLens scores",
      kind: "priority",
      value: (f) => props(f).ECOLENS_PRIORITY_SCORE,
      order: "desc",
      orderText: "Highest priority first",
      suffix: "/100"
    },
    conditionMetric("health", "Environmental health", "ECOLENS_HEALTH_SCORE"),
    {
      key: "stress",
      label: "Environmental stress",
      group: "EcoLens scores",
      kind: "stress",
      value: (f) => props(f).ECOLENS_STRESS_INDEX,
      order: "desc",
      orderText: "Most stressed first",
      suffix: "/100"
    },
    conditionMetric("forest", "Forest condition", "ECOLENS_FOREST_SCORE"),
    conditionMetric("water", "Surface-water condition", "ECOLENS_WATER_SCORE"),
    {
      key: "coverage",
      label: "Evidence coverage",
      group: "EcoLens scores",
      kind: "coverage",
      value: (f) => props(f).ECOLENS_CONFIDENCE,
      order: "asc",
      orderText: "Least evidence first",
      suffix: "%"
    },
    gradeMetric("g_forest", "Forest (overall grade)", "Forest Overall"),
    gradeMetric("g_cover", "Forest cover", "Forest Cover"),
    gradeMetric("g_interior", "Forest interior", "Forest Interior"),
    gradeMetric("g_riparian", "Riparian forest", "Forest Riparian"),
    gradeMetric("g_water", "Water quality (overall grade)", "Water Quality Overall"),
    gradeMetric("g_benthic", "Benthic invertebrates", "Benthic"),
    gradeMetric("g_ecoli", "E. coli", "E. coli"),
    gradeMetric("g_phosph", "Phosphorus", "Phosphorus")
  ];

  const metricByKey = (key) =>
    METRICS.find((metric) => metric.key === key) || METRICS[0];

  function binFor(metric, feature) {
    const value = metric.value(feature);

    if (metric.kind === "priority") {
      const label = props(feature).ECOLENS_PRIORITY_LABEL;
      if (!PRIORITY_COLORS[label]) return null;
      return { label, color: PRIORITY_COLORS[label] };
    }

    if (!isNum(value)) return null;

    if (metric.kind === "grade") {
      const letter = (metric.display(feature) || "").charAt(0);
      return GRADE_BINS.find((bin) => bin.letter === letter) ||
        conditionBin(value);
    }

    const bins =
      metric.kind === "stress" ? STRESS_BINS :
      metric.kind === "coverage" ? COVERAGE_BINS :
      CONDITION_BINS;

    return bins.find((bin) => Number(value) >= bin.min);
  }

  function conditionBin(value) {
    if (!isNum(value)) return null;
    return CONDITION_BINS.find((bin) => Number(value) >= bin.min);
  }

  function legendBins(metric) {
    if (metric.kind === "priority") {
      return PRIORITY_ORDER.map((label) => ({
        label,
        color: PRIORITY_COLORS[label],
        range: "≥ " + ENGINE.priority_thresholds[label]
      }));
    }
    if (metric.kind === "grade") return GRADE_BINS;
    if (metric.kind === "stress") return STRESS_BINS;
    if (metric.kind === "coverage") return COVERAGE_BINS;
    return CONDITION_BINS;
  }

  function formatMetric(metric, feature) {
    if (metric.kind === "grade") {
      return metric.display(feature) || "Not reported";
    }
    const value = metric.value(feature);
    if (!isNum(value)) return "No data";
    return Math.round(Number(value)) + (metric.suffix || "");
  }

  // --------------------------------------------------------
  // STATE
  // --------------------------------------------------------

  const state = {
    features: [],
    layers: new Map(),       // feature id -> Leaflet layer
    metricKey: "priority",
    priorityFilter: "All",
    search: "",
    selectedId: null,
    hoveredId: null,
    interpretMode: "analyst",
    region: null
  };

  let map = null;
  let geoLayer = null;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const fmt = (value, digits) =>
    isNum(value) ? Number(value).toFixed(digits || 0) : "—";

  const mean = (values) => {
    const list = values.filter(isNum).map(Number);
    return list.length
      ? list.reduce((sum, v) => sum + v, 0) / list.length
      : null;
  };

  const normalize = (text) =>
    String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’']/g, "")
      .trim();

  // --------------------------------------------------------
  // REGIONAL STATISTICS (aggregates of Python results)
  // --------------------------------------------------------

  function computeRegion(features) {
    const count = (fn) => features.filter(fn).length;

    const reported = (name) =>
      count((f) => isNum(indicator(f, name).score));

    const priorityCounts = {};
    PRIORITY_ORDER.forEach((label) => {
      priorityCounts[label] = count(
        (f) => props(f).ECOLENS_PRIORITY_LABEL === label
      );
    });

    return {
      total: features.length,
      ranked: count((f) => isNum(props(f).ECOLENS_PRIORITY_RANK)),
      health: mean(features.map((f) => props(f).ECOLENS_HEALTH_SCORE)),
      forest: mean(features.map((f) => props(f).ECOLENS_FOREST_SCORE)),
      water: mean(features.map((f) => props(f).ECOLENS_WATER_SCORE)),
      stress: mean(features.map((f) => props(f).ECOLENS_STRESS_INDEX)),
      coverage: mean(features.map((f) => props(f).ECOLENS_CONFIDENCE)),
      priorityCounts,
      noWater: count((f) => !isNum(props(f).ECOLENS_WATER_SCORE)),
      reported: {
        "Benthic": reported("Benthic"),
        "E. coli": reported("E. coli"),
        "Phosphorus": reported("Phosphorus"),
        "Forest Interior": reported("Forest Interior")
      }
    };
  }

  // --------------------------------------------------------
  // KPI STRIP
  // --------------------------------------------------------

  function renderKpis() {
    const r = state.region;
    const attention = r.priorityCounts.Critical + r.priorityCounts.High;
    const healthBin = conditionBin(r.health);

    $("kpiStrip").innerHTML = `
      <div class="kpi">
        <span class="kpi-label">Watersheds</span>
        <span class="kpi-value">${r.total}</span>
        <span class="kpi-sub">scored from 2023 grades</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Average health</span>
        <span class="kpi-value">${fmt(r.health)}<small>/100</small></span>
        <span class="kpi-sub">${healthBin ? healthBin.label : "—"}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">High or critical</span>
        <span class="kpi-value">${attention}<small> of ${r.ranked}</small></span>
        <span class="kpi-sub">restoration priority</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Evidence coverage</span>
        <span class="kpi-value">${fmt(r.coverage)}<small>%</small></span>
        <span class="kpi-sub">average indicator weight reported</span>
      </div>
    `;
  }

  // --------------------------------------------------------
  // MAP
  // --------------------------------------------------------

  function createMap() {
    map = L.map("watershedMap", {
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 100,
      minZoom: 8,
      maxZoom: 16
    }).setView([43.45, -79.9], 10);

    map.createPane("labels");
    map.getPane("labels").style.zIndex = 650;
    map.getPane("labels").style.pointerEvents = "none";

    const attribution =
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a> · ' +
      "Data: Conservation Halton Open Data";

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 19, attribution }
    ).addTo(map);

    // Place names drawn ABOVE the coloured polygons so they stay readable.
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 19, pane: "labels" }
    ).addTo(map);
  }

  function styleFor(feature) {
    const metric = metricByKey(state.metricKey);
    const bin = binFor(metric, feature);
    const id = feature.__id;

    const isSelected = id === state.selectedId;
    const isHovered = id === state.hoveredId;
    const isFilteredOut = !passesFilters(feature);
    const someoneSelected = state.selectedId !== null;

    const style = {
      fillColor: bin ? bin.color : COLORS.missing,
      fillOpacity: bin ? 0.78 : 0.55,
      color: "#08131d",
      weight: 1,
      opacity: 1,
      dashArray: null
    };

    if (!bin) {
      style.color = "#4d6074";
      style.dashArray = "3 3";
    }

    if (someoneSelected && !isSelected) {
      style.fillOpacity *= 0.55;
    }

    if (isFilteredOut) {
      style.fillOpacity = 0.12;
      style.opacity = 0.35;
    }

    if (isHovered) {
      style.color = "#ffffff";
      style.weight = 2;
      style.dashArray = null;
      style.fillOpacity = Math.max(style.fillOpacity, 0.85);
    }

    if (isSelected) {
      style.color = "#ffffff";
      style.weight = 3;
      style.dashArray = null;
      style.fillOpacity = 0.92;
    }

    return style;
  }

  function restyleAll() {
    if (!geoLayer) return;
    geoLayer.eachLayer((layer) => layer.setStyle(styleFor(layer.feature)));

    const selected = state.layers.get(state.selectedId);
    if (selected) selected.bringToFront();
  }

  function restyleOne(id) {
    const layer = state.layers.get(id);
    if (!layer) return;
    layer.setStyle(styleFor(layer.feature));
    if (id === state.hoveredId || id === state.selectedId) {
      layer.bringToFront();
    }
  }

  function tooltipHtml(feature) {
    const metric = metricByKey(state.metricKey);
    const bin = binFor(metric, feature);
    const p = props(feature);

    const priorityLine =
      metric.kind === "priority"
        ? ""
        : `<div class="tt-row">Priority: ${escapeHtml(p.ECOLENS_PRIORITY_LABEL || "—")}</div>`;

    return `
      <strong>${escapeHtml(nameOf(feature))}</strong>
      <div class="tt-row">
        <span class="swatch ${bin ? "" : "missing"}" style="background:${bin ? bin.color : COLORS.missing}"></span>
        ${escapeHtml(metric.label)}: <b>${escapeHtml(formatMetric(metric, feature))}</b>
        ${bin && metric.kind !== "grade" ? "· " + escapeHtml(bin.label) : ""}
      </div>
      ${priorityLine}
    `;
  }

  function addWatershedLayer(geojson) {
    const renderer = L.canvas({ padding: 0.4, tolerance: 4 });

    geoLayer = L.geoJSON(geojson, {
      renderer,
      style: styleFor,
      onEachFeature: (feature, layer) => {
        state.layers.set(feature.__id, layer);

        layer.bindTooltip(() => tooltipHtml(feature), {
          sticky: true,
          direction: "top",
          offset: [0, -10],
          className: "eco-tooltip",
          opacity: 1
        });

        layer.on({
          mouseover: () => setHovered(feature.__id),
          mouseout: () => setHovered(null),
          click: () => selectWatershed(feature.__id, { fly: true })
        });
      }
    }).addTo(map);
  }

  function fitRegion(animate) {
    if (!geoLayer) return;
    const bounds = geoLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
        paddingTopLeft: [24, 70],
        animate: !!animate
      });
    }
  }

  function setHovered(id) {
    const previous = state.hoveredId;
    if (previous === id) return;

    state.hoveredId = id;

    if (previous !== null) restyleOne(previous);
    if (id !== null) restyleOne(id);

    document
      .querySelectorAll(".rank-item.hovered")
      .forEach((el) => el.classList.remove("hovered"));

    if (id !== null) {
      const row = document.querySelector(`.rank-item[data-id="${id}"]`);
      if (row) row.classList.add("hovered");
    }
  }

  // --------------------------------------------------------
  // LEGEND
  // --------------------------------------------------------

  function renderLegend() {
    const metric = metricByKey(state.metricKey);
    const bins = legendBins(metric);

    const counts = new Map();
    let missing = 0;

    state.features.forEach((feature) => {
      const bin = binFor(metric, feature);
      if (!bin) {
        missing += 1;
        return;
      }
      counts.set(bin.label, (counts.get(bin.label) || 0) + 1);
    });

    const subtitle = {
      priority: "0.65 × condition deficit + 0.35 × stress",
      condition: "EcoLens score, 0–100 (higher is better)",
      stress: "Weighted severity of weak indicators (higher is worse)",
      coverage: "Share of indicator weight actually reported",
      grade: "Conservation Halton 2023 published grade"
    }[metric.kind];

    const rows = bins.map((bin) => `
      <div class="legend-item">
        <span class="swatch" style="background:${bin.color}"></span>
        <span>${escapeHtml(bin.label)}${bin.range && metric.kind !== "grade" ? ` <em>${escapeHtml(bin.range)}</em>` : ""}</span>
        <em>${counts.get(bin.label) || 0}</em>
      </div>
    `).join("");

    const missingRow = missing
      ? `
        <div class="legend-item">
          <span class="swatch missing"></span>
          <span>${metric.kind === "grade" ? "Not reported" : "Insufficient data"}</span>
          <em>${missing}</em>
        </div>`
      : "";

    $("mapLegend").innerHTML = `
      <div class="legend-title">${escapeHtml(metric.label)}</div>
      <div class="legend-sub">${escapeHtml(subtitle)}</div>
      <div class="legend-items">${rows}${missingRow}</div>
    `;
  }

  // --------------------------------------------------------
  // METRIC PICKER
  // --------------------------------------------------------

  function renderMetricPicker() {
    const select = $("metricSelect");
    const groups = {};

    METRICS.forEach((metric) => {
      (groups[metric.group] = groups[metric.group] || []).push(metric);
    });

    select.innerHTML = Object.entries(groups).map(([group, metrics]) => `
      <optgroup label="${escapeHtml(group)}">
        ${metrics.map((metric) => {
          const available = state.features.some((f) => isNum(metric.value(f)));
          return `<option value="${metric.key}" ${available ? "" : "disabled"}>
            ${escapeHtml(metric.label)}${available ? "" : " (not reported in 2023)"}
          </option>`;
        }).join("")}
      </optgroup>
    `).join("");

    select.value = state.metricKey;

    select.addEventListener("change", () => {
      state.metricKey = select.value;
      restyleAll();
      renderLegend();
      renderRankList();
    });
  }

})();
