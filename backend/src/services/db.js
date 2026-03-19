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
    const [west, south, east, north] = query.bbox.split(",").map(Number);
    clauses.push(
      `ST_Intersects(location, ST_MakeEnvelope($${i}, $${i + 1}, $${i + 2}, $${i + 3}, 4326))`
    );
    params.push(west, south, east, north);
    i += 4;
  }

  if (query.time_start) {
    clauses.push(`occurred_at >= $${i}`);
    params.push(query.time_start);
    i++;
  }
  if (query.time_end) {
    clauses.push(`occurred_at <= $${i}`);
    params.push(query.time_end);
    i++;
  }

  if (query.event_type) {
    clauses.push(`event_type = $${i}`);
    params.push(query.event_type);
    i++;
  }

  return {
    where: clauses.length ? "WHERE " + clauses.join(" AND ") : "",
    params,
    nextParam: i,
  };
}
