import './style.css';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";

// =================================================================
// PASTE YOUR CESIUM ION ACCESS TOKEN HERE
// =================================================================
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMzc5YjBiNi0xZmJhLTQ1MTAtYjhlYy1jYjJiYjRlZDg1ZmEiLCJpZCI6MzQ1MzE5LCJpYXQiOjE3NTkwNjc2MDd9.SyEwT3AbwNULSHpDU8fOhLR3ztKfL3fpGxyI3sdfAbo';

// --- [FINAL ARCHITECTURE] GLOBAL STATE ---
let viewer;
let currentSimulation = createNewSimulationState();

// --- CONSTANTS ---
const AU_METERS = 149597870700;
const SUN_GRAVITATIONAL_PARAMETER = 1.32712440018e20;
// Adjusted scale factor for a better view of the inner solar system and NEOs
const NEO_VIEW_SCALE_FACTOR = 4.0e-7;

// Data for representative Near-Earth Objects (NEOs) by class
const neoData = {
    'Sun': { color: Cesium.Color.YELLOW, radius: 696340, elements: { a: 0, e: 0, i: 0, L: 0, peri: 0, node: 0 } },
    'Earth': { class: 'Planet', color: Cesium.Color.DODGERBLUE, elements: { a: 1.000002, e: 0.016708, i: -0.00005, L: 100.46435, peri: 102.94719, node: 0.0 } },
    '163693 Atira': { class: 'Atira', color: Cesium.Color.AQUAMARINE, elements: { a: 0.740, e: 0.322, i: 25.6, M: 180.3, peri: 242.1, node: 74.5 } },
    '2062 Aten': { class: 'Aten', color: Cesium.Color.PALEGREEN, elements: { a: 0.966, e: 0.182, i: 18.9, M: 270.8, peri: 134.1, node: 196.9 } },
    '1862 Apollo': { class: 'Apollo', color: Cesium.Color.VIOLET, elements: { a: 1.470, e: 0.560, i: 6.3, M: 38.1, peri: 285.8, node: 35.8 } },
    '1221 Amor': { class: 'Amor', color: Cesium.Color.ORANGERED, elements: { a: 1.919, e: 0.435, i: 11.8, M: 349.3, peri: 26.9, node: 171.1 } },
};
// Add this near the top of your file, after neoData or with other constants:
const asteroidPhysicalProperties = {
  "99942": { radius: 340, density: 3.1 },      // Apophis
  "101955": { radius: 492, density: 1.19 },    // Bennu
  "65803": { radius: 780, density: 2.25 },     // Didymos (primary)
  "dimorphos": { radius: 160, density: 2.4 },  // Dimorphos (moonlet)
  "433": { radius: 185, density: 2.67 },      // Eros (use longest axis for radius, km to m)
  "chicxulub": { radius: 12500, density: 2.75 } // Chicxulub (average diameter, km to m)
};

// When asteroid selection changes, set sliders if not custom:
function updateSliderState() {
  const isCustom = asteroidSelect && asteroidSelect.value === 'custom';
  if (densitySlider) densitySlider.disabled = !isCustom;
  if (radiusSlider) radiusSlider.disabled = !isCustom;

  // Optionally, visually indicate disabled state
  if (densitySlider) densitySlider.style.opacity = isCustom ? '1' : '0.5';
  if (radiusSlider) radiusSlider.style.opacity = isCustom ? '1' : '0.5';

  // --- Set baked values for selected asteroid ---
  if (!isCustom && asteroidSelect && asteroidPhysicalProperties[asteroidSelect.value]) {
    const props = asteroidPhysicalProperties[asteroidSelect.value];
    radiusSlider.value = props.radius;
    densitySlider.value = props.density;
    if (radiusValue) radiusValue.textContent = props.radius;
    if (densityValue) densityValue.textContent = props.density;
  } else {
    if (radiusValue) radiusValue.textContent = radiusSlider.value;
    if (densityValue) densityValue.textContent = densitySlider.value;
  }
  updateProbabilityDisplay();
  updateMitigationUI(); // <-- Add this line
}

const scenarios = {
  'bennu-malaysia': {
    asteroidId: '101955',
    impactPoint: Cesium.Cartesian3.fromDegrees(101.9758, 4.2105, 0),
    description: "Asteroid 101955 Bennu is on a collision course with Malaysia."
  }
};

/**
 * Creates a fresh, empty state object for a new simulation.
 */
function createNewSimulationState() {
    return {
        listeners: [],
        primitives: [],
        asteroid: {},
        mitigation: { isTargeting: false },
        neoView: { isInitialized: false, entities: [] }
    };
}

/**
 * --- MAIN INITIALIZATION FUNCTION ---
 */
function initializeViewer(viewMode) {
    if (viewer && !viewer.isDestroyed()) {
        cleanupCurrentSimulation(); // <-- Add this line
        viewer.destroy();
    }

    const viewerOptions = {
        shouldAnimate: true,
        infoBox: false,
        selectionIndicator: false,
    };

    if (viewMode === 'Earth') {
        viewerOptions.imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        });
        //viewerOptions.terrainProvider = Cesium.createWorldTerrain();

    } else { // NEOView
        viewerOptions.globe = false;
        viewerOptions.sceneMode = Cesium.SceneMode.SCENE3D;
    }

    viewer = new Cesium.Viewer('cesiumContainer', viewerOptions);

    // Enable comprehensive camera controls
    viewer.scene.screenSpaceCameraController.enableZoom = true;      // Pinch or scroll to zoom
    viewer.scene.screenSpaceCameraController.enableTilt = true;      // Two-finger drag to tilt
    viewer.scene.screenSpaceCameraController.enableLook = true;      // Right-drag or two-finger drag to look
    viewer.scene.screenSpaceCameraController.enableRotate = true;    // Left-drag or two-finger rotate
    viewer.scene.screenSpaceCameraController.enableTranslate = true; // Two-finger pan to move

    if (viewMode === 'Earth') {
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.showGroundAtmosphere = true;
    }

    viewer.clock.shouldAnimate = false;
    attachInteractiveEventListeners();
}

/**
 * Switches to the Earth view by completely re-initializing the viewer.
 */
function switchToEarthView() {
    console.log("Switching to Earth View...");
    initializeViewer('Earth');
    currentSimulation = createNewSimulationState();

    // --- NEW: Track Earth entity ---
    const earthEntity = viewer.entities.add({
        name: "Earth",
        position: Cesium.Cartesian3.fromDegrees(0, 0, 10000000), // Start far away
        point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT }
    });
    viewer.trackedEntity = undefined;

    centerCameraOnEarthOrImpact();
    viewer.trackedEntity = undefined;
    restoreDefaultCesiumCameraControls();
}

/**
 * Switches to the NEO view, showing major asteroid classes relative to Earth.
 */
function switchToNEOView() {
    console.log("Switching to NEO View...");
    initializeViewer('NEOView');
    currentSimulation = createNewSimulationState();

    // Add a simple entity for the Sun at the center
    viewer.entities.add({
        position: Cesium.Cartesian3.ZERO,
        point: {
            pixelSize: 20,
            color: Cesium.Color.YELLOW
        },
        label: {
            text: 'Sun',
            font: '14pt monospace',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
        }
    });

    for (const name in neoData) {
        if (name === 'Sun') continue; // Sun is already added

        const data = neoData[name];
        const elements = data.elements;
        
        // Draw the orbit path
        drawOrbit(elements);

        // Add the asteroid/planet as a simple point
        const neoEntity = viewer.entities.add({
            position: new Cesium.CallbackProperty((time) => keplerianToCartesian(elements, time, true), false),
            point: {
                pixelSize: (name === 'Earth') ? 8 : 5,
                color: data.color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1
            },
            label: {
                text: name,
                font: '12pt monospace',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -8),
                fillColor: data.color
            }
        });
        currentSimulation.neoView.entities.push(neoEntity);
    }
    
    // Set a top-down camera view similar to the YouTube reference
    viewer.camera.flyTo({
        destination: new Cesium.Cartesian3(0.0, 0.0, AU_METERS * 4 * NEO_VIEW_SCALE_FACTOR),
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        },
        duration: 0,
    });
    
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 86400 * 2; // 2 days per second
    viewer.clock.shouldAnimate = true;
    currentSimulation.neoView.isInitialized = true;
}


// --- ALL HELPER AND SIMULATION FUNCTIONS ---

