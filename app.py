from flask import Flask, render_template, jsonify
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


app = Flask(__name__)


# ============================================================
# ECOLENS DATA CONFIGURATION
# ============================================================

ARCGIS_GEOJSON_URL = (
    "https://utility.arcgis.com/usrsvcs/servers/"
    "d975ecae96a84eba81f67b44d9e33c9d/"
    "rest/services/ms-opendata/"
    "CH_WatershedReportCard_2023_SWGrading/"
    "MapServer/0/query"
    "?outFields=*"
    "&where=1%3D1"
    "&f=geojson"
)

LOCAL_CSV_PATH = "data/conservation_halton_report_card.csv"


# ============================================================
# GRADE CONFIGURATION
# ============================================================

GRADE_SCORE_MAP = {
    "A+": 4.3,
    "A": 4.0,
    "A-": 3.7,
    "B+": 3.3,
    "B": 3.0,
    "B-": 2.7,
    "C+": 2.3,
    "C": 2.0,
    "C-": 1.7,
    "D+": 1.3,
    "D": 1.0,
    "D-": 0.7,
    "F": 0.0
}


# ============================================================
# DATA LOADING
# ============================================================

def fetch_live_geojson():
    """
    Retrieve the live Conservation Halton watershed dataset
    from the ArcGIS REST API.

    Returns:
        dict: Raw GeoJSON FeatureCollection.
    """

    request = Request(
        ARCGIS_GEOJSON_URL,
        headers={
            "User-Agent": "EcoLens/1.0",
            "Accept": "application/geo+json, application/json"
        }
    )

    try:
        with urlopen(request, timeout=12) as response:
            raw_data = response.read().decode("utf-8")

        geojson = json.loads(raw_data)

        if geojson.get("type") != "FeatureCollection":
            raise ValueError("ArcGIS response was not a GeoJSON FeatureCollection.")

        features = geojson.get("features", [])

        if not features:
            raise ValueError("ArcGIS returned zero watershed features.")

        return geojson

    except HTTPError as error:
        raise RuntimeError(
            f"ArcGIS HTTP error: {error.code}"
        ) from error

    except URLError as error:
        raise RuntimeError(
            f"Could not connect to ArcGIS: {error.reason}"
        ) from error

    except json.JSONDecodeError as error:
        raise RuntimeError(
            "ArcGIS returned data that could not be parsed as JSON."
        ) from error


def geojson_to_dataframe(geojson):
    """
    Convert GeoJSON feature properties into a Pandas DataFrame.
    Geometry is intentionally kept in the original GeoJSON for
    use by the future interactive map.
    """

    rows = []

    for feature in geojson.get("features", []):
        properties = feature.get("properties", {})

        if properties:
            rows.append(properties)

    if not rows:
        raise ValueError("No attribute records were found in the GeoJSON.")

    df = pd.DataFrame(rows)

    return df


def validate_dataset(df):
    """
    Confirm that the dataset contains the minimum fields EcoLens
    needs before trusting the live API response.
    """

    required_columns = {
        "SUBWSHD_NAME",
        "GRADE_FC_OVERALL",
        "GRADE_SWQ_OVERALL"
    }

    normalized_columns = {
        str(column).strip().upper()
        for column in df.columns
    }

    missing = required_columns - normalized_columns

    if missing:
        raise ValueError(
            "Live dataset is missing required fields: "
            + ", ".join(sorted(missing))
        )


def load_dataset():
    """
    Main EcoLens data loader.

    Priority:
        1. Conservation Halton live ArcGIS GeoJSON
        2. Local CSV fallback

    Returns:
        df
        source_type
        source_message
    """

    try:
        geojson = fetch_live_geojson()
        df = geojson_to_dataframe(geojson)

        df.columns = [
            str(column).strip().upper()
            for column in df.columns
        ]

        validate_dataset(df)

        app.logger.info(
            "EcoLens loaded %s live ArcGIS records.",
            len(df)
        )

        return (
            df,
            "live",
            "Connected directly to the Conservation Halton ArcGIS REST API"
        )

    except Exception as error:
        app.logger.warning(
            "Live ArcGIS request failed. Using CSV fallback. Reason: %s",
            error
        )

        df = pd.read_csv(LOCAL_CSV_PATH)

        df.columns = [
            str(column).strip().upper()
            for column in df.columns
        ]

        return (
            df,
            "fallback",
            "Local CSV fallback active because the live ArcGIS service was unavailable"
        )


