/* 輸入與裝置：按鈕、鍵盤、觸控搖桿、Gamepad、Safari viewport 與資源恢復。 */
  function button(id, handler) { $(id).addEventListener("click", handler); }
  function setInput(patch, message) { state.eventInput = { ...state.eventInput, ...patch }; syncChain(message); }
  function reset() { window.location.reload(); }
  function snapshot() {
    const output = {
      version: "single-html-2.3-complete-runtime", coreVersion: state.core.version, runSeed: RUN_SEED, lifecycle: state.core.lifecycle.phase, scene: state.scene, exteriorScene: state.exteriorScene, regionId: state.regionId, areaMode: state.areaMode, currentBuildingId: state.currentBuildingId,
      heroStage: state.heroStage, heroActor: state.heroActor, heroDialogueHistory: state.heroDialogueHistory, dialogueUnlockHistory: state.dialogueUnlockHistory, itemRoute: ACTIVE_ITEM_ROUTE.id, buildingLayoutSeed: BUILDING_LAYOUT_SEED, missionExit: state.missionExit,
      keyItemsFound: state.keyItemsFound, keyItemTotal: state.keyItemTotal, collectedItems: state.collectedItems, playerIdentity: state.playerIdentity, playerProfile: state.playerProfile,
      heroCandidate: state.heroCandidate, eventInput: state.eventInput, evidence: state.evidence,
      orangeUnlocked: state.orangeUnlocked, redUnlocked: state.redUnlocked, formalChase: state.formalChase, dangerLevel: state.dangerLevel,
      freeMinions: state.freeMinions, initialWaveRemaining: state.initialWaveRemaining, enemyGenerationValue: state.enemyGenerationValue,
      monsterMinions: state.monsterMinions, monsterActor: state.monsterActor, monsterPowerExperience: state.monsterPowerExperience, monsterLevel: state.monsterLevel, trackingLevel: state.trackingLevel,
      initialSpeedAdjust: state.initialSpeedAdjust, accelerationAdjust: state.accelerationAdjust, skillCheckAdjust: state.skillCheckAdjust, heroLeverAdjust: state.heroLeverAdjust,
      player: state.player, routeFlags: state.routeFlags, routeCombinationKey: state.routeCombinationKey, sceneActorPositions: state.sceneActorPositions, camera: state.camera, buildings: WORLD_BUILDINGS, sceneObjects: state.sceneObjects, interaction: state.interaction, settlement: state.settlement, bonusItems: state.bonusItems,
      extraHeroActors: state.extraHeroActors, heroRelations: state.heroRelations, handedItemIds: state.handedItemIds, deliveryHistory: state.deliveryHistory, sceneAnomalies: state.sceneAnomalies, dynamicObstacles: state.dynamicObstacles, safariChecks: state.safariChecks,
      core: { objectives: state.core.objectives.list(), actors: state.core.actors.snapshot(), objects: state.core.objects.snapshot(), scenes: state.core.scenes.snapshot((scene) => ({ id: scene?.id, type: scene?.type, buildingId: scene?.buildingId, regionId: scene?.regionId, visits: scene?.visits, destroyed: scene?.destroyed || [] })) }
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "空想戰線_生存者_測試狀態.json"; a.click(); URL.revokeObjectURL(url);
  }
  function nextDialogue() {
    const queued = dequeueDialogue(), line = queued || unlockDialogue("H20", "FIRST_SIGHT", "KEY_VISIBLE", "RIVAL_APPEARS", "COUNTERED", "REJECT_ORDER", "CONTROL_BREAK");
    if (!line) { log("目前沒有尚未播放的台詞"); return; }
    state.dialogueIndex += 1; state.dialogueActiveUntil = state.worldTime + 1.25; log((line.actorId || line.c || "現場") + "：「" + line.text + "」", true); playPseudoVoice(line.text, line.cat); addFloatingText(state.player.x, state.player.y, "台詞解鎖", "#ffe7a6", 1.1, 11); renderAll();
  }

  function readGamepadVector() {
    if (!navigator.getGamepads) return { x: 0, y: 0 };
    const pad = Array.from(navigator.getGamepads()).find((item) => item && item.connected);
    if (!pad) return { x: 0, y: 0 };
    state.safariChecks.gamepad = true;
    const deadzone = 0.16;
    const rawX = Number(pad.axes?.[0] || 0), rawY = Number(pad.axes?.[1] || 0);
    return { x: Math.abs(rawX) >= deadzone ? rawX : 0, y: Math.abs(rawY) >= deadzone ? rawY : 0 };
  }

  function readGamepadAction() {
    if (!navigator.getGamepads) return false;
    const pad = Array.from(navigator.getGamepads()).find((item) => item && item.connected);
    if (pad) state.safariChecks.gamepad = true;
    return Boolean(pad?.buttons?.[0]?.pressed || pad?.buttons?.[1]?.pressed || pad?.buttons?.[9]?.pressed);
  }
  function consumeGamepadAction() {
    const pressed = readGamepadAction(), triggered = pressed && !state.gamepadActionHeld;
    state.gamepadActionHeld = pressed;
    return triggered;
  }
  function syncPlayableViewport() {
    const height = Number(window.visualViewport?.height || window.innerHeight || 0);
    if (!Number.isFinite(height) || height <= 0) return;
    const stage = $("gameStage");
    if (stage?.style?.setProperty) stage.style.setProperty("--play-height", Math.round(height) + "px");
    else if (stage?.style) stage.style["--play-height"] = Math.round(height) + "px";
  }
  function requestImmersivePlay() {
    const stage = $("gameStage"), request = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (request) { try { const result = request.call(stage); result?.catch?.(() => {}); state.safariChecks.fullscreen = true; } catch {} }
  }
  function runSafariCompatibilityChecks() {
    const meta = document.querySelector?.('meta[name="viewport"]')?.getAttribute?.("content") || "viewport-fit=cover,user-scalable=no";
    state.safariChecks.viewport = /viewport-fit=cover/.test(meta) && /user-scalable=no/.test(meta);
    state.safariChecks.touch = Boolean($("gameStage")) && Boolean($("touchJoystick"));
    syncPlayableViewport();
    emitCore("SAFARI_COMPATIBILITY_CHECK", { ...state.safariChecks, standalone: true, noExternalAssets: true });
    return { ...state.safariChecks, standalone: true };
  }
  function startRun() {
    ensureAudio();
    requestImmersivePlay();
    if (state.core.lifecycle.phase === CORE.LIFE.BOOT) state.core.lifecycle.move(CORE.LIFE.PLAYING, "player-start");
    emitCore("RUN_STARTED", { routeId: ACTIVE_ITEM_ROUTE.id, layoutSeed: BUILDING_LAYOUT_SEED });
    $("welcome").classList.add("is-hidden");
  }
  function handleGamepadAction() {
    if (!consumeGamepadAction()) return false;
    if (state.gameOver) { reset(); return true; }
    if (state.runComplete) { advanceRunComplete(); return true; }
    if (state.storyPaused) { closeStorySequence(); return true; }
    if (state.core.lifecycle.phase === CORE.LIFE.BOOT) { startRun(); return true; }
    if (!state.transition) return attemptSceneInteraction();
    return false;
  }

  function bindTouchJoystick() {
    const zone = $("touchJoystick"), stick = $("touchStick");
    if (!zone || !stick) return;
    let pointerId = null;
    const reset = () => { pointerId = null; state.touchVector = { x: 0, y: 0 }; stick.style.transform = "translate3d(0,0,0)"; };
    const move = (event) => {
      if (pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = zone.getBoundingClientRect();
      const max = Math.max(24, rect.width * 0.34);
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let x = event.clientX - cx, y = event.clientY - cy;
      const length = Math.hypot(x, y);
      if (length > max) { x = x / length * max; y = y / length * max; }
      const deadzone = 8;
      state.touchVector = Math.hypot(x, y) < deadzone ? { x: 0, y: 0 } : { x: x / max, y: y / max };
      stick.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    zone.addEventListener("pointerdown", (event) => { event.preventDefault(); pointerId = event.pointerId; zone.setPointerCapture?.(pointerId); move(event); }, { passive: false });
    zone.addEventListener("pointermove", move, { passive: false });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => zone.addEventListener(type, (event) => { if (pointerId === event.pointerId || type === "lostpointercapture") reset(); }, { passive: false }));
  }

  function bind() {
    button("audioButton", ensureAudio); button("snapshotButton", snapshot); button("resetButton", reset);
    button("saveRunButton", () => { ensureAudio(); if (savePersistentRun("manual")) showNotice("本局已保存；重新開啟檔案後可按「讀取上次進度」。"); else showNotice("目前瀏覽器不允許保存，請改用一般 http／https 網址開啟。 "); });
    button("loadRunButton", () => { ensureAudio(); if (!restorePersistentRun()) showNotice("沒有可讀取的同一局進度；請先以相同 seed 開始遊玩。 "); });
    button("gameOverConfirm", reset);
    button("runCompleteConfirm", advanceRunComplete);
    button("interactionButton", () => { ensureAudio(); attemptSceneInteraction(); });
    button("startButton", startRun);
    button("storyContinue", closeStorySequence);
    $("deliveryTargets").addEventListener("click", (event) => {
      const target = event.target?.closest ? event.target.closest("[data-recipient-id]") : event.target;
      const recipientId = target?.dataset?.recipientId;
      if (recipientId) { ensureAudio(); deliverItemTo(recipientId); }
    });
    button("devButton", () => $("devModal").classList.remove("is-hidden"));
    button("closeDevButton", () => $("devModal").classList.add("is-hidden"));
    button("itemCounterButton", () => {
      const item = state.keyItemsFound > 0 ? KEY_ITEM_CHAIN[state.keyItemsFound - 1] : currentKeyItem();
      setItemInspection(!state.itemInspectionOpen, item?.id || null);
    });
    button("itemInspectionClose", () => setItemInspection(false));
    document.addEventListener("pointerdown", (event) => {
      if (!state.itemInspectionOpen) return;
      if ($("itemInspectionCard").contains(event.target) || $("itemCounterButton").contains(event.target)) return;
      setItemInspection(false);
    });
    button("itemButton", collectNearbyItem);
    button("clueButton", () => setInput({ clueCount: Math.min(6, number(state.eventInput.clueCount, 0) + 1), chaseClueFound: true }, "取得一條有效線索"));
    button("secondKeyButton", () => setInput({ secondKeyEvent: true }, "第二關鍵事件成立"));
    button("operationButton", () => setInput({ operationSuccess: true }, "高難度操作完成"));
    button("rescueButton", () => setInput({ rescueCount: Math.min(3, number(state.eventInput.rescueCount, 0) + 1) }, "救援人數 +1"));
    button("leverButton", () => setInput({ heroLeverCompletions: Math.min(3, number(state.eventInput.heroLeverCompletions, 0) + 1) }, "英雄桿完成次數 +1"));
    button("rareButton", () => setInput({ rareKeyItem: true }, "取得稀有關鍵道具"));
    button("deathButton", () => setInput({ casualtyDeaths: number(state.eventInput.casualtyDeaths, 0) + 1 }, "記錄一名死亡，C 條件受損"));
    button("minionButton", () => { state.initialWaveRemaining = Math.max(0, state.initialWaveRemaining - 1); syncChain("初始波次自由小兵 -1"); });
    button("minionFiveButton", () => { state.initialWaveRemaining = 5; syncChain("初始波次降至 5 隻"); });
    button("speechButton", () => { if (!state.redUnlocked) { log("紅色圈尚未解除，怪人不能完成正式追殺台詞"); return; } state.bossSpeechComplete = true; state.monsterMinionsReleased = true; state.formalChase = true; log("怪人台詞完成，正式追殺開始", true); renderAll(); });
    button("weakHitButton", () => battleBurst("WEAK")); button("heavyHitButton", () => battleBurst("HEAVY")); button("clashButton", () => battleBurst("CLASH")); button("dialogueButton", nextDialogue);
    $("freeMinionInput").addEventListener("input", (event) => { state.freeMinions = clamp(Math.floor(Number(event.target.value) || 0), 0, 120); syncChain("自由小兵數量調整"); });
    $("monsterMinionInput").addEventListener("input", (event) => { state.monsterMinions = clamp(Math.floor(Number(event.target.value) || 0), 0, 60); renderAll(); });
    const bindPercentSetting = (inputId, valueId, stateKey) => { $(inputId).addEventListener("input", (event) => { state[stateKey] = clamp(Math.floor(Number(event.target.value) || 0), -50, 50); $(valueId).textContent = (state[stateKey] > 0 ? "+" : "") + state[stateKey] + "%"; renderAll(); }); };
    bindPercentSetting("initialSpeedInput", "initialSpeedValue", "initialSpeedAdjust");
    bindPercentSetting("accelerationInput", "accelerationValue", "accelerationAdjust");
    bindPercentSetting("skillCheckInput", "skillCheckValue", "skillCheckAdjust");
    bindPercentSetting("heroLeverInput", "heroLeverValue", "heroLeverAdjust");
    bindTouchJoystick();
    window.addEventListener("touchmove", (event) => { if (event.target?.matches?.("input[type='range']")) return; event.preventDefault(); }, { passive: false });
    window.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
    window.addEventListener("resize", resizeCanvas, { passive: true });
    window.addEventListener("orientationchange", syncPlayableViewport, { passive: true });
    window.visualViewport?.addEventListener?.("resize", syncPlayableViewport, { passive: true });
    window.visualViewport?.addEventListener?.("scroll", syncPlayableViewport, { passive: true });
    window.addEventListener("keydown", (event) => {
      if (["e", "E", " ", "Enter"].includes(event.key) && !state.storyPaused && !state.transition && !state.runComplete && !state.gameOver) { event.preventDefault(); attemptSceneInteraction(); return; }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(event.key)) { event.preventDefault(); state.keys.add(event.key.toLowerCase()); }
    });
    window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
    window.addEventListener("pagehide", () => savePersistentRun("pagehide"));
    window.addEventListener("beforeunload", () => savePersistentRun("beforeunload"));
  }
  function recoveryAmountForWindow(startTime, duration) {
    let remaining = Math.max(0, duration), cursor = Math.max(0, startTime), recovered = 0, bandStart = 0;
    for (const band of RECOVERY_BANDS) {
      const bandEnd = band.duration === Infinity ? Infinity : bandStart + band.duration;
      if (cursor >= bandEnd) { bandStart = bandEnd; continue; }
      const available = bandEnd === Infinity ? remaining : Math.min(remaining, bandEnd - cursor);
      const rate = band.rate ?? band.amount / band.duration;
      recovered += available * rate; remaining -= available; cursor += available;
      if (remaining <= .000001) break;
      bandStart = bandEnd;
    }
    return recovered;
  }

  function currentVehicleRule() { return VEHICLE_RULES[state.player.vehicle] || VEHICLE_RULES.NONE; }

  function recoverPlayerResources(dt, focusBlocked = false) {
    const player = state.player, vehicle = currentVehicleRule(), amount = recoveryAmountForWindow(player.restTime, dt) * vehicle.recoveryMultiplier;
    player.restTime += dt;
    if (player.maxRecoveryAnchor == null) player.maxRecoveryAnchor = player.max;
    const recoveredMax = Math.max(0, player.max - player.maxRecoveryAnchor), quarter = clamp(Math.floor(recoveredMax / 25), 0, 3);
    const maxRecoveryRate = 8 / Math.pow(2, quarter);
    player.max = clamp(player.max + maxRecoveryRate * dt, 0, 100);
    player.stamina = clamp(player.stamina + amount, 0, player.max);
    if (!focusBlocked) player.focus = clamp(player.focus + amount, 0, player.max);
  }
