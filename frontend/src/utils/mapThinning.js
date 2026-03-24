/** Keep the most recent N features by a property ISO timestamp (map layers). */
export function thinFeaturesByTimeField(features, maxCount, timeField) {
  if (!features?.length || features.length <= maxCount) return features;
  return [...features]
    .sort((a, b) => {
      const ta = new Date(a.properties?.[timeField] ?? 0).getTime();
      const tb = new Date(b.properties?.[timeField] ?? 0).getTime();
      return tb - ta;
    })
    .slice(0, maxCount);
}
