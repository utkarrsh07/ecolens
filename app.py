from flask import Flask, render_template
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

app = Flask(__name__)


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


def clean_grade(value):
    if pd.isna(value):
        return None
    value = str(value).strip().upper()
    if value in {"", "N/A", "NA", "NONE", "NULL", "-", "--"}:
        return None
    return value


def grade_to_score(value):
    grade = clean_grade(value)
    if grade is None:
        return None
    return GRADE_SCORE_MAP.get(grade, None)


def score_to_label(score):
    if score is None:
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
    return pd.Series([None] * len(df))


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
        margin=dict(l=30, r=30, t=60, b=40)
    )

    fig.update_traces(
        marker_line_width=0,
        opacity=0.9
    )

    return fig.to_html(full_html=False, include_plotlyjs="cdn")


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
            radialaxis=dict(visible=True, range=[0, 4.3])
        ),
        font=dict(color="white"),
        margin=dict(l=30, r=30, t=60, b=30),
        showlegend=False
    )

    return fig.to_html(full_html=False, include_plotlyjs=False)


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
        margin=dict(l=30, r=30, t=60, b=40)
    )

    fig.update_traces(
        marker_line_width=0,
        opacity=0.9
    )

    return fig.to_html(full_html=False, include_plotlyjs=False)