function cleanupCurrentSimulation() {
    if (!viewer || viewer.isDestroyed()) return;
    
    currentSimulation.listeners.forEach(listener => {
        if (listener.type === 'interval') clearInterval(listener.id);
        else if (listener.type === 'onTick') viewer.clock.onTick.removeEventListener(listener.func);
    });

    viewer.entities.removeAll();
    viewer.scene.primitives.removeAll();
    currentSimulation = createNewSimulationState();

    updateDashboard({ diameter: '--', crater: '--', thermal: '--', wind: '--', blast: '--', earthquakes: '--', tsunami: '--' });
    updateMitigationDashboard({ 'target-status': 'NO', 'impactor-eta': '--', 'miss-distance': '--' });
    
    const targetingInstruction = document.getElementById('targeting-instruction');
    if(targetingInstruction) targetingInstruction.style.display = 'none';
    
    // SAFELY disable the execute-mitigation-btn button
    const executeMitigationBtn = document.getElementById('execute-mitigation-btn');
    if (executeMitigationBtn) executeMitigationBtn.disabled = true;

    viewer.impactVisualized = false;
    if(viewer.clock) viewer.clock.shouldAnimate = false;

    if (screenSpaceHandler) {
        screenSpaceHandler.destroy();
        screenSpaceHandler = null;
    }

    restoreDefaultCesiumCameraControls()
    viewer.trackedEntity = undefined;
}

function keplerianToCartesian(elements, julianDate, useScaling) {
    if (elements.a === 0) return Cesium.Cartesian3.ZERO;
    const scale = useScaling ? NEO_VIEW_SCALE_FACTOR : 1.0;
    // Use a standard epoch for all calculations (J2000.0)
    const epoch = 2451545.0; 
    const daysSinceEpoch = julianDate.dayNumber + julianDate.secondsOfDay / 86400 - epoch;
    const a_real = elements.a * AU_METERS;
    const a_scaled = a_real * scale;
    const e = elements.e;
    const i = Cesium.Math.toRadians(elements.i);
    const node = Cesium.Math.toRadians(elements.node);
    const peri = Cesium.Math.toRadians(elements.peri);
    const n_real = Math.sqrt(SUN_GRAVITATIONAL_PARAMETER / Math.pow(a_real, 3));
    let M;
    if (elements.M !== undefined) { // Use Mean Anomaly (M) if available
        const M0 = Cesium.Math.toRadians(elements.M);
        M = M0 + n_real * (daysSinceEpoch * 86400);
    } else { // Fallback to Mean Longitude (L)
        const L = Cesium.Math.toRadians(elements.L);
        const meanLongitude = L + Cesium.Math.toRadians(0.985609 * daysSinceEpoch);
        M = meanLongitude - peri;
    }
    // Solve Kepler's Equation for Eccentric Anomaly (E)
    let E = M;
    for (let k = 0; k < 10; k++) { E = M + e * Math.sin(E); }
    // Position in orbital plane
    const x_orb = a_scaled * (Math.cos(E) - e);
    const y_orb = a_scaled * Math.sqrt(1 - e * e) * Math.sin(E);
    // Rotation matrices components
    const cos_node = Math.cos(node), sin_node = Math.sin(node);
    const cos_peri = Math.cos(peri), sin_peri = Math.sin(peri);
    const cos_i = Math.cos(i), sin_i = Math.sin(i);
    // Rotate to ecliptic coordinates
    const x = (cos_node * cos_peri - sin_node * sin_peri * cos_i) * x_orb + (-cos_node * sin_peri - sin_node * cos_peri * cos_i) * y_orb;
    const y = (sin_node * cos_peri + cos_node * sin_peri * cos_i) * x_orb + (-sin_node * sin_peri + cos_node * cos_peri * cos_i) * y_orb;
    const z = (sin_peri * sin_i) * x_orb + (cos_peri * sin_i) * y_orb;
    return new Cesium.Cartesian3(x, y, z);
}
// Add this function to determine airburst vs ground impact
function getExplosionAltitude(radius, density, velocity = 20000) {
  // Simple breakup criterion:
  // - Small/weak (radius < 50m or density < 2) → airburst
  // - Large/strong (radius >= 100m and density >= 2.5) → ground impact
  // - Otherwise, estimate breakup altitude using dynamic pressure

  // Constants
  const atmDensity = 1.2; // kg/m³ at sea level
  const strength = density < 2 ? 1e6 : 5e6; // Pa, weaker for icy/porous, stronger for rock/metal

  // Estimate dynamic pressure at breakup: q = 0.5 * atmDensity * v^2
  const q = 0.5 * atmDensity * velocity * velocity; // Pa

  // If dynamic pressure exceeds strength, breakup occurs
  if (radius < 50 || density < 2 || q > strength) {
    // Airburst: estimate burst altitude (simplified)
    // For most airbursts, occurs between 10-30 km altitude
    let burstAltitude = 25000 - (radius * 100); // Larger = lower burst
    burstAltitude = Math.max(8000, Math.min(30000, burstAltitude));
    return { type: "airburst", altitude: burstAltitude };
  } else {
    // Ground impact
    return { type: "ground", altitude: 0 };
  }
}
function testShowAsteroid() {
  if (!viewer) {
    alert("Viewer not initialized!");
    return;
  }
  // Place at a visible location (e.g., over New York City, 10km up)
  const cartesian = Cesium.Cartesian3.fromDegrees(-74.006, 40.7128, 10000);

  // Remove previous test asteroid if it exists
  if (window._testAsteroidEntity && !window._testAsteroidEntity.isDestroyed) {
    viewer.entities.remove(window._testAsteroidEntity);
  }

  window._testAsteroidEntity = viewer.entities.add({
    name: "Test Asteroid",
    position: cartesian,
    model: {
      uri: '/Bennu.glb',
      scale: 400000, // Large for visibility
      minimumPixelSize: 150
    }
  });

  // Zoom to the asteroid
  viewer.zoomTo(window._testAsteroidEntity);
}

function drawOrbit(elements) {
    if (!viewer || viewer.isDestroyed()) return null;
    const positions = [];
    const a_m_real = elements.a * AU_METERS;
    if (a_m_real <= 0) return null;

    const period = 2 * Math.PI * Math.sqrt(Math.pow(a_m_real, 3) / SUN_GRAVITATIONAL_PARAMETER);
    const steps = 360;
    const epoch = 2451545.0; // J2000.0 epoch
    const dayNumber = Math.floor(epoch), secondsOfDay = (epoch - dayNumber) * 86400.0;
    const initialTime = new Cesium.JulianDate(dayNumber, secondsOfDay);

    for (let i = 0; i <= steps; i++) {
        const timeOffset = (i / steps) * period;
        const time = Cesium.JulianDate.addSeconds(initialTime, timeOffset, new Cesium.JulianDate());
        positions.push(keplerianToCartesian(elements, time, true));
    }
    return viewer.entities.add({ polyline: { positions: positions, width: 1, material: Cesium.Color.GRAY.withAlpha(0.5) } });
}


function runSimulationFor(asteroidId, impactPoint, startPosition) {
  if (viewer.scene.globe) {
    cleanupCurrentSimulation();
    visualizeAsteroid(asteroidId, impactPoint, startPosition);
  } else {
    switchToEarthView();
    restoreDefaultCesiumCameraControls();
    setTimeout(() => {
        if (viewer && !viewer.isDestroyed()) {
            visualizeAsteroid(asteroidId, impactPoint, startPosition);
        }
    }, 500); // Add a small delay to ensure the globe is ready
  }

  // --- NEW: Re-enable the mitigation button when a new simulation starts ---
  const executeMitigationBtn = document.getElementById('execute-mitigation-btn');
  if (executeMitigationBtn) {
      executeMitigationBtn.disabled = false;
  }
}

/**
 * Fetches asteroid data from NASA API and animates its impact on Earth.
 * Only visualizes the asteroid and animates its descent to the specified impact point.
 */
