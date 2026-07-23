/* Canvas 渲染：角色、建築、場景、異常、目標箭頭、怪人、英雄與戰場特效。 */
  function drawCharacter(x, y, role, label, scale = 1) {
    const base = iso(x, y, 0), s = scale;
    ctx.save(); ctx.translate(base.x, base.y);
    ctx.globalAlpha = role.alpha ?? 1;
    if (role.upperOnly) { ctx.beginPath(); ctx.rect(-36 * s, -48 * s, 72 * s, 53 * s); ctx.clip(); }
    if (!role.hideFeet) { ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.beginPath(); ctx.ellipse(0, 1, 10 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); }
    const bodyColor = role.partialWhite ? "rgba(255,255,255,.72)" : role.body;
    const headColor = role.partialWhite ? "rgba(255,255,255,.9)" : (role.head || role.body);
    const stroke = role.partialWhite ? "rgba(255,255,255,.96)" : (role.stroke || "rgba(255,255,255,.86)");
    if (role.invertedTip) {
      // 玩家世界座標精確對齊倒三角形的下尖點；碰撞與受擊都以這一點判定。
      ctx.beginPath(); ctx.moveTo(-11 * s, -22 * s); ctx.lineTo(11 * s, -22 * s); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, 1.8 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -32 * s, 7 * s, 0, Math.PI * 2); ctx.fillStyle = headColor; ctx.fill(); ctx.strokeStyle = stroke; ctx.stroke();
      ctx.fillStyle = "#fff4a8"; ctx.beginPath(); ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2); ctx.fill();
      if (label) { ctx.fillStyle = role.labelColor || stroke; ctx.font = "bold " + Math.max(9, 10 * s) + "px system-ui"; ctx.textAlign = "center"; ctx.fillText(label, 0, -44 * s); }
    } else {
      ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(-11 * s, 14 * s); ctx.lineTo(11 * s, 14 * s); ctx.closePath(); ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, 1.6 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -17 * s, 7 * s, 0, Math.PI * 2); ctx.fillStyle = headColor; ctx.fill(); ctx.strokeStyle = stroke; ctx.stroke();
      if (label) { ctx.fillStyle = role.labelColor || stroke; ctx.font = "bold " + Math.max(9, 10 * s) + "px system-ui"; ctx.textAlign = "center"; ctx.fillText(label, 0, -28 * s); }
    }
    ctx.restore();
  }

  function exhaustionFlashVisible() {
    const rate = number(state.player.exhaustionDrainRate, 0);
    if (rate <= 0) return false;
    const frequency = clamp(.8 + rate * .12, .8, 7.5);
    return Math.sin(state.worldTime * Math.PI * 2 * frequency) > -.18;
  }

  function playerCharacterLabel() { return exhaustionFlashVisible() ? "力竭" : "玩家"; }

  function drawCivilian(civilian, alpha = .7) {
    const base = iso(civilian.x, civilian.y, 0), ratio = clamp(civilian.injury / civilian.maxHp, 0, 1);
    const sway = Math.sin(state.worldTime * (4 - ratio * 2.2) + civilian.phase) * (2 - ratio * .8);
    const red = Math.round(226 + 29 * ratio), green = Math.round(237 - 166 * ratio), blue = Math.round(239 - 155 * ratio);
    ctx.save(); ctx.translate(base.x + sway, base.y); ctx.globalAlpha = alpha + ratio * .28; ctx.strokeStyle = `rgb(${red},${green},${blue})`; ctx.fillStyle = `rgba(${red},${green},${blue},${.05 + ratio * .22})`; ctx.lineWidth = 1.5 + ratio * .55;
    ctx.beginPath(); ctx.arc(0, -15, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 7); ctx.moveTo(-7, 1); ctx.lineTo(7, -3); ctx.moveTo(0, 7); ctx.lineTo(-6, 16); ctx.moveTo(0, 7); ctx.lineTo(7, 14); ctx.stroke(); ctx.restore();
  }

  function drawKeyItem(target) {
    const point = iso(target.x, target.y, 0), pulse = 1 + Math.sin(state.worldTime * 4) * .12;
    ctx.save();
    ctx.fillStyle = "rgba(255,216,74,.14)"; ctx.strokeStyle = "rgba(255,231,120,.95)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.ellipse(point.x, point.y, 27 * pulse, 8 * pulse, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#fff0a0"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.fillText("進入金圈自動取得", point.x, point.y + 18);
    ctx.globalAlpha = .24; ctx.fillStyle = "#ffd84a"; ctx.beginPath(); ctx.arc(point.x, point.y - 12, 24 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,235,125,.72)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(point.x, point.y - 8); ctx.lineTo(point.x, point.y - 48); ctx.stroke();
    ctx.save(); ctx.translate(point.x, point.y - 13); ctx.scale(pulse, pulse); ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#fff4b0"; ctx.lineWidth = 2;
    if (target.family === "CARD") {
      ctx.beginPath(); ctx.rect(-10, -7, 20, 14); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(5, 0, 2.2, 0, Math.PI * 2); ctx.stroke();
    } else if (target.family === "CASE") {
      ctx.beginPath(); ctx.rect(-13, -8, 26, 16); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-5, -12); ctx.lineTo(5, -12); ctx.lineTo(5, -8); ctx.stroke();
    } else if (target.family === "MIC") {
      ctx.beginPath(); ctx.ellipse(0, -5, 7, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillRect(-2, 4, 4, 16); ctx.beginPath(); ctx.moveTo(-7, 20); ctx.lineTo(7, 20); ctx.stroke();
    } else if (target.family === "CAMERA") {
      ctx.beginPath(); ctx.rect(-14, -8, 28, 18); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 1, 6, 0, Math.PI * 2); ctx.fillStyle = "#5d4b12"; ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ffd84a"; ctx.fillRect(-8, -12, 10, 4);
    } else if (target.family === "DOCUMENT") {
      ctx.beginPath(); ctx.rect(-10, -13, 20, 26); ctx.fill(); ctx.stroke(); ctx.strokeStyle = "#7b651d"; ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(6, -5); ctx.moveTo(-6, 1); ctx.lineTo(6, 1); ctx.moveTo(-6, 7); ctx.lineTo(3, 7); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
    }
    ctx.restore(); ctx.fillStyle = "#fff5bd"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("疑似：" + target.vagueName, point.x, point.y - 62); ctx.restore();
  }

  function drawSceneObject(object) {
    if (!object || object.status === "DESTROYED") return;
    const point = iso(object.x, object.y, 0), near = playerWorldDistance(state.player, object) <= INTERACTION_RULES.radius, active = state.interaction.objectId === object.id;
    const completed = object.status === "COMPLETE", heroLever = object.interactionType === "HERO_LEVER";
    const color = completed ? "#6f9a88" : heroLever ? "#ffd16a" : object.status === "PARTIAL" ? "#cba8ff" : "#73e7ed";
    const glow = near || active ? .34 + Math.sin(state.worldTime * 4) * .1 : .12;
    ctx.save(); ctx.translate(point.x, point.y);
    ctx.globalAlpha = glow; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 1, 22, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = near || active ? 2.1 : 1.3; ctx.beginPath(); ctx.ellipse(0, 1, 17, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    if (object.primitive === "CYLINDER") {
      ctx.fillStyle = completed ? "#436257" : "#386e76"; ctx.fillRect(-7, -27, 14, 27); ctx.beginPath(); ctx.ellipse(0, -27, 7, 3.2, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(-2, -23, 2, 15);
    } else if (object.primitive === "LEVER") {
      ctx.fillStyle = "#4c5b65"; ctx.fillRect(-5, -13, 10, 14); ctx.strokeStyle = color; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, -28); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(10, -29, 4.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-12, -7); ctx.lineTo(0, -14); ctx.lineTo(12, -7); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = completed ? "#486256" : "#396d78"; ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -7); ctx.lineTo(-12, -24); ctx.lineTo(0, -31); ctx.lineTo(0, -14); ctx.closePath(); ctx.fillStyle = "#2c5361"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, -7); ctx.lineTo(12, -24); ctx.lineTo(0, -31); ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = .72; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
    if (near || active) {
      ctx.fillStyle = "#effff5"; ctx.strokeStyle = "rgba(4,12,10,.88)"; ctx.lineWidth = 3; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center";
      const progress = object.interactionType === "HERO_LEVER" ? Math.round(object.progress) + "／" + INTERACTION_RULES.heroLeverProgress : object.interactionType === "SUSTAINED" ? "穩 " + Math.round(object.stableProgress || 0) + "／" + (object.stableRequired || INTERACTION_RULES.sustainedStableRequired) + "｜維 " + Math.round(object.maintenanceProgress || 0) + "／" + (object.maintenanceRequired || INTERACTION_RULES.sustainedProgressRequired) : object.parts.length > 1 ? "模組 " + (object.partIndex + 1) + "／" + object.parts.length : Math.round(object.parts[0]?.progress || 0) + "／" + object.requiredFocus;
      const label = object.name + (completed ? "｜完成" : "｜" + progress);
      ctx.strokeText(label, 0, -42); ctx.fillText(label, 0, -42);
    }
    ctx.restore();
  }

  function drawSceneObjects() { currentSceneObjects().slice().sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach(drawSceneObject); }

  function drawSceneGate(objective) {
    const point = iso(objective.x, objective.y, 0), pulse = .72 + Math.sin(state.worldTime * 3.2) * .12;
    ctx.save(); ctx.translate(point.x, point.y); ctx.globalAlpha = .25 + pulse * .2; ctx.fillStyle = "#ffd84a"; ctx.beginPath(); ctx.ellipse(0, -18, 30, 42, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffe46f"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-17, 2); ctx.lineTo(-17, -28); ctx.quadraticCurveTo(0, -50, 17, -28); ctx.lineTo(17, 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,216,74,.18)"; ctx.fillRect(-14, -29, 28, 31); ctx.fillStyle = "#fff3af"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("出入口", 0, -56); ctx.restore();
  }

  function drawNavigationDirection(objective) {
    if (!objective) return;
    const target = iso(objective.x, objective.y, 0), player = iso(state.player.x, state.player.y, 0);
    const safe = { left: 46, right: canvas.width - 46, top: 100, bottom: canvas.height - 50 };
    const visible = target.x >= safe.left && target.x <= safe.right && target.y >= safe.top && target.y <= safe.bottom;
    let x, y, angle;
    if (visible) { x = target.x; y = target.y - 52; angle = Math.PI / 2; }
    else {
      const cx = canvas.width / 2, cy = canvas.height / 2, dx = target.x - player.x, dy = target.y - player.y;
      const length = Math.max(1, Math.hypot(dx, dy)), ux = dx / length, uy = dy / length;
      const tx = ux > 0 ? (safe.right - cx) / Math.max(.001, ux) : ux < 0 ? (safe.left - cx) / Math.min(-.001, ux) : Infinity;
      const ty = uy > 0 ? (safe.bottom - cy) / Math.max(.001, uy) : uy < 0 ? (safe.top - cy) / Math.min(-.001, uy) : Infinity;
      const distance = Math.max(0, Math.min(Math.abs(tx), Math.abs(ty)));
      x = clamp(cx + ux * distance, safe.left, safe.right); y = clamp(cy + uy * distance, safe.top, safe.bottom); angle = Math.atan2(uy, ux);
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#fff4b0"; ctx.lineWidth = 2; ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-9, -11); ctx.lineTo(-4, 0); ctx.lineTo(-9, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.fillStyle = "#fff3ac"; ctx.strokeStyle = "rgba(5,12,10,.88)"; ctx.lineWidth = 4; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; const labelX = clamp(x, 100, canvas.width - 100), labelY = clamp(y - 21, 82, canvas.height - 26); ctx.strokeText(objective.label, labelX, labelY); ctx.fillText(objective.label, labelX, labelY); ctx.restore();
  }

  // 主目標維持完整箭頭；其餘最多六個目標只顯示小型邊緣記號，避免畫面被測試資訊佔滿。
  function drawSecondaryNavigationDirections(primary) {
    const secondary = state.core.objectives.list().filter((entry) => entry.id !== primary?.id).slice(0, 6);
    if (!secondary.length) return;
    const player = iso(state.player.x, state.player.y, 0), safe = { left: 34, right: canvas.width - 34, top: 94, bottom: canvas.height - 38 };
    secondary.forEach((objective, index) => {
      const target = iso(objective.x, objective.y, 0), dx = target.x - player.x, dy = target.y - player.y, length = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / length, uy = dy / length;
      const tx = ux > 0 ? (safe.right - canvas.width / 2) / Math.max(.001, ux) : ux < 0 ? (safe.left - canvas.width / 2) / Math.min(-.001, ux) : Infinity;
      const ty = uy > 0 ? (safe.bottom - canvas.height / 2) / Math.max(.001, uy) : uy < 0 ? (safe.top - canvas.height / 2) / Math.min(-.001, uy) : Infinity;
      const distance = Math.max(0, Math.min(Math.abs(tx), Math.abs(ty)) - index * 10);
      const x = clamp(canvas.width / 2 + ux * distance, safe.left, safe.right), y = clamp(canvas.height / 2 + uy * distance, safe.top, safe.bottom);
      const color = objective.kind === "CANDIDATE" ? "#79f0aa" : objective.kind === "SAFE_EXIT" ? "#b7f6ff" : "#ffd84a";
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux)); ctx.fillStyle = color; ctx.strokeStyle = "rgba(3,11,9,.9)"; ctx.lineWidth = 2; ctx.globalAlpha = .82;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }

  function drawHeroLocator() {
    const hero = state.heroActor;
    if (!hero || hero.areaMode !== state.areaMode || hero.buildingId !== state.currentBuildingId) return;
    const target = iso(hero.x, hero.y, 0), player = iso(state.player.x, state.player.y, 0), safe = { left: 64, right: canvas.width - 64, top: 118, bottom: canvas.height - 64 };
    if (target.x >= safe.left && target.x <= safe.right && target.y >= safe.top && target.y <= safe.bottom) return;
    const cx = canvas.width / 2, cy = canvas.height / 2, dx = target.x - player.x, dy = target.y - player.y, length = Math.max(1, Math.hypot(dx, dy)), ux = dx / length, uy = dy / length;
    const tx = ux > 0 ? (safe.right - cx) / Math.max(.001, ux) : ux < 0 ? (safe.left - cx) / Math.min(-.001, ux) : Infinity;
    const ty = uy > 0 ? (safe.bottom - cy) / Math.max(.001, uy) : uy < 0 ? (safe.top - cy) / Math.min(-.001, uy) : Infinity;
    const distance = Math.max(0, Math.min(Math.abs(tx), Math.abs(ty))), x = clamp(cx + ux * distance, safe.left, safe.right), y = clamp(cy + uy * distance, safe.top, safe.bottom), angle = Math.atan2(uy, ux);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = "#79f0aa"; ctx.strokeStyle = "#e5ffed"; ctx.lineWidth = 1.6; ctx.shadowColor = "#67e6a2"; ctx.shadowBlur = 11; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.fillStyle = "#b9ffd0"; ctx.strokeStyle = "rgba(4,12,9,.88)"; ctx.lineWidth = 3; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.strokeText(hero.title, clamp(x, 80, canvas.width - 80), clamp(y - 15, 104, canvas.height - 22)); ctx.fillText(hero.title, clamp(x, 80, canvas.width - 80), clamp(y - 15, 104, canvas.height - 22)); ctx.restore();
  }

  function playerLookingAtHero(hero = state.heroActor) {
    if (!hero || hero.areaMode !== state.areaMode || hero.buildingId !== state.currentBuildingId) return false;
    const dx = hero.x - state.player.x, dy = hero.y - state.player.y, distance = Math.hypot(dx, dy), facing = Math.hypot(state.player.lastMoveX, state.player.lastMoveY);
    if (distance < .35 || distance > hero.senseDistance || facing < .01) return false;
    return (state.player.lastMoveX * dx + state.player.lastMoveY * dy) / (facing * distance) >= .58 && hasCurrentAreaLineOfSight(state.player, hero);
  }

  function drawHeroCourageSupport() {
    const hero = state.heroActor;
    if (!playerLookingAtHero(hero)) return;
    const point = iso(hero.x, hero.y, 0), pulse = .7 + Math.sin(state.worldTime * 5) * .15;
    ctx.save(); ctx.translate(point.x, point.y - 52); ctx.globalAlpha = .92; ctx.fillStyle = "#b8ffd0"; ctx.strokeStyle = "rgba(4,12,9,.9)"; ctx.lineWidth = 3; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center";
    ctx.strokeText("給予勇氣", 0, 0); ctx.fillText("給予勇氣", 0, 0); ctx.fillStyle = "#67e6a2"; ctx.beginPath(); ctx.arc(0, 8, 3 + pulse * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawAdditionalHeroes() {
    state.extraHeroActors.filter((hero) => heroActorInCurrentArea(hero)).forEach((hero) => {
      const stage = heroStageFor(hero), rogue = hero.faction === "ROGUE";
      const body = rogue ? "#df5a9b" : stage === "C" ? "#ffe06a" : "#5bd99c";
      const head = rogue ? "#ffc2df" : stage === "C" ? "#fff3a0" : "#c3ffe0";
      drawCharacter(hero.x, hero.y, { body, head, stroke: "#ffffff", labelColor: rogue ? "#ffc5df" : "#c8ffdb" }, hero.title, rogue ? 1 : .88);
    });
  }
  function drawAdditionalHeroLocators() {
    state.extraHeroActors.filter((hero) => heroActorInCurrentArea(hero)).forEach((hero, index) => {
      const target = iso(hero.x, hero.y, 0), player = iso(state.player.x, state.player.y, 0), safe = { left: 64, right: canvas.width - 64, top: 118, bottom: canvas.height - 64 };
      if (target.x >= safe.left && target.x <= safe.right && target.y >= safe.top && target.y <= safe.bottom) return;
      const cx = canvas.width / 2, cy = canvas.height / 2, dx = target.x - player.x, dy = target.y - player.y, length = Math.max(1, Math.hypot(dx, dy)), ux = dx / length, uy = dy / length;
      const tx = ux > 0 ? (safe.right - cx) / Math.max(.001, ux) : ux < 0 ? (safe.left - cx) / Math.min(-.001, ux) : Infinity, ty = uy > 0 ? (safe.bottom - cy) / Math.max(.001, uy) : uy < 0 ? (safe.top - cy) / Math.min(-.001, uy) : Infinity;
      const distance = Math.max(0, Math.min(Math.abs(tx), Math.abs(ty)) - index * 12), x = clamp(cx + ux * distance, safe.left, safe.right), y = clamp(cy + uy * distance, safe.top, safe.bottom);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux)); ctx.fillStyle = hero.faction === "ROGUE" ? "#f27eae" : "#79f0aa"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -6); ctx.lineTo(-2, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }

  function drawStarBurst(effect) {
    if (!effect) return;
    const center = iso(state.player.x, state.player.y, 30), outer = 22 * effect.scale, inner = outer * 0.34;
    ctx.save(); ctx.translate(center.x, center.y);
    ctx.beginPath();
    for (let i = 0; i < effect.points * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner, angle = -Math.PI / 2 + Math.PI * i / effect.points;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = effect.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, effect.scale * 1.5); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawWorldEffects() {
    state.fieldBursts.forEach((effect) => {
      const life = clamp((state.worldTime - effect.bornAt) / (effect.expiresAt - effect.bornAt), 0, 1), point = iso(effect.x, effect.y, 12);
      const outer = (8 + life * 11) * effect.size, inner = outer * .34;
      ctx.save(); ctx.translate(point.x, point.y); ctx.globalAlpha = 1 - life; ctx.beginPath();
      for (let index = 0; index < 16; index += 1) { const radius = index % 2 ? inner : outer, angle = -Math.PI / 2 + Math.PI * index / 8; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fillStyle = "#ffb13b"; ctx.strokeStyle = "#fff3b0"; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke(); ctx.restore();
    });
    state.floatingTexts.forEach((effect) => {
      const life = clamp((state.worldTime - effect.bornAt) / (effect.expiresAt - effect.bornAt), 0, 1), point = iso(effect.x, effect.y, 22);
      ctx.save(); ctx.globalAlpha = 1 - Math.pow(life, 1.7); ctx.fillStyle = effect.color; ctx.strokeStyle = "rgba(9,12,12,.92)"; ctx.lineWidth = 3; ctx.font = `bold ${effect.size}px system-ui`; ctx.textAlign = "center"; ctx.strokeText(effect.text, point.x, point.y - life * 25); ctx.fillText(effect.text, point.x, point.y - life * 25); ctx.restore();
    });
  }

  function drawSceneAnomalies() {
    activeSceneAnomalies().forEach((anomaly) => {
      const point = iso(anomaly.x, anomaly.y, 0), pulse = 1 + Math.sin(state.worldTime * 4 + anomaly.x) * .08;
      const color = anomaly.color || "#ffffff";
      ctx.save(); ctx.translate(point.x, point.y);
      if (anomaly.type === "SMOKE_ACTIVE") {
        for (let index = 0; index < 5; index += 1) { const phase = state.worldTime * .4 + index * 1.7; ctx.globalAlpha = .12 + index * .035; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(Math.sin(phase) * 18, -18 - index * 9 - Math.cos(phase) * 8, 14 + index * 3, 0, Math.PI * 2); ctx.fill(); }
      } else if (anomaly.type === "TOXIC") {
        ctx.globalAlpha = .18; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, anomaly.radius * PROJECTION_SCALE * pulse, Math.max(7, anomaly.radius * 7 * pulse), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .68; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
      } else if (anomaly.type === "EXPLODED") {
        ctx.globalAlpha = .34; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -12, 22 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .9; ctx.strokeStyle = "#fff2b2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -12, 14 * pulse, 0, Math.PI * 2); ctx.stroke();
      } else if (anomaly.type === "DROPPED") {
        ctx.fillStyle = "#655341"; ctx.strokeStyle = "#ffcc80"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(0, -17); ctx.lineTo(18, -6); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (anomaly.type === "POWER_OFF") {
        ctx.globalAlpha = .58; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -25); ctx.lineTo(0, -10); ctx.lineTo(16, -25); ctx.moveTo(0, -34); ctx.lineTo(0, -4); ctx.stroke();
      }
      ctx.globalAlpha = .9; ctx.fillStyle = "#f7fff8"; ctx.strokeStyle = "rgba(3,10,8,.85)"; ctx.lineWidth = 3; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.strokeText(anomaly.label, 0, -40); ctx.fillText(anomaly.label, 0, -40); ctx.restore();
    });
    dynamicObstaclesForArea().forEach((obstacle) => {
      const point = iso(obstacle.x, obstacle.y, 0), color = obstacle.color || "#71d9ff";
      ctx.save(); ctx.translate(point.x, point.y); ctx.globalAlpha = .75; ctx.strokeStyle = color; ctx.fillStyle = "rgba(47,135,180,.15)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, obstacle.radius * PROJECTION_SCALE, Math.max(5, obstacle.radius * PROJECTION_SCALE * Math.sin(PROJECTION_ANGLE) * 1.55), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.fillText(obstacle.kind === "SEALED_ROUTE" ? "封鎖" : "障礙", 0, -12); ctx.restore();
    });
  }
  function drawSceneDarkness() {
    const alpha = currentDarknessAlpha(); if (alpha <= 0) return;
    ctx.save(); ctx.fillStyle = "rgba(0,3,8," + alpha + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const player = iso(state.player.x, state.player.y, 0), light = ctx.createRadialGradient(player.x, player.y - 16, 6, player.x, player.y - 16, 110);
    light.addColorStop(0, "rgba(0,0,0,0)"); light.addColorStop(1, "rgba(0,0,0,.48)"); ctx.fillStyle = light; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
  }

  function iso(x, y, z) {
    const relX = x - state.camera.x, relY = y - state.camera.y;
    const horizontal = Math.cos(PROJECTION_ANGLE) * PROJECTION_SCALE, vertical = Math.sin(PROJECTION_ANGLE) * PROJECTION_SCALE;
    return { x: canvas.width / 2 + (relX - relY) * horizontal, y: canvas.height / 2 + (relX + relY) * vertical - (z || 0) };
  }
  function drawDiamond(x, y, size, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * 2, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size * 2, y); ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = stroke || fill; ctx.fill(); ctx.stroke();
  }
  function drawGroundTile(x, y, fill, stroke) {
    const a = iso(x, y, 0), b = iso(x + 1, y, 0), c = iso(x + 1, y + 1, 0), d = iso(x, y + 1, 0);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = stroke || fill; ctx.fill(); ctx.stroke();
  }
  function buildingCorners(building, z = 0) {
    return [
      iso(building.x - building.width, building.y - building.depth, z),
      iso(building.x + building.width, building.y - building.depth, z),
      iso(building.x + building.width, building.y + building.depth, z),
      iso(building.x - building.width, building.y + building.depth, z)
    ];
  }
  function tracePolygon(points) {
    ctx.beginPath(); points.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }); ctx.closePath();
  }
  function drawBuildingFootprint(building, overlay = false) {
    const corners = buildingCorners(building, 0); ctx.save(); tracePolygon(corners);
    ctx.fillStyle = overlay ? "rgba(44,180,255,.025)" : "rgba(44,180,255,.11)"; ctx.strokeStyle = overlay ? "rgba(91,210,255,.92)" : "rgba(76,194,255,.72)"; ctx.lineWidth = overlay ? 2.2 : 1.7; ctx.fill(); ctx.stroke();
    corners.forEach((corner) => { ctx.fillStyle = "#79dcff"; ctx.beginPath(); ctx.arc(corner.x, corner.y, overlay ? 2.3 : 1.7, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
  }
  function drawBuilding(b) {
    const base = buildingCorners(b, 0), top = buildingCorners(b, b.height), label = iso(b.x, b.y, b.height);
    ctx.save(); ctx.globalAlpha = .88;
    tracePolygon([base[1], base[2], top[2], top[1]]); ctx.fillStyle = b.color; ctx.fill();
    tracePolygon([base[2], base[3], top[3], top[2]]); ctx.fillStyle = b.side; ctx.fill();
    tracePolygon(top); ctx.fillStyle = b.roof; ctx.fill(); ctx.strokeStyle = "rgba(230,247,255,.24)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = "#d8e8f0"; ctx.strokeStyle = "rgba(5,14,20,.84)"; ctx.lineWidth = 3; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.strokeText(b.label, label.x, label.y - 8); ctx.fillText(b.label, label.x, label.y - 8); ctx.restore();
  }

  function drawBuildingEntrances(building, objective) {
    building.entrances.forEach((entrance) => {
      const point = iso(entrance.x, entrance.y, 0), center = iso(building.x, building.y, 0), active = objective?.kind === "GATE" && objective.id === entrance.id;
      const angle = Math.atan2(center.y - point.y, center.x - point.x), pulse = 1 + Math.sin(state.worldTime * 4 + Number(building.id.slice(1))) * .12;
      ctx.save(); ctx.translate(point.x, point.y - 8); ctx.rotate(angle); ctx.globalAlpha = active ? 1 : .72; ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = active ? 18 : 7; ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#fff2a3"; ctx.lineWidth = active ? 2 : 1.3;
      ctx.beginPath(); ctx.moveTo(14 * pulse, 0); ctx.lineTo(-8, -8); ctx.lineTo(-3, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      if (active || playerWorldDistance(state.player, entrance) < 7) { ctx.save(); ctx.fillStyle = active ? "#fff4b0" : "#e7cf70"; ctx.strokeStyle = "rgba(5,12,12,.86)"; ctx.lineWidth = 3; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; const text = active ? building.label + "｜目標入口" : building.label + "｜入口"; ctx.strokeText(text, point.x, point.y - 25); ctx.fillText(text, point.x, point.y - 25); ctx.restore(); }
    });
  }

  function buildingOccludesPlayer(building) {
    const point = iso(state.player.x, state.player.y, 0), base = iso(building.x, building.y, 0), top = iso(building.x, building.y, building.height);
    const halfWidth = building.width * PROJECTION_SCALE * 1.08;
    const roofDepth = building.depth * PROJECTION_SCALE;
    return point.x > base.x - halfWidth && point.x < base.x + halfWidth && point.y > top.y - roofDepth && point.y < base.y + 5;
  }
  function drawHexBody(x, y, color, stroke, size, phase) {
    const point = iso(x, y, 0), wobble = Math.sin(state.worldTime * 10 + phase) * 3;
    ctx.save(); ctx.translate(point.x + wobble, point.y - 5); ctx.fillStyle = color; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i < 6; i += 1) { const angle = Math.PI / 6 + i * Math.PI / 3; const px = Math.cos(angle) * size, py = Math.sin(angle) * size; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -size - 7, Math.max(4, size * .62), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawCrowdAndEnemies() {
    // 路人保有世界座標；視野外產生點持續送出兩股非平行逃難流，不會綁在玩家身上一起平移。
    state.civilians.forEach((civilian) => {
      if (!civilian.alive) return;
      const point = iso(civilian.x, civilian.y, 0);
      if (point.x < -50 || point.x > canvas.width + 50 || point.y < -50 || point.y > canvas.height + 50) return;
      drawCivilian(civilian, .52);
    });
    state.experienceDrops.forEach((drop) => {
      const point = iso(drop.x, drop.y, 0), pulse = 1 + Math.sin(state.worldTime * 12) * .16;
      ctx.save(); ctx.translate(point.x, point.y - 11); ctx.fillStyle = "#ffdf62"; ctx.strokeStyle = "#fff5b8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 4.5 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    state.freeMinionActors.forEach((actor) => {
      if (!actor.alive) return;
      const point = iso(actor.x, actor.y, 0);
      if (point.x < -60 || point.x > canvas.width + 60 || point.y < -60 || point.y > canvas.height + 60) return;
      drawHexBody(actor.x, actor.y, "#d94155", "#ffaaa0", 6.5, actor.id + state.worldTime * 2);
    });
  }

  function drawMonsterAndMinions() {
    const monster = state.giantThreatActive ? (state.giantThreatActor || state.monsterActor) : state.monsterActor;
    if (!monsterInCurrentArea(monster)) return;
    state.monsterMinionActors.forEach((actor, index) => {
      if (actor.alive && actor.areaMode === state.areaMode && actor.buildingId === state.currentBuildingId) drawHexBody(actor.x, actor.y, "#9e3044", "#e77a7a", 5, index + 20);
    });
    const point = iso(monster.x, monster.y, 0);
    const scale = monster === state.giantThreatActor ? state.giantThreatScale : 1;
    drawHexBody(monster.x, monster.y, "#df3e53", "#ffb0a8", 14 * scale, state.worldTime);
    ctx.save(); ctx.fillStyle = "#ffe1d8"; ctx.strokeStyle = "rgba(22,5,8,.9)"; ctx.lineWidth = 4; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    const monsterLabel = monster.title + "　Lv." + (monster.level || state.monsterLevel || 1) + "｜" + (MONSTER_ATTACK_MODES[monster.attackMode] || "追壓型");
    ctx.strokeText(monsterLabel, point.x, point.y - 38 * scale); ctx.fillText(monsterLabel, point.x, point.y - 38 * scale); ctx.restore();
  }
  function drawAlienMessenger() {
    const alien = state.alienMessenger;
    if (!alien || !state.alienMessengerActive || alien.areaMode !== state.areaMode || alien.buildingId !== state.currentBuildingId) return;
    drawCharacter(alien.x, alien.y, { body: "#a879ff", head: "#e4d0ff", stroke: "#f4e9ff", labelColor: "#e5c8ff" }, alien.title, .86);
    const point = iso(alien.x, alien.y, 0); ctx.save(); ctx.strokeStyle = "rgba(212,154,255,.72)"; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(point.x, point.y - 10, 19 + Math.sin(state.worldTime * 4) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  function drawRegionBoundaries() {
    WORLD_REGIONS.forEach((region) => {
      const visual = SCENE_VISUALS[region.scene], corners = [
        iso(region.xMin, region.yMin, 0), iso(region.xMax, region.yMin, 0),
        iso(region.xMax, region.yMax, 0), iso(region.xMin, region.yMax, 0)
      ];
      ctx.save(); tracePolygon(corners); ctx.fillStyle = "rgba(0,0,0,0)"; ctx.strokeStyle = visual.color + "99"; ctx.lineWidth = 2.4; ctx.setLineDash([12, 8]); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    });
  }
  function drawWorldBoundary() {
    const corners = [
      { x: WORLD_BOUNDS.xMin, y: WORLD_BOUNDS.yMin },
      { x: WORLD_BOUNDS.xMax, y: WORLD_BOUNDS.yMin },
      { x: WORLD_BOUNDS.xMax, y: WORLD_BOUNDS.yMax },
      { x: WORLD_BOUNDS.xMin, y: WORLD_BOUNDS.yMax }
    ];
    ctx.save(); ctx.strokeStyle = "rgba(255,216,74,.62)"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath();
    corners.forEach((corner, index) => { const point = iso(corner.x, corner.y, 0); if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    corners.forEach((corner) => { const point = iso(corner.x, corner.y, 0); if (point.x > -80 && point.x < canvas.width + 80 && point.y > -80 && point.y < canvas.height + 80) { ctx.fillStyle = "#fff4b0"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("地圖邊界", point.x, point.y - 9); } });
    ctx.restore();
  }

  function drawProjectedRect(rect, fill, stroke, lineWidth = 1) {
    const points = [
      iso(rect.x - rect.halfWidth, rect.y - rect.halfHeight, 0), iso(rect.x + rect.halfWidth, rect.y - rect.halfHeight, 0),
      iso(rect.x + rect.halfWidth, rect.y + rect.halfHeight, 0), iso(rect.x - rect.halfWidth, rect.y + rect.halfHeight, 0)
    ];
    ctx.save(); tracePolygon(points); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function roundedRectWorldPoints(rect, segments = 4) {
    const radius = Math.min(rect.radius || 1, rect.halfWidth, rect.halfHeight), points = [];
    const corners = [
      { x: rect.x + rect.halfWidth - radius, y: rect.y - rect.halfHeight + radius, start: -Math.PI / 2 },
      { x: rect.x + rect.halfWidth - radius, y: rect.y + rect.halfHeight - radius, start: 0 },
      { x: rect.x - rect.halfWidth + radius, y: rect.y + rect.halfHeight - radius, start: Math.PI / 2 },
      { x: rect.x - rect.halfWidth + radius, y: rect.y - rect.halfHeight + radius, start: Math.PI }
    ];
    corners.forEach((corner) => { for (let step = 0; step <= segments; step += 1) { const angle = corner.start + step / segments * Math.PI / 2; points.push(iso(corner.x + Math.cos(angle) * radius, corner.y + Math.sin(angle) * radius, 0)); } });
    return points;
  }

  function drawProjectedRoundedRect(rect, fill, stroke, lineWidth = 1) {
    ctx.save(); tracePolygon(roundedRectWorldPoints(rect)); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawInteriorPillar(pillar, visual) {
    if (pillar.shape === "SQUARE") {
      drawProjectedRect({ x: pillar.x, y: pillar.y, halfWidth: pillar.radius, halfHeight: pillar.radius }, "rgba(44,180,255,.13)", "rgba(91,210,255,.95)", 2);
      drawBuilding({ x: pillar.x, y: pillar.y, width: pillar.radius, depth: pillar.radius, height: pillar.height, color: visual.side, side: visual.building, roof: visual.roof, label: "" });
      return;
    }
    const base = iso(pillar.x, pillar.y, 0), top = iso(pillar.x, pillar.y, pillar.height), radiusX = pillar.radius * PROJECTION_SCALE * 1.25, radiusY = Math.max(4, pillar.radius * PROJECTION_SCALE * Math.sin(PROJECTION_ANGLE) * 1.8);
    ctx.save(); ctx.fillStyle = "rgba(44,180,255,.13)"; ctx.strokeStyle = "rgba(91,210,255,.95)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(base.x, base.y, radiusX, radiusY, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = visual.side; ctx.beginPath(); ctx.rect(base.x - radiusX, top.y, radiusX * 2, base.y - top.y); ctx.fill();
    ctx.fillStyle = visual.roof; ctx.strokeStyle = "rgba(230,247,255,.4)"; ctx.beginPath(); ctx.ellipse(top.x, top.y, radiusX, radiusY, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawInteriorExit(interior, objective) {
    const point = iso(interior.entry.x, interior.entry.y, 0), active = objective?.kind === "EXIT", pulse = 1 + Math.sin(state.worldTime * 4) * .1;
    ctx.save(); ctx.translate(point.x, point.y - 8); ctx.rotate(Math.PI); ctx.globalAlpha = active ? 1 : .78; ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = active ? 18 : 7; ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#fff2a3"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(15 * pulse, 0); ctx.lineTo(-8, -8); ctx.lineTo(-3, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.fillStyle = "#fff4b0"; ctx.strokeStyle = "rgba(5,12,12,.86)"; ctx.lineWidth = 3; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.strokeText("同棟出口", point.x, point.y - 27); ctx.fillText("同棟出口", point.x, point.y - 27); ctx.restore();
  }

  function drawInteriorMinions(interior) {
    interior.minions.forEach((actor, index) => { if (actor.alive) drawHexBody(actor.x, actor.y, "#d94155", "#ffaaa0", 6.5, index + actor.phase); });
  }

  function drawInteriorCanvas() {
    const visual = currentSceneVisual(), interior = currentInterior(), building = currentBuilding();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height); gradient.addColorStop(0, visual.top); gradient.addColorStop(1, "#040908"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!interior || !building) return;
    if (interior.type === "PILLARS") {
      const boundary = interior.boundary || { x: 0, y: 0, halfWidth: 14.1, halfHeight: 9.1, radius: 1.6 };
      drawProjectedRoundedRect(boundary, visual.tileB, "rgba(110,215,255,.68)", 2.5);
      for (let y = -9; y <= 9; y += 1) for (let x = -14; x <= 14; x += 1) drawGroundTile(x, y, (x + y) % 2 ? visual.tileA : visual.tileB, "rgba(255,255,255,.025)");
      drawProjectedRoundedRect(boundary, "rgba(0,0,0,0)", "rgba(110,215,255,.78)", 2.7);
      interior.pillars.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach((pillar) => drawInteriorPillar(pillar, visual));
    } else {
      interior.corridors.forEach((rect) => drawProjectedRect(rect, rect.kind === "MAIN_CORRIDOR" || rect.kind === "TURN_CORRIDOR" || rect.kind === "DEEP_CORRIDOR" ? visual.tileA : "rgba(55,83,91,.72)", "rgba(151,206,222,.32)", 1.2));
      interior.rooms.forEach((rect) => drawProjectedRect(rect, rect.kind === "DEEPEST_ROOM" ? "rgba(104,72,122,.92)" : rect.kind === "SPECIAL_CHAMBER" ? "rgba(63,48,78,.94)" : visual.tileB, rect.kind === "DEEPEST_ROOM" ? "rgba(255,216,74,.72)" : "rgba(110,215,255,.55)", rect.kind === "DEEPEST_ROOM" ? 2.4 : 1.8));
    }
    updateHeroCandidateAvailability();
    const objective = currentNavigationObjective(), item = currentKeyItem();
    drawInteriorExit(interior, objective);
    if (item && isEntityInCurrentArea(item)) drawKeyItem(item);
    drawSceneObjects(); drawSceneAnomalies();
    drawInteriorMinions(interior);
    drawMonsterAndMinions();
    if (state.heroCandidate.present && !state.heroCandidate.awakened) drawCharacter(state.heroCandidate.x, state.heroCandidate.y, { body: "#9a9485", head: "#e7dfcf", stroke: state.heroCandidate.locatable ? "#ffe3a0" : "#d9dfda", labelColor: state.heroCandidate.locatable ? "#ffe3a0" : "#d9dfda" }, state.heroCandidate.locatable ? "可能覺醒的人｜" + state.heroCandidate.name : "自行避難的人", .92);
    drawCharacter(state.player.x, state.player.y, { body: "#47b9ef", head: "#f5fdff", stroke: "#ffffff", labelColor: exhaustionFlashVisible() ? "#ff5b55" : "#ffffff", invertedTip: true }, playerCharacterLabel(), 1.12);
    if (state.heroActor && state.heroStage !== "NONE" && state.heroActor.alive !== false) drawCharacter(state.heroActor.x, state.heroActor.y, { body: state.heroStage === "C" ? "#ffe06a" : "#67d391", head: state.heroStage === "C" ? "#fff3a0" : "#b9ffd0", stroke: "#ffffff", labelColor: "#b9ffd0" }, state.heroActor.title, .94);
    drawAdditionalHeroes();
    drawAlienMessenger(); drawNavigationDirection(objective); drawSecondaryNavigationDirections(objective); drawHeroLocator(); drawAdditionalHeroLocators(); drawHeroCourageSupport(); drawWorldEffects(); drawSceneDarkness(); drawStarBurst(state.lastBurst);
  }

  function drawCanvas() {
    if (state.areaMode === "INTERIOR") { drawInteriorCanvas(); return; }
    const visual = currentSceneVisual();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height); gradient.addColorStop(0, visual.top); gradient.addColorStop(1, visual.bottom); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tileX = Math.floor(state.camera.x), tileY = Math.floor(state.camera.y);
    for (let y = tileY - 18; y <= tileY + 18; y += 1) for (let x = tileX - 20; x <= tileX + 20; x += 1) {
      const tileVisual = visualForWorldPoint(x + .5, y + .5);
      drawGroundTile(x, y, (x + y) % 2 ? tileVisual.tileA : tileVisual.tileB, tileVisual.tileA);
    }
    drawRegionBoundaries(); drawWorldBoundary();
    updateHeroCandidateAvailability();
    const buildings = WORLD_BUILDINGS.map((building) => {
      const buildingVisual = SCENE_VISUALS[regionById(building.regionId).scene] || visual;
      return {
        ...building,
        color: building.palette === 1 ? buildingVisual.side : buildingVisual.building,
        side: building.palette === 1 ? buildingVisual.building : buildingVisual.side,
        roof: buildingVisual.roof
      };
    }).sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const playerOccluded = buildings.some(buildingOccludesPlayer), objective = currentNavigationObjective();
    buildings.forEach((building) => drawBuildingFootprint(building));
    drawCrowdAndEnemies();
    const item = currentKeyItem();
    if (item && isEntityInCurrentArea(item)) drawKeyItem(item);
    drawSceneObjects(); drawSceneAnomalies();
    if (state.missionExit?.active) drawSceneGate(state.missionExit);
    if (playerOccluded) drawCharacter(state.player.x, state.player.y, { body: "#47b9ef", head: "#f5fdff", stroke: "#ffffff", labelColor: exhaustionFlashVisible() ? "#ff5b55" : "#ffffff", invertedTip: true }, playerCharacterLabel(), 1.12);
    buildings.forEach(drawBuilding);
    buildings.forEach((building) => { drawBuildingFootprint(building, true); drawBuildingEntrances(building, objective); });
    drawNavigationDirection(objective); drawSecondaryNavigationDirections(objective); drawHeroLocator(); drawAdditionalHeroLocators(); drawHeroCourageSupport();
    if (state.heroCandidate.present && !state.heroCandidate.awakened) drawCharacter(state.heroCandidate.x, state.heroCandidate.y, { body: "#9a9485", head: "#e7dfcf", stroke: state.heroCandidate.locatable ? "#ffe3a0" : "#d9dfda", labelColor: state.heroCandidate.locatable ? "#ffe3a0" : "#d9dfda" }, state.heroCandidate.locatable ? "可能覺醒的人｜" + state.heroCandidate.name : "自行避難的人", .92);
    if (!playerOccluded) drawCharacter(state.player.x, state.player.y, { body: "#47b9ef", head: "#f5fdff", stroke: "#ffffff", labelColor: exhaustionFlashVisible() ? "#ff5b55" : "#ffffff", invertedTip: true }, playerCharacterLabel(), 1.12);
    else drawCharacter(state.player.x, state.player.y, { body: "#ffffff", head: "#ffffff", stroke: "#ffffff", labelColor: exhaustionFlashVisible() ? "#ff5b55" : "rgba(255,255,255,.82)", partialWhite: true, hideFeet: true, upperOnly: true, alpha: .58, invertedTip: true }, playerCharacterLabel(), 1.12);
    if (state.heroActor && state.heroStage !== "NONE" && state.heroActor.alive !== false) drawCharacter(state.heroActor.x, state.heroActor.y, { body: state.heroStage === "C" ? "#ffe06a" : "#67d391", head: state.heroStage === "C" ? "#fff3a0" : "#b9ffd0", stroke: "#ffffff", labelColor: "#b9ffd0" }, state.heroActor.title, .94);
    drawAdditionalHeroes();
    drawMonsterAndMinions(); drawAlienMessenger(); drawWorldEffects(); drawSceneDarkness(); drawStarBurst(state.lastBurst);
  }
  function renderCanvas() { drawCanvas(); }
