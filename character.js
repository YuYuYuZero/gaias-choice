/*
 * character.js — 可复用的 3D 角色模块（动画驱动）
 *
 * 目标：让生成的 3D 游戏角色真的动起来。关键角色必须加载真模型。
 *
 * 用法：
 *   import { createCharacter } from './character.js';
 *   const player = await createCharacter(scene, { src: 'assets/hero.anim.json', requiredModel: true, position: [0,0,0] });
 *   // 每帧：
 *   player.update(dt, { moving, running, grounded, velocity });
 *   // 朝向：
 *   player.object.rotation.y = facing;
 *
 * controller 接口：
 *   .object        // THREE.Object3D 根节点（加进 scene，设置 position / rotation.y）
 *   .update(dt, { moving:false, running:false, grounded:true, velocity:null })
 *   .setState('idle'|'walk'|'run'|'jump'|'attack', { once:false })
 *   .ready         // bool，异步加载完成后为 true（必要时先占位再替换）
 *
 * requiredModel:true 用于主角/重要 NPC；缺失或加载失败会抛出
 * REQUIRED_CHARACTER_MODEL_FAILED，调用方显示加载/重试状态并保留此前可玩版本，
 * 不能将错误换成程序化小人。默认行为仅为旧工程/非关键角色保留兼容。
 * 三档：
 *   1. .anim.json 多片段包：{ model, clips:{ idle, walk, run, jump, ... }, rootMotion? }
 *      model 为基础 GLB（mesh+骨架），每个 clip 值为 GLB 文件名，取其首个 AnimationClip，
 *      统一绑定到基础骨架根上播放（clip GLB 与 model 共享骨骼名）。crossfade ~0.2s。
 *      rootMotion 默认 'in-place'：移除场景空间水平根位移，保留跳跃/蹲伏高度；
 *      'preserve' 保留文件中的全部根位移。opts.rootMotion 优先于 manifest。
 *   2. 单个 .glb：有内嵌动画则按名字模糊匹配状态并 crossfade；无动画则退化为第 3 档的
 *      程序化叠加（整体起伏 / 倾斜 / 跳跃挤压 / 待机呼吸）。
 *   3. src=null：用基础几何体拼一个分关节小人（躯干/头/双臂/双腿独立子网格），
 *      纯代码程序化动画（移动时四肢异相摆动、待机呼吸、跳跃下蹲+腾空挤压、朝运动方向轻微前倾）。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FADE = 0.2;            // crossfade 时长（秒）
const CLIP_KEYS = ['idle', 'walk', 'run', 'jump', 'attack', 'shoot', 'sprint', 'crouch', 'slide', 'land'];

// 状态名 -> 用于模糊匹配内嵌动画名的关键词
const STATE_MATCH = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk', 'move'],
  run: ['run', 'sprint', 'jog'],
  jump: ['jump', 'air'],
  sprint: ['sprint'],
  crouch: ['crouch', 'duck'],
  slide: ['slide'],
  land: ['land'],
  attack: ['attack', 'hit', 'punch', 'slash', 'shoot', 'fire'],
};

/**
 * 创建角色控制器。requiredModel 禁止缺模型或加载失败时退回程序化小人。
 * @param {THREE.Scene} scene
 * @param {{src?:string|null, requiredModel?:boolean, scale?:number, position?:number[], facing?:number, rootMotion?:'in-place'|'preserve'}} opts
 * @returns {Promise<object>} controller
 */
