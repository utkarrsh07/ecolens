"""
EcoLens geometry service
========================

Everything to do with getting watershed polygons from Conservation Halton's
ArcGIS service to the browser quickly.

Why this module exists (the performance diagnosis)
--------------------------------------------------
Before this module, every page view did the following:

  1. GET /            -> downloaded ALL watershed geometry from ArcGIS just to
                         read the grade attributes (and threw the shapes away)
  2. GET /api/watersheds -> downloaded ALL geometry from ArcGIS a second time
  3. Flask ran with debug=True, which makes jsonify() pretty-print. Every
     coordinate pair became 4 indented lines (~3-4x bigger response).
  4. Nothing was cached and nothing was compressed.

This module fixes that with a small pipeline that runs ONCE and is cached:

  ArcGIS (server-side generalization)
        -> Douglas-Peucker simplification (metre-based tolerance)
        -> coordinate rounding (5 decimals ~ 1 m)
        -> EcoLens scoring (callback from app.py)
        -> compact JSON  -> gzip  -> ETag
        -> in-memory cache (shared by every request)

If ArcGIS is slow or down, the last good copy is served from
data/watersheds_snapshot.geojson, which is written automatically after a
successful live fetch on your local machine.
"""

import copy
import gzip
import hashlib
import json
import os
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np


# ============================================================
# CONFIGURATION
# ============================================================

ARCGIS_QUERY_URL = (
    "https://utility.arcgis.com/usrsvcs/servers/"
    "d975ecae96a84eba81f67b44d9e33c9d/"
    "rest/services/ms-opendata/"
    "CH_WatershedReportCard_2023_SWGrading/"
    "MapServer/0/query"
)

ARCGIS_FIELDS = [
    "SUBWSHD_NAME",
    "GRADE_FC_OVERALL",
    "GRADE_FC_COVER",
    "GRADE_FC_INTERIOR",
    "GRADE_FC_RIPARIAN",
    "GRADE_SWQ_OVERALL",
    "GRADE_SWQ_BENTHIC",
    "GRADE_SWQ_ECOLI",
    "GRADE_SWQ_PHOSPH",
]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SNAPSHOT_PATH = os.path.join(
    BASE_DIR, "data", "watersheds_snapshot.geojson"
)

# How long a processed payload is reused before ArcGIS is asked again.
# The report card is a 2023 publication, so 6 hours is very conservative.
CACHE_SECONDS = int(os.environ.get("ECOLENS_CACHE_SECONDS", 6 * 60 * 60))

# ArcGIS request timeout. Kept below Vercel's function time limit so a slow
# ArcGIS response falls back to the snapshot instead of hanging the page.
ARCGIS_TIMEOUT_SECONDS = float(os.environ.get("ECOLENS_ARCGIS_TIMEOUT", 8))

# Douglas-Peucker tolerance in METRES. At the map's default zoom one screen
# pixel is ~110 m; at zoom 13 it is ~14 m. A 10 m tolerance is therefore
# below one pixel at every zoom level a watershed overview normally uses.
SIMPLIFY_TOLERANCE_METRES = float(
    os.environ.get("ECOLENS_SIMPLIFY_METRES", 10)
)

# 5 decimal places of a degree is ~1.1 m north-south, ~0.8 m east-west here.
COORDINATE_DECIMALS = 5

# Metres per degree of latitude (close enough for southern Ontario).
METRES_PER_DEGREE_LAT = 110_540.0
METRES_PER_DEGREE_LON_AT_EQUATOR = 111_320.0


# ============================================================
# 1. FETCH
# ============================================================

def fetch_arcgis_geojson(timeout=ARCGIS_TIMEOUT_SECONDS):
    """
    Download watershed polygons + grade attributes from ArcGIS.

    ArcGIS is asked to generalize geometry server-side
    (maxAllowableOffset) so we download fewer vertices in the first place.

    Returns (geojson_dict, number_of_bytes_downloaded).
    """

    params = {
        "where": "1=1",
        "outFields": ",".join(ARCGIS_FIELDS),
        "returnGeometry": "true",
        "outSR": "4326",
        "maxAllowableOffset": "0.00005",
        "geometryPrecision": "5",
        "f": "geojson",
    }

    request = Request(
        ARCGIS_QUERY_URL + "?" + urlencode(params),
        headers={
            "User-Agent": "EcoLens/1.0",
            "Accept": "application/geo+json, application/json",
            "Accept-Encoding": "gzip",
        },
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if response.headers.get("Content-Encoding", "").lower() == "gzip":
                raw = gzip.decompress(raw)
    except HTTPError as error:
        raise RuntimeError(f"ArcGIS HTTP error: {error.code}") from error
    except URLError as error:
        raise RuntimeError(
            f"Could not connect to ArcGIS: {error.reason}"
        ) from error

    try:
        geojson = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(
            "ArcGIS returned data that could not be parsed as JSON."
        ) from error

    validate_feature_collection(geojson)

    return geojson, len(raw)


def validate_feature_collection(geojson):
    if not isinstance(geojson, dict) or geojson.get("type") != "FeatureCollection":
        raise ValueError("Response was not a GeoJSON FeatureCollection.")

    if not geojson.get("features"):
        raise ValueError("GeoJSON contained zero watershed features.")


