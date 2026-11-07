/**
 * Real GLB environment loading. Imported units, placement and hierarchy are
 * preserved: this module never normalizes a whole scene to a character size.
 *
 * const env = await loadEnvironment(scene, {
 *   src: 'assets/lib/3d/stylized-meadow/scenes/summer.glb',
 *   shadows: { focus: [0, 0, 0], radius: 45, maxCasters: 128 },
 * });
 * env.bounds; // World AABB at load time. env.getBounds() after moving root.
 *
 * Instancing is for static scenery only. Mark movable meshes/parents with
 * userData.environmentDynamic = true, or pass instance: false. Animation
 * targets, skinning, morphs, transparency, shear and mirrored transforms are
 * excluded. env.getCollisionBounds({ filter }) returns broad-phase AABBs,
 * not physics colliders; filter out grass/VFX and use gameplay collision data.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULT_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const DEFAULT_AFTER_RENDER = THREE.Object3D.prototype.onAfterRender;
const DEFAULT_RAYCAST = THREE.Mesh.prototype.raycast;

function visibleInTree(node, root) {
  for (let n = node; n; n = n.parent) {
    if (!n.visible) return false;
    if (n === root) break;
  }
  return true;
}

function geometryBounds(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.getAttribute('position')) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox?.isEmpty() ? null : geometry.boundingBox;
}

/** World-space bounds, including every existing/generated instance. */
export function getEnvironmentBounds(root, target = new THREE.Box3()) {
  root.updateWorldMatrix(true, true);
  target.makeEmpty();
  const local = new THREE.Box3(), instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.traverse(node => {
    if (!node.isMesh || !visibleInTree(node, root)) return;
    if (node.isSkinnedMesh) {
      target.union(new THREE.Box3().setFromObject(node, true));
      return;
    }
    const bounds = geometryBounds(node);
    if (!bounds) return;
    if (node.isInstancedMesh) {
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, instance);
        world.multiplyMatrices(node.matrixWorld, instance);
        target.union(local.copy(bounds).applyMatrix4(world));
      }
    } else target.union(local.copy(bounds).applyMatrix4(node.matrixWorld));
  });
  return target;
}

/** Optional broad-phase boxes; no automatic vegetation collision is added. */
export function getEnvironmentCollisionBounds(root, { filter = () => true, maxEntries = 20000 } = {}) {
  root.updateWorldMatrix(true, true);
  const result = [], instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.traverse(node => {
    if (!node.isMesh || node.isSkinnedMesh || !visibleInTree(node, root)) return;
    const local = geometryBounds(node);
    if (!local) return;
    const count = node.isInstancedMesh ? node.count : 1;
    for (let i = 0; i < count; i++) {
      const source = node.isInstancedMesh ? node.userData.environmentInstances?.[i] : null;
      if (!filter(node, source, node.isInstancedMesh ? i : null)) continue;
      if (result.length >= maxEntries) throw new Error('Environment collision bounds exceed maxEntries; filter the collision set.');
      if (node.isInstancedMesh) {
        node.getMatrixAt(i, instance);
        world.multiplyMatrices(node.matrixWorld, instance);
      } else world.copy(node.matrixWorld);
      result.push({ object: node, instanceId: node.isInstancedMesh ? i : null, source, bounds: local.clone().applyMatrix4(world) });
    }
  });
  return result;
}

function animationTargets(root, clips) {
  const protectedNodes = new Set();
  for (const clip of clips || []) for (const track of clip.tracks || []) {
    let node;
    try { node = THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(track.name).nodeName); }
    catch { return new Set([root]); }
    // Unresolved animation is not permission to freeze a moving object.
    if (!node) return new Set([root]);
    protectedNodes.add(node);
  }
  return protectedNodes;
}

function hasShear(matrix) {
  const e = matrix.elements;
  const x = new THREE.Vector3(e[0], e[1], e[2]).normalize();
  const y = new THREE.Vector3(e[4], e[5], e[6]).normalize();
  const z = new THREE.Vector3(e[8], e[9], e[10]).normalize();
  return Math.max(Math.abs(x.dot(y)), Math.abs(x.dot(z)), Math.abs(y.dot(z))) > 1e-5;
}

