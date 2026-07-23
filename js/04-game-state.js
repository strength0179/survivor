/* 開局狀態：seed、路線抽取、世界區域、建築藍圖與主 state。 */
  const CORE = window.KuusouCore;
  function entropySeed() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.getRandomValues) { const value = new Uint32Array(1); cryptoApi.getRandomValues(value); return value[0]; }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  }
  const PERSISTENT_SAVE_KEY = "kuusou-survivor-save-v3";
  function storedRunSeed() {
    try {
      const storage = globalThis.localStorage;
      const raw = storage?.getItem(PERSISTENT_SAVE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      return saved?.format === PERSISTENT_SAVE_KEY ? saved.runSeed : null;
    } catch { return null; }
  }
  const RUN_SEED_INPUT = new URLSearchParams(location.search).get("seed");
  const RUN_SEED = CORE.normalizeSeed(RUN_SEED_INPUT ?? storedRunSeed() ?? entropySeed());
  const RUN_RANDOM = CORE.createSeededRandom(RUN_SEED);
  function secureRandomIndex(length) { return Math.floor(RUN_RANDOM() * Math.max(1, length)); }
  function createSurvivorMemory(route) {
    const identity = PLAYER_NAME_POOL[secureRandomIndex(PLAYER_NAME_POOL.length)];
    const memory = SURVIVOR_MEMORY_LIBRARY[route.id] || SURVIVOR_MEMORY_LIBRARY.SECRET_LIAISON;
    const age = 24 + secureRandomIndex(33);
    return {
      ...identity, age, occupation: route.identity, theme: route.theme,
      before: memory.before, originalGoal: memory.originalGoal, choice: memory.choice,
      witnessLine: memory.witnessLines[secureRandomIndex(memory.witnessLines.length)],
      remembered: false, storyTurnTriggered: false
    };
  }
  const ACTIVE_ITEM_ROUTE = ITEM_ROUTES[secureRandomIndex(ITEM_ROUTES.length)];
  const ACTIVE_SURVIVOR_MEMORY = createSurvivorMemory(ACTIVE_ITEM_ROUTE);
  const KEY_ITEM_CHAIN = ACTIVE_ITEM_ROUTE.items.map((item, index) => ({ ...item, identity: index === 0 ? ACTIVE_ITEM_ROUTE.identity : undefined }));
  const KEY_ITEM_TOTAL = KEY_ITEM_CHAIN.length;
  const SCENE_VISUALS = {
    "山麓觀測區": { color: "#a98ad8", glyph: "▲", top: "#30264c", bottom: "#0f0c1b", tileA: "#42385a", tileB: "#352e4d", building: "#6d6382", side: "#4b4562", roof: "#a89bb7" },
    "都市外場": { color: "#62b9ff", glyph: "◇", top: "#183c62", bottom: "#071321", tileA: "#1c4456", tileB: "#17394c", building: "#4f7491", side: "#35556f", roof: "#79a7bd" },
    "都市內場": { color: "#9a8cff", glyph: "▣", top: "#252152", bottom: "#0d0b21", tileA: "#37345e", tileB: "#2b294f", building: "#62588e", side: "#443d6d", roof: "#a99ed0" },
    "工廠外場": { color: "#ffae54", glyph: "△", top: "#50311e", bottom: "#160e08", tileA: "#634226", tileB: "#4d3423", building: "#8e6541", side: "#60452f", roof: "#c69b68" },
    "工廠內場": { color: "#f26e61", glyph: "▥", top: "#4b2027", bottom: "#17090d", tileA: "#69343c", tileB: "#512a34", building: "#9a4c4c", side: "#6d363d", roof: "#d07b68" },
    "醫院外場": { color: "#68e1cf", glyph: "+", top: "#164b4a", bottom: "#071717", tileA: "#245d5d", tileB: "#1d4c50", building: "#5d9993", side: "#3f6f73", roof: "#9cd4ca" },
    "醫院內場": { color: "#bcecff", glyph: "✚", top: "#2b566a", bottom: "#0b1820", tileA: "#437982", tileB: "#365e71", building: "#7aaeb6", side: "#507d8a", roof: "#c1e4df" },
    "海港碼頭": { color: "#5592ff", glyph: "⚓", top: "#17365b", bottom: "#07101f", tileA: "#1c4560", tileB: "#17384f", building: "#4b6c8f", side: "#314c70", roof: "#7a9ebc" },
    "港區倉庫內場": { color: "#6da6d8", glyph: "▤", top: "#1c3851", bottom: "#07101a", tileA: "#284c62", tileB: "#203e54", building: "#58748a", side: "#3b566d", roof: "#8ca9b7" },
    "住宅避難區": { color: "#86d879", glyph: "⌂", top: "#234c34", bottom: "#09170d", tileA: "#315d3d", tileB: "#294d36", building: "#66866d", side: "#47604f", roof: "#9db39d" },
    "電波塔丘陵": { color: "#ef82ba", glyph: "⌁", top: "#4a2342", bottom: "#180917", tileA: "#5b3150", tileB: "#492741", building: "#805a76", side: "#5d3f57", roof: "#b487a2" },
    "地下秘密研究室": { color: "#e08cff", glyph: "◎", top: "#3d1d4d", bottom: "#14091b", tileA: "#523363", tileB: "#40274f", building: "#865a98", side: "#5e3d73", roof: "#c68ed0" }
  };
  const WORLD_BOUNDS = { xMin: -105, xMax: 105, yMin: -75, yMax: 75 };
  const WORLD_REGIONS = [
    { id: "MOUNTAIN", label: "山麓觀測區", scene: "山麓觀測區", xMin: -105, xMax: -35, yMin: -75, yMax: -25 },
    { id: "HOSPITAL", label: "醫療區", scene: "醫院外場", xMin: -35, xMax: 35, yMin: -75, yMax: -25 },
    { id: "RESIDENTIAL", label: "住宅避難區", scene: "住宅避難區", xMin: 35, xMax: 105, yMin: -75, yMax: -25 },
    { id: "FACTORY", label: "工業區", scene: "工廠外場", xMin: -105, xMax: -35, yMin: -25, yMax: 25 },
    { id: "CITY", label: "都市區", scene: "都市外場", xMin: -35, xMax: 35, yMin: -25, yMax: 25 },
    { id: "HARBOR", label: "港灣區", scene: "海港碼頭", xMin: 35, xMax: 105, yMin: -25, yMax: 25 },
    { id: "SIGNAL", label: "電波塔丘陵", scene: "電波塔丘陵", xMin: -105, xMax: 105, yMin: 25, yMax: 75 }
  ];
  const INTERIOR_BOUNDS = { xMin: -15, xMax: 15, yMin: -10, yMax: 10 };
  const ITEM_PICKUP_RADIUS = .9;
  const BUILDING_BLUEPRINTS = [
    { label: "青葉綜合大樓", regionId: "CITY", kind: "URBAN", slot: [-15, -8] },
    { label: "星見研究棟", regionId: "CITY", kind: "LAB", slot: [16, 8] },
    { label: "第三動力廠", regionId: "FACTORY", kind: "FACTORY", slot: [-86, -9] },
    { label: "冷卻設備棟", regionId: "FACTORY", kind: "FACTORY", slot: [-54, 9] },
    { label: "東都醫療棟", regionId: "HOSPITAL", kind: "HOSPITAL", slot: [-16, -57] },
    { label: "臨時救護中心", regionId: "HOSPITAL", kind: "HOSPITAL", slot: [16, -43] },
    { label: "港區第七倉庫", regionId: "HARBOR", kind: "HARBOR", slot: [54, -9] },
    { label: "海關保稅庫", regionId: "HARBOR", kind: "HARBOR", slot: [86, 9] },
    { label: "廢棄商場", regionId: "RESIDENTIAL", kind: "COMMERCIAL", slot: [53, -58] },
    { label: "城南警備所", regionId: "RESIDENTIAL", kind: "CIVIC", slot: [87, -42] },
    { label: "地下換氣塔", regionId: "MOUNTAIN", kind: "LAB", slot: [-70, -50] },
    { label: "廣播塔管理棟", regionId: "SIGNAL", kind: "SIGNAL", slot: [0, 50] }
  ];
  const BUILDING_LABELS = BUILDING_BLUEPRINTS.map((entry) => entry.label);
  const BUILDING_LAYOUT_SEED = secureRandomIndex(0x100000000);
  const WORLD_BUILDINGS = [];
  function regionAtPoint(x, y) {
    return WORLD_REGIONS.find((region) => x >= region.xMin && x <= region.xMax && y >= region.yMin && y <= region.yMax) || WORLD_REGIONS.find((region) => region.id === "CITY");
  }
  function regionById(id) { return WORLD_REGIONS.find((region) => region.id === id) || WORLD_REGIONS.find((region) => region.id === "CITY"); }
  function regionForScene(scene) {
    if (scene === "工廠外場" || scene === "工廠內場") return regionById("FACTORY");
    if (scene === "醫院外場" || scene === "醫院內場") return regionById("HOSPITAL");
    if (scene === "海港碼頭" || scene === "港區倉庫內場") return regionById("HARBOR");
    if (scene === "山麓觀測區" || scene === "地下秘密研究室") return regionById("MOUNTAIN");
    if (scene === "住宅避難區") return regionById("RESIDENTIAL");
    if (scene === "電波塔丘陵") return regionById("SIGNAL");
    return regionById("CITY");
  }
  function visualForWorldPoint(x, y) { return SCENE_VISUALS[regionAtPoint(x, y).scene] || SCENE_VISUALS["都市外場"]; }
  function currentSceneVisual() { return state.areaMode === "OUTDOOR" ? visualForWorldPoint(state.player.x, state.player.y) : (SCENE_VISUALS[state.scene] || SCENE_VISUALS["都市內場"]); }
  const sceneIndex = (scene) => Math.max(0, SCENES.indexOf(scene));
  const stageRank = { NONE: 0, A: 1, B: 2, C: 3 };
  const state = {
    // 所有跨系統資料的單一入口：畫面層只讀寫 state，核心層保存可測試的世界索引。
    core: CORE.createRunCore({ seed: RUN_SEED, maxObjectives: 7 }),
    scene: "都市外場",
    exteriorScene: "都市外場",
    regionId: "CITY",
    areaMode: "OUTDOOR",
    currentBuildingId: null,
    currentEntranceId: null,
    heroStage: "NONE",
    eventInput: {},
    evidence: null,
    orangeUnlocked: false,
    redUnlocked: false,
    formalChase: false,
    dangerLevel: 1,
    freeMinions: 35,
    monsterMinions: 7,
    initialWaveRemaining: 35,
    initialWaveSpawned: 0,
    reentryQueue: 0,
    enemyGenerationValue: 0,
    enemyGenerationFreeApplied: 0,
    enemyGenerationMonsterApplied: 0,
    enemyGenerationRate: .025,
    keyItemsFound: 0,
    keyItemTotal: KEY_ITEM_TOTAL,
    initialSpeedAdjust: 0,
    accelerationAdjust: 0,
    skillCheckAdjust: 0,
    heroLeverAdjust: 0,
    worldTime: 0,
    bossSpeechComplete: false,
    playerIdentity: null,
    playerProfile: { ...ACTIVE_SURVIVOR_MEMORY },
    storyPaused: false,
    storyChapter: null,
    collectedItems: [],
    lastItemReveal: "",
    itemInspectionOpen: false,
    inspectionItemId: null,
    trackingLevel: 0,
    missionExit: null,
    runComplete: false,
    completionPhase: "RESULTS",
    settlement: null,
    sceneObjects: [],
    interaction: { objectId: null, type: null, active: false, waiting: false, phase: null, charge: 0, progress: 0, heroId: null, notice: "" },
    bonusItems: [],
    hiddenBranchItems: 0,
    heroReviveTokens: 0,
    eliteThreatActive: false,
    heroActor: null,
    extraHeroActors: [],
    heroRelations: {},
    handedItemIds: [],
    deliveryHistory: [],
    deliveryCooldown: 0,
    rogueSpawned: false,
    heroDialogueHistory: [],
    dialogueUsedIds: new Set(),
    dialogueUnlockHistory: [],
    routeFlags: { justice: 0, organizationPower: 0, casualty: 0, hiddenBranch: false, routeHint: ACTIVE_ITEM_ROUTE.id },
    routeCombinationKey: "",
    monsterActor: null,
    monsterLevel: 1,
    monsterLevelLastNotified: 1,
    monsterMinionActors: [],
    monsterMinionsReleased: false,
    monsterTransferDueAt: null,
    player: { stamina: 100, focus: 100, max: 100, speed: 0, baseSpeed: 0, moveTime: 0, collapseTime: 0, restTime: 0, maxRecoveryAnchor: null, exhaustionDrainRate: 0, lastMoveX: 0, lastMoveY: 0, exhausted: false, vehicle: "NONE", statusEffects: {}, x: 0, y: 0 },
    camera: { x: 0, y: 0 },
    monsterAnchor: { x: 52, y: -40 },
    heroCandidate: {
      ...ACTIVE_ITEM_ROUTE.candidate, present: false, locatable: false, met: false, awakened: false,
      condition: "ACTIVE", behaviorMode: "WANDER", wanderTimer: 0, rescueCooldown: 0, stuckTime: 0,
      targetX: ACTIVE_ITEM_ROUTE.candidate.x, targetY: ACTIVE_ITEM_ROUTE.candidate.y
    },
    civilians: [],
    civilianSpawnPoints: [],
    civilianSpawnSerial: 0,
    civilianSpawnTimer: 0,
    freeMinionActors: [],
    nextMinionId: 0,
    experienceDrops: [],
    fieldBursts: [],
    floatingTexts: [],
    monsterPowerExperience: 0,
    sceneAnomalies: [],
    dynamicObstacles: [],
    sceneBarrierStates: {},
    sceneActorPositions: {},
    safariChecks: { viewport: false, touch: false, fullscreen: false, gamepad: false },
    gamepadActionHeld: false,
    crowdDensity: 0,
    keys: new Set(),
    touchVector: { x: 0, y: 0 },
    logs: [],
    dialogueIndex: 0,
    lastBurst: null,
    lastCrowdSoundAt: -1,
    activeEntranceId: null,
    audioContext: null,
    transition: false,
    gameOver: false,
    lastTime: performance.now()
  };
