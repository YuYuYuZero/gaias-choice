/**
 * YorollCode Three.js VFX runtime (three.quarks).
 *
 * Usage:
 *   import { createVFX } from './vfx.js';
 *   const VFX = createVFX(scene, { mobile: matchMedia('(pointer: coarse)').matches });
 *   VFX.play('pickup', coin.position);
 *   const exhaust = VFX.attach('nitro', car, { offset: [0, .4, 2.2] });
 *   exhaust.setActive(boosting);
 *   VFX.update(dt); // exactly once per frame, before renderer.render(...)
 *
 * Built-in presets: sparks, explosion, pickup, dust, smoke, nitro, magic.
 */
import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  PointEmitter,
  SphereEmitter,
  ConeEmitter,
  RenderMode,
} from 'three.quarks';

const PRESETS = Object.freeze({
  sparks:    { color: 0xffb13b, life: [.18, .42], speed: [7, 16], size: [.035, .09], count: 22, shape: 'sphere', additive: true },
  explosion: { color: 0xff6a21, life: [.35, .8], speed: [3, 10], size: [.18, .55], count: 38, shape: 'sphere', additive: true },
  pickup:    { color: 0xffdf54, life: [.35, .75], speed: [2, 7], size: [.09, .22], count: 28, shape: 'sphere', additive: true },
  dust:      { color: 0xc8a878, life: [.45, 1.1], speed: [.4, 2], size: [.18, .52], count: 18, rate: 18, shape: 'hemisphere' },
  smoke:     { color: 0x89939b, life: [.7, 1.45], speed: [.25, 1.1], size: [.22, .7], rate: 15, shape: 'cone' },
  nitro:     { color: 0x42e9ff, life: [.12, .3], speed: [5, 11], size: [.05, .15], rate: 42, shape: 'cone', additive: true },
  magic:     { color: 0xa878ff, life: [.4, 1], speed: [1, 5], size: [.08, .28], count: 32, shape: 'sphere', additive: true },
});

const asRange = (value, fallback) => Array.isArray(value) ? value : [value ?? fallback, value ?? fallback];

function makeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.3, 'rgba(255,255,255,.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShape(name) {
  if (name === 'sphere') return new SphereEmitter({ radius: .12, thickness: 1 });
  if (name === 'hemisphere') return new SphereEmitter({ radius: .16, arc: Math.PI, thickness: 1 });
  if (name === 'cone') return new ConeEmitter({ radius: .08, angle: .28, thickness: 1 });
  return new PointEmitter();
}

function copyPosition(out, value) {
  if (!value) return out.set(0, 0, 0);
  if (Array.isArray(value)) return out.set(value[0] || 0, value[1] || 0, value[2] || 0);
  return out.copy(value);
}