export async function createCharacter(scene, opts = {}) {
  const scale = opts.scale != null ? opts.scale : 1;
  const position = opts.position || [0, 0, 0];
  const facing = opts.facing || 0;

  // 根节点：立即创建并加入场景，作为占位（异步加载完成后把模型挂进来）
  const root = new THREE.Group();
  root.position.set(position[0], position[1], position[2]);
  root.rotation.y = facing;
  root.scale.setScalar(scale);
  if (scene) scene.add(root);

  const ctrl = new CharacterController(root);
  // 加载到的真模型自动归一化：缩放到目标身高、双脚落地（生成模型尺寸/原点各异）。
  ctrl._fit = opts.fit !== false;
  ctrl._fitHeight = opts.height || 1.9;
  ctrl._rootMotionOverride = opts.rootMotion;
  ctrl._rootMotion = rootMotionMode(opts.rootMotion);
  // 朝向修正：很多生成模型（Tripo）正面是 +X 而非 +Z，导致"向右走却朝侧面"。
  // 传 opts.faceOffset 一次性把模型本体转正（常用 -Math.PI/2）。与 .object 的运动
  // 朝向叠加，互不影响。
  ctrl._faceOffset = opts.faceOffset || 0;

  try {
    if (opts.src && /\.anim\.json($|\?)/i.test(opts.src)) {
      await loadAnimBundle(ctrl, opts.src);
    } else if (opts.src && /\.glb($|\?)|\.gltf($|\?)/i.test(opts.src)) {
      await loadSingleGlb(ctrl, opts.src);
    } else {
      if (opts.requiredModel) throw new Error('A real character GLB or animation bundle is required');
      ctrl.buildProcedural();
    }
  } catch (err) {
    if (opts.requiredModel) {
      // Never leave a half-loaded character or a visible procedural double.
      if (ctrl.mixer) ctrl.mixer.stopAllAction();
      root.removeFromParent();
      const failure = new Error('Required character model could not be loaded');
      failure.code = 'REQUIRED_CHARACTER_MODEL_FAILED';
      failure.cause = err;
      throw failure;
    }
    // Legacy/noncritical callers retain their existing fallback behavior.
    console.warn('[character] load failed, falling back to procedural:', err && err.message || err);
    ctrl.buildProcedural();
  }

  ctrl.ready = true;
  return ctrl;
}

// ---------------------------------------------------------------------------
// 控制器
// ---------------------------------------------------------------------------
class CharacterController {
  constructor(root) {
    this.object = root;          // 对外暴露的根
    this.ready = false;

    // tier 1/2（有 mixer 的骨骼动画）
    this.mixer = null;
    this.actions = {};           // state -> THREE.AnimationAction
    this.current = null;         // 当前 state 名

    // tier 3 / 程序化叠加
    this.proc = null;            // 程序化关节引用（buildProcedural 填充）
    this.procOverlay = false;    // tier2-static：在已加载 mesh 上叠加程序化效果
    this.meshRoot = null;        // tier2 程序化叠加时旋转/缩放的目标

    // 程序化动画状态
    this.phase = 0;              // 步频相位
    this.bob = 0;                // 起伏
    this.squash = 1;             // 跳跃挤压（1=正常）
    this.lean = 0;              // 前倾
    this._state = 'idle';        // 程序化语义状态
    this._overrideUntil = 0;     // setState once 的剩余时间
    this._override = null;
  }

  // 注册一个骨骼动画 action
  _addAction(state, clip, modelRoot) {
    if (!clip) return;
    clip = prepareRootMotion(clip, modelRoot, this._rootMotion);
    if (!this.mixer) this.mixer = new THREE.AnimationMixer(modelRoot);
    try {
      const action = this.mixer.clipAction(clip, modelRoot);
      action.enabled = true;
      action.setEffectiveWeight(1);
      this.actions[state] = action;
    } catch (e) {
      console.warn('[character] clipAction failed for', state, e && e.message);
    }
  }

  // 动作别名：让通用状态名也能命中 Tripo 的具体片段名。
  // attack ← slash/shoot/hit/punch；run ← sprint/jog（绝不能用 walk 冒充跑步）。
  _aliasActions() {
    const a = this.actions;
    if (!a.attack) a.attack = a.slash || a.shoot || a.hit || a.punch || a.attack;
    if (!a.run) a.run = a.sprint || a.jog;
    // 清掉因别名产生的 undefined
    for (const k of Object.keys(a)) if (!a[k]) delete a[k];
  }

