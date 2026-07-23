/* 怪人系統：角色資料解譯、等級／能力、狀態效果、追殺序列與怪人小兵轉移。 */
  function characterProfile(id) { return CHARACTER_PROFILES.profiles.find((profile) => profile.id === id) || null; }
  function dialogueFor(id, event) { return DIALOGUE_LINES.find((line) => line.c === id && line.event === event) || null; }
  function unlockDialogue(id, event, ...fallbackEvents) {
    const events = [event, ...fallbackEvents].filter(Boolean), used = state.dialogueUsedIds || new Set();
    const candidates = DIALOGUE_LINES.filter((line) => line.c === id && events.includes(line.event));
    const line = candidates.find((entry) => !used.has(entry.id));
    if (!line) return null;
    used.add(line.id); state.dialogueUsedIds = used;
    state.dialogueUnlockHistory = [...(state.dialogueUnlockHistory || []), { id: line.id, actorId: id, event: line.event, at: state.worldTime }].slice(-120);
    emitCore("DIALOGUE_UNLOCKED", { dialogueId: line.id, actorId: id, event: line.event });
    return line;
  }

  function activeMonsterProfile() {
    const monsters = CHARACTER_PROFILES.profiles.filter((profile) => profile.pool === "怪人");
    const routeIndex = Math.max(0, ITEM_ROUTES.indexOf(ACTIVE_ITEM_ROUTE));
    return monsters[(routeIndex * 3 + 2) % monsters.length] || monsters[0];
  }

  function monsterLevelRule(experience = state.monsterPowerExperience) {
    return MONSTER_LEVEL_RULES.reduce((best, rule) => experience >= rule.experience ? rule : best, MONSTER_LEVEL_RULES[0]);
  }
  function refreshMonsterLevel() {
    const rule = monsterLevelRule(), previous = state.monsterLevel;
    state.monsterLevel = rule.level;
    const monster = state.monsterActor;
    if (monster) {
      monster.level = rule.level; monster.levelRule = rule;
      monster.unlockedAbilityCount = rule.abilities;
      monster.attackMultiplier = rule.attack; monster.speedMultiplier = rule.speed; monster.cooldownMultiplier = rule.cooldown;
    }
    if (rule.level > previous) {
      state.monsterLevelLastNotified = rule.level;
      const point = monster || state.player;
      addFloatingText(point.x, point.y, "怪人 Lv." + rule.level + "｜" + rule.label, "#ffad79", 1.65, 14);
      showNotice("怪人吸收經驗後升至 Lv." + rule.level + "：攻擊、攻速與移速全面提高；可用能力增加。 ");
      emitCore("MONSTER_LEVEL_UP", { level: rule.level, experience: state.monsterPowerExperience, rule });
    }
    return rule;
  }
  function monsterAbilityIdsForLevel(monster, rule = monsterLevelRule()) {
    const ids = [...(monster?.baseAbilities || monster?.abilities || [1])];
    while (ids.length < rule.abilities) {
      const previous = ids.at(-1) || 1;
      const next = previous % 10 + 1;
      if (!ids.includes(next)) ids.push(next); else ids.push((next + ids.length) % 10 + 1);
    }
    return ids.slice(0, rule.abilities);
  }

  function statusBucket(actor) { return actor.statusEffects || (actor.statusEffects = {}); }
  function setStatus(actor, key, duration) {
    if (!actor) return;
    const statuses = statusBucket(actor);
    statuses[key] = Math.max(number(statuses[key], 0), state.worldTime + duration);
  }
  function statusActive(actor, key) { return number(actor?.statusEffects?.[key], 0) > state.worldTime; }
  function applyMonsterAbilityEffect(monster, abilityId, target, ability) {
    if (!monster || !target) return;
    const effect = ability.effect || MONSTER_ABILITY_LIBRARY[abilityId]?.effect;
    if (effect === "KNOCKBACK") {
      const length = Math.max(.01, Math.hypot(target.x - monster.x, target.y - monster.y));
      const point = findOpenCurrentAreaPoint(target.x + (target.x - monster.x) / length * .8, target.y + (target.y - monster.y) / length * .8, 7700 + abilityId);
      target.x = point.x; target.y = point.y; setStatus(target, "offBalanceUntil", .45);
    } else if (effect === "POISON") {
      setStatus(target, "poisonedUntil", 4.5); statusBucket(target).poisonTickAt = Math.min(number(statusBucket(target).poisonTickAt, Infinity), state.worldTime + .8);
    } else if (effect === "STUN") {
      setStatus(target, "stunnedUntil", .72);
    } else if (effect === "WAVE") {
      damageSceneObjectsNear(target.x, target.y, ability.area + 1.6, "斬擊波");
    } else if (effect === "FLIGHT") {
      setStatus(monster, "flightUntil", 1.5); monster.airborne = true;
    } else if (effect === "BEAM") {
      setStatus(target, "beamMarkedUntil", 1.8); if (target === state.player) state.player.focus = Math.max(0, state.player.focus - 8);
    } else if (effect === "SPLIT") {
      state.monsterMinions = clamp(state.monsterMinions + 1, 0, 60); syncMonsterMinionActors();
      addFloatingText(monster.x, monster.y, "幻影分裂 +1", ability.color, 1.05, 10);
    } else if (effect === "DRAIN") {
      if (target === state.player) state.player.focus = Math.max(0, state.player.focus - 16);
      else target.focus = Math.max(0, number(target.focus, 0) - 16);
    } else if (effect === "GRAVITY") {
      setStatus(target, "gravityUntil", 2.2);
    } else if (effect === "REGENERATE") {
      monster.stamina = Math.min(monster.staminaMax, monster.stamina + 10);
      monster.focus = Math.min(monster.focusMax, monster.focus + 8);
      addFloatingText(monster.x, monster.y, "再生 +10", ability.color, 1.05, 10);
    }
    emitCore("MONSTER_ABILITY_EFFECT", { monsterId: monster.id, abilityId, ability: ability.name, effect, mode: ability.mode });
  }

  function moveFlyingActor(actor, targetX, targetY, speed, dt) {
    const dx = targetX - actor.x, dy = targetY - actor.y, length = Math.max(.001, Math.hypot(dx, dy)), distance = Math.min(length, speed * dt);
    actor.x = clamp(actor.x + dx / length * distance, currentAreaBounds().xMin, currentAreaBounds().xMax);
    actor.y = clamp(actor.y + dy / length * distance, currentAreaBounds().yMin, currentAreaBounds().yMax);
    return length;
  }

  function updateCombatStatusEffects(dt) {
    const player = state.player, statuses = statusBucket(player);
    if (statusActive(player, "poisonedUntil")) {
      if (number(statuses.poisonTickAt, 0) <= state.worldTime) { damagePlayer(1.1, "毒霧"); statuses.poisonTickAt = state.worldTime + .8; }
    } else delete statuses.poisonTickAt;
    if (!statusActive(player, "stunnedUntil") && !statusActive(player, "gravityUntil")) {
      delete statuses.stunnedUntil; delete statuses.gravityUntil;
    }
    allHeroActors().forEach((hero) => {
      if (hero.alive === false) return;
      const heroStatuses = statusBucket(hero);
      if (statusActive(hero, "poisonedUntil")) {
        if (number(heroStatuses.poisonTickAt, 0) <= state.worldTime) { damageHero(hero, 1.1, state.monsterActor); heroStatuses.poisonTickAt = state.worldTime + .8; }
      } else delete heroStatuses.poisonTickAt;
    });
}

  function monsterTitle(profile) {
    const index = clamp(Number(String(profile?.id || "M01").slice(1)) - 1, 0, MONSTER_TITLES.length - 1);
    return MONSTER_TITLES[index];
  }

  function currentAreaEdgePoint(serial = 0) {
    if (state.areaMode === "INTERIOR") return randomInteriorOpenPoint(currentInterior(), serial + 2200, 8);
    const screens = [
      { x: canvas.width - 76, y: canvas.height * .42 }, { x: 76, y: canvas.height * .58 },
      { x: canvas.width * .68, y: 112 }, { x: canvas.width * .32, y: canvas.height - 64 }
    ];
    for (let offset = 0; offset < screens.length; offset += 1) {
      const screen = screens[(serial + offset) % screens.length], world = worldFromScreenPoint(screen.x, screen.y);
      const point = findOpenWorldPoint(world.x, world.y, serial + 2300 + offset);
      if (isWorldPointVisible(point, -25) && playerWorldDistance(state.player, point) > 6) return point;
    }
    return findOpenWorldPoint(state.player.x + 9, state.player.y - 7, serial + 2400);
  }

  function monsterInCurrentArea(monster = state.monsterActor) {
    return Boolean(monster && monster.alive && monster.areaMode === state.areaMode && monster.buildingId === state.currentBuildingId);
  }

  function startMonsterStandoff() {
    if (state.monsterActor?.alive) return state.monsterActor;
    const profile = activeMonsterProfile(), runtime = profile?.runtime || {}, point = currentAreaEdgePoint(Number(profile?.id?.slice(1) || 1)), levelRule = refreshMonsterLevel();
    state.monsterActor = {
      id: profile.id, name: profile.name, title: monsterTitle(profile), baseAbilities: profile.abilities?.length ? [...profile.abilities] : [1], abilities: profile.abilities?.length ? [...profile.abilities] : [1],
      x: point.x, y: point.y, targetX: point.x, targetY: point.y,
      stamina: runtime.staminaMax || 150, staminaMax: runtime.staminaMax || 150,
      focus: runtime.focusMax || 110, focusMax: runtime.focusMax || 110,
      areaMode: state.areaMode, buildingId: state.currentBuildingId, alive: true,
      sequenceStartedAt: state.worldTime, attackCooldown: 0, abilityCursor: 0, transferCount: 0,
      level: levelRule.level, levelRule, unlockedAbilityCount: levelRule.abilities, attackMultiplier: levelRule.attack, speedMultiplier: levelRule.speed, cooldownMultiplier: levelRule.cooldown, attackMode: "PRESSURE", statusEffects: {}
    };
    refreshMonsterLevel();
    state.monsterMinionsReleased = false;
    state.monsterTransferDueAt = null;
    state.monsterMinionActors = [];
    const line = unlockDialogue(profile.id, "FIRST_STANDOFF") || { cat: 5, text: "終於拿到了嗎？那就把它和你的命一起交出來。" };
    showNotice(state.monsterActor.title + "／" + profile.name + "：「" + line.text + "」");
    playPseudoVoice(line.text, line.cat || 5);
    addFloatingText(point.x, point.y, state.monsterActor.title + " 出現", "#ff8a76", 1.9, 14);
    syncMonsterMinionActors();
    emitCore("MONSTER_STANDOFF", { monsterId: state.monsterActor.id, title: state.monsterActor.title, areaKey: coreSceneKey() });
    return state.monsterActor;
  }

  function syncMonsterMinionActors() {
    const monster = state.monsterActor;
    if (!monster?.alive || !monsterInCurrentArea(monster)) return;
    const desired = clamp(Math.floor(state.monsterMinions), 0, 60);
    let active = state.monsterMinionActors.filter((actor) => actor.alive && actor.areaMode === state.areaMode && actor.buildingId === state.currentBuildingId);
    while (active.length < desired) {
      const index = state.monsterMinionActors.length, angle = index / Math.max(1, desired) * Math.PI * 2;
      const point = findOpenCurrentAreaPoint(monster.x + Math.cos(angle) * (1.5 + index % 3 * .35), monster.y + Math.sin(angle) * (1.5 + index % 3 * .35), 2500 + index);
      const actor = { id: "MM-" + index + "-" + monster.transferCount, x: point.x, y: point.y, alive: true, areaMode: state.areaMode, buildingId: state.currentBuildingId, contactCooldown: index * .04, phase: index * 1.3 };
      state.monsterMinionActors.push(actor); active.push(actor);
    }
    while (active.length > desired) active.pop().alive = false;
  }

  function scheduleMonsterTransfer(delay = 2.2) {
    if (!state.formalChase || !state.monsterActor?.alive) return false;
    state.monsterTransferDueAt = state.worldTime + delay;
    return true;
  }

  function transferMonsterToCurrentArea() {
    const monster = state.monsterActor; if (!monster?.alive) return false;
    const point = currentAreaEdgePoint(2600 + monster.transferCount++);
    monster.x = point.x; monster.y = point.y; monster.targetX = state.player.x; monster.targetY = state.player.y;
    monster.areaMode = state.areaMode; monster.buildingId = state.currentBuildingId;
    state.monsterTransferDueAt = null;
    state.monsterMinionActors.forEach((actor) => { actor.alive = false; });
    syncMonsterMinionActors();
    addFloatingText(point.x, point.y, "追殺反應闖入場域", "#ff695f", 1.55, 12);
    showNotice(monster.title + "追進了" + (state.areaMode === "INTERIOR" ? "建築內部" : "外場") + "。");
    emitCore("MONSTER_TRANSFERRED", { monsterId: monster.id, areaKey: coreSceneKey() });
    return true;
  }

  function selectMonsterCombatTarget(monster) {
    const heroes = allHeroActors().filter((hero) => heroActorInCurrentArea(hero) && hero.alive !== false).map((hero) => ({ target: hero, distance: Math.hypot(hero.x - monster.x, hero.y - monster.y), priority: heroCombatPower(hero) }));
    const player = { target: state.player, distance: Math.hypot(state.player.x - monster.x, state.player.y - monster.y), priority: 28 };
    if (!heroes.length) return player;
    heroes.sort((a, b) => a.distance - b.distance || b.priority - a.priority);
    // 已變身英雄與怪人互擊時，怪人不再永遠無視英雄直衝玩家；近身英雄會成為先攻目標。
    if (heroes[0].distance <= Math.max(3.4, player.distance * .86) || heroes[0].target.forcedHostileTargetId === monster.id) return heroes[0];
    return player;
  }

  function updateMonsterSequence(dt) {
    if (state.redUnlocked && !state.monsterActor) startMonsterStandoff();
    const monster = state.monsterActor; if (!monster?.alive) return;
    const levelRule = refreshMonsterLevel();
    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
    monster.focus = Math.min(monster.focusMax, monster.focus + dt * (2.2 + levelRule.level * .18));
    const sequenceElapsed = state.worldTime - monster.sequenceStartedAt;
    if (!state.monsterMinionsReleased && sequenceElapsed >= 1.65) {
      state.monsterMinionsReleased = true;
      showNotice(monster.title + "：「上吧！」"); playPseudoVoice("上吧！", 6);
      addFloatingText(monster.x, monster.y, "上吧！", "#ff6c62", 1.15, 15);
    }
    if (!state.formalChase && sequenceElapsed >= 3.4) {
      state.bossSpeechComplete = true; state.formalChase = true;
      log("怪人台詞完成：怪人與怪人小兵開始正式追殺", true);
      emitCore("FORMAL_CHASE_STARTED", { monsterId: monster.id, minionCount: state.monsterMinions });
    }
    if (!monsterInCurrentArea(monster)) {
      if (state.formalChase && state.monsterTransferDueAt == null) scheduleMonsterTransfer();
      if (state.formalChase && state.monsterTransferDueAt != null && state.worldTime >= state.monsterTransferDueAt) transferMonsterToCurrentArea();
      return;
    }
    syncMonsterMinionActors();
    state.monsterMinionActors.forEach((actor, index) => {
      if (!actor.alive || actor.areaMode !== state.areaMode || actor.buildingId !== state.currentBuildingId) return;
      actor.contactCooldown = Math.max(0, actor.contactCooldown - dt);
      if (!state.monsterMinionsReleased) {
        const angle = state.worldTime * .35 + index / Math.max(1, state.monsterMinions) * Math.PI * 2;
        moveWorldActor(actor, monster.x + Math.cos(angle) * (1.6 + index % 3 * .35), monster.y + Math.sin(angle) * (1.6 + index % 3 * .35), .8 * levelRule.speed, dt);
      } else {
        moveWorldActor(actor, state.player.x, state.player.y, (state.formalChase ? 1.28 : 1.02) * levelRule.speed, dt);
        if (Math.hypot(actor.x - state.player.x, actor.y - state.player.y) < .7 && actor.contactCooldown <= 0) {
          damagePlayer(3 * Math.min(1.5, levelRule.attack), "小兵"); actor.contactCooldown = 1.12 * levelRule.cooldown;
        }
      }
    });
    if (!state.formalChase) return;
    const combatTarget = selectMonsterCombatTarget(monster), target = combatTarget.target;
    const monsterMoveSpeed = (state.areaMode === "INTERIOR" ? .82 : .64) * levelRule.speed;
    const distance = statusActive(monster, "flightUntil") ? moveFlyingActor(monster, target.x, target.y, monsterMoveSpeed * 1.55, dt) : moveWorldActor(monster, target.x, target.y, monsterMoveSpeed, dt);
    const abilityIds = monsterAbilityIdsForLevel(monster, levelRule);
    const abilityBase = MONSTER_ABILITY_LIBRARY[abilityIds[monster.abilityCursor % abilityIds.length]] || MONSTER_ABILITY_LIBRARY[1];
    const ability = { ...abilityBase, damage: abilityBase.damage * levelRule.attack, range: abilityBase.range + (levelRule.level - 1) * .08, area: abilityBase.area + (levelRule.level - 1) * .06 };
    if (monster.attackCooldown <= 0 && distance <= ability.range && monster.focus >= ability.cost) {
      const abilityId = abilityIds[monster.abilityCursor % abilityIds.length];
      monster.focus -= ability.cost; monster.attackCooldown = (1.05 + ability.cost * .012) * levelRule.cooldown; monster.abilityCursor += 1; monster.attackMode = ability.mode || ["PRESSURE", "WARNING", "CONTROL"][monster.abilityCursor % 3];
      if (target === state.player) damagePlayer(ability.damage, monster.title); else damageHero(target, ability.damage, monster);
      applyMonsterAbilityEffect(monster, abilityId, target, ability);
      damageSceneObjectsNear(target.x, target.y, ability.area + .85, "怪人");
      addFieldBurst(target.x, target.y, 1.35 + ability.area * .22);
      addFloatingText(target.x, target.y, ability.name + "｜" + MONSTER_ATTACK_MODES[monster.attackMode], ability.color, 1.15, 14);
      emitCore("MONSTER_ATTACK_MODE", { monsterId: monster.id, mode: monster.attackMode, modeLabel: MONSTER_ATTACK_MODES[monster.attackMode], ability: ability.name });
    } else if (monster.attackCooldown <= 0 && distance < .92) {
      if (target === state.player) damagePlayer(4 * levelRule.attack, monster.title); else damageHero(target, 4 * levelRule.attack, monster);
      damageSceneObjectsNear(target.x, target.y, 1.15, "怪人"); monster.attackCooldown = 1.05 * levelRule.cooldown;
    }
  }

  function placeHeroNearPlayer(actor = state.heroActor, salt = 0) {
    if (!actor) return;
    const point = findOpenCurrentAreaPoint(state.player.x - 1.15, state.player.y + 1.05, salt + 700);
    actor.x = point.x; actor.y = point.y; actor.targetX = point.x; actor.targetY = point.y;
    actor.areaMode = state.areaMode; actor.buildingId = state.currentBuildingId; actor.stuckTime = 0; actor.teleportCooldown = .55;
  }

  function applyHeroStageRuntime(hero, stage, cause = "") {
    if (!hero) return;
    const multiplier = ({ A: 1, B: 1.5, C: 2.25 }[stage] || 1);
    hero.stage = stage;
    hero.stageMoves = serializableCopy(HERO_STAGE_LIBRARY[hero.id]?.moves, hero.moves || []);
    hero.staminaMax = Math.round((hero.baseStaminaMax || hero.staminaMax || 100) * multiplier);
    hero.focusMax = Math.round((hero.baseFocusMax || hero.focusMax || 100) * multiplier);
    hero.stamina = Math.min(hero.staminaMax, Math.max(hero.stamina, Math.ceil(hero.staminaMax * .72)));
    hero.focus = Math.min(hero.focusMax, Math.max(hero.focus, Math.ceil(hero.focusMax * .64)));
    if (stage === "B" || stage === "C") {
      const event = stage === "C" ? "PHASE_3" : "POWER_FAIL";
      const line = unlockDialogue(hero.id, event, "SELF_CHOICE") || { cat: 6, text: stage === "C" ? "這一擊之後，我不再回頭。" : "力量還在上升……我會控制它。" };
      showNotice(hero.title + "：「" + line.text + "」"); playPseudoVoice(line.text, line.cat || 6);
      addFloatingText(hero.x, hero.y, stage === "C" ? "超越" : "強化", stage === "C" ? "#ffe26f" : "#9bdcff", 1.5, 14);
    }
    if (cause) emitCore("HERO_RUNTIME_STAGE_APPLIED", { heroId: hero.id, stage, cause, staminaMax: hero.staminaMax, focusMax: hero.focusMax });
  }

  function activateHeroActor(candidate) {
    const profile = characterProfile(candidate.id), runtime = profile?.runtime || {}, kit = HERO_COMBAT_KITS[candidate.id] || HERO_COMBAT_KITS.H01;
    state.heroActor = {
      id: candidate.id, name: candidate.name, title: kit.title, combatStyle: kit.style, moves: kit.moves, ai: profile?.ai || 2,
      traits: [...(profile?.personality?.traits || [])], resistBehavior: { ...(runtime.resistBehavior || {}) },
      x: candidate.x, y: candidate.y, targetX: candidate.x, targetY: candidate.y,
      stamina: runtime.staminaMax || 110, staminaMax: runtime.staminaMax || 110, baseStaminaMax: runtime.staminaMax || 110,
      focus: runtime.focusMax || 100, focusMax: runtime.focusMax || 100, baseFocusMax: runtime.focusMax || 100,
      senseDistance: clamp((runtime.senseDistance || 100) / 10, 7, 15),
      wanderTimer: 0, stuckTime: 0, detourTimer: 0, teleportCooldown: 0, attackCooldown: 0, rescueCooldown: 0,
      behaviorMode: "PATROL", behaviorTimer: 0, refusalUntil: 0, berserkUntil: 0, lastBehaviorNotice: "", alive: true, faction: "HERO", stage: state.heroStage, statusEffects: {}, lastHitAt: -Infinity, retreating: false,
      areaMode: state.areaMode, buildingId: state.currentBuildingId
    };
    const line = unlockDialogue(candidate.id, "FIRST_AWAKEN") || { cat: 4, text: "這股力量……我會用它帶你離開。" };
    applyHeroStageRuntime(state.heroActor, state.heroStage, "awakening");
    state.heroDialogueHistory.push({ id: candidate.id, event: "FIRST_AWAKEN", text: line.text });
    showNotice(candidate.name + "／" + kit.title + "：「" + line.text + "」");
    playPseudoVoice(line.text, line.cat || 4);
    addFloatingText(candidate.x, candidate.y, "變身／覺醒", "#b9ffd0", 1.8, 13);
    renderAll();
  }