async function visualizeAsteroid(asteroidId, impactPoint, startPosition) {
    if (!viewer || viewer.isDestroyed()) return;

    // Fetch asteroid data (unchanged)
    const apiUrl = '/.netlify/functions/nasa?sstr=99942&ca-data=1&phys-par=1';
    let asteroidName = "Asteroid";
    let diameterKm = 0.5; // fallback default

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.object && data.object.fullname) asteroidName = data.object.fullname;
        if (data.phys_par) {
            const diameterObj = data.phys_par.find(p => p.name === 'diameter');
            if (diameterObj && diameterObj.value) diameterKm = parseFloat(diameterObj.value);
        }
    } catch (error) {
        console.warn("Failed to fetch or parse NASA asteroid data, using defaults.", error);
    }

    // Animate asteroid falling to the impact point
    // Start position: 2000 km above the impact point (or use startPosition if provided)
    let startCartesian;
    if (startPosition) {
        startCartesian = startPosition;
    } else {
        const surfaceCartographic = Cesium.Cartographic.fromCartesian(impactPoint);
        const height = 2000000; // 2000 km
        const startCartographic = new Cesium.Cartographic(
            surfaceCartographic.longitude,
            surfaceCartographic.latitude,
            height
        );
        startCartesian = Cesium.Ellipsoid.WGS84.cartographicToCartesian(startCartographic);
    }

    // Animation duration in seconds
    const duration = 2.5;
    const startTime = Cesium.JulianDate.now();
    const endTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

    // Set the viewer's clock to control the animation
    viewer.clock.startTime = startTime;
    viewer.clock.stopTime = endTime;
    viewer.clock.currentTime = startTime;
    viewer.clock.shouldAnimate = true; // Ensure animation is playing
    viewer.clock.multiplier = 1; // Play at normal speed

    // Create a sampled position property for smooth animation
    const property = new Cesium.SampledPositionProperty();
    property.addSample(startTime, startCartesian);
    property.addSample(endTime, impactPoint);

    // Add the asteroid entity
    const asteroidEntity = viewer.entities.add({
        name: asteroidName,
        position: property,
        model: {
            uri: '/Bennu.glb',
            scale: diameterKm * 120000, // scale for visibility
            minimumPixelSize: 50
        }
    });
    currentSimulation.asteroid.entity = asteroidEntity; 
    currentSimulation.asteroid.impactPoint = impactPoint;

    // Track the asteroid for the animation
    viewer.trackedEntity = asteroidEntity;

    // Use a clock listener to ensure impact effects trigger at the precise end of animation
    const impactAnimationListener = (clock) => {
        if (!viewer || viewer.isDestroyed()) {
            viewer.clock.onTick.removeEventListener(impactAnimationListener);
            return;
        }
        if (Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, endTime)) {
            viewer.clock.onTick.removeEventListener(impactAnimationListener);
            currentSimulation.listeners = currentSimulation.listeners.filter(l => l.func !== impactAnimationListener);

            viewer.entities.remove(asteroidEntity);
            viewer.trackedEntity = undefined;

            const { kineticEnergy } = getAsteroidImpactParameters();
            simulateImpact(impactPoint, kineticEnergy, null);
        }
    };

    viewer.clock.onTick.addEventListener(impactAnimationListener);
    currentSimulation.listeners.push({ type: 'onTick', func: impactAnimationListener });

    // Optionally update dashboard diameter to reflect fetched value
    updateDashboard({ diameter: diameterKm.toFixed(2) });
}

function planMitigation() {
    if (!viewer || viewer.isDestroyed() || !currentSimulation.asteroid.entity) return;
    currentSimulation.mitigation.isTargeting = true;
    document.getElementById('targeting-instruction').style.display = 'block';
    document.getElementById('execute-mitigation-btn').disabled = true;
    currentSimulation.mitigation.targetMarker = viewer.entities.add({ name: 'Targeting Reticle', position: Cesium.Cartesian3.fromDegrees(0,0,0), point: { pixelSize: 15, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2}, show: false });
}

function createFireball(asteroidEntity, impactEnergy) {
  if (!viewer || viewer.isDestroyed()) return;
  const fireball = viewer.entities.add({
    name: 'Atmospheric Fireball',
    position: new Cesium.CallbackProperty(() => {
        if (!asteroidEntity || asteroidEntity.isDestroyed) return null;
        return asteroidEntity.position.getValue(viewer.clock.currentTime);
    }, false),
    show: false,
    ellipsoid: { radii: new Cesium.Cartesian3(1, 1, 1), material: new Cesium.Color(1.0, 0.7, 0.2, 0.8) }
  });

  const maxRadius = Math.cbrt(impactEnergy) * 0.005;
  let hasEnteredAtmosphere = false;

  const checkAltitude = () => {
    if (!viewer || viewer.isDestroyed() || !asteroidEntity || asteroidEntity.isDestroyed) {
      if (viewer && !viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(checkAltitude);
      return;
    }
    const position = asteroidEntity.position.getValue(viewer.clock.currentTime);
    if (!position) return;

    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const altitude = cartographic.height;

    if (altitude > 0 && altitude < 120000) {
      fireball.show = true;
      if (!hasEnteredAtmosphere) {
        hasEnteredAtmosphere = true;
        viewer.clock.multiplier = 10;
        console.log("--- Atmospheric Entry: Engaging slow-motion. ---");
      }
      const progress = 1.0 - (altitude / 120000);
      fireball.ellipsoid.radii = new Cesium.Cartesian3(maxRadius * progress, maxRadius * progress, maxRadius * progress);
    } else {
      fireball.show = false;
    }
  };

  viewer.clock.onTick.addEventListener(checkAltitude);
  currentSimulation.listeners.push({ type: 'onTick', func: checkAltitude });
}

async function simulateTsunami(impactCartesian, kineticEnergy, energyInMegatons, thermalRadius) {
    if (!viewer || viewer.isDestroyed()) return;
    console.log("--- Ocean impact detected. Simulating tsunami. ---");
    const waveHeight = Math.pow(energyInMegatons, 0.5) * 50;
    updateDashboard({ tsunami: `Risk Detected (${waveHeight.toFixed(2)}m wave)` });
    let waveRadius = 1.0;
    const maxWaveRadius = thermalRadius * 1.25;
    const waveEntity = viewer.entities.add({
        position: impactCartesian,
        ellipse: {
            semiMinorAxis: new Cesium.CallbackProperty(() => waveRadius, false),
            semiMajorAxis: new Cesium.CallbackProperty(() => waveRadius, false),
            material: Cesium.Color.CYAN.withAlpha(0.4),
            extrudedHeight: new Cesium.CallbackProperty(() => waveHeight, false),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
        }
    });

    // Animate the tsunami wave expansion
    const animateWave = () => {
        if (!viewer || viewer.isDestroyed() || waveEntity.isDestroyed) {
            if(viewer && !viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(animateWave);
            return;
        }
        waveRadius += maxWaveRadius / 200.0;
        if (waveRadius >= maxWaveRadius) {
            viewer.clock.onTick.removeEventListener(animateWave);
        }
    };
    viewer.clock.onTick.addEventListener(animateWave);
    currentSimulation.listeners.push({ type: 'onTick', func: animateWave });

    // --- Robust terrain sampling for tsunami inundation ---
    try {
        if (!viewer.terrainProvider) throw new Error("Terrain provider not available");
        const impactCartographic = Cesium.Cartographic.fromCartesian(impactCartesian);
        const gridSize = 30;
        const searchRadiusDegrees = 1.5;
        const pointsToCheck = [];
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const lon = Cesium.Math.toDegrees(impactCartographic.longitude) - (searchRadiusDegrees / 2) + (i * searchRadiusDegrees / gridSize);
                const lat = Cesium.Math.toDegrees(impactCartographic.latitude) - (searchRadiusDegrees / 2) + (j * searchRadiusDegrees / gridSize);
                pointsToCheck.push(Cesium.Cartographic.fromDegrees(lon, lat));
            }
        }
        // Sample terrain heights for all points
        const updatedPoints = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, pointsToCheck);
        // Filter points that are above sea level but below the wave height
        const floodedPoints = updatedPoints
            .filter(c => c.height > 0 && c.height < waveHeight)
            .map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0));
        // Only draw inundation zone if enough points are flooded
        if (floodedPoints.length > 2) {
            viewer.entities.add({
                name: "Tsunami Inundation Zone",
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(floodedPoints),
                    material: Cesium.Color.BLUE.withAlpha(0.4),
                    classificationType: Cesium.ClassificationType.TERRAIN,
                }
            });
        }
    } catch (error) {
        console.error("Failed to sample terrain for tsunami:", error);
        updateDashboard({ tsunami: "Terrain data unavailable" });
    }
}