  // Query actual loaded clips; intended state alone does not prove playback.
  animationStatus(required = []) {
    return {
      requested: this._state,
      playing: this.current,
      available: Object.keys(this.actions),
      missing: required.filter(state => !this.actions[state]),
    };
  }

  // 选定初始状态并播放
  _startInitial() {
    const first = this.actions.idle ? 'idle'
      : (Object.keys(this.actions)[0] || null);
    if (first) this._play(first, true);
  }

  // 播放/crossfade 到某 state（仅 tier1/2 骨骼动画）
  _play(state, immediate) {
    const action = this.actions[state];
    if (!action || this.current === state) return;
    const prev = this.current && this.actions[this.current];
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    if (prev && !immediate) {
      prev.crossFadeTo(action, FADE, false);
    } else if (prev) {
      prev.stop();
    }
    this.current = state;
  }

  /**
   * 显式切换状态（覆盖自动选择）。
   * @param {string} state
   * @param {{once?:boolean}} o  once=true 时按片段长度（或 0.6s）后自动放行
   */
  setState(state, o = {}) {
    if (o.once) {
      const action = this.actions[state];
      let dur = 0.6;
      if (action && action.getClip) {
        const c = action.getClip();
        if (c && c.duration) dur = c.duration;
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this._override = state;
      this._overrideUntil = performance.now() / 1000 + dur;
    } else {
      this._override = state;
      this._overrideUntil = Infinity;
    }
    // tier3：仅记录语义状态；tier1/2：立即切
    this._state = state;
    if (this.mixer) this._play(state, false);
  }

  /**
   * 每帧推进。
   * @param {number} dt 秒
   * @param {{moving?:boolean, running?:boolean, grounded?:boolean, velocity?:THREE.Vector3|number[]}} flags
   */
  update(dt, flags = {}) {
    const moving = !!flags.moving;
    const running = !!flags.running;
    const grounded = flags.grounded !== false;
    const velocity = flags.velocity || null;

    // 解析目标状态
    const target = this._resolveStateName({ ...flags, moving, running, grounded });
    this._state = target;

    // tier 1/2：驱动骨骼动画
    if (this.mixer) {
      this._play(target, false);
      this.mixer.update(dt);
    }

    // tier 3 或 tier2-static：程序化动画
    if (this.proc || this.procOverlay) {
      this._updateProcedural(dt, { moving, running, grounded, velocity, target });
    }
  }

  // 把运动语义（moving/running/grounded）解析成目标 state 名，保留 setState override 语义
  _resolveStateName(flags) {
    if (this._override) {
      if (this._overrideUntil === Infinity || performance.now() / 1000 < this._overrideUntil) {
        return this._override;
      }
      this._override = null;
    }
    const { moving, running, grounded } = flags;
    if (grounded === false) return 'jump';
    if (flags.sliding) return 'slide';
    if (flags.crouching) return 'crouch';
    if (moving && running) return 'run';
    if (moving) return 'walk';
    return 'idle';
  }

  // -------------------------------------------------------------------------
  // 程序化动画（tier3 完整关节 / tier2 叠加）
  // -------------------------------------------------------------------------
  _updateProcedural(dt, { moving, running, grounded, velocity, target }) {
    const speedScale = running ? 1.0 : 0.62;
    const stepFreq = running ? 13 : 9;

    // 步频相位推进
    if (moving) {
      this.phase += dt * stepFreq;
    } else {
      // 停下时缓慢收敛相位，避免突兀
      this.phase += dt * 2;
    }

    // 跳跃挤压：起跳/下落时拉伸，落地时还原
    let targetSquash = 1;
    if (!grounded) {
      targetSquash = 1.12;       // 腾空拉长
    } else if (moving) {
      targetSquash = 1 + Math.sin(this.phase * 2) * 0.02;
    } else {
      // 待机呼吸
      targetSquash = 1 + Math.sin(this.phase) * 0.015;
    }
    this.squash += (targetSquash - this.squash) * Math.min(1, dt * 10);

    // 前倾：朝运动方向
    let targetLean = moving ? (running ? 0.22 : 0.13) : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

    // 起伏（移动时整体上下小跳）
    let targetBob = 0;
    if (moving && grounded) {
      targetBob = Math.abs(Math.sin(this.phase)) * (running ? 0.12 : 0.07);
    } else if (!moving && grounded) {
      targetBob = (Math.sin(this.phase) * 0.5 + 0.5) * 0.02;
    }
    this.bob += (targetBob - this.bob) * Math.min(1, dt * 10);

    if (this.proc) {
      this._animateJoints(moving, running, grounded, speedScale);
    } else if (this.procOverlay && this.meshRoot) {
      this._animateOverlay(moving, grounded);
    }
  }

  // tier3：摆动四肢
  _animateJoints(moving, running, grounded, speedScale) {
    const p = this.proc;
    const swing = (moving ? 1 : 0) * Math.sin(this.phase) * 0.85 * speedScale;
    const armSwing = swing * 0.8;

    // 腿异相摆动
    if (p.legL) p.legL.rotation.x = swing;
    if (p.legR) p.legR.rotation.x = -swing;
    // 臂与腿反相（自然摆臂）
    if (p.armL) p.armL.rotation.x = -armSwing;
    if (p.armR) p.armR.rotation.x = armSwing;

    // 待机时手臂轻微外张呼吸
    if (!moving) {
      const breathe = Math.sin(this.phase) * 0.04;
      if (p.armL) p.armL.rotation.z = 0.08 + breathe;
      if (p.armR) p.armR.rotation.z = -0.08 - breathe;
    } else {
      if (p.armL) p.armL.rotation.z = 0.12;
      if (p.armR) p.armR.rotation.z = -0.12;
    }

    // 跳跃：下蹲(着地瞬间) / 腾空收腿
    if (!grounded) {
      if (p.legL) p.legL.rotation.x = -0.5;
      if (p.legR) p.legR.rotation.x = -0.5;
      if (p.armL) p.armL.rotation.x = -0.9;
      if (p.armR) p.armR.rotation.x = -0.9;
    }

    // 整体：起伏 + 前倾 + 挤压
    if (p.body) {
      p.body.position.y = p.bodyBaseY + this.bob;
      p.body.rotation.x = this.lean;
      // 垂直挤压（squash>1 拉长）
      p.body.scale.y = this.squash;
      p.body.scale.x = 1 / Math.sqrt(this.squash);
      p.body.scale.z = 1 / Math.sqrt(this.squash);
    }
  }

  // tier2-static：在已加载 mesh 上叠加整体效果
  _animateOverlay(moving, grounded) {
    const m = this.meshRoot;
    m.position.y = this.meshBaseY + this.bob;
    m.rotation.x = this.lean;
    m.scale.y = this.meshBaseScale * this.squash;
    m.scale.x = this.meshBaseScale / Math.sqrt(this.squash);
    m.scale.z = this.meshBaseScale / Math.sqrt(this.squash);
  }

  // -------------------------------------------------------------------------
  // tier3：拼一个分关节小人
  // -------------------------------------------------------------------------
  buildProcedural() {
    const body = new THREE.Group();          // 可整体起伏/倾斜/挤压的躯体容器
    const bodyBaseY = 0;
    body.position.y = bodyBaseY;

    const skin = new THREE.MeshStandardMaterial({ color: 0x3fd6c8, roughness: 0.45, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x267a72, roughness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x142028 });

    // 躯干
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.45), skin);
    torso.position.y = 1.15;
    torso.castShadow = true;
    body.add(torso);

    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), skin);
    head.position.y = 1.95;
    head.castShadow = true;
    body.add(head);

    // 眼睛
    for (const sx of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeMat);
      eye.position.set(sx, 2.0, 0.33);
      body.add(eye);
    }
    // 朝向指示（鼻子，+Z 为正面）
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), accent);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.9, 0.38);
    body.add(nose);

    // 手臂：以肩为枢轴的 Group，网格向下偏移，绕 x 摆动
    function makeLimb(material, len, radius) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, len, 4, 8),
        material
      );
      mesh.position.y = -len / 2 - radius;   // 顶端对齐枢轴
      mesh.castShadow = true;
      pivot.add(mesh);
      return pivot;
    }

    const armL = makeLimb(skin, 0.55, 0.11);
    armL.position.set(-0.46, 1.55, 0);
    armL.rotation.z = 0.12;
    const armR = makeLimb(skin, 0.55, 0.11);
    armR.position.set(0.46, 1.55, 0);
    armR.rotation.z = -0.12;
    body.add(armL, armR);

    const legL = makeLimb(dark, 0.6, 0.13);
    legL.position.set(-0.2, 0.7, 0);
    const legR = makeLimb(dark, 0.6, 0.13);
    legR.position.set(0.2, 0.7, 0);
    body.add(legL, legR);

    this.object.add(body);

    this.proc = {
      body, bodyBaseY,
      torso, head,
      armL, armR, legL, legR,
    };
  }
}