# ============================================================
# DATA CLEANING
# ============================================================

def clean_grade(value):
    if pd.isna(value):
        return None

    value = str(value).strip().upper()

    if value in {
        "",
        "N/A",
        "NA",
        "NONE",
        "NULL",
        "-",
        "--"
    }:
        return None

    return value


def grade_to_score(value):
    grade = clean_grade(value)

    if grade is None:
        return None

    return GRADE_SCORE_MAP.get(grade, None)


def score_to_label(score):
    if score is None or pd.isna(score):
        return "No Data"

    if score >= 3.7:
        return "Excellent"

    if score >= 3.0:
        return "Strong"

    if score >= 2.0:
        return "Moderate"

    if score >= 1.0:
        return "Needs Attention"

    return "Critical"


def safe_column(df, col_name):
    if col_name in df.columns:
        return df[col_name]

    return pd.Series(
        [None] * len(df),
        index=df.index
    )


# ============================================================
# CHART GENERATION
# ============================================================

def build_chart_bar(counts_df):
    fig = px.bar(
        counts_df,
        x="Category",
        y="Subwatersheds",
        title="Surface Water Quality Overall Grade Distribution"
    )

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="white"),
        margin=dict(
            l=30,
            r=30,
            t=60,
            b=40
        )
    )

    fig.update_traces(
        marker_line_width=0,
        opacity=0.9
    )

    return fig.to_html(
        full_html=False,
        include_plotlyjs="cdn"
    )


def build_chart_radar(category_scores):
    categories = list(category_scores.keys())
    values = list(category_scores.values())

    if categories:
        categories_for_plot = categories + [categories[0]]
        values_for_plot = values + [values[0]]

    else:
        categories_for_plot = ["No Data"]
        values_for_plot = [0]

    fig = go.Figure()

    fig.add_trace(
        go.Scatterpolar(
            r=values_for_plot,
            theta=categories_for_plot,
            fill="toself",
            name="Average Grade Score"
        )
    )

    fig.update_layout(
        title="Environmental Indicator Profile",
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        polar=dict(
            bgcolor="rgba(0,0,0,0)",
            radialaxis=dict(
                visible=True,
                range=[0, 4.3]
            )
        ),
        font=dict(color="white"),
        margin=dict(
            l=30,
            r=30,
            t=60,
            b=30
        ),
        showlegend=False
    )

    return fig.to_html(
        full_html=False,
        include_plotlyjs=False
    )


def build_chart_top_subwatersheds(top_df):
    fig = px.bar(
        top_df,
        x="Subwatershed",
        y="Score",
        title="Top Performing Subwatersheds (Combined Score)"
    )

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="white"),
        margin=dict(
            l=30,
            r=30,
            t=60,
            b=40
        )
    )

    fig.update_traces(
        marker_line_width=0,
        opacity=0.9
    )

    return fig.to_html(
        full_html=False,
        include_plotlyjs=False
    )


# ============================================================
# GEOJSON API FOR FUTURE INTERACTIVE MAP
# ============================================================

@app.route("/api/watersheds")
def watershed_geojson():
    """
    Browser-accessible endpoint used by the future Leaflet map.

    Example:
        /api/watersheds
    """

    try:
        geojson = fetch_live_geojson()

        return jsonify(geojson)

    except Exception as error:
        return jsonify({
            "success": False,
            "error": "Live watershed geometry is currently unavailable.",
            "details": str(error)
        }), 503


# ============================================================
# MAIN DASHBOARD
# ============================================================

