# YorollOnline Gameplay Contract

Read this file for requested player accounts, cloud saves, leaderboards, or
multiplayer. These are independent services. A single-player leaderboard or
save MUST NOT add a lobby, `ready`, WebSockets, or lockstep simulation.

## Single-player services

Declare only the requested capabilities in `game-services.json`:

```json
{
  "version": 1,
  "capabilities": {
    "player_auth": false,
    "cloud_save": false,
    "leaderboards": true,
    "multiplayer": false
  },
  "leaderboards": {
    "largest_fish": { "order": "desc", "min_score": 0, "max_score": 500000, "require_login": false },
    "fastest_run": { "order": "asc", "min_score": 1000, "max_score": 3600000, "require_login": false }
  }
}
```

Choose meaningful score ranges and consistent units (e.g. grams or milliseconds).
`desc` retains each player's highest score; `asc` retains their lowest time.
The server owns board configuration; clients cannot choose the ranking order or
override score bounds. Scores are isolated by game and board. Client submissions
are range-checked, **not authoritative or cheat-proof gameplay results**. Do not
advertise anti-cheat verification. Existing multiplayer match results retain
their server-calculated global leaderboard.
For multiplayer games `global` is reserved for those server match results and
always ranks high scores first. Use a different board name for client submissions.

```js
YorollOnline.configure({ displayName: playerName });
await YorollOnline.submitScore(fishWeightGrams, { board: 'largest_fish' });
const rows = await YorollOnline.leaderboard({ board: 'largest_fish', limit: 20 });
// Render rank, display_name, score; show loading, empty and failure states.
```

No room connection is needed. Guest scores use this browser's random guest ID;
they do not constitute cross-device player accounts. If a board requires login,
an unauthenticated submission returns 401. Preview access requires the owner;
guest access is available only after publishing.

Cloud save requires the player's own authenticated session, independent of rooms:

```js
const identity = await YorollOnline.identity();
if (!identity.authenticated) {
  showLoginRequired(); // Do not claim a local save is a cloud save.
} else {
  const existing = await YorollOnline.loadSave({ slot: 'progress' });
  if (existing) restoreProgress(existing.data);
  await YorollOnline.save(captureProgress(), { slot: 'progress', version: 1 });
}
```

The platform verifies player credentials but does not yet supply a game-specific
login UI or SSO callback. `identity()` only checks identity; it does not sign in.
`configure({authToken})` may receive a player's own runtime credential from a
properly integrated login flow. NEVER embed creator credentials in project
source, HTML, exports, URLs, or postMessage to untrusted game origins. Clearing
the player's session requires `configure({authToken:null})`. If the login flow
is unavailable, keep offline play usable and disclose that cloud save cannot yet
be verified. Cloud deployment requires persistent storage; local development
falls back to temporary memory which is cleared on restart.

Validate the actual affected flow: submit/read with two player identities,
asc/desc ranking, save/reload/restore, errors and logout. A manifest or method
name check is configuration evidence, not an end-to-end pass.

## Multiplayer compatibility

An existing `online-game.json` or `online.json` without `capabilities` keeps its
multiplayer meaning. When combining services and multiplayer, set
`game-services.json` `capabilities.multiplayer:true` and keep the multiplayer
configuration in `online-game.json`. A lobby is not the multiplayer game: both
clients must render the same authoritative match. The remaining contract below
applies only to multiplayer.

## State ownership

- `room.players[*].x/y/score` are server authoritative. For realtime movement,
  never assign `x/y` directly to a visible sprite. Use the movement controller
  below so the local player is predicted and remote players are interpolated.
- `room.players[*].state` is that player's compact custom state. Publish it with
  `sendPlayerState`, for example health, facing, animation, or selected item.
- `room.shared_state` is the recoverable world snapshot. The current dynamic
  host (`YorollOnline.isHost()`) publishes it with `setSharedState`, for example
  collected coin ids, enemies, projectiles, round state, or level progress.
- `room.started_at` and `YorollOnline.elapsedMs()` are the shared match clock.
- `action` events are discrete intents/effects. Payloads use stable entity ids.

`sendPlayerState` accepts at most 2KB and `setSharedState` at most 6KB. Send only
JSON numbers, booleans, short strings, stable ids, and compact arrays. Never send
images, Base64, display objects, physics bodies, or the Phaser scene.

## Minimum realtime wiring

Adapt this shape to the game instead of copying a second local simulation:

```js
const net = {
  room: null,
  lastPlayerStateAt: 0,
  lastSharedStateAt: 0,
};

const movement = YorollOnline.createMovementController({
  applyLocal(position, player) {
    const sprite = createOrGetPlayerSprite(player.id, true);
    sprite.setPosition(position.x, position.y);
  },
  applyRemote(playerId, position, player) {
    const sprite = createOrGetPlayerSprite(playerId, false);
    sprite.setPosition(position.x, position.y);
  },
  removeRemote(playerId) {
    removePlayerSprite(playerId);
  },
  onError: showNetworkError,
});

YorollOnline.on('state', (room) => {
  net.room = room;
  room.players.forEach((player) => {
    // Movement is applied by the controller. State events update animation/HUD.
    renderPlayerState(player.id, player.state, player.score);
  });
  renderSharedWorld(room.shared_state); // create/update/remove by stable entity id
  renderTimer(YorollOnline.elapsedMs());
});

YorollOnline.on('action', (event) => {
  applyNetworkAction(event.name, event.player_id, event.payload);
});

function updateOnline(time, delta, inputX, inputY) {
  if (!net.room || net.room.phase !== 'playing') return;

  // Call every render frame. The controller sends fixed-rate input internally,
  // predicts the local sprite, reconciles acknowledgements, and interpolates peers.
  movement.setInput(inputX, inputY).update(delta);
  if (time - net.lastPlayerStateAt >= 100) {
    net.lastPlayerStateAt = time;
    YorollOnline.sendPlayerState(captureLocalPlayerState()).catch(showNetworkError);
  }
  if (YorollOnline.isHost() && time - net.lastSharedStateAt >= 100) {
    net.lastSharedStateAt = time;
    YorollOnline.setSharedState(captureSharedWorld()).catch(showNetworkError);
  }
}
```

Send a gameplay event with an allowed manifest action and a stable target id:

```js
YorollOnline.sendAction(
  'collect',
  { entity_id: coin.id },
  { dedupeKey: 'coin:' + coin.id }
);
YorollOnline.sendAction(
  'attack',
  { target_id: enemy.id, attack_id: attackId },
  { dedupeKey: 'attack:' + attackId }
);
```

`dedupeKey` makes retries and simultaneous collection idempotent at the server;
reuse the same key for the same one-shot world event. The host applies accepted actions to its shared simulation and publishes the
next `shared_state`. Every client renders that snapshot. Re-read `isHost()` on
each update because host ownership can migrate after a disconnect.

`createMovementController` is required for realtime games with continuous
movement. It uses the manifest `world.speed`, `world.width/height`, and
`tick_rate` by default. Do not combine it with manual `sendInput` calls, local
fake opponents, direct server-position assignment, or custom position tweens.
The manifest must use the same logical coordinates as the playable scene.
Controller options tune interpolation/correction only; they never override the
server-approved speed or world bounds. Client-only speed boosts, dashes,
knockback, and teleports are forbidden because the server will correctly reject
their extra distance. Keep those effects visual unless an approved server action
implements the same movement. Ordinary movement must keep soft reconciliation.

## Blocking two-client acceptance

1. A creates a room, B joins, and both become ready.
2. A moves continuously; B sees A move within 500ms.
3. A starts moving immediately and neither player visibly jumps backward under
   ordinary latency or jitter.
4. One client collects an entity id; it disappears on both clients exactly once.
5. Both timers differ by less than 500ms.
6. Attack, health, score, and settlement agree on both clients.
7. B reconnects and receives the current players and shared world, not a reset.

Entering the same room or synchronizing READY alone fails this contract.

## Deterministic lockstep mode

Use lockstep for action games, RTS, tower defense, fighting, racing, or any game
where the whole simulation must agree exactly. Keep the state-sync mode above for
casual movement games that do not need deterministic combat.

Set the manifest explicitly:

```json
{
  "version": 1,
  "enabled": true,
  "mode": "realtime",
  "max_players": 4,
  "tick_rate": 15,
  "reconnect_seconds": 45,
  "sync": {
    "mode": "lockstep",
    "input_delay_frames": 2,
    "max_prediction_frames": 8,
    "frame_timeout_ms": 250,
    "checksum_interval": 30,
    "snapshot_interval": 120,
    "history_frames": 300
  },
  "world": { "width": 1600, "height": 900, "speed": 260 },
  "actions": [],
  "score_rules": {}
}
```

