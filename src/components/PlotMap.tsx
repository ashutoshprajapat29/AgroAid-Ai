import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap, useMapEvents, Marker, CircleMarker } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { area } from '@turf/area';
import { polygon } from '@turf/helpers';
import { useLanguage } from '../lib/LanguageContext';

// Fix leaflet icon issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface PlotMapProps {
  initialLocation?: string; 
  onPolygonDrawn: (geoJsonString: string, areaInAcres: number, centerLat: number, centerLng: number) => void;
}

// Component to recenter the map dynamically
function MapUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 16);
    }
  }, [center, map]);
  return null;
}

function LocateControl({ onLocationFound }: { onLocationFound: (latlng: [number, number]) => void }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const locateUser = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!navigator.geolocation) return;
    
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        map.flyTo(latlng, 18);
        onLocationFound(latlng);
        setLoading(false);
      }, 
      () => {
        setLoading(false);
        alert(t("plots.error_location_retrieve"));
      }, 
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ top: '80px', right: '10px', position: 'absolute', zIndex: 1000 }}>
      <div className="leaflet-control leaflet-bar shadow-md">
        <button 
          onClick={locateUser} 
          className="bg-white w-[34px] h-[34px] flex items-center justify-center hover:bg-gray-100 transition-colors rounded-sm border-b border-gray-200"
          title="Go to my location"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-[#123524] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" className="text-[#123524]">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2"></path>
              <path d="M12 20v2"></path>
              <path d="M20 12h2"></path>
              <path d="M2 12h2"></path>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function PlotMap({ initialLocation, onPolygonDrawn }: PlotMapProps) {
  const { t } = useLanguage();
  const [center, setCenter] = useState<[number, number]>([20.5937, 78.9629]); // Default India
  const [hasLocation, setHasLocation] = useState(false);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);

  useEffect(() => {
    if (initialLocation && !hasLocation) {
      try {
        const parsed = JSON.parse(initialLocation);
        if (parsed.geometry && parsed.geometry.coordinates) {
          const coords = parsed.geometry.coordinates[0][0];
          setCenter([coords[1], coords[0]]);
          setHasLocation(true);
        }
      } catch (e) {
        const parts = initialLocation.split(',');
        if (parts.length === 2) {
          setCenter([parseFloat(parts[0]), parseFloat(parts[1])]);
          setMarkerPos([parseFloat(parts[0]), parseFloat(parts[1])]);
          setHasLocation(true);
        }
      }
    } else if (!hasLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setHasLocation(true);
      });
    }
  }, [initialLocation, hasLocation]);

  function MapEvents() {
    useMapEvents({
      click(e) {
        // If they click the map, drop a pin
        setMarkerPos([e.latlng.lat, e.latlng.lng]);
        onPolygonDrawn(`${e.latlng.lat},${e.latlng.lng}`, 0, e.latlng.lat, e.latlng.lng);
        
        // Clear drawn polygons if they switch to pin mode
        if (featureGroupRef.current) {
          featureGroupRef.current.clearLayers();
        }
      }
    });
    return null;
  }

  const calculateAreaAndNotify = (layer: L.Polygon) => {
    const latlngs = layer.getLatLngs();
    if (latlngs.length > 0 && Array.isArray(latlngs[0])) {
      const coords = (latlngs[0] as L.LatLng[]).map((ll) => [ll.lng, ll.lat]);
      coords.push(coords[0]);
      
      const poly = polygon([coords]);
      const areaSqMeters = area(poly);
      const areaAcres = areaSqMeters * 0.000247105;
      
      const bounds = layer.getBounds();
      const boundsCenter = bounds.getCenter();
      
      setMarkerPos(null); // Clear manual pin if they draw
      
      onPolygonDrawn(
        JSON.stringify(layer.toGeoJSON()),
        areaAcres,
        boundsCenter.lat,
        boundsCenter.lng
      );
    }
  };

  const onCreated = (e: any) => {
    const layer = e.layer;
    if (layer instanceof L.Polygon) {
      const featureGroup = featureGroupRef.current;
      if (featureGroup) {
        featureGroup.clearLayers();
        featureGroup.addLayer(layer);
      }
      calculateAreaAndNotify(layer);
    }
  };

  const onEdited = (e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: any) => {
      if (layer instanceof L.Polygon) {
        calculateAreaAndNotify(layer);
      }
    });
  };

  const onDeleted = (e: any) => {};

  return (
    <div className="h-[350px] md:h-[450px] w-full rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(18,53,36,0.1)] border-2 border-[#123524]/20 z-10 relative group">
      <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold text-[#123524] shadow-lg pointer-events-none opacity-90">
        {t("plots.satellite_mapper")}
      </div>
      <MapContainer 
        center={center} 
        zoom={15} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', zIndex: 1, cursor: 'crosshair' }}
      >
        <LocateControl onLocationFound={(latlng) => setUserLocation(latlng)} />
        <MapUpdater center={hasLocation ? center : null} />
        <MapEvents />
        
        {userLocation && (
          <>
            <CircleMarker 
              center={userLocation} 
              radius={7} 
              pathOptions={{ fillColor: '#3b82f6', color: '#ffffff', weight: 2, fillOpacity: 1 }} 
            />
            <CircleMarker 
              center={userLocation} 
              radius={18} 
              pathOptions={{ fillColor: '#3b82f6', stroke: false, fillOpacity: 0.2 }} 
            />
          </>
        )}

        {markerPos && <Marker position={markerPos} />}
        {/* Satellite Imagery from Esri */}
        <TileLayer
          attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topright"
            onCreated={onCreated}
            onEdited={onEdited}
            onDeleted={onDeleted}
            draw={{
              rectangle: false,
              polyline: false,
              circle: false,
              circlemarker: false,
              marker: false,
              polygon: {
                allowIntersection: false,
                drawError: { color: '#e1e100', message: t("plots.error_intersecting") },
                shapeOptions: { color: '#3e7b27', fillColor: '#123524', fillOpacity: 0.4, weight: 3 }
              }
            }}
          />
        </FeatureGroup>
      </MapContainer>
    </div>
  );
}
