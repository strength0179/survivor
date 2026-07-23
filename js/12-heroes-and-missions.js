/* 英雄與任務：道具收集、交付分歧、英雄 roster、候選人 AI、撤離目標與結算入口。 */
  function isEntityInCurrentArea(entity) {
    if (!entity) return false;
    if (entity.placement === "OUTDOOR") {
      const entityRegion = entity.regionId || regionAtPoint(entity.x, entity.y)?.id;
      return state.areaMode === "OUTDOOR" && entityRegion === state.regionId;
    }
    return state.areaMode === "INTERIOR" && state.currentBuildingId === entity.buildingId;
  }

  function collectNearbyItem() {
    if (state.keyItemsFound >= state.keyItemTotal) { log("三件關聯道具都已取得"); return; }
    const target = currentKeyItem();
    if (!target || !isEntityInCurrentArea(target)) { log("下一件道具位於「" + (target?.scene || "未知地點") + "」"); return; }
    if (playerWorldDistance(state.player, target) > ITEM_PICKUP_RADIUS) { log("關鍵道具不在金色拾取圈內，請跟著箭頭前進"); return; }
    if (state.collectedItems.includes(target.id)) return;
    const collectedIndex = state.keyItemsFound;
    state.collectedItems.push(target.id);
    state.keyItemsFound += 1;
    state.core.objects.upsert({ id: target.id, kind: "KEY_ITEM", areaKey: target.placement === "INTERIOR" ? "INTERIOR:" + target.buildingId : "OUTDOOR:" + target.regionId, x: target.x, y: target.y, status: "COLLECTED", family: target.family, category: target.category });
    emitCore("ITEM_COLLECTED", { itemId: target.id, category: target.category, trueName: target.trueName, count: state.keyItemsFound, total: state.keyItemTotal });
    if (target.identity) state.playerIdentity = target.identity;
    state.lastItemReveal = target.category + " → " + target.trueName + "｜" + target.reveal + "　關聯：" + target.relation;
    state.inspectionItemId = target.id;
    state.itemInspectionOpen = true;
    state.trackingLevel = clamp(state.trackingLevel + 1, 0, 9);
    if (state.areaMode === "INTERIOR") scheduleTrackingMinions(currentInterior(), 1);
    state.eventInput = {
      ...state.eventInput,
      keyItemAcquired: true,
      chaseClueFound: true,
      clueCount: Math.min(6, number(state.eventInput.clueCount, 0) + number(target.clueGain, 0)),
      secondKeyEvent: state.keyItemsFound >= 2 || bool(state.eventInput.secondKeyEvent)
    };
    syncChain("取得「" + target.trueName + "」；尚未直接觸發英雄變身");
    if (collectedIndex === 0) showStorySequence("IDENTITY", target);
    else if (collectedIndex === 1) { showStorySequence("INCIDENT", target); spawnRogueHero("第二件關鍵物讓某個被操控者鎖定了你"); }
    renderItemInspection();
  }

  function heroStageFor(actor) { return actor?.stage || (actor === state.heroActor ? state.heroStage : "A") || "A"; }
  function allHeroActors() { return [state.heroActor, ...state.extraHeroActors].filter((actor) => actor && actor.alive !== false); }
  function heroActorInCurrentArea(actor) { return Boolean(actor && actor.alive !== false && actor.areaMode === state.areaMode && actor.buildingId === state.currentBuildingId); }
  function heroCombatPower(actor) {
    if (!actor) return 0;
    const stage = heroStageFor(actor), rank = stageRank[stage] || 1, multiplier = actor.powerMultiplier || 1;
    return (24 + rank * 25 + number(actor.staminaMax, 100) / 12 + number(actor.focusMax, 100) / 16) * multiplier;
  }
  function heroRelationKey(one, two) { return [String(one?.id || "?"), String(two?.id || "?")].sort().join("|"); }
  function relationBetween(one, two) {
    const key = heroRelationKey(one, two);
    return state.heroRelations[key] || (state.heroRelations[key] = { key, hits: 0, hostile: false, guardUntil: 0, lastAttackerId: null });
  }
  function actorFromHeroId(id) { return allHeroActors().find((actor) => actor.id === id) || null; }
  function makeAdditionalHero(profile, options = {}) {
    const runtime = profile?.runtime || {}, kit = HERO_COMBAT_KITS[profile?.id] || HERO_COMBAT_KITS.H01, point = options.point || currentAreaEdgePoint(Number(String(profile?.id || "H01").slice(1)) + 3100);
    const actor = {
      id: profile.id, name: profile.name, title: options.title || kit.title, combatStyle: kit.style, moves: kit.moves,
      ai: profile?.ai || 2, traits: [...(profile?.personality?.traits || [])], resistBehavior: { ...(runtime.resistBehavior || {}) },
      faction: options.faction || "HERO", stage: options.stage || "A", alive: true, powerMultiplier: options.powerMultiplier || 1,
      x: point.x, y: point.y, targetX: point.x, targetY: point.y, stamina: runtime.staminaMax || 110, staminaMax: runtime.staminaMax || 110, baseStaminaMax: runtime.staminaMax || 110,
      focus: runtime.focusMax || 100, focusMax: runtime.focusMax || 100, baseFocusMax: runtime.focusMax || 100, senseDistance: clamp((runtime.senseDistance || 100) / 10, 7, 15),
      areaMode: state.areaMode, buildingId: state.currentBuildingId, wanderTimer: 0, behaviorTimer: 0, attackCooldown: 0, rescueCooldown: 0, guardUntil: 0,
      forcedHostileTargetId: null, lastAttackerId: null, teleportCooldown: .45, stuckTime: 0, behaviorMode: options.faction === "ROGUE" ? "ROGUE_PATROL" : "PATROL", statusEffects: {}, lastHitAt: -Infinity, retreating: false
    };
    applyHeroStageRuntime(actor, actor.stage, "reinforcement");
    return actor;
  }
  function nextSupportingHeroProfile() {
    const used = new Set(allHeroActors().map((actor) => actor.id).concat([state.heroCandidate.id]));
    const pool = CHARACTER_PROFILES.profiles.filter((profile) => profile.pool === "英雄" && !used.has(profile.id) && profile.ai !== 4);
    return pool[(state.deliveryHistory.length + state.keyItemsFound) % Math.max(1, pool.length)] || CHARACTER_PROFILES.profiles.find((profile) => profile.id === "H01");
  }
  function spawnSupportingHero(reason = "關鍵物的反應召來援軍") {
    if (state.extraHeroActors.filter((actor) => actor.alive !== false && actor.faction === "HERO").length >= 2) return null;
    const profile = nextSupportingHeroProfile(); if (!profile) return null;
    const actor = makeAdditionalHero(profile, { faction: "HERO", point: currentAreaEdgePoint(3300 + state.extraHeroActors.length) });
    state.extraHeroActors.push(actor);
    const line = unlockDialogue(actor.id, "FIRST_AWAKEN", "FIRST_SIGHT") || { cat: 6, text: "我看見了這條路。先讓人群離開。" };
    showNotice("援軍「" + actor.title + "／" + actor.name + "」現身：「" + line.text + "」"); playPseudoVoice(line.text, line.cat || 6);
    addFloatingText(actor.x, actor.y, "援軍現身", "#92ffbf", 1.55, 13);
    emitCore("SUPPORT_HERO_SPAWNED", { heroId: actor.id, reason });
    return actor;
  }
  function spawnRogueHero(reason = "關鍵物造成異常反應") {
    if (state.rogueSpawned) return state.extraHeroActors.find((actor) => actor.faction === "ROGUE" && actor.alive !== false) || null;
    const used = new Set(allHeroActors().map((actor) => actor.id).concat([state.heroCandidate.id]));
    const profiles = CHARACTER_PROFILES.profiles.filter((profile) => profile.pool === "英雄" && !used.has(profile.id) && profile.ai === 4);
    const profile = profiles[(state.keyItemsFound + state.hiddenBranchItems) % Math.max(1, profiles.length)] || CHARACTER_PROFILES.profiles.find((entry) => entry.id === "H19");
    const actor = makeAdditionalHero(profile, { faction: "ROGUE", title: "反派" + (HERO_COMBAT_KITS[profile.id] || HERO_COMBAT_KITS.H01).title, point: currentAreaEdgePoint(3400), powerMultiplier: 1 });
    actor.resistBehavior = { confused: .1, berserk: .05, stopAndSpeak: .09, ...(profile.runtime?.resistBehavior || {}) };
    state.extraHeroActors.push(actor); state.rogueSpawned = true;
    const line = unlockDialogue(actor.id, "REJECT_ORDER", "FIRST_SIGHT") || { cat: 5, text: "把那個東西交出來。否則這裡的人都會變成代價。" };
    showNotice(actor.title + "：「" + line.text + "」"); playPseudoVoice(line.text, line.cat || 5);
    addFloatingText(actor.x, actor.y, "反派英雄接近", "#ff9bcc", 1.7, 13);
    emitCore("ROGUE_HERO_SPAWNED", { heroId: actor.id, reason });
    return actor;
  }
  function nextDeliverableItem() { return [...state.collectedItems].reverse().map(itemById).find((item) => item && !state.handedItemIds.includes(item.id)) || null; }
  function deliveryRecipients() {
    const recipients = [], item = nextDeliverableItem(); if (!item || state.deliveryCooldown > 0) return recipients;
    const within = (actor, distance = 1.65) => heroActorInCurrentArea(actor) && Math.hypot(actor.x - state.player.x, actor.y - state.player.y) <= distance;
    if (state.heroCandidate.present && !state.heroCandidate.awakened && Math.hypot(state.heroCandidate.x - state.player.x, state.heroCandidate.y - state.player.y) <= 1.65) recipients.push({ id: "CANDIDATE:" + state.heroCandidate.id, kind: "HERO", actor: state.heroCandidate, label: "交給候選人「" + state.heroCandidate.name + "」" });
    allHeroActors().filter(within).forEach((actor) => {
      const kind = actor.faction === "ROGUE" ? "ROGUE" : "HERO";
      recipients.push({ id: kind + ":" + actor.id, kind, actor, label: "交給" + actor.title });
    });
    if (monsterInCurrentArea() && Math.hypot(state.monsterActor.x - state.player.x, state.monsterActor.y - state.player.y) <= 1.8) recipients.push({ id: "MONSTER:" + state.monsterActor.id, kind: "MONSTER", actor: state.monsterActor, label: "交給" + state.monsterActor.title });
    return recipients;
  }
  function renderDeliveryHud() {
    const hud = $("deliveryHud"), item = nextDeliverableItem(), recipients = deliveryRecipients();
    if (!item || !recipients.length) { hud.classList.add("is-hidden"); $("deliveryTargets").innerHTML = ""; return; }
    $("deliveryTitle").textContent = "可交付：「" + item.trueName + "」";
    $("deliveryDescription").textContent = "把它交給誰，會改變覺醒、敵方力量與後續關係。";
    $("deliveryTargets").innerHTML = recipients.map((recipient) => "<button class=\"delivery-target\" type=\"button\" data-kind=\"" + recipient.kind + "\" data-recipient-id=\"" + recipient.id + "\">" + escapeHtml(recipient.label) + "</button>").join("");
    hud.classList.remove("is-hidden");
  }
  function deliverItemTo(recipientId) {
    const item = nextDeliverableItem(), recipient = deliveryRecipients().find((entry) => entry.id === recipientId);
    if (!item || !recipient || state.deliveryCooldown > 0) return false;
    state.handedItemIds.push(item.id); state.deliveryCooldown = .3;
    const actor = recipient.actor;
    if (recipientId.startsWith("CANDIDATE:")) {
      state.heroCandidate.deliveryBond = (state.heroCandidate.deliveryBond || 0) + 1;
      state.eventInput = { ...state.eventInput, heroCandidateFound: true, identityMatched: state.playerIdentity === KEY_ITEM_CHAIN[0].identity };
      showNotice("你把「" + item.trueName + "」交給" + actor.name + "。他盯著物件沉默了幾秒，像是想起了自己本來要守護什麼。 ");
      addFloatingText(actor.x, actor.y, "候選人記起線索", "#ffe1a3", 1.2, 11);
    } else if (recipient.kind === "MONSTER") {
      state.monsterPowerExperience += 6 + item.clueGain * 2; state.monsterMinions = clamp(state.monsterMinions + 3, 0, 60); state.eliteThreatActive = true;
      refreshMonsterLevel();
      showNotice("你把「" + item.trueName + "」交給" + actor.title + "。怪人吸收其中的反應，附近又有小兵被召來。 ");
      addFloatingText(actor.x, actor.y, "敵方力量 +6", "#ff806f", 1.35, 12);
    } else if (recipient.kind === "ROGUE") {
      actor.powerMultiplier = 10; actor.berserkUntil = state.worldTime + 12; actor.forcedHostileTargetId = state.heroActor?.id || null; state.trackingLevel = clamp(state.trackingLevel + 2, 0, 9);
      showNotice("你把「" + item.trueName + "」交給" + actor.title + "。封印解除，他的力量暫時被放大十倍。快離開這裡。 ");
      addFloatingText(actor.x, actor.y, "10 倍解放", "#ff8ac7", 1.55, 15);
      damageSceneObjectsNear(actor.x, actor.y, 2.8, "反派英雄");
    } else {
      actor.focus = Math.min(actor.focusMax, actor.focus + actor.focusMax * .65); actor.stamina = Math.min(actor.staminaMax, actor.stamina + actor.staminaMax * .45);
      state.eventInput = { ...state.eventInput, operationSuccess: true, secondKeyEvent: true };
      if (actor === state.heroActor && state.heroStage === "A") syncChain("英雄接受關鍵物，覺醒資料被寫入下一階段條件");
      spawnSupportingHero("英雄接到關鍵物後發出的求援訊號");
      showNotice("你把「" + item.trueName + "」交給" + actor.title + "。他把物件收進裝甲，身旁出現新的反應。 ");
      addFloatingText(actor.x, actor.y, "英雄共鳴", "#8effc4", 1.35, 12);
    }
    state.deliveryHistory.push({ itemId: item.id, recipientId, at: state.worldTime });
    state.candidateLifeRoute = candidateLifeRouteForState();
    state.heroCandidate.lifeRoute = state.candidateLifeRoute;
    activateRouteNode("DELIVERY", "COMPLETE", { itemId: item.id, recipientId, recipientKind: recipient.kind });
    emitCore("ITEM_DELIVERED", { itemId: item.id, recipientId, recipientKind: recipient.kind });
    syncChain("關鍵道具的交付結果已改變關係與力量");
    renderDeliveryHud(); renderAll();
    return true;
  }

  function updateHeroCandidateAvailability() {
    const candidate = state.heroCandidate;
    candidate.locatable = state.heroStage === "NONE" && state.keyItemsFound >= 2 && !candidate.awakened;
    candidate.present = state.heroStage === "NONE" && !candidate.awakened && isEntityInCurrentArea(candidate);
  }

  function findNearestInjuredCivilian(actor, range) {
    if (state.areaMode !== "OUTDOOR") return null;
    let best = null, bestDistance = range;
    nearbySpatialEntities(actor.x, actor.y, range, (entity) => state.civilians.includes(entity) && entity.alive !== false).forEach((civilian) => {
      if (!civilian.alive || civilian.injury <= 0) return;
      const distance = Math.hypot(civilian.x - actor.x, civilian.y - actor.y);
      if (distance < bestDistance) { best = civilian; bestDistance = distance; }
    });
    return best ? { civilian: best, distance: bestDistance } : null;
  }

  function assistCivilian(actor, civilian, label = "救助") {
    if (!civilian?.alive || civilian.injury <= 0 || actor.rescueCooldown > 0) return false;
    civilian.injury = Math.max(0, civilian.injury - 1); civilian.hp = Math.min(civilian.maxHp, civilian.hp + 1);
    civilian.rescuedByHero = true; actor.rescueCooldown = .85;
    addFloatingText(civilian.x, civilian.y, label, "#8fffc1", 1.05, 11);
    state.eventInput = { ...state.eventInput, rescueCount: Math.min(3, number(state.eventInput.rescueCount, 0) + 1) };
    return true;
  }

  function candidateOpenPoint(candidate, x, y, salt) {
    if (candidate.placement === "OUTDOOR") {
      const region = regionById(candidate.regionId), margin = 1.2;
      return findOpenWorldPoint(clamp(x, region.xMin + margin, region.xMax - margin), clamp(y, region.yMin + margin, region.yMax - margin), salt);
    }
    return findOpenCurrentAreaPoint(x, y, salt);
  }

  function registerCandidateEncounter(candidate) {
    if (candidate.met) return false;
    candidate.met = true;
    state.eventInput = {
      ...state.eventInput,
      identityMatched: state.playerIdentity === KEY_ITEM_CHAIN[0].identity,
      locationMatched: isEntityInCurrentArea(candidate) && state.scene === candidate.scene,
      heroCandidateFound: true
    };
    showNotice("你找到英雄候選人「" + candidate.name + "」。他認得這條道具線索，但力量尚未覺醒。");
    syncChain("移動中的英雄候選人已被確認，仍缺少最後覺醒條件");
    return true;
  }

  function completeHeroAwakening(candidate, cause = "接觸") {
    if (candidate.awakened || !candidate.met || state.keyItemsFound < state.keyItemTotal) return false;
    if (state.playerIdentity !== KEY_ITEM_CHAIN[0].identity || !isEntityInCurrentArea(candidate) || state.scene !== candidate.scene) return false;
    candidate.awakened = true; candidate.present = false;
    state.candidateLifeRoute = candidateLifeRouteForState(); candidate.lifeRoute = state.candidateLifeRoute;
    state.eventInput = {
      ...state.eventInput,
      identityMatched: true, locationMatched: true, heroCandidateFound: true, heroAwakeningTriggered: true,
      clueCount: Math.max(2, number(state.eventInput.clueCount, 0))
    };
    showNotice("身分、三件關聯道具、「" + candidate.scene + "」與移動中的候選人全部吻合——" + (cause === "自主迎戰" ? "他自行決定變身迎戰。" : "A 階段覺醒條件成立。"));
    syncChain("英雄候選人完成 A 階段覺醒");
    if (state.heroStage !== "NONE") {
      activateHeroActor(candidate);
      activateMissionExit();
      emitCore("HERO_AWAKENED", { heroId: candidate.id, stage: state.heroStage, cause });
    }
    return true;
  }

  function updateHeroCandidate(dt) {
    updateHeroCandidateAvailability();
    const candidate = state.heroCandidate;
    if (!candidate.present || candidate.condition === "UNCONSCIOUS") return;
    candidate.rescueCooldown = Math.max(0, candidate.rescueCooldown - dt); candidate.wanderTimer -= dt;
    const profile = characterProfile(candidate.id), traits = profile?.personality?.traits || [], empathy = number(traits[1], 50) / 100, curiosity = number(traits[7], 50) / 100;
    const threats = currentHeroThreats().map((threat) => ({ threat, distance: Math.hypot(threat.x - candidate.x, threat.y - candidate.y), power: threatPower(threat) })).filter((entry) => entry.distance <= candidate.senseDistance);
    threats.sort((a, b) => candidate.ai === 3 ? b.power - a.power : a.distance - b.distance);
    const rescue = findNearestInjuredCivilian(candidate, candidate.ai === 2 ? candidate.senseDistance : candidate.senseDistance * empathy * .72);
    const playerDistance = playerWorldDistance(state.player, candidate);
    const lifeRoute = CANDIDATE_LIFE_ROUTES[state.candidateLifeRoute] || CANDIDATE_LIFE_ROUTES.PROTECT;
    candidate.lifeRoute = state.candidateLifeRoute; candidate.lifeBehavior = lifeRoute.behavior;
    let target = null;
    if (candidate.locatable && !candidate.met && playerDistance > 1.2) {
      candidate.behaviorMode = "APPROACH"; target = state.player;
    } else if (rescue && (lifeRoute.behavior === "GUARD_CROWD" || candidate.ai === 2 || !threats.length) && empathy >= .42) {
      candidate.behaviorMode = "RESCUE"; target = rescue.civilian;
    } else if (candidate.met && lifeRoute.behavior === "INVESTIGATE") {
      const clueObject = currentSceneObjects().find((object) => object.status !== "DESTROYED" && object.status !== "COMPLETE" && (object.tracking > 0 || object.clue > 0));
      if (clueObject && isEntityInCurrentArea(clueObject)) { candidate.behaviorMode = "INVESTIGATE"; target = clueObject; }
    } else if (candidate.met && lifeRoute.behavior === "BREAK_CONTROL") {
      const rogue = state.extraHeroActors.find((actor) => actor.faction === "ROGUE" && actor.alive !== false && heroActorInCurrentArea(actor));
      if (rogue) { candidate.behaviorMode = "REJECT_CONTROL"; target = { x: candidate.x + (candidate.x - rogue.x), y: candidate.y + (candidate.y - rogue.y) }; }
    } else if (threats.length && candidate.ai !== 4) {
      candidate.behaviorMode = candidate.ai === 3 ? "INVESTIGATE_STRONGEST" : "WATCH_DANGER";
      const threat = threats[0].threat, dx = candidate.x - threat.x, dy = candidate.y - threat.y, length = Math.max(.01, Math.hypot(dx, dy));
      target = { x: threat.x + dx / length * 3.1, y: threat.y + dy / length * 3.1 };
    }
    if (!target && (candidate.wanderTimer <= 0 || Math.hypot(candidate.targetX - candidate.x, candidate.targetY - candidate.y) < .45)) {
      candidate.behaviorMode = candidate.condition === "INJURED" ? "SEEK_SHELTER" : "WANDER";
      const radius = 2.8 + curiosity * 4.6, angle = state.worldTime * (.32 + curiosity * .28) + candidate.ai * 1.9 + seeded(Math.floor(state.worldTime * 2), Number(candidate.id.slice(1)) + 401) * Math.PI * 2;
      target = { x: candidate.x + Math.cos(angle) * radius, y: candidate.y + Math.sin(angle) * radius };
    }
    if (target) {
      const open = candidateOpenPoint(candidate, target.x, target.y, 4100 + Math.floor(state.worldTime * 3) + candidate.ai);
      candidate.targetX = open.x; candidate.targetY = open.y; candidate.wanderTimer = .65 + (1 - curiosity) * .75;
    }
    const beforeX = candidate.x, beforeY = candidate.y, pace = candidate.condition === "INJURED" ? .52 : .72 + curiosity * .36;
    moveWorldActor(candidate, candidate.targetX, candidate.targetY, pace, dt);
    if (Math.hypot(candidate.x - beforeX, candidate.y - beforeY) < .001 && Math.hypot(candidate.targetX - candidate.x, candidate.targetY - candidate.y) > .6) candidate.stuckTime += dt; else candidate.stuckTime = Math.max(0, candidate.stuckTime - dt * 2);
    if (candidate.stuckTime > .5) {
      const angle = seeded(Math.floor(state.worldTime * 10), candidate.ai + 451) * Math.PI * 2;
      const detour = candidateOpenPoint(candidate, candidate.x + Math.cos(angle) * 3.2, candidate.y + Math.sin(angle) * 3.2, 4200 + candidate.ai);
      candidate.targetX = detour.x; candidate.targetY = detour.y; candidate.wanderTimer = .45; candidate.stuckTime = 0;
    }
    if (rescue && candidate.behaviorMode === "RESCUE" && Math.hypot(candidate.x - rescue.civilian.x, candidate.y - rescue.civilian.y) <= .85) assistCivilian(candidate, rescue.civilian, "先止血");
    if (candidate.met && state.keyItemsFound >= state.keyItemTotal && threats.some((entry) => entry.distance <= candidate.senseDistance * .75)) completeHeroAwakening(candidate, "自主迎戰");
  }

  function tryHeroCandidateEncounter() {
    updateHeroCandidateAvailability();
    const candidate = state.heroCandidate;
    if (!candidate.present || !candidate.locatable || playerWorldDistance(state.player, candidate) > 1.55) return;
    registerCandidateEncounter(candidate);
    if (state.keyItemsFound >= state.keyItemTotal && !candidate.awakened) {
      completeHeroAwakening(candidate, "接觸");
    }
  }

  function exitObjective() {
    const building = currentBuilding(), interior = currentInterior();
    return building && interior ? { ...interior.entry, id: building.id + "-EXIT", kind: "EXIT", label: "返回「" + building.label + "」外部" } : null;
  }

  function activateMissionExit() {
    if (state.missionExit) return state.missionExit;
    const preferred = state.player.x >= 0 ? { x: -88, y: 48 } : { x: 88, y: -48 };
    const point = findOpenWorldPoint(preferred.x, preferred.y, 9200 + state.keyItemsFound);
    state.missionExit = { id: "SAFE_EXIT", kind: "SAFE_EXIT", placement: "OUTDOOR", areaKey: "OUTDOOR", regionId: regionAtPoint(point.x, point.y).id, x: point.x, y: point.y, label: "前往安全匯合點／撤離", active: true };
    state.core.objects.upsert({ ...state.missionExit, kind: "MISSION_EXIT", status: "ACTIVE" });
    emitCore("MISSION_EXIT_OPENED", { exit: state.missionExit });
    showNotice("英雄覺醒後開出安全匯合訊號。先帶著倖存下來的線索撤離。 ");
    addFloatingText(point.x, point.y, "安全匯合點", "#fff3a0", 1.8, 14);
    return state.missionExit;
  }

  function settlementScore() {
    return settlementReport().score;
  }

  function settlementReport() {
    const flags = syncRouteFlags("settlement"), casualties = flags.casualty;
    return { justice: flags.justice, organization: flags.organizationPower, score: Math.max(0, flags.justice * 10 - flags.organizationPower), casualties, time: Math.round(state.worldTime), stage: state.heroStage, routeHint: flags.routeHint };
  }

  function selectedNextEpisodePreview() {
    const settlement = state.settlement || settlementReport();
    const combination = routeCombinationForFlags(state.routeFlags), index = Math.max(0, ROUTE_COMBINATION_TABLE.indexOf(combination));
    return ROUTE_PREVIEW_TEMPLATES[index % ROUTE_PREVIEW_TEMPLATES.length] || NEXT_EPISODE_PREVIEWS[(index + settlement.casualties) % NEXT_EPISODE_PREVIEWS.length];
  }

  function renderWorldMap(preview) {
    const map = $("worldMap"), hidden = state.hiddenBranchItems > 0, start = WORLD_MAP_LAYOUT.start, main = WORLD_MAP_LAYOUT.main, branch = WORLD_MAP_LAYOUT.hidden;
    const node = (entry, className, title) => "<div class=\"map-node " + className + "\" style=\"left:" + entry.x + "%;top:" + entry.y + "%\">" + escapeHtml(title) + "<small>" + escapeHtml(entry.label).replace(/\n/g, "<br>") + "</small></div>";
    const mainPath = "<path class=\"main-route\" d=\"M " + start.x + " " + start.y + " L " + main.x + " " + main.y + "\" />";
    const backtrack = hidden && state.mapAnimationStep >= 2 ? "<path class=\"backtrack\" d=\"M " + main.x + " " + main.y + " L " + (main.x - 9) + " " + (main.y + 20) + " L " + start.x + " " + start.y + "\" />" : "";
    const hiddenPath = hidden && state.mapAnimationStep >= 2 ? "<path class=\"hidden\" d=\"M " + start.x + " " + start.y + " L " + branch.x + " " + branch.y + "\" />" : "";
    const mainClass = state.mapAnimationStep >= 1 ? "visited" : "current", nextClass = state.mapAnimationStep >= 1 ? "next" : "next visited";
    const note = state.mapAnimationStep >= 2 ? "主線前進 → 返回上一格 → 隱藏線拉出" : "主線節點前進中";
    map.innerHTML = "<div class=\"world-map-title\">WORLD NODE／次の地図へ</div><div class=\"map-stage-note\">" + note + "</div><div class=\"map-grid\"></div><svg class=\"map-route\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\">" + mainPath + backtrack + hiddenPath + "</svg>" + node(start, "current " + mainClass, "01") + node(main, nextClass, "02") + (hidden ? node(branch, "hidden" + (state.mapAnimationStep >= 2 ? " return" : ""), "？") : "") + "<div class=\"next-episode-title\" style=\"position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:100%;font-size:clamp(16px,4vw,27px)\">" + escapeHtml(preview[2]) + "</div>";
    map.classList.remove("is-hidden");
  }

  function renderRunCompletePhase() {
    const settlement = state.settlement || settlementReport(), preview = selectedNextEpisodePreview(), previewNode = $("runCompletePreview"), map = $("worldMap");
    if (state.completionPhase === "RESULTS") {
      $("runCompleteTitle").textContent = "結果";
      $("runCompleteScore").textContent = "正義 " + settlement.justice + "　敵組織 " + settlement.organization + "　TOTAL " + settlement.score;
      $("runCompleteDetail").textContent = "救助 " + number(state.eventInput?.rescueCount, 0) + "｜死傷 " + settlement.casualties + "｜経過 " + settlement.time + " 秒｜英雄段階 " + settlement.stage + "｜路線 " + settlement.routeHint + "。数値の後に、次回予告が浮かび上がる。";
      previewNode.className = "preview-fragments is-hidden"; previewNode.innerHTML = ""; map.classList.add("is-hidden"); map.innerHTML = ""; $("runCompleteConfirm").textContent = "次回予告へ";
      return;
    }
    if (state.completionPhase === "PREVIEW") {
      $("runCompleteTitle").textContent = "次回予告";
      $("runCompleteScore").textContent = "";
      $("runCompleteDetail").textContent = "画面の外で、まだ誰かが走っている。";
      const fragments = [
        { text: preview[0], css: TRAILER_TYPOGRAPHY[1].className, style: "left:5%;top:9%;animation-delay:.1s" },
        { text: "逃げ道は、まだ消えていない。", css: TRAILER_TYPOGRAPHY[0].className, style: "right:7%;top:16%;animation-delay:.42s" },
        { text: preview[1], css: TRAILER_TYPOGRAPHY[3].className, style: "left:12%;bottom:15%;animation-delay:.78s" },
        { text: state.hiddenBranchItems ? "もうひとつの道が、静かに開いた。" : "次の角で、運命が名前を持つ。", css: TRAILER_TYPOGRAPHY[2].className, style: "left:4%;top:32%;animation-delay:1.12s" },
        { text: "路線事件 " + (state.routeOutcome?.eventId || "ROUTE_01") + "｜" + (state.routeOutcome?.faction || "HERO_AWAKENING"), css: "horizontal-large", style: "left:10%;top:70%;animation-delay:1.48s" }
      ];
      previewNode.innerHTML = fragments.map((entry) => "<span class=\"" + entry.css + "\" style=\"" + entry.style + "\">" + escapeHtml(entry.text) + "</span>").join("");
      previewNode.className = "preview-fragments trailer"; map.classList.add("is-hidden"); map.innerHTML = ""; $("runCompleteConfirm").textContent = "次の地図へ";
      return;
    }
    $("runCompleteTitle").textContent = "次の地図";
    $("runCompleteScore").textContent = state.hiddenBranchItems ? "第１回 → 第２回 → 隠し回" : "第１回 → 第２回";
    $("runCompleteDetail").textContent = state.hiddenBranchItems ? "主線節點先前進，再由上一格拉出隱藏分歧。確認後會以新的種子開始下一輪驗證。" : "主線節點已前進。確認後會以新的種子開始下一輪驗證。";
    previewNode.className = "preview-fragments is-hidden"; previewNode.innerHTML = ""; renderWorldMap(preview); $("runCompleteConfirm").textContent = "最初から";
  }

  function advanceRunComplete() {
    if (!state.runComplete) return;
    if (state.completionPhase === "RESULTS") { state.completionPhase = "PREVIEW"; renderRunCompletePhase(); return; }
    if (state.completionPhase === "PREVIEW") { state.completionPhase = "MAP"; state.mapAnimationStep = 1; renderRunCompletePhase(); window.setTimeout(() => { if (state.runComplete && state.completionPhase === "MAP") { state.mapAnimationStep = 2; renderRunCompletePhase(); } }, 1000); return; }
    reset();
  }

  function completeRun() {
    if (state.runComplete || state.gameOver) return false;
    state.runComplete = true;
    state.mapAnimationStep = 0;
    if (state.core.lifecycle.phase === CORE.LIFE.PLAYING) state.core.lifecycle.move(CORE.LIFE.SUCCESS, "safe-exit");
    state.core.objects.upsert({ ...(state.missionExit || { id: "SAFE_EXIT" }), kind: "MISSION_EXIT", status: "COMPLETE" });
    state.settlement = settlementReport(); state.completionPhase = "RESULTS";
    emitCore("RUN_SUCCEEDED", { score: state.settlement.score, casualties: state.settlement.casualties, heroStage: state.heroStage, justice: state.settlement.justice, organization: state.settlement.organization });
    renderRunCompletePhase();
    $("runComplete").classList.remove("is-hidden");
    playImpact("HEAVY");
    return true;
  }

  function objectiveForEntity(entity, kind, label) {
    if (!entity) return null;
    if (isEntityInCurrentArea(entity)) return { ...entity, kind, label };
    if (state.areaMode === "INTERIOR") return exitObjective();
    // 外場目標在另一個七區邊界之外時，直接給世界座標箭頭；玩家可以一路跨區而不必被假入口卡住。
    if (entity.placement === "OUTDOOR") return { ...entity, kind, label };
    const entrance = findEntranceById(entity.entranceId) || allBuildingEntrances().find((entry) => entry.buildingId === entity.buildingId);
    return entrance ? { ...entrance, kind: "GATE", targetScene: entity.scene, label: (kind === "CANDIDATE" ? "前往「" + entrance.buildingLabel + "」尋找可能覺醒的人" : itemLocationHint(entity) + "｜黃色入口") } : null;
  }

  function syncNavigationObjectives(primary) {
    const registry = state.core.objectives;
    registry.clear();
    const added = new Set();
    const add = (entry, priority) => {
      if (!entry || added.has(entry.id)) return null;
      added.add(entry.id);
      return registry.upsert({ ...entry, priority, status: "ACTIVE" });
    };
    add(primary, 1);
    if (state.missionExit?.active) add(objectiveForEntity(state.missionExit, "SAFE_EXIT", state.missionExit.label), 4);
    KEY_ITEM_CHAIN.slice(state.keyItemsFound).forEach((item, index) => add(objectiveForEntity(item, "ITEM", itemLocationHint(item)), 12 + index * 8));
    const candidate = state.heroCandidate;
    if (!candidate.awakened) add(objectiveForEntity(candidate, "CANDIDATE", "可能成為英雄的人｜" + candidate.name), 36);
    return registry.list();
  }

  function currentNavigationObjective() {
    const candidate = state.heroCandidate;
    let primary = null;
    if (state.missionExit?.active) primary = objectiveForEntity(state.missionExit, "SAFE_EXIT", state.missionExit.label);
    else if (state.keyItemsFound >= 2 && !candidate.met && !candidate.awakened) primary = objectiveForEntity(candidate, "CANDIDATE", "可能成為英雄的人｜" + candidate.name);
    else {
      const item = currentKeyItem();
      if (item) primary = objectiveForEntity(item, "ITEM", itemLocationHint(item) + "｜" + item.vagueName);
      else if (!candidate.awakened) primary = objectiveForEntity(candidate, "CANDIDATE", candidate.met ? "返回候選人｜" + candidate.name : "可能成為英雄的人");
    }
    syncNavigationObjectives(primary);
    return primary;
  }

  function checkNavigationGate() {
    if (state.areaMode === "INTERIOR") {
      const objective = exitObjective();
      if (!objective || playerWorldDistance(state.player, objective) > .72) { if (state.activeEntranceId?.endsWith("-EXIT")) state.activeEntranceId = null; return false; }
      if (state.activeEntranceId === objective.id) return false;
      state.activeEntranceId = objective.id; exitBuilding(); return true;
    }
    const objective = currentNavigationObjective();
    if (state.missionExit?.active && state.areaMode === "OUTDOOR" && playerWorldDistance(state.player, state.missionExit) <= 1.15) {
      completeRun(); return true;
    }
    let entrance = objective?.kind === "GATE" && playerWorldDistance(state.player, objective) <= .82 ? objective : null;
    if (!entrance) entrance = allBuildingEntrances().find((entry) => playerWorldDistance(state.player, entry) <= .72) || null;
    if (!entrance) { state.activeEntranceId = null; return false; }
    if (state.activeEntranceId === entrance.id) return false;
    state.activeEntranceId = entrance.id;
    const building = WORLD_BUILDINGS.find((entry) => entry.id === entrance.buildingId);
    if (!building) return false;
    enterBuilding(building, entrance);
    return true;
  }

  function movePlayerWithCollisions(dx, dy, distance) {
    const bounds = currentAreaBounds();
    const moved = CORE.moveWithSlide(state.player, { x: dx, y: dy }, distance, (point) => point.x < bounds.xMin || point.x > bounds.xMax || point.y < bounds.yMin || point.y > bounds.yMax || collidesCurrentArea(point.x, point.y, .02));
    state.player.x = clamp(moved.x, bounds.xMin, bounds.xMax); state.player.y = clamp(moved.y, bounds.yMin, bounds.yMax);
  }
