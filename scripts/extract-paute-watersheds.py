#!/usr/bin/env python3
"""Offline extraction of seven explicitly identified BasinATLAS v1.0 level-8 units.
Requires pyshp and shapely. Input: extracted official BasinATLAS_v10_lev08.shp.
No network, projection, rounding, clipping, dissolve, or simplification.
See docs/research/ecuador-watersheds-integration.md for download and hashes.
"""
import hashlib
import json
from pathlib import Path
import sys
import shapefile
from shapely.geometry import shape, mapping

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
ids = {6080270370, 6080270180, 6080269960, 6080273280, 6080273270, 6080274470, 6080274660}
# Verify exact original input, not a renamed alternate dataset or projection.
expected = {
    '.shp': 'bcb58c63b2aee54b3fd772acabb929648f879f000235e122a72376fb9eb5046b',
    '.dbf': '5d5bd719701fd5a4ec597a6e936321212fbe5d168c16f1a308d0d176a3c86b1d',
    '.prj': 'a02a27b1d1982c8516d83398e85a3c8b1aef1713c13ef4d84d7bde17430c07c4',
    '.shx': '0eb50b6478df955f24151ef8aa725cfe5c9029f7ea34f157d923739514a94a73',
}
for ext, checksum in expected.items():
    with source.with_suffix(ext).open('rb') as file:
        assert hashlib.file_digest(file, 'sha256').hexdigest() == checksum, ext
reader = shapefile.Reader(str(source))
features = []
for row in reader.iterShapeRecords(bbox=(-79.5, -3.4, -78.2, -2.2)):
    p = row.record.as_dict()
    if p['HYBAS_ID'] not in ids:
        continue
    geometry = shape(row.shape.__geo_interface__)
    assert geometry.is_valid
    anchor = geometry.representative_point()
    features.append({
        'type': 'Feature',
        'properties': {
            'id': str(p['HYBAS_ID']),
            'name': f"BasinATLAS {p['HYBAS_ID']}",
            'level': 8,
            'pfafId': str(p['PFAF_ID']),
            'areaKm2': p['SUB_AREA'],
            'sourceUpstreamAreaKm2': p['UP_AREA'],
            'nextDownId': str(p['NEXT_DOWN']),
            'labelLon': anchor.x,
            'labelLat': anchor.y,
        },
        'geometry': mapping(geometry),
    })
features.sort(key=lambda f: f['properties']['id'])
assert {int(f['properties']['id']) for f in features} == ids
collection = {
    'type': 'FeatureCollection',
    'provenance': {
        'product': 'BasinATLAS',
        'version': '1.0 (HydroBASINS v1c geometry)',
        'dataDate': '2019-12-07',
        'accessedAt': '2026-10-31',
        'coverage': 'Paute–Mazar–Amaluza vicinity · 7 level-8 units',
        'sourceUrl': 'https://www.hydrosheds.org/hydroatlas',
        'downloadUrl': 'https://api.figshare.com/v2/file/download/20087237',
        'archiveName': 'BasinATLAS_Data_v10_shp.zip',
        'archivePublishedMd5': 'ce5013294bdcb6f884ff6cdf1a1acae0',
        'inputSha256': expected,
        'license': 'CC BY 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'attribution': 'Linke et al. (2019) · HydroSHEDS',
        'citation': 'Linke et al. (2019), Scientific Data 6:283, doi:10.1038/s41597-019-0300-6',
        'resolution': '15 arc-second source grid (~500 m); Pfafstetter level 8',
        'crs': 'WGS84 / EPSG:4326; GeoJSON longitude, latitude',
        'processing': 'Selected seven source IDs. Original coordinates retained; no simplification, clipping, dissolve or reprojection. Shapefile rings converted to GeoJSON with holes/multipart retained. Interior label anchors added.',
        'limits': 'Source units are not named Paute or reservoir catchments. No claim of whole Paute basin, Mazar/Amaluza catchment, upstream contribution, or hydrological modeling. Areas are source SUB_AREA, not UP_AREA.',
    },
    'features': features,
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':')) + '\n')
print(len(features), destination.stat().st_size, hashlib.sha256(destination.read_bytes()).hexdigest())
for feature in features:
    p = feature['properties']
    print(p['id'], p['areaKm2'], feature['geometry']['type'])
