-- =============================================================================
-- Seed data – data source registry
-- =============================================================================

INSERT INTO datasets (name, provider, data_type, update_freq, api_endpoint, active) VALUES
('sentinel-2',    'ESA / Copernicus', 'satellite',      '6h',    'https://scihub.copernicus.eu/dhus/odata/v1', TRUE),
('sentinel-1',    'ESA / Copernicus', 'satellite',      '6h',    'https://scihub.copernicus.eu/dhus/odata/v1', TRUE),
('sentinel-3',    'ESA / Copernicus', 'satellite',      '6h',    'https://scihub.copernicus.eu/dhus/odata/v1', TRUE),
('landsat-8',     'USGS / NASA',      'satellite',      '6h',    'https://landsatlook.usgs.gov/stac-server',   TRUE),
('landsat-9',     'USGS / NASA',      'satellite',      '6h',    'https://landsatlook.usgs.gov/stac-server',   TRUE),
('goes-16',       'NOAA',             'satellite',      '15m',   'https://goes-imagery.nesdis.noaa.gov',       TRUE),
('goes-18',       'NOAA',             'satellite',      '15m',   'https://goes-imagery.nesdis.noaa.gov',       TRUE),
('opensky',       'OpenSky Network',  'aircraft',       '10s',   'https://opensky-network.org/api',            TRUE),
('ais',           'AISHub / MarineTraffic', 'ship',     '30s',   'https://data.aishub.net/ws.php',             TRUE),
('firms',         'NASA FIRMS',       'environmental',  '15m',   'https://firms.modaps.eosdis.nasa.gov/api',   TRUE),
('usgs-eq',       'USGS',             'environmental',  '5m',    'https://earthquake.usgs.gov/fdsnws/event/1',  TRUE),
('gdelt',         'GDELT Project',    'event',          '60m',   'https://api.gdeltproject.org/api/v2',        TRUE),
('acled',         'ACLED',            'event',          '60m',   'https://api.acleddata.com/acled/read',       TRUE),
('windy-webcams', 'Windy',            'webcam',         '24h',   'https://api.windy.com/webcams/api/v3',       TRUE),
('earthcam',      'EarthCam',         'webcam',         '24h',   'https://www.earthcam.com',                   FALSE),
('skyline',       'SkylineWebcams',   'webcam',         '24h',   'https://www.skylinewebcams.com',             FALSE);
