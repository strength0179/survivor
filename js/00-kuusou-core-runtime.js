/* 核心 runtime：生命週期、場景索引、碰撞、保存與互動純規則。 */
  "use strict";
  window.KuusouCore = (() => {
    const VERSION = "2.3.0-complete-runtime";
    const SPEC = Object.freeze({
      projectionDegrees: 15,
      regionCount: 7,
      primarySceneDrawCount: 4,
      maximumTrackedObjectives: 7,
      transitionMs: 450,
      routeIdentityCount: 8,
      routeCombinationCount: 50,
      candidateLifeRouteCount: 3,
      battleMethodCount: 7,
      heroStageCoverage: { A: 20, B: 20, C: 20 },
      actorKinds: ["PLAYER", "CIVILIAN", "FREE_MINION", "MONSTER_MINION", "HERO_CANDIDATE", "HERO", "ROGUE_HERO", "MONSTER", "ALIEN_MESSENGER"],
      objectKinds: ["BUILDING", "ENTRANCE", "KEY_ITEM", "DEVICE", "SCENE_FEATURE", "MISSION_EXIT"],
      resourceNames: ["體力", "專注"],
      saveFormat: "kuusou-survivor-save-v3"
    });
    const LIFE = Object.freeze({ BOOT: "BOOT", PLAYING: "PLAYING", TRANSITION: "TRANSITION", SUCCESS: "SUCCESS", FAILED: "FAILED" });
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const hashSeed = (value = "") => {
      let hash = 2166136261;
      for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      return hash >>> 0;
    };
    const normalizeSeed = (value, fallback = 0x5eedc0de) => Number.isFinite(Number(value)) ? Number(value) >>> 0 : String(value || "").trim() ? hashSeed(value) : fallback >>> 0;
    const createSeededRandom = (seed) => {
      let value = normalizeSeed(seed);
      return () => {
        value += 0x6D2B79F5;
        let mixed = value; mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1); mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
        return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
      };
    };
    const createEventBus = () => {
      const listeners = new Map();
      return {
        on(type, listener) { const group = listeners.get(type) || new Set(); group.add(listener); listeners.set(type, group); return () => group.delete(listener); },
        emit(type, payload = {}) { const event = Object.freeze({ type, payload, at: Date.now() }); [...(listeners.get(type) || [])].forEach((listener) => listener(event)); [...(listeners.get("*") || [])].forEach((listener) => listener(event)); return event; },
        clear(type) { if (type == null) listeners.clear(); else listeners.delete(type); }
      };
    };
    const createLifecycle = (initial = LIFE.BOOT) => {
      let phase = initial, serial = 0;
      const history = [{ serial, phase, reason: "initial" }];
      const allowed = {
        [LIFE.BOOT]: new Set([LIFE.PLAYING, LIFE.FAILED]), [LIFE.PLAYING]: new Set([LIFE.TRANSITION, LIFE.SUCCESS, LIFE.FAILED]),
        [LIFE.TRANSITION]: new Set([LIFE.PLAYING, LIFE.SUCCESS, LIFE.FAILED]), [LIFE.SUCCESS]: new Set([LIFE.BOOT]), [LIFE.FAILED]: new Set([LIFE.BOOT])
      };
      return {
        get phase() { return phase; }, get canUpdate() { return phase === LIFE.PLAYING; }, get history() { return history.map((entry) => ({ ...entry })); },
        move(next, reason = "") { if (!allowed[phase]?.has(next)) throw new Error("不合法的關卡生命週期轉換：" + phase + " → " + next); phase = next; history.push({ serial: ++serial, phase, reason }); return phase; },
        reset(reason = "restart") { phase = LIFE.BOOT; history.push({ serial: ++serial, phase, reason }); return phase; }
      };
    };
    const createStore = () => {
      const records = new Map();
      return {
        ensure(id, factory = () => ({})) { if (!records.has(id)) records.set(id, factory()); return records.get(id); }, get(id) { return records.get(id) || null; },
        set(id, value) { records.set(id, value); return value; }, has(id) { return records.has(id); }, entries() { return [...records.entries()]; },
        snapshot(mapper = (value) => value) { return Object.fromEntries([...records.entries()].map(([id, value]) => [id, mapper(value, id)])); }
      };
    };
    const createEntityStore = () => {
      const records = new Map();
      return {
        upsert(entity) { if (!entity?.id) throw new Error("Actor／Object 必須有 id"); const next = { ...(records.get(entity.id) || {}), ...entity }; records.set(next.id, next); return next; },
        get(id) { return records.get(id) || null; }, remove(id) { return records.delete(id); }, values() { return [...records.values()].map((value) => ({ ...value })); },
        snapshot() { return Object.fromEntries([...records.entries()].map(([id, value]) => [id, { ...value }])); }
      };
    };
    const createObjectiveRegistry = (maximum = SPEC.maximumTrackedObjectives) => {
      const records = new Map(); let order = 0;
      const sorted = () => [...records.values()].sort((a, b) => a.priority - b.priority || a.order - b.order);
      return {
        upsert(objective) {
          if (!objective?.id) throw new Error("目標必須有 id");
          const existing = records.get(objective.id);
          if (!existing && records.size >= maximum) { const last = sorted().at(-1); if (!last || finite(objective.priority, 50) >= last.priority) return null; records.delete(last.id); }
          const next = { id: objective.id, label: objective.label || objective.id, kind: objective.kind || "GENERIC", priority: finite(objective.priority, 50), status: objective.status || "ACTIVE", areaKey: objective.areaKey || null, x: finite(objective.x), y: finite(objective.y), order: existing?.order ?? order++, ...existing, ...objective };
          records.set(next.id, next); return { ...next };
        },
        remove(id) { return records.delete(id); }, clear() { records.clear(); }, list() { return sorted().map((entry) => ({ ...entry })); }, primary() { return sorted().find((entry) => entry.status === "ACTIVE") || null; }
      };
    };
    const pointInAabb = (point, obstacle, padding = 0) => point.x >= obstacle.x - obstacle.halfWidth - padding && point.x <= obstacle.x + obstacle.halfWidth + padding && point.y >= obstacle.y - obstacle.halfHeight - padding && point.y <= obstacle.y + obstacle.halfHeight + padding;
    const pointInCircle = (point, obstacle, padding = 0) => Math.hypot(point.x - obstacle.x, point.y - obstacle.y) <= obstacle.radius + padding;
    const segmentIntersectsAabb = (from, to, obstacle, padding = 0) => {
      const limits = [[from.x, to.x - from.x, obstacle.x - obstacle.halfWidth - padding, obstacle.x + obstacle.halfWidth + padding], [from.y, to.y - from.y, obstacle.y - obstacle.halfHeight - padding, obstacle.y + obstacle.halfHeight + padding]];
      let tMin = 0, tMax = 1;
      return limits.every(([origin, delta, min, max]) => { if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max; let first = (min - origin) / delta, last = (max - origin) / delta; if (first > last) [first, last] = [last, first]; tMin = Math.max(tMin, first); tMax = Math.min(tMax, last); return tMin <= tMax; });
    };
    const segmentIntersectsCircle = (from, to, obstacle, padding = 0) => {
      const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : clamp(((obstacle.x - from.x) * dx + (obstacle.y - from.y) * dy) / lengthSquared, 0, 1);
      return Math.hypot(from.x + dx * t - obstacle.x, from.y + dy * t - obstacle.y) <= obstacle.radius + padding;
    };
    const hasLineOfSight = (from, to, obstacles = [], padding = 0) => !obstacles.some((obstacle) => obstacle.shape === "CIRCLE" ? segmentIntersectsCircle(from, to, obstacle, padding) : segmentIntersectsAabb(from, to, obstacle, padding));
    const moveWithSlide = (position, vector, distance, isBlocked) => {
      const length = Math.hypot(vector.x, vector.y); if (length < 1e-8 || distance <= 0) return { x: position.x, y: position.y, movedX: false, movedY: false };
      const dx = vector.x / length * distance, dy = vector.y / length * distance; let x = position.x, y = position.y, movedX = false, movedY = false;
      if (!isBlocked({ x: x + dx, y })) { x += dx; movedX = true; } if (!isBlocked({ x, y: y + dy })) { y += dy; movedY = true; }
      return { x, y, movedX, movedY };
    };
    const findNearestOpenPoint = (origin, isBlocked, step = .45, rings = 24, samples = 24) => {
      if (!isBlocked(origin)) return { ...origin };
      for (let ring = 1; ring <= rings; ring += 1) for (let sample = 0; sample < samples; sample += 1) { const angle = sample / samples * Math.PI * 2 + (ring % 2 ? Math.PI / samples : 0), candidate = { x: origin.x + Math.cos(angle) * ring * step, y: origin.y + Math.sin(angle) * ring * step }; if (!isBlocked(candidate)) return candidate; }
      return null;
    };
    const INTERACTION = Object.freeze({ standardRate: 50, heroLeverRate: 50, heroLeverCharge: 75, heroLeverProgress: 35 });
    const createSceneObject = ({ id, kind = "DEVICE", name = kind, interactionType = "STANDARD", requiredFocus = 125, partCount = 1, destructible = true, ...rest } = {}) => {
      if (!id) throw new Error("場景互動物件必須有 id"); const parts = Math.max(1, Math.floor(finite(partCount, 1)));
      return { id, kind, name, interactionType, requiredFocus: Math.max(1, finite(requiredFocus, 125)), parts: Array.from({ length: parts }, (_, index) => ({ index, progress: 0 })), partIndex: 0, status: "AVAILABLE", destructible: Boolean(destructible), ...rest };
    };
    const beginFocusOperation = (object) => { if (!object || object.status === "DESTROYED") return { state: "UNAVAILABLE", operation: null }; if (object.status === "COMPLETE") return { state: "COMPLETE", operation: null }; object.status = "ACTIVE"; return { state: "STARTED", operation: { objectId: object.id, type: "FOCUS", active: true, waitingForFullFocus: false } }; };
    const advanceFocusOperation = (actor, object, operation, dt = 1 / 60, rate = INTERACTION.standardRate) => {
      if (!object || !operation || operation.type !== "FOCUS") return { state: "NO_OPERATION" }; const max = finite(actor?.focusMax, finite(actor?.resourceMax, finite(actor?.max, 100)));
      if (operation.waitingForFullFocus) { if (finite(actor?.focus) < max - 1e-9) return { state: "WAITING_FOR_FULL_FOCUS", operation }; operation.waitingForFullFocus = false; operation.active = true; }
      const part = object.parts?.[object.partIndex]; if (!part) { object.status = "COMPLETE"; return { state: "COMPLETE", operation: null }; }
      const amount = Math.min(Math.max(0, finite(actor?.focus)), Math.max(0, finite(rate, INTERACTION.standardRate)) * Math.max(0, finite(dt)), Math.max(0, object.requiredFocus - part.progress)); actor.focus = Math.max(0, finite(actor?.focus) - amount); part.progress += amount;
      if (part.progress >= object.requiredFocus - 1e-9) { part.progress = object.requiredFocus; object.partIndex += 1; if (object.partIndex >= object.parts.length) { object.status = "COMPLETE"; return { state: "COMPLETE", operation: null, completedObject: true, amount }; } object.status = "PARTIAL"; return { state: "PART_COMPLETE", operation, amount, nextPartIndex: object.partIndex }; }
      if (actor.focus <= 1e-9) { operation.active = false; operation.waitingForFullFocus = true; object.status = "PARTIAL"; return { state: "WAITING_FOR_FULL_FOCUS", operation, amount }; } return { state: "INJECTING", operation, amount };
    };
    const beginHeroLeverOperation = (object, { charge = INTERACTION.heroLeverCharge, progress = INTERACTION.heroLeverProgress } = {}) => { if (!object || object.status === "DESTROYED") return { state: "UNAVAILABLE", operation: null }; if (object.status === "COMPLETE") return { state: "COMPLETE", operation: null }; object.status = "ACTIVE"; object.progress = clamp(finite(object.progress), 0, Math.max(1, finite(progress, INTERACTION.heroLeverProgress))); return { state: "STARTED", operation: { objectId: object.id, type: "HERO_LEVER", phase: "CHARGE", charge: 0, chargeRequired: Math.max(1, finite(charge, INTERACTION.heroLeverCharge)), progressRequired: Math.max(1, finite(progress, INTERACTION.heroLeverProgress)), waitingForFullResources: false, active: true } }; };
    const advanceHeroLeverOperation = (player, hero, object, operation, { dt = 1 / 60, rate = INTERACTION.heroLeverRate, heroAvailable = true } = {}) => {
      if (!object || !operation || operation.type !== "HERO_LEVER") return { state: "NO_HERO_LEVER" }; if (object.status === "DESTROYED") return { state: "DESTROYED", operation: null }; if (!heroAvailable || !hero) return { state: "HERO_UNAVAILABLE", operation };
      const playerMax = finite(player?.focusMax, finite(player?.resourceMax, finite(player?.max, 100))), heroMax = finite(hero?.focusMax, finite(hero?.resourceMax, finite(hero?.max, 100)));
      if (operation.waitingForFullResources) { if (finite(player?.focus) < playerMax - 1e-9 || finite(hero?.focus) < heroMax - 1e-9) return { state: "WAITING_FOR_FULL_RESOURCES", operation }; operation.waitingForFullResources = false; operation.active = true; operation.phase = "CHARGE"; operation.charge = 0; }
      let available = Math.min(Math.max(0, finite(player?.focus)), Math.max(0, finite(hero?.focus)), Math.max(0, finite(rate, INTERACTION.heroLeverRate)) * Math.max(0, finite(dt))), amount = 0;
      if (operation.phase === "CHARGE") { const charged = Math.min(available, Math.max(0, operation.chargeRequired - operation.charge)); operation.charge += charged; available -= charged; amount += charged; if (operation.charge >= operation.chargeRequired - 1e-9) { operation.charge = operation.chargeRequired; operation.phase = "STABLE"; } }
      if (operation.phase === "STABLE" && available > 0) { const progressed = Math.min(available, Math.max(0, operation.progressRequired - finite(object.progress))); object.progress = clamp(finite(object.progress) + progressed, 0, operation.progressRequired); amount += progressed; if (object.progress >= operation.progressRequired - 1e-9) { object.progress = operation.progressRequired; object.status = "COMPLETE"; player.focus = Math.max(0, finite(player?.focus) - amount); hero.focus = Math.max(0, finite(hero?.focus) - amount); return { state: "COMPLETE", operation: null, completedObject: true, amount }; } }
      player.focus = Math.max(0, finite(player?.focus) - amount); hero.focus = Math.max(0, finite(hero?.focus) - amount);
      if (player.focus <= 1e-9 || hero.focus <= 1e-9) { operation.waitingForFullResources = true; operation.active = false; operation.phase = "CHARGE"; operation.charge = 0; object.status = "PARTIAL"; return { state: "WAITING_FOR_FULL_RESOURCES", operation, amount }; } return { state: operation.phase, operation, amount };
    };
    const rollHeroLeverOutcome = (random = Math.random) => { const value = clamp(finite(random(), 0), 0, .999999); return value < 1 / 7 ? "UNBEATABLE_VILLAIN" : value < 4 / 7 ? "POWERFUL_ITEM_OR_TRANSFORM_KEY" : value < 5 / 7 ? "HERO_REVIVAL_ITEM" : "HIDDEN_BRANCH_ITEM"; };
    const destroySceneObject = (object, source = "UNKNOWN") => { if (!object) return { destroyed: false, reason: "MISSING" }; if (!object.destructible) return { destroyed: false, reason: "INDESTRUCTIBLE", object }; if (object.status === "DESTROYED") return { destroyed: false, reason: "ALREADY_DESTROYED", object }; object.status = "DESTROYED"; object.destroyedBy = source; return { destroyed: true, object }; };
    const createRunCore = ({ seed, maxObjectives, lifecycle = LIFE.BOOT } = {}) => ({ version: VERSION, spec: SPEC, seed: normalizeSeed(seed), random: createSeededRandom(seed), events: createEventBus(), lifecycle: createLifecycle(lifecycle), scenes: createStore(), actors: createEntityStore(), objects: createEntityStore(), objectives: createObjectiveRegistry(maxObjectives) });
    return Object.freeze({ VERSION, SPEC, LIFE, INTERACTION, clamp, hashSeed, normalizeSeed, createSeededRandom, createEventBus, createLifecycle, createRunCore, hasLineOfSight, moveWithSlide, findNearestOpenPoint, pointInAabb, pointInCircle, createSceneObject, beginFocusOperation, advanceFocusOperation, beginHeroLeverOperation, advanceHeroLeverOperation, rollHeroLeverOutcome, destroySceneObject });
  })();
