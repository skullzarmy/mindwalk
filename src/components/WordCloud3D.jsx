import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { monitorMemory } from "../utils/memoryMonitor.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Parse a CSS hex color string (#rgb or #rrggbb) into an integer for THREE.js.
 * Falls back to 0x00ffff (cyan) for invalid input.
 */
function parsePathColor(hex) {
    if (!hex || typeof hex !== "string") return 0x00ffff;
    const cleaned = hex.replace("#", "");
    const expanded =
        cleaned.length === 3
            ? cleaned
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : cleaned;
    const n = parseInt(expanded, 16);
    return Number.isNaN(n) ? 0x00ffff : n;
}

// Path animation: target ~800 ms at 60 fps → 0.021 ≈ 1/48 of progress per frame
const PATH_ANIMATION_SPEED = 0.021;
const TUBE_PATH_OPACITY = 0.7;

// Curve sampling: minimum 50 segments, or 20 per control point (whichever is more)
const MIN_CURVE_SEGMENTS = 50;
const SEGMENTS_PER_POINT = 20;

// Sphere marker geometry
const MARKER_RADIUS_LAST = 0.8; // endpoint marker (slightly larger)
const MARKER_RADIUS_DEFAULT = 0.5;
const MARKER_GEOMETRY_DETAIL = 8;

// Tube path geometry
const TUBE_TUBULAR_SEGMENTS = 64;
const TUBE_RADIUS = 0.2;
const TUBE_RADIAL_SEGMENTS = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWordColor(weight, isLight = false, isColorblind = false) {
    if (isColorblind) {
        if (weight > 0.7) return "#e6a817"; // amber – most prominent
        if (weight > 0.4) return "#0077b6"; // ocean blue – medium
        return "#118ab2"; // teal blue – background words
    }
    if (isLight) {
        if (weight > 0.7) return "#006b8f"; // dark cyan on light bg
        if (weight > 0.4) return "#6b21c8"; // dark purple on light bg
        return "#1a4ecf"; // dark blue on light bg
    }
    if (weight > 0.7) return "#00ffff"; // cyan   – most prominent
    if (weight > 0.4) return "#c084fc"; // purple – medium
    return "#60a5fa"; // blue   – background words
}

