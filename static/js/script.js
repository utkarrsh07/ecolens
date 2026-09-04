// ============================================================
// ECOLENS GENERAL UI
// ============================================================

function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);

  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


// ============================================================
// INSIGHT MODE TOGGLE
// ============================================================

const analystBtn = document.getElementById("analystBtn");
const publicBtn = document.getElementById("publicBtn");
const policyBtn = document.getElementById("policyBtn");

const analystView = document.getElementById("analystView");
const publicView = document.getElementById("publicView");
const policyView = document.getElementById("policyView");


function showInsight(viewToShow, buttonToActivate) {

  const views = [
    analystView,
    publicView,
    policyView
  ];

  const buttons = [
    analystBtn,
    publicBtn,
    policyBtn
  ];


  views.forEach((view) => {
    if (view) {
      view.classList.add("hidden-view");
    }
  });


  buttons.forEach((button) => {
    if (button) {
      button.classList.remove("active");
    }
  });


  if (viewToShow) {
    viewToShow.classList.remove("hidden-view");
  }


  if (buttonToActivate) {
    buttonToActivate.classList.add("active");
  }
}


if (analystBtn && publicBtn && policyBtn) {

  analystBtn.addEventListener("click", () => {
    showInsight(
      analystView,
      analystBtn
    );
  });


  publicBtn.addEventListener("click", () => {
    showInsight(
      publicView,
      publicBtn
    );
  });


  policyBtn.addEventListener("click", () => {
    showInsight(
      policyView,
      policyBtn
    );
  });

}


// ============================================================
// SCROLL REVEAL
// ============================================================

const revealElements =
  document.querySelectorAll(".reveal");


function revealOnScroll() {

  revealElements.forEach((element) => {

    const rect =
      element.getBoundingClientRect();

    const windowHeight =
      window.innerHeight;


    if (
      rect.top <
      windowHeight - 80
    ) {

      element.classList.add(
        "visible"
      );

    }

  });

}


window.addEventListener(
  "scroll",
  revealOnScroll
);


window.addEventListener(
  "load",
  revealOnScroll
);


// ============================================================
// MOBILE NAVIGATION
// ============================================================

const navMenuBtn =
  document.getElementById("navMenuBtn");

const mobileMenu =
  document.getElementById("mobileMenu");

const navScrollLinks =
  document.querySelectorAll(".nav-scroll");


if (
  navMenuBtn &&
  mobileMenu
) {

  navMenuBtn.addEventListener(
    "click",
    () => {

      mobileMenu.classList.toggle(
        "show"
      );

    }
  );

}


navScrollLinks.forEach((link) => {

  link.addEventListener(
    "click",
    () => {

      if (mobileMenu) {

        mobileMenu.classList.remove(
          "show"
        );

      }

    }
  );

});


// ============================================================
// ECOLENS WATERSHED MAP
// ============================================================

let watershedMap = null;
let watershedGeoJsonLayer = null;
let watershedFeatures = [];
let selectedLayer = null;


// ============================================================
// GRADE HELPERS
// ============================================================

const gradeScoreMap = {

  "A+": 100,
  "A": 96,
  "A-": 92,

  "B+": 88,
  "B": 84,
  "B-": 80,

  "C+": 74,
  "C": 68,
  "C-": 62,

  "D+": 55,
  "D": 48,
  "D-": 42,

  "F": 25

};


function cleanGrade(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  const cleaned =
    String(value)
      .trim()
      .toUpperCase();


  const invalidValues = [
    "",
    "N/A",
    "NA",
    "NONE",
    "NULL",
    "-",
    "--",
    "INSUFFICIENT DATA"
  ];


  if (
    invalidValues.includes(cleaned)
  ) {
    return null;
  }


  return cleaned;
}


function gradeToScore(value) {

  const grade =
    cleanGrade(value);


  if (!grade) {
    return null;
  }


  if (
    Object.prototype.hasOwnProperty.call(
      gradeScoreMap,
      grade
    )
  ) {

    return gradeScoreMap[grade];

  }


  return null;
}


// ============================================================
// CALCULATE CURRENT MAP COMPARISON SCORE
// ============================================================

function calculateComparisonScore(properties) {

  const forest =
    gradeToScore(
      properties.GRADE_FC_OVERALL
    );


  const water =
    gradeToScore(
      properties.GRADE_SWQ_OVERALL
    );


  const availableScores =
    [
      forest,
      water
    ].filter(
      (value) =>
        value !== null
    );


  if (
    availableScores.length === 0
  ) {

    return null;

  }


  const total =
    availableScores.reduce(
      (sum, value) =>
        sum + value,
      0
    );


  return Math.round(
    total /
    availableScores.length
  );
}


// ============================================================
// SCORE LABELS
// ============================================================

function comparisonLabel(score) {

  if (score === null) {
    return "Limited Data";
  }


  if (score >= 80) {
    return "Strong";
  }


  if (score >= 60) {
    return "Moderate";
  }


  if (score >= 40) {
    return "Needs Attention";
  }


  return "Critical";
}


function polygonColor(score) {

  if (score === null) {
    return "#73808c";
  }


  if (score >= 80) {
    return "#20d88c";
  }


  if (score >= 60) {
    return "#e6c84f";
  }


  if (score >= 40) {
    return "#f28b3c";
  }


  return "#e25353";
}


// ============================================================
// PROPERTY HELPERS
// ============================================================