@app.route("/")
def home():
    df = pd.read_csv("data/conservation_halton_report_card.csv")
    df.columns = [col.strip().upper() for col in df.columns]

    ca_name = safe_column(df, "CA_NAME").dropna()
    ca_display = "Conservation Halton / Conservation Ontario"
    if not ca_name.empty:
        ca_display = str(ca_name.iloc[0]).strip()

    name_series = safe_column(df, "SUBWSHD_NAME").fillna("Unnamed Subwatershed")

    fc_overall = safe_column(df, "GRADE_FC_OVERALL").map(clean_grade)
    fc_cover = safe_column(df, "GRADE_FC_COVER").map(clean_grade)
    fc_interior = safe_column(df, "GRADE_FC_INTERIOR").map(clean_grade)
    fc_riparian = safe_column(df, "GRADE_FC_RIPARIAN").map(clean_grade)

    swq_overall = safe_column(df, "GRADE_SWQ_OVERALL").map(clean_grade)
    swq_benthic = safe_column(df, "GRADE_SWQ_BENTHIC").map(clean_grade)
    swq_ecoli = safe_column(df, "GRADE_SWQ_ECOLI").map(clean_grade)
    swq_phosph = safe_column(df, "GRADE_SWQ_PHOSPH").map(clean_grade)

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

    for col in [
        "Forest Overall",
        "Forest Cover",
        "Forest Interior",
        "Forest Riparian",
        "Water Quality Overall",
        "Benthic",
        "E. coli",
        "Phosphorus"
    ]:
        working_df[col + " Score"] = working_df[col].map(grade_to_score)

    subwatershed_count = len(working_df)

    forest_avg = working_df["Forest Overall Score"].dropna().mean()
    water_avg = working_df["Water Quality Overall Score"].dropna().mean()

    combined_scores = pd.concat(
        [
            working_df["Forest Overall Score"],
            working_df["Water Quality Overall Score"]
        ],
        ignore_index=True
    ).dropna()

    combined_avg = combined_scores.mean() if not combined_scores.empty else None

    dominant_label = score_to_label(combined_avg)

    weak_swq = working_df[
        working_df["Water Quality Overall Score"].notna() &
        (working_df["Water Quality Overall Score"] <= 1.7)
    ]

    weak_fc = working_df[
        working_df["Forest Overall Score"].notna() &
        (working_df["Forest Overall Score"] <= 1.7)
    ]

    flagged_count = len(
        pd.concat([weak_swq[["Subwatershed"]], weak_fc[["Subwatershed"]]])
        .drop_duplicates()
    )

    category_scores = {
        "Forest Overall": round(working_df["Forest Overall Score"].dropna().mean(), 2) if not working_df["Forest Overall Score"].dropna().empty else 0,
        "Forest Cover": round(working_df["Forest Cover Score"].dropna().mean(), 2) if not working_df["Forest Cover Score"].dropna().empty else 0,
        "Forest Interior": round(working_df["Forest Interior Score"].dropna().mean(), 2) if not working_df["Forest Interior Score"].dropna().empty else 0,
        "Riparian": round(working_df["Forest Riparian Score"].dropna().mean(), 2) if not working_df["Forest Riparian Score"].dropna().empty else 0,
        "SWQ Overall": round(working_df["Water Quality Overall Score"].dropna().mean(), 2) if not working_df["Water Quality Overall Score"].dropna().empty else 0,
        "Benthic": round(working_df["Benthic Score"].dropna().mean(), 2) if not working_df["Benthic Score"].dropna().empty else 0,
        "E. coli": round(working_df["E. coli Score"].dropna().mean(), 2) if not working_df["E. coli Score"].dropna().empty else 0,
        "Phosphorus": round(working_df["Phosphorus Score"].dropna().mean(), 2) if not working_df["Phosphorus Score"].dropna().empty else 0
    }

    lowest_category = min(category_scores, key=category_scores.get)
    highest_category = max(category_scores, key=category_scores.get)

    grade_counts = (
        working_df["Water Quality Overall"]
        .dropna()
        .value_counts()
        .sort_index()
        .reset_index()
    )
    grade_counts.columns = ["Category", "Subwatersheds"]

    if grade_counts.empty:
        grade_counts = pd.DataFrame({
            "Category": ["No Data"],
            "Subwatersheds": [0]
        })

    working_df["Combined Score"] = working_df[
        ["Forest Overall Score", "Water Quality Overall Score"]
    ].mean(axis=1, skipna=True)

    top_subwatersheds = (
        working_df[["Subwatershed", "Combined Score"]]
        .dropna()
        .sort_values("Combined Score", ascending=False)
        .head(5)
        .copy()
    )

    top_subwatersheds["Score"] = top_subwatersheds["Combined Score"].round(2)

    if top_subwatersheds.empty:
        top_subwatersheds = pd.DataFrame({
            "Subwatershed": ["No Data"],
            "Score": [0]
        })

    low_priority_df = (
        working_df[["Subwatershed", "Combined Score"]]
        .dropna()
        .sort_values("Combined Score", ascending=True)
        .head(5)
        .copy()
    )

    attention_areas = []
    for _, row in low_priority_df.iterrows():
        attention_areas.append({
            "name": row["Subwatershed"],
            "score": round(row["Combined Score"], 2)
        })

    strengths_df = (
        working_df[["Subwatershed", "Combined Score"]]
        .dropna()
        .sort_values("Combined Score", ascending=False)
        .head(3)
        .copy()
    )

    strengths = []
    for _, row in strengths_df.iterrows():
        strengths.append({
            "name": row["Subwatershed"],
            "score": round(row["Combined Score"], 2)
        })

    preview_columns = [
        col for col in [
            "Subwatershed",
            "Forest Overall",
            "Forest Cover",
            "Forest Interior",
            "Forest Riparian",
            "Water Quality Overall",
            "Benthic",
            "E. coli",
            "Phosphorus"
        ] if col in working_df.columns
    ]

    preview_records = (
        working_df[preview_columns]
        .head(8)
        .fillna("No Data")
        .to_dict(orient="records")
    )

    chart_bar_html = build_chart_bar(grade_counts)
    chart_radar_html = build_chart_radar(category_scores)
    chart_top_html = build_chart_top_subwatersheds(top_subwatersheds)

    analyst_summary = (
        f"EcoLens processed {subwatershed_count} subwatershed records from the {ca_display} "
        f"watershed report card dataset. The combined environmental profile is currently rated "
        f"as {dominant_label.lower()}, with stronger performance in {highest_category.lower()} "
        f"and weaker performance in {lowest_category.lower()}. "
        f"{flagged_count} subwatersheds were flagged for closer review because at least one major "
        f"indicator scored in a lower performance range."
    )

    public_summary = (
        f"This dashboard reviewed {subwatershed_count} subwatersheds and found that overall "
        f"conditions are mixed. Some areas are performing well, but others may need more attention, "
        f"especially in {lowest_category.lower()}. EcoLens helps turn these technical grades into "
        f"plain-language findings that can support communication with staff, decision-makers, "
        f"and the public."
    )

    policy_summary = (
        f"For planning and policy discussions, the current dataset suggests that the most useful "
        f"next step is to focus on lower-performing subwatersheds while preserving strong results "
        f"in higher-performing areas. This kind of structured interpretation can support watershed "
        f"reporting, environmental prioritization, grant communication, and public-facing updates."
    )

    why_it_matters = (
        "Environmental report-card datasets are useful, but the technical structure of grades, "
        "indicator categories, and subwatershed names can make them harder to interpret quickly. "
        "EcoLens bridges that gap by organizing the data into visuals, ranking patterns, "
        "and audience-specific summaries."
    )

    methodology_note = (
        "This prototype reads an open environmental dataset, standardizes report-card grades, "
        "converts them into comparable numeric scores, identifies stronger and weaker categories, "
        "and then produces visual and plain-language interpretations for multiple audiences."
    )

    ai_note = (
        "Current AI layer: data-assisted summary generation. The app first calculates structured "
        "facts from the dataset and then turns those facts into analyst, public, and policy-style "
        "explanations. A future version can connect this pipeline to a real large language model."
    )

    data_source_name = "Watershed Report Card 2023: Forest Conditions and Surface Water Quality"
    data_source_org = ca_display
    data_last_updated = "Use the dataset page metadata for the latest published update"

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
        forest_average=round(forest_avg, 2) if pd.notna(forest_avg) else "N/A",
        water_average=round(water_avg, 2) if pd.notna(water_avg) else "N/A",
        strengths=strengths,
        attention_areas=attention_areas,
        preview_records=preview_records,
        preview_columns=preview_columns,
        why_it_matters=why_it_matters,
        methodology_note=methodology_note,
        ai_note=ai_note,
        data_source_name=data_source_name,
        data_source_org=data_source_org,
        data_last_updated=data_last_updated
    )


if __name__ == "__main__":
    app.run(debug=True)