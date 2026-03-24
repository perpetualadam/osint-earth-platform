import psycopg2


def connect_pg(cfg):
    return psycopg2.connect(
        host=cfg["host"],
        port=cfg["port"],
        dbname=cfg["dbname"],
        user=cfg["user"],
        password=cfg["password"],
    )


def insert_post(conn, row):
    sql = """
        INSERT INTO telegram_posts (
            telegram_message_id, channel_id, channel_username,
            text, text_en, posted_at,
            lon, lat, location, geo_confidence, metadata
        )
        VALUES (
            %(telegram_message_id)s, %(channel_id)s, %(channel_username)s,
            %(text)s, %(text_en)s, %(posted_at)s,
            %(lon)s, %(lat)s,
            CASE WHEN %(lon)s IS NOT NULL AND %(lat)s IS NOT NULL
                 THEN ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) ELSE NULL END,
            %(geo_confidence)s, %(metadata)s::jsonb
        )
        ON CONFLICT (channel_id, telegram_message_id) DO NOTHING
    """
    with conn.cursor() as cur:
        cur.execute(sql, row)
        return cur.rowcount > 0