function getWatershedName(properties) {

  return (
    properties.SUBWSHD_NAME ||
    properties.SUBWATERSHED ||
    properties.NAME ||
    "Unnamed Watershed"
  );

}


function displayGrade(value) {

  const grade =
    cleanGrade(value);


  if (!grade) {
    return "No Data";
  }


  return grade;
}


// ============================================================
// MAP STYLE
// ============================================================

function watershedStyle(feature) {

  const properties =
    feature.properties || {};


  const score =
    calculateComparisonScore(
      properties
    );


  return {

    color: "#d9f7eb",

    weight: 1.2,

    opacity: 0.85,

    fillColor:
      polygonColor(score),

    fillOpacity: 0.55

  };

}


// ============================================================
// HOVER EFFECTS
// ============================================================

function highlightWatershed(event) {

  const layer =
    event.target;


  if (
    selectedLayer === layer
  ) {

    layer.setStyle({
      weight: 3,
      color: "#ffffff",
      fillOpacity: 0.8
    });

    return;
  }


  layer.setStyle({

    weight: 2.5,

    color: "#ffffff",

    fillOpacity: 0.72

  });


  if (
    !L.Browser.ie &&
    !L.Browser.opera &&
    !L.Browser.edge
  ) {

    layer.bringToFront();

  }

}


function resetWatershedHighlight(event) {

  const layer =
    event.target;


  if (
    selectedLayer === layer
  ) {

    layer.setStyle({

      weight: 3,

      color: "#ffffff",

      fillOpacity: 0.8

    });

    return;
  }


  if (watershedGeoJsonLayer) {

    watershedGeoJsonLayer.resetStyle(
      layer
    );

  }

}


// ============================================================
// SELECT WATERSHED
// ============================================================

function selectWatershed(
  feature,
  layer
) {

  if (
    selectedLayer &&
    watershedGeoJsonLayer
  ) {

    watershedGeoJsonLayer.resetStyle(
      selectedLayer
    );

  }


  selectedLayer =
    layer;


  layer.setStyle({

    weight: 3,

    color: "#ffffff",

    fillOpacity: 0.8

  });


  if (
    layer.bringToFront
  ) {

    layer.bringToFront();

  }


  updateWatershedPanel(
    feature.properties || {}
  );

}


// ============================================================
// BUILD SIMPLE ENVIRONMENTAL SIGNAL
// ============================================================

function buildWatershedInsight(
  properties,
  score
) {

  const name =
    getWatershedName(
      properties
    );


  const forest =
    gradeToScore(
      properties.GRADE_FC_OVERALL
    );


  const water =
    gradeToScore(
      properties.GRADE_SWQ_OVERALL
    );


  if (score === null) {

    return (
      `${name} has limited overall grade data in the current dataset. ` +
      `EcoLens avoids estimating a comparison score when sufficient ` +
      `report-card information is unavailable.`
    );

  }


  if (
    forest !== null &&
    water !== null
  ) {

    const difference =
      Math.abs(
        forest - water
      );


    if (difference >= 30) {

      if (forest > water) {

        return (
          `${name} shows a notable difference between forest condition ` +
          `and surface-water quality. Forest performance is substantially ` +
          `stronger than water performance, which may justify closer review ` +
          `of localized water-quality pressures.`
        );

      }


      return (
        `${name} shows a notable difference between forest condition ` +
        `and surface-water quality. Water performance is substantially ` +
        `stronger than forest condition, creating an environmental pattern ` +
        `that may deserve closer spatial analysis.`
      );

    }

  }


  if (score >= 80) {

    return (
      `${name} performs strongly across its available overall indicators. ` +
      `EcoLens identifies this watershed as one of the comparatively ` +
      `healthier environmental profiles in the current dataset.`
    );

  }


  if (score >= 60) {

    return (
      `${name} has a mixed but moderate environmental profile. ` +
      `Available overall indicators suggest generally mid-range conditions ` +
      `with opportunities for targeted improvement.`
    );

  }


  if (score >= 40) {

    return (
      `${name} falls within the EcoLens needs-attention range. ` +
      `Its available overall indicators suggest weaker environmental ` +
      `performance relative to stronger watersheds in the dataset.`
    );

  }


  return (
    `${name} is currently among the lower-scoring watersheds in the ` +
    `EcoLens comparison. Its available report-card indicators suggest ` +
    `that closer environmental review may be valuable.`
  );

}


// ============================================================
// UPDATE DETAIL PANEL
// ============================================================