function skipReason(mesh, root, animated, inverseRoot) {
  if (mesh.isSkinnedMesh) return 'skinned';
  if (mesh.isInstancedMesh || mesh.isBatchedMesh) return 'alreadyInstanced';
  if (mesh.children.length) return 'hasChildren';
  if (!visibleInTree(mesh, root)) return 'hidden';
  for (let node = mesh; node; node = node.parent) {
    if (animated.has(node)) return 'animated';
    if (node.userData.environmentDynamic || node.userData.noEnvironmentInstancing) return 'dynamic';
    if (node.isLOD) return 'lod';
    if (node !== mesh && node.isGroup && node.renderOrder !== 0) return 'groupRenderOrder';
    if (node === root) break;
  }
  if (!mesh.geometry?.getAttribute('position')) return 'noGeometry';
  if (mesh.morphTargetInfluences?.length || Object.values(mesh.geometry.morphAttributes || {}).some(a => a.length)) return 'morph';
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!materials.length || materials.some(m => !m || !m.visible)) return 'hiddenMaterial';
  if (materials.some(m => m.transparent || m.opacity < 1 || m.transmission > 0
    || (m.blending !== THREE.NormalBlending && m.blending !== THREE.NoBlending))) return 'transparent';
  if (materials.some(m => m.isShaderMaterial || m.isRawShaderMaterial)) return 'customShader';
  if (mesh.onBeforeRender !== DEFAULT_BEFORE_RENDER || mesh.onAfterRender !== DEFAULT_AFTER_RENDER || mesh.raycast !== DEFAULT_RAYCAST) return 'customBehavior';
  if (!Number.isFinite(mesh.matrixWorld.determinant()) || mesh.matrixWorld.determinant() <= 1e-10) return 'mirroredOrSingular';
  const relative = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
  // InstancedMesh also requires a positive *instance* determinant. Two mirrored
  // ancestors can make world orientation positive while this matrix is not.
  if (!Number.isFinite(relative.determinant()) || relative.determinant() <= 1e-10) return 'mirroredOrSingular';
  if (hasShear(relative)) return 'shear';
  return null;
}

