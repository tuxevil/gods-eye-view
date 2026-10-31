import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { installCompactClusterBadges } from '../clusterBadges.js';
import { plantMarkerColor, plantStale } from './model.js';
import { geographicSiteRecords, plantGeography } from './sites.js';

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

const formatMetric = (value, unit, digits = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  const factor = 10 ** digits;
  return `${Math.round(value * factor) / factor} ${unit}`;
};

export function plantDescription(
  plant,
  nationalSummary = null,
  isStale = false,
) {
  const mazar = plant.mazarAssessment;
  const rows = [
    ['Operator', plant.operator],
    ['Basin / cascade', plant.basin],
    ['Role', plant.role],
    [
      'Location',
      plant.coordinatesVerified === true
        ? 'Verified'
        : 'Unverified / unknown; excluded from watershed containment',
    ],
    ['Geographic assets', (plant.geographicSiteIds || []).join(' · ')],
    [
      'Nominal installed capacity',
      `${formatMetric(plant.installedMW, 'MW', 0)} (design capacity, not guaranteed available power)`,
    ],
    [
      plant.elevationReferent || 'Reservoir elevation (CELEC)',
      plant.cotaMsnm !== null
        ? `${formatMetric(plant.cotaMsnm, 'm s.n.m.', 2)} (${plant.cotaObservedAt || 'time unavailable'})`
        : 'Unavailable',
    ],
    [
      'Reservoir inflow (CELEC)',
      plant.inflowM3s !== null
        ? `${formatMetric(plant.inflowM3s, 'm³/s', 2)} (${plant.inflowObservedAt || 'time unavailable'})`
        : 'Unavailable',
    ],
    [
      'Plant / river flow (CELEC)',
      plant.flowM3s !== null
        ? `${formatMetric(plant.flowM3s, 'm³/s', 2)} (${plant.flowObservedAt || 'time unavailable'})`
        : 'Unavailable',
    ],
    [
      'Basin flow (CELEC)',
      plant.basinFlowM3s !== null
        ? `${formatMetric(plant.basinFlowM3s, 'm³/s', 2)} (${plant.basinFlowObservedAt || 'time unavailable'})`
        : 'Unavailable',
    ],
    [
      'Units online (CELEC)',
      plant.unitsOnline !== null
        ? `${plant.unitsOnline} (${plant.unitsObservedAt || 'time unavailable'})`
        : 'Unavailable',
    ],
    [
      'Daily cumulative energy (CENACE)',
      plant.dailyCumulativeMWh !== null
        ? `${formatMetric(plant.dailyCumulativeMWh, 'MWh', 2)} accumulated on ${plant.cenaceSourceDate || 'unknown date'} (${plant.cenaceObservedAt || 'time unavailable'}) — cumulative MWh, not instantaneous MW`
        : 'Unavailable',
    ],
    [
      'Estimated interval average MW',
      plant.estimatedIntervalAvgMW !== null
        ? `${formatMetric(plant.estimatedIntervalAvgMW, 'MW', 1)} (ΔMWh / Δh over ${plant.intervalHours} h, ${plant.intervalStartAt} → ${plant.intervalEndAt})`
        : 'Unavailable (requires two monotonic same-day CENACE samples)',
    ],
  ];

  if (mazar) {
    rows.push(
      [
        'Mazar thresholds',
        '2098 m design min · 2115 m sediment precaution · 2120 m pre-alert · 2153 m normal max',
      ],
      [
        'Margin to 2115 m / 2098 m',
        `${formatMetric(mazar.marginTo2115M, 'm', 2)} / ${formatMetric(mazar.marginTo2098M, 'm', 2)}`,
      ],
      [
        '24h elevation rate',
        mazar.changeMPerDay !== null
          ? `${formatMetric(mazar.changeMPerDay, 'm/d', 3)} (${mazar.trendHours} h window)`
          : 'Unavailable',
      ],
      [
        '2115 m linear continuation scenario',
        mazar.daysTo2115Scenario !== null
          ? `${mazar.daysTo2115Scenario} d at current rate (sediment precaution scenario, not blackout countdown)`
          : 'Not applicable',
      ],
    );
  }

  if (nationalSummary?.latestPowerMW) {
    const mw = nationalSummary.latestPowerMW;
    rows.push([
      'National SCADA power (CENACE)',
      `Demand ${formatMetric(mw.demandMW, 'MW', 1)} · Total ${formatMetric(mw.totalProductionMW, 'MW', 1)} · Hydro ${formatMetric(mw.hydroMW, 'MW', 1)} · Thermal ${formatMetric(mw.thermalMW, 'MW', 1)} (${nationalSummary.observedAt || 'time unavailable'})`,
    ]);
  }

  rows.push(['Sources', (plant.sources || []).join(' · ')]);

  return `<h3>${escapeHtml(plant.name)}</h3><p>${escapeHtml(plant.operator)} · ${escapeHtml(plant.observedAt || 'Observation time unavailable')}<br>${isStale ? 'STALE' : 'Recent observation'} · cumulative MWh and instantaneous MW are distinct</p><table>${rows
    .map(
      ([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

function buildSelectionDetails(plant, nationalSummary, isStale) {
  const lines = [
    `${plant.operator} · ${plant.observedAt || 'Observation time unavailable'}`,
    `${isStale ? 'STALE' : 'Recent observation'} · Installed ${formatMetric(plant.installedMW, 'MW', 0)} (nominal design, not available MW)`,
    `${plant.elevationReferent || 'Elevation'}: ${formatMetric(plant.cotaMsnm, 'm s.n.m.', 2)} · Inflow ${formatMetric(plant.inflowM3s ?? plant.flowM3s, 'm³/s', 2)} · Units ${plant.unitsOnline ?? 'Unavailable'}`,
    `Daily cumulative energy ${formatMetric(plant.dailyCumulativeMWh, 'MWh', 1)} (${plant.cenaceSourceDate || 'date unavailable'}, cumulative MWh ≠ MW)`,
    plant.estimatedIntervalAvgMW !== null
      ? `Estimated interval average MW: ${formatMetric(plant.estimatedIntervalAvgMW, 'MW', 1)} (ΔMWh / Δh over ${plant.intervalHours} h)`
      : 'Estimated interval average MW: Unavailable (awaiting next same-day sample)',
  ];
  if (plant.mazarAssessment) {
    const m = plant.mazarAssessment;
    lines.push(
      `Mazar 2115 m margin: ${formatMetric(m.marginTo2115M, 'm', 2)} · 24h trend: ${formatMetric(m.changeMPerDay, 'm/d', 2)}${m.daysTo2115Scenario !== null ? ` · 2115 m scenario: ${m.daysTo2115Scenario} d` : ''}`,
    );
  }
  if (nationalSummary?.latestPowerMW) {
    const mw = nationalSummary.latestPowerMW;
    lines.push(
      `National SCADA (${mw.slotECT || 'latest'} ECT): Demand ${formatMetric(mw.demandMW, 'MW', 0)} · Hydro ${formatMetric(mw.hydroMW, 'MW', 0)} · Thermal ${formatMetric(mw.thermalMW, 'MW', 0)}`,
    );
  }
  lines.push((plant.sources || []).join(' · '));
  return lines;
}

function formatOverlayLabel(plant) {
  if (Number.isFinite(plant.cotaMsnm)) {
    return `${plant.name} ${Math.round(plant.cotaMsnm * 10) / 10} m`;
  }
  if (Number.isFinite(plant.dailyCumulativeMWh)) {
    return `${plant.name} ${Math.round(plant.dailyCumulativeMWh)} MWh`;
  }
  return plant.name;
}

/** Manager owns scheduling. This layer owns one datasource and abortable refresh. */
export function createEcuadorEnergyLayer({
  source,
  overlayHost,
  picking,
  pointer,
  handlerFactory,
  getSiteMembership = () => ({ state: 'not-loaded', units: [] }),
} = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('Ecuador energy snapshot source required');
  }
  let viewer;
  let data;
  let enabled = false;
  let request = null;
  let plants = [];
  let sites = [];
  const isMapped = (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat);
  const mappedRecords = () => [...plants, ...sites].filter(isMapped);
  const siteDetails = (site) => {
    const membership = getSiteMembership(site);
    return [
      `${site.role} · ${site.plantId} · ${site.id}`,
      site.relationship,
      `WGS84 ${site.lat}, ${site.lon} · ${site.coordinatesVerified ? 'Verified' : 'Unverified'}`,
      site.locationPrecision,
      `${site.location.sourceCrs} E ${site.location.sourceCoordinates[0]} / N ${site.location.sourceCoordinates[1]}`,
      `${site.provenance.section} · reviewed ${site.provenance.reviewedAt}`,
      site.provenance.url,
      `BasinATLAS level 8 containment: ${membership.state} · ${membership.units.map((u) => u.name).join(' · ') || 'No loaded containing unit'}`,
      'Containment only; hydraulic relationship is documented separately',
      'No observation assigned to this physical site',
    ].flatMap((line) => line.match(/.{1,64}/gu) || []);
  };
  const description = (p, isStale) =>
    p.recordType === 'geographic-site'
      ? `<h3>${escapeHtml(p.name)}</h3><p>${siteDetails(p).map(escapeHtml).join('<br>')}</p>`
      : plantDescription(p, nationalSummary, isStale);
  let nationalSummary = null;
  let lastUpdate = null;
  let error = null;
  let stale = false;
  let listener = null;
  let clickHandler = null;
  let selectedId = null;
  let removeClusterStyling = null;

  const showSelected = () => {
    const selected = mappedRecords().find((p) => p.id === selectedId);
    const cardTitle = selected
      ? `${selected.name} · ${selected.basin || selected.role}`
      : '';
    overlayHost?.setEntries(
      'ecuador-energy-selection',
      selected
        ? [
            {
              id: `ecuador-energy-card:${selected.id}`,
              position: Cesium.Cartesian3.fromDegrees(
                selected.lon,
                selected.lat,
              ),
              selected: true,
              interactive: false,
              title: cardTitle,
              details:
                selected.recordType === 'geographic-site'
                  ? siteDetails(selected)
                  : buildSelectionDetails(
                      selected,
                      nationalSummary,
                      stale || plantStale(selected),
                    ),
              accent:
                selected.recordType === 'geographic-site'
                  ? '#a78bfa'
                  : plantMarkerColor(selected, stale),
              priority: Number.MAX_SAFE_INTEGER,
              gapPx: 18,
              verticalOnly: true,
              placement: 'above',
            },
          ]
        : [],
      { cohortLimit: 1, collisionCapacity: 1, moving: false },
    );
    overlayHost?.setVisible('ecuador-energy-selection', enabled);
  };

  const layer = {
    id: 'ecuador-energy',
    name: 'Ecuador hydro & grid',
    icon: '⚡',
    source: 'CELEC SUR · CENACE',
    updateInterval: 300_000,
    init(v) {
      if (data) throw new Error('Ecuador energy layer already initialized');
      viewer = v;
      data = new Cesium.CustomDataSource('ecuador-energy');
      data.show = false;
      data.clustering.enabled = true;
      data.clustering.pixelRange = 36;
      data.clustering.minimumClusterSize = 3;
      removeClusterStyling = installCompactClusterBadges(data, '#60a5fa');
      viewer.dataSources.add(data);
    },
    enable() {
      enabled = true;
      if (data) data.show = true;
      picking?.registerPickOwner('ecuador-energy', (id) =>
        id.startsWith('ecuador-energy:'),
      );
      if (!clickHandler && handlerFactory && viewer) {
        clickHandler = handlerFactory(viewer);
        clickHandler.setInputAction((click) => {
          if (pointer && !pointer.isPointerFree()) return;
          const picked = viewer.scene.pick(click.position);
          const id = picking?.resolvePickId(picked);
          if (id?.startsWith('ecuador-energy:')) {
            layer.selectPlant(id.slice('ecuador-energy:'.length));
          } else if (!picked) {
            layer.selectPlant(null);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    },
    disable() {
      enabled = false;
      overlayHost?.clearSource('ecuador-energy');
      overlayHost?.clearSource('ecuador-energy-selection');
      picking?.unregisterPickOwner('ecuador-energy');
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
        plants = (result.plants || []).map((p) => ({
          ...p,
          ...plantGeography(p.id),
        }));
        sites = geographicSiteRecords(plants);
        nationalSummary = result.nationalSummary || null;
        stale = Boolean(result.stale);
        lastUpdate = result.fetchedAt ?? null;
        error =
          result.cenaceError && !result.celecError
            ? t('CENACE unavailable; CELEC available')
            : result.celecError && !result.cenaceError
              ? t('CELEC unavailable; CENACE available')
              : null;

        data.entities.removeAll();
        for (const p of mappedRecords()) {
          const itemStale = stale || plantStale(p);
          data.entities.add({
            id: `ecuador-energy:${p.id}`,
            name: formatOverlayLabel(p),
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
            description: description(p, itemStale),
            point: {
              pixelSize: 13,
              color: Cesium.Color.fromCssColorString(
                p.recordType === 'geographic-site'
                  ? '#a78bfa'
                  : plantMarkerColor(p, itemStale),
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
            properties: p,
          });
        }

        overlayHost?.setEntries(
          'ecuador-energy',
          mappedRecords().map((p) => {
            const labelTitle = formatOverlayLabel(p);
            return {
              id: p.id,
              position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
              variant: 'label',
              title: labelTitle,
              accent:
                p.recordType === 'geographic-site'
                  ? '#a78bfa'
                  : plantMarkerColor(p, stale || plantStale(p)),
              priority: 2,
              collisionGroup: 'ambient-label',
              paintLane: 'ambient-label',
              interactive: false,
              edgeFade: 'keyhole',
              horizonCull: true,
              terrainOcclusion: false,
              gapPx: 14,
              verticalOnly: true,
              placement: 'above',
            };
          }),
          { cohortLimit: 16, collisionCapacity: 32, moving: false },
        );
        overlayHost?.setVisible('ecuador-energy', true);
        showSelected();
        listener?.();
        return true;
      } catch (e) {
        if (current.signal.aborted || request !== current) return false;
        error = e.message;
        stale = true;
        for (const p of mappedRecords()) {
          const entity = data.entities.getById(`ecuador-energy:${p.id}`);
          if (entity) {
            entity.description = description(p, true);
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
    selectPlant(id) {
      if (!enabled) return;
      selectedId = id;
      showSelected();
    },
    getRowControls() {
      const observedTimes = plants
        .map((p) => p.observedMs)
        .filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
      return {
        readout: true,
        summary: {
          label: t('Ecuador hydro & grid'),
          coverage: 'CELEC SUR reservoirs · CENACE national SCADA',
          detail: `Elevation m s.n.m. · flow m³/s · daily cumulative MWh ≠ instantaneous MW · ${sites.filter(isMapped).length} verified physical sites · ${sites.filter((s) => !isMapped(s)).length} site locations unknown`,
          status:
            error ||
            t('{count} hydro plants · {freshness}', {
              count: plants.length,
              freshness:
                stale || plants.some((p) => plantStale(p))
                  ? 'STALE'
                  : 'recent observations',
            }),
          validTime: observedTimes.length
            ? new Date(Math.max(...observedTimes)).toISOString()
            : undefined,
        },
        legend: [
          { color: '#fb7185', label: t('Mazar ≤2115 m (sediment risk)') },
          { color: '#fbbf24', label: t('Mazar 2115–2120 m (pre-alert)') },
          { color: '#2dd4bf', label: t('Reservoir + generation telemetry') },
          { color: '#60a5fa', label: t('Daily cumulative MWh only') },
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
        id: 'ecuador-energy',
        state: !enabled
          ? 'off'
          : error
            ? 'unavailable'
            : !lastUpdate
              ? 'not-loaded'
              : 'loaded',
        records: enabled
          ? [...plants, ...sites].map((plant) => ({
              ...plant,
              coordinatesVerified: plant.coordinatesVerified === true,
              locationRole: plant.locationRole,
            }))
          : [],
      };
    },
    getAnalystRecords(max = 32) {
      return enabled
        ? plants.slice(0, Math.max(0, Math.min(32, max))).map((p) => ({
            ...p,
            geographicSites: sites.filter((s) => s.plantId === p.id),
            stale: stale || plantStale(p),
          }))
        : [];
    },
    getStats() {
      const observedTimes = plants
        .map((p) => p.observedMs)
        .filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
      return {
        count: plants.length,
        mappedSiteCount: sites.filter(isMapped).length,
        unlocatedSiteCount: sites.filter((s) => !isMapped(s)).length,
        lastUpdate,
        error,
        observedAt: observedTimes.length ? Math.max(...observedTimes) : null,
        stale: stale || plants.some((p) => plantStale(p)),
      };
    },
    destroy() {
      layer.disable();
      removeClusterStyling?.();
      removeClusterStyling = null;
      if (data) viewer?.dataSources.remove(data, true);
      data = null;
      viewer = null;
      plants = [];
      sites = [];
      nationalSummary = null;
      listener = null;
    },
  };

  return layer;
}
