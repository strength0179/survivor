/* 事件規則與回饋：正義／追殺門檻、分數、台詞 log、音效與戰鬥視覺回饋。 */
  function normalize(input) {
    return {
      keyItemAcquired: bool(input.keyItemAcquired), identityMatched: bool(input.identityMatched), locationMatched: bool(input.locationMatched), heroCandidateFound: bool(input.heroCandidateFound),
      heroAwakeningTriggered: bool(input.heroAwakeningTriggered),
      clueCount: clamp(Math.floor(number(input.clueCount, 0)), 0, 6), secondKeyEvent: bool(input.secondKeyEvent), operationSuccess: bool(input.operationSuccess),
      rescueCount: clamp(Math.floor(number(input.rescueCount, 0)), 0, 3), heroLeverCompletions: clamp(Math.floor(number(input.heroLeverCompletions, 0)), 0, 3),
      rareKeyItem: bool(input.rareKeyItem), casualtyDeaths: Math.max(0, Math.floor(number(input.casualtyDeaths, 0))), chaseClueFound: bool(input.chaseClueFound)
    };
  }

  function scoreEvent(input) {
    const v = normalize(input);
    const w = FORMULA.weights;
    const breakdown = {
      keyItemAcquired: v.keyItemAcquired ? w.keyItemAcquired : 0, identityMatched: v.identityMatched ? w.identityMatched : 0,
      locationMatched: v.locationMatched ? w.locationMatched : 0, heroCandidateFound: v.heroCandidateFound ? w.heroCandidateFound : 0,
      clue: v.clueCount * w.clue, secondKeyEvent: v.secondKeyEvent ? w.secondKeyEvent : 0, operationSuccess: v.operationSuccess ? w.operationSuccess : 0,
      rescue: v.rescueCount * w.rescue, heroLeverCompletion: v.heroLeverCompletions * w.heroLeverCompletion, rareKeyItem: v.rareKeyItem ? w.rareKeyItem : 0,
      noCasualty: v.casualtyDeaths === 0 ? w.noCasualty : 0
    };
    return { value: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown, normalized: v };
  }

  function stageThreshold(stage) {
    const base = FORMULA[stage].score;
    return Math.round(base * clamp(1 + state.skillCheckAdjust / 100, 0.5, 1.5));
  }

  function heroLeverRequirement(stage) {
    const base = stage === "B" ? 1 : 2;
    return base * clamp(1 + state.heroLeverAdjust / 100, 0.5, 1.5);
  }

  function eligibility(input) {
    const evidence = scoreEvent(input), v = evidence.normalized;
    const core = v.keyItemAcquired && v.identityMatched && v.locationMatched && v.heroCandidateFound;
    const A = core && v.heroAwakeningTriggered && v.clueCount >= FORMULA.A.clues && evidence.value >= stageThreshold("A");
    const B = A && v.clueCount >= FORMULA.B.clues && v.secondKeyEvent && v.operationSuccess && v.rescueCount >= 1 && v.heroLeverCompletions >= heroLeverRequirement("B") && evidence.value >= stageThreshold("B");
    const C = B && v.clueCount >= FORMULA.C.clues && v.rareKeyItem && v.rescueCount >= 3 && v.heroLeverCompletions >= heroLeverRequirement("C") && v.casualtyDeaths === 0 && evidence.value >= stageThreshold("C");
    return { ...evidence, core, A, B, C };
  }

  function roll() {
    const value = $("debugRoll").value.trim();
    return value === "" ? state.core.random() : clamp(Number(value), 0, 0.999999);
  }

  function updateRedGate() {
    if (!state.redUnlocked && state.orangeUnlocked && state.initialWaveRemaining <= 5) {
      state.redUnlocked = true;
      setDangerLevel(4);
      log("紅色圈解除：怪人與被吸引小兵進入視野範圍", true);
      emitCore("RED_GATE_UNLOCKED", { initialWaveRemaining: state.initialWaveRemaining, threshold: 5 });
      startMonsterStandoff();
      return true;
    }
    return false;
  }

  function syncChain(message) {
    const oldStage = state.heroStage;
    state.eventInput = normalize(state.eventInput || {});
    syncRouteFlags(message || "event-chain");
    const e = eligibility(state.eventInput);
    let nextStage = oldStage, transition = null;
    if (oldStage === "NONE" && e.A) { nextStage = "A"; transition = "英雄 A 階段變身"; }
    else if (oldStage === "A" && e.B && roll() < FORMULA.B.probability) { nextStage = "B"; transition = "英雄 B 階段強化成功"; }
    else if (oldStage === "B" && e.C && roll() < FORMULA.C.probability) { nextStage = "C"; transition = "英雄 C 階段超越成功"; }
    state.heroStage = nextStage;
    state.evidence = e;
    if (transition) { if (state.heroActor) applyHeroStageRuntime(state.heroActor, nextStage, transition); log(transition, true); emitCore("HERO_STAGE_CHANGED", { from: oldStage, to: nextStage, transition, evidence: e.value }); }
    const orange = !state.orangeUnlocked && state.heroStage !== "NONE" && state.eventInput.keyItemAcquired && state.eventInput.chaseClueFound;
    if (orange) { state.orangeUnlocked = true; log("橘色圈解除：自由小兵開始追殺，不等待怪人命令", true); emitCore("ORANGE_GATE_UNLOCKED", { keyItemAcquired: true, chaseClueFound: true }); }
    updateRedGate();
    if (message) log(message);
    renderAll();
  }

  function log(text, important) {
    const prefix = important ? "◆" : "・";
    state.logs.unshift({ text: prefix + " " + text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    state.logs = state.logs.slice(0, 80);
    $("log").innerHTML = state.logs.map((entry) => "<p><span class=\"time\">" + entry.time + "</span>" + escapeHtml(entry.text) + "</p>").join("");
  }
  function escapeHtml(text) { return String(text).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])); }

  function ensureAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { log("此瀏覽器沒有 Web Audio API，略過音效但不影響遊戲規則"); return null; }
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === "suspended") state.audioContext.resume();
    $("audioButton").textContent = "音效已啟用";
    return state.audioContext;
  }
  function playImpact(strength) {
    const duration = strength === "HEAVY" ? 0.18 : 0.09;
    const startFrequency = strength === "HEAVY" ? 130 : 260;
    const endFrequency = strength === "HEAVY" ? 48 : 115;
    const oscillatorType = strength === "HEAVY" ? "sawtooth" : "triangle";
    const audio = ensureAudio(); if (!audio) return;
    const now = audio.currentTime;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = oscillatorType; osc.frequency.setValueAtTime(startFrequency, now); osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(strength === "HEAVY" ? 0.16 : 0.09, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + duration);
  }
  function playPseudoVoice(text, voiceId) {
    const audio = ensureAudio(); if (!audio) return;
    const now = audio.currentTime, clean = String(text || "").replace(/\s/g, "");
    const count = clamp(Math.ceil(clean.length / 4), 2, 10), base = 155 + (Number(voiceId || 1) % 6) * 28;
    for (let i = 0; i < count; i += 1) {
      const begin = now + i * 0.038, end = begin + 0.024;
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = "square"; osc.frequency.setValueAtTime(base + (i % 3) * 24, begin); gain.gain.setValueAtTime(0.045, begin); gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain); gain.connect(audio.destination); osc.start(begin); osc.stop(end);
    }
  }

  function battleBurst(kind) {
    const clash = kind === "CLASH", heavy = clash || kind === "HEAVY";
    state.lastBurst = { kind, graphic: AUDIO_VISUAL.battleGraphic, animation: AUDIO_VISUAL.battleAnimation, sound: heavy ? AUDIO_VISUAL.heavyHitSound : AUDIO_VISUAL.weakHitSound, scale: clash ? 2.4 : heavy ? 1.45 : 0.85, points: clash ? 12 : heavy ? 10 : 8, color: clash ? "#FFE06A" : heavy ? "#FFB347" : "#FFF4A8" };
    playImpact(heavy ? "HEAVY" : "WEAK");
    renderCanvas();
    window.setTimeout(() => { state.lastBurst = null; renderCanvas(); }, 180);
  }