async function simulateImpact(impactCartesian, kineticEnergy, asteroidEntity) {
  if (!viewer || viewer.isDestroyed()) return;
  console.log("IMPACT! Visualizing physics-based consequences...");
  if (asteroidEntity && !asteroidEntity.isDestroyed) {
    viewer.entities.remove(asteroidEntity);
  }
  const impactCartographic = Cesium.Cartographic.fromCartesian(impactCartesian);
  const longitude = Cesium.Math.toDegrees(impactCartographic.longitude);
  const latitude = Cesium.Math.toDegrees(impactCartographic.latitude);
  const energyInMegatons = kineticEnergy / 4.184e15;
  const craterRadius = 50 * Math.pow(energyInMegatons, 0.33);
  const thermalRadius = 3000 * Math.pow(energyInMegatons, 0.41);
  const severeWindRadius = 2000 * Math.pow(energyInMegatons, 0.33);
  const airBlastRadius = 6000 * Math.pow(energyInMegatons, 0.33);

  // --- Get radius and density for explosion type ---
  let radius, density;
  if (typeof getAsteroidImpactParameters === "function") {
    const params = getAsteroidImpactParameters();
    radius = params.radiusMeters;
    density = params.density;
  } else {
    radius = 500;
    density = 3.0;
  }
  // --- Call getExplosionAltitude and update dashboard ---
  const explosionResult = getExplosionAltitude(radius, density);
  const dashExplosionType = document.getElementById('dash-explosion-type');
  if (dashExplosionType) {
    if (explosionResult.type === "airburst") {
      dashExplosionType.textContent = `Airburst at ${Math.round(explosionResult.altitude / 1000)} km`;
    } else {
      dashExplosionType.textContent = `Ground Impact`;
    }
  }

  // --- Update dashboard with kinetic energy ---
  updateDashboard({
    crater: (craterRadius / 1000).toFixed(2),
    thermal: (thermalRadius / 1000).toFixed(2),
    wind: (severeWindRadius / 1000).toFixed(2),
    blast: (airBlastRadius / 1000).toFixed(2),
    energy: energyInMegatons.toFixed(2) // <-- Add this line
  });

  let impactElevation = 1;
  try {
    if (!viewer.terrainProvider) throw new Error("Terrain provider not available");
    const updatedCartographics = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [impactCartographic]);
    impactElevation = updatedCartographics[0].height;
  } catch (error) {
    console.warn(`Could not determine impact elevation: ${error.message}.`);
  }
  if (impactElevation < 0) {
    simulateTsunami(impactCartesian, kineticEnergy, energyInMegatons, thermalRadius);
  } else {
    updateDashboard({ tsunami: "No Risk (Land Impact)" });
    // Draw the crater ellipse
    const craterEntity = viewer.entities.add({
      name: 'Impact Crater',
      position: impactCartesian,
      ellipse: {
        semiMinorAxis: craterRadius,
        semiMajorAxis: craterRadius,
        material: Cesium.Color.BLACK.withAlpha(0.7),
        classificationType: Cesium.ClassificationType.TERRAIN
      }
    });
    
    // Place the crater radius label at the edge of the crater, following the calculated radius and bearing north from the impact point
    const bearingRadians = 0; // 0 radians = due north
    const earthRadius = 6371000; // meters
    const latRad = Cesium.Math.toRadians(latitude);
    const lonRad = Cesium.Math.toRadians(longitude);
    const angularDistance = craterRadius / earthRadius;

    const labelLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRadians)
    );
    const labelLon = lonRad + Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(labelLat)
    );

    viewer.entities.add({
      position: Cesium.Cartesian3.fromRadians(labelLon, labelLat, 0),
      label: {
        text: `Crater Radius: ${(craterRadius / 1000).toFixed(2)} km`,
        font: '14pt monospace',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        fillColor: Cesium.Color.YELLOW
      }
    });
  }
  const explosion = viewer.entities.add({
    name: 'Explosion',
    position: impactCartesian,
    ellipsoid: {
      radii: new Cesium.Cartesian3(1, 1, 1),
      material: new Cesium.Color.YELLOW.withAlpha(0.9),
    }
  });
  let explosionRadius = 1;
  const explosionInterval = setInterval(() => {
    if (!viewer || viewer.isDestroyed() || explosion.isDestroyed) {
      clearInterval(explosionInterval);
      return;
    }
    explosionRadius += thermalRadius / 50;
    explosion.ellipsoid.radii = new Cesium.Cartesian3(explosionRadius, explosionRadius, explosionRadius * 0.7);
    if (explosionRadius > thermalRadius * 1.2) {
      clearInterval(explosionInterval);
      if (!explosion.isDestroyed) viewer.entities.remove(explosion);
    }
  }, 20);
  currentSimulation.listeners.push({ type: 'interval', id: explosionInterval });
  const createExpandingZone = (name, maxRadius, color, labelColor) => {
    let currentRadius = 1.0;
    const zoneEntity = viewer.entities.add({
      name: name,
      position: impactCartesian,
      ellipse: {
        semiMinorAxis: new Cesium.CallbackProperty(() => currentRadius, false),
        semiMajorAxis: new Cesium.CallbackProperty(() => currentRadius, false),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      }
    });
    const updateListener = () => {
      if (!viewer || viewer.isDestroyed() || zoneEntity.isDestroyed) {
        if(viewer && !viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(updateListener);
        return;
      }
      currentRadius += maxRadius / 50.0; // was 150.0, now 50.0 for 3x faster
      currentRadius += maxRadius / 150.0;
      if (currentRadius >= maxRadius) {
        currentRadius = maxRadius;
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(longitude, latitude + (maxRadius / 111111)),
          label: {
            text: `${name}\n(${(maxRadius / 1000).toFixed(2)} km)`,
            font: '14pt monospace',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -9),
            fillColor: labelColor
          }
        });
        viewer.clock.onTick.removeEventListener(updateListener);
      }
    };
    viewer.clock.onTick.addEventListener(updateListener);
    currentSimulation.listeners.push({ type: 'onTick', func: updateListener });
  };
  createExpandingZone('Thermal Zone', thermalRadius, Cesium.Color.RED.withAlpha(0.3), Cesium.Color.RED);
  setTimeout(() => createExpandingZone('Shockwave Zone', severeWindRadius, Cesium.Color.PURPLE.withAlpha(0.3), Cesium.Color.PURPLE), 1000);
  setTimeout(() => createExpandingZone('Wind Burst Zone', airBlastRadius, Cesium.Color.WHITE.withAlpha(0.2), Cesium.Color.WHITE), 2000);
  const usgsUrl = `/.netlify/functions/usgs/fdsnws/event/1/query?format=geojson&starttime=2020-01-01&latitude=${latitude}&longitude=${longitude}&maxradiuskm=500&minmagnitude=4`;
  try {
    const response = await fetch(usgsUrl);
    const usgsData = await response.json();
    console.log(`Found ${usgsData.features.length} significant seismic events (Magnitude 4+) from USGS API.`);
    updateDashboard({ earthquakes: usgsData.features.length });
    if (usgsData.features.length > 0) {
        // Helper to map magnitude to Cesium.Color (transparent for 0, dark red for 10)
        function getSeismicColor(mag) {
            // Clamp magnitude between 0 and 10
            const clamped = Math.max(0, Math.min(10, mag));
            // Interpolate alpha and color
            const alpha = 0.1 + 0.7 * (clamped / 10); // 0.1 to 0.8
            // Color from transparent to dark red
            return Cesium.Color.fromBytes(139, 0, 0, Math.floor(alpha * 255));
        }

        // Group events by magnitude (rounded to nearest integer)
        const magBuckets = {};
        usgsData.features.forEach(event => {
            const mag = Math.round(event.properties.mag);
            if (!magBuckets[mag]) magBuckets[mag] = [];
            magBuckets[mag].push(event);
        });

        // For each magnitude bucket, draw an ellipse covering the events in that bucket
        Object.keys(magBuckets).forEach(magKey => {
            const events = magBuckets[magKey];
            // Center: average location of events in this bucket
            const avgLon = events.reduce((sum, e) => sum + e.geometry.coordinates[0], 0) / events.length;
            const avgLat = events.reduce((sum, e) => sum + e.geometry.coordinates[1], 0) / events.length;
            // Max distance from center for ellipse radius
            const maxDist = Math.max(...events.map(e => {
                const dx = e.geometry.coordinates[0] - avgLon;
                const dy = e.geometry.coordinates[1] - avgLat;
                return Math.sqrt(dx * dx + dy * dy);
            }));
            const radiusMeters = Math.max(20000, maxDist * 111000); // at least 20km

            viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(avgLon, avgLat),
                ellipse: {
                    semiMinorAxis: radiusMeters,
                    semiMajorAxis: radiusMeters,
                    material: getSeismicColor(Number(magKey)),
                    outline: false
                }
            });
        });

        // Add a label at the overall average location showing the max magnitude
        const allLons = usgsData.features.map(e => e.geometry.coordinates[0]);
        const allLats = usgsData.features.map(e => e.geometry.coordinates[1]);
        const avgLon = allLons.reduce((a, b) => a + b, 0) / allLons.length;
        const avgLat = allLats.reduce((a, b) => a + b, 0) / allLats.length;
        const maxMagnitude = Math.max(...usgsData.features.map(event => event.properties.mag));

        viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(avgLon, avgLat),
            label: {
                text: `Seismic Activity\nMax M${maxMagnitude.toFixed(1)}`,
                font: '12pt monospace',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, 12),
                fillColor: Cesium.Color.WHITE
            }
        });
    }
  } catch (error) {
    console.error("Failed to fetch USGS data:", error);
  }
}