function createWordSprite(word, weight, isLight = false, isColorblind = false) {
    const color = getWordColor(weight, isLight, isColorblind);
    // Use device pixel ratio for crisp text on high-DPI screens
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const fontSize = Math.round((28 + weight * 36) * dpr); // 28 – 64 px logical
    ctx.font = `bold ${fontSize}px "Share Tech Mono","Courier New",monospace`;
    const textWidth = ctx.measureText(word).width;
    const pad = Math.round(22 * dpr);
    canvas.width = Math.ceil(textWidth + pad * 2);
    canvas.height = Math.ceil(fontSize * 1.4 + pad * 2);

    // re-apply font after canvas resize (resize resets context)
    ctx.font = `bold ${fontSize}px "Share Tech Mono","Courier New",monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    if (isLight) {
        // In light mode: draw coloured text with soft shadow (no additive glow)
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 * dpr;
        ctx.fillStyle = color;
        ctx.fillText(word, canvas.width / 2, canvas.height / 2);
    } else {
        // In dark mode: glow layers with additive blending
        ctx.shadowColor = color;
        ctx.shadowBlur = 28 * dpr;
        ctx.fillStyle = color;
        ctx.fillText(word, canvas.width / 2, canvas.height / 2);

        ctx.shadowBlur = 10 * dpr;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(word, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
        opacity: 0, // fades in on arrival
    });

    // Divide by (dpr * 22) so physical canvas pixels → consistent Three.js units
    const scaleX = canvas.width / (dpr * 22);
    const scaleY = canvas.height / (dpr * 22);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scaleX, scaleY, 1);

    sprite.userData = {
        word,
        weight,
        baseScale: new THREE.Vector3(scaleX, scaleY, 1),
        phase: Math.random() * Math.PI * 2,
        floatSpeed: 0.3 + Math.random() * 0.35,
    };

    return sprite;
}

function createStarField(count = 2500) {
    if (count === 0) {
        // Return an empty object for light mode — no stars needed
        return new THREE.Object3D();
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 2400;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 2400;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 2400;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(
        geo,
        new THREE.PointsMaterial({
            color: 0xaaaaff,
            size: 1.4,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
}

// Reusable vectors for the animation loop – avoids per-frame allocations.
const _toCamera = new THREE.Vector3();
const _hoverTarget = new THREE.Vector3();
const _hoverScale = new THREE.Vector3();

// Minimum distance (world units) between a new fibonacci position and any pinned
// position before the fibonacci slot is considered occupied and skipped.
const PINNED_POSITION_MIN_DISTANCE = 1.0;

/**
 * Fibonacci-sphere distribution for uniform point coverage.
 */
function fibonacciSphere(index, total, radius) {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const theta = (2 * Math.PI * index) / goldenRatio;
    const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
    return new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
    );
}

// ---------------------------------------------------------------------------
// Disposal helpers
// ---------------------------------------------------------------------------

/**
 * Dispose a material and all of its texture maps.
 */
function disposeMaterial(material) {
    const textureSlots = [
        "map",
        "lightMap",
        "bumpMap",
        "normalMap",
        "specularMap",
        "envMap",
        "alphaMap",
        "aoMap",
        "displacementMap",
        "emissiveMap",
        "gradientMap",
        "metalnessMap",
        "roughnessMap",
    ];
    textureSlots.forEach((slot) => {
        if (material[slot]) {
            material[slot].dispose();
        }
    });
    material.dispose();
}

/**
 * Traverse a scene/object tree and dispose every geometry and material found.
 */
function disposeSceneObjects(root) {
    root.traverse((object) => {
        if (object.geometry) {
            object.geometry.dispose();
        }
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(disposeMaterial);
            } else {
                disposeMaterial(object.material);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WordCloud3D({
    words,
    onWordClick,
    isLoading,
    isSynthesizing = false,
    colorblindMode = false,
    wordPath = [],
    showPath = true,
    pathColor = "#00ffff",
    pathStyle = "line",
    onBranchFromPath,
}) {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const controlsRef = useRef(null);
    const spritesRef = useRef([]);
    const rafRef = useRef(null);
    const clockRef = useRef(new THREE.Clock());
    const raycasterRef = useRef(new THREE.Raycaster());
    const hoveredRef = useRef(null);
    const tooltipRef = useRef(null);

    // Path-related refs
    // pathObjectsRef: all Three.js objects added to scene for the path (line + markers)
    const pathObjectsRef = useRef([]);
    // pathMarkersRef: just the sphere marker meshes (for raycasting)
    const pathMarkersRef = useRef([]);
    // wordPositionsRef: Map<word, THREE.Vector3> populated when sprites are built
    const wordPositionsRef = useRef(new Map());
    // pathAnimRef: drives the draw-range grow animation each frame
    const pathAnimRef = useRef({ progress: 1, totalPoints: 0, pathMesh: null, style: "line" });
    // prevPathLenRef: number of valid control points on last path build (for animation start)
    const prevPathLenRef = useRef(0);
    // wordPathRef: mirrors the wordPath prop so the words-rebuild effect can read
    // the current path without including it in the dependency array (which would
    // cause a full cloud rebuild every time a word is clicked).
    const wordPathRef = useRef(wordPath);

    // Media queries for user preferences
    const isLightMode = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
    const reducedMotion =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Keep wordPathRef in sync with the wordPath prop
    useEffect(() => {
        wordPathRef.current = wordPath;
    }, [wordPath]);

    // ── Development memory monitoring ────────────────────────────────────────
    useEffect(() => {
        const stopMonitoring = monitorMemory("WordCloud3D");
        return stopMonitoring;
    }, []);

    // ── Scene bootstrap (runs once) ──────────────────────────────────────────
    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const bgColor = isLightMode ? 0xeef2f7 : 0x050510;
        const fogColor = isLightMode ? 0xeef2f7 : 0x050510;

        const scene = new THREE.Scene();
        // Remove solid background color so the canvas itself is transparent for the compositor
        // scene.background = new THREE.Color(bgColor); 
        scene.fog = new THREE.FogExp2(fogColor, 0.0012);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 3000);
        camera.position.set(0, 0, 220);
        cameraRef.current = camera;

        // alpha: true allows the canvas to be composited over the dark background in SynthesisOverlay
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        scene.add(createStarField(isLightMode ? 0 : 2500));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.autoRotate = !reducedMotion;
        controls.autoRotateSpeed = 0.4;
        controls.enablePan = false;
        controls.minDistance = 80;
        controls.maxDistance = 500;
        controlsRef.current = controls;

        const clock = clockRef.current;

        function animate() {
            rafRef.current = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();

            const cam = cameraRef.current;
            spritesRef.current.forEach((sprite) => {
                const { phase, floatSpeed, baseScale, basePos, targetOpacity = 1 } = sprite.userData;

                // smooth opacity transitions
                const currentOpac = sprite.material.opacity;
                if (Math.abs(currentOpac - targetOpacity) > 0.01) {
                    sprite.material.opacity += (targetOpacity - currentOpac) * 0.05;
                }

                const floatY = Math.sin(t * floatSpeed + phase) * 1.5;

                if (sprite === hoveredRef.current && cam) {
                    // gently float toward camera: 35 units along the view direction
                    _toCamera.subVectors(cam.position, basePos).normalize().multiplyScalar(35);
                    _hoverTarget.set(
                        basePos.x + _toCamera.x,
                        basePos.y + _toCamera.y + floatY,
                        basePos.z + _toCamera.z,
                    );
                    sprite.position.lerp(_hoverTarget, 0.06);
                    _hoverScale.set(baseScale.x * 1.5, baseScale.y * 1.5, 1);
                    sprite.scale.lerp(_hoverScale, 0.07);
                } else {
                    // smoothly return to base position — lerp all three axes equally
                    _hoverTarget.set(basePos.x, basePos.y + floatY, basePos.z);
                    sprite.position.lerp(_hoverTarget, 0.06);
                    sprite.scale.lerp(baseScale, 0.07);
                }
            });

            // ── Path grow animation ──────────────────────────────────────────────
            const pa = pathAnimRef.current;
            if (pa.progress < 1 && pa.pathMesh) {
                pa.progress = Math.min(1, pa.progress + PATH_ANIMATION_SPEED);
                if (pa.style === "tube") {
                    // TubeGeometry doesn't support drawRange; fade in opacity instead
                    pa.pathMesh.material.opacity = pa.progress * TUBE_PATH_OPACITY;
                } else {
                    const visible = Math.max(2, Math.floor(pa.totalPoints * pa.progress));
                    pa.pathMesh.geometry.setDrawRange(0, visible);
                }
            }

            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        function onResize() {
            if (!mount) return;
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
        }
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);

            // Cancel animation loop before anything else
            cancelAnimationFrame(rafRef.current);

            // Dispose OrbitControls
            controls.dispose();

            // Dispose path objects before renderer cleanup
            pathObjectsRef.current.forEach((obj) => {
                scene.remove(obj);
                obj.geometry?.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => m.dispose());
                } else {
                    obj.material?.dispose();
                }
            });
            pathObjectsRef.current = [];
            pathMarkersRef.current = [];

            // Dispose every geometry, material, and texture in the scene
            disposeSceneObjects(scene);
            scene.clear();

            // Dispose renderer and force the WebGL context to be released so the
            // GPU driver can reclaim VRAM immediately (important on mobile).
            renderer.dispose();
            renderer.forceContextLoss();

            // Remove the canvas from the DOM
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement);
            }
        };
    }, [isLightMode, reducedMotion]);

    // ── Rebuild word cloud whenever words change ──────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Dispose and remove old sprites
        spritesRef.current.forEach((s) => {
            scene.remove(s);
            if (s.material) {
                disposeMaterial(s.material);
            }
        });
        hoveredRef.current = null;
        spritesRef.current = [];

        if (!words?.length) {
            wordPositionsRef.current = new Map();
            return;
        }

        const radius = 100;
        const posMap = new Map();
        // Words that are part of the current path keep their previous positions so
        // that path lines (which were drawn to those positions) remain accurate
        // across cloud rebuilds triggered by new AI responses.
        const prevPositions = wordPositionsRef.current;
        const pathSet = new Set(wordPathRef.current);

        // Collect positions already reserved by pinned path words so they can be
        // excluded from the fibonacci pool, preventing overlap/double-assignment.
        const reservedPositions = words
            .filter(w => pathSet.has(w.word) && prevPositions.has(w.word))
            .map(w => prevPositions.get(w.word));

        // Build a pool of available fibonacci positions for this word count,
        // excluding any that coincide with a reserved (pinned) position.
        const freePool = [];
        for (let i = 0; i < words.length; i++) {
            const fp = fibonacciSphere(i, words.length, radius);
            if (!reservedPositions.some(rp => fp.distanceTo(rp) < PINNED_POSITION_MIN_DISTANCE)) {
                freePool.push(fp);
            }
        }
        let freeIdx = 0;

        const newSprites = words.map((w, i) => {
            const sprite = createWordSprite(w.word, w.weight, isLightMode, colorblindMode);
            const pinnedPos = pathSet.has(w.word) ? (prevPositions.get(w.word) ?? null) : null;
            const pos = pinnedPos
                ? pinnedPos.clone()
                : (freePool[freeIdx] ? freePool[freeIdx++].clone() : fibonacciSphere(i, words.length, radius));
            sprite.position.copy(pos);
            sprite.userData.basePos = pos.clone();
            posMap.set(w.word, pos.clone());
            scene.add(sprite);
            return sprite;
        });
        wordPositionsRef.current = posMap;
        spritesRef.current = newSprites;
    }, [words, colorblindMode, isLightMode]);

    // ── Apply Synthesis Visual State & Constellation ─────────────────────────
    const constellationWebRef = useRef(null);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!controlsRef.current || !scene) return;
        
        // Slow down rotation during synthesis for a majestic feel
        controlsRef.current.autoRotateSpeed = isSynthesizing ? 0.03 : 0.4;

        // Hide all 3D text words completely during synthesis so only the geometric constellation remains
        spritesRef.current.forEach((sprite) => {
            sprite.userData.targetOpacity = isSynthesizing ? 0.0 : 1.0;
        });

        // Highlight marker nodes
        pathMarkersRef.current.forEach(marker => {
            if (isSynthesizing) {
                marker.material.color.setHex(0xffffff);
                marker.scale.set(1.5, 1.5, 1.5);
            } else {
                marker.material.color.setHex(parsePathColor(pathColor));
                marker.scale.set(1, 1, 1);
            }
        });

        // Add a striking geometric constellation web connecting path nodes
        if (isSynthesizing && wordPath.length > 1) {
            if (!constellationWebRef.current) {
                const pathNodes = wordPath.map(w => wordPositionsRef.current.get(w)).filter(Boolean);
                
                const points = [];
                // Connect all path nodes to each other to form a complete structural envelope
                for (let i = 0; i < pathNodes.length; i++) {
                    for (let j = i + 1; j < pathNodes.length; j++) {
                        points.push(pathNodes[i]);
                        points.push(pathNodes[j]);
                    }
                }

                // Add glowing interconnected lines
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const mat = new THREE.LineBasicMaterial({
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.85, 
                    blending: THREE.AdditiveBlending
                });
                const webMesh = new THREE.LineSegments(geo, mat);

                // Add glowing dust points at the vertices
                const pointsMat = new THREE.PointsMaterial({
                    color: 0xffffff,
                    size: 3,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending
                });
                const dustMesh = new THREE.Points(geo, pointsMat);
                
                const group = new THREE.Group();
                group.add(webMesh);
                group.add(dustMesh);

                scene.add(group);
                constellationWebRef.current = group;
            }
        } else {
            if (constellationWebRef.current) {
                scene.remove(constellationWebRef.current);
                // Dispose children
                constellationWebRef.current.children.forEach(child => {
                    child.geometry.dispose();
                    child.material.dispose();
                });
                constellationWebRef.current = null;
            }
        }
    }, [isSynthesizing, wordPath, pathColor]);

    // ── Build / rebuild 3-D path visualization ───────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // ── Clean up previous path objects ──
        pathObjectsRef.current.forEach((obj) => {
            scene.remove(obj);
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
            } else {
                obj.material?.dispose();
            }
        });
        pathObjectsRef.current = [];
        pathMarkersRef.current = [];

        if (!showPath || wordPath.length === 0) {
            prevPathLenRef.current = 0;
            return;
        }

        const colorInt = parsePathColor(pathColor);

        // ── Sphere markers at each path node ──────────────────────────────────
        wordPath.forEach((word, i) => {
            const pos = wordPositionsRef.current.get(word);
            if (!pos) return;

            const isLast = i === wordPath.length - 1;
            const geo = new THREE.SphereGeometry(
                isLast ? MARKER_RADIUS_LAST : MARKER_RADIUS_DEFAULT,
                MARKER_GEOMETRY_DETAIL,
                MARKER_GEOMETRY_DETAIL,
            );
            const mat = new THREE.MeshBasicMaterial({
                color: colorInt,
                opacity: isLast ? 1.0 : 0.85,
                transparent: true,
            });
            const marker = new THREE.Mesh(geo, mat);
            marker.position.copy(pos);
            marker.userData = { word, pathIndex: i };
            scene.add(marker);
            pathObjectsRef.current.push(marker);
            pathMarkersRef.current.push(marker);
        });

        // ── Path line (needs ≥ 2 control points) ──────────────────────────────
        const pathPoints = [];
        for (const word of wordPath) {
            const pos = wordPositionsRef.current.get(word);
            if (pos) pathPoints.push(pos.clone());
        }

        const currLen = pathPoints.length;
        const prevLen = prevPathLenRef.current;
        prevPathLenRef.current = currLen;

        if (currLen < 2) return;

        const curve = new THREE.CatmullRomCurve3(pathPoints);
        const numSegments = Math.max(MIN_CURVE_SEGMENTS, pathPoints.length * SEGMENTS_PER_POINT);
        const points = curve.getPoints(numSegments);

        // Determine animation start: if one word was just added, continue from
        // where the previous path ended; otherwise animate from scratch.
        let startProgress;
        if (prevLen >= 2 && currLen === prevLen + 1) {
            startProgress = (prevLen - 1) / (currLen - 1);
        } else if (prevLen === currLen) {
            startProgress = 1.0; // words repositioned / settings changed — no animation
        } else {
            startProgress = reducedMotion ? 1.0 : 0;
        }

        let pathMesh;

        if (pathStyle === "particles") {
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.PointsMaterial({
                color: colorInt,
                size: 0.5,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
            });
            geo.setDrawRange(0, Math.max(2, Math.floor(points.length * startProgress)));
            pathMesh = new THREE.Points(geo, mat);
        } else if (pathStyle === "tube") {
            const tubeGeo = new THREE.TubeGeometry(
                curve,
                TUBE_TUBULAR_SEGMENTS,
                TUBE_RADIUS,
                TUBE_RADIAL_SEGMENTS,
                false,
            );
            const mat = new THREE.MeshBasicMaterial({
                color: colorInt,
                opacity: startProgress * TUBE_PATH_OPACITY,
                transparent: true,
            });
            pathMesh = new THREE.Mesh(tubeGeo, mat);
        } else {
            // Default: line
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: colorInt,
                opacity: 0.6,
                transparent: true,
            });
            geo.setDrawRange(0, Math.max(2, Math.floor(points.length * startProgress)));
            pathMesh = new THREE.Line(geo, mat);
        }

        scene.add(pathMesh);
        pathObjectsRef.current.push(pathMesh);

        // Kick off frame-by-frame animation via pathAnimRef
        pathAnimRef.current = {
            progress: startProgress,
            totalPoints: points.length,
            pathMesh,
            style: pathStyle,
        };
    }, [wordPath, showPath, pathColor, pathStyle, reducedMotion]);

    // ── Mouse interaction ─────────────────────────────────────────────────────
    const getIntersects = useCallback((clientX, clientY) => {
        const mount = mountRef.current;
        const cam = cameraRef.current;
        if (!mount || !cam) return [];
        const rect = mount.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((clientY - rect.top) / rect.height) * 2 + 1;
        const rc = raycasterRef.current;
        rc.setFromCamera(new THREE.Vector2(x, y), cam);
        // Check path markers first; if hit, return immediately so markers take priority
        const markers = pathMarkersRef.current;
        if (markers.length > 0) {
            const markerHits = rc.intersectObjects(markers);
            if (markerHits.length > 0) return markerHits;
        }
        return rc.intersectObjects(spritesRef.current);
    }, []);

    const handleMouseMove = useCallback(
        (e) => {
            const hits = getIntersects(e.clientX, e.clientY);
            if (hits.length > 0) {
                const obj = hits[0].object;
                const isMarker = obj.userData.pathIndex !== undefined;
                // Only apply the float-toward-camera hover effect to word sprites
                hoveredRef.current = isMarker ? null : obj;
                mountRef.current.style.cursor = isLoading ? "wait" : "pointer";
                if (tooltipRef.current) {
                    tooltipRef.current.textContent = isMarker
                        ? `↩ Branch to "${obj.userData.word}"`
                        : obj.userData.word;
                    tooltipRef.current.style.left = `${e.clientX}px`;
                    tooltipRef.current.style.top = `${e.clientY - 18}px`;
                    tooltipRef.current.style.opacity = "1";
                }
            } else {
                hoveredRef.current = null;
                mountRef.current.style.cursor = "default";
                if (tooltipRef.current) {
                    tooltipRef.current.style.opacity = "0";
                }
            }
        },
        [getIntersects, isLoading],
    );

    const handleClick = useCallback(
        (e) => {
            if (isLoading) return;
            const hits = getIntersects(e.clientX, e.clientY);
            if (hits.length > 0) {
                const obj = hits[0].object;
                if (obj.userData.pathIndex !== undefined) {
                    // Clicked a path marker — branch the walk from this point
                    onBranchFromPath?.(obj.userData.pathIndex);
                } else {
                    onWordClick(obj.userData.word);
                }
            }
        },
        [isLoading, onWordClick, getIntersects, onBranchFromPath],
    );

    return (
        <>
            {/** biome-ignore lint/a11y/useSemanticElements: <because I said so> */}
            <div
                ref={mountRef}
                className="word-cloud-canvas"
                onMouseMove={handleMouseMove}
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        handleClick(e);
                    }
                }}
                role="button"
                tabIndex={0}
                aria-label="Interactive 3D word cloud"
            />
            <div ref={tooltipRef} className="word-tooltip" aria-hidden="true" />
        </>
    );
}
