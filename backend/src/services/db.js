import pg from "pg";

export const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB || "osint_earth",
  user: process.env.POSTGRES_USER || "osint",
  password: process.env.POSTGRES_PASSWORD || "changeme_postgres_password",
  max: 20,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => console.error("Unexpected PG pool error", err));

/**
 * Build a parameterised spatial+temporal WHERE clause.
 * @returns {{ where: string, params: any[] }}
 */
export function buildSpatialFilter(query, startParam = 1) {
  const clauses = [];
  const params = [];
  let i = startParam;

  if (query.bbox) {
    const parts = query.bbox.split(",").map(Number);
    if (parts.length === 4 && !parts.some(Number.isNaN)) {
      const [west, south, east, north] = parts;
      if (west >= -180 && west <= 180 && east >= -180 && east <= 180 &&
          south >= -90 && south <= 90 && north >= -90 && north <= 90 &&
          west < east && south < north) {
        clauses.push(
          `ST_Intersects(location, ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326))`
        );
        params.push(west, south, east, north);
        i += 4;
      }
    }
  }

  // Match globe to digest behaviour: Telegram uses created_at; map used only occurred_at, so
  // historical GDELT story dates could be outside the timeline while rows were just ingested.
  if (query.time_start && query.time_end) {
    clauses.push(
      `((occurred_at >= $${i} AND occurred_at <= $${i + 1}) OR (created_at >= $${i} AND created_at <= $${i + 1}))`
    );
    params.push(query.time_start, query.time_end);
    i += 2;
  } else if (query.time_start) {
    clauses.push(`(occurred_at >= $${i} OR created_at >= $${i})`);
    params.push(query.time_start);
    i++;
  } else if (query.time_end) {
    clauses.push(`(occurred_at <= $${i} OR created_at <= $${i})`);
    params.push(query.time_end);
    i++;
  }

  if (query.event_type) {
    const types = query.event_type.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length === 1) {
      clauses.push(`event_type = $${i}`);
      params.push(types[0]);
      i++;
    } else if (types.length > 1) {
      clauses.push(`event_type = ANY($${i})`);
      params.push(types);
      i++;
    }
  }

  if (query.source) {
    const sources = query.source.split(",").map((s) => s.trim()).filter(Boolean);
    if (sources.length === 1) {
      clauses.push(`source = $${i}`);
      params.push(sources[0]);
      i++;
    } else if (sources.length > 1) {
      clauses.push(`source = ANY($${i})`);
      params.push(sources);
      i++;
    }
  }

  if (query.severity_min != null && query.severity_min !== "") {
    clauses.push(`severity >= $${i}`);
    params.push(Number(query.severity_min));
    i++;
  }

  return {
    where: clauses.length ? "WHERE " + clauses.join(" AND ") : "",
    params,
    nextParam: i,
  };
}
