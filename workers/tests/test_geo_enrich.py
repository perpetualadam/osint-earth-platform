"""Tests for telegram_ingest.geo_enrich (no live Nominatim)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


class TestCoordsFromText:
    def test_explicit_decimal_pair(self):
        from telegram_ingest.geo_enrich import coords_from_text

        lon, lat, conf = coords_from_text("Impact at -17.825, 31.034 near city")
        assert conf >= 0.25
        assert abs(lat - (-17.825)) < 1e-6
        assert abs(lon - 31.034) < 1e-6

    def test_ambiguous_integer_pair_skipped(self):
        """31, -17 could be Harare area — do not guess; let Nominatim handle text."""
        from telegram_ingest.geo_enrich import coords_from_text

        lon, lat, conf = coords_from_text("Headline 31, -17 and Harare")
        assert conf == 0.0
        assert lon is None

    def test_tiny_integers_skipped(self):
        from telegram_ingest.geo_enrich import coords_from_text

        lon, lat, conf = coords_from_text("Chapter 3, 5 things to know")
        assert conf == 0.0

    def test_casualty_pattern_skipped(self):
        from telegram_ingest.geo_enrich import coords_from_text

        lon, lat, conf = coords_from_text("Attack: 12, 34 killed in blast")
        assert conf == 0.0


class TestHeadlineCandidates:
    def test_pipe_prefers_segments(self):
        from telegram_ingest.geo_enrich import headline_geocode_candidates

        c = headline_geocode_candidates("Africa wrap | Harare summit opens Tuesday")
        assert len(c) >= 2
        assert any("Harare" in x for x in c)

    def test_clean_strips_url(self):
        from telegram_ingest.geo_enrich import headline_geocode_candidates

        c = headline_geocode_candidates("See https://t.me/x/1 | Update from Kyiv")
        assert not any("http" in x for x in c)
        assert any("Kyiv" in x for x in c)
