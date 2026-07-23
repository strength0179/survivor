/* 遊戲循環：每幀更新、玩家移動、系統串接與初始化。 */
  function update(dt) {
    handleGamepadAction();
    if (!state.core.lifecycle.canUpdate || state.transition || state.gameOver || state.storyPaused || state.runComplete) { renderDynamicHud(); renderCanvas(); return; }
    state.worldTime += dt;
    refreshSpatialIndex(true);
    state.deliveryCooldown = Math.max(0, state.deliveryCooldown - dt);
    updateCombatStatusEffects(dt);
    updateSceneAnomalies(dt);
    updateWorldActors(dt);
    updateRedGate(); updateDangerLevel();
    if (state.gameOver) { renderDynamicHud(); renderCanvas(); return; }
    state.crowdDensity = crowdDensityAroundPlayer();
    const gamepad = readGamepadVector();
    let dx = 0, dy = 0; if (state.keys.has("w") || state.keys.has("arrowup")) dy -= 1; if (state.keys.has("s") || state.keys.has("arrowdown")) dy += 1; if (state.keys.has("a") || state.keys.has("arrowleft")) dx -= 1; if (state.keys.has("d") || state.keys.has("arrowright")) dx += 1;
    dx += state.touchVector.x + gamepad.x; dy += state.touchVector.y + gamepad.y;
    const inputLength = Math.hypot(dx, dy), inputHeld = inputLength > .04;
    if (inputLength > 1) { dx /= inputLength; dy /= inputLength; }
    if (inputHeld && state.interaction.objectId && (state.interaction.active || state.interaction.waiting)) interruptCurrentInteraction("你離開裝置");
    const worldMove = screenInputToWorldVector(dx, dy), worldMoveLength = Math.hypot(worldMove.x, worldMove.y);
    const operationLocked = Boolean(state.interaction.objectId && (state.interaction.active || state.interaction.waiting));
    const playerStunned = number(state.player.statusEffects?.stunnedUntil, 0) > state.worldTime;
    const canMove = state.player.max > 10.0001 && !operationLocked && !playerStunned, moving = inputHeld && canMove && worldMoveLength > .001;
    const vehicle = currentVehicleRule();
    state.player.exhaustionDrainRate = 0;
    if (moving) {
      state.player.restTime = 0; state.player.maxRecoveryAnchor = null;
      // 預設速度曲線：0→10 用 0.8 秒；10→40 用 3.5 秒，後段加速度逐漸下降。
      const initialTarget = clamp(10 * vehicle.speedMultiplier * (1 + state.initialSpeedAdjust / 100), 0, vehicle.maxSpeed);
      const accelerationScale = clamp(1 + state.accelerationAdjust / 100, 0.5, 1.5);
      const firstDuration = 0.8 / accelerationScale, secondDuration = 3.5 / accelerationScale, totalDuration = firstDuration + secondDuration;
      state.player.moveTime = clamp(state.player.moveTime + dt, 0, totalDuration);
      let targetSpeed;
      if (state.player.moveTime <= firstDuration) {
        const t = clamp(state.player.moveTime / firstDuration, 0, 1);
        targetSpeed = initialTarget * (1 - Math.pow(1 - t, 2));
      } else {
        const t = clamp((state.player.moveTime - firstDuration) / secondDuration, 0, 1);
        targetSpeed = initialTarget + (vehicle.maxSpeed - initialTarget) * (1 - Math.pow(1 - t, 3));
      }
      const crowdSpeedFactor = clamp(1 - Math.min(state.crowdDensity, 8) * .08, .36, 1);
      const resourceSpeedLimit = state.player.max <= 10 ? 0 : state.player.max <= 15 ? 3 : vehicle.maxSpeed;
      targetSpeed = Math.min(targetSpeed, vehicle.maxSpeed * crowdSpeedFactor * currentHazardMovementFactor(), resourceSpeedLimit || vehicle.maxSpeed);
      state.player.speed = targetSpeed; state.player.baseSpeed = targetSpeed;
      state.player.lastMoveX = worldMove.x / worldMoveLength; state.player.lastMoveY = worldMove.y / worldMoveLength;
      movePlayerWithCollisions(worldMove.x, worldMove.y, state.player.speed * dt / 10);
      state.player.stamina = clamp(state.player.stamina - 4.5 * dt * vehicle.staminaDrainMultiplier * (state.player.speed > vehicle.maxSpeed * .62 ? 1.35 : 1), 1, state.player.max);
      let maxDrainRate = state.player.speed >= vehicle.maxSpeed * .987 ? 1.8 * vehicle.staminaDrainMultiplier : 0;
      if (state.player.stamina <= 1.0001) {
        state.player.stamina = 1; state.player.collapseTime += dt;
        maxDrainRate += clamp(8 + state.player.collapseTime * 10 + state.player.collapseTime * state.player.collapseTime * 4, 8, 52);
      } else state.player.collapseTime = 0;
      state.player.exhaustionDrainRate = maxDrainRate;
      if (maxDrainRate > 0) state.player.max = clamp(state.player.max - maxDrainRate * dt, 1, 100);
      state.player.stamina = Math.min(state.player.stamina, state.player.max); state.player.focus = Math.min(state.player.focus, state.player.max);
    } else {
      state.player.moveTime = 0; state.player.baseSpeed = 0; state.player.speed = 0;
      if (inputHeld && state.player.stamina <= 1.0001 && state.player.max > 1) {
        state.player.collapseTime += dt;
        const maxDrainRate = clamp(8 + state.player.collapseTime * 10 + state.player.collapseTime * state.player.collapseTime * 4, 8, 52);
        state.player.exhaustionDrainRate = maxDrainRate;
        state.player.max = clamp(state.player.max - maxDrainRate * dt, 1, 100);
        state.player.focus = Math.min(state.player.focus, state.player.max);
      } else if (!inputHeld) {
        state.player.collapseTime = 0;
        recoverPlayerResources(dt, Boolean(state.interaction.objectId && state.interaction.active && !state.interaction.waiting));
      }
    }
    updateSceneInteraction(dt);
    if (state.areaMode === "OUTDOOR") syncOutdoorRegion();
    const target = currentKeyItem();
    if (target && isEntityInCurrentArea(target) && playerWorldDistance(state.player, target) <= ITEM_PICKUP_RADIUS) collectNearbyItem();
    if (state.storyPaused) { renderDynamicHud(); renderCanvas(); return; }
    if (checkNavigationGate()) return;
    updateHeroCandidate(dt);
    tryHeroCandidateEncounter();
    updateHeroActor(dt, moving);
    updateAdditionalHeroes(dt, moving);
    updateMonsterSequence(dt);
    updateCompletionRuntime(dt); autoSavePersistentRun();
    const cameraFollow = 1 - Math.exp(-dt * 10);
    state.camera.x += (state.player.x - state.camera.x) * cameraFollow;
    state.camera.y += (state.player.y - state.camera.y) * cameraFollow;
    syncCoreActorIndex();
    renderDynamicHud(); renderCanvas();
  }
  function frame(time) { const dt = Math.min((time - state.lastTime) / 1000, 0.05); state.lastTime = time; update(dt); window.requestAnimationFrame(frame); }

  createBuildingLayout(); initializeSceneObjects(); registerGeneratedWorldInCore(); resizeCanvas(); createWorldActors(); initializeRuntimeCompletion(); bind(); runSafariCompatibilityChecks(); syncOutdoorRegion(true); persistCurrentScene("world-initialized"); syncCoreActorIndex(); log("本局已把 12 棟建築配置到七個連續區域：場景互動設施與英雄桿會隨建築配置一起保存。先取得都市區的金色物件想起身分，再讓意外線索把你帶入空想科學事件"); renderAll(); window.requestAnimationFrame(frame);
