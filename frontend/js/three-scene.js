/* ============================================================
   three-scene.js — Three.js 3D background with floating
   geometry and particle system
   ============================================================ */

let scene, camera, renderer, mouse, shapes, particles;
let animId = null;

export function initScene() {
  if (animId) return; // already running

  const THREE = window.THREE;
  if (!THREE) return console.warn('Three.js not loaded');

  scene = new THREE.Scene();
  mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 30;

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x6366f1, 2, 100);
  pointLight1.position.set(20, 15, 20);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0x8b5cf6, 1.5, 80);
  pointLight2.position.set(-15, -10, 15);
  scene.add(pointLight2);

  const pointLight3 = new THREE.PointLight(0x10b981, 1, 60);
  pointLight3.position.set(0, 20, -10);
  scene.add(pointLight3);

  // Floating shapes
  shapes = [];
  const shapeDefs = [
    { geo: new THREE.IcosahedronGeometry(2, 0), pos: [-12, 6, -5], speed: 0.003, color: 0x6366f1 },
    { geo: new THREE.TorusKnotGeometry(1.5, 0.5, 64, 16), pos: [14, -4, -8], speed: 0.002, color: 0x8b5cf6 },
    { geo: new THREE.OctahedronGeometry(1.8, 0), pos: [-8, -8, -3], speed: 0.004, color: 0x10b981 },
    { geo: new THREE.DodecahedronGeometry(1.5, 0), pos: [10, 8, -6], speed: 0.0025, color: 0x3b82f6 },
    { geo: new THREE.TetrahedronGeometry(2, 0), pos: [0, -12, -10], speed: 0.003, color: 0xf59e0b },
    { geo: new THREE.TorusGeometry(2, 0.6, 16, 32), pos: [-15, 0, -12], speed: 0.002, color: 0x6366f1 },
    { geo: new THREE.IcosahedronGeometry(1.2, 1), pos: [18, 2, -15], speed: 0.0035, color: 0xef4444 },
  ];

  shapeDefs.forEach(def => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: def.color,
      metalness: 0.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.7,
      wireframe: Math.random() > 0.5,
    });
    const mesh = new THREE.Mesh(def.geo, mat);
    mesh.position.set(...def.pos);
    mesh.userData = {
      speed: def.speed,
      baseY: def.pos[1],
      phase: Math.random() * Math.PI * 2,
    };
    scene.add(mesh);
    shapes.push(mesh);
  });

  // Particle system
  const particleCount = 500;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const palette = [
    [0.39, 0.4, 0.95],   // indigo
    [0.55, 0.36, 0.96],  // violet
    [0.06, 0.73, 0.51],  // emerald
    [0.23, 0.51, 0.96],  // blue
  ];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 80;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 10;

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];

    sizes[i] = Math.random() * 0.15 + 0.03;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Mouse tracking
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onResize);

  animate();
}

function onMouseMove(e) {
  mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.ty = -(e.clientY / window.innerHeight) * 2 + 1;
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  animId = requestAnimationFrame(animate);

  const time = Date.now() * 0.001;

  // Smooth mouse follow
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;

  // Rotate shapes
  shapes.forEach(mesh => {
    const d = mesh.userData;
    mesh.rotation.x += d.speed;
    mesh.rotation.y += d.speed * 1.3;
    mesh.position.y = d.baseY + Math.sin(time + d.phase) * 1.5;
  });

  // Rotate particles slowly
  if (particles) {
    particles.rotation.y = time * 0.02;
    particles.rotation.x = Math.sin(time * 0.01) * 0.1;
  }

  // Camera follows mouse
  camera.position.x += (mouse.x * 3 - camera.position.x) * 0.02;
  camera.position.y += (mouse.y * 2 - camera.position.y) * 0.02;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

export function destroyScene() {
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('resize', onResize);
  if (renderer) renderer.dispose();
  scene = camera = renderer = particles = null;
  shapes = [];
}
