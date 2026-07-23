/* 完成系統：保存讀取、路線圖、事件鏈、對話佇列、導航與戰場窗口。 */
  function persistentStorage() {
    try { return globalThis.localStorage || null; } catch { return null; }
  }
  function serializableCopy(value, fallback = null) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }
  function upsertIndexedEntity(store, entity, kind, extra = {}) {
    const contract = ENTITY_CONTRACTS[kind] || { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] };
    const record = { ...entity, ...extra, id: extra.id || entity?.id, kind, entityClass: contract.className, contractVersion: "1.0" };
    const missing = contract.required.filter((key) => record[key] == null);
    if (missing.length) throw new Error(kind + " 缺少欄位：" + missing.join(","));
    return store.upsert(record);
  }
  function entityAreaKey(entity) {
    return entity?.areaKey || (entity?.areaMode === "INTERIOR" ? "INTERIOR:" + entity.buildingId : "OUTDOOR:" + (entity.regionId || state.regionId));
  }
  function validateCompletionSpec() {
    const checks = {
      identityRoutes: ITEM_ROUTES.length === 8 && ITEM_ROUTES.every((route) => route.items.length === 3 && route.candidate?.id),
      sceneRoutes: WORLD_REGIONS.length === 7 && WORLD_REGIONS.every((region) => SCENE_FEATURE_RULES[region.id] && SCENE_EVENT_CHAINS[region.id]),
      primarySceneQuad: state.runSceneQuad?.length === COMPLETION_SPEC.primaryDrawCount && state.primaryScenePathCount >= 3,
      routeCombinations: ROUTE_COMBINATION_TABLE.length === 50 && ROUTE_PREVIEW_TEMPLATES.length === 50,
      candidateLifeRoutes: Object.keys(CANDIDATE_LIFE_ROUTES).length === 3,
      battleMethods: Object.keys(BATTLE_METHOD_LIBRARY).length === 7 && Object.values(HERO_STAGE_LIBRARY).length === 20 && Object.values(HERO_STAGE_LIBRARY).every((entry) => entry.moves.length === 3),
      dialogueCoverage: COMPLETION_SPEC.dialogueEvents.length >= 20,
      entityContracts: Object.keys(ENTITY_CONTRACTS).length >= 15,
      typography: TRAILER_TYPOGRAPHY.length >= 4
    };
    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
    return { ok: failed.length === 0, checks, failed, version: COMPLETION_SPEC.version };
  }
  const TRAILER_TYPOGRAPHY = Object.freeze([
    { className: "vertical vertical-large", writingMode: "vertical-rl", size: 36, weight: 900, label: "直書 36" },
    { className: "large horizontal-large", writingMode: "horizontal-tb", size: 72, weight: 900, label: "橫書 72" },
    { className: "vertical", writingMode: "vertical-rl", size: 36, weight: 900, label: "直書 36" },
    { className: "horizontal-large", writingMode: "horizontal-tb", size: 72, weight: 900, label: "橫書 72" }
  ]);
  function initializeRouteGraph() {
    initializePrimarySceneQuad();
    const nodes = { START: { id: "START", type: "START", status: "ACTIVE", label: "第一回／混亂開始" } };
    KEY_ITEM_CHAIN.forEach((item, index) => { nodes["ITEM:" + item.id] = { id: "ITEM:" + item.id, type: "ITEM", status: index === 0 ? "ACTIVE" : "LOCKED", index, label: item.trueName, scene: item.scene }; });
    nodes.CANDIDATE = { id: "CANDIDATE", type: "CANDIDATE", status: "LOCKED", label: "移動中的候選人" };
    nodes.DELIVERY = { id: "DELIVERY", type: "DELIVERY", status: "LOCKED", label: "交付分歧" };
    nodes.FEATURE = { id: "FEATURE", type: "SCENE_CHAIN", status: "LOCKED", label: "七區場景後果" };
    nodes.AWAKEN = { id: "AWAKEN", type: "AWAKENING", status: "LOCKED", label: "英雄 A 覺醒" };
    nodes.EXIT = { id: "EXIT", type: "EXIT", status: "LOCKED", label: "安全撤離" };
    state.routeNodes = nodes;
    return nodes;
  }
  function initializePrimarySceneQuad() {
    const routeScenes = ["CITY", ...KEY_ITEM_CHAIN.map((item) => regionForScene(item.scene).id), regionForScene(state.heroCandidate.scene).id];
    const ranked = [...new Set(routeScenes)].filter(Boolean);
    WORLD_REGIONS.forEach((region, index) => { if (ranked.length < COMPLETION_SPEC.primaryDrawCount && !ranked.includes(region.id)) ranked.push(region.id); else if (ranked.length < COMPLETION_SPEC.primaryDrawCount) ranked.push(region.id); });
    const primary = ranked.slice(0, COMPLETION_SPEC.primaryDrawCount);
    state.runSceneQuad = primary.map((regionId, index) => ({ index, regionId, status: index === 0 ? "ACTIVE" : "LOCKED", label: regionById(regionId).label, scene: regionById(regionId).scene }));
    state.primarySceneDrawCount = state.runSceneQuad.length;
    state.primaryScenePath = state.runSceneQuad.slice(1).map((node, index) => ({ from: state.runSceneQuad[index].regionId, to: node.regionId, valid: true, distance: Math.max(1, Math.abs(index + 1)) }));
    state.primaryScenePathCount = state.primaryScenePath.length;
    return state.runSceneQuad;
  }
  function advancePrimaryScene(regionId) {
    const entry = state.runSceneQuad?.find((node) => node.regionId === regionId); if (!entry) return false;
    entry.status = "VISITED"; state.primarySceneIndex = Math.max(state.primarySceneIndex || 0, entry.index);
    const next = state.runSceneQuad.find((node) => node.index === entry.index + 1); if (next && next.status === "LOCKED") next.status = "ACTIVE";
    return true;
  }
  function activateRouteNode(id, status = "COMPLETE", payload = {}) {
    const node = state.routeNodes[id] || (state.routeNodes[id] = { id, type: "RUNTIME", status: "LOCKED", label: id });
    node.status = status; node.lastAt = state.worldTime; Object.assign(node, payload);
    if (status === "COMPLETE" && id.startsWith("ITEM:")) {
      const index = Number(node.index);
      const next = KEY_ITEM_CHAIN[index + 1];
      if (next) activateRouteNode("ITEM:" + next.id, "ACTIVE"); else activateRouteNode("CANDIDATE", "ACTIVE");
    }
    return node;
  }
  function advanceRouteNodeForEvent(type, payload = {}) {
    if (type === "ITEM_COLLECTED") activateRouteNode("ITEM:" + payload.itemId, "COMPLETE", payload);
    if (type === "ITEM_DELIVERED") activateRouteNode("DELIVERY", "COMPLETE", payload);
    if (type === "SCENE_FEATURE_COMPLETED") activateRouteNode("FEATURE", "COMPLETE", payload);
    if (type === "HERO_AWAKENED") { activateRouteNode("CANDIDATE", "COMPLETE", payload); activateRouteNode("AWAKEN", "COMPLETE", payload); activateRouteNode("EXIT", "ACTIVE"); }
    if (type === "MISSION_EXIT_OPENED") activateRouteNode("EXIT", "ACTIVE", payload);
    if (type === "RUN_SUCCEEDED") activateRouteNode("EXIT", "COMPLETE", payload);
  }
  function candidateLifeRouteForState() {
    const outcome = state.routeOutcome?.lifeRoute || "PROTECT";
    if (state.deliveryHistory.some((entry) => String(entry.recipientId).startsWith("ROGUE:")) || state.sceneEffectLedger.CITY?.blackout) return "REJECT_CONTROL";
    if (number(state.eventInput?.rescueCount, 0) >= 2) return "PROTECT";
    return outcome === "REJECT_CONTROL" ? "REJECT_CONTROL" : "SEEK_TRUTH";
  }
  function routeFactionForCombination(combination) {
    const index = Math.max(0, ROUTE_COMBINATION_TABLE.indexOf(combination));
    return Object.keys(ROUTE_FACTION_LIBRARY)[index % 4];
  }
  function routeOutcomeForCombination(combination) {
    const index = Math.max(0, ROUTE_COMBINATION_TABLE.indexOf(combination));
    return {
      id: combination.id,
      combinationIndex: index,
      faction: routeFactionForCombination(combination),
      lifeRoute: COMPLETION_SPEC.candidateLifeRoutes[index % 3],
      identityRoute: ITEM_ROUTES[combination.identitySlot % ITEM_ROUTES.length].id,
      sceneId: WORLD_REGIONS[index % WORLD_REGIONS.length].id,
      eventId: "ROUTE_" + String(index + 1).padStart(2, "0"),
      deliverySlot: combination.deliverySlot,
      hint: combination.hint
    };
  }
  function createAlienMessenger(reason = "相位核心回覆") {
    if (state.alienMessenger) return state.alienMessenger;
    const point = findOpenCurrentAreaPoint(state.player.x + 2.4, state.player.y - 1.8, 9700 + state.keyItemsFound);
    state.alienMessenger = { id: "ALIEN-01", kind: "ALIEN_MESSENGER", title: "相位使者", name: "未知回覆者", areaMode: state.areaMode, buildingId: state.currentBuildingId, areaKey: coreSceneKey(), x: point.x, y: point.y, targetX: point.x, targetY: point.y, alive: true, focus: 100, focusMax: 100, stamina: 100, staminaMax: 100, behaviorMode: "OBSERVE", phase: 1, reason };
    state.alienMessengerActive = true;
    upsertIndexedEntity(state.core.actors, state.alienMessenger, "ALIEN_MESSENGER", { areaKey: entityAreaKey(state.alienMessenger) });
    emitCore("ALIEN_MESSENGER_APPEARED", { messengerId: state.alienMessenger.id, reason });
    return state.alienMessenger;
  }
  function ensureTeamRoster() {
    if (state.heroStage === "NONE") return [];
    const team = allHeroActors();
    while (team.length < 4) {
      const profile = nextSupportingHeroProfile();
      if (!profile) break;
      const actor = makeAdditionalHero(profile, { faction: "HERO", point: currentAreaEdgePoint(9800 + team.length), stage: state.heroStage });
      state.extraHeroActors.push(actor); team.push(actor); state.teamRoster.push(actor.id);
    }
    if (team.length >= 4 && !state.teamFormed) { state.teamFormed = true; showNotice("四人聯隊完成：四名英雄開始分工，救援與戰鬥同時進行。 "); emitCore("TEAM_FORMED", { heroIds: team.map((hero) => hero.id) }); }
    return team;
  }
  function applyRouteCombinationOutcome(combination, reason = "route-update") {
    const outcome = routeOutcomeForCombination(combination);
    if (state.routeOutcome?.id === outcome.id && state.routeOutcome?.faction === outcome.faction) return outcome;
    state.routeOutcome = outcome; state.candidateLifeRoute = candidateLifeRouteForState();
    const faction = ROUTE_FACTION_LIBRARY[outcome.faction];
    if (outcome.faction === "GIANT_THREAT") { state.giantThreatActive = true; state.giantThreatScale = 2.15; }
    if (outcome.faction !== "GIANT_THREAT") { state.giantThreatActive = false; state.giantThreatActor = null; }
    if (outcome.faction === "FOUR_HERO_UNIT") { ensureTeamRoster(); }
    if (outcome.faction === "ALIEN_MESSENGER") { state.giantThreatActive = false; if (state.keyItemsFound >= 2 && WORLD_BUILDINGS.length) createAlienMessenger("路線 " + outcome.id + " 的相位回覆"); }
    if (outcome.faction === "HERO_AWAKENING") { state.giantThreatActive = false; state.giantThreatScale = 1; }
    if (state.heroCandidate) { state.heroCandidate.lifeRoute = state.candidateLifeRoute; state.heroCandidate.lifeRouteLabel = CANDIDATE_LIFE_ROUTES[state.candidateLifeRoute]?.label || "未決定"; }
    showNotice("路線分歧：" + faction.label + "｜" + (CANDIDATE_LIFE_ROUTES[state.candidateLifeRoute]?.label || "候選人仍在選擇"));
    emitCore("ROUTE_COMBINATION_ACTIVATED", { ...outcome, reason });
    return outcome;
  }
  function advanceSceneEventChain(regionId, event = "ENTER", payload = {}) {
    const rule = SCENE_EVENT_CHAINS[regionId]; if (!rule) return null;
    const chain = state.sceneEventChains[regionId] || (state.sceneEventChains[regionId] = { regionId, title: rule.title, step: 0, clue: rule.clue, climax: rule.climax, next: rule.next, history: [] });
    const nextStep = event === "FEATURE" || event === "BATTLE" ? Math.max(chain.step, 2) : Math.max(chain.step, 1);
    chain.step = nextStep; chain.lastEvent = event; chain.history.push({ event, at: state.worldTime, payload: serializableCopy(payload, {}) }); chain.history = chain.history.slice(-12);
    if (event === "FEATURE") { activateRouteNode("FEATURE", "COMPLETE", { regionId, action: payload.action }); state.sceneEffectLedger[regionId] = { action: payload.action, climax: rule.climax, appliedAt: state.worldTime }; enqueueDialogueForCoreEvent("SCENE_FEATURE", { actorId: state.heroActor?.id || state.heroCandidate.id, regionId }); }
    if (event === "BATTLE") state.battlefieldWindow.message = rule.climax;
    emitCore("SCENE_CHAIN_PROGRESS", { regionId, step: chain.step, event, title: rule.title, clue: rule.clue });
    return chain;
  }
  function saveSlotLabel() {
    if (!state.saveMeta?.exists) return "尚未保存本局";
    return "已保存：" + new Date(state.saveMeta.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function buildPersistentRun() {
    const sceneRecords = state.core.scenes.snapshot((scene) => serializableCopy(scene, {}));
    return {
      format: PERSISTENT_SAVE_KEY, version: 3, runSeed: RUN_SEED, routeId: ACTIVE_ITEM_ROUTE.id, savedAt: Date.now(),
      phase: state.core.lifecycle.phase, scene: state.scene, exteriorScene: state.exteriorScene, regionId: state.regionId, areaMode: state.areaMode, currentBuildingId: state.currentBuildingId, currentEntranceId: state.currentEntranceId,
      heroStage: state.heroStage, eventInput: state.eventInput, playerIdentity: state.playerIdentity, playerProfile: state.playerProfile, player: state.player, camera: state.camera, worldTime: state.worldTime,
      keyItemsFound: state.keyItemsFound, collectedItems: state.collectedItems, lastItemReveal: state.lastItemReveal, trackingLevel: state.trackingLevel, missionExit: state.missionExit,
      orangeUnlocked: state.orangeUnlocked, redUnlocked: state.redUnlocked, formalChase: state.formalChase, dangerLevel: state.dangerLevel, freeMinions: state.freeMinions, monsterMinions: state.monsterMinions, initialWaveRemaining: state.initialWaveRemaining,
      enemyGenerationValue: state.enemyGenerationValue, enemyGenerationFreeApplied: state.enemyGenerationFreeApplied, enemyGenerationMonsterApplied: state.enemyGenerationMonsterApplied, monsterPowerExperience: state.monsterPowerExperience, monsterLevel: state.monsterLevel,
      heroCandidate: state.heroCandidate, heroActor: state.heroActor, extraHeroActors: state.extraHeroActors, heroRelations: state.heroRelations, handedItemIds: state.handedItemIds, deliveryHistory: state.deliveryHistory, rogueSpawned: state.rogueSpawned,
      sceneObjects: state.sceneObjects, sceneAnomalies: state.sceneAnomalies, dynamicObstacles: state.dynamicObstacles, sceneBarrierStates: state.sceneBarrierStates, sceneActorPositions: state.sceneActorPositions, routeFlags: state.routeFlags, routeCombinationKey: state.routeCombinationKey,
      routeNodes: state.routeNodes, routeOutcome: state.routeOutcome, candidateLifeRoute: state.candidateLifeRoute, sceneEventChains: state.sceneEventChains, sceneEffectLedger: state.sceneEffectLedger, runSceneQuad: state.runSceneQuad, primarySceneIndex: state.primarySceneIndex,
      dialogueUsedIds: [...(state.dialogueUsedIds || [])], dialogueUnlockHistory: state.dialogueUnlockHistory, dialogueQueue: state.dialogueQueue, giantThreatActive: state.giantThreatActive, giantThreatScale: state.giantThreatScale, teamRoster: state.teamRoster,
      alienMessengerActive: state.alienMessengerActive, alienMessenger: state.alienMessenger, giantThreatActor: state.giantThreatActor, coreScenes: sceneRecords
    };
  }
  function savePersistentRun(reason = "manual") {
    if (state.core.lifecycle.phase !== CORE.LIFE.PLAYING || state.runComplete || state.gameOver) return false;
    const storage = persistentStorage(); if (!storage) { state.saveMeta = { exists: false, savedAt: null, unavailable: true }; renderSaveSlotStatus(); return false; }
    try {
      const payload = buildPersistentRun(); storage.setItem(PERSISTENT_SAVE_KEY, JSON.stringify(payload)); state.saveMeta = { exists: true, savedAt: payload.savedAt, reason }; state.lastPersistentSaveAt = state.worldTime; renderSaveSlotStatus(); emitCore("RUN_SAVED", { reason, savedAt: payload.savedAt }); return true;
    } catch (error) { state.saveMeta = { exists: false, savedAt: null, error: String(error?.message || error) }; renderSaveSlotStatus(); return false; }
  }
  function clearPersistentRun() { try { persistentStorage()?.removeItem(PERSISTENT_SAVE_KEY); } catch {} state.saveMeta = { exists: false, savedAt: null }; renderSaveSlotStatus(); }
  function renderSaveSlotStatus() { const node = $("saveSlotStatus"); if (node) node.textContent = state.saveMeta?.unavailable ? "此瀏覽器拒絕本機保存" : saveSlotLabel(); }
  function restorePersistentRun() {
    const storage = persistentStorage(); if (!storage) return false;
    try {
      const raw = storage.getItem(PERSISTENT_SAVE_KEY), payload = raw ? JSON.parse(raw) : null;
      if (!payload || payload.format !== PERSISTENT_SAVE_KEY || payload.runSeed !== RUN_SEED || payload.routeId !== ACTIVE_ITEM_ROUTE.id) return false;
      const copyKeys = ["scene", "exteriorScene", "regionId", "areaMode", "currentBuildingId", "currentEntranceId", "heroStage", "eventInput", "playerIdentity", "playerProfile", "player", "camera", "worldTime", "keyItemsFound", "collectedItems", "lastItemReveal", "trackingLevel", "missionExit", "orangeUnlocked", "redUnlocked", "formalChase", "dangerLevel", "freeMinions", "monsterMinions", "initialWaveRemaining", "enemyGenerationValue", "enemyGenerationFreeApplied", "enemyGenerationMonsterApplied", "monsterPowerExperience", "monsterLevel", "heroCandidate", "heroActor", "extraHeroActors", "heroRelations", "handedItemIds", "deliveryHistory", "rogueSpawned", "sceneObjects", "sceneAnomalies", "dynamicObstacles", "sceneBarrierStates", "sceneActorPositions", "routeFlags", "routeCombinationKey", "routeNodes", "routeOutcome", "candidateLifeRoute", "sceneEventChains", "sceneEffectLedger", "runSceneQuad", "primarySceneIndex", "giantThreatActive", "giantThreatScale", "giantThreatActor", "teamRoster", "alienMessengerActive", "alienMessenger"];
      copyKeys.forEach((key) => { if (payload[key] !== undefined) state[key] = serializableCopy(payload[key], state[key]); });
      state.dialogueUsedIds = new Set(payload.dialogueUsedIds || []); state.dialogueUnlockHistory = serializableCopy(payload.dialogueUnlockHistory, []); state.dialogueQueue = serializableCopy(payload.dialogueQueue, []); state.keys = new Set(); state.touchVector = { x: 0, y: 0 };
      if (payload.coreScenes) Object.entries(payload.coreScenes).forEach(([id, record]) => state.core.scenes.set(id, record));
      state.core.actors.upsert({ id: "PLAYER", kind: "PLAYER", areaKey: coreSceneKey(), x: state.player.x, y: state.player.y });
      if (state.core.lifecycle.phase === CORE.LIFE.BOOT) state.core.lifecycle.move(CORE.LIFE.PLAYING, "save-resume");
      state.transition = false; state.gameOver = false; state.runComplete = false; state.saveMeta = { exists: true, savedAt: payload.savedAt, reason: "resume" }; state.spatialIndex.ready = false;
      updateHeroCandidateAvailability(); syncOutdoorRegion(true); restoreSceneActorPositions(coreSceneKey()); renderSaveSlotStatus(); $("welcome").classList.add("is-hidden"); showNotice("已讀取上一局：場景破壞、角色位置、道具與路線分歧都已恢復。 "); emitCore("RUN_RESUMED", { savedAt: payload.savedAt }); renderAll(); return true;
    } catch { return false; }
  }
  function autoSavePersistentRun() { if (state.worldTime - number(state.lastPersistentSaveAt, -Infinity) >= 2.5) savePersistentRun("auto"); }
  function initializeRuntimeCompletion() {
    initializeRouteGraph();
    Object.keys(SCENE_EVENT_CHAINS).forEach((regionId) => advanceSceneEventChain(regionId, "INIT", {}));
    state.fullSpecValidated = validateCompletionSpec();
    renderSaveSlotStatus();
  }
  function routeCombinationForFlags(flags = state.routeFlags) {
    const lastDelivery = state.deliveryHistory.at(-1)?.recipientId || "KEEP";
    const source = [state.playerIdentity || ACTIVE_ITEM_ROUTE.identity, lastDelivery, state.regionId, state.heroStage, flags.hiddenBranch ? "HIDDEN" : "MAIN"].join("|");
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) hash = (Math.imul(hash, 31) + source.charCodeAt(index)) >>> 0;
    return ROUTE_COMBINATION_TABLE[hash % ROUTE_COMBINATION_TABLE.length];
  }
  function runtimeDialogueFor(actorId, event, type = event) {
    const templates = RUNTIME_DIALOGUE_TEMPLATES[type] || RUNTIME_DIALOGUE_TEMPLATES[event] || RUNTIME_DIALOGUE_TEMPLATES.SCENE_CHAIN;
    const index = Math.abs(String(actorId || "RUNTIME").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) + state.dialogueUnlockHistory.length) % templates.length;
    return { id: "RUNTIME_" + type + "_" + actorId + "_" + state.dialogueUnlockHistory.length, c: actorId, cat: 6, event, text: templates[index], runtime: true };
  }
  function enqueueDialogueForCoreEvent(type, payload = {}) {
    const events = DIALOGUE_EVENT_MATRIX[type]; if (!events || !state.dialogueQueue) return null;
    const ids = [payload.actorId, payload.heroId, payload.sourceId, payload.monsterId, String(payload.recipientId || "").split(":").at(-1), state.heroActor?.id, state.heroCandidate?.id, activeMonsterProfile()?.id]
      .map((id) => String(id || "").replace(/-(ACTOR|EXTRA)$/, "")).filter((id, index, list) => id && list.indexOf(id) === index);
    let line = null, actorId = null;
    for (const id of ids) {
      line = unlockDialogue(id, ...events);
      if (line) { actorId = id; break; }
    }
    if (!line && ids[0] && ["HERO_RETREAT", "TEAM_FORMED", "ALIEN_SIGNAL", "GIANT_BATTLE"].includes(type)) { actorId = ids[0]; line = runtimeDialogueFor(actorId, type, type); }
    if (!line) return null;
    const item = { id: line.id, actorId, event: line.event, text: line.text, cat: line.cat || 6, priority: type === "HERO_DOWN" || type === "GIANT_BATTLE" ? 100 : type === "SCENE_FEATURE" ? 70 : 45, type, queuedAt: state.worldTime };
    if (!state.dialogueQueue.some((entry) => entry.id === item.id)) state.dialogueQueue.push(item);
    state.dialogueQueue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    state.dialogueQueue = state.dialogueQueue.slice(0, 3);
    return item;
  }
  function dequeueDialogue() {
    if (state.worldTime < number(state.dialogueActiveUntil, 0)) return null;
    const next = state.dialogueQueue?.shift?.() || null;
    if (next) state.dialogueActive = next;
    return next;
  }
  function syncRouteFlags(reason = "route-update") {
    const input = state.eventInput || {}, casualties = number(input.casualtyDeaths, 0), rescues = number(input.rescueCount, 0), operations = input.operationSuccess ? 1 : 0;
    const flags = {
      justice: state.keyItemsFound * 12 + rescues * 10 + operations * 14 + number(input.heroLeverCompletions, 0) * 8 + ({ NONE: 0, A: 8, B: 16, C: 30 }[state.heroStage] || 0) + (casualties === 0 ? 10 : 0) + state.hiddenBranchItems * 4,
      organizationPower: casualties * 20 + Math.floor(state.worldTime * .45) + Math.floor(state.monsterPowerExperience * 3) + state.trackingLevel * 3 + (state.eliteThreatActive ? 12 : 0),
      casualty: casualties,
      hiddenBranch: state.hiddenBranchItems > 0,
      routeHint: state.routeFlags?.routeHint || ACTIVE_ITEM_ROUTE.id
    };
    const combination = routeCombinationForFlags(flags);
    const outcome = applyRouteCombinationOutcome(combination, reason);
    flags.routeHint = combination.hint + "｜" + combination.id + "｜" + (ROUTE_FACTION_LIBRARY[outcome.faction]?.label || outcome.faction);
    flags.faction = outcome.faction; flags.lifeRoute = state.candidateLifeRoute;
    const changed = state.routeCombinationKey !== combination.id || state.routeFlags?.justice !== flags.justice || state.routeFlags?.organizationPower !== flags.organizationPower;
    state.routeFlags = flags; state.routeCombinationKey = combination.id;
    if (changed) emitCore("ROUTE_FLAGS_UPDATED", { reason, flags, combination });
    return flags;
  }
  function emitCore(type, payload = {}) {
    const event = state.core.events.emit(type, { seed: RUN_SEED, worldTime: state.worldTime, scene: state.scene, areaMode: state.areaMode, ...payload });
    advanceRouteNodeForEvent(type, payload);
    enqueueDialogueForCoreEvent(type, payload);
    return event;
  }

  // 空間索引、視線與局部導航共用同一份座標資料。角色數量增加時，只查詢玩家附近的格子。
  function spatialCellKey(x, y) {
    const size = state.spatialIndex?.cellSize || 10;
    return Math.floor(Number(x) / size) + ":" + Math.floor(Number(y) / size);
  }
  function spatialEntities() {
    const actors = [state.player, state.heroCandidate, state.heroActor, ...state.extraHeroActors, state.monsterActor, state.giantThreatActor, state.alienMessenger, ...state.civilians, ...state.freeMinionActors, ...state.monsterMinionActors].filter(Boolean);
    const objects = [...WORLD_BUILDINGS, ...state.sceneObjects, ...state.dynamicObstacles, ...KEY_ITEM_CHAIN, state.missionExit].filter(Boolean);
    return [...actors, ...objects].filter((entity) => entity.alive !== false && entity.status !== "DESTROYED");
  }
  function refreshSpatialIndex(force = false) {
    const index = state.spatialIndex;
    if (!index || (!force && index.ready && state.worldTime - index.builtAt < .08 && index.revision === state.navigationRevision)) return index;
    index.cells = new Map(); let total = 0;
    spatialEntities().forEach((entity) => {
      const key = spatialCellKey(entity.x, entity.y), group = index.cells.get(key) || [];
      group.push(entity); index.cells.set(key, group); total += 1;
    });
    index.ready = true; index.builtAt = state.worldTime; index.revision = state.navigationRevision;
    state.nearbyActorStats = { queried: 0, total, lastBuild: state.worldTime };
    return index;
  }
  function nearbySpatialEntities(x, y, range = 10, predicate = null) {
    refreshSpatialIndex();
    const index = state.spatialIndex, size = index.cellSize || 10, minX = Math.floor((x - range) / size), maxX = Math.floor((x + range) / size), minY = Math.floor((y - range) / size), maxY = Math.floor((y + range) / size), result = [];
    for (let cellX = minX; cellX <= maxX; cellX += 1) for (let cellY = minY; cellY <= maxY; cellY += 1) {
      (index.cells.get(cellX + ":" + cellY) || []).forEach((entity) => {
        if (Math.hypot(Number(entity.x) - x, Number(entity.y) - y) <= range && (!predicate || predicate(entity))) result.push(entity);
      });
    }
    state.nearbyActorStats.queried = result.length;
    return result;
  }
  function facingVector(actor) {
    const x = number(actor?.lastMoveX, 0), y = number(actor?.lastMoveY, 0), length = Math.hypot(x, y);
    return length > .001 ? { x: x / length, y: y / length } : null;
  }
  function entityCanSee(observer, target, fovDegrees = 128) {
    if (!observer || !target || observer.areaMode !== target.areaMode || observer.buildingId !== target.buildingId) return false;
    const distance = Math.hypot(target.x - observer.x, target.y - observer.y), sense = number(observer.senseDistance, 12);
    if (distance > sense) return false;
    const facing = facingVector(observer);
    if (facing && distance > 1.1) {
      const dot = (target.x - observer.x) * facing.x / distance + (target.y - observer.y) * facing.y / distance;
      if (dot < Math.cos(fovDegrees * Math.PI / 360)) return false;
    }
    const smoke = activeSceneAnomalies(coreSceneKey()).some((anomaly) => anomaly.type === "SMOKE_ACTIVE" && Math.hypot(observer.x - anomaly.x, observer.y - anomaly.y) <= anomaly.radius);
    if (smoke && distance > sense * .58) return false;
    return hasCurrentAreaLineOfSight(observer, target);
  }
  function navigationGridPath(actor, targetX, targetY) {
    const bounds = currentAreaBounds(), step = state.areaMode === "INTERIOR" ? 1.15 : 2.15, start = { x: clamp(actor.x, bounds.xMin, bounds.xMax), y: clamp(actor.y, bounds.yMin, bounds.yMax) }, goal = { x: clamp(targetX, bounds.xMin, bounds.xMax), y: clamp(targetY, bounds.yMin, bounds.yMax) }, toKey = (x, y) => Math.round(x / step) + ":" + Math.round(y / step), startKey = toKey(start.x, start.y), goalKey = toKey(goal.x, goal.y), queue = [startKey], cameFrom = new Map([[startKey, null]]), points = new Map([[startKey, { x: Math.round(start.x / step) * step, y: Math.round(start.y / step) * step }]]), directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let cursor = 0, reached = startKey;
    while (cursor < queue.length && cursor < 720) {
      const key = queue[cursor++], point = points.get(key);
      if (key === goalKey || Math.hypot(point.x - goal.x, point.y - goal.y) <= step * 1.45) { reached = key; break; }
      directions.forEach(([dx, dy]) => {
        const nx = clamp(point.x + dx * step, bounds.xMin + .2, bounds.xMax - .2), ny = clamp(point.y + dy * step, bounds.yMin + .2, bounds.yMax - .2), nextKey = toKey(nx, ny);
        if (cameFrom.has(nextKey) || (nx === point.x && ny === point.y) || collidesCurrentArea(nx, ny, .16)) return;
        cameFrom.set(nextKey, key); points.set(nextKey, { x: nx, y: ny }); queue.push(nextKey);
        if (Math.hypot(nx - goal.x, ny - goal.y) < Math.hypot(points.get(reached).x - goal.x, points.get(reached).y - goal.y)) reached = nextKey;
      });
    }
    const path = [], seen = new Set(); let cursorKey = reached;
    while (cursorKey && !seen.has(cursorKey) && path.length < 80) { seen.add(cursorKey); path.unshift(points.get(cursorKey)); cursorKey = cameFrom.get(cursorKey); }
    path.push(goal);
    return path.filter((point, index) => index === 0 || Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > .16);
  }
  function nextPathTarget(actor, targetX, targetY) {
    const targetKey = Math.round(targetX * 10) + ":" + Math.round(targetY * 10) + ":" + state.areaMode + ":" + state.currentBuildingId;
    if (actor.pathTargetKey !== targetKey || actor.pathRevision !== state.navigationRevision || !actor.path?.length) {
      actor.path = navigationGridPath(actor, targetX, targetY); actor.pathIndex = 0; actor.pathTargetKey = targetKey; actor.pathRevision = state.navigationRevision;
    }
    while (actor.pathIndex < actor.path.length - 1 && Math.hypot(actor.x - actor.path[actor.pathIndex].x, actor.y - actor.path[actor.pathIndex].y) < .7) actor.pathIndex += 1;
    return actor.path[actor.pathIndex] || { x: targetX, y: targetY };
  }
  function applyHeroBattleMethod(hero, move, target) {
    const method = BATTLE_METHOD_LIBRARY[move?.style] || BATTLE_METHOD_LIBRARY.MIGHT;
    if (!hero || !target || !method) return null;
    const targetDistance = Math.max(.01, Math.hypot(target.x - hero.x, target.y - hero.y));
    if (method.effect === "KNOCKBACK") {
      const point = findOpenCurrentAreaPoint(target.x + (target.x - hero.x) / targetDistance * .9, target.y + (target.y - hero.y) / targetDistance * .9, 8900 + move.rank);
      target.x = point.x; target.y = point.y; setStatus(target, "offBalanceUntil", .7);
    } else if (method.effect === "SMOKE") {
      createSceneAnomaly("SMOKE_ACTIVE", { areaKey: coreSceneKey(), x: target.x, y: target.y, radius: 2.4 + move.rank * .4, duration: 5.5, color: method.color, label: method.label });
      setStatus(target, "blindedUntil", 2.2);
    } else if (method.effect === "STUN") setStatus(target, "stunnedUntil", .85 + move.rank * .25);
    else if (method.effect === "CUT_BARRIER") { removeSceneBarrier(state.regionId); state.navigationRevision += 1; }
    else if (method.effect === "RESCUE") {
      const rescue = findNearestInjuredCivilian(hero, 8); if (rescue) assistCivilian(hero, rescue.civilian, "空中救援");
      target.x = clamp(target.x, currentAreaBounds().xMin, currentAreaBounds().xMax); target.y = clamp(target.y, currentAreaBounds().yMin, currentAreaBounds().yMax);
    } else if (method.effect === "OVERLOAD") {
      createSceneAnomaly("EXPLODED", { areaKey: coreSceneKey(), x: target.x, y: target.y, radius: 2.5, duration: 4.5, color: method.color, label: method.label });
      damageSceneObjectsNear(target.x, target.y, move.area + 1, "英雄光束");
    } else if (method.effect === "PROTECT") {
      setStatus(hero, "shieldedUntil", 2.2); hero.stamina = Math.min(hero.staminaMax, hero.stamina + 8 + move.rank * 3);
      nearbySpatialEntities(hero.x, hero.y, 3.2, (entity) => entity.alive !== false && (entity === state.player || isEntityInCurrentArea(entity))).forEach((entity) => { if (entity.stamina != null) entity.stamina = Math.min(entity.staminaMax || entity.max || 100, entity.stamina + 4); });
    }
    state.battlefieldWindow = { ...state.battlefieldWindow, active: true, title: method.label, progress: clamp((state.monsterActor?.stamina || 0) / Math.max(1, state.monsterActor?.staminaMax || 1), 0, 1), message: method.label + "：" + (SCENE_EVENT_CHAINS[state.regionId]?.climax || "戰場狀態已改變") };
    state.lastBattleMethod = { method: move.style, methodId: method.id, label: method.label, at: state.worldTime, heroId: hero.id, targetId: target.id || "PLAYER" };
    advanceSceneEventChain(state.regionId, "BATTLE", { method: move.style, targetId: target.id || "PLAYER" });
    emitCore("HERO_BATTLE_METHOD", { heroId: hero.id, targetId: target.id || "PLAYER", method: move.style, methodId: method.id, label: method.label });
    return method;
  }
  function updateBattlefieldWindow() {
    const heroes = allHeroActors().filter((hero) => heroActorInCurrentArea(hero)), enemies = currentHeroThreats().filter((threat) => threat.alive !== false), active = Boolean(state.giantThreatActive || heroes.length && enemies.length);
    state.battlefieldWindow.active = active;
    state.battlefieldWindow.allies = heroes.length;
    state.battlefieldWindow.enemies = enemies.length + (state.giantThreatActive ? 1 : 0);
    state.battlefieldWindow.progress = clamp((state.monsterActor?.stamina || 0) / Math.max(1, state.monsterActor?.staminaMax || 1), 0, 1);
    if (state.giantThreatActive && !state.battlefieldWindow.message) state.battlefieldWindow.message = "巨影正在城市外圍移動；畫面只顯示可感知的局部戰況。";
  }
  function renderBattlefieldWindow() {
    const node = $("battlefieldWindow"), battle = state.battlefieldWindow;
    if (!node) return;
    node.classList.toggle("active", Boolean(battle?.active));
    node.innerHTML = battle?.active ? "<strong>戰場窗口｜" + escapeHtml(battle.title || "局部戰況") + "</strong>　友方 " + battle.allies + "／敵方 " + battle.enemies + "<br>" + escapeHtml(battle.message || "視線內的攻擊與撤退會同步計算。") : "";
  }
  function updateAlienMessenger(dt) {
    const alien = state.alienMessenger; if (!alien || !state.alienMessengerActive) return;
    if (alien.areaMode !== state.areaMode || alien.buildingId !== state.currentBuildingId) { alien.areaMode = state.areaMode; alien.buildingId = state.currentBuildingId; alien.areaKey = coreSceneKey(); const point = currentAreaEdgePoint(9700 + Math.floor(state.worldTime)); alien.x = point.x; alien.y = point.y; }
    alien.phase += dt * .7; const target = { x: state.player.x + Math.cos(alien.phase) * 2.4, y: state.player.y + Math.sin(alien.phase) * 2.4 };
    moveFlyingActor(alien, target.x, target.y, .58, dt); upsertIndexedEntity(state.core.actors, alien, "ALIEN_MESSENGER", { areaKey: coreSceneKey(), phase: alien.phase });
  }
  function ensureGiantThreat() {
    if (!state.giantThreatActive || state.giantThreatActor) return state.giantThreatActor;
    const point = currentAreaEdgePoint(9900);
    state.giantThreatActor = { id: "GIANT-01", kind: "MONSTER", title: "畫面外的巨影", name: "巨型異常體", x: point.x, y: point.y, targetX: state.player.x, targetY: state.player.y, areaMode: state.areaMode, buildingId: state.currentBuildingId, alive: true, stamina: 640, staminaMax: 640, focus: 180, focusMax: 180, level: 6, attackMode: "PRESSURE", statusEffects: {} };
    upsertIndexedEntity(state.core.actors, state.giantThreatActor, "MONSTER", { areaKey: coreSceneKey() });
    enqueueDialogueForCoreEvent("GIANT_BATTLE", { actorId: state.giantThreatActor.id });
    return state.giantThreatActor;
  }
  function updateCompletionRuntime(dt) {
    refreshSpatialIndex(true);
    if (state.routeOutcome?.faction === "FOUR_HERO_UNIT" && state.heroStage !== "NONE") ensureTeamRoster();
    if (state.routeOutcome?.faction === "ALIEN_MESSENGER" && state.keyItemsFound >= 2 && !state.alienMessenger) createAlienMessenger("路線條件已滿足");
    if (state.giantThreatActive) {
      const giant = ensureGiantThreat();
      if (giant && (giant.areaMode !== state.areaMode || giant.buildingId !== state.currentBuildingId)) { const point = currentAreaEdgePoint(9900 + Math.floor(state.worldTime)); giant.x = point.x; giant.y = point.y; giant.areaMode = state.areaMode; giant.buildingId = state.currentBuildingId; giant.areaKey = coreSceneKey(); }
    } else state.giantThreatActor = null;
    updateAlienMessenger(dt); updateBattlefieldWindow();
    if (state.heroCandidate) { state.candidateLifeRoute = candidateLifeRouteForState(); state.heroCandidate.lifeRoute = state.candidateLifeRoute; }
    if (state.sceneEffectLedger[state.regionId]?.action) state.sceneEffectLedger[state.regionId].lastTick = state.worldTime;
  }
