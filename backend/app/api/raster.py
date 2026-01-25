from fastapi import APIRouter
from titiler.core.factory import TilerFactory
from titiler.core.errors import DEFAULT_STATUS_CODES, add_exception_handlers

# Titiler is designed to be added as a factory
# We will create a router for a single COG for now
# or allow dynamic COG loading if needed

raster_router = TilerFactory(router=APIRouter())

# We can add custom routes if needed or just use the factory defaults
# The factory provides /tiles/{z}/{x}/{y}, /metadata, /point etc.
