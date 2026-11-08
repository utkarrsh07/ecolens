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

})();