@app.route("/")
def home():

    # --------------------------------------------------------
    # LOAD DATA
    # --------------------------------------------------------

    df, data_source_status, data_source_message = load_dataset()

    # --------------------------------------------------------
    # ORGANIZATION
    # --------------------------------------------------------

    ca_name = safe_column(
        df,
        "CA_NAME"
    ).dropna()

    ca_display = "Conservation Halton / Conservation Ontario"

    if not ca_name.empty:
        ca_display = str(
            ca_name.iloc[0]
        ).strip()

    # --------------------------------------------------------
    # RAW INDICATORS
    # --------------------------------------------------------

    name_series = safe_column(
        df,
        "SUBWSHD_NAME"
    ).fillna(
        "Unnamed Subwatershed"
    )

    fc_overall = safe_column(
        df,
        "GRADE_FC_OVERALL"
    ).map(clean_grade)

    fc_cover = safe_column(
        df,
        "GRADE_FC_COVER"
    ).map(clean_grade)

    fc_interior = safe_column(
        df,
        "GRADE_FC_INTERIOR"
    ).map(clean_grade)

    fc_riparian = safe_column(
        df,
        "GRADE_FC_RIPARIAN"
    ).map(clean_grade)

    swq_overall = safe_column(
        df,
        "GRADE_SWQ_OVERALL"
    ).map(clean_grade)

    swq_benthic = safe_column(
        df,
        "GRADE_SWQ_BENTHIC"
    ).map(clean_grade)

    swq_ecoli = safe_column(
        df,
        "GRADE_SWQ_ECOLI"
    ).map(clean_grade)

    swq_phosph = safe_column(
        df,
        "GRADE_SWQ_PHOSPH"
    ).map(clean_grade)

    # --------------------------------------------------------
    # CREATE STANDARDIZED WORKING DATAFRAME
    # --------------------------------------------------------

    working_df = pd.DataFrame({
        "Subwatershed": name_series,
        "Forest Overall": fc_overall,
        "Forest Cover": fc_cover,
        "Forest Interior": fc_interior,
        "Forest Riparian": fc_riparian,
        "Water Quality Overall": swq_overall,
        "Benthic": swq_benthic,
        "E. coli": swq_ecoli,
        "Phosphorus": swq_phosph
    })

    score_columns = [
        "Forest Overall",
        "Forest Cover",
        "Forest Interior",
        "Forest Riparian",
        "Water Quality Overall",
        "Benthic",
        "E. coli",
        "Phosphorus"
    ]

    for column in score_columns:
        working_df[
            column + " Score"
        ] = working_df[
            column
        ].map(
            grade_to_score
        )

    # --------------------------------------------------------
    # HIGH-LEVEL METRICS
    # --------------------------------------------------------

    subwatershed_count = len(working_df)

    forest_scores = working_df[
        "Forest Overall Score"
    ].dropna()

    water_scores = working_df[
        "Water Quality Overall Score"
    ].dropna()

    forest_avg = (
        forest_scores.mean()
        if not forest_scores.empty
        else None
    )

    water_avg = (
        water_scores.mean()
        if not water_scores.empty
        else None
    )

    combined_scores = pd.concat(
        [
            working_df[
                "Forest Overall Score"
            ],
            working_df[
                "Water Quality Overall Score"
            ]
        ],
        ignore_index=True
    ).dropna()

    combined_avg = (
        combined_scores.mean()
        if not combined_scores.empty
        else None
    )

    dominant_label = score_to_label(
        combined_avg
    )

    # --------------------------------------------------------
    # FLAG LOWER-PERFORMING WATERSHEDS
    # --------------------------------------------------------

    weak_swq = working_df[
        working_df[
            "Water Quality Overall Score"
        ].notna()
        &
        (
            working_df[
                "Water Quality Overall Score"
            ] <= 1.7
        )
    ]

    weak_fc = working_df[
        working_df[
            "Forest Overall Score"
        ].notna()
        &
        (
            working_df[
                "Forest Overall Score"
            ] <= 1.7
        )
    ]

    flagged_count = len(
        pd.concat(
            [
                weak_swq[
                    ["Subwatershed"]
                ],
                weak_fc[
                    ["Subwatershed"]
                ]
            ]
        )
        .drop_duplicates()
    )

    # --------------------------------------------------------
    # CATEGORY AVERAGES
    # --------------------------------------------------------

    category_column_map = {
        "Forest Overall": "Forest Overall Score",
        "Forest Cover": "Forest Cover Score",
        "Forest Interior": "Forest Interior Score",
        "Riparian": "Forest Riparian Score",
        "SWQ Overall": "Water Quality Overall Score",
        "Benthic": "Benthic Score",
        "E. coli": "E. coli Score",
        "Phosphorus": "Phosphorus Score"
    }

    category_scores = {}

    for category_name, column_name in category_column_map.items():

        scores = working_df[
            column_name
        ].dropna()

        category_scores[
            category_name
        ] = (
            round(
                scores.mean(),
                2
            )
            if not scores.empty
            else 0
        )

    non_zero_category_scores = {
        key: value
        for key, value in category_scores.items()
        if value > 0
    }

    if non_zero_category_scores:

        lowest_category = min(
            non_zero_category_scores,
            key=non_zero_category_scores.get
        )

        highest_category = max(
            non_zero_category_scores,
            key=non_zero_category_scores.get
        )

    else:
        lowest_category = "No Data"
        highest_category = "No Data"

    # --------------------------------------------------------
    # GRADE DISTRIBUTION
    # --------------------------------------------------------

    grade_counts = (
        working_df[
            "Water Quality Overall"
        ]
        .dropna()
        .value_counts()
        .sort_index()
        .reset_index()
    )

    grade_counts.columns = [
        "Category",
        "Subwatersheds"
    ]

    if grade_counts.empty:
        grade_counts = pd.DataFrame({
            "Category": ["No Data"],
            "Subwatersheds": [0]
        })

    # --------------------------------------------------------
    # CURRENT COMBINED SCORE
    # --------------------------------------------------------
    #
    # This remains the original EcoLens scoring method for now.
    #
    # In Phase 2 we will replace this with the Environmental
    # Priority Engine.
    # --------------------------------------------------------

    working_df[
        "Combined Score"
    ] = working_df[
        [
            "Forest Overall Score",
            "Water Quality Overall Score"
        ]
    ].mean(
        axis=1,
        skipna=True
    )

    # --------------------------------------------------------
    # TOP PERFORMERS
    # --------------------------------------------------------

    top_subwatersheds = (
        working_df[
            [
                "Subwatershed",
                "Combined Score"
            ]
        ]
        .dropna()
        .sort_values(
            "Combined Score",
            ascending=False
        )
        .head(5)
        .copy()
    )

    top_subwatersheds[
        "Score"
    ] = top_subwatersheds[
        "Combined Score"
    ].round(2)

    if top_subwatersheds.empty:
        top_subwatersheds = pd.DataFrame({
            "Subwatershed": ["No Data"],
            "Score": [0]
        })

    # --------------------------------------------------------
    # ATTENTION AREAS
    # --------------------------------------------------------

    low_priority_df = (
        working_df[
            [
                "Subwatershed",
                "Combined Score"
            ]
        ]
        .dropna()
        .sort_values(
            "Combined Score",
            ascending=True
        )
        .head(5)
        .copy()
    )

    attention_areas = []

    for _, row in low_priority_df.iterrows():

        attention_areas.append({
            "name": row[
                "Subwatershed"
            ],
            "score": round(
                row[
                    "Combined Score"
                ],
                2
            )
        })

    # --------------------------------------------------------
    # STRENGTHS
    # --------------------------------------------------------

    strengths_df = (
        working_df[
            [
                "Subwatershed",
                "Combined Score"
            ]
        ]
        .dropna()
        .sort_values(
            "Combined Score",
            ascending=False
        )
        .head(3)
        .copy()
    )

    strengths = []

    for _, row in strengths_df.iterrows():

        strengths.append({
            "name": row[
                "Subwatershed"
            ],
            "score": round(
                row[
                    "Combined Score"
                ],
                2
            )
        })

    # --------------------------------------------------------
    # DATASET PREVIEW
    # --------------------------------------------------------

    preview_columns = [
        column
        for column in [
            "Subwatershed",
            "Forest Overall",
            "Forest Cover",
            "Forest Interior",
            "Forest Riparian",
            "Water Quality Overall",
            "Benthic",
            "E. coli",
            "Phosphorus"
        ]
        if column in working_df.columns
    ]

    preview_records = (
        working_df[
            preview_columns
        ]
        .head(8)
        .fillna(
            "No Data"
        )
        .to_dict(
            orient="records"
        )
    )

    # --------------------------------------------------------
    # CHARTS
    # --------------------------------------------------------

    chart_bar_html = build_chart_bar(
        grade_counts
    )

    chart_radar_html = build_chart_radar(
        category_scores
    )

    chart_top_html = build_chart_top_subwatersheds(
        top_subwatersheds
    )

    # --------------------------------------------------------
    # CURRENT RULE-BASED INTERPRETATIONS
    # --------------------------------------------------------
    #
    # These will later be replaced by the real LLM layer.
    # Python still computes the facts first.
    # --------------------------------------------------------

    analyst_summary = (
        f"EcoLens processed {subwatershed_count} subwatershed records "
        f"from the {ca_display} watershed report card dataset. "
        f"The combined environmental profile is currently rated as "
        f"{dominant_label.lower()}, with stronger performance in "
        f"{highest_category.lower()} and weaker performance in "
        f"{lowest_category.lower()}. "
        f"{flagged_count} subwatersheds were flagged for closer review "
        f"because at least one major indicator scored in a lower "
        f"performance range."
    )

    public_summary = (
        f"This dashboard reviewed {subwatershed_count} subwatersheds "
        f"and found that overall conditions are mixed. "
        f"Some areas are performing well, but others may need more "
        f"attention, especially in {lowest_category.lower()}. "
        f"EcoLens helps turn these technical grades into "
        f"plain-language findings that can support communication "
        f"with staff, decision-makers, and the public."
    )

    policy_summary = (
        f"For planning and policy discussions, the current dataset "
        f"suggests that the most useful next step is to focus on "
        f"lower-performing subwatersheds while preserving strong "
        f"results in higher-performing areas. "
        f"This kind of structured interpretation can support "
        f"watershed reporting, environmental prioritization, "
        f"grant communication, and public-facing updates."
    )

    why_it_matters = (
        "Environmental report-card datasets are useful, but the "
        "technical structure of grades, indicator categories, and "
        "subwatershed names can make them harder to interpret quickly. "
        "EcoLens bridges that gap by organizing the data into visuals, "
        "ranking patterns, and audience-specific summaries."
    )

    methodology_note = (
        "EcoLens first attempts to retrieve the published watershed "
        "Feature Layer directly from Conservation Halton's ArcGIS REST "
        "service. The attributes are validated, standardized, converted "
        "into comparable grade scores, and analyzed with deterministic "
        "Python logic. If the external service is unavailable, EcoLens "
        "uses a local snapshot as a fallback so the dashboard remains "
        "available."
    )

    ai_note = (
        "Current interpretation layer: deterministic, data-assisted "
        "summary generation. EcoLens calculates structured facts before "
        "producing explanations. A later AI layer will receive these "
        "verified facts rather than independently estimating environmental "
        "measurements from raw data."
    )

    # --------------------------------------------------------
    # DATA SOURCE INFORMATION
    # --------------------------------------------------------

    data_source_name = (
        "Watershed Report Card 2023: "
        "Forest Conditions and Surface Water Quality"
    )

    data_source_org = ca_display

    if data_source_status == "live":

        data_last_updated = (
            "LIVE • Conservation Halton ArcGIS REST API"
        )

    else:

        data_last_updated = (
            "FALLBACK • Local dataset snapshot"
        )

    # --------------------------------------------------------
    # RENDER
    # --------------------------------------------------------

    return render_template(
        "index.html",

        chart_bar_html=chart_bar_html,
        chart_radar_html=chart_radar_html,
        chart_top_html=chart_top_html,

        analyst_summary=analyst_summary,
        public_summary=public_summary,
        policy_summary=policy_summary,

        subwatershed_count=subwatershed_count,
        dominant_label=dominant_label,
        flagged_count=flagged_count,

        highest_category=highest_category,
        lowest_category=lowest_category,

        forest_average=(
            round(forest_avg, 2)
            if forest_avg is not None
            and pd.notna(forest_avg)
            else "N/A"
        ),

        water_average=(
            round(water_avg, 2)
            if water_avg is not None
            and pd.notna(water_avg)
            else "N/A"
        ),

        strengths=strengths,
        attention_areas=attention_areas,

        preview_records=preview_records,
        preview_columns=preview_columns,

        why_it_matters=why_it_matters,
        methodology_note=methodology_note,
        ai_note=ai_note,

        data_source_name=data_source_name,
        data_source_org=data_source_org,
        data_last_updated=data_last_updated,

        data_source_status=data_source_status,
        data_source_message=data_source_message
    )


# ============================================================
# LOCAL DEVELOPMENT
# ============================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=True
    )