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


# ============================================================
# 2. SIMPLIFY (Douglas-Peucker)
# ============================================================
#
# Douglas-Peucker in one paragraph:
#   Draw a straight line from the first point of a boundary to the last.
#   Find the point that is furthest from that line. If it is closer than the
#   tolerance, every point in between can be dropped - the straight line is a
#   good enough drawing. Otherwise keep that point and repeat on the two
#   halves. The result keeps the corners that define the shape and drops the
#   thousands of tiny wiggles you cannot see on screen.
#
# The old simplifier just skipped points that were close to the previous
# point. That removes the wrong points (it keeps wiggles, drops corners when
# vertices are dense) and has no guarantee about how far the shape moves.
# Douglas-Peucker guarantees no part of the boundary moves by more than the
# tolerance.
#
# Coordinates are converted to metres first (longitude degrees are only ~73%
# as long as latitude degrees at 43.4 N), so the tolerance means the same
# thing in every direction.

def douglas_peucker_mask(points_xy, tolerance):
    """
    Return a boolean mask of points to keep.

    points_xy: numpy array of shape (n, 2), in metres.
    Iterative (no recursion limit) and vectorized with numpy.
    """

    n = len(points_xy)
    keep = np.zeros(n, dtype=bool)

    if n <= 2:
        keep[:] = True
        return keep

    keep[0] = True
    keep[-1] = True

    stack = [(0, n - 1)]

    while stack:
        start, end = stack.pop()

        if end - start < 2:
            continue

        a = points_xy[start]
        b = points_xy[end]
        segment = points_xy[start + 1:end]

        ab = b - a
        length_sq = float(ab @ ab)

        if length_sq == 0.0:
            # Closed ring: first == last. Distance is just distance to a.
            distances = np.hypot(
                segment[:, 0] - a[0], segment[:, 1] - a[1]
            )
        else:
            # Distance from each point to the segment a-b.
            t = ((segment - a) @ ab) / length_sq
            t = np.clip(t, 0.0, 1.0)
            projection = a + np.outer(t, ab)
            delta = segment - projection
            distances = np.hypot(delta[:, 0], delta[:, 1])

        index = int(np.argmax(distances))

        if distances[index] > tolerance:
            split = start + 1 + index
            keep[split] = True
            stack.append((start, split))
            stack.append((split, end))

    return keep


def simplify_ring(ring, tolerance_metres, decimals=COORDINATE_DECIMALS):
    """
    Simplify one closed polygon ring.

    Returns a new ring (list of [lon, lat]) or None if the ring collapses
    below 4 points (meaning it is smaller than the tolerance).
    """

    if not ring or len(ring) < 4:
        return ring

    coords = np.asarray([p[:2] for p in ring], dtype=float)

    mean_lat = float(np.mean(coords[:, 1]))
    x_scale = METRES_PER_DEGREE_LON_AT_EQUATOR * np.cos(np.radians(mean_lat))

    xy = np.column_stack((
        coords[:, 0] * x_scale,
        coords[:, 1] * METRES_PER_DEGREE_LAT,
    ))

    keep = douglas_peucker_mask(xy, tolerance_metres)
    kept = np.round(coords[keep], decimals)

    # Remove consecutive duplicates created by rounding.
    if len(kept) > 1:
        changed = np.any(np.diff(kept, axis=0) != 0, axis=1)
        kept = kept[np.concatenate(([True], changed))]

    # Keep the ring closed.
    if len(kept) and not np.array_equal(kept[0], kept[-1]):
        kept = np.vstack((kept, kept[0]))

    if len(kept) < 4:
        return None

    return kept.tolist()


def simplify_polygon(rings, tolerance_metres):
    """Polygon = [outer ring, hole, hole, ...]."""

    if not rings:
        return rings

    result = []

    for index, ring in enumerate(rings):
        simplified = simplify_ring(ring, tolerance_metres)

        if simplified is None:
            if index == 0:
                # Never lose a watershed's outer boundary.
                simplified = [
                    [round(p[0], COORDINATE_DECIMALS),
                     round(p[1], COORDINATE_DECIMALS)]
                    for p in ring
                ]
            else:
                # Hole smaller than the tolerance: invisible, drop it.
                continue

        result.append(simplified)

    return result


def count_vertices(geometry):
    if not geometry:
        return 0

    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []

    if kind == "Polygon":
        return sum(len(ring) for ring in coords)

    if kind == "MultiPolygon":
        return sum(len(ring) for polygon in coords for ring in polygon)

    return 0


def simplify_geometry(geometry, tolerance_metres):
    if not geometry:
        return geometry

    kind = geometry.get("type")
    coords = geometry.get("coordinates")

    if kind == "Polygon":
        return {"type": "Polygon",
                "coordinates": simplify_polygon(coords, tolerance_metres)}

    if kind == "MultiPolygon":
        polygons = [
            simplify_polygon(polygon, tolerance_metres)
            for polygon in coords
        ]
        return {"type": "MultiPolygon",
                "coordinates": [p for p in polygons if p]}

    return geometry


def simplify_feature_collection(geojson, tolerance_metres=SIMPLIFY_TOLERANCE_METRES):
    """Simplify every feature in place. Returns (before, after) vertex counts."""

    before = 0
    after = 0

    for feature in geojson.get("features", []):
        geometry = feature.get("geometry")
        before += count_vertices(geometry)
        feature["geometry"] = simplify_geometry(geometry, tolerance_metres)
        after += count_vertices(feature["geometry"])

    return before, after


# ============================================================
# 3. SNAPSHOT (offline fallback)
# ============================================================

def write_snapshot(geojson):
    """
    Save the simplified (unscored) GeoJSON so EcoLens still works if ArcGIS is
    unavailable. Works locally; silently skipped on read-only hosts (Vercel).
    """

    try:
        temporary = SNAPSHOT_PATH + ".tmp"
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(geojson, handle, separators=(",", ":"))
        os.replace(temporary, SNAPSHOT_PATH)
        return True
    except OSError:
        return False


def read_snapshot():
    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as handle:
        geojson = json.load(handle)

    validate_feature_collection(geojson)
    return geojson


def snapshot_age_text():
    try:
        modified = os.path.getmtime(SNAPSHOT_PATH)
    except OSError:
        return None

    return time.strftime("%Y-%m-%d %H:%M", time.localtime(modified))


