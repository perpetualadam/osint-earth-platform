/**
 * Heuristic filters for “military / interesting” traffic (OSINT-style, not authoritative).
 */

const MIL_CALLSIGN_PREFIX = /^(RCH|REACH|CNV|QUID|HOMER|SAM|NINJA|DFFA|RRR|BAF|DUKE|SPAR|LAGR|STRIKER|IAM|IAF|RAF|NAF|CNV|EVAC|PAT|VM|NF|IANT|FORTE|FORT|DRAG|HOOK|NCHO)/i;

export function matchesMilitaryPreset(p) {
  const cs = (p.callsign || "").trim();
  if (cs && MIL_CALLSIGN_PREFIX.test(cs)) return true;
  const icao = (p.icao24 || "").toLowerCase();
  if (/^(ae|af|ad)[0-9a-f]{4}$/.test(icao)) return true;
  const sq = String(p.squawk || "").trim();
  if (/^7[0-4][0-9]{2}$/.test(sq)) return true;
  const alt = Number(p.altitude);
  const vel = Number(p.velocity);
  const og = p.on_ground === true;
  if (!og && alt > 12000 && alt < 45000 && vel > 220) return true;
  return false;
}

export function matchesInterestingPreset(p) {
  if (matchesMilitaryPreset(p)) return true;
  const cat = (p.category || "").toUpperCase();
  if (cat && cat !== "A0" && cat !== "A1" && cat !== "A2") return true;
  const vel = Number(p.velocity);
  const alt = Number(p.altitude);
  if (!p.on_ground && vel > 280 && alt > 15000) return true;
  return false;
}

export function applyNumericFilters(p, { minAlt, maxAlt, minVel }) {
  const alt = Number(p.altitude);
  const vel = Number(p.velocity);
  if (minAlt != null && !Number.isNaN(minAlt) && (Number.isNaN(alt) || alt < minAlt)) return false;
  if (maxAlt != null && !Number.isNaN(maxAlt) && (Number.isNaN(alt) || alt > maxAlt)) return false;
  if (minVel != null && !Number.isNaN(minVel) && (Number.isNaN(vel) || vel < minVel)) return false;
  return true;
}

export function filterAircraftFeatures(features, query) {
  const preset = (query.preset || "").toLowerCase();
  const minAlt = query.min_altitude != null ? Number(query.min_altitude) : null;
  const maxAlt = query.max_altitude != null ? Number(query.max_altitude) : null;
  const minVel = query.min_velocity != null ? Number(query.min_velocity) : null;
  const callsignPrefix = (query.callsign_prefix || "").trim().toUpperCase();

  return features.filter((f) => {
    const p = f.properties || {};
    if (callsignPrefix) {
      const cs = (p.callsign || "").trim().toUpperCase();
      if (!cs.startsWith(callsignPrefix)) return false;
    }
    if (!applyNumericFilters(p, { minAlt, maxAlt, minVel })) return false;
    if (preset === "military") return matchesMilitaryPreset(p);
    if (preset === "interesting") return matchesInterestingPreset(p);
    return true;
  });
}
