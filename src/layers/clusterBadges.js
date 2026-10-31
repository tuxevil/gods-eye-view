import * as Cesium from 'cesium';

/** Keep independent point-layer clusters legible when several layers overlap. */
export function installCompactClusterBadges(dataSource, accentColor) {
  const clustering = dataSource?.clustering;
  if (!clustering?.clusterEvent?.addEventListener) return () => {};

  const accent = Cesium.Color.fromCssColorString(accentColor);
  clustering.clusterPoints = false;
  clustering.clusterBillboards = false;
  clustering.clusterLabels = true;

  return clustering.clusterEvent.addEventListener(
    (clusteredEntities, cluster) => {
      const label = cluster?.label;
      if (!label) return;

      // Cesium's default cluster count is a large white label. Independent
      // data sources each place one, so co-located layers obscure one another.
      // A small source-colored badge preserves the count and pick target.
      label.id = clusteredEntities;
      label.show = true;
      label.text = String(clusteredEntities.length);
      label.font = '600 12px monospace';
      label.fillColor = Cesium.Color.WHITE;
      label.outlineColor = Cesium.Color.BLACK;
      label.outlineWidth = 2;
      label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      label.showBackground = true;
      label.backgroundColor = accent.withAlpha(0.88);
      label.backgroundPadding = new Cesium.Cartesian2(4, 2);
      label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
      label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      label.disableDepthTestDistance = Number.POSITIVE_INFINITY;

      if (cluster.billboard) {
        cluster.billboard.id = clusteredEntities;
        cluster.billboard.show = false;
      }
      if (cluster.point) {
        cluster.point.id = clusteredEntities;
        cluster.point.show = false;
      }
    },
  );
}
