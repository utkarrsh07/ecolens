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

  // --------------------------------------------------------
  // FILTERS + RANKED LIST
  // --------------------------------------------------------

  function passesFilters(feature) {
    if (
      state.priorityFilter !== "All" &&
      props(feature).ECOLENS_PRIORITY_LABEL !== state.priorityFilter
    ) {
      return false;
    }

    if (state.search && !normalize(nameOf(feature)).includes(state.search)) {
      return false;
    }

    return true;
  }

  function renderFilters() {
    const counts = state.region.priorityCounts;

    const chips = [`
      <button class="chip ${state.priorityFilter === "All" ? "active" : ""}" data-filter="All" type="button">
        All <b>${state.features.length}</b>
      </button>
    `].concat(PRIORITY_ORDER.map((label) => `
      <button class="chip ${state.priorityFilter === label ? "active" : ""}" data-filter="${label}" type="button">
        <span class="swatch" style="background:${PRIORITY_COLORS[label]}"></span>
        ${label} <b>${counts[label]}</b>
      </button>
    `));

    $("priorityFilters").innerHTML = chips.join("");
  }

  function setPriorityFilter(label) {
    state.priorityFilter = label;
    renderFilters();
    renderRankList();
    restyleAll();
  }

  function sortedFeatures() {
    const metric = metricByKey(state.metricKey);
    const direction = metric.order === "desc" ? -1 : 1;

    return state.features
      .filter(passesFilters)
      .slice()
      .sort((a, b) => {
        const va = metric.value(a);
        const vb = metric.value(b);
        const aMissing = !isNum(va);
        const bMissing = !isNum(vb);

        if (aMissing && bMissing) return nameOf(a).localeCompare(nameOf(b));
        if (aMissing) return 1;
        if (bMissing) return -1;

        if (Number(va) !== Number(vb)) {
          return (Number(va) - Number(vb)) * direction;
        }

        if (metric.kind !== "priority") {
          const pa0 = props(a).ECOLENS_PRIORITY_RANK || 9999;
          const pb0 = props(b).ECOLENS_PRIORITY_RANK || 9999;
          if (pa0 !== pb0) return pa0 - pb0;
        }

        // Tie-break by restoration priority, then name.
        const pa = props(a).ECOLENS_PRIORITY_SCORE || 0;
        const pb = props(b).ECOLENS_PRIORITY_SCORE || 0;
        if (pa !== pb) return pb - pa;

        return nameOf(a).localeCompare(nameOf(b));
      });
  }

  function displayRank(metric, feature) {
    if (metric.kind === "priority") {
      return props(feature).ECOLENS_PRIORITY_RANK || "–";
    }

    const value = metric.value(feature);
    if (!isNum(value)) return "–";

    const better = state.features.filter((other) => {
      const v = metric.value(other);
      if (!isNum(v)) return false;
      return metric.order === "desc" ? Number(v) > Number(value) : Number(v) < Number(value);
    }).length;

    return better + 1;
  }

  function renderRankList() {
    const metric = metricByKey(state.metricKey);
    const list = sortedFeatures();

    $("rankTitle").textContent =
      metric.kind === "priority" ? "Restoration priority" : metric.label;

    $("rankSubtitle").textContent = metric.orderText;
    $("rankCount").textContent = `${list.length} of ${state.features.length}`;

    if (!list.length) {
      $("rankList").innerHTML = `<li class="rank-empty">No watersheds match these filters.</li>`;
      return;
    }

    $("rankList").innerHTML = list.map((feature) => {
      const bin = binFor(metric, feature);
      const value = metric.value(feature);
      const width =
        metric.kind === "grade" || !isNum(value)
          ? (isNum(value) ? Number(value) : 0)
          : Math.max(3, Math.min(100, Number(value)));

      const secondary =
        metric.kind === "priority"
          ? (props(feature).ECOLENS_PRIORITY_LABEL || "")
          : (bin && metric.kind !== "grade" ? bin.label : "");

      const id = feature.__id;

      return `
        <li>
          <button class="rank-item ${id === state.selectedId ? "active" : ""}" data-id="${id}" type="button">
            <span class="rank-pos">${displayRank(metric, feature)}</span>
            <span class="rank-main">
              <span class="rank-name">${escapeHtml(nameOf(feature))}</span>
              <span class="rank-bar"><i style="width:${width}%;background:${bin ? bin.color : COLORS.missing}"></i></span>
            </span>
            <span class="rank-score">
              ${escapeHtml(formatMetric(metric, feature).replace("/100", ""))}
              <small>${escapeHtml(secondary)}</small>
            </span>
          </button>
        </li>
      `;
    }).join("");
  }

  function scrollRowIntoView(id) {
    const row = document.querySelector(`.rank-item[data-id="${id}"]`);
    if (!row) return;

    const list = $("rankList");
    const rowTop = row.offsetTop - list.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;

    if (rowTop < list.scrollTop || rowBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: rowTop - list.clientHeight / 2, behavior: "smooth" });
    }
  }

  // --------------------------------------------------------
  // SELECTION
  // --------------------------------------------------------

  function selectWatershed(id, options) {
    const feature = state.features[id];
    if (!feature) return;

    state.selectedId = id;
    restyleAll();

    document.querySelectorAll(".rank-item.active").forEach((el) => el.classList.remove("active"));
    const row = document.querySelector(`.rank-item[data-id="${id}"]`);
    if (row) row.classList.add("active");
    scrollRowIntoView(id);

    renderProfile(feature);

    if (options && options.fly) {
      const layer = state.layers.get(id);
      if (layer) {
        map.flyToBounds(layer.getBounds(), {
          padding: [70, 70],
          maxZoom: 13,
          duration: 0.55
        });
      }
    }

    try {
      history.replaceState(null, "", "#w=" + encodeURIComponent(nameOf(feature)));
    } catch (error) { /* ignore */ }
  }

  function clearSelection() {
    state.selectedId = null;
    restyleAll();
    document.querySelectorAll(".rank-item.active").forEach((el) => el.classList.remove("active"));
    renderOverview();
    fitRegion(true);

    try {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (error) { /* ignore */ }
  }

  function selectFromHash() {
    const match = window.location.hash.match(/^#w=(.+)$/);
    if (!match) return false;

    const wanted = normalize(decodeURIComponent(match[1]));
    const feature = state.features.find((f) => normalize(nameOf(f)) === wanted);

    if (feature) {
      selectWatershed(feature.__id, { fly: true });
      return true;
    }
    return false;
  }

  // --------------------------------------------------------
  // PROFILE: SHARED PIECES
  // --------------------------------------------------------

  function gaugeSvg(value, color) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const fraction = isNum(value) ? Math.max(0, Math.min(100, Number(value))) / 100 : 0;

    return `
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle class="gauge-track" cx="64" cy="64" r="${radius}" fill="none" stroke-width="11"></circle>
        <circle class="gauge-fill" cx="64" cy="64" r="${radius}" fill="none"
          stroke="${color}" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${circumference.toFixed(2)}"
          data-target="${(circumference * (1 - fraction)).toFixed(2)}"></circle>
      </svg>
    `;
  }

  function animateGauges(root) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.querySelectorAll(".gauge-fill").forEach((circle) => {
          circle.style.strokeDashoffset = circle.dataset.target;
        });
      });
    });
  }

  function metricRow(options) {
    const { label, value, average, color, foot, suffix } = options;

    if (!isNum(value)) {
      return `
        <div class="metric-row">
          <div class="metric-head">
            <span>${escapeHtml(label)}</span>
            <span class="metric-value">Not reported</span>
          </div>
          <div class="metric-track"></div>
          ${foot ? `<div class="metric-foot">${foot}</div>` : ""}
        </div>
      `;
    }

    const width = Math.max(2, Math.min(100, Number(value)));
    const avgLeft = isNum(average) ? Math.max(0, Math.min(100, Number(average))) : null;

    return `
      <div class="metric-row">
        <div class="metric-head">
          <span>${escapeHtml(label)}</span>
          <span class="metric-value">${fmt(value)}<small>${suffix || "/100"}</small></span>
        </div>
        <div class="metric-track">
          <i style="width:${width}%;background:${color}"></i>
          ${avgLeft !== null ? `<b style="left:calc(${avgLeft}% - 1px)" title="Regional average ${fmt(average)}"></b>` : ""}
        </div>
        ${foot ? `<div class="metric-foot">${foot}</div>` : ""}
      </div>
    `;
  }

  function versusAverage(value, average, higherIsWorse) {
    if (!isNum(value) || !isNum(average)) return "";
    const diff = Number(value) - Number(average);
    const rounded = Math.round(Math.abs(diff));

    if (rounded === 0) return `Regional average ${fmt(average)} · in line with the region`;

    const better = higherIsWorse ? diff < 0 : diff > 0;
    return `Regional average ${fmt(average)} · ${rounded} points ${diff > 0 ? "above" : "below"}` +
      ` (${better ? "better" : "worse"} than average)`;
  }

  // --------------------------------------------------------
  // PROFILE: REGIONAL OVERVIEW (nothing selected)
  // --------------------------------------------------------

  function renderOverview() {
    const r = state.region;
    const healthBin = conditionBin(r.health) || CONDITION_BINS[2];
    const attention = r.priorityCounts.Critical + r.priorityCounts.High;

    const totalRanked = PRIORITY_ORDER.reduce((sum, label) => sum + r.priorityCounts[label], 0) || 1;

    const stack = PRIORITY_ORDER
      .filter((label) => r.priorityCounts[label] > 0)
      .map((label) => `<i style="flex:${r.priorityCounts[label]};background:${PRIORITY_COLORS[label]}" title="${label}: ${r.priorityCounts[label]}"></i>`)
      .join("");

    const stackLegend = PRIORITY_ORDER.map((label) => `
      <button type="button" data-filter="${label}">
        <span class="swatch" style="background:${PRIORITY_COLORS[label]}"></span>
        ${label}
        <b>${r.priorityCounts[label]}</b>
      </button>
    `).join("");

    const top = state.features
      .filter((f) => isNum(props(f).ECOLENS_PRIORITY_RANK))
      .sort((a, b) => props(a).ECOLENS_PRIORITY_RANK - props(b).ECOLENS_PRIORITY_RANK)
      .slice(0, 5)
      .map((f) => `
        <li>
          <button type="button" data-id="${f.__id}">
            <span class="rank-pos">#${props(f).ECOLENS_PRIORITY_RANK}</span>
            <span>${escapeHtml(nameOf(f))}</span>
            <em>
              <span class="swatch" style="background:${PRIORITY_COLORS[props(f).ECOLENS_PRIORITY_LABEL] || COLORS.missing}"></span>
              ${fmt(props(f).ECOLENS_PRIORITY_SCORE)}
            </em>
          </button>
        </li>
      `).join("");

    const forestBin = conditionBin(r.forest);
    const waterBin = conditionBin(r.water);

    const panel = $("profilePanel");

    panel.innerHTML = `
      <div class="profile">

        <p class="profile-kicker">Regional overview</p>
        <h2>Conservation Halton watersheds</h2>
        <p class="profile-rank">${r.total} subwatersheds · 2023 Watershed Report Card</p>

        <div class="hero-row">
          <div class="gauge-wrap">
            <div class="gauge">
              ${gaugeSvg(r.health, healthBin.color)}
              <div class="gauge-center">
                <strong>${fmt(r.health)}</strong>
                <span>Avg health</span>
              </div>
            </div>
            <span class="gauge-label"><i class="swatch" style="background:${healthBin.color}"></i>${escapeHtml(healthBin.label)}</span>
          </div>

          <div class="hero-facts">
            <div>
              <div class="fact-label">Need restoration attention</div>
              <div class="fact-value">${attention} watersheds <small>high or critical</small></div>
            </div>
            <div>
              <div class="fact-label">Average evidence coverage</div>
              <div class="fact-value">${fmt(r.coverage)}% <small>of indicator weight</small></div>
              <div class="meter"><i style="width:${fmt(r.coverage)}%"></i></div>
            </div>
          </div>
        </div>

        <div class="block">
          <div class="block-title">Priority distribution <small>click to filter</small></div>
          <div class="stack-bar">${stack}</div>
          <div class="stack-legend">${stackLegend}</div>
        </div>

        <div class="block">
          <div class="block-title">Forest vs surface water <small>regional averages</small></div>
          ${metricRow({ label: "Forest condition", value: r.forest, color: forestBin ? forestBin.color : COLORS.fair })}
          ${metricRow({
            label: "Surface-water condition",
            value: r.water,
            color: waterBin ? waterBin.color : COLORS.fair,
            foot: `Based on the ${r.total - r.noWater} watersheds with surface-water grades.`
          })}
        </div>

        <div class="block">
          <div class="block-title">Top restoration priorities</div>
          <ol class="mini-list">${top}</ol>
        </div>

        <div class="block">
          <div class="block-title">Evidence gaps in the 2023 data</div>
          <ul class="gap-list">
            <li><span>No surface-water grades at all</span><b>${r.noWater} of ${r.total}</b></li>
            <li><span>Benthic invertebrates reported</span><b>${r.reported["Benthic"]} of ${r.total}</b></li>
            <li><span>Phosphorus reported</span><b>${r.reported["Phosphorus"]} of ${r.total}</b></li>
            <li><span>E. coli reported</span><b>${r.reported["E. coli"]} of ${r.total}</b></li>
          </ul>
        </div>

        <div class="hint">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 3l11 6-5 1.5L8 16z" fill="currentColor"/></svg>
          Click any watershed on the map or in the list for its full profile.
        </div>

        <p class="footnote">
          EcoLens scores are experimental and are not official Conservation Halton assessments.
          Data: Conservation Halton Open Data · Analysis: EcoLens.
        </p>
      </div>
    `;

    panel.scrollTop = 0;
    animateGauges(panel);
  }

  // --------------------------------------------------------
  // PROFILE: SIGNALS (rule-based, explainable)
  // --------------------------------------------------------

  function buildSignals(feature) {
    const p = props(feature);
    const signals = [];

    const forest = p.ECOLENS_FOREST_SCORE;
    const water = p.ECOLENS_WATER_SCORE;

    if (isNum(forest) && isNum(water) && Math.abs(forest - water) >= 15) {
      const forestBetter = forest > water;
      signals.push({
        type: "warn",
        icon: "≠",
        html: `<b>${forestBetter ? "Forest condition outperforms surface water" : "Surface water outperforms forest condition"}</b>
          by ${Math.round(Math.abs(forest - water))} points (${fmt(forest)} vs ${fmt(water)}).`
      });
    }

    const cover = indicator(feature, "Forest Cover");
    const riparian = indicator(feature, "Forest Riparian");
    const interior = indicator(feature, "Forest Interior");

    if (isNum(cover.score) && isNum(riparian.score) && cover.score - riparian.score >= 20) {
      signals.push({
        type: "warn",
        icon: "↓",
        html: `<b>Riparian forest (${escapeHtml(riparian.grade)}) is much weaker than forest cover (${escapeHtml(cover.grade)}).</b>
          Forest along the stream banks is in worse condition than forest in the watershed overall.`
      });
    }

    if (isNum(cover.score) && isNum(interior.score) && cover.score >= 80 && interior.score < 40) {
      signals.push({
        type: "info",
        icon: "◇",
        html: `<b>Forest cover is ${escapeHtml(cover.grade)} but forest interior is ${escapeHtml(interior.grade)}.</b>
          There is a lot of forest but little deep interior habitat, which usually means the forest is broken into smaller patches.`
      });
    }

    if (p.ECOLENS_WATER_BASIS === "none") {
      signals.push({
        type: "gap",
        icon: "!",
        html: `<b>No surface-water grades were published.</b> Environmental health here reflects forest conditions only.`
      });
    } else {
      const missing = WATER_COMPONENTS.filter((name) => !isNum(indicator(feature, name).score));
      if (missing.length) {
        signals.push({
          type: "gap",
          icon: "?",
          html: `<b>Not reported:</b> ${missing.map((n) => escapeHtml(INDICATOR_LABELS[n])).join(", ")}.
            The surface-water score uses the remaining ${p.ECOLENS_WATER_COVERAGE}% of its indicator weight.`
        });
      }
    }

    const components = FOREST_COMPONENTS.concat(WATER_COMPONENTS)
      .map((name) => indicator(feature, name))
      .filter((item) => isNum(item.score));

    const weak = components.filter((item) => item.score < 60).length;

    if (components.length && weak === 0) {
      signals.push({
        type: "good",
        icon: "✓",
        html: `<b>All ${components.length} reported component indicators are graded C or better.</b>`
      });
    } else if (components.length && weak >= Math.ceil(components.length / 2)) {
      signals.push({
        type: "warn",
        icon: "▲",
        html: `<b>${weak} of ${components.length} reported indicators are graded D or F</b>, which drives the stress index to ${fmt(p.ECOLENS_STRESS_INDEX)}.`
      });
    }

    return signals.slice(0, 4);
  }

  // --------------------------------------------------------
  // PROFILE: INTERPRETATION (deterministic text from facts)
  // --------------------------------------------------------

  function conditionWord(value) {
    const bin = conditionBin(value);
    return bin ? bin.label.toLowerCase() : "unknown";
  }

  function interpretation(feature, mode) {
    const p = props(feature);
    const r = state.region;
    const name = `<b>${escapeHtml(nameOf(feature))}</b>`;
    const rank = p.ECOLENS_PRIORITY_RANK;
    const total = p.ECOLENS_TOTAL_RANKED;
    const weakest = INDICATOR_LABELS[p.ECOLENS_WEAKEST_INDICATOR] || p.ECOLENS_WEAKEST_INDICATOR;
    const strongest = INDICATOR_LABELS[p.ECOLENS_STRONGEST_INDICATOR] || p.ECOLENS_STRONGEST_INDICATOR;
    const weakestGrade = indicator(feature, p.ECOLENS_WEAKEST_INDICATOR).grade;
    const strongestGrade = indicator(feature, p.ECOLENS_STRONGEST_INDICATOR).grade;
    const hasWater = isNum(p.ECOLENS_WATER_SCORE);

    if (!isNum(p.ECOLENS_HEALTH_SCORE)) {
      return `${name} does not have enough published grades for EcoLens to calculate a score.`;
    }

    if (mode === "public") {
      const higherCount = isNum(rank) ? rank - 1 : null;
      return `
        Overall, the environment in ${name} is in <b>${conditionWord(p.ECOLENS_HEALTH_SCORE)}</b> condition
        (${fmt(p.ECOLENS_HEALTH_SCORE)} out of 100).
        Its forests score ${fmt(p.ECOLENS_FOREST_SCORE)}
        ${hasWater ? `and its streams score ${fmt(p.ECOLENS_WATER_SCORE)}` : "— stream water quality was not graded in 2023"}.
        The best result is <b>${escapeHtml(strongest)}</b> (grade ${escapeHtml(strongestGrade || "—")});
        the weakest is <b>${escapeHtml(weakest)}</b> (grade ${escapeHtml(weakestGrade || "—")}).
        ${higherCount !== null ? `Of the ${total} watersheds EcoLens compared, ${higherCount === 0 ? "none is" : higherCount + (higherCount === 1 ? " is" : " are")} a higher restoration priority.` : ""}
      `;
    }

    if (mode === "policy") {
      const gap = p.ECOLENS_WATER_BASIS === "none"
        ? "Surface-water monitoring results are not available here, so investment decisions would benefit from field data first."
        : (p.ECOLENS_CONFIDENCE < 70
          ? `Evidence coverage is ${fmt(p.ECOLENS_CONFIDENCE)}%, so findings should be confirmed against additional monitoring.`
          : `Evidence coverage is ${fmt(p.ECOLENS_CONFIDENCE)}%, so the score is based on most of the published indicators.`);

      return `
        ${name} is a <b>${escapeHtml(p.ECOLENS_PRIORITY_LABEL)}</b> restoration priority
        (rank ${rank} of ${total}, score ${fmt(p.ECOLENS_PRIORITY_SCORE)}).
        The weakest published indicator is <b>${escapeHtml(weakest)}</b> (grade ${escapeHtml(weakestGrade || "—")}),
        and it pulls the score down the most.
        ${gap}
        This ranking is an experimental EcoLens metric meant to support discussion, not an official assessment.
      `;
    }

    // analyst (default)
    return `
      ${name}: health <b>${fmt(p.ECOLENS_HEALTH_SCORE, 1)}</b>
      (forest ${fmt(p.ECOLENS_FOREST_SCORE, 1)}, surface water ${hasWater ? fmt(p.ECOLENS_WATER_SCORE, 1) : "n/a"};
      regional means ${fmt(r.forest, 1)} / ${fmt(r.water, 1)}).
      Stress index <b>${fmt(p.ECOLENS_STRESS_INDEX, 1)}</b> vs regional mean ${fmt(r.stress, 1)}.
      Restoration priority <b>${fmt(p.ECOLENS_PRIORITY_SCORE, 1)}</b> → ${escapeHtml(p.ECOLENS_PRIORITY_LABEL)},
      rank ${rank}/${total}.
      Evidence coverage ${fmt(p.ECOLENS_CONFIDENCE)}%
      (forest ${p.ECOLENS_FOREST_COVERAGE}% via ${escapeHtml(p.ECOLENS_FOREST_BASIS)},
      water ${p.ECOLENS_WATER_COVERAGE}% via ${escapeHtml(p.ECOLENS_WATER_BASIS)}).
    `;
  }

  // --------------------------------------------------------
  // PROFILE: CALCULATION BREAKDOWN (the actual arithmetic)
  // --------------------------------------------------------

  function domainLine(feature, components, weights, basis, overallName, result) {
    if (basis === "none") {
      return `<div class="calc-line">No grades reported → excluded</div>`;
    }

    if (basis === "overall grade") {
      const overall = indicator(feature, overallName);
      return `
        <div class="calc-line">No component grades → published overall grade
          ${escapeHtml(overall.grade)} = <b>${fmt(result, 1)}</b></div>
        <div class="calc-note">Evidence coverage for this domain is capped at ${ENGINE.fallback_coverage || 60}%.</div>
      `;
    }

    const used = components.filter((name) => isNum(indicator(feature, name).score));
    const skipped = components.filter((name) => !used.includes(name));
    const weightSum = used.reduce((sum, name) => sum + (weights[name] || 0), 0);

    const terms = used
      .map((name) => `${INDICATOR_LABELS[name]} ${indicator(feature, name).score}×${weights[name]}`)
      .join(" + ");

    return `
      <div class="calc-line">(${escapeHtml(terms)}) ÷ ${weightSum.toFixed(2)} = <b>${fmt(result, 1)}</b></div>
      ${skipped.length ? `<div class="calc-note">Not reported, weight re-normalised: ${skipped.map((n) => escapeHtml(INDICATOR_LABELS[n])).join(", ")}</div>` : ""}
    `;
  }

  function calculationHtml(feature) {
    const p = props(feature);

    const forestLine = domainLine(
      feature, FOREST_COMPONENTS, ENGINE.forest_weights,
      p.ECOLENS_FOREST_BASIS, "Forest Overall", p.ECOLENS_FOREST_SCORE
    );

    const waterLine = domainLine(
      feature, WATER_COMPONENTS, ENGINE.water_weights,
      p.ECOLENS_WATER_BASIS, "Water Quality Overall", p.ECOLENS_WATER_SCORE
    );

    const domains = [p.ECOLENS_FOREST_SCORE, p.ECOLENS_WATER_SCORE].filter(isNum);
    const healthLine = domains.length === 2
      ? `(${fmt(p.ECOLENS_FOREST_SCORE, 1)} + ${fmt(p.ECOLENS_WATER_SCORE, 1)}) ÷ 2 = <b>${fmt(p.ECOLENS_HEALTH_SCORE, 1)}</b>`
      : `Only one domain available → <b>${fmt(p.ECOLENS_HEALTH_SCORE, 1)}</b>`;

    const stressWeights = ENGINE.stress_weights || {};
    const stressTerms = Object.keys(stressWeights)
      .filter((name) => isNum(indicator(feature, name).severity))
      .map((name) => `${INDICATOR_LABELS[name]} ${indicator(feature, name).severity}×${stressWeights[name]}`);

    const stressWeightSum = Object.keys(stressWeights)
      .filter((name) => isNum(indicator(feature, name).severity))
      .reduce((sum, name) => sum + stressWeights[name], 0);

    const stressLine = stressTerms.length
      ? `(${escapeHtml(stressTerms.join(" + "))}) ÷ ${stressWeightSum.toFixed(3)} = <b>${fmt(p.ECOLENS_STRESS_INDEX, 1)}</b>`
      : `No component grades → severity of the health score = <b>${fmt(p.ECOLENS_STRESS_INDEX, 1)}</b>`;

    const cw = ENGINE.condition_weight;
    const sw = ENGINE.stress_weight;
    const thresholds = ENGINE.priority_thresholds || {};
    const label = p.ECOLENS_PRIORITY_LABEL;

    const coverageLine = domains.length === 2
      ? `(${p.ECOLENS_FOREST_COVERAGE}% + ${p.ECOLENS_WATER_COVERAGE}%) ÷ 2 = <b>${fmt(p.ECOLENS_CONFIDENCE)}%</b>`
      : `Single domain (${isNum(p.ECOLENS_FOREST_SCORE) ? p.ECOLENS_FOREST_COVERAGE : p.ECOLENS_WATER_COVERAGE}%) × 0.5 = <b>${fmt(p.ECOLENS_CONFIDENCE)}%</b>`;

    return `
      <details class="calc">
        <summary>How this score was calculated</summary>
        <div class="calc-body">
          <div class="calc-step">
            <h4>1 · Forest domain</h4>
            ${forestLine}
          </div>
          <div class="calc-step">
            <h4>2 · Surface-water domain</h4>
            ${waterLine}
          </div>
          <div class="calc-step">
            <h4>3 · Environmental health</h4>
            <div class="calc-line">${healthLine}</div>
          </div>
          <div class="calc-step">
            <h4>4 · Stress index</h4>
            <div class="calc-line">${stressLine}</div>
            <div class="calc-note">Severity: score ≥80 → 0, ≥60 → 25, ≥40 → 60, below 40 → 100</div>
          </div>
          <div class="calc-step">
            <h4>5 · Restoration priority</h4>
            <div class="calc-line">${cw} × (100 − ${fmt(p.ECOLENS_HEALTH_SCORE, 1)}) + ${sw} × ${fmt(p.ECOLENS_STRESS_INDEX, 1)} = <b>${fmt(p.ECOLENS_PRIORITY_SCORE, 1)}</b></div>
            <div class="calc-note">${escapeHtml(label)}${isNum(thresholds[label]) ? ` (≥ ${thresholds[label]})` : ""}</div>
          </div>
          <div class="calc-step">
            <h4>6 · Evidence coverage</h4>
            <div class="calc-line">${coverageLine}</div>
          </div>
          <div class="calc-note">All values are produced by the EcoLens Python engine; this panel only displays them.</div>
        </div>
      </details>
    `;
  }

  // --------------------------------------------------------
  // PROFILE: SELECTED WATERSHED
  // --------------------------------------------------------

  function indicatorTile(feature, name) {
    const item = indicator(feature, name);
    const p = props(feature);
    const present = isNum(item.score);
    const letter = present ? String(item.grade).trim().toUpperCase() : null;
    const bin = present ? (GRADE_BINS.find((b) => b.letter === letter.charAt(0)) || conditionBin(item.score)) : null;

    const isStrongest = p.ECOLENS_STRONGEST_INDICATOR === name;
    const isWeakest = p.ECOLENS_WEAKEST_INDICATOR === name && !isStrongest;

    const weight =
      ENGINE.forest_weights && ENGINE.forest_weights[name] !== undefined
        ? `${Math.round(ENGINE.forest_weights[name] * 100)}% of forest`
        : ENGINE.water_weights && ENGINE.water_weights[name] !== undefined
          ? `${Math.round(ENGINE.water_weights[name] * 100)}% of water`
          : "published overall";

    return `
      <div class="ind ${present ? "" : "is-missing"} ${isStrongest || isWeakest ? "is-key" : ""}">
        <span class="grade-badge ${present ? "" : "missing"}" style="${bin ? `background:${bin.color}` : ""}">
          ${present ? escapeHtml(letter) : "n/a"}
        </span>
        <span>
          ${isStrongest ? `<span class="ind-flag">Strongest</span>` : ""}
          ${isWeakest ? `<span class="ind-flag weak">Weakest</span>` : ""}
          <span class="ind-name">${escapeHtml(INDICATOR_LABELS[name])}</span>
          <span class="ind-sub">${present ? `${item.score} pts · ${weight}` : "Not reported"}</span>
        </span>
      </div>
    `;
  }

  function renderProfile(feature) {
    const p = props(feature);
    const r = state.region;

    const health = p.ECOLENS_HEALTH_SCORE;
    const healthBin = conditionBin(health) || { label: "Insufficient data", color: COLORS.missing };
    const priorityColor = PRIORITY_COLORS[p.ECOLENS_PRIORITY_LABEL] || COLORS.missing;

    const rank = p.ECOLENS_PRIORITY_RANK;
    const total = p.ECOLENS_TOTAL_RANKED;
    const higherThan = p.ECOLENS_PRIORITY_PERCENTILE;
    const tiedOthers = (p.ECOLENS_PRIORITY_TIED || 1) - 1;

    const forestBin = conditionBin(p.ECOLENS_FOREST_SCORE);
    const waterBin = conditionBin(p.ECOLENS_WATER_SCORE);
    const stressBin = isNum(p.ECOLENS_STRESS_INDEX)
      ? STRESS_BINS.find((bin) => p.ECOLENS_STRESS_INDEX >= bin.min)
      : null;

    const signals = buildSignals(feature);

    const panel = $("profilePanel");

    panel.innerHTML = `
      <div class="profile">

        <div class="profile-top">
          <div>
            <p class="profile-kicker">Subwatershed profile</p>
            <h2>${escapeHtml(nameOf(feature))}</h2>
            <p class="profile-rank">
              ${isNum(rank)
                ? `Priority rank <b>#${rank}</b> of ${total}` +
                  (tiedOthers > 0 ? ` (tied with ${tiedOthers} other${tiedOthers === 1 ? "" : "s"})` : "") +
                  (isNum(higherThan) ? ` · higher priority than ${higherThan}% of watersheds` : "")
                : "Not ranked — insufficient data"}
            </p>
          </div>
          <button class="icon-btn" id="closeProfile" type="button" title="Back to regional overview (Esc)" aria-label="Close profile">
            <svg viewBox="0 0 20 20" width="14" height="14"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div class="hero-row">
          <div class="gauge-wrap">
            <div class="gauge">
              ${gaugeSvg(health, healthBin.color)}
              <div class="gauge-center">
                <strong>${fmt(health)}</strong>
                <span>Health /100</span>
              </div>
            </div>
            <span class="gauge-label"><i class="swatch" style="background:${healthBin.color}"></i>${escapeHtml(healthBin.label)}</span>
          </div>

          <div class="hero-facts">
            <div>
              <div class="fact-label">Restoration priority</div>
              <div class="priority-badge">
                <span class="swatch" style="background:${priorityColor}"></span>
                ${escapeHtml(p.ECOLENS_PRIORITY_LABEL || "—")}
                <small>${fmt(p.ECOLENS_PRIORITY_SCORE)}/100</small>
              </div>
            </div>
            <div>
              <div class="fact-label">Evidence coverage</div>
              <div class="fact-value">${fmt(p.ECOLENS_CONFIDENCE)}% <small>${escapeHtml(p.ECOLENS_CONFIDENCE_LABEL || "")}</small></div>
              <div class="meter"><i style="width:${fmt(p.ECOLENS_CONFIDENCE)}%"></i></div>
            </div>
          </div>
        </div>

        <div class="block">
          <div class="block-title">Condition vs region <small>│ marks the regional average</small></div>
          ${metricRow({
            label: "Forest condition",
            value: p.ECOLENS_FOREST_SCORE,
            average: r.forest,
            color: forestBin ? forestBin.color : COLORS.missing,
            foot: versusAverage(p.ECOLENS_FOREST_SCORE, r.forest)
          })}
          ${metricRow({
            label: "Surface-water condition",
            value: p.ECOLENS_WATER_SCORE,
            average: r.water,
            color: waterBin ? waterBin.color : COLORS.missing,
            foot: isNum(p.ECOLENS_WATER_SCORE)
              ? versusAverage(p.ECOLENS_WATER_SCORE, r.water)
              : "No surface-water grades were published for this watershed."
          })}
          ${metricRow({
            label: "Environmental stress",
            value: p.ECOLENS_STRESS_INDEX,
            average: r.stress,
            color: stressBin ? stressBin.color : COLORS.missing,
            foot: versusAverage(p.ECOLENS_STRESS_INDEX, r.stress, true) + " · higher means more stress"
          })}
        </div>

        <div class="block">
          <div class="block-title">Report-card indicators <small>2023 grades</small></div>
          <div class="indicator-grid">
            ${["Forest Cover", "Forest Interior", "Forest Riparian", "Forest Overall",
               "Benthic", "Phosphorus", "E. coli", "Water Quality Overall"]
              .map((name) => indicatorTile(feature, name)).join("")}
          </div>
        </div>

        ${signals.length ? `
          <div class="block">
            <div class="block-title">Signals <small>rule-based</small></div>
            <ul class="signals">
              ${signals.map((s) => `
                <li class="signal ${s.type}">
                  <span class="signal-icon">${s.icon}</span>
                  <span>${s.html}</span>
                </li>`).join("")}
            </ul>
          </div>` : ""}

        <div class="block">
          <div class="block-title">Interpretation</div>
          <div class="tabs" role="tablist">
            ${[["analyst", "Analyst"], ["public", "Public"], ["policy", "Policy"]].map(([key, label]) => `
              <button class="tab ${state.interpretMode === key ? "active" : ""}" data-mode="${key}" type="button" role="tab">${label}</button>
            `).join("")}
          </div>
          <p class="interpretation" id="interpretationText">${interpretation(feature, state.interpretMode)}</p>
        </div>

        <div class="block">
          ${calculationHtml(feature)}
        </div>

        <p class="footnote">
          Experimental EcoLens analysis of Conservation Halton's 2023 report card — not an official assessment.
        </p>
      </div>
    `;

    panel.scrollTop = 0;
    animateGauges(panel);
  }

  // --------------------------------------------------------
  // STATUS / LOADING
  // --------------------------------------------------------

  function setStatus(text, kind) {
    const status = $("mapStatus");
    status.className = "map-status" + (kind ? " is-" + kind : "");
    $("mapStatusText").textContent = text;
  }

  function showLoadError(message) {
    const overlay = $("mapLoading");
    overlay.classList.remove("hidden");
    overlay.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <button type="button" id="retryLoad">Try again</button>
    `;
    $("retryLoad").addEventListener("click", () => {
      overlay.innerHTML = `<div class="spinner"></div><p>Loading Conservation Halton watersheds…</p>`;
      loadWatersheds();
    });
    setStatus("Map unavailable", "error");
  }

  // --------------------------------------------------------
  // EVENTS
  // --------------------------------------------------------

  function bindEvents() {
    $("rankList").addEventListener("click", (event) => {
      const row = event.target.closest(".rank-item");
      if (row) selectWatershed(Number(row.dataset.id), { fly: true });
    });

    $("rankList").addEventListener("mouseover", (event) => {
      const row = event.target.closest(".rank-item");
      if (row) setHovered(Number(row.dataset.id));
    });

    $("rankList").addEventListener("mouseleave", () => setHovered(null));

    $("priorityFilters").addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (chip) setPriorityFilter(chip.dataset.filter);
    });

    $("searchInput").addEventListener("input", (event) => {
      state.search = normalize(event.target.value);
      renderRankList();
      restyleAll();
    });

    $("searchInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const first = sortedFeatures()[0];
        if (first) selectWatershed(first.__id, { fly: true });
      }
    });

    $("resetViewBtn").addEventListener("click", () => {
      if (state.selectedId !== null) clearSelection();
      else fitRegion(true);
    });

    $("profilePanel").addEventListener("click", (event) => {
      if (event.target.closest("#closeProfile")) {
        clearSelection();
        return;
      }

      const tab = event.target.closest(".tab");
      if (tab && state.selectedId !== null) {
        state.interpretMode = tab.dataset.mode;
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        $("interpretationText").innerHTML = interpretation(
          state.features[state.selectedId], state.interpretMode
        );
        return;
      }

      const filter = event.target.closest("[data-filter]");
      if (filter) {
        setPriorityFilter(filter.dataset.filter);
        return;
      }

      const pick = event.target.closest("[data-id]");
      if (pick) selectWatershed(Number(pick.dataset.id), { fly: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.selectedId !== null) {
        clearSelection();
      }
    });
  }

  // --------------------------------------------------------
  // METHODOLOGY GRADE COLOURS (static section)
  // --------------------------------------------------------

  function colourGradeScale() {
    document.querySelectorAll(".grade-cell").forEach((cell) => {
      const letter = cell.querySelector("strong").textContent.trim().charAt(0);
      const bin = GRADE_BINS.find((b) => b.letter === letter);
      if (bin) cell.style.borderTopColor = bin.color;
    });
  }

  // --------------------------------------------------------
  // LOAD
  // --------------------------------------------------------

  async function loadWatersheds() {
    setStatus("Loading watersheds…", "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/watersheds", { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const source = response.headers.get("X-EcoLens-Source") || "live";
      const geojson = await response.json();

      if (!geojson || !Array.isArray(geojson.features)) {
        throw new Error("Invalid GeoJSON response");
      }

      geojson.features.forEach((feature, index) => {
        feature.__id = index;
      });

      state.features = geojson.features;
      state.region = computeRegion(state.features);

      if (geoLayer) {
        geoLayer.remove();
        state.layers.clear();
      }

      addWatershedLayer(geojson);
      fitRegion(false);

      renderKpis();
      renderMetricPicker();
      renderFilters();
      renderRankList();
      renderLegend();

      if (!selectFromHash()) renderOverview();

      setStatus(
        source === "snapshot"
          ? `${state.features.length} watersheds · saved copy`
          : `${state.features.length} watersheds · Conservation Halton API`,
        source === "snapshot" ? "snapshot" : "live"
      );

      $("mapLoading").classList.add("hidden");

    } catch (error) {
      clearTimeout(timeout);
      console.error("EcoLens map error:", error);
      showLoadError(
        error.name === "AbortError"
          ? "The watershed data took too long to load."
          : "Watershed data could not be loaded."
      );
    }
  }

  // --------------------------------------------------------
  // START
  // --------------------------------------------------------

  function start() {
    colourGradeScale();

    if (!$("watershedMap") || typeof L === "undefined") {
      console.error("EcoLens: Leaflet failed to load.");
      return;
    }

    createMap();
    bindEvents();
    loadWatersheds();

    window.addEventListener("resize", () => map && map.invalidateSize());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
