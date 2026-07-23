/* 雙向戰鬥：英雄 stage、英雄／怪人／小兵傷害、友軍關係、防禦反擊與多英雄 AI。 */
  function currentHeroThreats() {
    const basics = state.areaMode === "INTERIOR" ? (currentInterior()?.minions || []) : state.freeMinionActors;
    const threats = basics.filter((actor) => actor.alive);
    state.monsterMinionActors.forEach((actor) => { if (actor.alive && actor.areaMode === state.areaMode && actor.buildingId === state.currentBuildingId) threats.push(actor); });
    if (monsterInCurrentArea()) threats.push(state.monsterActor);
    return threats;
  }

  function threatPower(threat) {
    if (threat === state.monsterActor) return 100 + number(threat.stamina, 0) / 10;
    if (String(threat?.id || "").startsWith("MM-")) return 12;
    return String(threat?.id || "").startsWith("I-") ? 7 : 5;
  }

  function isHeroActorEntity(actor) { return allHeroActors().includes(actor); }
  function damageHero(target, rawDamage, source = null) {
    if (!target || target.alive === false) return false;
    let damage = Math.max(0, number(rawDamage, 0)), guarded = false;
    if (source && isHeroActorEntity(source) && source !== target) {
      const relation = relationBetween(source, target);
      relation.hits += 1; relation.lastAttackerId = source.id;
      if (!relation.hostile && relation.hits === 1) {
        guarded = true; target.guardUntil = state.worldTime + 1.25; target.lastAttackerId = source.id;
        addFloatingText(target.x, target.y, "先防禦", "#9ddfff", 1.05, 11);
        showNotice(target.title + "受到" + source.title + "攻擊，先採取防禦姿勢。 ");
      } else if (!relation.hostile && relation.hits >= 2) {
        relation.hostile = true; target.forcedHostileTargetId = source.id; source.forcedHostileTargetId = target.id;
        addFloatingText(target.x, target.y, "被迫反擊", "#ffcf86", 1.2, 12);
        showNotice(target.title + "再度遭到攻擊，決定反擊" + source.title + "。 ");
      }
    }
    if (state.worldTime < number(target.guardUntil, 0)) { damage *= .35; guarded = true; }
    target.stamina = Math.max(0, number(target.stamina, target.staminaMax || 100) - damage);
    target.lastHitAt = state.worldTime;
    addFieldBurst(target.x, target.y, guarded ? .86 : 1.18);
    addFloatingText(target.x, target.y, "-" + Math.max(1, Math.round(damage)) + " 體力", guarded ? "#9ddfff" : "#ff9d8f", .95, 11);
    if (target.stamina <= 0) {
      target.alive = false; target.downAt = state.worldTime; target.behaviorMode = "DOWN";
      addFloatingText(target.x, target.y, target.title + "倒下", "#ff9b95", 1.55, 13);
      emitCore("HERO_DOWN", { heroId: target.id, sourceId: source?.id || "MONSTER" });
    }
    return true;
  }
  function updateHeroResources(hero, dt) {
    if (!hero || hero.alive === false) return;
    const underHit = state.worldTime - number(hero.lastHitAt, -Infinity) < .8, attacking = hero.attackCooldown > .05;
    if (!underHit && !attacking && !statusActive(hero, "stunnedUntil")) hero.stamina = Math.min(hero.staminaMax, number(hero.stamina, 0) + hero.staminaMax / 14 * dt);
    const wasRetreating = Boolean(hero.retreating), low = hero.stamina <= hero.staminaMax * .22;
    if (low) hero.retreating = true;
    else if (hero.stamina >= hero.staminaMax * .58) hero.retreating = false;
    if (wasRetreating !== Boolean(hero.retreating)) {
      emitCore(hero.retreating ? "HERO_RETREAT" : "HERO_RECOVERED", { actorId: hero.id, heroId: hero.id, reason: hero.retreating ? "LOW_STAMINA" : "RECOVERED" });
      addFloatingText(hero.x, hero.y, hero.retreating ? "撤退" : "回到戰線", hero.retreating ? "#9edfff" : "#9fffc9", 1.1, 11);
    }
  }
  function heroRivalEntries(hero) {
    const opponents = allHeroActors().filter((actor) => actor !== hero && heroActorInCurrentArea(actor));
    return opponents.filter((actor) => {
      if (hero.forcedHostileTargetId === actor.id || actor.forcedHostileTargetId === hero.id) return true;
      if (hero.faction === "ROGUE" || actor.faction === "ROGUE") return true;
      return hero.ai === 3;
    }).map((actor) => ({
      threat: actor, distance: Math.hypot(actor.x - state.player.x, actor.y - state.player.y), heroDistance: Math.hypot(actor.x - hero.x, actor.y - hero.y),
      power: heroCombatPower(actor), forced: hero.forcedHostileTargetId === actor.id || actor.forcedHostileTargetId === hero.id
    }));
  }

  function selectHeroThreat(hero) {
    let candidates = currentHeroThreats().map((threat) => ({
      threat,
      distance: Math.hypot(threat.x - state.player.x, threat.y - state.player.y),
      heroDistance: Math.hypot(threat.x - hero.x, threat.y - hero.y),
      power: threatPower(threat)
    })).filter((entry) => entry.distance <= hero.senseDistance || entry.heroDistance <= hero.senseDistance);
    candidates = candidates.concat(heroRivalEntries(hero).filter((entry) => entry.heroDistance <= hero.senseDistance));
    candidates = candidates.filter((entry) => entry.heroDistance <= 1.1 || entry.threat === state.monsterActor || entityCanSee(hero, entry.threat, hero.ai === 3 ? 150 : 128));
    if (hero.ai === 2) {
      const nearPlayer = candidates.filter((entry) => entry.distance <= 4.6);
      if (nearPlayer.length) candidates = nearPlayer;
    }
    if (hero.ai === 3 && hero.forcedHostileTargetId) {
      const forced = candidates.find((entry) => entry.forced);
      const monster = candidates.filter((entry) => entry.threat === state.monsterActor).sort((a, b) => b.power - a.power)[0];
      // 追求強大的英雄不會因弱小的敵對英雄就放棄更強的怪人：他會保持格擋，仍以最強目標為主攻。
      if (forced && monster && monster.power > forced.power * 1.1) {
        hero.defensiveRivalId = forced.threat.id;
        return monster;
      }
    }
    hero.defensiveRivalId = null;
    if (hero.forcedHostileTargetId) candidates.sort((a, b) => Number(Boolean(b.forced)) - Number(Boolean(a.forced)) || a.heroDistance - b.heroDistance);
    else if (hero.ai === 3) candidates.sort((a, b) => b.power - a.power || a.heroDistance - b.heroDistance);
    else candidates.sort((a, b) => a.distance - b.distance || a.heroDistance - b.heroDistance);
    return candidates[0] || null;
  }

  function maintainStrongHeroDefense(hero) {
    if (!hero || hero.ai !== 3 || !hero.defensiveRivalId) return;
    const rival = actorFromHeroId(hero.defensiveRivalId);
    if (!rival || rival.alive === false || !heroActorInCurrentArea(rival)) { hero.defensiveRivalId = null; return; }
    if (Math.hypot(hero.x - rival.x, hero.y - rival.y) > 4.6) return;
    hero.guardUntil = Math.max(number(hero.guardUntil, 0), state.worldTime + .46);
    if (state.worldTime >= number(hero.nextDefenseNoticeAt, 0)) {
      addFloatingText(hero.x, hero.y, "格擋弱敵／鎖定強敵", "#9edfff", .8, 9);
      hero.nextDefenseNoticeAt = state.worldTime + 1.4;
    }
  }

  function heroMoveForStage(hero = state.heroActor, stage = state.heroStage) {
    if (!hero) return null;
    const kit = HERO_COMBAT_KITS[hero.id] || HERO_COMBAT_KITS.H01, style = HERO_MOVE_STYLES[kit.style] || HERO_MOVE_STYLES.MIGHT;
    const stageMoves = hero.stageMoves || HERO_STAGE_LIBRARY[hero.id]?.moves || kit.moves;
    const highest = clamp(stageRank[stage] - 1, 0, 2);
    for (let index = highest; index >= 0; index -= 1) {
      const cost = style.cost + index * 5;
      if (hero.focus < cost) continue;
      return {
        ...(stageMoves[index] || kit.moves[index] || {}), style: kit.style, cost,
        range: style.range + index * .6, area: style.area + index * .42,
        damage: style.damage * [1, 1.58, 2.35][index], cooldown: Math.max(.4, style.cooldown - index * .06),
        color: style.color, rank: index
      };
    }
    return null;
  }

  function defeatHeroThreat(threat, damage, stage, sourceHero = null) {
    if (isHeroActorEntity(threat)) { damageHero(threat, damage, sourceHero); return; }
    if (threat === state.monsterActor) {
      const next = threat.stamina - damage;
      threat.stamina = stage === "C" ? Math.max(0, next) : Math.max(1, next);
      if (threat.stamina <= 0 && stage === "C") {
        threat.alive = false; state.formalChase = false;
        state.monsterMinionActors.forEach((actor) => { actor.alive = false; });
        addFloatingText(threat.x, threat.y, "怪人被超越階段擊破", "#fff18a", 1.8, 15);
      }
      return;
    }
    if (state.freeMinionActors.includes(threat)) retireFreeMinion(threat, "DESTROYED");
    else threat.alive = false;
  }

  function executeHeroMove(hero, target, move = heroMoveForStage(hero, heroStageFor(hero))) {
    if (!hero || hero.alive === false || !target || target.alive === false || !move || hero.attackCooldown > 0) return false;
    const threats = currentHeroThreats().filter((threat) => threat.alive && Math.hypot(threat.x - target.x, threat.y - target.y) <= move.area)
      .sort((a, b) => threatPower(b) - threatPower(a)).slice(0, 1 + move.rank * 2);
    if (isHeroActorEntity(target) && !threats.includes(target)) threats.unshift(target);
    if (!threats.length) threats.push(target);
    hero.focus = Math.max(0, hero.focus - move.cost); hero.attackCooldown = move.cooldown;
    threats.forEach((threat) => {
      defeatHeroThreat(threat, move.damage * (hero.powerMultiplier || 1), heroStageFor(hero), hero);
      addFieldBurst(threat.x, threat.y, 1.2 + move.rank * .52);
    });
    applyHeroBattleMethod(hero, move, target);
    damageSceneObjectsNear(target.x, target.y, move.area + .35, "英雄");
    addFloatingText(target.x, target.y, move.name, move.color, 1.05, 12 + move.rank * 2);
    playImpact("HEAVY");
    return true;
  }

  function updateHeroActor(dt, playerMoving) {
    const hero = state.heroActor; if (!hero || hero.alive === false || state.heroStage === "NONE") return;
    hero.teleportCooldown = Math.max(0, hero.teleportCooldown - dt); hero.attackCooldown = Math.max(0, hero.attackCooldown - dt); hero.rescueCooldown = Math.max(0, hero.rescueCooldown - dt); hero.behaviorTimer -= dt;
    updateHeroResources(hero, dt);
    if (!(state.interaction.type === "HERO_LEVER" && state.interaction.heroId === hero.id && state.interaction.active && !state.interaction.waiting)) hero.focus = Math.min(hero.focusMax, hero.focus + hero.focusMax / 1.5 * dt);
    if (hero.areaMode !== state.areaMode || hero.buildingId !== state.currentBuildingId) placeHeroNearPlayer(hero, 1);
    const screen = iso(hero.x, hero.y, 0), offscreen = screen.x < -55 || screen.x > canvas.width + 55 || screen.y < 45 || screen.y > canvas.height + 55;
    if (offscreen && hero.teleportCooldown <= 0) {
      const edgeX = clamp(screen.x, 58, canvas.width - 58), edgeY = clamp(screen.y, 108, canvas.height - 58);
      const edgeWorld = worldFromScreenPoint(edgeX, edgeY), open = findOpenCurrentAreaPoint(edgeWorld.x, edgeWorld.y, 810 + Math.floor(state.worldTime));
      hero.x = open.x; hero.y = open.y; hero.targetX = state.player.x; hero.targetY = state.player.y; hero.teleportCooldown = 1.1; hero.stuckTime = 0;
    }
    const assistingObject = activeInteractionObject();
    if (state.interaction.type === "HERO_LEVER" && state.interaction.heroId === hero.id && assistingObject?.areaKey === coreSceneKey()) {
      hero.assisting = true; hero.behaviorMode = "ASSIST_LEVER";
      const distance = Math.hypot(hero.x - assistingObject.x, hero.y - assistingObject.y);
      if (distance > .92) {
        const point = findOpenCurrentAreaPoint(assistingObject.x - .72, assistingObject.y + .64, 960 + Math.floor(state.worldTime * 3));
        hero.targetX = point.x; hero.targetY = point.y; moveWorldActor(hero, hero.targetX, hero.targetY, 2.45, dt);
      }
      return;
    }
    hero.assisting = false;
    if (statusActive(hero, "stunnedUntil")) { hero.behaviorMode = "STUNNED"; return; }
    if (hero.retreating) {
      hero.behaviorMode = "RETREAT";
      const retreatPoint = hero.retreatTarget || (hero.retreatTarget = currentAreaEdgePoint(6100 + Number(String(hero.id).slice(1) || 1)));
      moveWorldActor(hero, retreatPoint.x, retreatPoint.y, 2.1, dt);
      if (Math.hypot(hero.x - retreatPoint.x, hero.y - retreatPoint.y) < .8) hero.retreatTarget = null;
      return;
    }
    const traits = hero.traits || [], aggression = number(traits[0], 55) / 100, empathy = number(traits[1], 55) / 100;
    const curiosity = number(traits[7], 50) / 100, restraint = number(traits[11], 55) / 100;
    const distanceToPlayer = Math.hypot(hero.x - state.player.x, hero.y - state.player.y);
    const nearestThreat = selectHeroThreat(hero);
    maintainStrongHeroDefense(hero);
    const rescueTarget = findNearestInjuredCivilian(hero, hero.senseDistance * (.65 + empathy * .35));
    if (hero.ai === 4 && hero.behaviorTimer <= 0) {
      const rollValue = seeded(Math.floor(state.worldTime * 2.2), Number(hero.id.slice(1)) + 520), resist = hero.resistBehavior || {};
      const stopChance = number(resist.stopAndSpeak, .04), berserkChance = number(resist.berserk, .015);
      if (rollValue < stopChance) {
        hero.refusalUntil = state.worldTime + 1.4 + (1 - restraint) * 1.8; hero.berserkUntil = 0;
        const line = unlockDialogue(hero.id, "REJECT_ORDER", "CONTROL_BREAK");
        if (line) { showNotice(hero.title + "：「" + line.text + "」"); playPseudoVoice(line.text, line.cat || 4); }
        addFloatingText(hero.x, hero.y, "抗拒操控", "#d9b4ff", 1.35, 11);
      } else if (rollValue < stopChance + berserkChance) {
        hero.berserkUntil = state.worldTime + .8 + (1 - restraint) * 1.2; hero.refusalUntil = 0;
        addFloatingText(hero.x, hero.y, "失控追逐", "#ff7c8b", 1.15, 11);
      }
      hero.behaviorTimer = 1.4 + seeded(Math.floor(state.worldTime * 3), Number(hero.id.slice(1)) + 540) * 2.4;
    }
    const refusing = hero.ai === 4 && state.worldTime < hero.refusalUntil;
    const berserk = hero.ai === 4 && state.worldTime < hero.berserkUntil;
    const urgentPlayerThreat = nearestThreat && nearestThreat.distance <= 3.3;
    const wantsRescue = Boolean(rescueTarget) && !refusing && !berserk && (
      hero.ai === 2 ? !urgentPlayerThreat
        : hero.ai === 1 ? !nearestThreat
          : hero.ai === 3 ? !nearestThreat && empathy >= .72
            : !nearestThreat && empathy >= .48
    );
    hero.wanderTimer -= dt; hero.detourTimer = Math.max(0, hero.detourTimer - dt);
    if (hero.wanderTimer <= 0 || Math.hypot(hero.targetX - hero.x, hero.targetY - hero.y) < .45) {
      let target;
      if (refusing) {
        hero.behaviorMode = "REFUSE";
        const angle = seeded(Math.floor(state.worldTime * 5), Number(hero.id.slice(1)) + 560) * Math.PI * 2;
        target = { x: hero.x + Math.cos(angle) * .8, y: hero.y + Math.sin(angle) * .8 };
      } else if (berserk) {
        hero.behaviorMode = "BERSERK"; target = state.player;
      } else if (wantsRescue) {
        hero.behaviorMode = "RESCUE"; target = rescueTarget.civilian;
      } else if (nearestThreat) {
        hero.behaviorMode = hero.ai === 1 ? "JUSTICE_HUNT" : hero.ai === 2 ? "GUARD" : hero.ai === 3 ? "SEEK_STRONGEST" : "UNSTABLE_FIGHT";
        target = nearestThreat.threat;
      } else if (playerMoving || distanceToPlayer > (hero.ai === 3 ? 8.4 : 5.8)) {
        hero.behaviorMode = "FOLLOW";
        const moveLength = Math.max(.001, Math.hypot(state.player.lastMoveX, state.player.lastMoveY));
        const forwardX = state.player.lastMoveX / moveLength, forwardY = state.player.lastMoveY / moveLength;
        const side = Math.sin(state.worldTime * 1.6 + hero.ai) * (hero.ai === 2 ? .9 : 1.8 + curiosity * 1.3);
        target = { x: state.player.x - forwardX * 1.1 - forwardY * side, y: state.player.y - forwardY * 1.1 + forwardX * side };
      } else {
        hero.behaviorMode = "PATROL";
        const patrolRadius = ([0, 5.2, 3.1, 7.4, 4.5][hero.ai] || 4) * (.78 + curiosity * .44);
        const angle = state.worldTime * .8 + hero.ai * 1.7 + seeded(Math.floor(state.worldTime * 2), hero.ai + 60) * Math.PI;
        target = { x: state.player.x + Math.cos(angle) * patrolRadius, y: state.player.y + Math.sin(angle) * patrolRadius };
      }
      const open = findOpenCurrentAreaPoint(target.x, target.y, 830 + hero.ai + Math.floor(state.worldTime * 3));
      hero.targetX = open.x; hero.targetY = open.y; hero.wanderTimer = playerMoving ? .34 : .55 + (1 - curiosity) * .65;
    }
    const beforeX = hero.x, beforeY = hero.y;
    const catchUp = distanceToPlayer > 8 ? 3.2 : hero.behaviorMode === "SEEK_STRONGEST" ? 2.35 + aggression : hero.behaviorMode === "RESCUE" ? 2.1 : playerMoving ? 2.25 : 1.35 + curiosity * .45;
    moveWorldActor(hero, hero.targetX, hero.targetY, catchUp, dt);
    const moved = Math.hypot(hero.x - beforeX, hero.y - beforeY);
    if (moved < .002 && Math.hypot(hero.targetX - hero.x, hero.targetY - hero.y) > .7) hero.stuckTime += dt; else hero.stuckTime = Math.max(0, hero.stuckTime - dt * 2);
    if (hero.stuckTime > .36) {
      // 被建築卡住時先做短距離亂走，再重新鎖定玩家最近路徑；離開視野則由上方的邊緣傳送保底。
      const angle = seeded(Math.floor(state.worldTime * 20), hero.ai + 71) * Math.PI * 2;
      const detour = findOpenCurrentAreaPoint(hero.x + Math.cos(angle) * 3.4, hero.y + Math.sin(angle) * 3.4, 880 + hero.ai);
      hero.targetX = detour.x; hero.targetY = detour.y; hero.wanderTimer = .32; hero.detourTimer = .32; hero.stuckTime = 0;
    }
    if (wantsRescue && rescueTarget.civilian.alive && Math.hypot(hero.x - rescueTarget.civilian.x, hero.y - rescueTarget.civilian.y) <= .9) {
      if (assistCivilian(hero, rescueTarget.civilian, "英雄救助")) addFloatingText(hero.x, hero.y, hero.title + "選擇救人", "#a9ffd0", 1.25, 10);
    }
    if (refusing) return;
    if (berserk) {
      if (Math.hypot(hero.x - state.player.x, hero.y - state.player.y) < .75 && hero.attackCooldown <= 0) { damagePlayer(2, "失控英雄"); hero.attackCooldown = 1.2; }
      return;
    }
    const move = heroMoveForStage(hero);
    if (!wantsRescue && nearestThreat && nearestThreat.threat.alive && move && Math.hypot(hero.x - nearestThreat.threat.x, hero.y - nearestThreat.threat.y) <= move.range && hero.attackCooldown <= 0) {
      executeHeroMove(hero, nearestThreat.threat, move);
    }
  }

  function updateAdditionalHeroes(dt, playerMoving) {
    state.extraHeroActors.forEach((hero, index) => {
      if (!hero || hero.alive === false) return;
      hero.attackCooldown = Math.max(0, hero.attackCooldown - dt); hero.rescueCooldown = Math.max(0, hero.rescueCooldown - dt); hero.teleportCooldown = Math.max(0, hero.teleportCooldown - dt); hero.behaviorTimer -= dt;
      const assistingObject = activeInteractionObject();
      const assistingLever = state.interaction.type === "HERO_LEVER" && state.interaction.heroId === hero.id && state.interaction.active && !state.interaction.waiting && assistingObject?.areaKey === coreSceneKey();
      if (!assistingLever) hero.focus = Math.min(hero.focusMax, hero.focus + hero.focusMax / 1.65 * dt);
      updateHeroResources(hero, dt);
      if (!heroActorInCurrentArea(hero)) placeHeroNearPlayer(hero, 5200 + index);
      const screen = iso(hero.x, hero.y, 0), offscreen = screen.x < -70 || screen.x > canvas.width + 70 || screen.y < 40 || screen.y > canvas.height + 70;
      if (offscreen && hero.teleportCooldown <= 0) { placeHeroNearPlayer(hero, 5300 + index + Math.floor(state.worldTime)); hero.teleportCooldown = 1.15; }
      if (assistingLever) {
        hero.assisting = true; hero.behaviorMode = "ASSIST_LEVER";
        if (Math.hypot(hero.x - assistingObject.x, hero.y - assistingObject.y) > .92) {
          const point = findOpenCurrentAreaPoint(assistingObject.x - .72, assistingObject.y + .64, 5320 + index + Math.floor(state.worldTime * 3));
          moveWorldActor(hero, point.x, point.y, 2.45, dt);
        }
        return;
      }
      hero.assisting = false;
      if (statusActive(hero, "stunnedUntil")) { hero.behaviorMode = "STUNNED"; return; }
      if (hero.retreating) {
        hero.behaviorMode = "RETREAT";
        const retreatPoint = hero.retreatTarget || (hero.retreatTarget = currentAreaEdgePoint(6200 + index));
        moveWorldActor(hero, retreatPoint.x, retreatPoint.y, 2.1, dt);
        if (Math.hypot(hero.x - retreatPoint.x, hero.y - retreatPoint.y) < .8) hero.retreatTarget = null;
        return;
      }
      let pause = false, berserk = false;
      if (hero.ai === 4 && hero.behaviorTimer <= 0) {
        const behavior = hero.resistBehavior || {}, rollValue = seeded(Math.floor(state.worldTime * 2.7), Number(String(hero.id).slice(1)) + index * 19 + 840);
        if (rollValue < number(behavior.stopAndSpeak, .04)) {
          hero.pauseUntil = state.worldTime + 1 + seeded(index, 92) * 1.5;
          const line = unlockDialogue(hero.id, "REJECT_ORDER", "CONTROL_BREAK");
          if (line) { showNotice(hero.title + "：「" + line.text + "」"); playPseudoVoice(line.text, line.cat || 4); }
        } else if (rollValue < number(behavior.stopAndSpeak, .04) + number(behavior.berserk, .02)) hero.berserkUntil = state.worldTime + 1.2;
        hero.behaviorTimer = 1.5 + seeded(index + Math.floor(state.worldTime), 93) * 2.2;
      }
      pause = state.worldTime < number(hero.pauseUntil, 0); berserk = state.worldTime < number(hero.berserkUntil, 0);
      const nearest = selectHeroThreat(hero), rescue = hero.faction === "HERO" ? findNearestInjuredCivilian(hero, hero.senseDistance * .8) : null;
      maintainStrongHeroDefense(hero);
      let target = nearest?.civilian || nearest?.threat || null;
      if (hero.faction === "ROGUE") target = nearest?.threat || state.heroActor || state.player;
      const urgentThreat = nearest && nearest.heroDistance < 3;
      if (hero.faction === "HERO" && hero.ai === 2 && rescue && !urgentThreat && !hero.forcedHostileTargetId) target = rescue.civilian;
      if (pause) { hero.behaviorMode = "REFUSE"; target = null; }
      if (berserk) { hero.behaviorMode = "BERSERK"; target = state.player; }
      if (state.worldTime < number(hero.guardUntil, 0)) { hero.behaviorMode = "DEFEND"; target = null; }
      if (!target) {
        const far = Math.hypot(hero.x - state.player.x, hero.y - state.player.y) > (hero.faction === "ROGUE" ? 7.5 : 5.5);
        hero.behaviorMode = far || playerMoving ? "FOLLOW" : "PATROL";
        const angle = state.worldTime * .72 + index * 1.8;
        target = far ? state.player : { x: state.player.x + Math.cos(angle) * (2.8 + hero.ai), y: state.player.y + Math.sin(angle) * (2.8 + hero.ai) };
      } else if (target === state.player) hero.behaviorMode = hero.faction === "ROGUE" ? "ROGUE_HUNT" : "FOLLOW";
      else if (target === rescue?.civilian) hero.behaviorMode = "RESCUE";
      else hero.behaviorMode = hero.ai === 3 ? "SEEK_STRONGEST" : hero.faction === "ROGUE" ? "ROGUE_FIGHT" : "ENGAGE";
      const targetPoint = findOpenCurrentAreaPoint(target.x, target.y, 5400 + index + Math.floor(state.worldTime * 2));
      const pace = hero.behaviorMode === "SEEK_STRONGEST" ? 2.65 : hero.behaviorMode === "ROGUE_HUNT" ? 2.85 : hero.behaviorMode === "RESCUE" ? 2.15 : 1.72;
      moveWorldActor(hero, targetPoint.x, targetPoint.y, pace, dt);
      if (hero.behaviorMode === "RESCUE" && target.alive && Math.hypot(hero.x - target.x, hero.y - target.y) < .95) assistCivilian(hero, target, "英雄救助");
      if (target === state.player) {
        if (Math.hypot(hero.x - state.player.x, hero.y - state.player.y) < .8 && hero.attackCooldown <= 0) { damagePlayer(2.5 * (hero.powerMultiplier || 1), hero.title); hero.attackCooldown = .95; addFloatingText(hero.x, hero.y, "失控攻擊", "#ff9ccc", 1, 11); }
        return;
      }
      const move = heroMoveForStage(hero, heroStageFor(hero));
      if (target && target.alive !== false && move && hero.attackCooldown <= 0 && Math.hypot(hero.x - target.x, hero.y - target.y) <= move.range) executeHeroMove(hero, target, move);
    });
    state.extraHeroActors = state.extraHeroActors.filter((hero) => hero.alive !== false || state.worldTime - number(hero.downAt, state.worldTime) < 6);
  }
