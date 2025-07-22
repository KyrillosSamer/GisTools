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
import shp from "shpjs";


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
             position: 'topright', 
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
          logAllData();
        }).fail(function (jqXHR, textStatus, errorThrown) {
          console.error('فشل في تحميل بيانات WFS:', textStatus, errorThrown);
          alert('فشل في تحميل بيانات WFS');
        });
    };

    const handleDrawCreated = (event) => {
        const layer = event.layer;

        if (layer instanceof L.Marker) {
            const markerLayer = L.marker(layer.getLatLng(), { icon: customIcon });
            drawnItemsRef.current.addLayer(markerLayer);
        } else {
            drawnItemsRef.current.addLayer(layer);
        }

        const geoJSON = layer.toGeoJSON();
        setShapesData(prev => [...prev, geoJSON]);

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
                    const radius = layer.getRadius().toFixed(2);
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
    if (file && file.name.endsWith('.zip')) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const result = await shp(e.target.result);

                // إذا كانت طبقة واحدة فقط
                if (result && result.type === "FeatureCollection") {
                    L.geoJSON(result).eachLayer(layer => {
                        drawnItemsRef.current.addLayer(layer);
                    });
                    setUploadedData(prev => [...prev, ...result.features]);
                }

                // إذا كانت هناك طبقات متعددة
                else if (typeof result === 'object' && !Array.isArray(result)) {
                    const allFeatures = [];

                    for (const layerName in result) {
                        const layerData = result[layerName];
                        if (layerData.type === "FeatureCollection") {
                            L.geoJSON(layerData).eachLayer(layer => {
                                drawnItemsRef.current.addLayer(layer);
                            });
                            allFeatures.push(...layerData.features);
                        }
                    }

                    setUploadedData(prev => [...prev, ...allFeatures]);
                } else {
                    alert("لم يتم التعرف على محتوى الملف.");
                }
            } catch (error) {
                console.error('📛 خطأ في قراءة ملف ZIP:', error);
                alert('❌ تعذر قراءة الملف. تأكد أنه ملف ZIP يحتوي على ملفات Shapefile كاملة.');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert("يرجى رفع ملف ZIP يحتوي على ملفات Shapefile (.shp, .shx, .dbf)");
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
<div className="polygon-tools-container">
        {/* Title  */}

        <h1 style={{
            position: 'absolute',
            top: '-15px',
            left: '50%',
            transform: 'translateX(-50%)',  
            color: '#343a40',
            fontSize: '24px',
            fontWeight: 'bold',
            zIndex: 1000,
            width: '100%',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            height: '50px',
            paddingTop: '20px',
            }}>

            SpatialAnalysis
        </h1>
        
            {/* Simple Sidebar */}
 <div className="sidebar">

                <h3 style={{ 
                    margin: '0 0 20px 0', 
                    fontSize: '16px', 
                    color: '#495057',
                    borderBottom: '2px solid #007bff',
                    paddingBottom: '8px',
                    zIndex: 2000,
                }}>
                    Map Tools
                </h3>

                <button 
                    onClick={enableShapeSelection}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px',
                        border: '1px solid #007bff',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#007bff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        width: '85%'
                    }}
                    onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#007bff';
                        e.target.style.color = '#fff';
                    }}
                    onMouseOut={(e) => {
                        e.target.style.backgroundColor = '#fff';
                        e.target.style.color = '#007bff';
                    }}
                >
                    <LuMousePointer />
                    Select Shape
                </button>

                <button 
                    onClick={checkOverlapAndMark}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px',
                        border: '1px solid #28a745',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#28a745',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        width: '85%'
                    }}
                    onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#28a745';
                        e.target.style.color = '#fff';
                    }}
                    onMouseOut={(e) => {
                        e.target.style.backgroundColor = '#fff';
                        e.target.style.color = '#28a745';
                    }}
                >
                    <BsIntersect />
                    Find Intersects
                </button>

                <button 
                    onClick={togglePopup}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px',
                        border: '1px solid #17a2b8',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        color: '#17a2b8',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s',
                        width: '85%'
                    }}
                    onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#17a2b8';
                        e.target.style.color = '#fff';
                    }}
                    onMouseOut={(e) => {
                        e.target.style.backgroundColor = '#fff';
                        e.target.style.color = '#17a2b8';
                    }}
                >
                    <IoMdInformationCircleOutline />
                    {showPopup ? 'Hide Info' : 'Show Info'}
                </button>

                <div style={{
                    borderTop: '1px solid #dee2e6',
                    paddingTop: '15px',
                    marginTop: '10px'
                }}>
                    <h4 style={{ 
                        margin: '0 0 10px 0', 
                        fontSize: '14px', 
                        color: '#6c757d' 
                    }}>
                        File Upload
                    </h4>
                    <input
                        type="file"
                        accept=".zip,.shp,.dbf"
                        onChange={handleUpload}
                        style={{
                            width: '90%',
                            padding: '8px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '14px'
                        }}
                    />
                </div>

                <div style={{
                    borderTop: '1px solid #dee2e6',
                    paddingTop: '15px',
                    marginTop: '10px'
                }}>
                    <h4 style={{ 
                        margin: '0 0 10px 0', 
                        fontSize: '14px', 
                        color: '#6c757d' 
                    }}>
                        Add Layers
                    </h4>
                    
                    <button
                        onClick={() => {
                            const url = prompt("أدخل رابط WMS:");
                            const layerName = prompt("أدخل اسم طبقة WMS:");
                            if (url && layerName) {
                                addWMSLayer(url, layerName);
                            }
                        }}
                        style={{
                            width: '90%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            border: '1px solid #6c757d',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            color: '#6c757d',
                            cursor: 'pointer',
                            fontSize: '13px',
                            marginBottom: '5px'
                        }}
                    >
                        <FaPlusMinus />
                        Add WMS Layer
                    </button>

                    <button
                        onClick={() => {
                            const wfsUrl = prompt("أدخل رابط WFS:");
                            const wfsLayerName = prompt("أدخل اسم طبقة WFS:");
                            if (wfsUrl && wfsLayerName) {
                                addWFSLayer(wfsUrl, wfsLayerName);
                            }
                        }}
                        style={{
                            width: '90%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            border: '1px solid #6c757d',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            color: '#6c757d',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        <FaPlusMinus />
                        Add WFS Layer
                    </button>
                </div>

                <div style={{
                    borderTop: '1px solid #dee2e6',
                    paddingTop: '15px',
                    marginTop: '10px'
                }}>
                    <h4 style={{ 
                        margin: '0 0 10px 0', 
                        fontSize: '14px', 
                        color: '#6c757d' 
                    }}>
                        Download
                    </h4>
                    
                    <button 
                        onClick={exportShapefile}
                        style={{
                            width: '90%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            color: '#ffc107',
                            cursor: 'pointer',
                            fontSize: '13px',
                            marginBottom: '5px'
                        }}
                    >
                        <FaDownload />
                        Download All
                    </button>

                    <button 
                        onClick={exportOverlappingShapefile}
                        style={{
                            width: '90%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            border: '1px solid #dc3545',
                            borderRadius: '4px',
                            backgroundColor: '#fff',
                            color: '#dc3545',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        <FaDownload />
                        Download Intersected
                    </button>
                </div>
            </div>

            {/* Map Container */}
<div className="map-container">
                <div id="map" ref={mapRef} style={{ height: '100%', width: '100%' }} />
            </div>
        </div>
    );
};

export default PolygonTools;