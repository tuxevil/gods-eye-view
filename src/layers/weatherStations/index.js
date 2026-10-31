import { t } from '../../i18n/index.js';
import * as Cesium from 'cesium';
import { installCompactClusterBadges } from '../clusterBadges.js';
import { stationStale, temperatureColor } from './model.js';
const escape = (s) =>
  String(s ?? 'Unavailable').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const metric = (v, unit) =>
  v === null || v === undefined
    ? 'Unavailable'
    : `${Math.round(v * 10) / 10} ${unit}`;
export function stationDescription(r, stale) {
  return `<h3>${escape(r.stationId)} · ${escape(r.name)}</h3><p>${escape(r.provider)} · ${escape(r.observedAt)}<br>${stale ? 'STALE' : 'Recent observation'} · point observation, not area weather</p><table>${[
    ['Temperature', metric(r.tempC, '°C')],
    ['Humidity', metric(r.humidity, '%')],
    ['Humidity method', r.humidityMethod],
    ['Wind', metric(r.windMs, 'm/s')],
    ['Gust', metric(r.gustMs, 'm/s')],
    ['Wind direction', metric(r.windDeg, '°')],
    ['Pressure', metric(r.pressureHpa, 'hPa')],
    ['Pressure type', r.pressureType],
    ['Cloud', r.cloud],
    ['Condition', r.condition],
    ['Solar', metric(r.solarWm2, 'W/m²')],
    ['Rain rate', metric(r.rainRateMmHr, 'mm/h')],
    ['Daily rainfall', metric(r.rainDailyMm, 'mm')],
    ['Last hour rainfall', metric(r.rainLastHourMm, 'mm')],
    ['Source', r.source],
  ]
    .map(([k, v]) => `<tr><th>${k}</th><td>${escape(v)}</td></tr>`)
    .join('')}</table>`;
}
/** Manager owns scheduling. This layer owns one datasource and abortable refresh. */
export function createWeatherStationsLayer({
  source,
  overlayHost,
  picking,
  pointer,
  handlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Station snapshot source required');
  let viewer,
    data,
    enabled = false,
    request,
    readings = [],
    lastUpdate = null,
    error = null,
    stale = false,
    listener,
    clickHandler,
    selectedId,
    removeClusterStyling;
  const showSelected = () => {
    const r = readings.find((r) => r.id === selectedId);
    overlayHost?.setEntries(
      'weather-station-selection',
      r
        ? [
            {
              id: `station-card:${r.id}`,
              position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
              selected: true,
              interactive: false,
              title: `${r.stationId} · ${r.name}`,
              details: [
                `${r.provider} · ${r.observedAt}`,
                `${stale || stationStale(r) ? 'STALE' : 'Recent observation'} · point observation`,
                `Temperature ${metric(r.tempC, '°C')} · humidity ${metric(r.humidity, '%')}`,
                `Wind ${metric(r.windMs, 'm/s')} · gust ${metric(r.gustMs, 'm/s')} · direction ${metric(r.windDeg, '°')}`,
                `Pressure ${metric(r.pressureHpa, 'hPa')} (${r.pressureType || 'Unavailable'})`,
                `Cloud ${r.cloud ?? 'Unavailable'} · condition ${r.condition ?? 'Unavailable'}`,
                `Solar ${metric(r.solarWm2, 'W/m²')} · rain rate ${metric(r.rainRateMmHr, 'mm/h')}`,
                `Daily rain ${metric(r.rainDailyMm, 'mm')} · last hour ${metric(r.rainLastHourMm, 'mm')}`,
                r.humidityMethod || 'Humidity unavailable',
                r.source,
              ],
              accent: temperatureColor(r.tempC),
              priority: Number.MAX_SAFE_INTEGER,
              gapPx: 18,
              verticalOnly: true,
              placement: 'above',
            },
          ]
        : [],
      { cohortLimit: 1, collisionCapacity: 1, moving: false },
    );
    overlayHost?.setVisible('weather-station-selection', enabled);
  };
  const layer = {
    id: 'weather-stations',
    name: 'Weather stations',
    icon: '◉',
    source: 'NOAA AWC · METAR',
    updateInterval: 300_000,
    init(v) {
      if (data) throw new Error('Weather stations already initialized');
      viewer = v;
      data = new Cesium.CustomDataSource('weather-stations');
      data.show = false;
      data.clustering.enabled = true;
      data.clustering.pixelRange = 45;
      data.clustering.minimumClusterSize = 3;
      removeClusterStyling = installCompactClusterBadges(data, '#38bdf8');
      viewer.dataSources.add(data);
    },
    enable() {
      enabled = true;
      if (data) data.show = true;
      picking?.registerPickOwner('weather-stations', (id) =>
        id.startsWith('weather-stations:'),
      );
      if (!clickHandler && handlerFactory && viewer) {
        clickHandler = handlerFactory(viewer);
        clickHandler.setInputAction((click) => {
          if (pointer && !pointer.isPointerFree()) return;
          const picked = viewer.scene.pick(click.position);
          const id = picking?.resolvePickId(picked);
          if (id?.startsWith('weather-stations:'))
            layer.selectStation(id.slice('weather-stations:'.length));
          else if (!picked) layer.selectStation(null);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    },
    disable() {
      enabled = false;
      overlayHost?.clearSource('weather-stations');
      overlayHost?.clearSource('weather-station-selection');
      picking?.unregisterPickOwner('weather-stations');
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
      // Ecuador at globe scale; bounded 10° cells support worldwide close exploration.
      let cell = 'ecuador';
      const p = viewer.camera?.positionCartographic;
      if (p && p.height < 2_000_000) {
        const lat = Math.max(
          -90,
          Math.min(80, Math.floor(Cesium.Math.toDegrees(p.latitude) / 10) * 10),
        );
        const lon = Math.max(
          -180,
          Math.min(
            170,
            Math.floor(Cesium.Math.toDegrees(p.longitude) / 10) * 10,
          ),
        );
        cell = `${lat},${lon}`;
      }
      try {
        const result = await source.getSnapshot({
          signal: current.signal,
          cell,
        });
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        readings = result.readings;
        stale = result.stale;
        lastUpdate = result.fetchedAt;
        error = result.ambientError
          ? t('Ambient unavailable; METAR available')
          : null;
        data.entities.removeAll();
        for (const r of readings) {
          const old = stale || stationStale(r);
          data.entities.add({
            id: `weather-stations:${r.id}`,
            name: `${r.stationId} · ${metric(r.tempC, '°C')}`,
            position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
            description: stationDescription(r, old),
            point: {
              pixelSize: 12,
              color: Cesium.Color.fromCssColorString(
                old ? '#94a3b8' : temperatureColor(r.tempC),
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
            properties: r,
          });
        }
        overlayHost?.setEntries(
          'weather-stations',
          readings.slice(0, 40).map((r) => ({
            id: r.id,
            position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
            variant: 'label',
            title: `${r.stationId} ${metric(r.tempC, '°C')}`,
            accent: temperatureColor(r.tempC),
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
          { cohortLimit: 40, collisionCapacity: 80, moving: false },
        );
        overlayHost?.setVisible('weather-stations', true);
        showSelected();
        listener?.();
        return true;
      } catch (e) {
        if (current.signal.aborted || request !== current) return false;
        error = e.message;
        stale = true;
        for (const r of readings) {
          const entity = data.entities.getById(`weather-stations:${r.id}`);
          if (entity) {
            entity.description = stationDescription(r, true);
            entity.point.color = Cesium.Color.fromCssColorString('#94a3b8');
          }
        }
        showSelected();
        listener?.();
        return false;
      } finally {
        if (request === current) request = null;
      }
    },
    selectStation(id) {
      if (!enabled) return;
      selectedId = id;
      showSelected();
    },
    getRowControls() {
      return {
        readout: true,
        summary: {
          label: t('Weather stations'),
          coverage: 'Worldwide airport observations · Ecuador at globe scale',
          detail:
            'Temperature °C · humidity derived · missing sensors unavailable',
          status:
            error ||
            t('{count} stations · {freshness}', {
              count: readings.length,
              freshness:
                stale || readings.some((r) => stationStale(r))
                  ? 'STALE'
                  : 'recent observations',
            }),
          validTime: readings.length
            ? new Date(
                Math.max(...readings.map((r) => r.observedMs)),
              ).toISOString()
            : undefined,
        },
        legend: [
          { color: '#60a5fa', label: '<10 °C' },
          { color: '#2dd4bf', label: '10–20 °C' },
          { color: '#fbbf24', label: '20–30 °C' },
          { color: '#fb7185', label: '≥30 °C' },
          { color: '#94a3b8', label: t('Missing / stale') },
        ],
        legendCategorical: true,
      };
    },
    setRowControlsListener(fn) {
      listener = fn;
    },
    getLoadedPointSnapshot() {
      return {
        id: 'weather-stations',
        state: !enabled
          ? 'off'
          : error
            ? 'unavailable'
            : !lastUpdate
              ? 'not-loaded'
              : 'loaded',
        records: enabled ? readings : [],
      };
    },
    getAnalystRecords(max = 400) {
      return enabled
        ? readings
            .slice(0, Math.max(0, Math.min(400, max)))
            .map((r) => ({ ...r, stale: stale || stationStale(r) }))
        : [];
    },
    getStats() {
      return {
        count: readings.length,
        lastUpdate,
        error,
        observedAt: readings.length
          ? Math.max(...readings.map((r) => r.observedMs))
          : null,
        stale: stale || readings.some((r) => stationStale(r)),
      };
    },
    destroy() {
      layer.disable();
      removeClusterStyling?.();
      removeClusterStyling = null;
      if (data) viewer?.dataSources.remove(data, true);
      data = null;
      viewer = null;
      readings = [];
      listener = null;
    },
  };
  return layer;
}