function executeMitigation(interceptionTime) {
    if (!viewer || viewer.isDestroyed()) return;
    console.log("--- KINETIC IMPACT DETECTED ---");
    const { mass, entity } = currentSimulation.asteroid;
    const pos1 = entity.position.getValue(Cesium.JulianDate.addSeconds(interceptionTime, -1, new Cesium.JulianDate()));
    const pos2 = entity.position.getValue(interceptionTime);
    const velocityVector = Cesium.Cartesian3.divideByScalar(Cesium.Cartesian3.subtract(pos2, pos1, new Cesium.Cartesian3()), 1, new Cesium.Cartesian3());
    const impactorMassKg = 600; const impactorVelocityMps = 6100; const beta = 3.6;
    const normalizedVelocity = Cesium.Cartesian3.normalize(velocityVector, new Cesium.Cartesian3());
    const impactorVelocityVector = Cesium.Cartesian3.multiplyByScalar(normalizedVelocity, -impactorVelocityMps, new Cesium.Cartesian3());
    const deltaMomentum = Cesium.Cartesian3.multiplyByScalar(impactorVelocityVector, beta * impactorMassKg, new Cesium.Cartesian3());
    const deltaV = Cesium.Cartesian3.divideByScalar(deltaMomentum, mass, new Cesium.Cartesian3());
    const newVelocityVector = Cesium.Cartesian3.add(velocityVector, deltaV, new Cesium.Cartesian3());
    const timeRemainingSeconds = Cesium.JulianDate.secondsDifference(viewer.clock.stopTime, interceptionTime);
    const displacement = Cesium.Cartesian3.multiplyByScalar(newVelocityVector, timeRemainingSeconds, new Cesium.Cartesian3());
    const newEndPosition = Cesium.Cartesian3.add(pos2, displacement, new Cesium.Cartesian3());
    entity.path.show = false;
    const deflectedPosition = new Cesium.SampledPositionProperty();
    deflectedPosition.addSample(interceptionTime, pos2);
    deflectedPosition.addSample(viewer.clock.stopTime, newEndPosition);
    const deflectedAsteroid = viewer.entities.add({
        name: `${entity.name} (Deflected)`, position: deflectedPosition, model: { uri: '/Bennu.glb', scale: parseFloat(document.getElementById('dash-diameter').textContent) * 50000, minimumPixelSize: 50 },
        path: { resolution: 1, width: 3, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.LIMEGREEN }), leadTime: 18000, trailTime: 18000, },
    });
    currentSimulation.asteroid.deflectedEntity = deflectedAsteroid;
    const missDistanceMeters = Cesium.Cartesian3.distance(currentSimulation.asteroid.impactPoint, newEndPosition);
    updateMitigationDashboard({ 'miss-distance': (missDistanceMeters / 1000).toFixed(2) });
    const originalOnTick = currentSimulation.listeners.find(l => l.func.toString().includes('viewer.impactVisualized = true'));
    if (originalOnTick) viewer.clock.onTick.removeEventListener(originalOnTick.func);
    const deflectedImpactCallback = (clock) => {
        if (!viewer || viewer.isDestroyed()) {
            if(viewer && !viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(deflectedImpactCallback);
            return;
        }
        if (Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)) {
            simulateImpact(newEndPosition, currentSimulation.asteroid.kineticEnergy, deflectedAsteroid);
            viewer.clock.onTick.removeEventListener(deflectedImpactCallback);
        }
    };
    viewer.clock.onTick.addEventListener(deflectedImpactCallback);
    currentSimulation.listeners.push({ type: 'onTick', func: deflectedImpactCallback });
}

function launchImpactor(interceptionTime, interceptionPoint) {
    if (!viewer || viewer.isDestroyed()) return;
    console.log("--- LAUNCHING KINETIC IMPACTOR ---");
    updateMitigationDashboard({ 'target-status': 'LOCKED' });
    const startOfPath = viewer.clock.startTime;
    const impactorStartPosition = new Cesium.Cartesian3(0.0, -10000000.0, 10000000.0);
    const impactorTravelPath = new Cesium.SampledPositionProperty();
    impactorTravelPath.addSample(startOfPath, impactorStartPosition);
    impactorTravelPath.addSample(interceptionTime, interceptionPoint);
    const impactorDisplayPosition = new Cesium.CallbackProperty((time, result) => {
        if (Cesium.JulianDate.greaterThan(interceptionTime, time)) {
            return impactorTravelPath.getValue(time, result);
        } else if (currentSimulation.asteroid.deflectedEntity) {
            return currentSimulation.asteroid.deflectedEntity.position.getValue(time, result);
        }
        return interceptionPoint;
    }, false);
    currentSimulation.mitigation.impactorEntity = viewer.entities.add({
        name: 'DART Impactor', position: impactorDisplayPosition,
        model: { uri: '/DART.glb', scale: 20000, minimumPixelSize: 75 },
        path: { resolution: 1, width: 2, material: Cesium.Color.LIMEGREEN }
    });
    const impactorETAlistener = (clock) => {
        if (!viewer || viewer.isDestroyed()) {
            if(viewer && !viewer.isDestroyed()) viewer.clock.onTick.removeEventListener(impactorETAlistener);
            return;
        }
        const etaSeconds = Cesium.JulianDate.secondsDifference(interceptionTime, clock.currentTime);
        if (etaSeconds > 0) {
            updateMitigationDashboard({ 'impactor-eta': `${Math.round(etaSeconds)} s` });
        } else {
            updateMitigationDashboard({ 'impactor-eta': 'IMPACT' });
            executeMitigation(interceptionTime);
            viewer.clock.onTick.removeEventListener(impactorETAlistener);
        }
    };
    viewer.clock.onTick.addEventListener(impactorETAlistener);
    currentSimulation.listeners.push({ type: 'onTick', func: impactorETAlistener });
}

let screenSpaceHandler = null;

