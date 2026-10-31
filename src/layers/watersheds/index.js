import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { containsPoint, groupContainedPoints } from './geometry.js';
import { validateWatershedCollection } from './model.js';

const ID = 'watersheds';
const COLOR = '#38bdf8';
const SELECTED = '#facc15';
function hierarchy(rings) {
  return new Cesium.PolygonHierarchy(
    Cesium.Cartesian3.fromDegreesArray(rings[0].flat()),
    rings
      .slice(1)
      .map(
        (ring) =>
          new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(ring.flat()),
          ),
      ),
  );
}
/** One independent geographic selection, retained when other layers are picked.
 * Manager schedules updates; this controller never starts provider polling. */
export function createWatershedLayer({
  source,
  overlayHost,
  picking,
  pointer,
  handlerFactory,
  getPointGroups = () => [],
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Watershed source required');
  let viewer,
    data,
    enabled = false,
    destroyed = false,
    collection,
    request,
    selectedId = null,
    handler,
    listener,
    error = null;
  const selected = () =>
    collection?.features.find((f) => f.properties.id === selectedId);
  const membership = (feature) =>
    groupContainedPoints(feature.geometry, getPointGroups());
  function selectionDetails(feature) {
    const p = feature.properties,
      provenance = collection.provenance;
    const groups = membership(feature);
    const documented = groups
      .filter((g) => g.id === 'ecuador-energy')
      .flatMap((g) => g.unknown)
      .filter((r) => r.documentedContext)
      .slice(0, 3);
    const details = [
      `${provenance.product} · ${t('Level {level}', { level: p.level })} · ${p.id}`,
      `${p.areaKm2} km² · ${t('Local unit area; not total upstream area')}`,
      `${provenance.version} · ${provenance.dataDate} · ${provenance.resolution}`,
      `${provenance.attribution} · ${provenance.license}`,
      t(
        'Geographic containment only; no upstream contribution or rainfall estimate',
      ),
      ...groups.map((group) =>
        t('{group}: {state} · {inside} inside · {unknown} unknown', {
          group:
            group.id === 'weather-stations'
              ? t('Weather stations')
              : t('Ecuador hydro & grid'),
          state:
            group.state === 'off'
              ? t('OFF')
              : group.state === 'not-loaded'
                ? t('Not loaded')
                : group.state === 'unavailable'
                  ? t('Unavailable')
                  : t('Loaded'),
          inside: group.contained.length,
          unknown: group.unknown.length,
        }),
      ),
      ...groups.flatMap((group) =>
        group.contained
          .slice(0, 8)
          .map(
            (r) =>
              `${r.name || r.stationId || r.id}${r.locationRole ? ` · ${r.locationRole}` : ''}${r.basin ? ` · ${r.basin}` : ''}`,
          ),
      ),
      ...(documented.length
        ? [
            t('Catalog relationships; coordinates unverified'),
            ...documented.map((r) => `${r.name} · ${r.documentedContext}`),
          ]
        : []),
      t(
        'Reservoir locations unavailable; plant points are not reservoir locations',
      ),
      t('Click the selected unit again to deselect'),
    ];
    // Canvas cards do not wrap text. Keep a bounded readable width, including
    // translations without spaces, while retaining every provenance line.
    return details.flatMap((line) => {
      const lines = [];
      let rest = line;
      while (rest.length > 64) {
        const gap = rest.lastIndexOf(' ', 64);
        const end = gap > 32 ? gap : 64;
        lines.push(rest.slice(0, end));
        rest = rest.slice(end).trimStart();
      }
      return [...lines, rest];
    });
  }
  function showSelected() {
    if (!enabled) {
      overlayHost?.clearSource('watershed-selection');
      return;
    }
    const feature = selected();
    overlayHost?.setEntries(
      'watershed-selection',
      feature
        ? [
            {
              id: `watershed-card:${selectedId}`,
              position: Cesium.Cartesian3.fromDegrees(
                feature.properties.labelLon,
                feature.properties.labelLat,
              ),
              selected: true,
              interactive: false,
              title: feature.properties.name,
              details: selectionDetails(feature),
              accent: SELECTED,
              priority: Number.MAX_SAFE_INTEGER,
              gapPx: 18,
              verticalOnly: true,
              placement: 'above',
            },
          ]
        : [],
      { cohortLimit: 1, collisionCapacity: 1, moving: false },
    );
    overlayHost?.setVisible('watershed-selection', enabled);
  }
  function restyle() {
    for (const entity of data?.entities.values || []) {
      const isSelected =
        entity.properties.watershedId.getValue() === selectedId;
      const color = Cesium.Color.fromCssColorString(
        isSelected ? SELECTED : COLOR,
      );
      if (entity.polygon)
        entity.polygon.material = color.withAlpha(isSelected ? 0.24 : 0.07);
      if (entity.polyline) {
        entity.polyline.material = color;
        entity.polyline.width = isSelected ? 4 : 2;
      }
    }
    showSelected();
    viewer?.scene?.requestRender?.();
    listener?.();
  }
  function render() {
    data.entities.removeAll();
    for (const feature of collection.features) {
      const p = feature.properties;
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      polygons.forEach((rings, part) => {
        const properties = { watershedId: p.id };
        data.entities.add({
          id: `${ID}:${p.id}:${part}:fill`,
          name: p.name,
          properties,
          polygon: {
            hierarchy: hierarchy(rings),
            material: Cesium.Color.fromCssColorString(COLOR).withAlpha(0.07),
            classificationType: Cesium.ClassificationType.BOTH,
          },
        });
        rings.forEach((ring, index) =>
          data.entities.add({
            id: `${ID}:${p.id}:${part}:ring:${index}`,
            name: p.name,
            properties,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
              clampToGround: true,
              width: 2,
              material: Cesium.Color.fromCssColorString(COLOR),
            },
          }),
        );
      });
    }
    restyle();
  }
  const layer = {
    id: ID,
    name: 'Watershed units',
    icon: '♧',
    source: 'BasinATLAS · HydroSHEDS',
    updateInterval: 30_000,
    init(v) {
      if (destroyed || data)
        throw new Error('Watershed layer already initialized/destroyed');
      viewer = v;
      data = new Cesium.CustomDataSource(ID);
      data.show = false;
      viewer.dataSources.add(data);
    },
    enable() {
      if (destroyed) return;
      enabled = true;
      if (data) data.show = true;
      picking?.registerPickOwner(ID, (id) => id.startsWith(`${ID}:`));
      if (!handler && viewer && handlerFactory) {
        handler = handlerFactory(viewer);
        handler.setInputAction((click) => {
          if (!enabled || (pointer && !pointer.isPointerFree())) return;
          const id = picking?.resolvePickId(viewer.scene.pick(click.position));
          if (!id?.startsWith(`${ID}:`)) return; // independent selection survives station/plant/map picks
          const featureId = data.entities
            .getById(id)
            ?.properties.watershedId.getValue();
          if (featureId)
            layer.selectBasin(featureId === selectedId ? null : featureId);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
      showSelected();
    },
    disable() {
      enabled = false;
      request?.abort();
      request = null;
      selectedId = null;
      handler?.destroy();
      handler = null;
      picking?.unregisterPickOwner(ID);
      overlayHost?.clearSource('watershed-selection');
      if (data) data.show = false;
      restyle();
    },
    async update() {
      if (!enabled || !data || destroyed) return false;
      if (collection) {
        showSelected();
        listener?.();
        return true;
      }
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const snapshot = validateWatershedCollection(
          await source.getSnapshot({ signal: current.signal }),
        );
        if (
          !enabled ||
          current.signal.aborted ||
          request !== current ||
          destroyed
        )
          return false;
        collection = snapshot;
        error = null;
        render();
        return true;
      } catch (cause) {
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        error = t('Watershed data unavailable');
        listener?.();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },
    selectBasin(id) {
      if (
        !enabled ||
        (id !== null &&
          !collection?.features.some((f) => f.properties.id === id))
      )
        return false;
      selectedId = id;
      restyle();
      return true;
    },
    getPointMembership(record) {
      const state = !enabled
        ? 'off'
        : error
          ? 'unavailable'
          : !collection
            ? 'not-loaded'
            : 'loaded';
      return {
        state,
        units:
          state === 'loaded' && record.coordinatesVerified === true
            ? collection.features
                .filter(
                  (f) =>
                    containsPoint(f.geometry, record.lon, record.lat) === true,
                )
                .map((f) => ({ ...f.properties }))
            : [],
      };
    },
    getSelection() {
      const feature = selected();
      return enabled && feature
        ? {
            ...feature.properties,
            provenance: collection.provenance,
            groups: membership(feature),
            relationship: 'geographic-containment-only',
            reservoirLocations: 'unavailable',
          }
        : null;
    },
    getRowControls() {
      return {
        readout: false,
        info:
          error ||
          (collection
            ? `${collection.provenance.product} · ${collection.provenance.license} · ${t('{count} units · click polygon to select', { count: collection.features.length })}`
            : t('Not loaded')),
        summary: {
          label: t('Watershed units'),
          coverage: collection?.provenance.coverage || null,
          detail: t(
            'Geographic containment only; no upstream contribution or rainfall estimate',
          ),
          status:
            error ||
            (collection
              ? t('{count} units · click polygon to select', {
                  count: collection.features.length,
                })
              : t('Not loaded')),
        },
        legend: [
          { color: COLOR, label: t('Watershed units') },
          { color: SELECTED, label: t('Selected unit') },
        ],
        legendCategorical: true,
      };
    },
    setRowControlsListener(fn) {
      listener = fn;
    },
    getAnalystRecords(max = 64) {
      if (!enabled || !collection) return [];
      return collection.features
        .slice(0, Math.max(0, Math.min(64, Math.floor(Number(max) || 0))))
        .map((f) => ({
          ...f.properties,
          lat: f.properties.labelLat,
          lon: f.properties.labelLon,
          selected: f.properties.id === selectedId,
          source: collection.provenance.sourceUrl,
          provenance: collection.provenance,
          relationship: 'geographic-containment-only',
          ...(f.properties.id === selectedId
            ? { membership: membership(f) }
            : {}),
        }));
    },
    getStats() {
      return {
        count: collection?.features.length || 0,
        error,
        source: collection?.provenance.product || 'BasinATLAS',
        coverage: collection?.provenance.coverage || null,
        selectedId,
        dataDate: collection?.provenance.dataDate || null,
      };
    },
    destroy() {
      layer.disable();
      destroyed = true;
      if (data) viewer?.dataSources.remove(data, true);
      viewer = null;
      data = null;
      collection = null;
      listener = null;
    },
  };
  return layer;
}
