/* HUD 與場景流程：畫面文字、狀態面板、預告／地圖、進出建築與場景切換。 */
  function renderDynamicHud() {
    const p = state.player, max = Math.max(0, p.max), flashing = exhaustionFlashVisible();
    // 填色相對固定 100 顯示，所以上限被耗損時，兩條資源條會一起實際縮短。
    $("staminaFill").style.width = clamp(p.stamina, 0, 100) + "%"; $("focusFill").style.width = clamp(p.focus, 0, 100) + "%";
    const vehicle = currentVehicleRule();
    $("staminaText").textContent = Math.round(p.stamina) + "／" + Math.round(max); $("focusText").textContent = Math.round(p.focus) + "／" + Math.round(max); $("speedText").textContent = String(Math.round(p.speed)); $("speedFill").style.width = clamp(p.speed / vehicle.maxSpeed * 100, 0, 100) + "%"; $("mobilityText").textContent = vehicle.label + "｜速度 " + Math.round(p.speed) + "／" + vehicle.maxSpeed;
    $("statusPanel").classList.toggle("exhaustion-warning", flashing);
    renderInteractionHud();
    renderDeliveryHud();
    const roster = allHeroActors().filter((actor) => heroActorInCurrentArea(actor)).map((actor) => "<span class=\"" + (actor.faction === "ROGUE" ? "rogue" : "") + "\">" + escapeHtml(actor.title) + "｜" + heroStageFor(actor) + "｜" + Math.max(0, Math.round(actor.stamina)) + "</span>");
    $("heroRoster").innerHTML = roster.join("");
    renderBattlefieldWindow();
  }
  function renderAll() {
    const p = state.player, max = p.max;
    const visual = currentSceneVisual(); $("sceneLabel").textContent = ""; $("regionColor").style.background = visual.color; $("regionColor").style.color = visual.color; $("regionGlyph").textContent = visual.glyph;
    $("dangerBadge").textContent = "危險 A" + state.dangerLevel; $("dangerBadge").dataset.level = String(state.dangerLevel);
    $("stageLabel").textContent = state.heroStage === "NONE" ? "未變身" : "階段 " + state.heroStage;
    $("stageLabel").className = "pill " + (state.heroStage === "A" ? "a" : state.heroStage === "B" ? "b" : state.heroStage === "C" ? "c" : "");
    renderDynamicHud();
    $("itemPill").textContent = "關鍵道具：" + (state.eventInput.keyItemAcquired ? "已取得" : "未取得");
    $("orangePill").textContent = "橘色圈：" + (state.orangeUnlocked ? "解除" : "鎖定"); $("redPill").textContent = "紅色圈：" + (state.redUnlocked ? "解除" : "鎖定"); $("chasePill").textContent = "正式追殺：" + (state.formalChase ? "開始" : "未開始");
    const item = currentKeyItem(), lastItem = state.keyItemsFound > 0 ? KEY_ITEM_CHAIN[state.keyItemsFound - 1] : null; $("keyItemCount").textContent = state.keyItemsFound + "/" + state.keyItemTotal;
    if (!item) { const building = WORLD_BUILDINGS.find((entry) => entry.id === state.heroCandidate.buildingId); $("keyItemDescription").textContent = "已確認：" + lastItem.trueName + "｜候選人在「" + (building?.label || state.heroCandidate.scene) + "」"; }
    else if (lastItem) $("keyItemDescription").textContent = "已取得：" + lastItem.trueName + "｜" + itemLocationHint(item);
    else $("keyItemDescription").textContent = itemLocationHint(item) + "｜疑似：" + item.vagueName;
    $("freeMinionInput").value = state.freeMinions; $("freeMinionValue").textContent = state.freeMinions; $("monsterMinionInput").value = state.monsterMinions; $("monsterMinionValue").textContent = state.monsterMinions;
    const percentText = (value) => (value > 0 ? "+" : "") + value + "%";
    $("initialSpeedInput").value = state.initialSpeedAdjust; $("initialSpeedValue").textContent = percentText(state.initialSpeedAdjust);
    $("accelerationInput").value = state.accelerationAdjust; $("accelerationValue").textContent = percentText(state.accelerationAdjust);
    $("skillCheckInput").value = state.skillCheckAdjust; $("skillCheckValue").textContent = percentText(state.skillCheckAdjust);
    $("heroLeverInput").value = state.heroLeverAdjust; $("heroLeverValue").textContent = percentText(state.heroLeverAdjust);
    $("gateText").textContent = "初始波次剩餘：" + state.initialWaveRemaining + "／35（門檻 ≤ 5）｜目前自由小兵：" + state.freeMinions + "｜增殖值：" + state.enemyGenerationValue.toFixed(2);
    const e = eligibility(state.eventInput); state.evidence = e; $("scoreText").textContent = "目前分數：" + e.value + "／170"; $("scoreMeter").style.width = clamp(e.value / 170 * 100, 0, 100) + "%"; $("scoreBreakdown").textContent = JSON.stringify(e.breakdown, null, 2);
    $("stageCards").innerHTML = [
      ["A", "必定變身", stageThreshold("A"), state.heroStage === "A" || stageRank[state.heroStage] > 1],
      ["B", "低機率強化", stageThreshold("B"), state.heroStage === "B" || state.heroStage === "C"],
      ["C", "極小機率超越", stageThreshold("C"), state.heroStage === "C"]
    ].map((item) => "<div class=\"stage-card " + (item[3] ? "done" : "") + " " + (state.heroStage === item[0] ? "current" : "") + "><div class=\"stage-title\"><span>階段 " + item[0] + "｜" + item[1] + "</span><span>" + (item[3] ? "✓" : "") + "</span></div><div class=\"meter\"><div style=\"width:" + clamp(e.value / item[2] * 100, 0, 100) + "%\"></div></div><div class=\"muted\">最低證據分數 " + item[2] + "</div></div>").join("");
    renderItemInspection();
    renderCanvas();
  }

  function completeEnterBuilding(buildingId, entranceId = null) {
    const building = WORLD_BUILDINGS.find((entry) => entry.id === buildingId); if (!building) return false;
    const interior = building.interior, entrance = building.entrances.find((entry) => entry.id === entranceId) || building.entrances[0];
    state.exteriorScene = state.areaMode === "OUTDOOR" ? state.scene : state.exteriorScene;
    state.areaMode = "INTERIOR"; state.currentBuildingId = building.id; state.currentEntranceId = entrance.id; state.scene = interior.scene;
    const savedPosition = state.core.scenes.get("INTERIOR:" + building.id)?.lastPlayerPosition;
    state.player.x = savedPosition ? savedPosition.x : interior.entry.x + 1.25; state.player.y = savedPosition ? savedPosition.y : interior.entry.y;
    state.camera.x = state.player.x; state.camera.y = state.player.y; state.activeEntranceId = building.id + "-EXIT";
    scheduleTrackingMinions(interior);
    if (state.heroActor) placeHeroNearPlayer(state.heroActor, 3);
    state.extraHeroActors.forEach((hero, index) => { if (hero.alive !== false) placeHeroNearPlayer(hero, 33 + index); });
    restoreSceneActorPositions("INTERIOR:" + building.id);
    scheduleMonsterTransfer(2.2);
    persistCurrentScene("entered-building");
    emitCore("AREA_ENTERED", { buildingId: building.id, interiorId: interior.id });
    return true;
  }

  function completeExitBuilding() {
    const building = currentBuilding(); if (!building) return false;
    const entrance = building.entrances.find((entry) => entry.id === state.currentEntranceId) || building.entrances[0];
    state.areaMode = "OUTDOOR"; state.scene = state.exteriorScene || "都市外場"; state.currentBuildingId = null; state.currentEntranceId = null;
    state.player.x = entrance.x + entrance.normalX * 1.25; state.player.y = entrance.y + entrance.normalY * 1.25;
    syncOutdoorRegion(true);
    state.camera.x = state.player.x; state.camera.y = state.player.y; state.activeEntranceId = entrance.id;
    if (state.heroActor) placeHeroNearPlayer(state.heroActor, 4);
    state.extraHeroActors.forEach((hero, index) => { if (hero.alive !== false) placeHeroNearPlayer(hero, 43 + index); });
    restoreSceneActorPositions("OUTDOOR:" + state.regionId);
    scheduleMonsterTransfer(2.2);
    persistCurrentScene("exited-building");
    emitCore("AREA_EXITED", { buildingId: building.id, regionId: state.regionId });
    return true;
  }

  function enterBuilding(building, entrance) {
    if (state.transition || !building) return;
    persistCurrentScene("leaving-for-interior");
    if (state.core.lifecycle.phase === CORE.LIFE.PLAYING) state.core.lifecycle.move(CORE.LIFE.TRANSITION, "enter-building");
    emitCore("AREA_TRANSITION_STARTED", { direction: "ENTER", buildingId: building.id, entranceId: entrance?.id || null });
    state.transition = true; $("transition").classList.add("active"); $("transition").textContent = "進入 " + building.id + "｜" + building.label; renderAll();
    window.setTimeout(() => {
      completeEnterBuilding(building.id, entrance?.id); state.transition = false; $("transition").classList.remove("active");
      if (state.core.lifecycle.phase === CORE.LIFE.TRANSITION) state.core.lifecycle.move(CORE.LIFE.PLAYING, "entered-building");
      log("進入 " + building.id + "｜" + building.label + "｜" + (building.interior.type === "ROOMS" ? "走廊隔間區" : building.interior.type === "CHAMBERS" ? "特殊連續房" : "地下柱廳")); renderAll();
    }, 450);
  }

  function exitBuilding() {
    const building = currentBuilding(); if (state.transition || !building) return;
    persistCurrentScene("leaving-interior");
    if (state.core.lifecycle.phase === CORE.LIFE.PLAYING) state.core.lifecycle.move(CORE.LIFE.TRANSITION, "exit-building");
    emitCore("AREA_TRANSITION_STARTED", { direction: "EXIT", buildingId: building.id });
    state.transition = true; $("transition").classList.add("active"); $("transition").textContent = "離開 " + building.id + "｜" + building.label; renderAll();
    window.setTimeout(() => {
      completeExitBuilding(); state.transition = false; $("transition").classList.remove("active");
      if (state.core.lifecycle.phase === CORE.LIFE.TRANSITION) state.core.lifecycle.move(CORE.LIFE.PLAYING, "exited-building");
      log("返回建築外部"); renderAll();
    }, 450);
  }

  function changeScene(scene) {
    if (state.transition || scene === state.scene) return;
    persistCurrentScene("legacy-scene-change");
    if (state.core.lifecycle.phase === CORE.LIFE.PLAYING) state.core.lifecycle.move(CORE.LIFE.TRANSITION, "change-scene");
    state.transition = true; $("transition").classList.add("active"); $("transition").textContent = "前往 " + scene; renderAll();
    window.setTimeout(() => { state.scene = scene; state.transition = false; $("transition").classList.remove("active"); if (state.core.lifecycle.phase === CORE.LIFE.TRANSITION) state.core.lifecycle.move(CORE.LIFE.PLAYING, "changed-scene"); persistCurrentScene("changed-scene"); emitCore("AREA_CHANGED", { scene }); log("抵達 " + scene); renderAll(); }, 450);
  }