export function createVFX(scene, options = {}) {
  if (!scene?.isObject3D) throw new TypeError('createVFX(scene): scene must be a THREE.Scene/Object3D');

  const batch = new BatchedRenderer();
  batch.name = 'YorollVFXBatch';
  scene.add(batch);
  const texture = makeTexture();
  const active = new Set();
  const mobileScale = options.mobile ? .55 : 1;
  const tempPosition = new THREE.Vector3();
  const tempOffset = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();

  function disposeEntry(entry) {
    if (!active.delete(entry)) return;
    entry.system.emitter.removeFromParent();
    entry.system.dispose();
    entry.material.dispose();
  }

  function create(name, config = {}, continuous = false) {
    const preset = PRESETS[name];
    if (!preset) throw new Error(`Unknown VFX preset: ${name}`);
    const cfg = { ...preset, ...config };
    const life = asRange(cfg.life, .5);
    const speed = asRange(cfg.speed, 1);
    const size = asRange(cfg.size, .15);
    const color = new THREE.Color(cfg.color);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: cfg.opacity ?? .95,
      depthWrite: false,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const count = Math.max(1, Math.round((cfg.count || 1) * mobileScale * (cfg.intensity ?? 1)));
    const rate = Math.max(0, (cfg.rate || 0) * mobileScale * (cfg.intensity ?? 1));
    const system = new ParticleSystem({
      duration: continuous ? 3600 : .12,
      looping: continuous,
      autoDestroy: false,
      startLife: new IntervalValue(life[0], life[1]),
      startSpeed: new IntervalValue(speed[0], speed[1]),
      startSize: new IntervalValue(size[0], size[1]),
      startColor: new ConstantColor(new THREE.Vector4(color.r, color.g, color.b, cfg.alpha ?? 1)),
      maxParticle: Math.max(count, Math.ceil(rate * life[1] * 1.3)),
      emissionOverTime: new ConstantValue(continuous ? rate : 0),
      emissionBursts: continuous ? [] : [{ time: 0, count: new ConstantValue(count), cycle: 1, interval: .01, probability: 1 }],
      shape: makeShape(cfg.shape),
      material,
      renderMode: RenderMode.BillBoard,
      worldSpace: true,
    });
    scene.add(system.emitter);
    batch.addSystem(system);
    system.play();
    const entry = {
      system, material, target: null, offset: new THREE.Vector3(), rotation: new THREE.Quaternion(),
      active: true, stopped: false, continuous, remaining: continuous ? Infinity : life[1] + .3,
      rate,
    };
    active.add(entry);
    return entry;
  }

  function makeHandle(entry) {
    return {
      system: entry.system,
      stop(immediate = false) {
        if (immediate) disposeEntry(entry);
        else if (!entry.stopped) {
          entry.stopped = true;
          entry.active = false;
          entry.system.endEmit();
          entry.remaining = 1.7;
        }
        return this;
      },
      setActive(enabled) {
        if (entry.stopped) return this;
        if (enabled && !entry.active) {
          entry.active = true;
          entry.remaining = Infinity;
          entry.system.restart();
        } else if (!enabled && entry.active) {
          entry.active = false;
          entry.system.endEmit();
          entry.remaining = Infinity;
        }
        return this;
      },
      setIntensity(value) {
        entry.system.emissionOverTime = new ConstantValue(entry.rate * THREE.MathUtils.clamp(value, 0, 3));
        return this;
      },
    };
  }

  function play(name, position, options = {}) {
    const entry = create(name, options, false);
    copyPosition(entry.system.emitter.position, position);
    if (options.rotation) entry.system.emitter.rotation.set(...options.rotation);
    return makeHandle(entry);
  }

  function attach(name, target, options = {}) {
    if (!target?.isObject3D) throw new TypeError('VFX.attach(name, target): target must be a THREE.Object3D');
    const entry = create(name, options, true);
    entry.target = target;
    copyPosition(entry.offset, options.offset);
    if (options.rotation) entry.rotation.setFromEuler(new THREE.Euler(...options.rotation));
    return makeHandle(entry);
  }

  function update(delta) {
    const dt = Math.min(Math.max(Number(delta) || 0, 0), .05);
    for (const entry of [...active]) {
      if (entry.target) {
        entry.target.getWorldPosition(tempPosition);
        entry.target.getWorldQuaternion(tempQuaternion);
        tempOffset.copy(entry.offset).applyQuaternion(tempQuaternion);
        entry.system.emitter.position.copy(tempPosition).add(tempOffset);
        entry.system.emitter.quaternion.copy(tempQuaternion).multiply(entry.rotation);
      }
      if (entry.remaining !== Infinity) {
        entry.remaining -= dt;
        if (entry.remaining <= 0) disposeEntry(entry);
      }
    }
    batch.update(dt);
  }

  function dispose() {
    for (const entry of [...active]) disposeEntry(entry);
    batch.removeFromParent();
    texture.dispose();
  }

  return Object.freeze({ play, attach, update, dispose, presets: Object.keys(PRESETS) });
}

export const VFX_PRESETS = PRESETS;