// ---------------------------------------------------------------------------
// tier 1：.anim.json 多片段包
// ---------------------------------------------------------------------------
async function loadAnimBundle(ctrl, src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error('fetch ' + src + ' -> ' + res.status);
  const bundle = await res.json();
  if (!bundle || !bundle.model) throw new Error('anim.json missing "model"');
  ctrl._rootMotion = rootMotionMode(ctrl._rootMotionOverride ?? bundle.rootMotion);

  const baseDir = src.replace(/[^/]*$/, '');           // 同目录解析相对 GLB
  const resolve = (f) => /^https?:|^\//.test(f) ? f : baseDir + f;

  const loader = new GLTFLoader();
  const hasSkin = (o) => { let s = false; o.traverse((n) => { if (n.isSkinnedMesh) s = true; }); return s; };

  // 1) 加载基础模型
  const baseGltf = await loadGltf(loader, resolve(bundle.model));

  // 2) 预加载所有片段 GLB（每个自带 绑定网格+骨架+一段动画）
  const clips = bundle.clips || {};
  const states = Object.keys(clips).filter((s) => clips[s]);
  const clipGltf = {};
  for (const state of states) {
    try { clipGltf[state] = await loadGltf(loader, resolve(clips[state])); }
    catch (e) { console.warn('[character] clip "' + state + '" failed:', e && e.message || e); }
  }

  // 只允许语义相近的动作别名；walk 不能替代 run，fall 不能替代 jump。
  const CLIP_ALIASES = { attack: ['slash', 'shoot', 'punch'], run: ['sprint', 'jog'] };
  for (const want of Object.keys(CLIP_ALIASES)) {
    if (!clips[want]) {
      const found = CLIP_ALIASES[want].find((a) => clips[a]);
      if (found) { clips[want] = clips[found]; if (!states.includes(want)) states.push(want); clipGltf[want] = clipGltf[found]; }
    }
  }

  // 3) 选显示网格：base 有蒙皮骨架就用 base；否则用某个 clip 的场景（它是绑定好的）。
  //    text_to_model 原始网格无骨架，动画绑不上会卡 bind pose（T-pose），必须退到 clip 网格。
  let modelRoot = baseGltf.scene;
  if (!hasSkin(modelRoot)) {
    const fs = states.find((s) => clipGltf[s] && hasSkin(clipGltf[s].scene));
    if (fs) {
      console.warn('[character] base model has no skeleton; using clip "' + fs + '" mesh for binding');
      modelRoot = clipGltf[fs].scene;
    }
  }
  const holder = attachModel(ctrl, modelRoot, bundle.height || ctrl._fitHeight);

  // 4) 把各片段动画绑到显示网格骨架（所有 retarget 共用同骨架，按骨骼名匹配）
  let registered = 0;
  for (const state of states) {
    const g = clipGltf[state];
    const clip = (g && g.animations && g.animations[0]) || null;
    if (clip) { clip.name = state; ctrl._addAction(state, clip, modelRoot); registered++; }
    else if (g) console.warn('[character] clip "' + state + '" has no AnimationClip');
  }

  // 基础 GLB 自带的动画也并入（若片段没覆盖）
  if (baseGltf.animations && baseGltf.animations.length) {
    matchEmbedded(ctrl, baseGltf.animations, modelRoot, true);
  }
  ctrl._aliasActions();   // attack→slash/shoot、run→sprint/jog 等别名

  if (registered === 0 && Object.keys(ctrl.actions).length === 0) {
    // 没有任何可用片段 -> 至少给模型加程序化叠加
    console.warn('[character] anim bundle had no usable clips; using procedural overlay');
    enableOverlay(ctrl, holder);
  } else {
    ctrl._startInitial();
  }
}

