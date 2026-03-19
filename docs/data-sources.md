# Data Sources Reference

## Satellite Imagery

### Sentinel-1 (Radar)
- **Provider**: ESA / Copernicus
- **Resolution**: 5–20 m
- **Revisit**: 6 days
- **API**: Copernicus Data Space — https://dataspace.copernicus.eu
- **Auth**: Free registration
- **Use**: All-weather imaging, ship detection, flood mapping

### Sentinel-2 (Optical)
- **Provider**: ESA / Copernicus
- **Resolution**: 10–60 m
- **Revisit**: 5 days
- **API**: Copernicus Data Space
- **Use**: Land cover, vegetation, urban change, fire scars

### Sentinel-3 (Ocean)
- **Provider**: ESA / Copernicus
- **Resolution**: 300 m
- **Use**: Sea surface temperature, ocean colour, coastal monitoring

### Landsat-8 / Landsat-9
- **Provider**: USGS / NASA
- **Resolution**: 30 m (15 m pan)
- **Revisit**: 8 days (combined)
- **API**: STAC — https://landsatlook.usgs.gov/stac-server
- **Use**: Long-term change monitoring (archive from 2013/2021)

### GOES-16 / GOES-18
- **Provider**: NOAA
- **Resolution**: 0.5–2 km
- **Frequency**: Every 5–15 minutes
- **API**: https://goes-imagery.nesdis.noaa.gov
- **Use**: Weather monitoring, storm tracking, rapid fire detection

## Environmental Monitoring

### NASA FIRMS (Fire Information)
- **API**: https://firms.modaps.eosdis.nasa.gov/api/area/
- **Frequency**: Every 15 minutes
- **Key**: Free — register at https://firms.modaps.eosdis.nasa.gov/api/area/
- **Data**: Latitude, longitude, fire radiative power (FRP), confidence

### USGS Earthquake Hazards
- **API**: https://earthquake.usgs.gov/fdsnws/event/1/query
- **Frequency**: Real-time, poll every 5 minutes
- **Auth**: None required
- **Data**: Location, magnitude, depth, felt reports

### Global Forest Change
- **Provider**: University of Maryland / Hansen et al.
- **URL**: https://earthenginepartners.appspot.com/science-2013-global-forest
- **Use**: Annual deforestation analysis

## Transport Tracking

### OpenSky Network (Aircraft)
- **API**: https://opensky-network.org/api
- **Frequency**: Every 10 seconds
- **Auth**: Optional (higher rate limits with free account)
- **Data**: ICAO24, callsign, position, altitude, velocity, heading

### AIS Ship Tracking
- **API**: AISHub — https://www.aishub.net
- **Frequency**: Every 30 seconds
- **Auth**: Free data sharing agreement or API key
- **Data**: MMSI, vessel name/type, position, speed, course, heading

## Event / Intelligence

### GDELT Project
- **API**: https://api.gdeltproject.org/api/v2
- **Frequency**: Hourly
- **Auth**: None required
- **Data**: Geolocated news events, tone analysis, media counts

### ACLED (Armed Conflict Location & Event Data)
- **API**: https://api.acleddata.com/acled/read
- **Frequency**: Weekly updates (poll hourly for new data)
- **Auth**: Free API key for researchers
- **Data**: Conflict events, actors, fatalities, event types

## Webcams

### Windy Webcams
- **API**: https://api.windy.com/webcams/api/v3
- **Auth**: Free API key
- **Data**: Location, stream URL, thumbnail, camera type

### EarthCam / SkylineWebcams
- **Access**: Web scraping (no official API)
- **Status**: Disabled by default

## Base Geospatial Data

### OpenStreetMap
- **Tile URL**: https://tile.openstreetmap.org/{z}/{x}/{y}.png
- **Use**: Base map layer, POI data
- **Terms**: ODbL license, respect tile usage policy

### SRTM Elevation
- **Provider**: NASA
- **Resolution**: 30 m
- **Use**: Terrain rendering in CesiumJS (via Cesium World Terrain)

### Natural Earth
- **URL**: https://www.naturalearthdata.com
- **Use**: Country boundaries, coastlines, populated places