Put the pure simulation in `simulation.js`. Phaser objects, audio, particles,
tweens, DOM, and camera effects belong only in `render`. Simulation coordinates,
velocities, timers, health, and cooldowns must be integers or
`YorollLockstep.Fixed` values. Never use `Math.random`, `Date.now`,
`performance.now`, Arcade Physics, Matter, native trigonometry, or unordered
object iteration inside `step`. Use stable ids, sorted arrays, and
`context.random` instead. Use `YorollLockstep.Physics2D.integrate`,
`circlesOverlap`, and `aabbsOverlap` for deterministic integer collision tests;
Phaser physics may mirror state for presentation but must not decide outcomes.

```js
const lockstep = YorollLockstep.createController({
  initialState: Simulation.createInitialState(),
  seed: 20260720,
  captureInput() {
    return Input.captureButtons(); // compact JSON intent, never positions or state
  },
  neutralInput() {
    return { moveX: 0, moveY: 0, attack: false };
  },
  step(context) {
    // Mutate only context.state using context.inputs, integer math, and stable order.
    Simulation.step(context);
  },
  render(state, alpha, metrics) {
    Presentation.render(state, alpha);
    DebugHud.update(metrics);
  },
  onDesync(details) {
    showNetworkError('State mismatch at frame ' + details.frame);
  },
  onError: showNetworkError,
});

lockstep.start();
```

The runtime commits a local input for every frame it simulates (the send
horizon is pegged to `nextFrame + input_delay`, capturing live input for each
frame as it is committed). This is mandatory: committing only the
confirmed-frame window leaves input gaps whenever server confirmations stall,
the server fills those gaps with neutral input, and the resulting rollback
erases the local player's own movement — a severe visible pullback after
movement stops. Key release is still encoded promptly because each committed
frame captures the live (current) input state. The runtime rolls back when
an authoritative frame differs, compares periodic checksums, and publishes host
snapshots for reconnect recovery. A checksum conflict triggers a host snapshot
and deterministic replay on peers. Do not also call
`createMovementController`, `sendInput`, `sendPlayerState`, or `setSharedState`
for simulation state in lockstep mode.

### Lockstep movement presentation (mandatory)

The 15Hz deterministic simulation and the 60Hz visible transform are separate:

- Local input must affect only a presentation position immediately. Never write
  presentation coordinates back into simulation state.
- Anchor the local player's presentation position to the simulated position
  every frame (`simPos + tick-interpolation`, i.e. the same `alpha`-lerped
  value used for remote entities), not to a freely-integrated dead-reckoning
  position. A display that only ever computes forward from the sim cannot
  accumulate the divergence that produces pullback — there is nothing to
  correct because the display never runs ahead of what the simulation can
  reproduce. On top of that anchor:
  - While a direction is held (or during the brief release-momentum window,
    below), add a **look-ahead offset**: `moveDirection * moveSpeed *
    pipelineDepthSeconds`, where `pipelineDepthSeconds` is roughly the local
    round-trip the input takes before it lands in the simulation (measured
    `?netlog=1` ack average, not a guess). This is what makes movement feel
    immediate despite the sim itself lagging by that same depth.
  - **Gate the look-ahead by direction, not just sign**: project it onto the
    live input direction (`offset · dir`, floored at 0) rather than only
    zeroing it when the dot product is negative. A 90° direction change has a
    zero dot product with the old offset, not a negative one — an "only
    reverse cancels it" gate lets the stale offset bleed sideways into the
    new direction for a tick, which reads as a lateral snap right as the
    player turns.
  - Chase the anchor+offset target with an exponential smoothing whose
    per-frame step is capped by a **single combined speed budget**
    (`~1.25× moveSpeed` in practice), and subtract whatever the look-ahead
    offset already consumed of that budget this frame. Two independent
    "feed-forward + catch-up" motions that don't share a budget can together
    exceed a believable speed, which reads as a surge.
  - **Never let the local player's display move backward while idle.** If the
    anchor is briefly behind the display (a rollback nudged the sim behind
    where the display already settled), do not correct it while the player is
    standing still — bank the error and let it bleed off automatically the
    next time the player moves in a compatible direction, when a few extra
    pixels of catch-up are imperceptible. Only fall back to an eased
    correction if the banked error grows pathologically large (e.g. >12
    simulation units) and the player has been idle for several seconds *and*
    the room's network diagnostics show it isn't a recurring pattern — that
    combination should be rare, and if it isn't, fix the input pipeline (see
    the fast-forward and pacing notes below), not the presentation layer.
  - On release, keep integrating the last held direction at the last held
    speed for approximately one `input_delay_frames` window (a "momentum"
    tail), then switch to the anchor-only behavior above. This lines up the
    moment the display stops with the moment the simulation actually receives
    the release, instead of freezing early and needing a correction later.
  - Drive the local player's facing from the live input direction (not from
    simulated velocity, which lags by the same pipeline depth), smoothed with
    a short (~80ms) angular exponential filter so a hard direction reversal
    turns instead of snapping. Facing and position must be driven by
    consistent sources (both live-input-based, or both sim-based) — mixing an
    instant facing snap with a smoothly-arriving position is what makes a
    correct turn look like a stutter.
  - Interpolate parabolic/vertical motion (jump arcs, knockback) by the same
    `alpha` used for horizontal position, not by the raw integer tick
    counter. A counter-driven arc renders as a visible 15Hz staircase; the
    same counter blended by `alpha` is smooth for free. Debounce one-shot
    action keys (`repeat` events) at the input layer — a physical key-repeat
    retriggering a one-shot action every OS repeat interval is a keyboard
    bug, not a sync bug, but it looks identical to one.
