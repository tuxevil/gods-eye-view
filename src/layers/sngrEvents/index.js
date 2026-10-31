import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { installCompactClusterBadges } from '../clusterBadges.js';
import { sngrHazardColor } from './model.js';

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

const formatMetric = (value, unit = '') =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : `${Number(value.toFixed(1))}${unit ? ` ${unit}` : ''}`;

export function sngrEventDescription(event, snapshotStale = false) {
  const impacts = event.impacts || {};
  const locationParts = [
    event.provincia,
    event.canton,
    event.parroquia,
    event.sector,
  ].filter(Boolean);
  const rows = [
    ['Event', event.evento],
    ['Cause', event.causa || 'Unavailable'],
    ['Category', event.categoria || 'Unavailable'],
    ['SNGR sequence', event.sequenceId ? `#${event.sequenceId}` : event.id],
    ['Status', event.estado || 'Unavailable'],
    ['Level', event.nivel || 'Unavailable'],
    ['Location', locationParts.join(' · ') || 'Ecuador'],
    ['Coordinates', `${event.lat.toFixed(4)}, ${event.lon.toFixed(4)}`],
    [
      'Event date (ECT)',
      `${event.eventDateECT} ${event.eventTimeECT || ''}`.trim(),
    ],
    ['Event UTC', event.eventAt || 'Unavailable'],
    ['Updated UTC', event.updatedAt || 'Unavailable'],
    [
      'Publication lag',
      Number.isFinite(event.lagDays) ? `${event.lagDays} d` : 'Unavailable',
    ],
    ['Snapshot state', snapshotStale ? 'STALE' : 'Fresh'],
    ['Affected people', String(impacts.personasAfectadas ?? 0)],
    ['Displaced / homeless', String(impacts.personasDamnificadas ?? 0)],
    ['Evacuated people', String(impacts.personasEvacuadas ?? 0)],
    [
      'Injured / fatalities',
      `${impacts.personasHeridas ?? 0} / ${impacts.personasFallecidas ?? 0}`,
    ],
    ['Affected families', String(impacts.familiasAfectadas ?? 0)],
    [
      'Homes affected / destroyed',
      `${impacts.viviendasAfectadas ?? 0} / ${impacts.viviendasDestruidas ?? 0}`,
    ],
    ['Road affected', formatMetric(impacts.viasAfectadasMetros, 'm')],
  ];
  if ((impacts.haQuemadas ?? 0) > 0) {
    rows.push(['Burned area', formatMetric(impacts.haQuemadas, 'ha')]);
  }
  if (event.descripcion) {
    rows.push(['Field summary', event.descripcion]);
  }
  if (event.fuenteInformacion) {
    rows.push(['Report source', event.fuenteInformacion]);
  }
  rows.push([
    'Source endpoint',
    event.sourceUrl || 'SNGR ArcGIS FeatureServer',
  ]);
  rows.push([
    'Scope note',
    event.scopeNote ||
      'SNGR field incident report; historical/monitored record with publication lag, not a real-time warning or susceptibility map.',
  ]);

  return `<h3>${escapeHtml(event.evento)} · ${escapeHtml(event.canton || event.provincia)}</h3><p>${escapeHtml(event.eventDateECT)} ${escapeHtml(event.eventTimeECT || '')} ECT · ${snapshotStale ? 'STALE' : 'Field incident report (not live warning)'}</p><table>${rows
    .map(
      ([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

function buildSelectionDetails(event, isStale) {
  const impacts = event.impacts || {};
  const lines = [
    `${event.provincia}${event.canton ? ` · ${event.canton}` : ''}${event.parroquia ? ` · ${event.parroquia}` : ''}`,
    `${event.eventDateECT} ${event.eventTimeECT || ''} ECT · ${event.estado || 'Reported'}${event.nivel ? ` (${event.nivel})` : ''} · ${isStale ? 'STALE' : `Lag ${event.lagDays ?? 0} d`}`,
    `SNGR ${event.sequenceId ? `#${event.sequenceId}` : event.id} · Affected: ${impacts.personasAfectadas ?? 0} people · ${impacts.viviendasAfectadas ?? 0} homes · ${impacts.viasAfectadasMetros ?? 0} m road`,
  ];
  if (event.descripcion) {
    lines.push(event.descripcion.slice(0, 140));
  }
  lines.push(
    'SNGR field incident report (REDM/EVIN); historical/monitored record, not live alert',
  );
  return lines;
}

function formatOverlayLabel(event) {
  return `${event.evento} · ${event.canton || event.provincia}`;
}

/** Manager owns scheduling. This layer owns one datasource and abortable refresh. */
export function createSngrEventsLayer({
  source,
  overlayHost,
  picking,
  pointer,
  handlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('SNGR adverse events snapshot source required');
  }
  let viewer;
  let data;
  let enabled = false;
  let request = null;
  let events = [];
  let lastUpdate = null;
  let latestEventAt = null;
  let latestLagDays = null;
  let error = null;
  let stale = false;
  let listener = null;
  let clickHandler = null;
  let selectedId = null;
  let removeClusterStyling = null;

  const showSelected = () => {
    const selected = events.find((e) => e.id === selectedId);
    const cardTitle = selected ? formatOverlayLabel(selected) : '';
    overlayHost?.setEntries(
      'sngr-events-selection',
      selected
        ? [
            {
              id: `sngr-events-card:${selected.id}`,
              position: Cesium.Cartesian3.fromDegrees(
                selected.lon,
                selected.lat,
              ),
              selected: true,
              interactive: false,
              title: cardTitle,
              details: buildSelectionDetails(selected, stale),
              accent: sngrHazardColor(selected.hazardCategory, stale),
              priority: Number.MAX_SAFE_INTEGER,
              gapPx: 18,
              verticalOnly: true,
              placement: 'above',
            },
          ]
        : [],
      { cohortLimit: 1, collisionCapacity: 1, moving: false },
    );
    overlayHost?.setVisible('sngr-events-selection', enabled);
  };

  const layer = {
    id: 'sngr-events',
    name: 'SNGR adverse events (Ecuador)',
    icon: '⚠️',
    source: 'SNGR Ecuador · REDM',
    updateInterval: 600_000,
    init(v) {
      if (data) throw new Error('SNGR events layer already initialized');
      viewer = v;
      data = new Cesium.CustomDataSource('sngr-events');
      data.show = false;
      data.clustering.enabled = true;
      data.clustering.pixelRange = 36;
      data.clustering.minimumClusterSize = 3;
      removeClusterStyling = installCompactClusterBadges(data, '#f59e0b');
      viewer.dataSources.add(data);
    },
    enable() {
      enabled = true;
      if (data) data.show = true;
      picking?.registerPickOwner('sngr-events', (id) =>
        id.startsWith('sngr-events:'),
      );
      if (!clickHandler && handlerFactory && viewer) {
        clickHandler = handlerFactory(viewer);
        clickHandler.setInputAction((click) => {
          if (pointer && !pointer.isPointerFree()) return;
          const picked = viewer.scene.pick(click.position);
          const id = picking?.resolvePickId(picked);
          if (id?.startsWith('sngr-events:')) {
            layer.selectEvent(id.slice('sngr-events:'.length));
          } else if (!picked) {
            layer.selectEvent(null);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    },
    disable() {
      enabled = false;
      overlayHost?.clearSource('sngr-events');
      overlayHost?.clearSource('sngr-events-selection');
      picking?.unregisterPickOwner('sngr-events');
      clickHandler?.destroy();
      clickHandler = null;
      selectedId = null;
      request?.abort();
      request = null;
      if (data) data.show = false;
    },
    async update() {
      if (!enabled || !data) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      try {
        const result = await source.getSnapshot({ signal: current.signal });
        if (current.signal.aborted || request !== current || !enabled) {
          return false;
        }
        events = result.events || [];
        stale = Boolean(result.stale);
        lastUpdate = result.fetchedAt ?? null;
        latestEventAt = result.latestEventAt ?? null;
        latestLagDays = result.latestLagDays ?? null;
        error =
          result.rainySeasonError && !result.nationalAdverseError
            ? t('SNGR rainy-season feed unavailable; national feed active')
            : result.nationalAdverseError && !result.rainySeasonError
              ? t('SNGR national feed unavailable; rainy-season feed active')
              : null;

        data.entities.removeAll();
        for (const ev of events) {
          data.entities.add({
            id: `sngr-events:${ev.id}`,
            name: formatOverlayLabel(ev),
            position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat),
            description: sngrEventDescription(ev, stale),
            point: {
              pixelSize: 11,
              color: Cesium.Color.fromCssColorString(
                sngrHazardColor(ev.hazardCategory, stale),
              ),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                15_000_000,
              ),
            },
            properties: ev,
          });
        }

        overlayHost?.setEntries(
          'sngr-events',
          events.slice(0, 24).map((ev) => ({
            id: ev.id,
            position: Cesium.Cartesian3.fromDegrees(ev.lon, ev.lat),
            variant: 'label',
            title: formatOverlayLabel(ev),
            accent: sngrHazardColor(ev.hazardCategory, stale),
            priority: 1,
            collisionGroup: 'ambient-label',
            paintLane: 'ambient-label',
            interactive: false,
            edgeFade: 'keyhole',
            horizonCull: true,
            terrainOcclusion: false,
            gapPx: 14,
            verticalOnly: true,
            placement: 'above',
          })),
          { cohortLimit: 16, collisionCapacity: 32, moving: false },
        );
        overlayHost?.setVisible('sngr-events', true);
        showSelected();
        listener?.();
        return true;
      } catch (e) {
        if (current.signal.aborted || request !== current) return false;
        error = e.message;
        stale = true;
        for (const ev of events) {
          const entity = data.entities.getById(`sngr-events:${ev.id}`);
          if (entity) {
            entity.description = sngrEventDescription(ev, true);
            entity.point.color = Cesium.Color.fromCssColorString('#9ca3af');
          }
        }
        showSelected();
        listener?.();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },
    selectEvent(id) {
      if (!enabled) return;
      selectedId = id;
      showSelected();
    },
    getRowControls() {
      const eventTimes = events
        .map((e) => e.eventMs)
        .filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
      return {
        readout: true,
        summary: {
          label: t('SNGR adverse events (Ecuador)'),
          coverage: 'SNGR REDM / EVIN field incident reports',
          detail:
            'Dated field reports with publication lag · distinct from static susceptibility maps',
          status:
            error ||
            t('{count} SNGR reports · {freshness}', {
              count: events.length,
              freshness: stale
                ? 'STALE'
                : latestEventAt
                  ? `latest ${latestEventAt.slice(0, 10)} (${latestLagDays ?? 0}d lag)`
                  : 'reported',
            }),
          validTime: eventTimes.length
            ? new Date(Math.max(...eventTimes)).toISOString()
            : undefined,
        },
        legend: [
          { color: '#38bdf8', label: t('Flood / inundation') },
          { color: '#f59e0b', label: t('Landslide / erosion') },
          { color: '#818cf8', label: t('Heavy rain / wind') },
          { color: '#ef4444', label: t('Forest fire') },
          { color: '#9ca3af', label: t('Missing / stale') },
        ],
        legendCategorical: true,
      };
    },
    setRowControlsListener(fn) {
      listener = fn;
    },
    getAnalystRecords(max = 32) {
      return enabled
        ? events
            .slice(0, Math.max(0, Math.min(32, max)))
            .map((e) => ({ ...e, stale }))
        : [];
    },
    getStats() {
      const eventTimes = events
        .map((e) => e.eventMs)
        .filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
      return {
        count: events.length,
        lastUpdate,
        error,
        observedAt: eventTimes.length ? Math.max(...eventTimes) : null,
        stale,
      };
    },
    destroy() {
      layer.disable();
      removeClusterStyling?.();
      removeClusterStyling = null;
      if (data) viewer?.dataSources.remove(data, true);
      data = null;
      viewer = null;
      events = [];
      listener = null;
    },
  };

  return layer;
}