// ---------------------------------------------------------------------------
// tier 2：单个 GLB
// ---------------------------------------------------------------------------
async function loadSingleGlb(ctrl, src) {
  const loader = new GLTFLoader();
  const gltf = await loadGltf(loader, src);
  const modelRoot = gltf.scene;
  const holder = attachModel(ctrl, modelRoot, ctrl._fitHeight);

  if (gltf.animations && gltf.animations.length) {
    const matched = matchEmbedded(ctrl, gltf.animations, modelRoot, false);
    if (matched > 0) {
      ctrl._aliasActions();
      ctrl._startInitial();
      return;
    }
  }
  // 无可用内嵌动画 -> 静态模型，叠加程序化整体动效
  console.warn('[character] GLB has no usable animations; applying procedural overlay');
  enableOverlay(ctrl, holder);
}

// 把内嵌动画按名字模糊匹配到状态，注册为 action。返回注册数。
function matchEmbedded(ctrl, animations, modelRoot, skipExisting) {
  let count = 0;
  // 先建立 已用动画 集合，避免一条动画占多个 state
  const usedClip = new Set();
  for (const state of CLIP_KEYS) {
    if (skipExisting && ctrl.actions[state]) continue;
    const keys = STATE_MATCH[state];
    if (!keys) continue;
    const clip = animations.find((a) =>
      !usedClip.has(a) && keys.some((k) => (a.name || '').toLowerCase().includes(k))
    );
    if (clip) {
      usedClip.add(clip);
      ctrl._addAction(state, clip, modelRoot);
      count++;
    }
  }
  // 如果一条都没匹配上，但确实有动画，就把第一条当 idle 兜底
  if (count === 0 && animations.length) {
    ctrl._addAction('idle', animations[0], modelRoot);
    count = 1;
  }
  return count;
}

