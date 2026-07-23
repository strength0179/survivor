/* 執行環境：DOM／Canvas context、通用工具與完整規格契約。 */
  const $ = (id) => document.getElementById(id);
  const canvas = $("world");
  const ctx = canvas.getContext("2d");
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const bool = (v) => Boolean(v);
  const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  // 完整版規格的唯一執行入口。這些資料不是展示用清單；後面的路線、戰鬥、場景、台詞、存檔與驗收都讀同一份設定。
  const COMPLETION_SPEC = Object.freeze({
    version: "2026-07-22-complete-runtime",
    identityRoutes: ITEM_ROUTES.map((route) => ({ id: route.id, identity: route.identity, itemCount: route.items.length, candidate: route.candidate.id })),
    routeCombinationCount: ROUTE_COMBINATION_TABLE.length,
    regions: WORLD_REGIONS.map((region) => region.id),
    primaryDrawCount: 4,
    candidateLifeRoutes: ["PROTECT", "SEEK_TRUTH", "REJECT_CONTROL"],
    battleMethods: ["MIGHT", "MIST", "ELECTRIC", "SLASH", "FLIGHT", "BEAM", "BARRIER"],
    dialogueEvents: ["SCENE_ENTER", "SCENE_CHANGED", "SCENE_FEATURE", "SCENE_DESTROYED", "CLUE_FOUND", "ITEM_COLLECTED", "ITEM_DELIVERED", "HERO_AWAKEN", "HERO_STAGE", "HERO_DUEL", "HERO_DOWN", "HERO_RETREAT", "MONSTER_LEVEL", "MONSTER_ATTACK", "FORMAL_CHASE", "ROUTE_CLIMAX", "TEAM_FORMED", "ALIEN_SIGNAL", "GIANT_BATTLE", "PREVIEW"],
    factions: ["HERO_AWAKENING", "GIANT_THREAT", "FOUR_HERO_UNIT", "ALIEN_MESSENGER"],
    saveFormat: PERSISTENT_SAVE_KEY
  });
  const ENTITY_CONTRACTS = Object.freeze({
    PLAYER: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    CIVILIAN: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    FREE_MINION: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    MONSTER_MINION: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    HERO_CANDIDATE: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    HERO: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    ROGUE_HERO: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    MONSTER: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    ALIEN_MESSENGER: { className: "ACTOR", required: ["id", "kind", "areaKey", "x", "y"] },
    BUILDING: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] },
    ENTRANCE: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] },
    KEY_ITEM: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] },
    DEVICE: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] },
    SCENE_FEATURE: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] },
    MISSION_EXIT: { className: "OBJECT", required: ["id", "kind", "areaKey", "x", "y"] }
  });
  const CANDIDATE_LIFE_ROUTES = Object.freeze({
    PROTECT: { label: "保護路線", behavior: "GUARD_CROWD", multiplier: 1.05, trigger: "救援與人群優先", ending: "他把最後一道出口留給別人。" },
    SEEK_TRUTH: { label: "追真相路線", behavior: "INVESTIGATE", multiplier: 1.18, trigger: "線索與高難度操作優先", ending: "他帶著沒有人敢寫下的答案離開。" },
    REJECT_CONTROL: { label: "拒絕操控路線", behavior: "BREAK_CONTROL", multiplier: 1.32, trigger: "反派交付、斷電或異文明事件", ending: "他把命令留在地下，自己走向出口。" }
  });
  const ROUTE_FACTION_LIBRARY = Object.freeze({
    HERO_AWAKENING: { label: "英雄覺醒主線", color: "#79edbc", title: "變身者的第一步" },
    GIANT_THREAT: { label: "巨大怪獸戰線", color: "#ff7567", title: "畫面外的巨影" },
    FOUR_HERO_UNIT: { label: "四人聯隊路線", color: "#ffd76e", title: "四個人站成一列" },
    ALIEN_MESSENGER: { label: "外星使者路線", color: "#d49aff", title: "來自座標之外的信使" }
  });
  const BATTLE_METHOD_LIBRARY = Object.freeze({
    MIGHT: { id: "MIGHT_BREAK", label: "重擊破壞", effect: "KNOCKBACK", scene: "BREAK_ROUTE", status: "staggered", color: "#ffd36b" },
    MIST: { id: "MIST_SCREEN", label: "霧幕遮蔽", effect: "SMOKE", scene: "HIDE_ROUTE", status: "blinded", color: "#a6ffe5" },
    ELECTRIC: { id: "ELECTRIC_BIND", label: "電網拘束", effect: "STUN", scene: "POWER_SURGE", status: "stunnedUntil", color: "#8bdcff" },
    SLASH: { id: "SLASH_CUT", label: "切斷封鎖", effect: "CUT_BARRIER", scene: "OPEN_ROUTE", status: "bleeding", color: "#f5f0ff" },
    FLIGHT: { id: "FLIGHT_RESCUE", label: "空中救援", effect: "RESCUE", scene: "EVACUATE", status: "lifted", color: "#d2f6ff" },
    BEAM: { id: "BEAM_OVERLOAD", label: "過載光束", effect: "OVERLOAD", scene: "EXPLOSION", status: "burning", color: "#fff08a" },
    BARRIER: { id: "BARRIER_SHELTER", label: "護壁展開", effect: "PROTECT", scene: "SAFE_ZONE", status: "shielded", color: "#c7b7ff" }
  });
  const SCENE_EVENT_CHAINS = Object.freeze({
    MOUNTAIN: { title: "山麓換氣事故", clue: "被煙塵截斷的座標", climax: "換氣主控啟動後，地下層的第二出口短暫顯形", next: "SIGNAL" },
    HOSPITAL: { title: "白房急救分流", clue: "病歷不存在的傷患", climax: "備援電力讓傷者與核心同時恢復心跳", next: "RESIDENTIAL" },
    RESIDENTIAL: { title: "避難廣播倒數", clue: "廣播裡多出一個名字", climax: "人群流向改變，候選人的逃生路線被照亮", next: "CITY" },
    FACTORY: { title: "第三動力廠超載", clue: "替人形驅動裝置留下的熔斷痕", climax: "毒霧炸開維修通路，也讓怪人的嗅覺鎖定玩家", next: "HARBOR" },
    CITY: { title: "都市監控熄燈", clue: "黑暗裡拉出的隱藏入口", climax: "監控斷電後，主線與隱藏線同時出現在地圖上", next: "HOSPITAL" },
    HARBOR: { title: "第七碼頭墜櫃", clue: "貨櫃內部自行移動的裝甲", climax: "吊臂墜落改變碰撞，迫使所有人改走倉庫內場", next: "FACTORY" },
    SIGNAL: { title: "電波塔相位爆裂", clue: "不屬於這張地圖的回覆", climax: "增幅器爆炸後，外星使者的座標第一次穩定", next: "MOUNTAIN" }
  });
  const DIALOGUE_EVENT_MATRIX = Object.freeze({
    SCENE_ENTER: ["SCENE_ENTER", "FIRST_SIGHT"], SCENE_CHANGED: ["SCENE_ENTER", "ENV_CHANGE"], SCENE_FEATURE: ["ENV_CHANGE", "SCENE_DESTROYED"], SCENE_DESTROYED: ["SCENE_DESTROYED", "ALLY_DOWN"],
    CLUE_FOUND: ["CLUE_FOUND", "HEARS_SECRET"], ITEM_COLLECTED: ["KEY_ITEM", "KEY_VISIBLE", "IDENTITY_REVEAL"], ITEM_DELIVERED: ["PLAYER_CHOICE", "FIRST_PROTECT", "RIVAL_APPEARS"],
    HERO_AWAKEN: ["FIRST_AWAKEN", "FIRST_STANDOFF"], HERO_STAGE: ["POWER_FAIL", "PHASE_3", "SELF_CHOICE"], HERO_DUEL: ["HERO_DUEL", "COUNTERED"], HERO_DOWN: ["ALLY_DOWN", "ALLY_FALL"], HERO_RETREAT: ["POWER_FAIL", "QUIET_WINDOW"],
    MONSTER_LEVEL: ["BOSS_PHASE", "RIVAL_APPEARS"], MONSTER_ATTACK: ["COUNTERED", "FIRST_STANDOFF"], FORMAL_CHASE: ["BOSS_PHASE", "FINAL_STAND"], ROUTE_CLIMAX: ["ROUTE_CLIMAX", "FINAL_STAND"],
    TEAM_FORMED: ["FIRST_PROTECT", "CROWD_CHOICE"], ALIEN_SIGNAL: ["HEARS_SECRET", "MEMORY_REVEAL"], GIANT_BATTLE: ["HERO_DUEL", "FINAL_STAND"], PREVIEW: ["PREVIEW", "ROUTE_CLIMAX"]
  });
  const RUNTIME_DIALOGUE_TEMPLATES = Object.freeze({
    HERO_RETREAT: ["還能走。把最後一點力氣留給出口。", "退後不是認輸，這條路還需要我回來。", "先讓傷口安靜。下一次交手，我會記住它。"],
    TEAM_FORMED: ["四個人站在一起，才像一個還沒寫完的答案。", "別搶主角。把人群帶出去，再決定誰留下。"],
    ALIEN_SIGNAL: ["這個座標沒有地名。它卻知道我們正在看。", "回覆已經穿過來了。不要問它從哪裡，先聽完。"],
    GIANT_BATTLE: ["那不是遠方的爆炸。它正在走過城市。", "看不見全身也沒關係。先讓它知道這裡有人反抗。"],
    SCENE_CHAIN: ["場景會記得每一次改變。人不一定。", "路被改寫了。下一個走進來的人，會以為它本來就是這樣。"]
  });
  const HERO_STAGE_LIBRARY = Object.freeze(Object.fromEntries(Object.keys(HERO_COMBAT_KITS).map((heroId) => {
    const kit = HERO_COMBAT_KITS[heroId];
    return [heroId, { heroId, moves: ["A", "B", "C"].map((stage, index) => ({ ...(kit.moves[index] || { name: stage + "階段專屬技" }), stage, method: kit.style, stageIndex: index, abilityId: heroId + "_" + stage })) }];
  })));
  const ROUTE_PREVIEW_TEMPLATES = Object.freeze(ROUTE_COMBINATION_TABLE.map((combination, index) => {
    const route = ITEM_ROUTES[combination.identitySlot % ITEM_ROUTES.length], region = WORLD_REGIONS[index % WORLD_REGIONS.length], faction = Object.keys(ROUTE_FACTION_LIBRARY)[index % 4], life = COMPLETION_SPEC.candidateLifeRoutes[index % 3];
    return [
      "座標「" + region.label + "」發出第二次回覆。",
      "交付的對象已經改變，" + route.identity + "的記憶開始偏向「" + life + "」。",
      "第二回　" + ROUTE_FACTION_LIBRARY[faction].title + "｜" + combination.id
    ];
  }));
  Object.assign(state, {
    completionSpec: COMPLETION_SPEC,
    routeNodes: {},
    routeOutcome: null,
    candidateLifeRoute: "UNRESOLVED",
    sceneEventChains: {},
    sceneEffectLedger: {},
    dialogueQueue: [],
    dialogueActive: null,
    dialogueActiveUntil: 0,
    spatialIndex: { cellSize: 10, cells: new Map(), ready: false, builtAt: -Infinity, revision: 0 },
    navigationRevision: 0,
    nearbyActorStats: { queried: 0, total: 0, lastBuild: 0 },
    battlefieldWindow: { active: false, title: "", allies: 0, enemies: 0, progress: 0, message: "" },
    giantThreatActive: false,
    giantThreatScale: 1,
    teamRoster: [],
    alienMessengerActive: false,
    alienMessenger: null,
    giantThreatActor: null,
    mapAnimationStep: 0,
    runSceneQuad: [],
    primarySceneDrawCount: 0,
    primaryScenePath: [],
    primaryScenePathCount: 0,
    primarySceneIndex: 0,
    lastPersistentSaveAt: -Infinity,
    saveMeta: { exists: false, savedAt: null },
    fullSpecValidated: false
  });
