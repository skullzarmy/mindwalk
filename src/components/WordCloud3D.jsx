import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWordColor(weight, isLight = false, isColorblind = false) {
  if (isColorblind) {
    if (weight > 0.7) return '#e6a817';  // amber – most prominent
    if (weight > 0.4) return '#0077b6';  // ocean blue – medium
    return '#118ab2';                     // teal blue – background words
  }
  if (isLight) {
    if (weight > 0.7) return '#006b8f';  // dark cyan on light bg
    if (weight > 0.4) return '#6b21c8';  // dark purple on light bg
    return '#1a4ecf';                     // dark blue on light bg
  }
  if (weight > 0.7) return '#00ffff';   // cyan   – most prominent
  if (weight > 0.4) return '#c084fc';   // purple – medium
  return '#60a5fa';                      // blue   – background words
}

function createWordSprite(word, weight, isLight = false, isColorblind = false) {
  const color = getWordColor(weight, isLight, isColorblind);
  // Use device pixel ratio for crisp text on high-DPI screens
  const dpr    = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');

  const fontSize = Math.round((28 + weight * 36) * dpr); // 28 – 64 px logical
  ctx.font = `bold ${fontSize}px "Share Tech Mono","Courier New",monospace`;
  const textWidth = ctx.measureText(word).width;
  const pad = Math.round(22 * dpr);
  canvas.width  = Math.ceil(textWidth + pad * 2);
  canvas.height = Math.ceil(fontSize * 1.4 + pad * 2);

  // re-apply font after canvas resize (resize resets context)
  ctx.font = `bold ${fontSize}px "Share Tech Mono","Courier New",monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'center';

  if (isLight) {
    // In light mode: draw coloured text with soft shadow (no additive glow)
    ctx.shadowColor = color;
    ctx.shadowBlur  = 6 * dpr;
    ctx.fillStyle   = color;
    ctx.fillText(word, canvas.width / 2, canvas.height / 2);
  } else {
    // In dark mode: glow layers with additive blending
    ctx.shadowColor = color;
    ctx.shadowBlur  = 28 * dpr;
    ctx.fillStyle   = color;
    ctx.fillText(word, canvas.width / 2, canvas.height / 2);

    ctx.shadowBlur  = 10 * dpr;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(word, canvas.width / 2, canvas.height / 2);
  }

  const texture  = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    opacity: 0,               // fades in on arrival
  });

  // Divide by (dpr * 22) so physical canvas pixels → consistent Three.js units
  const scaleX = canvas.width  / (dpr * 22);
  const scaleY = canvas.height / (dpr * 22);
  const sprite  = new THREE.Sprite(material);
  sprite.scale.set(scaleX, scaleY, 1);

  sprite.userData = {
    word,
    weight,
    baseScale: new THREE.Vector3(scaleX, scaleY, 1),
    phase:      Math.random() * Math.PI * 2,
    floatSpeed: 0.3 + Math.random() * 0.35,
  };

  return sprite;
}

function createStarField(count = 2500) {
  if (count === 0) {
    // Return an empty object for light mode — no stars needed
    return new THREE.Object3D();
  }
  const geo  = new THREE.BufferGeometry();
  const pos  = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 2400;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 2400;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 2400;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
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
    })
  );
}

// Reusable vectors for the animation loop – avoids per-frame allocations.
const _toCamera    = new THREE.Vector3();
const _hoverTarget = new THREE.Vector3();
const _hoverScale  = new THREE.Vector3();

/**
 * Fibonacci-sphere distribution for uniform point coverage.
 */
function fibonacciSphere(index, total, radius) {
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const theta = (2 * Math.PI * index) / goldenRatio;
  const phi   = Math.acos(1 - (2 * (index + 0.5)) / total);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WordCloud3D({ words, onWordClick, isLoading, colorblindMode = false }) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const cameraRef  = useRef(null);
  const rendererRef= useRef(null);
  const controlsRef= useRef(null);
  const spritesRef = useRef([]);
  const rafRef     = useRef(null);
  const clockRef   = useRef(new THREE.Clock());
  const raycasterRef = useRef(new THREE.Raycaster());
  const hoveredRef   = useRef(null);
  const tooltipRef   = useRef(null);
  // Media queries for user preferences
  const isLightMode    = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;
  const reducedMotion  = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Scene bootstrap (runs once) ──────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const bgColor = isLightMode ? 0xeef2f7 : 0x050510;
    const fogColor = isLightMode ? 0xeef2f7 : 0x050510;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(fogColor, 0.0012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60, mount.clientWidth / mount.clientHeight, 0.1, 3000
    );
    camera.position.set(0, 0, 220);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(createStarField(isLightMode ? 0 : 2500));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping    = true;
    controls.dampingFactor    = 0.05;
    controls.autoRotate       = !reducedMotion;
    controls.autoRotateSpeed  = 0.4;
    controls.enablePan        = false;
    controls.minDistance      = 80;
    controls.maxDistance      = 500;
    controlsRef.current = controls;

    const clock = clockRef.current;

    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      const cam = cameraRef.current;
      spritesRef.current.forEach(sprite => {
        const { phase, floatSpeed, baseScale, basePos } = sprite.userData;

        // fade in
        if (sprite.material.opacity < 1) {
          sprite.material.opacity = Math.min(1, sprite.material.opacity + 0.025);
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
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── Rebuild word cloud whenever words change ──────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // dispose old sprites
    spritesRef.current.forEach(s => {
      scene.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    });
    hoveredRef.current = null;
    spritesRef.current = [];

    if (!words?.length) return;

    const radius = 100;
    const newSprites = words.map((w, i) => {
      const sprite = createWordSprite(w.word, w.weight, isLightMode, colorblindMode);
      const pos    = fibonacciSphere(i, words.length, radius);
      sprite.position.copy(pos);
      sprite.userData.basePos = pos.clone();
      scene.add(sprite);
      return sprite;
    });
    spritesRef.current = newSprites;
  }, [words]);

  // ── Mouse interaction ─────────────────────────────────────────────────────
  const getIntersects = useCallback((clientX, clientY) => {
    const mount = mountRef.current;
    const cam   = cameraRef.current;
    if (!mount || !cam) return [];
    const rect = mount.getBoundingClientRect();
    const x =  ((clientX - rect.left)  / rect.width)  * 2 - 1;
    const y = -((clientY - rect.top)   / rect.height)  * 2 + 1;
    const rc = raycasterRef.current;
    rc.setFromCamera(new THREE.Vector2(x, y), cam);
    return rc.intersectObjects(spritesRef.current);
  }, []);

  const handleMouseMove = useCallback((e) => {
    const hits = getIntersects(e.clientX, e.clientY);
    if (hits.length > 0) {
      hoveredRef.current = hits[0].object;
      mountRef.current.style.cursor = isLoading ? 'wait' : 'pointer';
      if (tooltipRef.current) {
        tooltipRef.current.textContent = hits[0].object.userData.word;
        tooltipRef.current.style.left = `${e.clientX}px`;
        tooltipRef.current.style.top  = `${e.clientY - 18}px`;
        tooltipRef.current.style.opacity = '1';
      }
    } else {
      hoveredRef.current = null;
      mountRef.current.style.cursor = 'default';
      if (tooltipRef.current) {
        tooltipRef.current.style.opacity = '0';
      }
    }
  }, [getIntersects, isLoading]);

  const handleClick = useCallback((e) => {
    if (isLoading) return;
    const hits = getIntersects(e.clientX, e.clientY);
    if (hits.length > 0) {
      onWordClick(hits[0].object.userData.word);
    }
  }, [isLoading, onWordClick, getIntersects]);

  return (
    <>
      <div
        ref={mountRef}
        className="word-cloud-canvas"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      <div ref={tooltipRef} className="word-tooltip" aria-hidden="true" />
    </>
  );
}