function updateDashboardForWatershed(properties) {

  const healthScore =
    properties.ECOLENS_HEALTH_SCORE;

  const healthLabel =
    properties.ECOLENS_HEALTH_LABEL;

  const priorityScore =
    properties.ECOLENS_PRIORITY_SCORE;

  const priorityLabel =
    properties.ECOLENS_PRIORITY_LABEL;

  const confidence =
    properties.ECOLENS_CONFIDENCE;

  const confidenceLabel =
    properties.ECOLENS_CONFIDENCE_LABEL;

  const rank =
    properties.ECOLENS_PRIORITY_RANK;

  const totalRanked =
    properties.ECOLENS_TOTAL_RANKED;

  const percentile =
    properties.ECOLENS_PRIORITY_PERCENTILE;


  const healthScoreElement =
    document.getElementById(
      "dashboardHealthScore"
    );

  const healthLabelElement =
    document.getElementById(
      "dashboardHealthLabel"
    );

  const priorityLabelElement =
    document.getElementById(
      "dashboardPriorityLabel"
    );

  const priorityScoreElement =
    document.getElementById(
      "dashboardPriorityScore"
    );

  const confidenceElement =
    document.getElementById(
      "dashboardConfidence"
    );

  const confidenceLabelElement =
    document.getElementById(
      "dashboardConfidenceLabel"
    );

  const rankElement =
    document.getElementById(
      "dashboardPriorityRank"
    );

  const percentileElement =
    document.getElementById(
      "dashboardPriorityPercentile"
    );


  if (healthScoreElement) {
    healthScoreElement.textContent =
      healthScore !== null &&
      healthScore !== undefined
        ? `${healthScore} / 100`
        : "No Data";
  }


  if (healthLabelElement) {
    healthLabelElement.textContent =
      healthLabel ||
      "Insufficient environmental data.";
  }


  if (priorityLabelElement) {
    priorityLabelElement.textContent =
      priorityLabel ||
      "Insufficient Data";
  }


  if (priorityScoreElement) {
    priorityScoreElement.textContent =
      priorityScore !== null &&
      priorityScore !== undefined
        ? `Priority score: ${priorityScore} / 100`
        : "Priority score unavailable.";
  }


  if (confidenceElement) {
    confidenceElement.textContent =
      confidence !== null &&
      confidence !== undefined
        ? `${confidence}%`
        : "No Data";
  }


  if (confidenceLabelElement) {
    confidenceLabelElement.textContent =
      confidenceLabel
        ? `${confidenceLabel} confidence`
        : "Confidence unavailable.";
  }


  if (rankElement) {

    if (
      rank !== null &&
      rank !== undefined &&
      totalRanked
    ) {

      rankElement.textContent =
        `${rank} / ${totalRanked}`;

    }

    else {

      rankElement.textContent =
        "Not Ranked";

    }

  }


  if (percentileElement) {

    if (
      percentile !== null &&
      percentile !== undefined
    ) {

      percentileElement.textContent =
        `${percentile}th priority percentile`;

    }

    else {

      percentileElement.textContent =
        "Priority percentile unavailable.";

    }

  }

}

function updateWatershedChart(properties) {

  const chartElement =
    document.getElementById(
      "watershedIndicatorChart"
    );

  if (
    !chartElement ||
    typeof Plotly === "undefined"
  ) {
    return;
  }


  const name =
    getWatershedName(
      properties
    );


  const indicators = [
    {
      label: "Forest Cover",
      grade: properties.GRADE_FC_COVER
    },
    {
      label: "Forest Interior",
      grade: properties.GRADE_FC_INTERIOR
    },
    {
      label: "Riparian Forest",
      grade: properties.GRADE_FC_RIPARIAN
    },
    {
      label: "Benthic",
      grade: properties.GRADE_SWQ_BENTHIC
    },
    {
      label: "E. coli",
      grade: properties.GRADE_SWQ_ECOLI
    },
    {
      label: "Phosphorus",
      grade: properties.GRADE_SWQ_PHOSPH
    }
  ];


  const labels = [];
  const scores = [];
  const gradeLabels = [];


  indicators.forEach((indicator) => {

    const score =
      gradeToScore(
        indicator.grade
      );

    if (score !== null) {

      labels.push(
        indicator.label
      );

      scores.push(
        score
      );

      gradeLabels.push(
  indicator.grade || "No Data"
);

    }

  });


  const titleElement =
    document.getElementById(
      "watershedChartTitle"
    );


  if (titleElement) {

    titleElement.textContent =
      `${name} Indicator Profile`;

  }


  if (scores.length === 0) {

    Plotly.purge(
      chartElement
    );

    chartElement.innerHTML =
      `<div style="
        min-height: 380px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#a9bfd1;
        text-align:center;
        padding:30px;
      ">
        No indicator data is available for ${name}.
      </div>`;

    return;

  }


  const trace = {

    type: "bar",

    x: labels,

    y: scores,

    customdata:
      gradeLabels,

    hovertemplate:
      "<b>%{x}</b><br>" +
      "Score: %{y}/100<br>" +
      "Grade: %{customdata}" +
      "<extra></extra>"

  };


  const layout = {

    title: {
      text:
        `${name} Environmental Indicator Scores`,
      font: {
        color: "#ffffff",
        size: 16
      }
    },

    paper_bgcolor:
      "rgba(0,0,0,0)",

    plot_bgcolor:
      "rgba(0,0,0,0)",

    font: {
      color: "#dce8f2"
    },

    margin: {
      l: 55,
      r: 20,
      t: 65,
      b: 85
    },

    yaxis: {
      title: "EcoLens Score",
      range: [0, 100],
      gridcolor:
        "rgba(255,255,255,0.08)",
      zerolinecolor:
        "rgba(255,255,255,0.12)"
    },

    xaxis: {
      tickangle: -20,
      gridcolor:
        "rgba(255,255,255,0.03)"
    },

    showlegend: false

  };


  const config = {

    responsive: true,

    displayModeBar: false

  };


  Plotly.react(
    chartElement,
    [trace],
    layout,
    config
  );

}

