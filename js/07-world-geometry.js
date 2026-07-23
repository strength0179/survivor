/* 世界幾何：投影、建築／室內生成、場景物件、障礙、視線與位置保存。 */
  const PROJECTION_ANGLE = Math.PI / 12;
  const PROJECTION_SCALE = 30;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect(), width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function screenInputToWorldVector(screenX, screenY) {
    const length = Math.hypot(screenX, screenY);
    if (length < .0001) return { x: 0, y: 0 };
    const sx = screenX / length, sy = screenY / length;
    const horizontal = Math.cos(PROJECTION_ANGLE), vertical = Math.sin(PROJECTION_ANGLE);
    // 反轉 15° 投影：所有螢幕方向各移動一單位時，畫面上的像素距離完全相同。
    return { x: .5 * (sx / horizontal + sy / vertical), y: .5 * (sy / vertical - sx / horizontal) };
  }

  function worldFromScreenPoint(screenX, screenY) {
    const horizontal = Math.cos(PROJECTION_ANGLE) * PROJECTION_SCALE, vertical = Math.sin(PROJECTION_ANGLE) * PROJECTION_SCALE;
    const difference = (screenX - canvas.width / 2) / horizontal, sum = (screenY - canvas.height / 2) / vertical;
    return { x: state.camera.x + (difference + sum) / 2, y: state.camera.y + (sum - difference) / 2 };
  }

  function seeded(index, salt = 1) {
    const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function seededLayoutRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let mixed = value; mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1); mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeBuildingEntrance(building, buildingIndex, entranceIndex, random) {
    const side = ["E", "S", "W", "N"][(buildingIndex + entranceIndex * 2 + Math.floor(random() * 4)) % 4];
    const offsetX = (random() - .5) * building.width * .9, offsetY = (random() - .5) * building.depth * .9, clearance = .66;
    let x = building.x, y = building.y, normalX = 0, normalY = 0;
    if (side === "E") { x += building.width + clearance; y += offsetY; normalX = 1; }
    if (side === "W") { x -= building.width + clearance; y += offsetY; normalX = -1; }
    if (side === "S") { x += offsetX; y += building.depth + clearance; normalY = 1; }
    if (side === "N") { x += offsetX; y -= building.depth + clearance; normalY = -1; }
    return { id: building.id + "-E" + entranceIndex, buildingId: building.id, x, y, normalX, normalY, side, targetScene: regionById(building.regionId).scene };
  }

  function makeRect(id, x, y, halfWidth, halfHeight, kind) {
    return { id, x, y, halfWidth, halfHeight, kind };
  }

  function corridorBetween(id, from, to) {
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    return horizontal
      ? makeRect(id, (from.x + to.x) / 2, from.y, Math.abs(to.x - from.x) / 2 + .75, .72, "CORRIDOR")
      : makeRect(id, from.x, (from.y + to.y) / 2, .72, Math.abs(to.y - from.y) / 2 + .75, "CORRIDOR");
  }

  function createPillarInterior(buildingId, scene, random) {
    const count = 7 + Math.floor(random() * 6), pillars = [], entry = { x: -13.2, y: 0 };
    const columns = count >= 10 ? 4 : 3, rows = 3, candidates = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      candidates.push({
        x: columns === 4 ? -7.8 + column * 5.2 : -6.4 + column * 6.4,
        y: -4.8 + row * 4.8
      });
    }
    for (let index = 0; index < count; index += 1) {
      const source = candidates[Math.min(candidates.length - 1, Math.floor(index * candidates.length / count))];
      pillars.push({
        id: buildingId + "-P" + (index + 1),
        x: source.x + (random() - .5) * .26, y: source.y + (random() - .5) * .26,
        radius: .55 + random() * .12, height: 38 + random() * 38,
        shape: (index + Math.floor(random() * 2)) % 2 ? "ROUND" : "SQUARE"
      });
    }
    return {
      id: buildingId + "-INTERIOR", buildingId, scene, type: "PILLARS", entry,
      deepestPoint: { x: 12.2, y: (random() - .5) * 3.2 }, pillars, rooms: [], corridors: [], walkableRects: [],
      minions: [], pendingSpawns: 0, nextSpawnAt: 0, spawnSerial: 0, secretConnections: [],
      boundary: { x: 0, y: 0, halfWidth: 14.1, halfHeight: 9.1, radius: 1.6 },
      generationRule: "巴洛克地下柱廳｜7–12 根等距圓柱／方柱｜藍色柱腳為實體碰撞範圍"
    };
  }

  function createRoomInterior(buildingId, scene, random) {
    const desired = 7 + Math.floor(random() * 3), entry = { x: -13.2, y: 0 }, turnSign = random() < .5 ? -1 : 1;
    const corridors = [
      makeRect(buildingId + "-C1", -5.1, 0, 8.1, .78, "MAIN_CORRIDOR"),
      makeRect(buildingId + "-C2", 3, turnSign * 3.1, .78, 3.85, "TURN_CORRIDOR"),
      makeRect(buildingId + "-C3", 8.2, turnSign * 6.2, 5.9, .78, "DEEP_CORRIDOR")
    ];
    const regularSlots = [-9.2, -4.6, 0].flatMap((x) => [-1, 1].map((sign) => ({ x, y: sign * 3.05, anchor: { x, y: 0 } })));
    const deepSlots = [
      { x: 12.3, y: turnSign * 6.2, anchor: { x: 11.4, y: turnSign * 6.2 }, deepest: true },
      { x: 6.3, y: turnSign * 8.15, anchor: { x: 6.3, y: turnSign * 6.2 } },
      { x: 9.3, y: turnSign * 4.12, anchor: { x: 9.3, y: turnSign * 6.2 } }
    ];
    const slots = [...regularSlots, ...deepSlots.slice(0, desired - regularSlots.length)], rooms = [], doors = [], connections = [];
    slots.forEach((slot, index) => {
      const room = makeRect(buildingId + "-R" + (index + 1), slot.x, slot.y, slot.deepest ? 1.65 : 1.55 + random() * .12, slot.deepest ? 1.6 : 1.38 + random() * .12, slot.deepest ? "DEEPEST_ROOM" : "ROOM");
      rooms.push(room);
      const door = corridorBetween(buildingId + "-D" + (index + 1), room, slot.anchor);
      door.halfWidth = Math.min(door.halfWidth, Math.abs(room.x - slot.anchor.x) / 2 + .72);
      door.halfHeight = Math.min(door.halfHeight, Math.abs(room.y - slot.anchor.y) / 2 + .72);
      doors.push(door); connections.push({ from: room.id, to: index < 6 ? corridors[0].id : corridors[2].id, onePath: Boolean(slot.deepest) });
    });
    const deepest = rooms.find((room) => room.kind === "DEEPEST_ROOM") || rooms.at(-1);
    return {
      id: buildingId + "-INTERIOR", buildingId, scene, type: "ROOMS", entry,
      deepestPoint: { x: deepest.x, y: deepest.y }, pillars: [], rooms, corridors: [...corridors, ...doors], walkableRects: [...rooms, ...corridors, ...doors], connections,
      requiredDepth: 3, onePathDepth: 2, turnSign, minions: [], pendingSpawns: 0, nextSpawnAt: 0, spawnSerial: 0, secretConnections: [],
      generationRule: "一般建築｜一條主走廊＋轉彎走廊｜左右獨立隔間｜7–9 房｜最深房需通過兩段走廊"
    };
  }

  function createChamberInterior(buildingId, scene, random) {
    const entry = { x: -13.2, y: 0 }, rooms = [], corridors = [], sign = random() < .5 ? -1 : 1;
    const centers = [
      { x: -10.4, y: 0 }, { x: -6.8, y: sign * 2.8 }, { x: -3.1, y: 0 }, { x: .8, y: sign * 3.2 },
      { x: 4.7, y: 0 }, { x: 8.4, y: sign * 3.2 }, { x: 12, y: 0 }
    ];
    centers.forEach((center, index) => rooms.push(makeRect(buildingId + "-S" + (index + 1), center.x, center.y, index === centers.length - 1 ? 1.75 : 1.45, index === centers.length - 1 ? 1.65 : 1.35, index === centers.length - 1 ? "DEEPEST_ROOM" : "SPECIAL_CHAMBER")));
    for (let index = 1; index < rooms.length; index += 1) corridors.push(corridorBetween(buildingId + "-SC" + index, rooms[index - 1], rooms[index]));
    return {
      id: buildingId + "-INTERIOR", buildingId, scene, type: "CHAMBERS", entry,
      deepestPoint: { x: rooms.at(-1).x, y: rooms.at(-1).y }, pillars: [], rooms, corridors, walkableRects: [...rooms, ...corridors],
      connections: rooms.slice(1).map((room, index) => ({ from: rooms[index].id, to: room.id, onePath: index >= 4 })),
      requiredDepth: 6, onePathDepth: 2, minions: [], pendingSpawns: 0, nextSpawnAt: 0, spawnSerial: 0, secretConnections: [],
      generationRule: "特殊地下空間｜連續儀式室／實驗室｜保留一室接一室的異常格局"
    };
  }

  function createBuildingInterior(building, index, random) {
    const scene = building.kind === "FACTORY" ? "工廠內場"
      : building.kind === "HOSPITAL" ? "醫院內場"
      : building.kind === "HARBOR" ? "港區倉庫內場"
      : (building.kind === "LAB" || building.kind === "SIGNAL") ? "地下秘密研究室" : "都市內場";
    if (building.kind === "LAB" || building.kind === "SIGNAL") return random() < .62 ? createPillarInterior(building.id, scene, random) : createChamberInterior(building.id, scene, random);
    if ((building.kind === "FACTORY" || building.kind === "HARBOR") && random() < .2) return createPillarInterior(building.id, scene, random);
    return createRoomInterior(building.id, scene, random);
  }

  function sceneIsOutdoor(scene) { return ["都市外場", "工廠外場", "醫院外場", "海港碼頭", "山麓觀測區", "住宅避難區", "電波塔丘陵"].includes(scene); }
  function buildingCandidatesForScene(scene) {
    if (scene === "工廠外場" || scene === "工廠內場") return WORLD_BUILDINGS.filter((building) => building.regionId === "FACTORY");
    if (scene === "醫院外場" || scene === "醫院內場") return WORLD_BUILDINGS.filter((building) => building.regionId === "HOSPITAL");
    if (scene === "海港碼頭" || scene === "港區倉庫內場") return WORLD_BUILDINGS.filter((building) => building.regionId === "HARBOR");
    if (scene === "地下秘密研究室" || scene === "山麓觀測區") return WORLD_BUILDINGS.filter((building) => building.kind === "LAB" || building.kind === "SIGNAL");
    if (scene === "住宅避難區") return WORLD_BUILDINGS.filter((building) => building.regionId === "RESIDENTIAL");
    if (scene === "電波塔丘陵") return WORLD_BUILDINGS.filter((building) => building.regionId === "SIGNAL");
    return WORLD_BUILDINGS.filter((building) => building.regionId === "CITY");
  }
  function selectBuildingForScene(scene, offset, excluded = new Set()) {
    const candidates = buildingCandidatesForScene(scene), available = candidates.filter((building) => !excluded.has(building.id));
    const pool = available.length ? available : candidates.length ? candidates : WORLD_BUILDINGS;
    return pool[Math.abs(offset) % pool.length];
  }

  function createBuildingLayout() {
    const random = seededLayoutRandom(BUILDING_LAYOUT_SEED);
    WORLD_BUILDINGS.length = 0;
    BUILDING_BLUEPRINTS.forEach((blueprint, index) => {
      const building = {
        id: "M" + String(index + 1).padStart(2, "0"),
        x: blueprint.slot[0] + (random() - .5) * 7,
        y: blueprint.slot[1] + (random() - .5) * 7,
        width: 2.05 + random() * 2.1,
        depth: 1.55 + random() * 1.65,
        height: 42 + random() * 80,
        label: blueprint.label, regionId: blueprint.regionId, kind: blueprint.kind,
        palette: index % 2,
        entrances: [],
        interior: null
      };
      const entranceCount = index % 3 === 0 ? 2 : 1;
      for (let entranceIndex = 0; entranceIndex < entranceCount; entranceIndex += 1) building.entrances.push(makeBuildingEntrance(building, index, entranceIndex, random));
      building.interior = createBuildingInterior(building, index, random);
      building.entrances.forEach((entrance) => { entrance.targetScene = building.interior.scene; });
      WORLD_BUILDINGS.push(building);
    });

    const routeIndex = Math.max(0, ITEM_ROUTES.indexOf(ACTIVE_ITEM_ROUTE));
    const occupied = new Set();
    KEY_ITEM_CHAIN.forEach((item, index) => {
      const targetScene = index === 0 ? "都市外場" : item.scene;
      const building = selectBuildingForScene(targetScene, routeIndex + index, occupied), entrance = building.entrances[0];
      occupied.add(building.id);
      item.buildingId = building.id; item.entranceId = entrance.id; item.difficulty = index === 0 ? "VISIBLE" : index === 1 ? "LOW" : "HIGH";
      item.regionId = building.regionId;
      if (index === 0 || sceneIsOutdoor(item.scene)) {
        item.placement = "OUTDOOR";
        item.x = entrance.x + entrance.normalX * 1.75; item.y = entrance.y + entrance.normalY * 1.75;
      } else {
        item.placement = "INTERIOR";
        building.interior.scene = item.scene;
        item.x = building.interior.deepestPoint.x; item.y = building.interior.deepestPoint.y;
      }
    });
    const candidateBuilding = selectBuildingForScene(state.heroCandidate.scene, routeIndex + 7, occupied), candidateEntrance = candidateBuilding.entrances[0];
    state.heroCandidate.buildingId = candidateBuilding.id; state.heroCandidate.entranceId = candidateEntrance.id;
    state.heroCandidate.regionId = candidateBuilding.regionId;
    if (sceneIsOutdoor(state.heroCandidate.scene)) {
      state.heroCandidate.placement = "OUTDOOR";
      state.heroCandidate.x = candidateEntrance.x + candidateEntrance.normalX * 3.1; state.heroCandidate.y = candidateEntrance.y + candidateEntrance.normalY * 3.1;
    } else {
      candidateBuilding.interior.scene = state.heroCandidate.scene;
      state.heroCandidate.placement = "INTERIOR";
      state.heroCandidate.x = candidateBuilding.interior.deepestPoint.x - 1.15; state.heroCandidate.y = candidateBuilding.interior.deepestPoint.y + 1.25;
    }
    state.heroCandidate.targetX = state.heroCandidate.x; state.heroCandidate.targetY = state.heroCandidate.y;
    const profile = characterProfile(state.heroCandidate.id), runtime = profile?.runtime || {};
    state.heroCandidate.ai = profile?.ai || 2;
    state.heroCandidate.traits = [...(profile?.personality?.traits || [])];
    state.heroCandidate.senseDistance = clamp((runtime.senseDistance || 100) / 10, 7, 15);
  }

  function makeSceneObject(template, descriptor) {
    const parts = Math.max(1, template.parts || 1);
    return {
      id: descriptor.id,
      kind: template.kind,
      name: template.name,
      primitive: template.primitive,
      interactionType: template.interactionType || "STANDARD",
      requiredFocus: template.requiredFocus,
      stableRequired: template.stableRequired || 0,
      stableProgress: 0,
      maintenanceProgress: 0,
      maintenanceRequired: template.progressRequired || 0,
      maintenanceFocusPerSecond: template.maintenanceFocusPerSecond || 0,
      parts: Array.from({ length: parts }, (_, index) => ({ index, progress: 0 })),
      partIndex: 0,
      progress: 0,
      status: "AVAILABLE",
      destructible: template.destructible !== false,
      effect: template.effect,
      clue: template.clue || 0,
      tracking: template.tracking || 0,
      note: template.note,
      specialAction: template.specialAction || null,
      heroRequirement: template.heroRequirement || [],
      vehicleKind: descriptor.vehicleKind || template.vehicleKind || null,
      challengeSeen: false,
      areaKey: descriptor.areaKey,
      placement: descriptor.placement,
      regionId: descriptor.regionId || null,
      buildingId: descriptor.buildingId || null,
      scene: descriptor.scene,
      x: descriptor.x,
      y: descriptor.y,
      radius: template.interactionType === "HERO_LEVER" ? 1.05 : .9
    };
  }

  function validSceneObjectPoint(point, accepted, areaKey) {
    if (!point || collidesBuilding(point.x, point.y, .2)) return false;
    if (KEY_ITEM_CHAIN.some((item) => (item.placement === "INTERIOR" ? "INTERIOR:" + item.buildingId : "OUTDOOR:" + item.regionId) === areaKey && Math.hypot(item.x - point.x, item.y - point.y) < 3.1)) return false;
    return !accepted.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 3.1);
  }

  function randomObjectPointInRegion(region, random, accepted, areaKey, salt) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const raw = { x: region.xMin + 4 + random() * Math.max(1, region.xMax - region.xMin - 8), y: region.yMin + 4 + random() * Math.max(1, region.yMax - region.yMin - 8) };
      const point = findOpenWorldPoint(raw.x, raw.y, salt + attempt * 17);
      if (regionAtPoint(point.x, point.y).id === region.id && validSceneObjectPoint(point, accepted, areaKey)) return point;
    }
    return findOpenWorldPoint((region.xMin + region.xMax) / 2, (region.yMin + region.yMax) / 2, salt + 991);
  }

  function randomObjectPointInInterior(interior, random, accepted, areaKey, salt) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const point = attempt === 0 ? { ...interior.deepestPoint } : randomInteriorOpenPoint(interior, salt + attempt * 23, 0);
      const itemCollision = KEY_ITEM_CHAIN.some((item) => "INTERIOR:" + item.buildingId === areaKey && Math.hypot(item.x - point.x, item.y - point.y) < 2.2);
      if (!itemCollision && !accepted.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 2.2)) return point;
    }
    return { ...interior.entry };
  }

  function initializeSceneObjects() {
    const random = seededLayoutRandom((BUILDING_LAYOUT_SEED ^ 0x5a17c0de) >>> 0), objects = [];
    WORLD_REGIONS.forEach((region, regionIndex) => {
      const areaKey = "OUTDOOR:" + region.id, accepted = [], templateIndexes = [0, 1, 2, 4, 5];
      templateIndexes.forEach((templateIndex, index) => {
        const point = randomObjectPointInRegion(region, random, accepted, areaKey, 11000 + regionIndex * 137 + index);
        const vehicleKind = SCENE_OBJECT_TEMPLATES[templateIndex].kind === "VEHICLE_REPAIR" ? (["FACTORY", "HARBOR"].includes(region.id) ? "MOTORCYCLE" : "BICYCLE") : null;
        const object = makeSceneObject(SCENE_OBJECT_TEMPLATES[templateIndex], { id: "O-" + region.id + "-" + (index + 1), areaKey, placement: "OUTDOOR", regionId: region.id, scene: region.scene, vehicleKind, ...point });
        accepted.push(object); objects.push(object);
      });
      const feature = SCENE_FEATURE_RULES[region.id];
      if (feature) {
        const point = randomObjectPointInRegion(region, random, accepted, areaKey, 11600 + regionIndex * 173);
        const object = makeSceneObject({ kind: "SCENE_FEATURE", interactionType: "STANDARD", destructible: true, effect: "SCENE_FEATURE", ...feature }, { id: "F-" + region.id, areaKey, placement: "OUTDOOR", regionId: region.id, scene: region.scene, ...point });
        accepted.push(object); objects.push(object);
      }
    });
    WORLD_BUILDINGS.forEach((building, buildingIndex) => {
      const interior = building.interior, areaKey = "INTERIOR:" + building.id, accepted = [];
      const templateIndexes = (building.kind === "LAB" || building.kind === "SIGNAL") ? [0, 2, 3, 4] : [0, 1, 2, 4];
      templateIndexes.forEach((templateIndex, index) => {
        const point = randomObjectPointInInterior(interior, random, accepted, areaKey, 14000 + buildingIndex * 173 + index);
        const object = makeSceneObject(SCENE_OBJECT_TEMPLATES[templateIndex], { id: "I-" + building.id + "-O" + (index + 1), areaKey, placement: "INTERIOR", buildingId: building.id, scene: interior.scene, ...point });
        accepted.push(object); objects.push(object);
      });
    });
    state.sceneObjects = objects;
    // 每區一個可被該區專屬裝置解除的封鎖點；避免放在建築內，讓「爆炸／斷電改路」有真正碰撞結果。
    state.dynamicObstacles = WORLD_REGIONS.map((region, index) => {
      const feature = objects.find((object) => object.id === "F-" + region.id);
      const raw = feature ? { x: feature.x + (index % 2 ? 3.4 : -3.4), y: feature.y + (index % 3 - 1) * 2.2 } : { x: (region.xMin + region.xMax) / 2, y: (region.yMin + region.yMax) / 2 };
      const point = findOpenWorldPoint(raw.x, raw.y, 11900 + index * 23);
      state.sceneBarrierStates[region.id] = "SEALED";
      return { id: "BARRIER:" + region.id, areaKey: "OUTDOOR:" + region.id, x: point.x, y: point.y, radius: 1.15, shape: "CIRCLE", kind: "SEALED_ROUTE", active: true, color: SCENE_VISUALS[region.scene].color };
    });
  }

  // 以建築 id／外場區域作為持久化鍵；進出室內、跨七區時都不重新生成既有內容。
  function coreSceneKey(areaMode = state.areaMode, buildingId = state.currentBuildingId, regionId = state.regionId) {
    return areaMode === "INTERIOR" ? "INTERIOR:" + buildingId : "OUTDOOR:" + regionId;
  }

  function persistCurrentScene(reason = "tick") {
    const key = coreSceneKey();
    const record = state.core.scenes.ensure(key, () => ({ id: key, type: state.areaMode, buildingId: state.currentBuildingId, regionId: state.regionId, destroyed: [], visits: 0 }));
    record.type = state.areaMode; record.buildingId = state.currentBuildingId; record.regionId = state.regionId; record.scene = state.scene;
    record.lastPlayerPosition = { x: state.player.x, y: state.player.y }; record.lastReason = reason; record.visits = (record.visits || 0) + 1;
    const actors = [state.heroCandidate, state.heroActor, ...state.extraHeroActors, state.monsterActor, ...state.freeMinionActors, ...state.monsterMinionActors].filter((actor) => actor && actor.alive !== false && actor.areaMode === state.areaMode && actor.buildingId === state.currentBuildingId);
    record.actorPositions = Object.fromEntries(actors.map((actor) => [actor.id, { x: actor.x, y: actor.y, areaMode: actor.areaMode, buildingId: actor.buildingId, behaviorMode: actor.behaviorMode || null }]));
    state.sceneActorPositions[key] = record.actorPositions;
    emitCore("SCENE_PERSISTED", { sceneKey: key, reason });
    return record;
  }

  function restoreSceneActorPositions(key = coreSceneKey()) {
    const record = state.core.scenes.get(key), positions = record?.actorPositions || state.sceneActorPositions[key];
    if (!positions) return false;
    const actors = [state.heroCandidate, state.heroActor, ...state.extraHeroActors, state.monsterActor, ...state.freeMinionActors, ...state.monsterMinionActors].filter(Boolean);
    actors.forEach((actor) => {
      const saved = positions[actor.id];
      if (!saved) return;
      const point = findOpenCurrentAreaPoint(saved.x, saved.y, 8800 + String(actor.id).length);
      actor.x = point.x; actor.y = point.y; actor.targetX = point.x; actor.targetY = point.y; actor.areaMode = state.areaMode; actor.buildingId = state.currentBuildingId;
      if (saved.behaviorMode) actor.behaviorMode = saved.behaviorMode;
    });
    return true;
  }

  function registerGeneratedWorldInCore() {
    state.core.scenes.set("WORLD", { id: "WORLD", type: "OVERWORLD", seed: RUN_SEED, layoutSeed: BUILDING_LAYOUT_SEED, regions: WORLD_REGIONS });
    WORLD_BUILDINGS.forEach((building) => {
      upsertIndexedEntity(state.core.objects, building, "BUILDING", { areaKey: "OUTDOOR:" + building.regionId, width: building.width, depth: building.depth, label: building.label, interiorId: building.interior.id, entrances: building.entrances.map((entry) => entry.id) });
      state.core.scenes.set("INTERIOR:" + building.id, building.interior);
      building.entrances.forEach((entrance) => upsertIndexedEntity(state.core.objects, entrance, "ENTRANCE", { areaKey: "OUTDOOR:" + building.regionId, buildingId: building.id, targetScene: building.interior.scene }));
    });
    KEY_ITEM_CHAIN.forEach((item) => upsertIndexedEntity(state.core.objects, item, "KEY_ITEM", { areaKey: item.placement === "INTERIOR" ? "INTERIOR:" + item.buildingId : "OUTDOOR:" + item.regionId, x: item.x, y: item.y, status: "AVAILABLE", family: item.family, category: item.category }));
    state.sceneObjects.forEach((object) => upsertIndexedEntity(state.core.objects, object, object.kind === "SCENE_FEATURE" ? "SCENE_FEATURE" : "DEVICE", { name: object.name, areaKey: object.areaKey, status: object.status, interactionType: object.interactionType, requiredFocus: object.requiredFocus, destructible: object.destructible }));
    upsertIndexedEntity(state.core.actors, state.player, "PLAYER", { id: "PLAYER", areaKey: coreSceneKey(), x: state.player.x, y: state.player.y });
    upsertIndexedEntity(state.core.actors, state.heroCandidate, "HERO_CANDIDATE", { areaKey: state.heroCandidate.placement === "INTERIOR" ? "INTERIOR:" + state.heroCandidate.buildingId : "OUTDOOR:" + state.heroCandidate.regionId, x: state.heroCandidate.x, y: state.heroCandidate.y, status: "ROAMING" });
    emitCore("WORLD_GENERATED", { layoutSeed: BUILDING_LAYOUT_SEED, buildingCount: WORLD_BUILDINGS.length, routeId: ACTIVE_ITEM_ROUTE.id });
  }

  function syncCoreActorIndex() {
    upsertIndexedEntity(state.core.actors, state.player, "PLAYER", { id: "PLAYER", areaKey: coreSceneKey(), x: state.player.x, y: state.player.y, stamina: state.player.stamina, focus: state.player.focus, max: state.player.max });
    const candidate = state.heroCandidate;
    upsertIndexedEntity(state.core.actors, candidate, "HERO_CANDIDATE", { areaKey: candidate.placement === "INTERIOR" ? "INTERIOR:" + candidate.buildingId : "OUTDOOR:" + candidate.regionId, x: candidate.x, y: candidate.y, status: candidate.awakened ? "AWAKENED" : candidate.behaviorMode });
    if (state.heroActor) upsertIndexedEntity(state.core.actors, state.heroActor, "HERO", { id: state.heroActor.id + "-ACTOR", areaKey: coreSceneKey(state.heroActor.areaMode, state.heroActor.buildingId), x: state.heroActor.x, y: state.heroActor.y, stage: state.heroStage, focus: state.heroActor.focus, stamina: state.heroActor.stamina, behavior: state.heroActor.behaviorMode });
    state.extraHeroActors.forEach((hero) => upsertIndexedEntity(state.core.actors, hero, hero.faction === "ROGUE" ? "ROGUE_HERO" : "HERO", { id: hero.id + "-EXTRA", areaKey: coreSceneKey(hero.areaMode, hero.buildingId), x: hero.x, y: hero.y, stage: heroStageFor(hero), focus: hero.focus, stamina: hero.stamina, behavior: hero.behaviorMode, alive: hero.alive !== false }));
    state.civilians.forEach((civilian) => upsertIndexedEntity(state.core.actors, civilian, "CIVILIAN", { id: "CIV-" + civilian.id, areaKey: entityAreaKey(civilian), x: civilian.x, y: civilian.y, alive: civilian.alive !== false, injury: civilian.injury }));
    state.freeMinionActors.forEach((actor) => upsertIndexedEntity(state.core.actors, actor, "FREE_MINION", { id: "FM-" + actor.id, areaKey: entityAreaKey(actor), x: actor.x, y: actor.y, alive: actor.alive !== false, mode: actor.mode }));
    state.monsterMinionActors.forEach((actor) => upsertIndexedEntity(state.core.actors, actor, "MONSTER_MINION", { areaKey: entityAreaKey(actor), x: actor.x, y: actor.y, alive: actor.alive !== false }));
    if (state.monsterActor) upsertIndexedEntity(state.core.actors, state.monsterActor, "MONSTER", { id: state.monsterActor.id + "-ACTOR", areaKey: coreSceneKey(state.monsterActor.areaMode, state.monsterActor.buildingId), x: state.monsterActor.x, y: state.monsterActor.y, focus: state.monsterActor.focus, stamina: state.monsterActor.stamina, level: state.monsterLevel, formalChase: state.formalChase });
    if (state.giantThreatActor) upsertIndexedEntity(state.core.actors, state.giantThreatActor, "MONSTER", { id: state.giantThreatActor.id + "-ACTOR", areaKey: coreSceneKey(state.giantThreatActor.areaMode, state.giantThreatActor.buildingId), x: state.giantThreatActor.x, y: state.giantThreatActor.y, stamina: state.giantThreatActor.stamina, level: state.giantThreatActor.level });
    if (state.alienMessenger) upsertIndexedEntity(state.core.actors, state.alienMessenger, "ALIEN_MESSENGER", { areaKey: entityAreaKey(state.alienMessenger), x: state.alienMessenger.x, y: state.alienMessenger.y, alive: state.alienMessenger.alive !== false });
  }

  function pointInsideBuilding(x, y, building, padding = 0) {
    return x > building.x - building.width - padding && x < building.x + building.width + padding && y > building.y - building.depth - padding && y < building.y + building.depth + padding;
  }

  function collidesBuilding(x, y, padding = 0) {
    return nearbySpatialEntities(x, y, 18, (entity) => String(entity.id || "").startsWith("M") && entity.regionId).some((building) => pointInsideBuilding(x, y, building, padding));
  }

  function currentBuilding() { return WORLD_BUILDINGS.find((building) => building.id === state.currentBuildingId) || null; }
  function currentInterior() { return currentBuilding()?.interior || null; }
  function pointInsideRect(x, y, rect, padding = 0) {
    return x >= rect.x - rect.halfWidth + padding && x <= rect.x + rect.halfWidth - padding && y >= rect.y - rect.halfHeight + padding && y <= rect.y + rect.halfHeight - padding;
  }
  function collidesInterior(x, y, padding = 0, interior = currentInterior()) {
    if (!interior) return false;
    if (x < INTERIOR_BOUNDS.xMin + padding || x > INTERIOR_BOUNDS.xMax - padding || y < INTERIOR_BOUNDS.yMin + padding || y > INTERIOR_BOUNDS.yMax - padding) return true;
    if (interior.type !== "PILLARS") return !interior.walkableRects.some((rect) => pointInsideRect(x, y, rect, padding));
    return interior.pillars.some((pillar) => pillar.shape === "SQUARE"
      ? Math.abs(x - pillar.x) < pillar.radius + padding && Math.abs(y - pillar.y) < pillar.radius + padding
      : Math.hypot(x - pillar.x, y - pillar.y) < pillar.radius + padding);
  }
  function dynamicObstaclesForArea(areaKey = coreSceneKey()) { return state.dynamicObstacles.filter((obstacle) => obstacle.areaKey === areaKey && obstacle.active !== false); }
  function pointHitsDynamicObstacle(x, y, padding = 0) {
    return dynamicObstaclesForArea().some((obstacle) => obstacle.shape === "CIRCLE"
      ? Math.hypot(x - obstacle.x, y - obstacle.y) <= obstacle.radius + padding
      : pointInsideRect(x, y, obstacle, -padding));
  }
  function removeSceneBarrier(regionId) {
    const key = "BARRIER:" + regionId;
    state.dynamicObstacles.forEach((obstacle) => { if (obstacle.id === key) obstacle.active = false; });
    state.sceneBarrierStates[regionId] = "OPEN";
    state.navigationRevision += 1; state.spatialIndex.ready = false;
  }
  function createSceneAnomaly(type, options = {}) {
    const now = state.worldTime, areaKey = options.areaKey || coreSceneKey();
    const anomaly = {
      id: options.id || type + ":" + Math.floor(now * 100) + ":" + state.sceneAnomalies.length,
      type, areaKey, regionId: options.regionId || state.regionId, x: options.x ?? state.player.x, y: options.y ?? state.player.y,
      radius: options.radius ?? 2.2, bornAt: now, expiresAt: options.duration == null ? Infinity : now + options.duration,
      damage: options.damage || 0, damageCooldown: 0, color: options.color || "#ffffff", label: options.label || type,
      blocks: Boolean(options.blocks), active: true
    };
    state.sceneAnomalies.push(anomaly);
    if (anomaly.blocks) state.dynamicObstacles.push({ id: "ANOMALY:" + anomaly.id, areaKey, x: anomaly.x, y: anomaly.y, radius: anomaly.radius * .72, shape: "CIRCLE", kind: type, active: true, color: anomaly.color });
    state.navigationRevision += 1; state.spatialIndex.ready = false;
    emitCore("SCENE_ANOMALY_STARTED", { type, areaKey, regionId: anomaly.regionId, anomalyId: anomaly.id });
    return anomaly;
  }
  function activeSceneAnomalies(areaKey = coreSceneKey()) { return state.sceneAnomalies.filter((anomaly) => anomaly.active && anomaly.areaKey === areaKey && anomaly.expiresAt > state.worldTime); }
  function applySceneFeature(object) {
    const action = object.specialAction; if (!action) return false;
    const regionId = object.regionId || state.regionId, near = { x: object.x, y: object.y };
    removeSceneBarrier(regionId);
    advanceSceneEventChain(regionId, "FEATURE", { objectId: object.id, action });
    if (action === "MOUNTAIN_SMOKE") {
      createSceneAnomaly("SMOKE_ACTIVE", { ...near, regionId, radius: 3.6, duration: 18, color: "#bca5d9", label: "地下煙塵擴散" });
      state.eventInput = { ...state.eventInput, rareKeyItem: true };
      showNotice("換氣塔啟動：地下煙塵流向外場，視線縮短；一段座標被帶了出來。 ");
    } else if (action === "HOSPITAL_RESCUE") {
      let stabilized = 0;
      state.civilians.forEach((civilian) => { if (civilian.alive && civilian.injury > 0 && Math.hypot(civilian.x - object.x, civilian.y - object.y) < 10) { civilian.injury = Math.max(0, civilian.injury - 2); civilian.hp = Math.min(civilian.maxHp, civilian.hp + 2); stabilized += 1; } });
      state.eventInput = { ...state.eventInput, rescueCount: Math.min(3, number(state.eventInput.rescueCount, 0) + Math.max(1, Math.ceil(stabilized / 5))) };
      createSceneAnomaly("POWER_OFF", { ...near, regionId, radius: 2.2, duration: 5, color: "#7ff5d9", label: "備援電力切換" });
      showNotice("急救備援接通：附近傷患被穩定，醫療區暫時切換至低照明模式。 ");
    } else if (action === "SHELTER_EVAC") {
      state.eventInput = { ...state.eventInput, rescueCount: Math.min(3, number(state.eventInput.rescueCount, 0) + 1), secondKeyEvent: true };
      createSceneAnomaly("SMOKE_ACTIVE", { ...near, regionId, radius: 2.1, duration: 9, color: "#b7ed9d", label: "避難廣播回響" });
      showNotice("避難廣播恢復：健康人群向出口移動，留下的傷患位置被標記出來。 ");
    } else if (action === "FACTORY_TOXIC") {
      createSceneAnomaly("TOXIC", { ...near, regionId, radius: 3.2, duration: 16, damage: 1.4, color: "#9bea72", label: "有毒蒸氣" });
      showNotice("高壓閥打開：有毒蒸氣正在蔓延，但一條維修通道被炸開。 ");
    } else if (action === "CITY_BLACKOUT") {
      createSceneAnomaly("POWER_OFF", { ...near, regionId, radius: 10, duration: 15, color: "#769eff", label: "都市區斷電" });
      state.hiddenBranchItems += 1;
      state.eventInput = { ...state.eventInput, secondKeyEvent: true, operationSuccess: true };
      showNotice("監控中繼熄滅：都市區視野降低，一條未標記的隱藏線被你記下。 ");
    } else if (action === "HARBOR_DROP") {
      createSceneAnomaly("DROPPED", { ...near, x: object.x + 2.2, y: object.y - 1.6, regionId, radius: 2.1, duration: null, blocks: true, color: "#e9a86b", label: "貨櫃墜落" });
      showNotice("吊臂放下貨櫃：封鎖線被砸斷，但墜落貨物成為新的實體障礙。 ");
    } else if (action === "SIGNAL_EXPLODE") {
      createSceneAnomaly("EXPLODED", { ...near, regionId, radius: 4.2, duration: 6, color: "#ff9f82", label: "電波增幅器爆炸" });
      state.sceneAnomalies.filter((anomaly) => anomaly.regionId === regionId && anomaly.type === "DROPPED").forEach((anomaly) => { anomaly.active = false; state.dynamicObstacles.forEach((obstacle) => { if (obstacle.id === "ANOMALY:" + anomaly.id) obstacle.active = false; }); });
      addFieldBurst(object.x, object.y, 2.3);
      showNotice("增幅器爆炸：舊有障礙被震開，電波塔丘陵的走法已經改變。 ");
    }
    addFloatingText(object.x, object.y, "場景變化", "#ffdc74", 1.35, 13);
    state.sceneEffectLedger[regionId] = { ...(state.sceneEffectLedger[regionId] || {}), action, completedObjectId: object.id, appliedAt: state.worldTime };
    emitCore("SCENE_FEATURE_COMPLETED", { objectId: object.id, action, regionId });
    return true;
  }
  function updateSceneAnomalies(dt) {
    state.sceneAnomalies.forEach((anomaly) => {
      if (!anomaly.active) return;
      if (anomaly.expiresAt <= state.worldTime) {
        anomaly.active = false;
        state.dynamicObstacles.forEach((obstacle) => { if (obstacle.id === "ANOMALY:" + anomaly.id) obstacle.active = false; });
        addFloatingText(anomaly.x, anomaly.y, anomaly.label + "消散", "#b6c9c0", 1.05, 10);
        return;
      }
      anomaly.damageCooldown = Math.max(0, anomaly.damageCooldown - dt);
      if (anomaly.areaKey !== coreSceneKey() || anomaly.damage <= 0 || anomaly.damageCooldown > 0) return;
      if (Math.hypot(state.player.x - anomaly.x, state.player.y - anomaly.y) <= anomaly.radius) {
        damagePlayer(anomaly.damage, anomaly.label);
        anomaly.damageCooldown = .72;
        addFloatingText(state.player.x, state.player.y, anomaly.type === "TOXIC" ? "中毒" : "危險", anomaly.color, .72, 10);
      }
    });
  }
  function currentHazardMovementFactor() {
    const hazards = activeSceneAnomalies();
    if (statusActive(state.player, "stunnedUntil")) return 0;
    if (statusActive(state.player, "gravityUntil")) return .52;
    return hazards.some((anomaly) => anomaly.type === "TOXIC") ? .84 : hazards.some((anomaly) => anomaly.type === "SMOKE_ACTIVE") ? .92 : 1;
  }
  function currentDarknessAlpha() {
    const hazards = activeSceneAnomalies();
    if (hazards.some((anomaly) => anomaly.type === "POWER_OFF")) return .38;
    if (hazards.some((anomaly) => anomaly.type === "SMOKE_ACTIVE")) return .16;
    return 0;
  }
  function collidesCurrentArea(x, y, padding = 0) { return (state.areaMode === "INTERIOR" ? collidesInterior(x, y, padding) : collidesBuilding(x, y, padding)) || pointHitsDynamicObstacle(x, y, padding); }
  function currentAreaBounds() { return state.areaMode === "INTERIOR" ? INTERIOR_BOUNDS : WORLD_BOUNDS; }

  function currentAreaObstacles() {
    if (state.areaMode === "OUTDOOR") return WORLD_BUILDINGS.map((building) => ({ x: building.x, y: building.y, halfWidth: building.width, halfHeight: building.depth, shape: "AABB" })).concat(dynamicObstaclesForArea());
    const interior = currentInterior();
    if (!interior) return [];
    if (interior.type === "PILLARS") return interior.pillars.map((pillar) => pillar.shape === "SQUARE" ? ({ x: pillar.x, y: pillar.y, halfWidth: pillar.radius, halfHeight: pillar.radius, shape: "AABB" }) : ({ x: pillar.x, y: pillar.y, radius: pillar.radius, shape: "CIRCLE" })).concat(dynamicObstaclesForArea());
    return dynamicObstaclesForArea();
  }

  function hasCurrentAreaLineOfSight(from, to) { return CORE.hasLineOfSight(from, to, currentAreaObstacles(), .08); }

  function syncOutdoorRegion(force = false) {
    if (state.areaMode !== "OUTDOOR") return false;
    const region = regionAtPoint(state.player.x, state.player.y);
    if (!force && region.id === state.regionId) return false;
    const previous = state.regionId;
    state.regionId = region.id; state.scene = region.scene; state.exteriorScene = region.scene;
    advancePrimaryScene(region.id);
    if (!force && previous) {
      addFloatingText(state.player.x, state.player.y, "進入「" + region.label + "」", SCENE_VISUALS[region.scene].color, 1.65, 13);
      log("跨越地圖邊界，進入「" + region.label + "」");
      persistCurrentScene("cross-region");
      advanceSceneEventChain(region.id, "ENTER", { from: previous, to: region.id });
      emitCore("REGION_CHANGED", { from: previous, to: region.id, scene: region.scene });
    }
    return true;
  }

  function findOpenWorldPoint(x, y, salt = 0) {
    const bounded = { x: clamp(x, WORLD_BOUNDS.xMin + 1, WORLD_BOUNDS.xMax - 1), y: clamp(y, WORLD_BOUNDS.yMin + 1, WORLD_BOUNDS.yMax - 1) };
    if (!collidesBuilding(bounded.x, bounded.y, .12)) return bounded;
    for (let ring = 1; ring <= 12; ring += 1) {
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12 + seeded(salt + ring, 31)) * Math.PI * 2, candidate = { x: bounded.x + Math.cos(angle) * ring, y: bounded.y + Math.sin(angle) * ring };
        if (!collidesBuilding(candidate.x, candidate.y, .12)) return candidate;
      }
    }
    return { x: 0, y: 0 };
  }

  function findOpenCurrentAreaPoint(x, y, salt = 0) {
    if (state.areaMode !== "INTERIOR") return findOpenWorldPoint(x, y, salt);
    const bounded = { x: clamp(x, INTERIOR_BOUNDS.xMin + .35, INTERIOR_BOUNDS.xMax - .35), y: clamp(y, INTERIOR_BOUNDS.yMin + .35, INTERIOR_BOUNDS.yMax - .35) };
    if (!collidesInterior(bounded.x, bounded.y, .1)) return bounded;
    for (let ring = .4; ring <= 12; ring += .45) for (let step = 0; step < 20; step += 1) {
      const angle = step / 20 * Math.PI * 2 + seeded(salt + Math.round(ring * 10), 47), candidate = { x: bounded.x + Math.cos(angle) * ring, y: bounded.y + Math.sin(angle) * ring };
      if (!collidesInterior(candidate.x, candidate.y, .1)) return candidate;
    }
    const interior = currentInterior(); return interior ? { ...interior.entry } : { x: 0, y: 0 };
  }

  function isWorldPointVisible(point, margin = 0) {
    const screen = iso(point.x, point.y, 0);
    return screen.x >= -margin && screen.x <= canvas.width + margin && screen.y >= -margin && screen.y <= canvas.height + margin;
  }

  function offscreenCurrentAreaPoint(serial = 0, margin = 72) {
    if (state.areaMode === "INTERIOR") {
      const interior = currentInterior();
      return interior ? randomInteriorOpenPoint(interior, serial + 600, 7) : { x: 0, y: 0 };
    }
    const screenCandidates = [
      { x: -margin, y: canvas.height * (.22 + seeded(serial, 81) * .56) },
      { x: canvas.width + margin, y: canvas.height * (.22 + seeded(serial, 82) * .56) },
      { x: canvas.width * (.18 + seeded(serial, 83) * .64), y: -margin },
      { x: canvas.width * (.18 + seeded(serial, 84) * .64), y: canvas.height + margin }
    ];
    for (let offset = 0; offset < screenCandidates.length; offset += 1) {
      const screen = screenCandidates[(serial + offset) % screenCandidates.length];
      const raw = worldFromScreenPoint(screen.x, screen.y);
      const open = findOpenWorldPoint(raw.x, raw.y, serial + offset * 17);
      if (!isWorldPointVisible(open, 20)) return open;
    }
    const corners = [
      { x: WORLD_BOUNDS.xMin + 1, y: WORLD_BOUNDS.yMin + 1 }, { x: WORLD_BOUNDS.xMax - 1, y: WORLD_BOUNDS.yMin + 1 },
      { x: WORLD_BOUNDS.xMax - 1, y: WORLD_BOUNDS.yMax - 1 }, { x: WORLD_BOUNDS.xMin + 1, y: WORLD_BOUNDS.yMax - 1 }
    ].sort((a, b) => playerWorldDistance(state.player, b) - playerWorldDistance(state.player, a));
    return findOpenWorldPoint(corners[0].x, corners[0].y, serial + 911);
  }

  function allBuildingEntrances() { return WORLD_BUILDINGS.flatMap((building) => building.entrances.map((entrance) => ({ ...entrance, buildingLabel: building.label }))); }
  function findEntranceById(id) { return allBuildingEntrances().find((entrance) => entrance.id === id) || null; }
  function entranceDestination(entrance) { return WORLD_BUILDINGS.find((building) => building.id === entrance.buildingId)?.interior.scene || entrance.targetScene; }
  function nearestBuildingToPoint(point) { return WORLD_BUILDINGS.reduce((best, building) => !best || Math.hypot(point.x - building.x, point.y - building.y) < best.distance ? { building, distance: Math.hypot(point.x - building.x, point.y - building.y) } : best, null)?.building || null; }
  function itemLocationHint(item) {
    const building = WORLD_BUILDINGS.find((entry) => entry.id === item.buildingId) || nearestBuildingToPoint(item);
    if (!building) return "跟隨金色箭頭";
    const region = regionById(building.regionId).label;
    if (item.placement === "OUTDOOR") return "亮金色反應位於「" + region + "」的「" + building.label + "」附近";
    if (item.difficulty === "LOW") return "線索：「" + region + "」的「" + building.label + "」內部";
    return "強烈訊號來自「" + region + "／" + building.label + "」深處";
  }
