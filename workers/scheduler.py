"""
Central scheduler — runs all ingestion workers on their configured intervals.
Uses APScheduler to manage cron-like periodic execution.
"""
import os
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

from ingestion.aircraft_worker import AircraftWorker
from ingestion.ship_worker import ShipWorker
from ingestion.wildfire_worker import WildfireWorker
from ingestion.earthquake_worker import EarthquakeWorker
from ingestion.satellite_worker import SatelliteWorker
from ingestion.webcam_worker import WebcamWorker
from ingestion.event_worker import EventWorker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("scheduler")

aircraft = AircraftWorker()
ship = ShipWorker()
wildfire = WildfireWorker()
earthquake = EarthquakeWorker()
satellite = SatelliteWorker()
webcam = WebcamWorker()
event = EventWorker()


def safe_run(worker):
    """Wrap worker.run() so scheduler continues even if one worker fails."""
    def _inner():
        try:
            worker.run()
        except Exception as e:
            logger.error("[%s] Worker error: %s", worker.name, e, exc_info=True)
    return _inner


def main():
    scheduler = BlockingScheduler()

    scheduler.add_job(safe_run(aircraft),
                      IntervalTrigger(seconds=int(os.getenv("AIRCRAFT_POLL_SECONDS", "10"))),
                      id="aircraft", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(ship),
                      IntervalTrigger(seconds=int(os.getenv("SHIP_POLL_SECONDS", "30"))),
                      id="ship", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(wildfire),
                      IntervalTrigger(minutes=int(os.getenv("WILDFIRE_POLL_MINUTES", "15"))),
                      id="wildfire", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(earthquake),
                      IntervalTrigger(minutes=int(os.getenv("EARTHQUAKE_POLL_MINUTES", "5"))),
                      id="earthquake", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(satellite),
                      IntervalTrigger(hours=int(os.getenv("SATELLITE_POLL_HOURS", "6"))),
                      id="satellite", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(webcam),
                      IntervalTrigger(hours=int(os.getenv("WEBCAM_POLL_HOURS", "24"))),
                      id="webcam", max_instances=1, coalesce=True)

    scheduler.add_job(safe_run(event),
                      IntervalTrigger(minutes=int(os.getenv("EVENT_POLL_MINUTES", "60"))),
                      id="event", max_instances=1, coalesce=True)

    logger.info("Starting OSINT Earth worker scheduler…")
    logger.info("Registered jobs: %s", [j.id for j in scheduler.get_jobs()])

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler shutting down.")


if __name__ == "__main__":
    main()