// 启用 tier2-static 程序化叠加（记录基线，update 时叠加）
function enableOverlay(ctrl, modelRoot) {
  ctrl.procOverlay = true;
  ctrl.meshRoot = modelRoot;
  ctrl.meshBaseY = modelRoot.position.y;
  ctrl.meshBaseScale = modelRoot.scale.x || 1;
}

function rootMotionMode(mode) {
  if (mode == null || mode === 'in-place') return 'in-place';
  if (mode !== 'preserve') console.warn('[character] unknown rootMotion policy; preserving motion:', mode);
  return 'preserve';
}

// 不改源 clip；别名/多个角色可以安全复用同一片段。整条删除 position 会丢失跳跃和蹲伏。
function prepareRootMotion(source, modelRoot, mode) {
  const clip = source.clone();
  if (mode === 'preserve') return clip;
  updateCharacterMatrices(modelRoot);
  const bindings = clip.tracks.map((track) => {
    try {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return { track, node: THREE.PropertyBinding.findNode(modelRoot, parsed.nodeName), property: parsed.propertyName };
    } catch { return { track }; }
  });
  for (const { track, node, property } of bindings) {
    if (property !== 'position' || !node) continue;
    const name = node.name.replace(/^.*[:|]/, '').replace(/^mixamorig[_-]*/i, '');
    if (!/^(root|hips?|pelvis|waist|armature)\d*$/i.test(name)) continue;
    // GLTF cubic splines include in/out tangents. Leave unfamiliar layouts intact.
    if (track.getValueSize() !== 3) {
      console.warn('[character] preserving unsupported root position track:', track.name);
      continue;
    }
    const parentToWorld = stableParentBasis(node.parent, bindings);
    if (!parentToWorld || Math.abs(parentToWorld.determinant()) < 1e-12) {
      console.warn('[character] preserving root motion with animated/invalid parent basis:', track.name);
      continue;
    }
    const worldToParent = parentToWorld.clone().invert();
    const start = new THREE.Vector3().fromArray(track.values);
    const delta = new THREE.Vector3();
    for (let i = 0; i < track.values.length; i += 3) {
      delta.fromArray(track.values, i).sub(start).applyMatrix3(parentToWorld);
      delta.x = 0; delta.z = 0; // Three.js scene up is Y, even when the bone's local up is Z.
      delta.applyMatrix3(worldToParent).add(start).toArray(track.values, i);
    }
  }
  return clip;
}

