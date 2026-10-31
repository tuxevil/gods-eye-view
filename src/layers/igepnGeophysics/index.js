import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { installCompactClusterBadges } from '../clusterBadges.js';
import { igepnRecordColor } from './model.js';

export * from './model.js';
export { createIgepnGeophysicsSource } from './source.js';

const escapeHtml = (value) =>
  String(value ?? 'Unavailable').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch],
  );

const formatMetric = (value, unit = '', digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : `${Number(value.toFixed(digits))}${unit ? ` ${unit}` : ''}`;

const dateLabel = (record) =>
  record.observedECT ||
  (record.observedAt ? `${record.observedAt} UTC` : 'Unavailable');

export function eventDescription(record, stale) {
  const volcanic = record.recordType === 'volcanic_quake';
  const rows = [
    [
      'Record type',
      volcanic ? 'Volcanic seismic signal' : 'Tectonic earthquake',
    ],
    ['Event code', record.eventCode],
    ...(volcanic ? [['Volcano', record.volcanoName]] : []),
    ...(volcanic ? [['Signal type', record.signalLabel]] : []),
    [
      volcanic ? 'Mean magnitude' : 'Magnitude',
      record.magnitude === null
        ? 'Unavailable'
        : `${formatMetric(record.magnitude)} ${record.magnitudeType || ''}`,
    ],
    ['Depth', formatMetric(record.depthKm, 'km', 2)],
    ['Observed (Ecuador time)', dateLabel(record)],
    ['Observed (UTC)', record.observedAt],
    ...(record.updatedAt
      ? [['IGEPN record modified (UTC)', record.updatedAt]]
      : []),
    ['Stations used', record.stationsUsed],
    ['Phases used', record.phasesUsed],
    ['Snapshot state', stale ? 'STALE CACHED DATA' : 'Latest source snapshot'],
    ['Source', record.sourceUrl],
  ];
  return `<h3>${escapeHtml(volcanic ? `${record.volcanoName} · ${record.signalType}` : `Earthquake M${record.magnitude}`)}</h3><table>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join(
      '',
    )}</table><p>Seismic observation only; not an eruption forecast, volcano alert level, or official emergency instruction.</p>`;
}

export function volcanoDescription(
  volcano,
  stale,
  catalogError,
  volcanicError = false,
  catalogSource = null,
) {
  const rows = [
    ['IGEPN edifice catalog', volcano.catalogName || volcano.name],
    [
      'Catalog vintage',
      `${volcano.catalogVintage ?? 'Unavailable'} (not current activity)`,
    ],
    ['Province / region', volcano.province],
    ['Elevation', formatMetric(volcano.elevationM, 'm', 0)],
    [
      'Eruptive class code (catalog)',
      volcano.eruptiveClass === null
        ? 'Unavailable'
        : `Class ${volcano.eruptiveClass} (catalog classification; not current alert state)`,
    ],
    [
      'Catalog match',
      catalogError
        ? 'Unavailable'
        : volcano.catalogListed
          ? 'Listed'
          : 'Not matched',
    ],
    [
      'Volcanic seismic events in 7 d',
      volcanicError ? 'Unavailable' : volcano.events7d,
    ],
    [
      'Volcanic seismic events in 30 d',
      volcanicError ? 'Unavailable' : volcano.events30d,
    ],
    [
      'Volcanic seismic events in 90 d',
      volcanicError ? 'Unavailable' : volcano.events90d,
    ],
    [
      'VT / LP / EXP / TREMI / ND',
      volcanicError
        ? 'Unavailable'
        : `${volcano.signals.VT} / ${volcano.signals.LP} / ${volcano.signals.EXP} / ${volcano.signals.TREMI} / ${volcano.signals.ND}`,
    ],
    [
      'Largest reported magnitude (90 d)',
      volcanicError ? 'Unavailable' : formatMetric(volcano.maxMagnitude),
    ],
    [
      'Latest volcanic signal',
      volcanicError
        ? 'Unavailable'
        : volcano.latestSignalLabel || 'No matching event in returned window',
    ],
    [
      'Latest signal observed (Ecuador time)',
      volcanicError ? 'Unavailable' : volcano.latestEventECT,
    ],
    [
      'Latest signal observed (UTC)',
      volcanicError ? 'Unavailable' : volcano.latestEventAt,
    ],
    ['Snapshot state', stale ? 'STALE CACHED DATA' : 'Latest source snapshot'],
    ['Catalog source', catalogSource || volcano.source],
    ['Signal source', volcano.sourceUrl],
  ];
  return `<h3>${escapeHtml(volcano.name)}</h3><p>Volcano-edifice catalogue data and instrumental seismicity are separate observations. Seismic signals do not by themselves indicate an eruption or alert level.</p><table>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;
}

function eventKey(event) {
  return `${event.recordType}:${event.id}`;
}

function addPointEntity(
  data,
  id,
  label,
  lat,
  lon,
  color,
  pixelSize,
  description,
  properties,
) {
  data.entities.add({
    id,
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    description,
    point: {
      pixelSize,
      color: Cesium.Color.fromCssColorString(color),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 1.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
        0,
        16_000_000,
      ),
    },
    properties,
  });
}

/** Manager owns the refresh schedule; this layer owns IGEPN display and picks. */
export function createIgepnGeophysicsLayer({
  source,
  overlayHost,
  picking,
  pointer,
  handlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('IGEPN geophysics snapshot source required');
  }

  let viewer = null;
  let data = null;
  let enabled = false;
  let request = null;
  let volcanoes = [];
  let tectonicQuakes = [];
  let volcanicQuakes = [];
  let summary = null;
  let sources = null;
  let stale = false;
  let errors = {
    tectonicError: false,
    volcanicError: false,
    catalogError: false,
  };
  let lastUpdate = null;
  let error = null;
  let listener = null;
  let clickHandler = null;
  let selectedId = null;
  let removeClusterStyling = null;

  function getRecord(id) {
    if (id?.startsWith('volcano:')) {
      return volcanoes.find((record) => `volcano:${record.id}` === id) || null;
    }
    return (
      [...tectonicQuakes, ...volcanicQuakes].find(
        (record) => eventKey(record) === id,
      ) || null
    );
  }

  function showSelected() {
    const record = getRecord(selectedId);
    const volcanicEvent = record?.recordType === 'volcanic_quake';
    const event = record?.recordType === 'tectonic_quake' || volcanicEvent;
    const title = !record
      ? ''
      : event
        ? volcanicEvent
          ? `${record.volcanoName} · ${record.signalType}`
          : `Earthquake M${record.magnitude}`
        : record.name;
    const details = !record
      ? []
      : event
        ? [
            volcanicEvent
              ? 'IGEPN volcanic seismic signal'
              : 'IGEPN tectonic earthquake',
            `${dateLabel(record)} · ${record.observedAt || 'UTC time unavailable'}`,
            `${volcanicEvent ? `${record.signalType} · ` : ''}M${formatMetric(record.magnitude)} · depth ${formatMetric(record.depthKm, 'km', 2)}`,
            `Stations ${record.stationsUsed ?? 'Unavailable'} · phases ${record.phasesUsed ?? 'Unavailable'} · ${stale ? 'STALE' : 'latest snapshot'}`,
            'Observation only; not an eruption forecast, alert level, or emergency instruction.',
          ]
        : [
            `${record.province} · elevation ${formatMetric(record.elevationM, 'm', 0)}`,
            `Volcanic signals in 7 / 30 / 90 days: ${record.events7d} / ${record.events30d} / ${record.events90d}`,
            `Latest signal: ${record.latestSignalLabel || 'Unavailable'} · ${record.latestEventECT || 'date unavailable'}`,
            `Snapshot: ${stale ? 'STALE' : 'latest source snapshot'}; catalog and signals are separate data`,
            'Volcanic seismic signal is not a current eruption/alert status.',
          ];
    overlayHost?.setEntries(
      'igepn-geophysics-selection',
      record
        ? [
            {
              id: `igepn-card:${selectedId}`,
              position: Cesium.Cartesian3.fromDegrees(record.lon, record.lat),
              selected: true,
              interactive: false,
              title,
              details,
              accent: igepnRecordColor(record, stale),
              priority: Number.MAX_SAFE_INTEGER,
              gapPx: 18,
              verticalOnly: true,
              placement: 'above',
            },
          ]
        : [],
      { cohortLimit: 1, collisionCapacity: 1, moving: false },
    );
    overlayHost?.setVisible('igepn-geophysics-selection', enabled);
  }

  function render() {
    if (!data) return;
    data.entities.removeAll();
    const recordsById = new Map();

    for (const volcano of volcanoes) {
      if (!Number.isFinite(volcano.lat) || !Number.isFinite(volcano.lon)) {
        continue;
      }
      const id = `volcano:${volcano.id}`;
      const record = { ...volcano, recordType: 'volcano' };
      recordsById.set(id, record);
      addPointEntity(
        data,
        `igepn-geophysics:${id}`,
        `Volcano · ${volcano.name}`,
        volcano.lat,
        volcano.lon,
        igepnRecordColor(record, stale),
        13,
        volcanoDescription(
          volcano,
          stale,
          errors.catalogError,
          errors.volcanicError,
          sources?.volcanoCatalog,
        ),
        record,
      );
    }

    for (const quake of tectonicQuakes) {
      const id = eventKey(quake);
      recordsById.set(id, quake);
      const magnitude = quake.magnitude ?? 0;
      addPointEntity(
        data,
        `igepn-geophysics:${id}`,
        `Tectonic · M${magnitude.toFixed(1)} · ${quake.observedECT || ''}`,
        quake.lat,
        quake.lon,
        igepnRecordColor(quake, stale),
        Math.min(15, 5 + magnitude * 1.6),
        eventDescription(quake, stale),
        quake,
      );
    }

    for (const quake of volcanicQuakes) {
      const id = eventKey(quake);
      recordsById.set(id, quake);
      const size = quake.signalType === 'EXP' ? 12 : 8;
      addPointEntity(
        data,
        `igepn-geophysics:${id}`,
        `${quake.volcanoName} · ${quake.signalType} · ${quake.observedECT || ''}`,
        quake.lat,
        quake.lon,
        igepnRecordColor(quake, stale),
        size,
        eventDescription(quake, stale),
        quake,
      );
    }

    const volcanoLabels = volcanoes
      .filter(
        (volcano) =>
          volcano.events30d > 0 &&
          Number.isFinite(volcano.lat) &&
          Number.isFinite(volcano.lon),
      )
      .sort((a, b) => b.events30d - a.events30d || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((volcano) => ({
        id: `volcano:${volcano.id}`,
        position: Cesium.Cartesian3.fromDegrees(volcano.lon, volcano.lat),
        variant: 'label',
        title: t('{name} · {count} signals / 30d', {
          name: volcano.name,
          count: volcano.events30d,
        }),
        accent: igepnRecordColor(volcano, stale),
        priority: 3,
        collisionGroup: 'ambient-label',
        paintLane: 'ambient-label',
        interactive: false,
        edgeFade: 'keyhole',
        horizonCull: true,
        terrainOcclusion: false,
        gapPx: 14,
        verticalOnly: true,
        placement: 'above',
      }));
    overlayHost?.setEntries('igepn-geophysics', volcanoLabels, {
      cohortLimit: 10,
      collisionCapacity: 20,
      moving: false,
    });
    overlayHost?.setVisible('igepn-geophysics', enabled);
    showSelected();
    listener?.();
    return recordsById;
  }

  const layer = {
    id: 'igepn-geophysics',
    name: 'IGEPN seismic & volcanoes (Ecuador)',
    icon: '🌋',
    source: 'IGEPN · Sismicidad tectónica y volcánica',
    updateInterval: 300_000,
    init(v) {
      if (data) throw new Error('IGEPN geophysics layer already initialized');
      viewer = v;
      data = new Cesium.CustomDataSource('igepn-geophysics');
      data.show = false;
      data.clustering.enabled = true;
      data.clustering.pixelRange = 34;
      data.clustering.minimumClusterSize = 4;
      removeClusterStyling = installCompactClusterBadges(data, '#c084fc');
      viewer.dataSources.add(data);
      overlayHost?.setVisible('igepn-geophysics', false);
    },
    enable() {
      enabled = true;
      if (data) data.show = true;
      picking?.registerPickOwner('igepn-geophysics', (id) =>
        id.startsWith('igepn-geophysics:'),
      );
      if (!clickHandler && handlerFactory && viewer) {
        clickHandler = handlerFactory(viewer);
        clickHandler.setInputAction((click) => {
          if (pointer && !pointer.isPointerFree()) return;
          const picked = viewer.scene.pick(click.position);
          const id = picking?.resolvePickId(picked);
          if (id?.startsWith('igepn-geophysics:')) {
            layer.selectRecord(id.slice('igepn-geophysics:'.length));
          } else if (
            !picked ||
            (id && picking?.isOwnedByOtherLayer('igepn-geophysics', id))
          ) {
            layer.selectRecord(null);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    },
    disable() {
      enabled = false;
      request?.abort();
      request = null;
      clickHandler?.destroy();
      clickHandler = null;
      picking?.unregisterPickOwner('igepn-geophysics');
      overlayHost?.clearSource('igepn-geophysics');
      overlayHost?.clearSource('igepn-geophysics-selection');
      selectedId = null;
      if (data) data.show = false;
    },
    async update() {
      if (!enabled || !data) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const snapshot = await source.getSnapshot({ signal: current.signal });
        if (current.signal.aborted || request !== current || !enabled) {
          return false;
        }
        volcanoes = Array.isArray(snapshot.volcanoes) ? snapshot.volcanoes : [];
        tectonicQuakes = Array.isArray(snapshot.tectonicQuakes)
          ? snapshot.tectonicQuakes
          : [];
        volcanicQuakes = Array.isArray(snapshot.volcanicQuakes)
          ? snapshot.volcanicQuakes
          : [];
        summary = snapshot.summary || null;
        sources = snapshot.sources || null;
        errors = {
          tectonicError: Boolean(snapshot.tectonicError),
          volcanicError: Boolean(snapshot.volcanicError),
          catalogError: Boolean(snapshot.catalogError),
        };
        stale = Boolean(snapshot.stale);
        lastUpdate = snapshot.fetchedAt || null;
        error = null;
        render();
        viewer?.scene?.requestRender?.();
        return true;
      } catch (cause) {
        if (current.signal.aborted || request !== current || !enabled) {
          return false;
        }
        stale = true;
        error = `${t('IGEPN data unavailable')}: ${cause?.message || 'unknown error'}`;
        render();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },
    selectRecord(id) {
      if (!enabled) return;
      selectedId = id;
      showSelected();
    },
    getRowControls() {
      const feedStatus = [
        errors.tectonicError ? t('IGEPN tectonic feed unavailable') : null,
        errors.volcanicError
          ? t('IGEPN volcanic seismicity feed unavailable')
          : null,
        errors.catalogError ? t('IGEPN volcano catalog unavailable') : null,
      ].filter(Boolean);
      return {
        readout: true,
        summary: {
          label: t('IGEPN seismic & volcanoes (Ecuador)'),
          coverage:
            'IGEPN tectonic earthquakes · volcanic seismic signals · volcano catalog',
          detail:
            'Observations/catalog only · not alert levels or eruption forecasts',
          status:
            error ||
            [
              stale ? t('STALE') : null,
              feedStatus.join(' · ') ||
                t(
                  '{tectonic} tectonic · {volcanic} volcanic signals · {volcanoes} catalogued',
                  {
                    tectonic: summary?.tectonicCount ?? tectonicQuakes.length,
                    volcanic: summary?.volcanicCount ?? volcanicQuakes.length,
                    volcanoes: summary?.volcanoesCatalogued ?? volcanoes.length,
                  },
                ),
            ]
              .filter(Boolean)
              .join(' · '),
          validTime: [
            snapshotTime(snapshotLatest(tectonicQuakes)),
            snapshotTime(snapshotLatest(volcanicQuakes)),
          ]
            .filter(Boolean)
            .sort()
            .at(-1),
        },
        legend: [
          { color: '#38bdf8', label: t('Tectonic earthquake') },
          { color: '#c084fc', label: t('Volcanic seismic signal') },
          { color: '#f97316', label: t('Volcanic signal observed in 30 days') },
          { color: '#eab308', label: t('Volcano edifice catalog') },
          { color: '#9ca3af', label: t('Stale / unavailable') },
        ],
        legendCategorical: true,
        unavailable: {
          tectonic: errors.tectonicError,
          volcanic: errors.volcanicError,
          volcanoCatalog: errors.catalogError,
        },
      };
    },
    setRowControlsListener(fn) {
      listener = fn;
    },
    getAnalystRecords(max = 64) {
      if (!enabled) return [];
      const cap = Math.max(0, Math.min(128, Math.floor(Number(max) || 0)));
      const events = [
        ...tectonicQuakes.filter((record) => !errors.tectonicError),
        ...volcanicQuakes.filter((record) => !errors.volcanicError),
      ].sort((a, b) => b.observedMs - a.observedMs);
      return [
        ...volcanoes.map((record) => ({
          ...record,
          ...(errors.catalogError
            ? { catalogListed: null, elevationM: null, eruptiveClass: null }
            : {}),
          ...(errors.volcanicError
            ? {
                events7d: null,
                events30d: null,
                events90d: null,
                signals: null,
                maxMagnitude: null,
                latestEventAt: null,
                latestEventMs: null,
                latestEventECT: null,
              }
            : {}),
          stale,
        })),
        ...events.map((record) => ({ ...record, stale })),
      ].slice(0, cap);
    },
    getStats() {
      const partialErrors = Object.entries(errors)
        .filter(([, unavailable]) => unavailable)
        .map(([feed]) => feed)
        .join(', ');
      return {
        count: volcanoes.length + tectonicQuakes.length + volcanicQuakes.length,
        lastUpdate: lastUpdate ? Date.parse(lastUpdate) : null,
        error:
          error ||
          (partialErrors ? `IGEPN unavailable: ${partialErrors}` : null),
        stale,
        partial: Boolean(partialErrors),
        source: 'IGEPN tectonic, volcanic and volcano-catalog ArcGIS services',
        summary,
      };
    },
    destroy(v = viewer) {
      layer.disable();
      removeClusterStyling?.();
      removeClusterStyling = null;
      if (data) v?.dataSources?.remove(data, true);
      viewer = null;
      data = null;
      volcanoes = [];
      tectonicQuakes = [];
      volcanicQuakes = [];
      summary = null;
      sources = null;
      listener = null;
    },
  };
  return layer;
}

function snapshotLatest(records) {
  return records.reduce(
    (latest, record) => Math.max(latest, record.observedMs || 0),
    0,
  );
}

function snapshotTime(ms) {
  return ms > 0 ? new Date(ms).toISOString() : null;
}
