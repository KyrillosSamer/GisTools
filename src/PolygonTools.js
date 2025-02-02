import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import $ from 'jquery';
import { area, booleanIntersects, length } from '@turf/turf';
import { saveAs } from 'file-saver';
import shpwrite from '@mapbox/shp-write';
import * as shapefile from 'shapefile';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './polygonTools.css';
import { FaDownload  } from "react-icons/fa";
import { BsIntersect} from "react-icons/bs";
import { IoMdInformationCircleOutline } from "react-icons/io";
import { LuMousePointer } from "react-icons/lu";
import { FaPlusMinus } from "react-icons/fa6";
// import myLogo from './sdi_logo.png';



// blue icon
const customIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.0.3/dist/images/marker-icon.png', 
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

//-- red icon
const overlappingIcon = L.icon({
    iconUrl: 'https://img.icons8.com/ios-filled/50/ff0000/marker.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

// All variables
    const PolygonTools = () => {
    const mapRef = useRef(null);
    const drawnItemsRef = useRef(new L.FeatureGroup());
    const [map, setMap] = useState(null);
    const [shapesData, setShapesData] = useState([]);
    const [uploadedData, setUploadedData] = useState([]);
    const [selectedLayers, setSelectedLayers] = useState([]);
    const [overlappingShapes, setOverlappingShapes] = useState([]);
    const [showPopup, setShowPopup] = useState(false);
 
    
    const [wfsData, setWfsData] = useState([]);
    const [wfsUrl, setWfsUrl] = useState('');
    const [wfsLayerName, setWfsLayerName] = useState('');

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        const initialMap = L.map(mapRef.current, {
            minZoom: 4,
            maxZoom: 18
        }).setView([27.59063, 31.274659], 7);
        
        const baseMaps = {
            OpenStreetMap: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
                attribution: '© OpenStreetMap contributors',
            }),
            Imagery: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '&copy; Esri | &copy; OpenStreetMap contributors',
            }),
        };

        baseMaps.Imagery.addTo(initialMap);
        initialMap.addLayer(drawnItemsRef.current);

        const drawControl = new L.Control.Draw({
            draw: {
                polygon: true,
                polyline: true,
                rectangle: true,
                circle: true,
                marker: true,
                circlemarker: true,
            },
            edit: {
                featureGroup: drawnItemsRef.current,
            },
        });

        initialMap.addControl(drawControl);
        initialMap.on(L.Draw.Event.CREATED, handleDrawCreated);
        setMap(initialMap);

        return () => {
            initialMap.off(L.Draw.Event.CREATED, handleDrawCreated);
            initialMap.remove();
        };
    }, []);

    //-- Wms Layer
    const addWMSLayer = (url, layerName) => {
        const wmsLayer = L.tileLayer.wms(url, {
          layers: layerName,
          format: 'image/png',
          transparent: true,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
    
        map.addLayer(wmsLayer);
      };
    


      // -- Wfs Layer
      const addWFSLayer = (url, layerName) => {
        $.getJSON(url, function (data) {
          const geoLayer = L.geoJSON(data, {
            onEachFeature: function (feature, layer) {
              if (feature.properties && feature.properties.name) {
                layer.bindPopup(`<h1>${feature.properties.name}</h1>`);
              }
            },
          }).addTo(map);
    
          const bounds = geoLayer.getBounds();
          map.fitBounds(bounds);
    
          setWfsData((prev) => {
            const updatedData = [...prev, ...data.features];
            console.log('WFS Data:', updatedData);
            return updatedData;
          });
          logAllData(); // Call function to gather all data automatically
        }).fail(function (jqXHR, textStatus, errorThrown) {
          console.error('فشل في تحميل بيانات WFS:', textStatus, errorThrown);
          alert('فشل في تحميل بيانات WFS');
        });
      };
    
      const handleAddWFS = (event) => {
        event.preventDefault();
        if (wfsUrl && wfsLayerName) {
          addWFSLayer(wfsUrl, wfsLayerName);
          setWfsUrl('');
          setWfsLayerName('');
        }
      };
    
      

    const handleDrawCreated = (event) => {
        const layer = event.layer;

        // marker for data is point
        if (layer instanceof L.Marker) {
            const markerLayer = L.marker(layer.getLatLng(), { icon: customIcon });
            drawnItemsRef.current.addLayer(markerLayer);
        } else {
            drawnItemsRef.current.addLayer(layer);
        }

        const geoJSON = layer.toGeoJSON();
        setShapesData(prev => [...prev, geoJSON]);

        // for circle display data
        if (layer instanceof L.Circle) {
            const radius = layer.getRadius().toFixed(2); 
            layer.bindPopup(`نصف القطر: ${radius} متر`).openPopup();
        }
    };

    const togglePopup = () => {
        setShowPopup(prev => !prev);
        drawnItemsRef.current.eachLayer(layer => {
            if (showPopup) {
                layer.closePopup();
                layer.unbindPopup();
                if (layer instanceof L.Path) {
                    layer.setStyle({ color: 'blue' });
                }
            } else {
                if (layer instanceof L.Polygon) {
                    const areaValue = area(layer.toGeoJSON().geometry).toFixed(2);
                    layer.bindPopup(`المساحة: ${areaValue} متر مربع`).openPopup();
                } else if (layer instanceof L.Polyline) {
                    const lineLength = length(layer.toGeoJSON().geometry).toFixed(2);
                    layer.bindPopup(`طول الخط: ${lineLength} متر`).openPopup();
                } else if (layer instanceof L.Circle) {
                    const radius = layer.getRadius().toFixed(2); // نصف القطر بالمتر
                    layer.bindPopup(`نصف القطر: ${radius} متر`).openPopup();
                } else if (layer instanceof L.Marker) {
                    const coords = layer.getLatLng();
                    layer.bindPopup(`الإحداثيات: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`).openPopup();
                }
            }
        });
    };

    const checkOverlapAndMark = () => {
        const allGeoJSONFeatures = [...shapesData, ...uploadedData];
        drawnItemsRef.current.eachLayer(layer => {
            if (layer.setStyle) {
                layer.setStyle({ color: 'blue' });
            }
        });

        const overlappingIndices = new Set();
        const overlappingShapesTemp = [];
        allGeoJSONFeatures.forEach((geoA, indexA) => {
            allGeoJSONFeatures.forEach((geoB, indexB) => {
                if (indexA !== indexB && geoA.geometry && geoB.geometry) {
                    if (booleanIntersects(geoA.geometry, geoB.geometry)) {
                        overlappingIndices.add(indexA);
                        overlappingIndices.add(indexB);
                    }
                }
            });
        });

        overlappingIndices.forEach(index => {
            const feature = allGeoJSONFeatures[index];
            overlappingShapesTemp.push(feature);
            drawnItemsRef.current.eachLayer(layer => {
                if (layer.toGeoJSON().geometry && JSON.stringify(layer.toGeoJSON().geometry) === JSON.stringify(feature.geometry)) {
                    if (layer.setStyle) {
                        layer.setStyle({ color: 'red' });
                    }
                }
            });
        });

        // change icon from blue to Red
        drawnItemsRef.current.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                const markerGeoJSON = layer.toGeoJSON();
                if (overlappingShapesTemp.some(overlapShape => booleanIntersects(markerGeoJSON.geometry, overlapShape.geometry))) {
                    layer.setIcon(overlappingIcon);
                } else {
                    layer.setIcon(customIcon); 
                }
            }
        });

        setOverlappingShapes(overlappingShapesTemp);
        if (overlappingIndices.size === 0) {
            alert('لم يتم العثور على أشكال متداخلة.');
        }
    };

   

    const exportShapefile = () => {
        const allFeatures = [...shapesData, ...uploadedData].map((feature, index) => ({
            type: 'Feature',
            properties: { name: `Feature ${index + 1}` },
            geometry: feature.geometry,
        }));

        if (allFeatures.length === 0) {
            alert('لا يوجد ملفات لتنزيلها.');
            return;
        }

        const data = { type: 'FeatureCollection', features: allFeatures };
        shpwrite.zip(data, { outputType: 'blob' })
            .then(zipBlob => saveAs(zipBlob, 'my_shapefile.zip'))
            .catch(error => console.error('Error exporting shapefile:', error));
    };

    const exportOverlappingShapefile = () => {
        const overlappingFeatures = overlappingShapes.map((feature, index) => ({
            type: 'Feature',
            properties: { name: `Feature ${index + 1}` },
            geometry: feature.geometry,
        }));

        if (overlappingFeatures.length === 0) {
            alert('لا يوجد بيانات متداخلة لتنزيلها.');
            return;
        }

        const data = { type: 'FeatureCollection', features: overlappingFeatures };
        shpwrite.zip(data, { outputType: 'blob' })
            .then(zipBlob => saveAs(zipBlob, 'overlapping_shapefile.zip'))
            .catch(error => console.error('Error exporting overlapping shapefile:', error));
    };

    const handleUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const data = e.target.result;
                shapefile.open(data).then(source => {
                    source.read().then(function processFeature(result) {
                        if (result.done) return;
                        const feature = result.value;
                        const geoLayer = L.geoJSON(feature).eachLayer(layer => {
                            drawnItemsRef.current.addLayer(layer);
                        });
                        setUploadedData(prev => [...prev, feature]);
                        source.read().then(processFeature);
                    });
                }).catch(error => console.error('خطأ في قراءة ملف الشكل:', error));
            };
            reader.readAsArrayBuffer(file);
        }
    };

    const enableShapeSelection = () => {
        if (map) {
            map.on('click', handleMapClick);
        }
    };

    const handleMapClick = (e) => {
        map.eachLayer((layer) => {
            if (layer instanceof L.Path && layer.getBounds().contains(e.latlng)) {
                setSelectedLayers((prev) => {
                    if (prev.some(selectedLayer => selectedLayer._leaflet_id === layer._leaflet_id)) {
                        return prev.filter(selectedLayer => selectedLayer._leaflet_id !== layer._leaflet_id);
                    } else {
                        return [...prev, layer];
                    }
                });
            }
        });
    };

    useEffect(() => {
        drawnItemsRef.current.eachLayer(layer => {
            if (selectedLayers.includes(layer)) {
                if (layer.setStyle) {
                    layer.setStyle({ color: 'green' });
                }
            } else {
                if (layer.setStyle) {
                    layer.setStyle({ color: 'blue' });
                }
            }
        });
    }, [selectedLayers]);

    const logAllData = () => {
        console.log('Shapes Data:', shapesData);
        console.log('Uploaded Data:', uploadedData);
        console.log('Selected Layers:', selectedLayers);
        console.log('Overlapping Shapes:', overlappingShapes);
        console.log('WFS Data:', wfsData);
    };
    

    return (
        <div style={{ display: 'absolute' }}>
            <div id="map" ref={mapRef} style={{ height: '91vh', flexGrow: 1 }} />

            {/* <div>
            
                <img src={myLogo} className='logoL' />
            </div> */}

            
            <div className='buttonss' >

                <button onClick={enableShapeSelection}>
                <LuMousePointer />
                 Select</button>
                <button onClick={checkOverlapAndMark}><BsIntersect className="icon1" />Intersect</button>

                <button onClick={togglePopup}>
                <IoMdInformationCircleOutline className="icon2" />
                    {showPopup ? 'Masking ' : 'View info'}
                </button>

                
                
                
                <input
                    type="file"
                    id="upload"
                    className='upload'
                    accept=".zip,.shp,.dbf"
                    onChange={handleUpload}
                     
                />

        {/* WMS Button */}
        <button
        
        
          onClick={() => {
            const url = prompt("أدخل رابط WMS:");
            const layerName = prompt("أدخل اسم طبقة WMS:");
            if (url && layerName) {
              addWMSLayer(url, layerName);
            }
          }}
        >
          <FaPlusMinus />
          Add WMS
        </button>

    <button
        
        onClick={() => {
        const wfsUrl = prompt("أدخل رابط WFS:");
        const wfsLayerName = prompt("أدخل اسم طبقة WFS:");
        if (wfsUrl && wfsLayerName) {
            addWFSLayer(wfsUrl, wfsLayerName);
        }
        }}
    >
        <FaPlusMinus />
        Add WFS
  </button>

            
            <button
                
                onClick={() => setIsDropdownOpen(prev => !prev)}
                >
                <FaDownload className="icon3" />
                <span className="content">Download</span>
            </button>
                <ul style={{ display: isDropdownOpen ? 'block' : 'none' }}>
                <li>
             <button className='tnzel' onClick={exportShapefile}>Download all</button>
                </li>
                <li>
            <button className='tnzel' onClick={exportOverlappingShapefile}>Download Intersected</button>
                </li>
                </ul>
            </div>

                
            </div>
    );
};

export default PolygonTools;