function updateInterpretationEngine(properties) {

  const name =
    getWatershedName(properties);

  const health =
    properties.ECOLENS_HEALTH_SCORE;

  const healthLabel =
    properties.ECOLENS_HEALTH_LABEL ||
    "Insufficient Data";

  const priority =
    properties.ECOLENS_PRIORITY_SCORE;

  const priorityLabel =
    properties.ECOLENS_PRIORITY_LABEL ||
    "Insufficient Data";

  const confidence =
    properties.ECOLENS_CONFIDENCE;

  const strongest =
    properties.ECOLENS_STRONGEST_INDICATOR ||
    "No Data";

  const weakest =
    properties.ECOLENS_WEAKEST_INDICATOR ||
    "No Data";

  const forest =
    properties.ECOLENS_FOREST_SCORE;

  const water =
    properties.ECOLENS_WATER_SCORE;

  const rank =
    properties.ECOLENS_PRIORITY_RANK;

  const total =
    properties.ECOLENS_TOTAL_RANKED;


  const analyst =
    document.getElementById(
      "analystSummaryText"
    );

  const publicText =
    document.getElementById(
      "publicSummaryText"
    );

  const policy =
    document.getElementById(
      "policySummaryText"
    );

  const reason =
    document.getElementById(
      "analysisReasonText"
    );


  if (analyst) {

    analyst.textContent =
      `${name} has an environmental health score of ` +
      `${health ?? "N/A"}/100 (${healthLabel}) and a restoration ` +
      `priority of ${priority ?? "N/A"}/100 (${priorityLabel}). ` +
      `Its strongest available indicator is ${strongest}, while ` +
      `${weakest} is the weakest. ` +
      `Data confidence is ${confidence ?? "N/A"}%.`;

  }


  if (publicText) {

    publicText.textContent =
      `EcoLens indicates that ${name} is currently rated ` +
      `${healthLabel.toLowerCase()} overall. ` +
      `${strongest} is performing comparatively well, while ` +
      `${weakest} may deserve closer attention. ` +
      `These results summarize published Conservation Halton ` +
      `report-card indicators and are not an official assessment.`;

  }


  if (policy) {

    const rankText =
      rank && total
        ? `It ranks ${rank} of ${total} watersheds for EcoLens restoration priority. `
        : "";

    policy.textContent =
      `${name} is classified as ${priorityLabel.toLowerCase()} ` +
      `restoration priority under the experimental EcoLens model. ` +
      `${rankText}` +
      `The current evidence identifies ${weakest} as the weakest ` +
      `available indicator, with ${confidence ?? "N/A"}% data confidence.`;

  }


  if (reason) {

    let comparison =
      "Forest and surface-water conditions cannot be fully compared.";

    if (
      forest !== null &&
      forest !== undefined &&
      water !== null &&
      water !== undefined
    ) {

      if (forest > water) {

        comparison =
          `Forest conditions (${forest}/100) outperform ` +
          `surface-water conditions (${water}/100).`;

      }

      else if (water > forest) {

        comparison =
          `Surface-water conditions (${water}/100) outperform ` +
          `forest conditions (${forest}/100).`;

      }

      else {

        comparison =
          `Forest and surface-water domain scores are currently equal.`;

      }

    }


    reason.textContent =
      `${comparison} The weakest available indicator is ${weakest}. ` +
      `These verified EcoLens calculations are generated before ` +
      `any later AI explanation layer.`;

  }

}

function getIndicatorGradeByName(
  properties,
  indicatorName
) {

  const indicatorMap = {

    "Forest Cover":
      properties.GRADE_FC_COVER,

    "Forest Interior":
      properties.GRADE_FC_INTERIOR,

    "Forest Riparian":
      properties.GRADE_FC_RIPARIAN,

    "Riparian Forest":
      properties.GRADE_FC_RIPARIAN,

    "Benthic":
      properties.GRADE_SWQ_BENTHIC,

    "E. coli":
      properties.GRADE_SWQ_ECOLI,

    "Phosphorus":
      properties.GRADE_SWQ_PHOSPH

  };

  return (
    indicatorMap[indicatorName] ||
    "No Data"
  );

}


