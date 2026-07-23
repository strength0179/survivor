/* 場景互動：靠近、專注操作、英雄桿、維持裝置、場景破壞與完成結果。 */
  function currentKeyItem() {
    return KEY_ITEM_CHAIN[state.keyItemsFound] || null;
  }

  function playerWorldDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function showNotice(text) {
    const toast = $("itemRevealToast");
    toast.textContent = text; toast.classList.add("active");
    window.clearTimeout(state.itemRevealTimer);
    state.itemRevealTimer = window.setTimeout(() => toast.classList.remove("active"), 3600);
  }

  function currentSceneObjects() { return state.sceneObjects.filter((object) => object.areaKey === coreSceneKey()); }
  function sceneObjectById(id) { return state.sceneObjects.find((object) => object.id === id) || null; }
  function activeInteractionObject() { return sceneObjectById(state.interaction.objectId); }
  function nearestSceneObject(includeCompleted = false) {
    let best = null, bestDistance = INTERACTION_RULES.radius;
    currentSceneObjects().forEach((object) => {
      if (object.status === "DESTROYED" || (!includeCompleted && object.status === "COMPLETE")) return;
      const distance = playerWorldDistance(state.player, object);
      if (distance <= bestDistance) { best = object; bestDistance = distance; }
    });
    return best;
  }

  function syncSceneObject(object, reason = "updated") {
    if (!object) return;
    state.core.objects.upsert({ id: object.id, kind: object.kind, name: object.name, areaKey: object.areaKey, x: object.x, y: object.y, status: object.status, interactionType: object.interactionType, partIndex: object.partIndex, progress: object.progress, stableProgress: object.stableProgress, maintenanceProgress: object.maintenanceProgress, parts: object.parts.map((part) => ({ ...part })), vehicleKind: object.vehicleKind, destroyedBy: object.destroyedBy || null });
    const scene = state.core.scenes.ensure(object.areaKey, () => ({ id: object.areaKey, destroyed: [], objects: {} }));
    scene.objects = scene.objects || {}; scene.destroyed = scene.destroyed || []; scene.objects[object.id] = { status: object.status, partIndex: object.partIndex, progress: object.progress, stableProgress: object.stableProgress, maintenanceProgress: object.maintenanceProgress, vehicleKind: object.vehicleKind, destroyedBy: object.destroyedBy || null, reason };
    if (object.status === "DESTROYED" && !scene.destroyed.includes(object.id)) scene.destroyed.push(object.id);
    emitCore("SCENE_OBJECT_" + String(reason).toUpperCase().replace(/[^A-Z0-9]+/g, "_"), { objectId: object.id, kind: object.kind, status: object.status, areaKey: object.areaKey });
  }

  function interactionRate(kind) {
    const adjustment = kind === "HERO_LEVER" ? state.heroLeverAdjust : state.skillCheckAdjust;
    const base = kind === "HERO_LEVER" ? INTERACTION_RULES.heroLeverRate : INTERACTION_RULES.standardRate;
    return base * clamp(1 + adjustment / 100, .5, 1.5);
  }

  function heroAvailableForLever(object) {
    // 英雄桿不再只認主角身邊的第一名英雄；任何同區、未交戰、力量類型對應的友方英雄皆可協助。
    const allies = allHeroActors().filter((hero) => hero.faction === "HERO" && heroActorInCurrentArea(hero));
    if (!allies.length) return { ok: false, reason: "附近沒有已覺醒的英雄" };
    const nearby = allies.filter((hero) => Math.hypot(hero.x - object.x, hero.y - object.y) <= 2.15);
    if (!nearby.length) return { ok: false, reason: "先把英雄帶到英雄桿旁邊" };
    const available = nearby.filter((hero) => {
      if (hero.attackCooldown > .05 || /HUNT|FIGHT|SEEK|BERSERK|RESCUE|ROGUE/.test(hero.behaviorMode || "")) return false;
      const style = (HERO_COMBAT_KITS[hero.id] || HERO_COMBAT_KITS.H01).style;
      return !object.heroRequirement?.length || object.heroRequirement.includes(style);
    });
    if (!available.length) {
      const matchingStyle = nearby.some((hero) => object.heroRequirement?.includes((HERO_COMBAT_KITS[hero.id] || HERO_COMBAT_KITS.H01).style));
      return { ok: false, reason: matchingStyle ? "英雄正在交戰或救助，無法分神" : "此英雄桿需要「" + object.heroRequirement.join("／") + "」類力量" };
    }
    available.sort((a, b) => Math.hypot(a.x - object.x, a.y - object.y) - Math.hypot(b.x - object.x, b.y - object.y));
    return { ok: true, hero: available[0] };
  }

  function interactionText(object, interaction = state.interaction) {
    if (!object) return { name: "", description: "", button: "調查", percent: 0 };
    if (object.interactionType === "HERO_LEVER") {
      if (!object.challengeSeen) return { name: object.name, description: "看起來和普通控制桿沒有差別。先試著拉動。", button: "嘗試", percent: 0 };
      if (interaction.objectId === object.id) {
        const phase = interaction.waiting ? "兩人的專注都要回滿，才會自動繼續" : interaction.phase === "CHARGE" ? "先維持 75 點穩定輸出" : "穩定進度 " + Math.round(object.progress) + "／" + INTERACTION_RULES.heroLeverProgress;
        return { name: object.name + "｜英雄協助", description: phase, button: "中斷", percent: object.progress / INTERACTION_RULES.heroLeverProgress * 100 };
      }
      const availability = heroAvailableForLever(object);
      return { name: object.name, description: availability.ok ? "英雄在旁，可共同維持穩定輸出。" : availability.reason, button: availability.ok ? "請求協助" : "觀察", percent: object.progress / INTERACTION_RULES.heroLeverProgress * 100 };
    }
    if (object.interactionType === "SUSTAINED") {
      const stable = Math.max(0, number(object.stableProgress, 0)), stableRequired = Math.max(1, number(object.stableRequired, INTERACTION_RULES.sustainedStableRequired));
      const progress = Math.max(0, number(object.maintenanceProgress, 0)), progressRequired = Math.max(1, number(object.maintenanceRequired, INTERACTION_RULES.sustainedProgressRequired));
      if (interaction.objectId === object.id) {
        const phase = interaction.waiting ? "專注不足，回復後會從目前軌道續行" : interaction.phase === "STABILIZE" ? "穩定值 " + Math.round(stable) + "／" + stableRequired : "維持進度 " + Math.round(progress) + "／" + progressRequired;
        return { name: object.name + "｜雙軌操作", description: phase, button: "中斷", percent: stable / stableRequired * 38 + progress / progressRequired * 62 };
      }
      return { name: object.name, description: "先灌入 " + stableRequired + " 點穩定值，再持續消耗專注推進 " + progressRequired + " 點進度。", button: "啟動", percent: stable / stableRequired * 38 + progress / progressRequired * 62 };
    }
    const part = object.parts[object.partIndex] || object.parts.at(-1), total = object.parts.length * object.requiredFocus, current = object.parts.reduce((sum, entry) => sum + entry.progress, 0);
    if (interaction.objectId === object.id) {
      const text = interaction.waiting ? "專注必須先完全回滿，灌注會自動續行。" : "正在灌注專注；移動可中斷並保留進度。";
      return { name: object.name, description: text, button: "中斷", percent: current / total * 100 };
    }
    return { name: object.name, description: object.parts.length > 1 ? "模組 " + (object.partIndex + 1) + "／" + object.parts.length + "｜" + object.note : "需灌注 " + object.requiredFocus + " 專注｜" + object.note, button: "操作", percent: current / total * 100 };
  }

  function renderInteractionHud() {
    const active = activeInteractionObject();
    const object = active && active.areaKey === coreSceneKey() ? active : nearestSceneObject();
    const hud = $("interactionHud");
    if (!state.core.lifecycle.canUpdate || !object) { hud.classList.add("is-hidden"); return; }
    const view = interactionText(object);
    $("interactionName").textContent = view.name; $("interactionDescription").textContent = view.description; $("interactionButton").textContent = view.button;
    $("interactionProgress").style.width = clamp(view.percent, 0, 100) + "%";
    hud.classList.remove("is-hidden");
  }

  function clearInteraction() {
    const previous = state.interaction;
    const assistingHero = actorFromHeroId(previous.heroId);
    if (assistingHero) { assistingHero.assistObjectId = null; assistingHero.assisting = false; }
    state.interaction = { objectId: null, type: null, active: false, waiting: false, phase: null, resumePhase: null, charge: 0, progress: 0, stable: 0, maintenanceProgress: 0, heroId: null, notice: "" };
  }

  function interruptCurrentInteraction(reason = "玩家離開裝置") {
    const object = activeInteractionObject();
    if (!object) return false;
    if (object.status !== "DESTROYED" && object.status !== "COMPLETE") object.status = "PARTIAL";
    syncSceneObject(object, "interrupted");
    clearInteraction();
    if (reason) showNotice(reason + "；進度保留。 ");
    return true;
  }

  function applySceneObjectCompletion(object) {
    object.status = "COMPLETE";
    const next = { ...state.eventInput };
    next.clueCount = Math.min(6, number(next.clueCount, 0) + number(object.clue, 0));
    if (object.effect === "CHASE_CLUE") next.chaseClueFound = true;
    if (object.effect === "OPERATION") { next.operationSuccess = true; next.secondKeyEvent = true; }
    if (object.effect === "RESCUE") { next.rescueCount = Math.min(3, number(next.rescueCount, 0) + 1); next.secondKeyEvent = true; }
    if (object.effect === "RARE") { next.rareKeyItem = true; next.operationSuccess = true; }
    if (object.effect === "SUSTAINED_RELAY") { next.operationSuccess = true; next.secondKeyEvent = true; }
    state.eventInput = next;
    if (object.vehicleKind) {
      state.player.vehicle = VEHICLE_RULES[object.vehicleKind] ? object.vehicleKind : "NONE";
      showNotice(object.name + "完成：取得" + VEHICLE_RULES[state.player.vehicle].label + "，移動速度與體力消耗已更新。 ");
      emitCore("VEHICLE_EQUIPPED", { vehicle: state.player.vehicle, objectId: object.id, areaKey: object.areaKey });
    }
    if (object.specialAction) applySceneFeature(object);
    if (object.tracking > 0) { state.trackingLevel = clamp(state.trackingLevel + object.tracking, 0, 9); if (state.areaMode === "INTERIOR") scheduleTrackingMinions(currentInterior(), object.tracking); }
    addFloatingText(object.x, object.y, "設施已啟動", "#7beff0", 1.25, 12);
    showNotice(object.name + "完成。" + object.note);
    syncSceneObject(object, "completed");
    emitCore("SCENE_OBJECT_COMPLETED", { objectId: object.id, effect: object.effect, clue: object.clue });
    clearInteraction();
    syncChain(object.name + "的結果已寫入事件鏈");
  }

  function resolveHeroLeverOutcome(object) {
    const value = state.core.random();
    const outcome = value < 1 / 7 ? "UNBEATABLE_VILLAIN" : value < 4 / 7 ? "POWERFUL_ITEM_OR_TRANSFORM_KEY" : value < 5 / 7 ? "HERO_REVIVAL_ITEM" : "HIDDEN_BRANCH_ITEM";
    object.reward = outcome;
    if (outcome === "UNBEATABLE_VILLAIN") {
      state.eliteThreatActive = true; state.redUnlocked = true; setDangerLevel(4); startMonsterStandoff();
    } else if (outcome === "POWERFUL_ITEM_OR_TRANSFORM_KEY") {
      state.bonusItems.push({ id: object.id + "-POWER", name: "強化覺醒媒介", outcome });
      state.eventInput = { ...state.eventInput, rareKeyItem: true, clueCount: Math.min(6, number(state.eventInput.clueCount, 0) + 1) };
      spawnSupportingHero("英雄桿釋放出的強化媒介");
    } else if (outcome === "HERO_REVIVAL_ITEM") {
      state.heroReviveTokens += 1;
      const roster = [state.heroActor, ...state.extraHeroActors].filter(Boolean);
      const downed = roster.find((hero) => hero.alive === false);
      if (downed) {
        downed.alive = true; downed.downAt = null; downed.stamina = Math.ceil(downed.staminaMax * .7); downed.focus = downed.focusMax;
        placeHeroNearPlayer(downed, 2390 + state.heroReviveTokens);
        addFloatingText(downed.x, downed.y, downed.title + "復歸", "#ffe696", 1.45, 13);
      } else roster.forEach((hero) => { hero.stamina = hero.staminaMax; hero.focus = hero.focusMax; });
    } else {
      state.hiddenBranchItems += 1;
      state.bonusItems.push({ id: object.id + "-HIDDEN", name: "隱藏分歧記錄", outcome });
      state.eventInput = { ...state.eventInput, secondKeyEvent: true };
    }
    addFloatingText(object.x, object.y, HERO_LEVER_OUTCOME_TEXT[outcome].split("：", 1)[0], "#ffdf78", 1.65, 12);
    showNotice(HERO_LEVER_OUTCOME_TEXT[outcome]);
    return outcome;
  }

  function completeHeroLever(object) {
    object.status = "COMPLETE";
    state.eventInput = { ...state.eventInput, heroLeverCompletions: Math.min(3, number(state.eventInput.heroLeverCompletions, 0) + 1), operationSuccess: true };
    if (object.tracking > 0) { state.trackingLevel = clamp(state.trackingLevel + object.tracking, 0, 9); if (state.areaMode === "INTERIOR") scheduleTrackingMinions(currentInterior(), object.tracking); }
    const outcome = resolveHeroLeverOutcome(object);
    syncSceneObject(object, "completed");
    emitCore("HERO_LEVER_COMPLETED", { objectId: object.id, outcome });
    clearInteraction();
    syncChain("英雄桿完成：" + HERO_LEVER_OUTCOME_TEXT[outcome]);
  }

  function beginStandardInteraction(object) {
    object.status = "ACTIVE";
    const sustained = object.interactionType === "SUSTAINED";
    state.interaction = { objectId: object.id, type: sustained ? "SUSTAINED" : "STANDARD", active: true, waiting: false, phase: sustained ? (number(object.stableProgress, 0) >= number(object.stableRequired, INTERACTION_RULES.sustainedStableRequired) ? "MAINTAIN" : "STABILIZE") : "INJECT", resumePhase: null, charge: 0, progress: 0, stable: number(object.stableProgress, 0), maintenanceProgress: number(object.maintenanceProgress, 0), heroId: null, notice: "" };
    syncSceneObject(object, "started");
    showNotice(sustained ? "開始雙軌操作「" + object.name + "」：先穩定，再維持。中斷後兩條進度都會保留。 " : "開始操作「" + object.name + "」。灌注期間不能移動；中斷後可從目前進度再來。 ");
  }

  function beginHeroLeverInteraction(object, hero) {
    const charge = INTERACTION_RULES.heroLeverCharge * clamp(1 + state.heroLeverAdjust / 100, .5, 1.5);
    object.status = "ACTIVE";
    state.interaction = { objectId: object.id, type: "HERO_LEVER", active: true, waiting: false, phase: "CHARGE", charge: 0, chargeRequired: charge, progress: object.progress || 0, heroId: hero.id, notice: "" };
    hero.assistObjectId = object.id; hero.assisting = true;
    syncSceneObject(object, "started");
    showNotice(hero.title + "開始協助英雄桿：先共同灌入 " + Math.round(charge) + " 點穩定值。 ");
  }

  function attemptSceneInteraction() {
    const active = activeInteractionObject();
    if (active) return interruptCurrentInteraction("手動中斷操作");
    const object = nearestSceneObject();
    if (!object) return false;
    if (object.interactionType !== "HERO_LEVER") { beginStandardInteraction(object); return true; }
    if (!object.challengeSeen) {
      const cost = 1 + Math.floor(state.core.random() * 10);
      if (state.player.focus < cost) { showNotice("你連試拉它的力氣都不夠了。先恢復專注。 "); return false; }
      state.player.focus -= cost; object.challengeSeen = true; object.status = "DISCOVERED"; syncSceneObject(object, "discovered");
      showNotice("你試著拉動英雄桿，專注消耗 " + cost + "。它完全不動……看來需要能對應這股力量的英雄。 ");
      addFloatingText(object.x, object.y, "需要英雄協助", "#ffd76e", 1.45, 11);
      return true;
    }
    const available = heroAvailableForLever(object);
    if (!available.ok) { showNotice(available.reason + "。 "); return false; }
    beginHeroLeverInteraction(object, available.hero);
    return true;
  }

  function updateSceneInteraction(dt) {
    const interaction = state.interaction, object = activeInteractionObject();
    if (!object || !interaction.active && !interaction.waiting) return;
    if (object.areaKey !== coreSceneKey() || object.status === "DESTROYED") { interruptCurrentInteraction("裝置已失去反應"); return; }
    if (interaction.type === "SUSTAINED") {
      if (interaction.waiting) {
        const resumeAt = interaction.resumePhase === "MAINTAIN" ? Math.max(12, number(object.maintenanceFocusPerSecond, INTERACTION_RULES.sustainedFocusPerSecond)) : state.player.max - .001;
        if (state.player.focus >= resumeAt) { interaction.waiting = false; interaction.active = true; interaction.phase = interaction.resumePhase || "STABILIZE"; interaction.resumePhase = null; object.status = "ACTIVE"; showNotice(interaction.phase === "MAINTAIN" ? "專注回復，持續維持裝置續行。 " : "專注已回滿，繼續灌入穩定值。 "); }
        else return;
      }
      const stableRequired = Math.max(1, number(object.stableRequired, INTERACTION_RULES.sustainedStableRequired));
      const progressRequired = Math.max(1, number(object.maintenanceRequired, INTERACTION_RULES.sustainedProgressRequired));
      if (interaction.phase === "STABILIZE") {
        const amount = Math.min(state.player.focus, interactionRate("STANDARD") * dt, stableRequired - number(object.stableProgress, 0));
        state.player.focus = Math.max(0, state.player.focus - amount); object.stableProgress = Math.min(stableRequired, number(object.stableProgress, 0) + amount); interaction.stable = object.stableProgress;
        if (object.stableProgress >= stableRequired - .001) { object.stableProgress = stableRequired; interaction.phase = "MAINTAIN"; showNotice("穩定值已建立；接下來會持續消耗專注推進第二條進度。 "); }
        if (state.player.focus <= .001 && object.stableProgress < stableRequired - .001) { interaction.active = false; interaction.waiting = true; interaction.resumePhase = "STABILIZE"; interaction.phase = "WAITING"; object.status = "PARTIAL"; showNotice("穩定值灌注暫停；專注回滿後會續行。 "); }
        syncSceneObject(object, state.player.focus <= .001 ? "waiting" : "progressed");
        return;
      }
      const focusCost = Math.min(state.player.focus, number(object.maintenanceFocusPerSecond, INTERACTION_RULES.sustainedFocusPerSecond) * dt);
      const progressed = Math.min(progressRequired - number(object.maintenanceProgress, 0), focusCost * (INTERACTION_RULES.sustainedProgressRate / Math.max(.001, number(object.maintenanceFocusPerSecond, INTERACTION_RULES.sustainedFocusPerSecond))));
      state.player.focus = Math.max(0, state.player.focus - focusCost); object.maintenanceProgress = Math.min(progressRequired, number(object.maintenanceProgress, 0) + progressed); interaction.maintenanceProgress = object.maintenanceProgress;
      if (object.maintenanceProgress >= progressRequired - .001) { object.maintenanceProgress = progressRequired; applySceneObjectCompletion(object); return; }
      if (state.player.focus <= .001) { interaction.active = false; interaction.waiting = true; interaction.resumePhase = "MAINTAIN"; interaction.phase = "WAITING"; object.status = "PARTIAL"; showNotice("維持用專注耗盡；回復後會從目前維持進度續行。 "); }
      syncSceneObject(object, state.player.focus <= .001 ? "waiting" : "progressed");
      return;
    }
    if (interaction.type === "STANDARD") {
      if (interaction.waiting) {
        if (state.player.focus >= state.player.max - .001) { interaction.waiting = false; interaction.active = true; interaction.phase = "INJECT"; object.status = "ACTIVE"; showNotice("專注已回滿，繼續灌注。 "); }
        else return;
      }
      const part = object.parts[object.partIndex];
      if (!part) { applySceneObjectCompletion(object); return; }
      const amount = Math.min(state.player.focus, interactionRate("STANDARD") * dt, object.requiredFocus - part.progress);
      state.player.focus = Math.max(0, state.player.focus - amount); part.progress += amount;
      if (part.progress >= object.requiredFocus - .001) {
        part.progress = object.requiredFocus; object.partIndex += 1;
        if (object.partIndex >= object.parts.length) { applySceneObjectCompletion(object); return; }
        object.status = "PARTIAL"; interaction.active = false; interaction.waiting = true; interaction.phase = "WAITING"; showNotice(object.name + "模組 " + object.partIndex + " 完成；下一模組需等專注回滿。 "); syncSceneObject(object, "part-complete"); return;
      }
      if (state.player.focus <= .001) { state.player.focus = 0; object.status = "PARTIAL"; interaction.active = false; interaction.waiting = true; interaction.phase = "WAITING"; showNotice("專注耗盡；必須先完全回滿才能續行。 "); syncSceneObject(object, "waiting"); }
      return;
    }
    const hero = actorFromHeroId(interaction.heroId);
    if (!hero || hero.areaMode !== state.areaMode || hero.buildingId !== state.currentBuildingId || hero.alive === false) { interruptCurrentInteraction("英雄無法感知你的位置"); return; }
    if (interaction.waiting) {
      if (state.player.focus >= state.player.max - .001 && hero.focus >= hero.focusMax - .001) { interaction.waiting = false; interaction.active = true; interaction.phase = "CHARGE"; interaction.charge = 0; object.status = "ACTIVE"; showNotice("兩人的專注回滿，重新建立英雄桿穩定值。 "); }
      else return;
    }
    if (Math.hypot(hero.x - object.x, hero.y - object.y) > 1.08) return;
    if (hero.attackCooldown > .05) { interruptCurrentInteraction("英雄被戰鬥打斷，穩定值歸零"); return; }
    let availableFocus = Math.min(state.player.focus, hero.focus, interactionRate("HERO_LEVER") * dt), amount = 0;
    if (interaction.phase === "CHARGE") {
      const charged = Math.min(availableFocus, Math.max(0, interaction.chargeRequired - interaction.charge));
      interaction.charge += charged; availableFocus -= charged; amount += charged;
      if (interaction.charge >= interaction.chargeRequired - .001) { interaction.charge = interaction.chargeRequired; interaction.phase = "STABLE"; showNotice("英雄桿穩定完成；現在開始推進核心進度。 "); }
    }
    if (interaction.phase === "STABLE" && availableFocus > 0) {
      const progressed = Math.min(availableFocus, Math.max(0, INTERACTION_RULES.heroLeverProgress - object.progress));
      object.progress = Math.min(INTERACTION_RULES.heroLeverProgress, object.progress + progressed); interaction.progress = object.progress; amount += progressed;
      if (object.progress >= INTERACTION_RULES.heroLeverProgress - .001) { state.player.focus = Math.max(0, state.player.focus - amount); hero.focus = Math.max(0, hero.focus - amount); completeHeroLever(object); return; }
    }
    state.player.focus = Math.max(0, state.player.focus - amount); hero.focus = Math.max(0, hero.focus - amount);
    if (state.player.focus <= .001 || hero.focus <= .001) {
      state.player.focus = Math.max(0, state.player.focus); hero.focus = Math.max(0, hero.focus);
      interaction.active = false; interaction.waiting = true; interaction.phase = "WAITING"; interaction.charge = 0; object.status = "PARTIAL";
      showNotice("其中一人的專注耗盡；穩定值歸零，兩人都必須回滿後才會重來。 "); syncSceneObject(object, "waiting");
    }
  }

  function damageSceneObjectsNear(x, y, radius, source = "戰鬥") {
    currentSceneObjects().forEach((object, index) => {
      if (!object.destructible || object.status === "DESTROYED" || Math.hypot(object.x - x, object.y - y) > radius) return;
      const chance = source === "怪人" ? .34 : .18;
      if (seeded(Math.floor(state.worldTime * 10) + index, object.id.length + source.length) >= chance) return;
      if (state.interaction.objectId === object.id) interruptCurrentInteraction("裝置遭到破壞");
      object.status = "DESTROYED"; object.destroyedBy = source; syncSceneObject(object, "destroyed");
      addFloatingText(object.x, object.y, object.name + " 消失", "#ff8a72", 1.4, 11);
      showNotice("異常狀態：" + object.name + "被" + source + "破壞，已從本場景永久消失。 ");
    });
  }