- Fast-forward the local simulation to the confirmed live edge on startup and
  after any stall (tab backgrounded, GC pause): replay already-finalized
  frames — which is risk-free, they're final — a few per render for small
  gaps, and in bulk (tens to hundreds per render) once the backlog is large,
  rather than trickling it in over several visible seconds. A client that
  never recovers lost wall-clock time stays permanently behind the
  confirmation stream, and every local input then needs a full network round
  trip (instead of the ~1-tick prediction path) before it reaches the
  simulation — every turn and stop feels delayed by however far behind the
  client has fallen, not by the actual network RTT.
- Diagnose feel regressions with `?netlog=1` (built into the shared runtime)
  before touching either layer: `ack avg` from `window.YorollNetDiag` is the
  real round trip: **healthy but the game still feels off is a presentation
  bug (this section); `ack avg` itself elevated (>200-300ms sustained, not a
  brief spike) is a network or server-pacing problem, not something the
  presentation layer can absorb away.** `input-overridden` firing means the
  server substituted your own already-committed input — that is specifically
  an input-pipeline defect (see the send-horizon note above), not a rendering
  one.
- Remote players must render from `controller.confirmedState()` (the
  never-rewinding confirmed timeline), chased with an exponential smoothing
  whose per-frame displacement is speed-capped (≈1.5–2× the entity's top
  speed). Rendering remote entities from the predicted head makes every one of
  their direction changes appear as a rubber-band correction on your screen.
  Never display raw 15Hz `state.x/state.y`, and never start a new tween for
  every logical frame.
- NPC/enemy visuals must also use a speed-capped smoothing chase toward their
  simulated position. Confirmations arrive in bursts under load; per-frame
  interpolation alone turns each burst into a visible multi-tick jump.
- Gameplay events/VFX (shots, hits, kills) must be deduplicated with a
  seen-id set, never a monotonic "id greater than the last rendered id"
  filter. Rollback replay re-emits events with ids at or below the high-water
  mark; a monotonic filter silently drops those effects on whichever client
  rolled back, so the two clients see different battles.
- Treat a timed-out frame as short-term last-input prediction. The server bounds
  this prediction and eventually falls back to neutral input, so games must
  encode key release as neutral movement in every captured input frame.
- Keep `input_delay_frames` at `2` unless measured production latency requires a
  different value. Do not increase `max_prediction_frames` to hide rendering
  stutter; it is a rollback bound, not a network send-ahead amount. More
  generally: never tune `online-game.json` sync values to fix movement feel —
  feel problems are presentation-layer bugs (this section) or engine/server
  bugs, and config changes only move where the correction appears.
- Throttle any user-facing network-error toast (once per several seconds). A
  transient send failure storm must not become a toast storm.

Acceptance must include press, hold, release, reverse direction, and repeated
short taps from both clients. The local view must not jump backward on release,
the peer view must not move in visible 15Hz steps or backtrack after it stops,
and combat VFX must appear on both clients — including immediately after a
rollback (verify while the other player is actively changing inputs).

Lockstep acceptance requires two independent clients under artificial latency
and jitter: identical checksum at every checkpoint, visible local response before
server confirmation, at least one exercised rollback, bounded prediction during
packet loss, and reconnect recovery from snapshot without restarting the match.

This implementation follows the architectural lessons from
[Lockstep-Tutorial](https://github.com/JiepengTan/Lockstep-Tutorial),
[UnityLockStepDemo](https://github.com/kisence-mian/UnityLockStepDemo), and
[LockstepFramework](https://github.com/nibsbin/LockstepFramework): fixed ticks,
deterministic simulation separated from presentation, prediction with rollback,
bounded history, checksums, and snapshot recovery. The browser/server code here
is an independent implementation for the Yoroll protocol; no source files are
copied from those repositories.