function updatePatternDetection(
  properties
) {

  const forest =
    properties.ECOLENS_FOREST_SCORE;

  const water =
    properties.ECOLENS_WATER_SCORE;

  const strongest =
    properties.ECOLENS_STRONGEST_INDICATOR ||
    "No Data";

  const weakest =
    properties.ECOLENS_WEAKEST_INDICATOR ||
    "No Data";


  const forestScoreElement =
    document.getElementById(
      "patternForestScore"
    );

  const waterScoreElement =
    document.getElementById(
      "patternWaterScore"
    );

  const forestBar =
    document.getElementById(
      "patternForestBar"
    );

  const waterBar =
    document.getElementById(
      "patternWaterBar"
    );

  const summary =
    document.getElementById(
      "patternDomainSummary"
    );

  const gapBadge =
    document.getElementById(
      "patternGapBadge"
    );

  const explanation =
    document.getElementById(
      "patternDomainExplanation"
    );

  const strongestElement =
    document.getElementById(
      "patternStrongestIndicator"
    );

  const weakestElement =
    document.getElementById(
      "patternWeakestIndicator"
    );

  const strongestGrade =
    document.getElementById(
      "patternStrongestGrade"
    );

  const weakestGrade =
    document.getElementById(
      "patternWeakestGrade"
    );


  if (forestScoreElement) {
    forestScoreElement.textContent =
      forest ?? "No Data";
  }

  if (waterScoreElement) {
    waterScoreElement.textContent =
      water ?? "No Data";
  }


  if (forestBar) {

    forestBar.style.width =
      forest !== null &&
      forest !== undefined
        ? `${Math.max(
            0,
            Math.min(
              100,
              forest
            )
          )}%`
        : "0%";

  }


  if (waterBar) {

    waterBar.style.width =
      water !== null &&
      water !== undefined
        ? `${Math.max(
            0,
            Math.min(
              100,
              water
            )
          )}%`
        : "0%";

  }


  if (
    forest !== null &&
    forest !== undefined &&
    water !== null &&
    water !== undefined
  ) {

    const difference =
      Math.abs(
        forest - water
      ).toFixed(1);


    if (gapBadge) {
      gapBadge.textContent =
        `${difference} pt gap`;
    }


    if (forest > water) {

      if (summary) {
        summary.textContent =
          "Forest conditions lead";
      }

      if (explanation) {
        explanation.textContent =
          `Forest conditions outperform surface-water conditions by ${difference} points.`;
      }

    }

    else if (water > forest) {

      if (summary) {
        summary.textContent =
          "Water conditions lead";
      }

      if (explanation) {
        explanation.textContent =
          `Surface-water conditions outperform forest conditions by ${difference} points.`;
      }

    }

    else {

      if (summary) {
        summary.textContent =
          "Domains are balanced";
      }

      if (explanation) {
        explanation.textContent =
          "Forest and surface-water domain scores are currently equal.";
      }

    }

  }

  else {

    if (summary) {
      summary.textContent =
        "Limited domain comparison";
    }

    if (gapBadge) {
      gapBadge.textContent =
        "Limited Data";
    }

    if (explanation) {
      explanation.textContent =
        "EcoLens cannot compare both environmental domains because one or more domain scores are unavailable.";
    }

  }


  if (strongestElement) {
    strongestElement.textContent =
      strongest;
  }

  if (weakestElement) {
    weakestElement.textContent =
      weakest;
  }


  if (strongestGrade) {

    const grade =
      getIndicatorGradeByName(
        properties,
        strongest
      );

    const score =
      gradeToScore(
        grade
      );

    strongestGrade.textContent =
      score !== null
        ? `${grade} · ${score}/100`
        : grade;

  }


  if (weakestGrade) {

    const grade =
      getIndicatorGradeByName(
        properties,
        weakest
      );

    const score =
      gradeToScore(
        grade
      );

    weakestGrade.textContent =
      score !== null
        ? `${grade} · ${score}/100`
        : grade;

  }

}

// ============================================================
// WATERSHED COMPARISON
// ============================================================

function getDatasetAverage(fieldName) {

  const values = watershedFeatures
    .map((feature) => {
      const properties = feature.properties || {};
      const value = Number(properties[fieldName]);

      return Number.isFinite(value)
        ? value
        : null;
    })
    .filter((value) => value !== null);


  if (values.length === 0) {
    return null;
  }


  const total =
    values.reduce(
      (sum, value) => sum + value,
      0
    );


  return total / values.length;
}



function updateComparisonMetric({
  selectedValue,
  averageValue,
  selectedId,
  averageId,
  differenceId,
  barId,
  markerId
}) {

  const selectedElement =
    document.getElementById(selectedId);

  const averageElement =
    document.getElementById(averageId);

  const differenceElement =
    document.getElementById(differenceId);

  const barElement =
    document.getElementById(barId);

  const markerElement =
    document.getElementById(markerId);


  if (
    selectedValue === null ||
    selectedValue === undefined ||
    !Number.isFinite(Number(selectedValue))
  ) {

    if (selectedElement) {
      selectedElement.textContent = "No Data";
    }

    if (differenceElement) {
      differenceElement.textContent = "—";
    }

    if (barElement) {
      barElement.style.width = "0%";
    }

    return;
  }


  const selected =
    Number(selectedValue);


  const average =
    Number.isFinite(Number(averageValue))
      ? Number(averageValue)
      : null;


  if (selectedElement) {
    selectedElement.textContent =
      selected.toFixed(1);
  }


  if (averageElement) {

    averageElement.textContent =
      average !== null
        ? average.toFixed(1)
        : "No Data";

  }


  if (barElement) {

    const selectedPercent =
      Math.max(
        0,
        Math.min(100, selected)
      );

    barElement.style.width =
      `${selectedPercent}%`;

  }


  if (
    markerElement &&
    average !== null
  ) {

    const averagePercent =
      Math.max(
        0,
        Math.min(100, average)
      );

    markerElement.style.left =
      `${averagePercent}%`;

  }


  if (
    differenceElement &&
    average !== null
  ) {

    const difference =
      selected - average;


    if (Math.abs(difference) < 0.05) {

      differenceElement.textContent =
        "≈ Average";

    }

    else if (difference > 0) {

      differenceElement.textContent =
        `↑ ${difference.toFixed(1)} pts`;

    }

    else {

      differenceElement.textContent =
        `↓ ${Math.abs(difference).toFixed(1)} pts`;

    }

  }

}