function attachInteractiveEventListeners() {
    if (!viewer || viewer.isDestroyed()) return;
    if (screenSpaceHandler) {
        screenSpaceHandler.destroy();
        screenSpaceHandler = null;
    }
    screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // LEFT_CLICK for targeting/interception and sandbox asteroid placement
    screenSpaceHandler.setInputAction((movement) => {
        if (!viewer || viewer.isDestroyed()) return;
        
        const pickedObject = viewer.scene.pick(movement.position);

        if (currentSimulation.mitigation.isTargeting) {
            if (Cesium.defined(pickedObject) && pickedObject.id === currentSimulation.asteroid.entity) {
                if (!viewer.scene.globe) return;
                const ray = viewer.camera.getPickRay(movement.position);
                const interceptionPoint = viewer.scene.globe.pick(ray, viewer.scene);
                if(!interceptionPoint) return; 

                const positionProperty = currentSimulation.asteroid.entity.position;
                const start = viewer.clock.startTime; const stop = viewer.clock.stopTime;
                let closestTime = start; let minDistance = Number.MAX_VALUE;
                const totalSeconds = Cesium.JulianDate.secondsDifference(stop, start);
                for (let i = 0; i <= 100; i++) {
                    const t = i / 100.0;
                    const time = Cesium.JulianDate.addSeconds(start, totalSeconds * t, new Cesium.JulianDate());
                    const pos = positionProperty.getValue(time);
                    if (pos) {
                        const distance = Cesium.Cartesian3.distance(pos, interceptionPoint);
                        if (distance < minDistance) { minDistance = distance; closestTime = time; }
                    }
                }
                currentSimulation.mitigation.interceptionPoint = positionProperty.getValue(closestTime);
                currentSimulation.mitigation.interceptionTime = closestTime;
                currentSimulation.mitigation.isTargeting = false;
                const targetingInstruction = document.getElementById('targeting-instruction');
                if (targetingInstruction) targetingInstruction.style.display = 'none';
                if (currentSimulation.mitigation.targetMarker) viewer.entities.remove(currentSimulation.mitigation.targetMarker);
                launchImpactor(closestTime, currentSimulation.mitigation.interceptionPoint);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // MOUSE_MOVE for targeting reticle
    screenSpaceHandler.setInputAction((movement) => {
        if (!viewer || viewer.isDestroyed() || !currentSimulation.mitigation.isTargeting || !currentSimulation.asteroid.entity || !currentSimulation.mitigation.targetMarker) {
            return;
        }
        if (currentSimulation.mitigation.targetMarker.isDestroyed()) return;

        const pickedObject = viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(pickedObject) && pickedObject.id === currentSimulation.asteroid.entity) {
            const ray = viewer.camera.getPickRay(movement.endPosition);
            if (viewer.scene.globe) {
                const position = viewer.scene.globe.pick(ray, viewer.scene);
                if (position) {
                    currentSimulation.mitigation.targetMarker.position = position;
                    currentSimulation.mitigation.targetMarker.show = true;
                } else {
                    currentSimulation.mitigation.targetMarker.show = false;
                }
            }
        } else {
            currentSimulation.mitigation.targetMarker.show = false;
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Remove any previous double-click handler
    if (window._astroDoubleClickHandler) {
      window._astroDoubleClickHandler.destroy();
      window._astroDoubleClickHandler = null;
    }
    window._astroDoubleClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    window._astroDoubleClickHandler.setInputAction((movement) => {
      if (!viewer || !viewer.scene.globe) return;
      const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        launchMeteorToPoint(cartesian);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

/**
 * Restores default Cesium camera controls and untracks any entity.
 */
function restoreDefaultCesiumCameraControls() {
    if (!viewer || viewer.isDestroyed()) return;
    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableTilt = true;
    controller.enableLook = true;
    controller.enableRotate = true;
    controller.enableTranslate = true;
    controller.inertiaSpin = 0.9;
    controller.inertiaTranslate = 0.8;
    controller.inertiaZoom = 0.8;
    controller.minimumZoomDistance = 1.0;
    controller.maximumZoomDistance = 1e9;
    viewer.trackedEntity = undefined;
}

/**
 * Keeps the camera centered on the last impact point if available, otherwise on Earth.
 */
function centerCameraOnEarthOrImpact() {
    if (!viewer || viewer.isDestroyed()) return;

    let destination;
    if (
        currentSimulation &&
        currentSimulation.asteroid &&
        currentSimulation.asteroid.impactPoint
    ) {
        // Only add vertical height above the impact point, do not offset north
        const impactCartographic = Cesium.Cartographic.fromCartesian(currentSimulation.asteroid.impactPoint);
        destination = Cesium.Ellipsoid.WGS84.cartographicToCartesian(
            new Cesium.Cartographic(
                impactCartographic.longitude - 2.5 * Cesium.Math.PI / 180, // Offset west by 2.5 degrees for better view
                impactCartographic.latitude - 2.5 * Cesium.Math.PI / 180,  // Offset south by 2.5 degrees for better view
                10000000 // 10,000,000 meters = 10000km above impact point
            )
        );
    } else {
        // Default to Earth's center, 25,000km above
        destination = Cesium.Cartesian3.fromDegrees(0, 0, 25000000);
    }

    viewer.camera.flyTo({
        destination: destination,
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        },
        duration: 0.8
    });
}

// Presentation-only: Animate a visible asteroid falling to the double-clicked location
function animateAsteroidFall(targetCartesian) {
  // Always use the default model for presentation
  const modelUri = '/Bennu.glb';

  // Start position: 2000 km above the target point
  const surfaceCartographic = Cesium.Cartographic.fromCartesian(targetCartesian);
  const height = 2000000; // 2000 km
  const startCartographic = new Cesium.Cartographic(
    surfaceCartographic.longitude,
    surfaceCartographic.latitude,
    height
  );
  const startCartesian = Cesium.Ellipsoid.WGS84.cartographicToCartesian(startCartographic);

  // Animation duration in seconds
  const duration = 10.0;
  const startTime = Cesium.JulianDate.now();
  const endTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

  // Create a sampled position property for smooth animation
  const property = new Cesium.SampledPositionProperty();
  property.addSample(startTime, startCartesian);
  property.addSample(endTime, targetCartesian);

  // Add a large, visible meteor entity for presentation
  const meteorEntity = viewer.entities.add({
    name: "Meteor (Presentation)",
    position: property,
    model: {
      uri: modelUri,
      scale: 400000, // Large fixed size for visibility
      minimumPixelSize: 120
    }
  });
    viewer.trackedEntity = meteorEntity;
  // Animate the clock for the meteor (does not affect simulation time)


  // After animation, remove meteor
  setTimeout(() => {
    viewer.entities.remove(meteorEntity);
  }, duration * 1000);
}

// Presentation-only: Animate a visible meteor model impacting Earth at the specified location
function animateMeteorImpactPresentation(targetCartesian) {
  const modelUri = '/Bennu.glb'; // Always use the default model for presentation

  // Start position: 2000 km above the target point
  const surfaceCartographic = Cesium.Cartographic.fromCartesian(targetCartesian);
  const height = 2000000; // 2000 km
  const startCartographic = new Cesium.Cartographic(
    surfaceCartographic.longitude,
    surfaceCartographic.latitude,
    height
  );
  const startCartesian = Cesium.Ellipsoid.WGS84.cartographicToCartesian(startCartographic);

  // Animation duration in seconds
  const duration = 2.5;
  const startTime = Cesium.JulianDate.now();
  const endTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

  // Create a sampled position property for smooth animation
  const property = new Cesium.SampledPositionProperty();
  property.addSample(startTime, startCartesian);
  property.addSample(endTime, targetCartesian);

  // Add a large, visible meteor entity for presentation
  const meteorEntity = viewer.entities.add({
    name: "Meteor (Presentation)",
    position: property,
    model: {
      uri: modelUri,
      scale: 400000, // Large fixed size for visibility
      minimumPixelSize: 150
    }
  });

  // Center the view on the meteor for visibility
  viewer.zoomTo(meteorEntity);

  // Animate the clock for the meteor (does not affect simulation time)
  viewer.clock.shouldAnimate = true;

  // After animation, remove meteor
  setTimeout(() => {
    viewer.entities.remove(meteorEntity);
  }, duration * 1000);
}

// Attach double-click event to animate meteor impact (presentation only)


function updateDashboard(data) { for (const [key, value] of Object.entries(data)) { const element = document.getElementById(`dash-${key}`); if (element) element.textContent = value; } }
function updateMitigationDashboard(data) { for (const [key, value] of Object.entries(data)) { const element = document.getElementById(`dash-${key}`); if (element) element.textContent = value; } }
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = (e) => {
        e = e || window.event; e.preventDefault();
        pos3 = e.clientX; pos4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            e = e || window.event; e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        };
    };
}

function calculateEffectiveness(strategy, budget, radius, density) {
  let minBudget, targetBudget, baseEffectiveness;

  // 🎯 Strategy base parameters
  if (strategy === "kinetic") {
    minBudget = 200;
    targetBudget = 800;
    baseEffectiveness = 0.7;
  }
  if (strategy === "tractor") {
    minBudget = 100;
    targetBudget = 500;
    baseEffectiveness = 0.3;
  }
  if (strategy === "nuclear") {
    minBudget = 1000;
    targetBudget = 3000;
    baseEffectiveness = 0.9;
  }

  // 💰 Budget scaling
  let budgetFactor;
  if (budget < minBudget) {
    // underfunded → very poor effectiveness
    budgetFactor = Math.max(0, (budget / minBudget) * baseEffectiveness * 0.5);
  } else if (budget < targetBudget) {
    // scaling up between min and target
    let progress = (budget - minBudget) / (targetBudget - minBudget);
    budgetFactor = baseEffectiveness * (0.5 + 0.5 * progress);
  } else {
    // 🚀 Overfunded → diminishing returns
    let excess = budget - targetBudget;
    let diminishingBoost = 0.05 * (1 - Math.exp(-excess / targetBudget));
    budgetFactor = Math.min(1, baseEffectiveness + diminishingBoost);
  }

  // 🪨 Density penalty (1 → 8 g/cm³)
  // Low density (icy/porous) = easier, high density (metallic) = harder
  let densityPenalty = (8 - density) / (8 - 1); 
  densityPenalty = Math.max(0.2, densityPenalty); // never below 0.2

  // 🌍 Size penalty (1 → 2000 m)
  // Reference size = 500m. Larger = harder to move.
  let sizePenalty = 500 / radius;
  sizePenalty = Math.min(1, Math.max(0.1, sizePenalty)); 

  // 🔮 Final probability
  let probability = budgetFactor * sizePenalty * densityPenalty;

  return Math.min(1, Math.max(0, probability)); // clamp to 0–1
}

function updateProbabilityDisplay() {
  const mitigationSelect = document.getElementById('mitigation-method-select');
  const budgetSlider = document.getElementById('budget-slider');
  const probabilityValue = document.getElementById('probability-value');
  const asteroidSelect = document.getElementById('asteroid-select');
  const radiusSlider = document.getElementById('radiusSlider');
  const densitySlider = document.getElementById('densitySlider');

  if (mitigationSelect && budgetSlider && probabilityValue && asteroidSelect && radiusSlider && densitySlider) {
    let strategy = "kinetic";
    const method = mitigationSelect.value;
    if (method === 'kinetic') strategy = "kinetic";
    else if (method === 'gravity') strategy = "tractor";
    else if (method === 'nuclear') strategy = "nuclear";
    const budget = parseInt(budgetSlider.value, 10);

    // --- Use baked values for selected asteroid if not custom ---
    let radius, density;
    if (
      asteroidSelect.value !== "custom" &&
      asteroidPhysicalProperties[asteroidSelect.value]
    ) {
      radius = asteroidPhysicalProperties[asteroidSelect.value].radius;
      density = asteroidPhysicalProperties[asteroidSelect.value].density;
    } else {
      radius = parseFloat(radiusSlider.value);
      density = parseFloat(densitySlider.value);
    }

    const probability = calculateEffectiveness(strategy, budget, radius, density);
    probabilityValue.textContent = `${Math.round(probability * 100)}%`;
    probabilityValue.style.color = "#FFD600";
    probabilityValue.style.fontWeight = "bold";
  }
}

function updateMitigationUI() {
  const strategySelect = document.getElementById("mitigation-method-select");
  const budgetSlider = document.getElementById("budget-slider");
  const radiusSlider = document.getElementById("radiusSlider");
  const densitySlider = document.getElementById("densitySlider");
  const explanationDiv = document.getElementById("mitigation-explanation");

  if (!strategySelect || !budgetSlider || !radiusSlider || !densitySlider || !explanationDiv) return;

  let strategy = strategySelect.value;
  if (strategy === "gravity") strategy = "tractor"; // map UI value to internal
  const budget = parseInt(budgetSlider.value, 10);
  const radius = parseInt(radiusSlider.value, 10); // meters
  const density = parseFloat(densitySlider.value);

  const explanation = explainEffectiveness(strategy, budget, radius, density);

  explanationDiv.innerHTML = explanation;;
}

// Attach event listeners for live updates
["mitigation-method-select", "budget-slider", "radiusSlider", "densitySlider"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateMitigationUI);
});

// Optionally, call once on load to initialize
document.addEventListener("DOMContentLoaded", updateMitigationUI);

document.addEventListener('DOMContentLoaded', () => {
  switchToEarthView();
  viewer.trackedEntity = undefined

  // Track density and radius sliders from HTML
  const asteroidSelect = document.getElementById('asteroid-select');
  const densitySlider = document.getElementById("densitySlider");
  const radiusSlider = document.getElementById("radiusSlider");
  const densityValue = document.getElementById("densityValue");
  const radiusValue = document.getElementById("radiusValue");

  function updateSliderState() {
    const isCustom = asteroidSelect && asteroidSelect.value === 'custom';
    if (densitySlider) densitySlider.disabled = !isCustom;
    if (radiusSlider) radiusSlider.disabled = !isCustom;

    // Optionally, visually indicate disabled state
    if (densitySlider) densitySlider.style.opacity = isCustom ? '1' : '0.5';
    if (radiusSlider) radiusSlider.style.opacity = isCustom ? '1' : '0.5';

    // --- Set baked values for selected asteroid ---
    if (!isCustom && asteroidSelect && asteroidPhysicalProperties[asteroidSelect.value]) {
      const props = asteroidPhysicalProperties[asteroidSelect.value];
      radiusSlider.value = props.radius;
      densitySlider.value = props.density;
      if (radiusValue) radiusValue.textContent = props.radius;
      if (densityValue) densityValue.textContent = props.density;
    } else {
      if (radiusValue) radiusValue.textContent = radiusSlider.value;
      if (densityValue) densityValue.textContent = densitySlider.value;
    }
    updateProbabilityDisplay();
    updateMitigationUI(); // <-- Add this line
  }

  if (asteroidSelect) {
    asteroidSelect.addEventListener('change', updateSliderState);
    updateSliderState();
  }
  if (densitySlider && densityValue) {
    densitySlider.addEventListener("input", () => {
      densityValue.textContent = densitySlider.value;
      updateProbabilityDisplay();
    });
  }

  if (radiusSlider && radiusValue) {
    radiusSlider.addEventListener("input", () => {
      radiusValue.textContent = radiusSlider.value;
      updateProbabilityDisplay();
    });
  }

  // initialize once
  //updateAsteroidParameters();

  const budgetSlider = document.getElementById('budget-slider');
  const budgetValue = document.getElementById('budget-value');
  const mitigationSelect = document.getElementById('mitigation-method-select');
  if (budgetSlider && budgetValue) {
    budgetSlider.addEventListener('input', () => {
      budgetValue.textContent = budgetSlider.value;
      updateProbabilityDisplay();
    });
  }
  if (mitigationSelect) {
    mitigationSelect.addEventListener('change', updateProbabilityDisplay);
  }
  // Also update probability when density or radius changes (for direct slider changes)
  if (densitySlider) densitySlider.addEventListener('input', updateProbabilityDisplay);
  if (radiusSlider) radiusSlider.addEventListener('input', updateProbabilityDisplay);

  updateProbabilityDisplay(); // Initial display

  const executeMitigationBtn = document.getElementById('execute-mitigation-btn');
  if (executeMitigationBtn) {
      executeMitigationBtn.disabled = false;
      executeMitigationBtn.addEventListener('click', () => {
        console.log("Mitigation button pressed"); // <-- Debug log
        executeMitigationBtn.disabled = true;

        // Always use the correct parameters for the selected asteroid
        const asteroidSelect = document.getElementById('asteroid-select');
        let radius, density;
        if (
            asteroidSelect &&
            asteroidSelect.value !== "custom" &&
            asteroidPhysicalProperties[asteroidSelect.value]
        ) {
            radius = asteroidPhysicalProperties[asteroidSelect.value].radius;
            density = asteroidPhysicalProperties[asteroidSelect.value].density;
        } else {
            radius = radiusSlider ? parseFloat(radiusSlider.value) : 500;
            density = densitySlider ? parseFloat(densitySlider.value) : 3;
        }

        const mitigationSelect = document.getElementById('mitigation-method-select');
        let strategy = "kinetic";
        if (mitigationSelect) {
            const method = mitigationSelect.value;
            if (method === 'kinetic') strategy = "kinetic";
            else if (method === 'gravity') strategy = "tractor";
            else if (method === 'nuclear') strategy = "nuclear";
        }
        const budget = budgetSlider ? parseInt(budgetSlider.value, 10) : 500;
        const successRate = calculateEffectiveness(strategy, budget, radius, density);
        const success = Math.random() < successRate;

        if (success) {
            // Remove the asteroid entity if it exists
            if (currentSimulation.asteroid && currentSimulation.asteroid.entity && !currentSimulation.asteroid.entity.isDestroyed) {
                viewer.entities.remove(currentSimulation.asteroid.entity);
                currentSimulation.asteroid.entity = undefined;
            }
            // Remove any deflected entity as well
            if (currentSimulation.asteroid && currentSimulation.asteroid.deflectedEntity && !currentSimulation.asteroid.deflectedEntity.isDestroyed) {
                viewer.entities.remove(currentSimulation.asteroid.deflectedEntity);
                currentSimulation.asteroid.deflectedEntity = undefined;
            }
            // Remove any leftover meteor/asteroid entities
            viewer.entities.values.slice().forEach(entity => {
                if (
                    entity.name &&
                    (
                        entity.name.toLowerCase().includes("asteroid") ||
                        entity.name.toLowerCase().includes("meteor") ||
                        entity.name.toLowerCase().includes("deflected")
                    )
                ) {
                    viewer.entities.remove(entity);
                }
            });

            // Stop all simulation listeners and animation
            currentSimulation.listeners.forEach(listener => {
                if (listener.type === 'interval') clearInterval(listener.id);
                else if (listener.type === 'onTick') viewer.clock.onTick.removeEventListener(listener.func);
            });
            currentSimulation.listeners = [];
            viewer.clock.shouldAnimate = false;
            viewer.trackedEntity = undefined;
            restoreDefaultCesiumCameraControls();

            // Show "Impact avoided" message on screen
            let msg = document.getElementById('impact-avoided-message');
            if (!msg) {
                msg = document.createElement('div');
                msg.id = 'impact-avoided-message';
                msg.textContent = 'Impact avoided';
                msg.style.position = 'absolute';
                msg.style.top = '50%';
                msg.style.left = '50%';
                msg.style.transform = 'translate(-50%, -50%)';
                msg.style.background = 'rgba(0, 128, 0, 0.85)';
                msg.style.color = '#fff';
                msg.style.fontSize = '2em';
                msg.style.padding = '24px 48px';
                msg.style.borderRadius = '16px';
                msg.style.zIndex = 10000;
                document.body.appendChild(msg);
            }
            setTimeout(() => {
                if (msg && msg.parentNode) msg.parentNode.removeChild(msg);
            }, 4000);
        } else {
            // Show "Mitigation failed" message on screen
            let msg = document.getElementById('impact-failed-message');
            if (!msg) {
                msg = document.createElement('div');
                msg.id = 'impact-failed-message';
                msg.textContent = 'Mitigation failed! Impact not avoided.';
                msg.style.position = 'absolute';
                msg.style.top = '50%';
                msg.style.left = '50%';
                msg.style.transform = 'translate(-50%, -50%)';
                msg.style.background = 'rgba(180, 0, 0, 0.85)';
                msg.style.color = '#fff';
                msg.style.fontSize = '2em';
                msg.style.padding = '24px 48px';
                msg.style.borderRadius = '16px';
                msg.style.zIndex = 10000;
                document.body.appendChild(msg);
            }
            setTimeout(() => {
                if (msg && msg.parentNode) msg.parentNode.removeChild(msg);
            }, 4000);
        }
    });
  }
});
function getAsteroidImpactParameters() {
  const asteroidSelect = document.getElementById("asteroid-select");
  let density, radiusMeters;

  // Use baked values if not custom
  if (
    asteroidSelect &&
    asteroidSelect.value !== "custom" &&
    asteroidPhysicalProperties[asteroidSelect.value]
  ) {
    const props = asteroidPhysicalProperties[asteroidSelect.value];
    radiusMeters = props.radius;
    density = props.density;
  } else {
    // Use slider values for custom asteroid
    density = parseFloat(document.getElementById("densitySlider").value); // g/cm³
    radiusMeters = parseFloat(document.getElementById("radiusSlider").value); // meters
  }

  const radiusCm = radiusMeters * 100;
  const volume = (4/3) * Math.PI * Math.pow(radiusCm, 3); // cm³
  const mass = volume * density; // grams
  const massKg = mass / 1000;
  const velocity = 20000; // m/s
  const kineticEnergy = 0.5 * massKg * Math.pow(velocity, 2);
  return { density, radiusMeters, massKg, kineticEnergy };
}

function launchMeteorToPoint(targetCartesian) {
    if (!viewer || viewer.isDestroyed()) return;

    // Start position: 10000 km above the target point
    const surfaceCartographic = Cesium.Cartographic.fromCartesian(targetCartesian);
    const height = 10000000; // 10000 km
    const startCartographic = new Cesium.Cartographic(
        surfaceCartographic.longitude,
        surfaceCartographic.latitude,
        height
    );
    const startCartesian = Cesium.Ellipsoid.WGS84.cartographicToCartesian(startCartographic);

    // Animation duration in seconds
    const duration = 8.0;
    const startTime = Cesium.JulianDate.now();
    const endTime = Cesium.JulianDate.addSeconds(startTime, duration, new Cesium.JulianDate());

    // Set the viewer's clock for this animation
    viewer.clock.startTime = startTime;
    viewer.clock.stopTime = endTime;
    viewer.clock.currentTime = startTime;
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;

    // Create a sampled position property for smooth animation
    const property = new Cesium.SampledPositionProperty();
    property.addSample(startTime, startCartesian);
    property.addSample(endTime, targetCartesian);

    // Add meteor entity
    const meteorEntity = viewer.entities.add({
        name: "Meteor",
        position: property,
        model: {
            uri: '/Bennu.glb',
            scale: 120000,
            minimumPixelSize: 50
        },
        path: {
            resolution: 1,
            width: 3,
            material: Cesium.Color.YELLOW,
            leadTime: duration,
            trailTime: 0,
            show: true
        }
    });

    // --- Set the impact point for camera centering ---
    currentSimulation.asteroid.impactPoint = targetCartesian;

    viewer.trackedEntity = meteorEntity;
    setTimeout(() => {
        viewer.trackedEntity = undefined;
        
        centerCameraOnEarthOrImpact();
        viewer.trackedEntity = undefined;
        restoreDefaultCesiumCameraControls(); // Now this will use the new impact point
    }, 1000);

    // --- NEW: Use a clock listener for precise impact ---
    const meteorAnimationListener = (clock) => {
        if (!viewer || viewer.isDestroyed()) {
            viewer.clock.onTick.removeEventListener(meteorAnimationListener);
            return;
        }

        if (Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, endTime)) {
            viewer.clock.onTick.removeEventListener(meteorAnimationListener);
            currentSimulation.listeners = currentSimulation.listeners.filter(l => l.func !== meteorAnimationListener);

            viewer.entities.remove(meteorEntity);
            viewer.trackedEntity = undefined; // Ensure tracking is off

            const { kineticEnergy } = getAsteroidImpactParameters();
            simulateImpact(targetCartesian, kineticEnergy, null);
        }
    };

    viewer.clock.onTick.addEventListener(meteorAnimationListener);
    currentSimulation.listeners.push({ type: 'onTick', func: meteorAnimationListener });

    // --- NEW: Re-enable the mitigation button when a new asteroid is launched ---
       const executeMitigationBtn = document.getElementById('execute-mitigation-btn');
    if (executeMitigationBtn) {
        executeMitigationBtn.disabled = false;
    }
}
// Attach double-click event to launch meteor

function explainEffectiveness(strategy, budget, radius, density) {
  const probability = calculateEffectiveness(strategy, budget, radius, density);

  const strategyNames = {
    kinetic: "Kinetic Impactor",
    tractor: "Gravity Tractor",
    nuclear: "Nuclear Deflection"
  };

  let densityDesc = density <= 2 ? "icy or porous (easy to deflect)" :
                    density <= 4 ? "rocky (moderate difficulty)" :
                    density <= 6 ? "stony-iron (tougher)" :
                                   "metallic (very hard to deflect)";

  let sizeDesc = radius <= 100 ? "tiny asteroid (easy to move)" :
                 radius <= 500 ? "moderate size (reasonable effort)" :
                 radius <= 1000 ? "large asteroid (hard to move)" :
                                  "massive asteroid (extremely difficult)";

  let budgetDesc = "";
  if (strategy === "kinetic") {
    budgetDesc = budget < 200 ? "underfunded — low chance of success" :
                 budget < 800 ? "adequately funded — decent chance" :
                                "well funded — near max performance (diminishing returns)";
  }
  if (strategy === "tractor") {
    budgetDesc = budget < 100 ? "underfunded — almost no effect" :
                 budget < 500 ? "partially funded — slow pull possible" :
                                "well funded — maximum tractor effect (still limited)";
  }
  if (strategy === "nuclear") {
    budgetDesc = budget < 1000 ? "underfunded — risky use of nuclear device" :
                 budget < 3000 ? "well funded — very strong effect" :
                                 "overfunded — diminishing returns, but still most powerful method";
  }

  // Highlight the probability in yellow and bold using HTML
  return `
Mitigation Strategy: ${strategyNames[strategy]}
Asteroid Size: ${radius} m → ${sizeDesc}
Asteroid Density: ${density.toFixed(1)} g/cm³ → ${densityDesc}
Budget: $${budget}M → ${budgetDesc}

<span style="color: #FFD600; font-weight: bold;">
  Projected Success Probability: ${(probability * 100).toFixed(1)}%
</span>
`;
}
window.testShowAsteroid = testShowAsteroid;