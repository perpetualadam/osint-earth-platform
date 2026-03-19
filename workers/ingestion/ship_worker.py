import json
import time
import websocket
from base_worker import BaseWorker
from config import AISSTREAM_API_KEY

AIS_SHIP_TYPES = {
    30: "Fishing", 31: "Towing", 32: "Towing (large)", 33: "Dredging",
    34: "Diving ops", 35: "Military", 36: "Sailing", 37: "Pleasure craft",
    40: "HSC", 50: "Pilot vessel", 51: "SAR", 52: "Tug", 53: "Port tender",
    54: "Anti-pollution", 55: "Law enforcement", 58: "Medical transport",
    60: "Passenger", 61: "Passenger (HSC)", 69: "Passenger (no info)",
    70: "Cargo", 71: "Cargo (hazardous A)", 72: "Cargo (hazardous B)",
    79: "Cargo (no info)", 80: "Tanker", 81: "Tanker (hazardous A)",
    89: "Tanker (no info)", 90: "Other",
}

NAV_STATUSES = {
    0: "Under way using engine", 1: "At anchor", 2: "Not under command",
    3: "Restricted manoeuvrability", 4: "Constrained by draught",
    5: "Moored", 6: "Aground", 7: "Engaged in fishing",
    8: "Under way sailing", 14: "AIS-SART", 15: "Not defined",
}

COLLECT_SECONDS = 45
MAX_SHIPS = 5000
AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"


class ShipWorker(BaseWorker):
    name = "ship"

    def run(self):
        if not AISSTREAM_API_KEY:
            self.logger.warning("AISSTREAM_API_KEY not set, skipping global ship fetch")
            return

        self.logger.info("Connecting to AISStream.io for global ship data (%ds window)…", COLLECT_SECONDS)
        positions = {}
        static_data = {}
        errors = []

        def on_message(ws, raw):
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                return

            if "error" in msg:
                errors.append(msg["error"])
                ws.close()
                return

            msg_type = msg.get("MessageType", "")
            meta = msg.get("MetaData", {})
            mmsi = str(meta.get("MMSI", ""))
            if not mmsi or mmsi == "0":
                return

            if msg_type == "PositionReport":
                body = msg["Message"]["PositionReport"]
                sog = body.get("Sog", 0)
                if sog < 0.5:
                    return
                if len(positions) >= MAX_SHIPS:
                    return
                positions[mmsi] = {
                    "lat": body.get("Latitude", meta.get("latitude")),
                    "lng": body.get("Longitude", meta.get("longitude")),
                    "sog": sog,
                    "cog": body.get("Cog", 0),
                    "heading": body.get("TrueHeading", 511),
                    "nav_status": NAV_STATUSES.get(body.get("NavigationalStatus", 15), ""),
                    "name": meta.get("ShipName", "").strip(),
                    "ts": meta.get("time_utc", ""),
                }

            elif msg_type == "ShipStaticData":
                body = msg["Message"]["ShipStaticData"]
                type_code = body.get("Type", 0)
                static_data[mmsi] = {
                    "name": body.get("Name", meta.get("ShipName", "")).strip(),
                    "type_code": type_code,
                    "type": AIS_SHIP_TYPES.get(type_code, AIS_SHIP_TYPES.get(type_code // 10 * 10, "")),
                    "destination": body.get("Destination", "").strip(),
                    "callsign": body.get("CallSign", "").strip(),
                    "imo": str(body.get("ImoNumber", "")),
                }

            elif msg_type == "StandardClassBPositionReport":
                body = msg["Message"]["StandardClassBPositionReport"]
                sog = body.get("Sog", 0)
                if sog < 0.5 or len(positions) >= MAX_SHIPS:
                    return
                positions[mmsi] = {
                    "lat": body.get("Latitude", meta.get("latitude")),
                    "lng": body.get("Longitude", meta.get("longitude")),
                    "sog": sog,
                    "cog": body.get("Cog", 0),
                    "heading": body.get("TrueHeading", 511),
                    "nav_status": "",
                    "name": meta.get("ShipName", "").strip(),
                    "ts": meta.get("time_utc", ""),
                }

        def on_error(ws, error):
            self.logger.warning("AISStream WebSocket error: %s", error)

        def on_open(ws):
            sub = {
                "APIKey": AISSTREAM_API_KEY,
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
                "FilterMessageTypes": ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
            }
            ws.send(json.dumps(sub))
            self.logger.info("Subscribed to global AIS stream")

        ws = websocket.WebSocketApp(
            AISSTREAM_URL,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
        )

        import threading
        timer = threading.Timer(COLLECT_SECONDS, lambda: ws.close())
        timer.daemon = True

        def on_open_with_timer(ws_arg):
            on_open(ws_arg)
            timer.start()

        ws.on_open = on_open_with_timer
        ws.run_forever(ping_interval=20, ping_timeout=10)

        if errors:
            self.logger.error("AISStream errors: %s", errors)
            return

        self.logger.info("Collected %d positions, %d static records", len(positions), len(static_data))

        features = []
        with self.conn.cursor() as cur:
            for mmsi, pos in positions.items():
                lat, lng = pos["lat"], pos["lng"]
                if lat is None or lng is None:
                    continue
                if lat == 0 and lng == 0:
                    continue

                sd = static_data.get(mmsi, {})
                name = sd.get("name") or pos.get("name", "")
                ship_type = sd.get("type", "")
                destination = sd.get("destination", "")
                callsign = sd.get("callsign", "")
                imo = sd.get("imo", "")
                heading_raw = pos.get("heading", 511)
                heading = heading_raw if heading_raw != 511 else pos.get("cog", 0)

                cur.execute("""
                    INSERT INTO ship_tracks
                        (mmsi, vessel_name, vessel_type, location, speed, course, heading,
                         nav_status, destination, callsign, imo, recorded_at)
                    VALUES
                        (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (mmsi, name, ship_type, lng, lat, pos["sog"], pos["cog"],
                      heading, pos.get("nav_status", ""), destination, callsign, imo))

                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "properties": {
                        "mmsi": mmsi, "vessel_name": name, "ship_type": ship_type,
                        "destination": destination, "callsign": callsign, "imo": imo,
                        "speed": pos["sog"], "course": pos["cog"], "heading": heading,
                        "nav_status": pos.get("nav_status", ""),
                    },
                })

        if features:
            self.publish("ships:live", {"type": "FeatureCollection", "features": features})
        self.logger.info("Inserted %d global ship positions", len(features))