function updateWatershedComparison(properties) {

  if (!properties) {
    return;
  }


  const averageHealth =
    getDatasetAverage(
      "ECOLENS_HEALTH_SCORE"
    );


  const averageForest =
    getDatasetAverage(
      "ECOLENS_FOREST_SCORE"
    );


  const averageWater =
    getDatasetAverage(
      "ECOLENS_WATER_SCORE"
    );


  updateComparisonMetric({

    selectedValue:
      properties.ECOLENS_HEALTH_SCORE,

    averageValue:
      averageHealth,

    selectedId:
      "comparisonHealthSelected",

    averageId:
      "comparisonHealthAverage",

    differenceId:
      "comparisonHealthDifference",

    barId:
      "comparisonHealthBar",

    markerId:
      "comparisonHealthAverageMarker"

  });


  updateComparisonMetric({

    selectedValue:
      properties.ECOLENS_FOREST_SCORE,

    averageValue:
      averageForest,

    selectedId:
      "comparisonForestSelected",

    averageId:
      "comparisonForestAverage",

    differenceId:
      "comparisonForestDifference",

    barId:
      "comparisonForestBar",

    markerId:
      "comparisonForestAverageMarker"

  });


  updateComparisonMetric({

    selectedValue:
      properties.ECOLENS_WATER_SCORE,

    averageValue:
      averageWater,

    selectedId:
      "comparisonWaterSelected",

    averageId:
      "comparisonWaterAverage",

    differenceId:
      "comparisonWaterDifference",

    barId:
      "comparisonWaterBar",

    markerId:
      "comparisonWaterAverageMarker"

  });


  const priorityElement =
    document.getElementById(
      "comparisonPriority"
    );


  const priorityTextElement =
    document.getElementById(
      "comparisonPriorityText"
    );


  const rank =
    Number(
      properties.ECOLENS_PRIORITY_RANK
    );


  const total =
    Number(
      properties.ECOLENS_TOTAL_RANKED
    );


  const percentile =
    Number(
      properties.ECOLENS_PRIORITY_PERCENTILE
    );


  if (
    priorityElement &&
    Number.isFinite(rank) &&
    Number.isFinite(total)
  ) {

    priorityElement.textContent =
      `#${rank} of ${total}`;

  }


  if (
    priorityTextElement &&
    Number.isFinite(percentile)
  ) {

    priorityTextElement.textContent =
      `Higher restoration priority than approximately ${Math.round(percentile)}% of ranked watersheds.`;

  }

}

function updateWatershedPanel(
  properties
) {

  const name =
    getWatershedName(
      properties
    );


  const score =
    calculateComparisonScore(
      properties
    );


  const label =
    comparisonLabel(score);


  const nameElement =
    document.getElementById(
      "selectedWatershedName"
    );


  const priorityElement =
    document.getElementById(
      "selectedPriority"
    );


  const scoreElement =
    document.getElementById(
      "selectedScore"
    );


  const descriptionElement =
    document.getElementById(
      "selectedWatershedDescription"
    );


  const insightElement =
    document.getElementById(
      "selectedWatershedInsight"
    );


  if (nameElement) {

    nameElement.textContent =
      name;

  }


  if (scoreElement) {

    scoreElement.textContent =
      score === null
        ? "—"
        : score;

  }


  if (descriptionElement) {

    descriptionElement.textContent =
      "Environmental grades reported for this watershed in the current Conservation Halton dataset.";

  }


  if (priorityElement) {

    priorityElement.textContent =
      label;


    priorityElement.className =
      "priority-badge";


    if (score === null) {

      priorityElement.classList.add(
        "priority-neutral"
      );

    }

    else if (score >= 80) {

      priorityElement.classList.add(
        "priority-low"
      );

    }

    else if (score >= 60) {

      priorityElement.classList.add(
        "priority-moderate"
      );

    }

    else if (score >= 40) {

      priorityElement.classList.add(
        "priority-high"
      );

    }

    else {

      priorityElement.classList.add(
        "priority-critical"
      );

    }

  }


  updateGradeElement(
    "forestOverallGrade",
    properties.GRADE_FC_OVERALL
  );


  updateGradeElement(
    "forestCoverGrade",
    properties.GRADE_FC_COVER
  );


  updateGradeElement(
    "forestInteriorGrade",
    properties.GRADE_FC_INTERIOR
  );


  updateGradeElement(
    "forestRiparianGrade",
    properties.GRADE_FC_RIPARIAN
  );


  updateGradeElement(
    "waterOverallGrade",
    properties.GRADE_SWQ_OVERALL
  );


  updateGradeElement(
    "benthicGrade",
    properties.GRADE_SWQ_BENTHIC
  );


  updateGradeElement(
    "ecoliGrade",
    properties.GRADE_SWQ_ECOLI
  );


  updateGradeElement(
    "phosphorusGrade",
    properties.GRADE_SWQ_PHOSPH
  );


  if (insightElement) {

    insightElement.textContent =
      buildWatershedInsight(
        properties,
        score
      );

  }
  updateDashboardForWatershed(
  properties
  );

  updateWatershedChart(
  properties
);

updateInterpretationEngine(
  properties
);

updatePatternDetection(
  properties
);

updateWatershedComparison(
  properties
);

}


// ============================================================
// GRADE DISPLAY STYLING
// ============================================================

function updateGradeElement(
  elementId,
  value
) {

  const element =
    document.getElementById(
      elementId
    );


  if (!element) {
    return;
  }


  const grade =
    displayGrade(value);


  element.textContent =
    grade;


  element.className =
    "";


  const score =
    gradeToScore(
      value
    );


  if (score === null) {

    element.classList.add(
      "grade-no-data"
    );

  }

  else if (score >= 80) {

    element.classList.add(
      "grade-strong"
    );

  }

  else if (score >= 60) {

    element.classList.add(
      "grade-moderate"
    );

  }

  else if (score >= 40) {

    element.classList.add(
      "grade-attention"
    );

  }

  else {

    element.classList.add(
      "grade-critical"
    );

  }

}


// ============================================================
// FEATURE EVENTS
// ============================================================

