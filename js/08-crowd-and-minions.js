/* 人群與敵群：平民流動、避障、小兵生成、經驗掉落、玩家受傷與世界 actor 更新。 */
  function makeFreeMinion(index, options = {}) {
    const point = options.edgeSpawn
      ? offscreenCurrentAreaPoint(index + 300, 68)
      : findOpenWorldPoint(-58 + seeded(index, 8) * 116, -42 + seeded(index, 9) * 84, index);
    return {
      id: index, x: point.x, y: point.y,
      mode: options.edgeSpawn ? "ENTER" : "WANDER", entryTarget: options.edgeSpawn ? currentAreaEdgePoint(index + 410) : null,
      targetId: null, targetDrop: null, wanderX: 0, wanderY: 0, wanderTime: 0,
      attackCooldown: seeded(index, 10) * .8, playerAttackCooldown: seeded(index, 14) * .7, attackSlowUntil: 0, chaseTime: 0,
      experience: 0, experienceCap: 3 + (index % 3), returnTarget: null, returnTime: 0,
      initialWave: Boolean(options.initialWave), enteredFromEdge: Boolean(options.edgeSpawn), alive: true
    };
  }

  function makeCivilian(kind, stream, point, serial = state.civilianSpawnSerial++) {
    const flow = CIVILIAN_FLOWS[stream % CIVILIAN_FLOWS.length], injured = kind === "INJURED";
    return {
      id: serial, x: point.x, y: point.y, flowX: flow.x, flowY: flow.y, stream,
      speed: injured ? .68 + seeded(serial, 3 + stream * 8) * .42 : 1.45 + seeded(serial, 3 + stream * 8) * .75,
      phase: seeded(serial, 4 + stream * 8) * Math.PI * 2,
      hp: injured ? 2 : 4, maxHp: 4, injury: injured ? 2 : 0, spawnKind: kind,
      lastCryAt: -1, bornAt: state.worldTime, evacuating: false, alive: true
    };
  }

  function civilianSpawnProfile(level = state.dangerLevel) {
    return CIVILIAN_SPAWN_PROFILES[clamp(Math.floor(level), 1, 4)];
  }

  function initializeCivilianSpawnPoints() {
    state.civilianSpawnPoints = [
      { id: "H-0", kind: "HEALTHY", stream: 0, serial: 0 },
      { id: "H-1", kind: "HEALTHY", stream: 1, serial: 1 },
      { id: "I-0", kind: "INJURED", stream: 0, serial: 2 },
      { id: "I-1", kind: "INJURED", stream: 1, serial: 3 },
      { id: "I-2", kind: "INJURED", stream: 0, serial: 4 }
    ];
    state.civilianSpawnPoints.forEach((point) => { point.position = offscreenCurrentAreaPoint(point.serial + 1200, 84); });
  }

  function setDangerLevel(level) {
    const next = clamp(Math.floor(level), 1, 4);
    if (next === state.dangerLevel) return false;
    const previous = state.dangerLevel;
    state.dangerLevel = next;
    if (next >= 3) {
      state.civilians.forEach((civilian) => {
        if (!civilian.alive || civilian.injury !== 0) return;
        // 畫面外的健康人群視為已完成撤離；仍在畫面內者沿最近邊界快速離開，避免 A3 還像平時街景。
        if (!isWorldPointVisible(civilian, 45)) { civilian.alive = false; return; }
        const exits = [
          { distance: civilian.x - WORLD_BOUNDS.xMin, x: -1, y: 0 }, { distance: WORLD_BOUNDS.xMax - civilian.x, x: 1, y: 0 },
          { distance: civilian.y - WORLD_BOUNDS.yMin, x: 0, y: -1 }, { distance: WORLD_BOUNDS.yMax - civilian.y, x: 0, y: 1 }
        ].sort((a, b) => a.distance - b.distance);
        civilian.evacuating = true; civilian.speed = Math.max(civilian.speed * 1.8, 3.2); civilian.flowX = exits[0].x; civilian.flowY = exits[0].y;
      });
    }
    log("危險程度 A" + previous + " → A" + next, true);
    return true;
  }

  function updateDangerLevel() {
    let next = 1;
    if (state.orangeUnlocked) next = 2;
    if (state.orangeUnlocked && (state.keyItemsFound >= 2 || state.initialWaveRemaining <= 17)) next = 3;
    if (state.redUnlocked || state.monsterActor) next = 4;
    setDangerLevel(next);
    return next;
  }

  function spawnCivilianGroup(point, count) {
    if (!point || count <= 0) return 0;
    if (!point.position || isWorldPointVisible(point.position, 30)) point.position = offscreenCurrentAreaPoint(state.civilianSpawnSerial + point.serial * 31, 86);
    let created = 0;
    for (let index = 0; index < count; index += 1) {
      const base = point.position, flow = CIVILIAN_FLOWS[point.stream], perpendicular = { x: -flow.y, y: flow.x };
      const spread = (index - (count - 1) / 2) * .24 + (seeded(state.civilianSpawnSerial + index, 91) - .5) * .22;
      const raw = { x: base.x + perpendicular.x * spread, y: base.y + perpendicular.y * spread };
      const open = findOpenWorldPoint(raw.x, raw.y, state.civilianSpawnSerial + index + 1500);
      // 粉紅傷患的產生位置必須在玩家當下視野外；若避障修正把位置推回畫面，就直接換一個視野外點。
      const spawn = isWorldPointVisible(open, 16) ? offscreenCurrentAreaPoint(state.civilianSpawnSerial + index + 1700, 90) : open;
      state.civilians.push(makeCivilian(point.kind, point.stream, spawn)); created += 1;
    }
    point.serial += 7; point.position = offscreenCurrentAreaPoint(state.civilianSpawnSerial + point.serial * 13, 84);
    return created;
  }

  function updateCivilianSpawns(dt) {
    if (state.areaMode !== "OUTDOOR") return;
    state.civilianSpawnTimer -= dt;
    if (state.civilianSpawnTimer > 0) return;
    const profile = civilianSpawnProfile(), active = state.civilians.reduce((count, civilian) => count + (civilian.alive ? 1 : 0), 0);
    if (active < profile.cap) {
      const healthyPoints = state.civilianSpawnPoints.filter((point) => point.kind === "HEALTHY");
      const injuredPoints = state.civilianSpawnPoints.filter((point) => point.kind === "INJURED");
      if (profile.healthy > 0) spawnCivilianGroup(healthyPoints[state.civilianSpawnSerial % healthyPoints.length], Math.min(profile.healthy, profile.cap - active));
      const afterHealthy = state.civilians.reduce((count, civilian) => count + (civilian.alive ? 1 : 0), 0);
      if (profile.injured > 0 && afterHealthy < profile.cap) spawnCivilianGroup(injuredPoints[state.civilianSpawnSerial % injuredPoints.length], Math.min(profile.injured, profile.cap - afterHealthy));
    }
    if (state.civilians.length > 900) state.civilians = state.civilians.filter((civilian) => civilian.alive);
    state.civilianSpawnTimer = profile.interval * (.76 + seeded(state.civilianSpawnSerial, 92) * .58);
  }

  function createWorldActors() {
    // 兩股非平行逃難流：西北向與南向交叉，讓畫面先有可辨識的集體逃亡方向。
    state.civilianSpawnSerial = 0;
    state.civilians = Array.from({ length: 420 }, (_, index) => {
      const stream = index % 2, row = Math.floor(index / 2), flow = CIVILIAN_FLOWS[stream];
      const perpendicular = { x: -flow.y, y: flow.x };
      const along = -62 + seeded(row, 1 + stream * 8) * 124;
      const lateral = (seeded(row, 2 + stream * 8) - .5) * 18;
      const point = findOpenWorldPoint(flow.x * along + perpendicular.x * lateral, flow.y * along + perpendicular.y * lateral, index + 1000);
      return makeCivilian("HEALTHY", stream, point, state.civilianSpawnSerial++);
    });
    initializeCivilianSpawnPoints();
    state.civilianSpawnTimer = .35;
    state.freeMinionActors = [];
    state.nextMinionId = 0;
    state.initialWaveRemaining = 35;
    state.initialWaveSpawned = 0;
    state.reentryQueue = 0;
    state.enemyGenerationValue = 0;
    state.enemyGenerationFreeApplied = 0;
    state.enemyGenerationMonsterApplied = 0;
    state.experienceDrops = [];
    state.fieldBursts = [];
    state.floatingTexts = [];
    syncFreeMinionActors();
  }

  function syncFreeMinionActors() {
    const desired = clamp(Math.floor(state.freeMinions), 0, 120);
    let active = state.freeMinionActors.filter((actor) => actor.alive);
    while (active.length < desired) {
      const initialWave = state.initialWaveSpawned < 35;
      const edgeSpawn = state.reentryQueue > 0 || !initialWave;
      const actor = makeFreeMinion(state.nextMinionId++, { initialWave, edgeSpawn });
      if (initialWave) state.initialWaveSpawned += 1;
      if (state.reentryQueue > 0) state.reentryQueue -= 1;
      state.freeMinionActors.push(actor); active.push(actor);
    }
    while (active.length > desired) {
      const actor = active.pop(); actor.alive = false;
    }
  }

  function retireFreeMinion(actor, reason) {
    if (!actor?.alive) return false;
    actor.alive = false;
    if (actor.initialWave) {
      actor.initialWave = false;
      state.initialWaveRemaining = Math.max(0, state.initialWaveRemaining - 1);
    }
    if (reason === "RETURN") {
      state.reentryQueue += 1;
      state.enemyGenerationValue += .35;
    } else if (reason === "DESTROYED") state.freeMinions = Math.max(0, state.freeMinions - 1);
    return true;
  }

  function updateEnemyGeneration(dt) {
    state.enemyGenerationValue += Math.max(0, dt) * state.enemyGenerationRate;
    const freeThreshold = Math.floor(state.enemyGenerationValue);
    if (freeThreshold > state.enemyGenerationFreeApplied) {
      state.freeMinions = clamp(state.freeMinions + freeThreshold - state.enemyGenerationFreeApplied, 0, 120);
      state.enemyGenerationFreeApplied = freeThreshold;
    }
    const monsterThreshold = Math.floor(state.enemyGenerationValue / 3);
    if (monsterThreshold > state.enemyGenerationMonsterApplied) {
      state.monsterMinions = clamp(state.monsterMinions + monsterThreshold - state.enemyGenerationMonsterApplied, 0, 60);
      state.enemyGenerationMonsterApplied = monsterThreshold;
    }
  }

  function moveWorldActor(actor, targetX, targetY, speed, dt) {
    const waypoint = actor?.pathfinding === false ? { x: targetX, y: targetY } : nextPathTarget(actor, targetX, targetY), dx = waypoint.x - actor.x, dy = waypoint.y - actor.y, distance = Math.hypot(targetX - actor.x, targetY - actor.y);
    if (distance < .01) return distance;
    const bounds = currentAreaBounds();
    const moved = CORE.moveWithSlide(actor, { x: dx, y: dy }, speed * dt, (point) => point.x < bounds.xMin || point.x > bounds.xMax || point.y < bounds.yMin || point.y > bounds.yMax || collidesCurrentArea(point.x, point.y, .08));
    actor.x = clamp(moved.x, bounds.xMin, bounds.xMax); actor.y = clamp(moved.y, bounds.yMin, bounds.yMax);
    if (moved.movedX || moved.movedY) { actor.lastMoveX = dx; actor.lastMoveY = dy; }
    return distance;
  }

  function findCivilian(id) { return state.civilians.find((civilian) => civilian.id === id && civilian.alive) || null; }

  function findNearbyCivilian(actor, range) {
    let best = null, bestDistance = range;
    nearbySpatialEntities(actor.x, actor.y, range, (entity) => state.civilians.includes(entity) && entity.alive !== false).forEach((civilian) => {
      if (!civilian.alive) return;
      const distance = Math.hypot(civilian.x - actor.x, civilian.y - actor.y);
      if (distance < bestDistance) { best = civilian; bestDistance = distance; }
    });
    return best;
  }

  function addFieldBurst(x, y, size = 1) {
    state.fieldBursts.push({ x, y, size, bornAt: state.worldTime, expiresAt: state.worldTime + .34 });
  }

  function addFloatingText(x, y, text, color = "#ffffff", duration = 1.05, size = 12) {
    state.floatingTexts.push({ x, y, text, color, size, bornAt: state.worldTime, expiresAt: state.worldTime + duration });
  }

  function hurtCivilian(target, actor) {
    target.injury = clamp(target.injury + 1, 0, target.maxHp);
    target.hp = Math.max(0, target.maxHp - target.injury);
    addFieldBurst(target.x, target.y, .72);
    const cries = ["啊啊！", "救命！", "別過來！", "有人嗎！", "好痛……"];
    const cry = cries[Math.floor(seeded(target.id + target.injury * 17 + actor.id, 19) * cries.length) % cries.length];
    addFloatingText(target.x, target.y, cry, target.injury >= 3 ? "#ff8b83" : "#fff0e8", 1.15, 11 + target.injury);
    if (state.worldTime - state.lastCrowdSoundAt > .14) { playImpact("WEAK"); state.lastCrowdSoundAt = state.worldTime; }
    if (target.hp > 0) return false;
    target.alive = false;
    state.eventInput.casualtyDeaths = Math.max(0, number(state.eventInput.casualtyDeaths, 0)) + 1;
    return true;
  }

  function triggerPlayerDeath(reason = "你的體力在攻擊中歸零。") {
    if (state.gameOver) return;
    state.gameOver = true;
    if (state.core.lifecycle.phase === CORE.LIFE.PLAYING) state.core.lifecycle.move(CORE.LIFE.FAILED, "player-death");
    state.player.stamina = 0;
    const score = scoreEvent(state.eventInput || {}).value + state.keyItemsFound * 25 - number(state.eventInput?.casualtyDeaths, 0) * 5;
    emitCore("RUN_FAILED", { reason, score: Math.max(0, Math.round(score)) });
    $("gameOverReason").textContent = reason;
    $("gameOverScore").textContent = "結算分數 " + Math.max(0, Math.round(score));
    $("gameOver").classList.remove("is-hidden");
    playImpact("HEAVY");
  }

  function damagePlayer(amount, source = "小兵") {
    if (state.gameOver) return false;
    const damage = Math.max(0, number(amount, 0));
    state.player.stamina = Math.max(0, state.player.stamina - damage);
    addFieldBurst(state.player.x, state.player.y, source === "小兵" ? .68 : 1.3);
    addFloatingText(state.player.x, state.player.y, "-" + Math.round(damage) + " 體力", "#ff7770", 1.05, source === "小兵" ? 11 : 14);
    playImpact(source === "小兵" ? "WEAK" : "HEAVY");
    if (state.player.stamina <= 0) triggerPlayerDeath(source + "的攻擊使你的體力歸零。");
    return true;
  }

  function civilianSpeedMultiplier(injury) {
    return [1, .72, .5, .27, 0][clamp(Math.floor(injury), 0, 4)];
  }

  function civilianBuildingAvoidance(civilian, lookAhead = .55) {
    let best = null;
    WORLD_BUILDINGS.forEach((building) => {
      const dx = civilian.x - building.x, dy = civilian.y - building.y;
      const extentX = building.width + lookAhead, extentY = building.depth + lookAhead;
      if (Math.abs(dx) > extentX || Math.abs(dy) > extentY) return;
      const penetrationX = extentX - Math.abs(dx), penetrationY = extentY - Math.abs(dy);
      let normalX = 0, normalY = 0, strength;
      if (penetrationX < penetrationY) { normalX = Math.sign(dx || civilian.flowX || 1); strength = penetrationX; }
      else { normalY = Math.sign(dy || civilian.flowY || 1); strength = penetrationY; }
      if (!best || strength < best.strength) best = { building, normalX, normalY, strength };
    });
    return best;
  }

  function moveCivilianWithAvoidance(civilian, directionX, directionY, distance) {
    const avoidance = civilianBuildingAvoidance(civilian, .78);
    let steerX = directionX, steerY = directionY;
    if (avoidance) {
      const urgency = clamp((.8 - avoidance.strength) * 1.7, .28, 1.25);
      steerX += avoidance.normalX * urgency; steerY += avoidance.normalY * urgency;
      const tangentX = -avoidance.normalY, tangentY = avoidance.normalX;
      const tangentSign = Math.sign(directionX * tangentX + directionY * tangentY) || (civilian.stream ? 1 : -1);
      steerX += tangentX * tangentSign * .42; steerY += tangentY * tangentSign * .42;
    }
    const length = Math.max(.001, Math.hypot(steerX, steerY)); steerX /= length; steerY /= length;
    const nextX = civilian.x + steerX * distance, nextY = civilian.y + steerY * distance;
    if (!collidesBuilding(nextX, nextY, .06)) { civilian.x = nextX; civilian.y = nextY; return true; }
    const collision = WORLD_BUILDINGS.find((building) => pointInsideBuilding(nextX, nextY, building, .08));
    if (!collision) return false;
    const dx = civilian.x - collision.x, dy = civilian.y - collision.y;
    const gapX = collision.width + .16 - Math.abs(dx), gapY = collision.depth + .16 - Math.abs(dy);
    let pushX = 0, pushY = 0;
    if (gapX < gapY) pushX = Math.sign(dx || steerX || 1); else pushY = Math.sign(dy || steerY || 1);
    const escapeX = civilian.x + pushX * Math.max(.12, distance * 1.25), escapeY = civilian.y + pushY * Math.max(.12, distance * 1.25);
    if (!collidesBuilding(escapeX, escapeY, .04)) { civilian.x = escapeX; civilian.y = escapeY; }
    civilian.flowX = civilian.flowX * .72 + pushX * .78 + -pushY * .25;
    civilian.flowY = civilian.flowY * .72 + pushY * .78 + pushX * .25;
    const flowLength = Math.max(.001, Math.hypot(civilian.flowX, civilian.flowY)); civilian.flowX /= flowLength; civilian.flowY /= flowLength;
    return false;
  }

  function minionPursuitSpeed(actor) {
    return state.worldTime < actor.attackSlowUntil ? .5 : Math.min(3.65, .82 + actor.chaseTime * .62);
  }

  function randomInteriorOpenPoint(interior, serial = 0, minimumPlayerDistance = 0) {
    const random = seededLayoutRandom((BUILDING_LAYOUT_SEED ^ ((serial + 1) * 2654435761)) >>> 0);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      let candidate;
      if (interior.type !== "PILLARS") {
        const room = interior.rooms[Math.floor(random() * interior.rooms.length)];
        candidate = { x: room.x + (random() - .5) * room.halfWidth, y: room.y + (random() - .5) * room.halfHeight };
      } else candidate = { x: -12 + random() * 24, y: -7.4 + random() * 14.8 };
      if (!collidesInterior(candidate.x, candidate.y, .14, interior) && Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y) >= minimumPlayerDistance) return candidate;
    }
    return { ...interior.entry };
  }

  function scheduleTrackingMinions(interior = currentInterior(), bonus = 0) {
    if (!interior || state.trackingLevel <= 0) return;
    const active = interior.minions.filter((actor) => actor.alive).length;
    const desired = clamp(state.trackingLevel * 2 + bonus, 1, 9);
    interior.pendingSpawns += Math.max(0, desired - active - interior.pendingSpawns);
    interior.nextSpawnAt = Math.max(interior.nextSpawnAt || 0, state.worldTime + .45);
  }

  function spawnInteriorMinion(interior) {
    const serial = interior.spawnSerial++, entryDistance = Math.hypot(interior.entry.x - state.player.x, interior.entry.y - state.player.y);
    const point = entryDistance > 6 ? { ...interior.entry } : randomInteriorOpenPoint(interior, serial + 90, 7);
    interior.minions.push({
      id: "I-" + interior.buildingId + "-" + serial, x: point.x, y: point.y, alive: true,
      targetX: point.x, targetY: point.y, targetTimer: 0, stuckTime: 0, contactCooldown: 0, phase: serial * 1.7
    });
    interior.pendingSpawns = Math.max(0, interior.pendingSpawns - 1);
    interior.nextSpawnAt = state.worldTime + .75 + seeded(serial, 51) * .8;
    addFloatingText(point.x, point.y, "追蹤反應進入場域", "#ff8a7a", 1.35, 10);
  }

  function updateInteriorMinions(dt) {
    const interior = currentInterior(); if (!interior) return;
    if (interior.pendingSpawns > 0 && state.worldTime >= interior.nextSpawnAt) spawnInteriorMinion(interior);
    interior.minions.forEach((actor, index) => {
      if (!actor.alive) return;
      actor.contactCooldown = Math.max(0, actor.contactCooldown - dt);
      actor.targetTimer -= dt;
      if (actor.targetTimer <= 0 || Math.hypot(actor.targetX - actor.x, actor.targetY - actor.y) < .45) {
        const moveLength = Math.hypot(state.player.lastMoveX, state.player.lastMoveY);
        const forwardX = moveLength > .01 ? state.player.lastMoveX / moveLength : Math.cos(state.worldTime * .7 + index);
        const forwardY = moveLength > .01 ? state.player.lastMoveY / moveLength : Math.sin(state.worldTime * .7 + index);
        const lateral = (seeded(index + Math.floor(state.worldTime * 2), 52) - .5) * 5.5;
        const ahead = 1.5 + seeded(index + interior.spawnSerial, 53) * 3.2;
        const raw = { x: state.player.x + forwardX * ahead - forwardY * lateral, y: state.player.y + forwardY * ahead + forwardX * lateral };
        const open = findOpenCurrentAreaPoint(raw.x, raw.y, index + interior.spawnSerial * 13);
        actor.targetX = open.x; actor.targetY = open.y; actor.targetTimer = .75 + seeded(index + interior.spawnSerial, 54) * .9;
      }
      const beforeX = actor.x, beforeY = actor.y;
      moveWorldActor(actor, actor.targetX, actor.targetY, clamp(.62 + state.trackingLevel * .09, .62, 1.45), dt);
      if (Math.hypot(actor.x - beforeX, actor.y - beforeY) < .002) actor.stuckTime += dt; else actor.stuckTime = 0;
      if (actor.stuckTime > .42) {
        const detour = randomInteriorOpenPoint(interior, index + Math.floor(state.worldTime * 10), 0);
        actor.targetX = detour.x; actor.targetY = detour.y; actor.targetTimer = .45; actor.stuckTime = 0;
      }
      if (Math.hypot(actor.x - state.player.x, actor.y - state.player.y) < .72 && actor.contactCooldown <= 0) {
        damagePlayer(3, "小兵");
        actor.contactCooldown = 1.15;
      }
    });
  }

  function updateWorldActors(dt) {
    state.fieldBursts = state.fieldBursts.filter((effect) => effect.expiresAt > state.worldTime);
    state.floatingTexts = state.floatingTexts.filter((effect) => effect.expiresAt > state.worldTime);
    updateDangerLevel();
    updateEnemyGeneration(dt);
    if (state.areaMode === "INTERIOR") { updateInteriorMinions(dt); return; }
    updateCivilianSpawns(dt);
    syncFreeMinionActors();
    state.civilians.forEach((civilian) => {
      if (!civilian.alive) return;
      const panicX = civilian.flowX + Math.sin(state.worldTime * 2.3 + civilian.phase) * .13;
      const panicY = civilian.flowY + Math.cos(state.worldTime * 2.1 + civilian.phase) * .13;
      const panicDistance = Math.max(.001, Math.hypot(panicX, panicY));
      const injurySpeed = civilianSpeedMultiplier(civilian.injury);
      const evacuationBoost = civilian.evacuating && civilian.injury === 0 ? 1.28 : 1;
      moveCivilianWithAvoidance(civilian, panicX / panicDistance, panicY / panicDistance, civilian.speed * injurySpeed * evacuationBoost * dt);
      if (civilian.x <= WORLD_BOUNDS.xMin + .08 || civilian.x >= WORLD_BOUNDS.xMax - .08 || civilian.y <= WORLD_BOUNDS.yMin + .08 || civilian.y >= WORLD_BOUNDS.yMax - .08 || state.worldTime - civilian.bornAt > 130) civilian.alive = false;
    });

    state.freeMinionActors.forEach((actor) => {
      if (!actor.alive) return;
      actor.attackCooldown = Math.max(0, actor.attackCooldown - dt);
      actor.playerAttackCooldown = Math.max(0, actor.playerAttackCooldown - dt);
      if (actor.mode !== "RETURN" && actor.mode !== "COLLECT" && Math.hypot(actor.x - state.player.x, actor.y - state.player.y) < .74 && actor.playerAttackCooldown <= 0) {
        damagePlayer(3, "小兵");
        actor.playerAttackCooldown = 1.08; actor.attackSlowUntil = state.worldTime + .28;
      }
      if (actor.mode === "ENTER") {
        if (!actor.entryTarget || moveWorldActor(actor, actor.entryTarget.x, actor.entryTarget.y, 1.4, dt) < .55) {
          actor.mode = "WANDER"; actor.entryTarget = null; actor.wanderTime = 0;
        }
        return;
      }
      if (actor.mode === "COLLECT") {
        const drop = state.experienceDrops.find((item) => item.id === actor.targetDrop);
        if (!drop) { actor.targetDrop = null; actor.mode = "WANDER"; return; }
        if (moveWorldActor(actor, drop.x, drop.y, 3.1, dt) < .58) {
          if (drop.collectStartedAt == null) drop.collectStartedAt = state.worldTime;
          if (state.worldTime - drop.collectStartedAt >= .1) {
            actor.experience += 1;
            addFloatingText(actor.x, actor.y, "+1 力量", "#ffe36c", 1.1, 12);
            state.experienceDrops = state.experienceDrops.filter((item) => item.id !== drop.id); actor.targetDrop = null;
            if (actor.experience >= actor.experienceCap) {
              actor.mode = "RETURN";
              actor.returnTarget = actor.id % 2 === 0 ? "MONSTER" : "EDGE";
            } else actor.mode = "WANDER";
          }
        }
        return;
      }
      if (actor.mode === "RETURN") {
        actor.returnTime += dt;
        const toMonster = actor.returnTarget === "MONSTER";
        const targetX = toMonster ? state.monsterAnchor.x : (actor.x < 0 ? WORLD_BOUNDS.xMin : WORLD_BOUNDS.xMax);
        const targetY = toMonster ? state.monsterAnchor.y : clamp(actor.y, WORLD_BOUNDS.yMin, WORLD_BOUNDS.yMax);
        const arrived = moveWorldActor(actor, targetX, targetY, 3.05, dt) < (toMonster ? 3.2 : .65) || actor.returnTime >= 14;
        if (arrived) {
          state.monsterPowerExperience += actor.experience;
          retireFreeMinion(actor, "RETURN");
        }
        return;
      }
      const nearby = findNearbyCivilian(actor, actor.mode === "HUNT" ? 10 : 5.5);
      if (nearby && actor.mode !== "HUNT") { actor.mode = "HUNT"; actor.targetId = nearby.id; actor.chaseTime = 0; }
      if (actor.mode === "HUNT") {
        const target = findCivilian(actor.targetId);
        if (!target) { actor.targetId = null; actor.mode = "WANDER"; actor.chaseTime = 0; return; }
        actor.chaseTime += dt;
        // 未受傷的路人起初比小兵快；小兵尾隨一段時間後才逐步加速追上。
        const chaseSpeed = minionPursuitSpeed(actor);
        const distance = moveWorldActor(actor, target.x, target.y, chaseSpeed, dt);
        if (distance < .9 && actor.attackCooldown <= 0) {
          const defeated = hurtCivilian(target, actor);
          actor.attackCooldown = .56;
          actor.attackSlowUntil = state.worldTime + .38;
          if (defeated) {
            const drop = { id: actor.id + "-" + state.worldTime, x: target.x, y: target.y, bornAt: state.worldTime, collectStartedAt: null };
            state.experienceDrops.push(drop); actor.targetDrop = drop.id; actor.mode = "COLLECT"; actor.targetId = null; actor.chaseTime = 0;
          }
        }
        return;
      }
      actor.wanderTime -= dt;
      if (actor.wanderTime <= 0 || Math.hypot(actor.wanderX - actor.x, actor.wanderY - actor.y) < .5) {
        actor.wanderX = clamp(actor.x + (seeded(actor.id + Math.floor(state.worldTime * .5), 11) - .5) * 12, WORLD_BOUNDS.xMin, WORLD_BOUNDS.xMax);
        actor.wanderY = clamp(actor.y + (seeded(actor.id + Math.floor(state.worldTime * .5), 12) - .5) * 12, WORLD_BOUNDS.yMin, WORLD_BOUNDS.yMax);
        actor.wanderTime = 1.4 + seeded(actor.id, 13) * 2.2;
      }
      moveWorldActor(actor, actor.wanderX, actor.wanderY, 1.05, dt);
    });
  }

  function crowdDensityAroundPlayer() {
    if (state.areaMode === "INTERIOR") return 0;
    return nearbySpatialEntities(state.player.x, state.player.y, 2.8, (entity) => state.civilians.includes(entity) && entity.alive !== false).length;
  }