function applyBoundedShadows(root, options) {
  if (options === false) {
    root.traverse(n => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
    return 0;
  }
  const config = options || {};
  const bounds = getEnvironmentBounds(root);
  const center = config.focus?.isVector3 ? config.focus.clone()
    : Array.isArray(config.focus) ? new THREE.Vector3(...config.focus)
      : bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(0, Number.isFinite(config.radius) ? config.radius : 45);
  const limit = Math.max(0, Math.floor(Number.isFinite(config.maxCasters) ? config.maxCasters : 128));
  const maxSize = Math.max(0, Number.isFinite(config.maxObjectSize) ? config.maxObjectSize : 120);
  const candidates = [];
  root.traverse(n => {
    if (!n.isMesh) return;
    n.castShadow = false;
    n.receiveShadow = config.receive !== false;
    if (!visibleInTree(n, root)) return;
    const materials = Array.isArray(n.material) ? n.material : [n.material];
    if (materials.some(m => !m || m.transparent || m.transmission > 0)) return;
    const box = new THREE.Box3().setFromObject(n);
    if (box.isEmpty() || box.getSize(new THREE.Vector3()).length() > maxSize) return;
    const distance = box.distanceToPoint(center);
    if (distance <= radius) candidates.push({ object: n, distance, cost: n.isInstancedMesh ? n.count : 1 });
  });
  candidates.sort((a, b) => a.distance - b.distance);
  let count = 0;
  for (const candidate of candidates) {
    if (count + candidate.cost > limit) continue;
    candidate.object.castShadow = true;
    count += candidate.cost;
  }
  return count;
}

function sceneStats(root) {
  const result = { meshes: 0, instances: 0, instancedMeshes: 0, estimatedDrawCalls: 0, triangles: 0 };
  root.traverse(mesh => {
    if (!mesh.isMesh || !visibleInTree(mesh, root)) return;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    result.meshes++; result.instances += count;
    if (mesh.isInstancedMesh) result.instancedMeshes++;
    result.estimatedDrawCalls += Array.isArray(mesh.material) ? Math.max(1, mesh.geometry.groups.length) : 1;
    const indices = mesh.geometry?.index?.count || mesh.geometry?.getAttribute('position')?.count || 0;
    result.triangles += indices / 3 * count;
  });
  return result;
}

/** Combine only compatible static leaf meshes sharing geometry/material objects. */
export function optimizeEnvironment(root, options = {}) {
  root.updateWorldMatrix(true, true);
  const before = sceneStats(root);
  const shadowCasters = applyBoundedShadows(root, options.shadows);
  const animated = animationTargets(root, options.animations || root.animations);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map(), skipped = {};
  const enabled = options.instance !== false && Math.abs(root.matrixWorld.determinant()) > 1e-10;
  const minimum = Math.max(3, Math.floor(options.minInstances || 3));
  if (enabled) root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const reason = skipReason(mesh, root, animated, inverseRoot);
    if (reason) { skipped[reason] = (skipped[reason] || 0) + 1; return; }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const key = [mesh.geometry.uuid, Array.isArray(mesh.material) ? 'array' : 'single', ...materials.map(m => m.uuid), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  let newBatches = 0, combinedMeshes = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < minimum) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = `EnvironmentInstances:${first.name || first.geometry.name || 'mesh'}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask;
    batch.frustumCulled = first.frustumCulled;
    batch.userData.environmentInstances = meshes.map(m => ({ name: m.name, uuid: m.uuid, userData: { ...m.userData } }));
    const local = new THREE.Matrix4();
    meshes.forEach((mesh, index) => {
      local.multiplyMatrices(inverseRoot, mesh.matrixWorld);
      batch.setMatrixAt(index, local);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    // Remove source leaves only after all matrices were captured. This avoids
    // double rendering, and never reparents a mesh's children or animation node.
    meshes.forEach(mesh => mesh.removeFromParent());
    root.add(batch);
    newBatches++; combinedMeshes += meshes.length;
  }
  root.updateWorldMatrix(true, true);
  return { before, after: sceneStats(root), newBatches, combinedMeshes, shadowCasters, skipped };
}

export async function loadEnvironment(scene, options = {}) {
  if (!options.src || typeof options.src !== 'string') throw new Error('loadEnvironment requires a real GLB/glTF src.');
  const loader = options.loader || new GLTFLoader(options.manager);
  const gltf = await new Promise((resolve, reject) => loader.load(options.src, resolve, options.onProgress, reject));
  if (!gltf.scene) throw new Error(`Environment has no scene: ${options.src}`);
  const root = new THREE.Group();
  root.name = options.name || 'Environment';
  root.userData.environmentSource = options.src;
  if (options.position) root.position.fromArray(options.position);
  if (options.rotation) root.rotation.fromArray(options.rotation);
  if (options.scale !== undefined) {
    if (!Number.isFinite(options.scale) || options.scale <= 0) throw new Error('Environment scale must be a positive number.');
    root.scale.setScalar(options.scale);
  }
  root.add(gltf.scene);
  // Attach before computing world matrices so transformed scene parents count.
  if (scene) scene.add(root);
  let stats;
  try { stats = optimizeEnvironment(root, { ...options, animations: gltf.animations || [] }); }
  catch (error) { root.removeFromParent(); throw error; }
  const getBounds = () => getEnvironmentBounds(root);
  return {
    root, content: gltf.scene, bounds: getBounds(), stats, animations: gltf.animations || [], getBounds,
    getCollisionBounds: config => getEnvironmentCollisionBounds(root, config),
    dispose() {
      root.removeFromParent();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      root.traverse(n => {
        if (n.geometry) geometries.add(n.geometry);
        for (const m of Array.isArray(n.material) ? n.material : n.material ? [n.material] : []) materials.add(m);
      });
      for (const m of materials) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
    },
  };
}