function onEachWatershedFeature(
  feature,
  layer
) {

  const properties =
    feature.properties || {};


  const name =
    getWatershedName(
      properties
    );


  const score =
    calculateComparisonScore(
      properties
    );


  const label =
    comparisonLabel(
      score
    );


  layer.bindTooltip(
    `
      <strong>${name}</strong><br>
      EcoLens: ${score === null ? "No Score" : score + "/100"}<br>
      ${label}
    `,
    {
      sticky: true,
      direction: "top"
    }
  );


  layer.on({

  click: () =>
    selectWatershed(
      feature,
      layer
    )

});

}


// ============================================================
// MAP STATUS
// ============================================================

function setMapStatus(
  text,
  state
) {

  const statusText =
    document.getElementById(
      "mapStatusText"
    );


  const statusDot =
    document.getElementById(
      "mapStatusDot"
    );


  if (statusText) {

    statusText.textContent =
      text;

  }


  if (statusDot) {

    statusDot.className =
      "live-status-dot";


    statusDot.classList.add(
      `status-${state}`
    );

  }

}


// ============================================================
// INITIALIZE MAP
// ============================================================

// ============================================================
// TOP PERFORMING WATERSHEDS
// ============================================================

const topMetricDefinitions = {

  health: {
    label: "Environmental Health",
    score: (p) =>
      p.ECOLENS_HEALTH_SCORE
  },

  forest: {
    label: "Forest Domain",
    score: (p) =>
      p.ECOLENS_FOREST_SCORE
  },

  water: {
    label: "Water Domain",
    score: (p) =>
      p.ECOLENS_WATER_SCORE
  },

  forestCover: {
    label: "Forest Cover",
    score: (p) =>
      gradeToScore(
        p.GRADE_FC_COVER
      )
  },

  forestInterior: {
    label: "Forest Interior",
    score: (p) =>
      gradeToScore(
        p.GRADE_FC_INTERIOR
      )
  },

  riparian: {
    label: "Riparian Forest",
    score: (p) =>
      gradeToScore(
        p.GRADE_FC_RIPARIAN
      )
  },

  surfaceWater: {
    label: "Surface Water",
    score: (p) =>
      gradeToScore(
        p.GRADE_SWQ_OVERALL
      )
  },

  benthic: {
    label: "Benthic",
    score: (p) =>
      gradeToScore(
        p.GRADE_SWQ_BENTHIC
      )
  },

  ecoli: {
    label: "E. coli",
    score: (p) =>
      gradeToScore(
        p.GRADE_SWQ_ECOLI
      )
  },

  phosphorus: {
    label: "Phosphorus",
    score: (p) =>
      gradeToScore(
        p.GRADE_SWQ_PHOSPH
      )
  }

};


function updateTopPerformingAreas(
  metricKey = "health"
) {

  const chartElement =
    document.getElementById(
      "topAreasChart"
    );

  if (
    !chartElement ||
    typeof Plotly === "undefined"
  ) {
    return;
  }


  const metric =
    topMetricDefinitions[
      metricKey
    ];

  if (!metric) {
    return;
  }


  const ranked =
    watershedFeatures
      .map((feature) => {

        const properties =
          feature.properties || {};

        return {

          name:
            getWatershedName(
              properties
            ),

          score:
            metric.score(
              properties
            )

        };

      })
      .filter((item) =>
        item.score !== null &&
        item.score !== undefined
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 5);


  const titleElement =
    document.getElementById(
      "topAreasTitle"
    );


  if (titleElement) {

    titleElement.textContent =
      `Top Watersheds — ${metric.label}`;

  }


  const names =
    ranked
      .map((item) => item.name)
      .reverse();


  const scores =
    ranked
      .map((item) => item.score)
      .reverse();


  const trace = {

    type: "bar",

    orientation: "h",

    x: scores,

    y: names,

    text:
      scores.map(
        (score) =>
          `${score}/100`
      ),

    textposition:
      "outside",

    hovertemplate:
      "<b>%{y}</b><br>" +
      `${metric.label}: %{x}/100` +
      "<extra></extra>"

  };


  const layout = {

    paper_bgcolor:
      "rgba(0,0,0,0)",

    plot_bgcolor:
      "rgba(0,0,0,0)",

    font: {
      color: "#dce8f2"
    },

    margin: {
      l: 125,
      r: 45,
      t: 20,
      b: 45
    },

    xaxis: {

      title:
        "EcoLens Score",

      range: [
        0,
        105
      ],

      gridcolor:
        "rgba(255,255,255,0.07)",

      zeroline: false

    },

    yaxis: {
      automargin: true
    },

    showlegend: false

  };


  Plotly.react(
    chartElement,
    [trace],
    layout,
    {
      responsive: true,
      displayModeBar: false
    }
  );

}

const topMetricSelect =
  document.getElementById(
    "topMetricSelect"
  );


if (topMetricSelect) {

  topMetricSelect.addEventListener(
    "change",
    () => {

      updateTopPerformingAreas(
        topMetricSelect.value
      );

    }
  );

}

