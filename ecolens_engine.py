import os
import io
import json
import zipfile
import tempfile
import statistics
from typing import Dict, List, Optional, Tuple

import pandas as pd

try:
    import geopandas as gpd
except Exception:
    gpd = None


GRADE_MAP = {
    "A": 4.0,
    "B": 3.0,
    "C": 2.0,
    "D": 1.0,
    "F": 0.0,
    "VERY GOOD": 4.0,
    "GOOD": 3.0,
    "FAIR": 2.0,
    "POOR": 1.0,
    "VERY POOR": 0.0,
}

MISSING_GRADE_VALUES = {
    "",
    "N/A",
    "NA",
    "NONE",
    "NULL",
    "INSUFFICIENT DATA",
    "INSUFFICIENT",
    "NOT AVAILABLE",
    "UNKNOWN",
    "-",
    "--",
}


class EcoLensEngine:
    def __init__(self):
        self.schema_aliases = {
            "area_name": [
                "subwatershed",
                "subwshd_name",
                "subwshd",
                "subwatershed_name",
                "name",
                "station_name",
                "well_id",
                "site_name",
                "location_name",
                "watershed_name",
                "area_name",
                "subbasin",
                "sub_basin",
            ],
            "overall": [
                "overall",
                "grade_overall",
                "overall_grade",
                "grade_fc_overall",
                "grade_swq_overall",
                "grade_gwq_overall",
                "overall_score",
            ],
            "forest_cover": [
                "forest_cover",
                "grade_fc_cover",
                "fc_cover",
                "forest cover",
                "tree_canopy",
                "canopy",
            ],
            "forest_interior": [
                "forest_interior",
                "grade_fc_interior",
                "fc_interior",
                "interior_forest",
            ],
            "riparian": [
                "riparian",
                "grade_fc_riparian",
                "riparian_cover",
                "streamside_cover",
            ],
            "water_quality": [
                "water_quality",
                "grade_swq_overall",
                "swq_overall",
                "grade_gwq_overall",
                "gwq_overall",
                "water quality overall",
            ],
            "benthic": [
                "benthic",
                "grade_swq_benthic",
                "benthic_score",
                "macroinvertebrates",
            ],
            "e_coli": [
                "e_coli",
                "ecoli",
                "grade_swq_ecoli",
                "grade_swq_e_coli",
                "bacteria",
                "grade_gwq_nit",
            ],
            "phosphorus": [
                "phosphorus",
                "grade_swq_phosph",
                "grade_swq_phosphorus",
                "total_phosphorus",
                "tp",
                "grade_gwq_chloride",
            ],
            "geometry": [
                "geometry",
                "geom",
                "shape",
            ],
            "latitude": [
                "latitude",
                "lat",
                "y",
            ],
            "longitude": [
                "longitude",
                "lon",
                "lng",
                "long",
                "x",
            ],
        }

        self.issue_actions = {
            "Low forest cover": "Consider reforestation, canopy restoration, and land cover targeting.",
            "Weak interior forest condition": "Review fragmentation and habitat connectivity opportunities.",
            "Riparian weakness": "Prioritize streamside planting and buffer restoration.",
            "Poor water quality": "Review contributing stressors and watershed-level mitigation opportunities.",
            "High E. coli concern": "Investigate potential runoff, septic, and source-control issues.",
            "Phosphorus concern": "Review nutrient loading pathways and targeted runoff controls.",
            "Benthic concern": "Assess stream habitat condition and biological health stressors.",
            "Multiple weak indicators": "Flag for multi-factor review and cross-team follow-up.",
            "Insufficient monitoring coverage": "Consider additional monitoring or data-quality review.",
        }

    def load_uploaded_dataset(self, file_storage) -> Tuple[pd.DataFrame, Dict]:
        filename = file_storage.filename or ""
        extension = os.path.splitext(filename.lower())[1]

        meta = {
            "filename": filename,
            "extension": extension,
            "has_geometry": False,
            "source_type": None,
            "record_count": 0,
        }

        if extension == ".csv":
            df = pd.read_csv(file_storage)
            meta["source_type"] = "csv"

        elif extension in [".geojson", ".json"]:
            if gpd is None:
                raise ValueError("GeoJSON upload requires geopandas to be installed.")
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp:
                file_storage.save(tmp.name)
                gdf = gpd.read_file(tmp.name)
            df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))
            if "geometry" in gdf.columns:
                df["geometry_wkt"] = gdf.geometry.astype(str)
                meta["has_geometry"] = True
            meta["source_type"] = "geojson"

        elif extension == ".kml":
            if gpd is None:
                raise ValueError("KML upload requires geopandas to be installed.")
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp:
                file_storage.save(tmp.name)
                gdf = gpd.read_file(tmp.name, driver="KML")
            df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))
            if "geometry" in gdf.columns:
                df["geometry_wkt"] = gdf.geometry.astype(str)
                meta["has_geometry"] = True
            meta["source_type"] = "kml"

        elif extension == ".zip":
            if gpd is None:
                raise ValueError("Shapefile upload requires geopandas to be installed.")
            df, has_geometry = self._read_zipped_shapefile(file_storage)
            meta["has_geometry"] = has_geometry
            meta["source_type"] = "zipped_shapefile"

        else:
            raise ValueError("Unsupported file type. Upload CSV, GeoJSON, KML, or ZIP shapefile.")

        meta["record_count"] = len(df)
        return df, meta

    def _read_zipped_shapefile(self, file_storage) -> Tuple[pd.DataFrame, bool]:
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "upload.zip")
            file_storage.save(zip_path)

            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmpdir)

            shp_file = None
            for root, _, files in os.walk(tmpdir):
                for f in files:
                    if f.lower().endswith(".shp"):
                        shp_file = os.path.join(root, f)
                        break
                if shp_file:
                    break

            if not shp_file:
                raise ValueError("ZIP does not contain a .shp file.")

            gdf = gpd.read_file(shp_file)
            df = pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))

            has_geometry = False
            if "geometry" in gdf.columns:
                df["geometry_wkt"] = gdf.geometry.astype(str)
                has_geometry = True

            return df, has_geometry

    def analyze(self, df: pd.DataFrame, file_meta: Dict) -> Dict:
        cleaned = self._clean_columns(df)
        schema = self.detect_schema(cleaned)
        standardized = self.standardize(cleaned, schema)
        scored = self.score_dataframe(standardized)

        insights = self.compute_insights(scored)
        summaries = self.generate_summaries(insights, file_meta)
        charts = self.build_chart_payload(insights)
        table_preview = self.build_table_preview(standardized)

        return {
            "file_meta": file_meta,
            "schema": schema,
            "insights": insights,
            "summaries": summaries,
            "charts": charts,
            "table_preview": table_preview,
        }

    def _clean_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        clean_df = df.copy()
        clean_df.columns = [self._normalize_key(col) for col in clean_df.columns]
        return clean_df

    def _normalize_key(self, value: str) -> str:
        value = str(value).strip().lower()
        for ch in [" ", "-", "/", ".", "(", ")", "[", "]"]:
            value = value.replace(ch, "_")
        while "__" in value:
            value = value.replace("__", "_")
        return value.strip("_")

    def detect_schema(self, df: pd.DataFrame) -> Dict[str, Optional[str]]:
        schema = {k: None for k in self.schema_aliases.keys()}

        for target_field, aliases in self.schema_aliases.items():
            for col in df.columns:
                if col == target_field:
                    schema[target_field] = col
                    break
                if col in aliases:
                    schema[target_field] = col
                    break
                if any(alias in col for alias in aliases):
                    schema[target_field] = col
                    break

        if schema["area_name"] is None and len(df.columns) > 0:
            for col in df.columns:
                if "name" in col:
                    schema["area_name"] = col
                    break

        return schema

    def standardize(self, df: pd.DataFrame, schema: Dict[str, Optional[str]]) -> pd.DataFrame:
        output = pd.DataFrame()

        output["area_name"] = self._safe_col(df, schema.get("area_name"), default_prefix="Area")
        output["overall"] = self._safe_text_col(df, schema.get("overall"))
        output["forest_cover"] = self._safe_text_col(df, schema.get("forest_cover"))
        output["forest_interior"] = self._safe_text_col(df, schema.get("forest_interior"))
        output["riparian"] = self._safe_text_col(df, schema.get("riparian"))
        output["water_quality"] = self._safe_text_col(df, schema.get("water_quality"))
        output["benthic"] = self._safe_text_col(df, schema.get("benthic"))
        output["e_coli"] = self._safe_text_col(df, schema.get("e_coli"))
        output["phosphorus"] = self._safe_text_col(df, schema.get("phosphorus"))

        if schema.get("geometry") and schema["geometry"] in df.columns:
            output["geometry"] = df[schema["geometry"]].astype(str)
        elif "geometry_wkt" in df.columns:
            output["geometry"] = df["geometry_wkt"].astype(str)
        else:
            output["geometry"] = None

        lat_col = schema.get("latitude")
        lon_col = schema.get("longitude")
        output["latitude"] = pd.to_numeric(df[lat_col], errors="coerce") if lat_col in df.columns else None
        output["longitude"] = pd.to_numeric(df[lon_col], errors="coerce") if lon_col in df.columns else None

        return output

    def _safe_col(self, df: pd.DataFrame, col: Optional[str], default_prefix: str = "Record") -> pd.Series:
        if col and col in df.columns:
            values = df[col].fillna("").astype(str).str.strip()
            values = values.replace("", pd.NA)
            fallback = pd.Series([f"{default_prefix} {i+1}" for i in range(len(df))])
            return values.fillna(fallback)
        return pd.Series([f"{default_prefix} {i+1}" for i in range(len(df))])

    def _safe_text_col(self, df: pd.DataFrame, col: Optional[str]) -> pd.Series:
        if col and col in df.columns:
            return df[col].fillna("").astype(str).str.strip()
        return pd.Series([""] * len(df))

    def score_grade(self, value: str) -> Optional[float]:
        if value is None:
            return None

        text = str(value).strip().upper()
        if text in MISSING_GRADE_VALUES:
            return None

        if text in GRADE_MAP:
            return GRADE_MAP[text]

        if len(text) == 1 and text in GRADE_MAP:
            return GRADE_MAP[text]

        return None

    def score_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        scored = df.copy()

        grade_cols = [
            "overall",
            "forest_cover",
            "forest_interior",
            "riparian",
            "water_quality",
            "benthic",
            "e_coli",
            "phosphorus",
        ]

        for col in grade_cols:
            score_col = f"{col}_score"
            scored[score_col] = scored[col].apply(self.score_grade)

        score_columns = [f"{c}_score" for c in grade_cols if f"{c}_score" in scored.columns]

        def combined_score(row):
            vals = [row[c] for c in score_columns if pd.notna(row[c])]
            if not vals:
                return None
            return round(sum(vals) / len(vals), 2)

        scored["combined_score"] = scored.apply(combined_score, axis=1)
        return scored

    def compute_insights(self, df: pd.DataFrame) -> Dict:
        category_map = {
            "overall": "Overall",
            "forest_cover": "Forest Cover",
            "forest_interior": "Forest Interior",
            "riparian": "Riparian",
            "water_quality": "Water Quality",
            "benthic": "Benthic",
            "e_coli": "E. coli",
            "phosphorus": "Phosphorus",
        }

        category_averages = {}
        missing_counts = {}

        for raw_col, display_name in category_map.items():
            score_col = f"{raw_col}_score"
            vals = [v for v in df[score_col].tolist() if pd.notna(v)] if score_col in df.columns else []
            category_averages[display_name] = round(sum(vals) / len(vals), 2) if vals else None
            missing_counts[display_name] = int(df[score_col].isna().sum()) if score_col in df.columns else len(df)

        valid_categories = {k: v for k, v in category_averages.items() if v is not None}
        strongest_category = max(valid_categories, key=valid_categories.get) if valid_categories else "Unknown"
        weakest_category = min(valid_categories, key=valid_categories.get) if valid_categories else "Unknown"

        valid_rows = df[df["combined_score"].notna()].copy()
        valid_rows = valid_rows.sort_values("combined_score", ascending=False)

        top_areas = []
        bottom_areas = []

        for _, row in valid_rows.head(5).iterrows():
            top_areas.append({
                "name": row["area_name"],
                "combined_score": row["combined_score"],
            })

        for _, row in valid_rows.sort_values("combined_score", ascending=True).head(5).iterrows():
            bottom_areas.append({
                "name": row["area_name"],
                "combined_score": row["combined_score"],
            })

        priority_areas = self.build_priority_areas(df)

        total_records = len(df)
        flagged_count = len(priority_areas)

        overall_profile = self._overall_profile_from_average(valid_categories)

        return {
            "total_records": total_records,
            "category_averages": category_averages,
            "missing_counts": missing_counts,
            "strongest_category": strongest_category,
            "weakest_category": weakest_category,
            "top_areas": top_areas,
            "bottom_areas": bottom_areas,
            "priority_areas": priority_areas,
            "flagged_count": flagged_count,
            "overall_profile": overall_profile,
        }

    def build_priority_areas(self, df: pd.DataFrame) -> List[Dict]:
        priority = []

        for _, row in df.iterrows():
            issues = []

            if pd.notna(row.get("forest_cover_score")) and row["forest_cover_score"] <= 1:
                issues.append("Low forest cover")

            if pd.notna(row.get("forest_interior_score")) and row["forest_interior_score"] <= 1:
                issues.append("Weak interior forest condition")

            if pd.notna(row.get("riparian_score")) and row["riparian_score"] <= 1:
                issues.append("Riparian weakness")

            if pd.notna(row.get("water_quality_score")) and row["water_quality_score"] <= 1:
                issues.append("Poor water quality")

            if pd.notna(row.get("e_coli_score")) and row["e_coli_score"] <= 1:
                issues.append("High E. coli concern")

            if pd.notna(row.get("phosphorus_score")) and row["phosphorus_score"] <= 1:
                issues.append("Phosphorus concern")

            if pd.notna(row.get("benthic_score")) and row["benthic_score"] <= 1:
                issues.append("Benthic concern")

            missing_count = 0
            for col in [
                "overall_score",
                "forest_cover_score",
                "forest_interior_score",
                "riparian_score",
                "water_quality_score",
                "benthic_score",
                "e_coli_score",
                "phosphorus_score",
            ]:
                if col in row and pd.isna(row[col]):
                    missing_count += 1

            if missing_count >= 4:
                issues.append("Insufficient monitoring coverage")

            if len(issues) >= 3:
                issues.append("Multiple weak indicators")

            if issues:
                risk_score = self._compute_risk_score(row, issues)
                actions = self._issues_to_actions(issues)

                priority.append({
                    "name": row["area_name"],
                    "risk_score": round(risk_score, 2),
                    "issues": issues,
                    "actions": actions,
                    "combined_score": row.get("combined_score"),
                })

        priority = sorted(priority, key=lambda x: (-x["risk_score"], x["name"]))
        return priority[:10]

    def _compute_risk_score(self, row, issues: List[str]) -> float:
        score = 0.0

        weak_cols = [
            "forest_cover_score",
            "forest_interior_score",
            "riparian_score",
            "water_quality_score",
            "benthic_score",
            "e_coli_score",
            "phosphorus_score",
        ]

        for col in weak_cols:
            val = row.get(col)
            if pd.notna(val):
                score += max(0, 4 - float(val))

        score += len(issues) * 0.75
        return score

    def _issues_to_actions(self, issues: List[str]) -> List[str]:
        actions = []
        for issue in issues:
            action = self.issue_actions.get(issue)
            if action and action not in actions:
                actions.append(action)
        return actions

    def _overall_profile_from_average(self, valid_categories: Dict[str, float]) -> str:
        if not valid_categories:
            return "Insufficient Data"

        avg = sum(valid_categories.values()) / len(valid_categories)

        if avg >= 3.25:
            return "Strong"
        if avg >= 2.25:
            return "Moderate"
        if avg >= 1.25:
            return "Needs Attention"
        return "High Concern"

    def generate_summaries(self, insights: Dict, file_meta: Dict) -> Dict[str, str]:
        total = insights["total_records"]
        strongest = insights["strongest_category"]
        weakest = insights["weakest_category"]
        profile = insights["overall_profile"]
        flagged = insights["flagged_count"]

        top_names = ", ".join([x["name"] for x in insights["top_areas"][:3]]) or "No clear top areas"
        priority_names = ", ".join([x["name"] for x in insights["priority_areas"][:3]]) or "No priority areas detected"

        analyst = (
            f"EcoLens processed {total} records from the uploaded {file_meta['source_type']} dataset. "
            f"The overall environmental profile is currently rated as {profile}. "
            f"The strongest average indicator is {strongest}, while the weakest is {weakest}. "
            f"{flagged} areas were flagged for closer review based on weak or missing indicator performance. "
            f"Top-performing areas include {top_names}. Highest-priority areas currently include {priority_names}."
        )

        employee = (
            f"This upload contains {total} environmental records. "
            f"From a staff perspective, the main takeaway is that the dataset shows a {profile.lower()} overall picture. "
            f"{strongest} appears to be the strongest part of the dataset, while {weakest} needs the most attention. "
            f"EcoLens flagged {flagged} areas that may deserve follow-up, planning discussion, or additional review. "
            f"The first areas to look at are {priority_names}."
        )

        enthusiast = (
            f"EcoLens reviewed {total} environmental records and turned them into a simpler picture of what is going well and what may need care. "
            f"The strongest part of the dataset is {strongest}, while the weakest is {weakest}. "
            f"Several areas may need closer attention, especially {priority_names}. "
            f"This helps make technical conservation data easier to understand for broader audiences."
        )

        return {
            "analyst": analyst,
            "employee": employee,
            "enthusiast": enthusiast,
        }

    def build_chart_payload(self, insights: Dict) -> Dict:
        category_labels = []
        category_values = []

        for k, v in insights["category_averages"].items():
            if v is not None:
                category_labels.append(k)
                category_values.append(v)

        priority_labels = [x["name"] for x in insights["priority_areas"][:5]]
        priority_scores = [x["risk_score"] for x in insights["priority_areas"][:5]]

        return {
            "category_chart": {
                "labels": category_labels,
                "values": category_values,
            },
            "priority_chart": {
                "labels": priority_labels,
                "values": priority_scores,
            }
        }

    def build_table_preview(self, df: pd.DataFrame) -> List[Dict]:
        preview_cols = [
            "area_name",
            "overall",
            "forest_cover",
            "forest_interior",
            "riparian",
            "water_quality",
            "benthic",
            "e_coli",
            "phosphorus",
        ]

        usable_cols = [c for c in preview_cols if c in df.columns]
        preview_df = df[usable_cols].head(8).fillna("")

        return preview_df.to_dict(orient="records")