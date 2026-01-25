import math


def num2deg(xtile, ytile, zoom):
    n = 2.0**zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lon_deg, lat_deg)


def tile_bounds(xtile, ytile, zoom):
    """
    Returns (min_lon, min_lat, max_lon, max_lat)
    """
    min_lon, max_lat = num2deg(xtile, ytile, zoom)
    max_lon, min_lat = num2deg(xtile + 1, ytile + 1, zoom)
    return (min_lon, min_lat, max_lon, max_lat)