async function initializeWatershedMap() {

  const mapElement =
    document.getElementById(
      "watershedMap"
    );


  if (
    !mapElement ||
    typeof L === "undefined"
  ) {

    return;

  }


  watershedMap =
    L.map(
      "watershedMap",
      {
        zoomControl: true,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false
      }
    ).setView(
      [
        43.43,
        -79.82
      ],
      9
    );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {

      maxZoom: 19,

      attribution:
        '&copy; OpenStreetMap contributors'

    }
  ).addTo(
    watershedMap
  );


  try {

    setMapStatus(
      "Loading live watersheds...",
      "loading"
    );


    const response =
      await fetch(
        "/api/watersheds"
      );


    if (!response.ok) {

      throw new Error(
        `API returned ${response.status}`
      );

    }


    const geojson =
      await response.json();


    if (
      !geojson.features ||
      !Array.isArray(
        geojson.features
      )
    ) {

      throw new Error(
        "Invalid GeoJSON response"
      );

    }


    watershedFeatures =
      geojson.features;

    populateWatershedSearch();

    updateTopPerformingAreas(
  "health"
);


    watershedGeoJsonLayer =
      L.geoJSON(
        geojson,
        {

          style:
            watershedStyle,

          onEachFeature:
            onEachWatershedFeature

        }
      ).addTo(
        watershedMap
      );


    const bounds =
      watershedGeoJsonLayer.getBounds();


    if (
      bounds &&
      bounds.isValid()
    ) {

      watershedMap.fitBounds(
        bounds,
        {
          padding: [
            20,
            20
          ]
        }
      );

    }

    setTimeout(() => {
    watershedMap.invalidateSize();
    }, 150);


    setMapStatus(
      `${watershedFeatures.length} live polygons`,
      "live"
    );


  }

  catch (error) {

    console.error(
      "EcoLens map error:",
      error
    );


    setMapStatus(
      "Map unavailable",
      "error"
    );

  }

}


// ============================================================
// WATERSHED SEARCH
// ============================================================

function normalizeSearchText(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();

}

function populateWatershedSearch() {

  const dropdown =
    document.getElementById(
      "watershedDropdown"
    );

  const input =
    document.getElementById(
      "watershedSearch"
    );

  if (!dropdown || !input) {
    return;
  }

  const names =
    watershedFeatures
      .map((feature) =>
        getWatershedName(
          feature.properties || {}
        )
      )
      .filter((name) => name)
      .sort((a, b) =>
        a.localeCompare(b)
      );

  const uniqueNames =
    [...new Set(names)];

  function renderDropdown(filterText = "") {

    dropdown.innerHTML = "";

    const normalizedFilter =
      filterText
        .trim()
        .toLowerCase();

    const filteredNames =
      uniqueNames.filter((name) =>
        name
          .toLowerCase()
          .includes(normalizedFilter)
      );

    if (filteredNames.length === 0) {

      const emptyItem =
        document.createElement("div");

      emptyItem.className =
        "watershed-dropdown-empty";

      emptyItem.textContent =
        "No matching watershed";

      dropdown.appendChild(
        emptyItem
      );

      dropdown.classList.add(
        "show"
      );

      return;
    }

    filteredNames.forEach((name) => {

      const item =
        document.createElement("button");

      item.type = "button";

      item.className =
        "watershed-dropdown-item";

      item.textContent =
        name;

      item.addEventListener(
        "click",
        () => {

          input.value =
            name;

          dropdown.classList.remove(
            "show"
          );

          searchWatershed();

        }
      );

      dropdown.appendChild(
        item
      );

    });

    dropdown.classList.add(
      "show"
    );

  }

  input.addEventListener(
    "focus",
    () => {

      renderDropdown(
        input.value
      );

    }
  );

  input.addEventListener(
    "input",
    () => {

      renderDropdown(
        input.value
      );

    }
  );

  document.addEventListener(
    "click",
    (event) => {

      const wrapper =
        input.closest(
          ".watershed-search-wrapper"
        );

      if (
        wrapper &&
        !wrapper.contains(
          event.target
        )
      ) {

        dropdown.classList.remove(
          "show"
        );

      }

    }
  );

}

function searchWatershed() {

  const input =
    document.getElementById(
      "watershedSearch"
    );


  if (
    !input ||
    !watershedGeoJsonLayer
  ) {

    return;

  }


  const query =
    normalizeSearchText(
      input.value
    );


  if (!query) {

    return;

  }


  let bestMatch =
    null;


  watershedGeoJsonLayer.eachLayer(
    (layer) => {

      const properties =
        layer.feature?.properties || {};


      const name =
        getWatershedName(
          properties
        );


      const normalizedName =
        normalizeSearchText(
          name
        );


      if (
        !bestMatch &&
        normalizedName.includes(
          query
        )
      ) {

        bestMatch = {
          feature:
            layer.feature,

          layer:
            layer
        };

      }

    }
  );


  if (!bestMatch) {

    alert(
      "No matching watershed was found."
    );

    return;

  }


  selectWatershed(
    bestMatch.feature,
    bestMatch.layer
  );


  const bounds =
    bestMatch.layer.getBounds();


  if (
    bounds &&
    bounds.isValid()
  ) {

    watershedMap.fitBounds(
      bounds,
      {
        padding: [
          40,
          40
        ],
        maxZoom: 13
      }
    );

  }


  scrollToSection(
    "map-explorer"
  );

}


// ============================================================
// SEARCH EVENTS
// ============================================================

const watershedSearchBtn =
  document.getElementById(
    "watershedSearchBtn"
  );


const watershedSearchInput =
  document.getElementById(
    "watershedSearch"
  );


if (watershedSearchBtn) {

  watershedSearchBtn.addEventListener(
    "click",
    searchWatershed
  );

}


if (watershedSearchInput) {

  watershedSearchInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter"
      ) {

        searchWatershed();

      }

    }
  );

}


// ============================================================
// START ECOLENS MAP
// ============================================================

window.addEventListener(
  "load",
  () => {

    initializeWatershedMap();

  }
);