// Constant animation transforms may differ from the bind pose. A rotating/scaling
// parent needs per-frame retargeting; preserve its motion rather than guessing axes.
function stableParentBasis(parent, bindings) {
  const chain = []; for (let node = parent; node; node = node.parent) chain.unshift(node);
  const world = new THREE.Matrix4();
  for (const node of chain) {
    const q = node.quaternion.clone(), scale = node.scale.clone();
    for (const { track, node: target, property } of bindings) {
      if (target !== node || (property !== 'quaternion' && property !== 'scale')) continue;
      const width = property === 'quaternion' ? 4 : 3;
      if (track.getValueSize() !== width) return null;
      for (let i = width; i < track.values.length; i++) {
        if (Math.abs(track.values[i] - track.values[i % width]) > 1e-6) return null;
      }
      (property === 'quaternion' ? q : scale).fromArray(track.values);
    }
    world.multiply(new THREE.Matrix4().compose(new THREE.Vector3(), q, scale));
  }
  return new THREE.Matrix3().setFromMatrix4(world);
}

function attachModel(ctrl, modelRoot, height) {
  modelRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // Keep fitting/facing outside the animated hierarchy: root scale/rotation tracks
  // must not overwrite the display normalization or the authored bind transforms.
  const holder = new THREE.Group();
  holder.rotation.y = ctrl._faceOffset;
  holder.add(modelRoot);
  if (ctrl._fit) fitAndGround(holder, height);
  ctrl.object.add(holder);
  ctrl.meshRoot = modelRoot;
  return holder;
}

function updateCharacterMatrices(model) {
  model.parent?.updateWorldMatrix(true, false);
  // Use updateMatrixWorld so SkinnedMesh also refreshes its bindMatrixInverse.
  model.updateMatrixWorld(true);
}

function refreshSkinnedBounds(model) {
  // GLTFLoader has not necessarily initialized all bone world matrices yet.
  // Box3 can cache that incorrect first bound on SkinnedMesh; recompute it explicitly.
  updateCharacterMatrices(model);
  model.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.skeleton.update();
      node.computeBoundingBox();
    }
  });
}

// 把真模型缩放到目标身高、水平居中、双脚落地（origin 各异时也能站对）。
function fitAndGround(model, targetH) {
  refreshSkinnedBounds(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = size.y > 1e-4 ? targetH / size.y : 1;
  model.scale.multiplyScalar(s);
  refreshSkinnedBounds(model);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.x -= (box2.min.x + box2.max.x) / 2;
  model.position.z -= (box2.min.z + box2.max.z) / 2;
  model.position.y -= box2.min.y;
  updateCharacterMatrices(model);
}

// Promise 化的 GLTFLoader.load
function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, (err) => reject(err || new Error('GLTF load error: ' + url)));
  });
}
