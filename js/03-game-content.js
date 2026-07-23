/* 遊戲內容資料：資源、英雄戰法、怪人能力、七區、道具路線與預告內容。 */
  const RECOVERY_BANDS = [
    { duration: 1, amount: 25 },
    { duration: 1.5, amount: 18.75 },
    { duration: 2.25, amount: 14.0625 },
    { duration: 3.375, amount: 10.546875 },
    // 第四段後固定在最後速率，不再無限切出更小的小數。
    { duration: Infinity, rate: 3.125 }
  ];
  const CIVILIAN_FLOWS = [{ x: -.94, y: -.34 }, { x: -.42, y: .91 }];
  const CIVILIAN_SPAWN_PROFILES = {
    1: { healthy: 14, injured: 0, interval: .75, cap: 540 },
    2: { healthy: 8, injured: 3, interval: .9, cap: 480 },
    3: { healthy: 0, injured: 5, interval: 1.1, cap: 320 },
    4: { healthy: 0, injured: 2, interval: 1.6, cap: 220 }
  };
  const HERO_MOVE_STYLES = {
    MIGHT: { range: 1.2, area: 1.25, cost: 8, damage: 18, cooldown: .58, color: "#ffd36b" },
    MIST: { range: 2.3, area: 2.4, cost: 11, damage: 13, cooldown: .78, color: "#a6ffe5" },
    ELECTRIC: { range: 2.9, area: 2.1, cost: 12, damage: 16, cooldown: .72, color: "#8bdcff" },
    SLASH: { range: 3.3, area: 1.55, cost: 10, damage: 17, cooldown: .66, color: "#f5f0ff" },
    FLIGHT: { range: 3.8, area: 1.8, cost: 13, damage: 19, cooldown: .82, color: "#d2f6ff" },
    BEAM: { range: 4.3, area: 1.7, cost: 15, damage: 22, cooldown: .94, color: "#fff08a" },
    BARRIER: { range: 2.7, area: 2.8, cost: 12, damage: 12, cooldown: .9, color: "#c7b7ff" }
  };
  const heroKit = (title, style, names) => ({ title, style, moves: names.map((name, index) => ({ stage: ["A", "B", "C"][index], name })) });
  const HERO_COMBAT_KITS = {
    H01: heroKit("蒼雷英雄", "ELECTRIC", ["蒼雷拘束網", "連鎖轟雷", "天穹斷罪雷"]),
    H02: heroKit("鋼拳英雄", "MIGHT", ["鋼拳震步", "崩城連打", "大地終決拳"]),
    H03: heroKit("白翼英雄", "FLIGHT", ["白翼俯衝", "救星迴旋", "天翔白光破"]),
    H04: heroKit("烈日英雄", "BEAM", ["日輪照射", "灼陽貫線", "烈日裁決光"]),
    H05: heroKit("生鎧英雄", "BARRIER", ["生鎧護壁", "增殖甲陣", "萬生城塞"]),
    H06: heroKit("共鳴英雄", "MIGHT", ["共鳴震掌", "破陣音爆", "天地共振擊"]),
    H07: heroKit("慈光英雄", "BARRIER", ["慈光護環", "救命光域", "無傷曙光界"]),
    H08: heroKit("電網英雄", "ELECTRIC", ["近衛電索", "交叉雷網", "萬向封鎖陣"]),
    H09: heroKit("曙光英雄", "BEAM", ["生命熱線", "曙光脈衝", "再生太陽砲"]),
    H10: heroKit("迅風英雄", "FLIGHT", ["迅風突進", "救援迴風", "瞬空千里擊"]),
    H11: heroKit("鋼機英雄", "MIGHT", ["機械增幅拳", "重驅衝城", "超載鋼神擊"]),
    H12: heroKit("轟嶺英雄", "MIGHT", ["轟嶺踏破", "山崩雙拳", "巨岳粉碎陣"]),
    H13: heroKit("追刃英雄", "SLASH", ["追跡光刃", "折返月斬", "必中天際線"]),
    H14: heroKit("極限英雄", "BEAM", ["極限視線", "強者穿星", "無限界突破砲"]),
    H15: heroKit("雙影英雄", "SLASH", ["雙影切返", "宿敵交叉斬", "兄弟終局刃"]),
    H16: heroKit("潮鎧英雄", "BARRIER", ["潮汐甲壁", "逆流鎖陣", "深海拒絕界"]),
    H17: heroKit("殘像英雄", "FLIGHT", ["記憶殘步", "守望折光", "未來投影擊"]),
    H18: heroKit("霧鎖英雄", "MIST", ["贖罪霧幕", "鎖身毒消", "無名淨界霧"]),
    H19: heroKit("鏡痕英雄", "SLASH", ["鏡痕反斬", "空白折射", "真名回憶刃"]),
    H20: heroKit("相位英雄", "BARRIER", ["相位斷層", "三點轉移陣", "異星終端界"])
  };
  const MONSTER_TITLES = [
    "破城獸人", "腐霧異形", "雷網獵兵", "裂空刀魔", "飛翼獵怪", "灼光實驗體", "重壓劇場王", "鏡面淘汰者", "群流操盤手", "吞能巨漢",
    "雙能幹部", "冬毒武人", "電刃處刑者", "裂翼追獵者", "幻光演算者", "毒網觀測者", "崩界總監", "雷鏡鋼獸", "飛光妖女", "三相大幹部"
  ];
  const MONSTER_ABILITY_LIBRARY = {
    1: { name: "怪力震擊", range: 1.25, cost: 16, damage: 6, area: 1.4, color: "#ff9a5f", mode: "PRESSURE", effect: "KNOCKBACK" },
    2: { name: "毒霧侵蝕", range: 2.6, cost: 20, damage: 4, area: 2.4, color: "#9bea72", mode: "CONTROL", effect: "POISON" },
    3: { name: "電擊網", range: 3.1, cost: 22, damage: 5, area: 2.1, color: "#77caff", mode: "WARNING", effect: "STUN" },
    4: { name: "斬擊波", range: 3.6, cost: 20, damage: 6, area: 1.5, color: "#ffd1ee", mode: "PRESSURE", effect: "WAVE" },
    5: { name: "飛行俯衝", range: 4, cost: 24, damage: 7, area: 1.6, color: "#d3eaff", mode: "PRESSURE", effect: "FLIGHT" },
    6: { name: "灼熱射線", range: 4.3, cost: 26, damage: 8, area: 1.4, color: "#ffec83", mode: "WARNING", effect: "BEAM" },
    7: { name: "幻影分裂", range: 2.8, cost: 22, damage: 5, area: 2.5, color: "#d5a0ff", mode: "CONTROL", effect: "SPLIT" },
    8: { name: "吸能觸手", range: 2.4, cost: 18, damage: 5, area: 1.9, color: "#ff8ab8", mode: "CONTROL", effect: "DRAIN" },
    9: { name: "重力壓場", range: 3.3, cost: 25, damage: 7, area: 2.8, color: "#bca0ff", mode: "CONTROL", effect: "GRAVITY" },
    10: { name: "再生甲殼", range: 1.4, cost: 18, damage: 4, area: 1.2, color: "#91ffc0", mode: "PRESSURE", effect: "REGENERATE" }
  };
  const FORMULA = {
    weights: { keyItemAcquired: 20, identityMatched: 15, locationMatched: 15, heroCandidateFound: 15, clue: 5, secondKeyEvent: 10, operationSuccess: 10, rescue: 5, heroLeverCompletion: 10, rareKeyItem: 10, noCasualty: 10 },
    A: { clues: 2, score: 75, probability: 1 },
    B: { clues: 4, score: 120, probability: 0.05 },
    C: { clues: 6, score: 170, probability: 0.005 }
  };
  const AUDIO_VISUAL = {
    battleGraphic: "STAR_FIREWORK_BURST",
    battleAnimation: false,
    weakHitSound: "HIT_WEAK",
    heavyHitSound: "HIT_HEAVY",
    dialogueVoice: "GBA_STYLE_PSEUDO_VOICE"
  };
  const INTERACTION_RULES = {
    radius: 1.15,
    standardRate: 50,
    heroLeverRate: 50,
    heroLeverCharge: 75,
    heroLeverProgress: 35,
    sustainedStableRate: 50,
    sustainedProgressRate: 24,
    sustainedFocusPerSecond: 8,
    sustainedStableRequired: 75,
    sustainedProgressRequired: 220
  };
  const VEHICLE_RULES = Object.freeze({
    NONE: { label: "徒步", speedMultiplier: 1, maxSpeed: 40, staminaDrainMultiplier: 1, recoveryMultiplier: 1 },
    BICYCLE: { label: "腳踏車", speedMultiplier: 1.16, maxSpeed: 46, staminaDrainMultiplier: .5, recoveryMultiplier: 1.04 },
    MOTORCYCLE: { label: "機車", speedMultiplier: 1.42, maxSpeed: 56, staminaDrainMultiplier: .2, recoveryMultiplier: 1.12 }
  });
  // 形狀與效果分離：Canvas 只畫方塊／圓柱，資料表決定它叫什麼、需要多少專注、完成後改變什麼。
  const SCENE_OBJECT_TEMPLATES = [
    { kind: "EMERGENCY_VALVE", name: "緊急遮斷閥", primitive: "CYLINDER", requiredFocus: 125, effect: "CHASE_CLUE", clue: 1, tracking: 1, note: "閥門後方留有被撕下的追蹤記錄。" },
    { kind: "VEHICLE_REPAIR", name: "故障車輛修復台", primitive: "CUBE", requiredFocus: 250, effect: "RESCUE", clue: 1, tracking: 0, note: "修復後可替一批受困者清出避難路線。" },
    { kind: "COMPUTER_TERMINAL", name: "封鎖資料終端", primitive: "CUBE", requiredFocus: 350, effect: "OPERATION", clue: 1, tracking: 1, note: "需要完整灌注專注才能還原被加密的紀錄。" },
    { kind: "ALIEN_TRIPTYCH", name: "異文明三聯端末", primitive: "CYLINDER", requiredFocus: 300, parts: 3, effect: "RARE", clue: 2, tracking: 2, note: "A／B／C 三個模組各需灌注 300 專注。" },
    { kind: "HERO_LEVER", name: "英雄桿", primitive: "LEVER", interactionType: "HERO_LEVER", requiredFocus: 35, heroRequirement: ["MIGHT", "ELECTRIC", "BEAM", "BARRIER"], effect: "HERO_LEVER", tracking: 1, note: "外觀近似一般控制桿；先嘗試才會知道它需要英雄的力量。", destructible: false },
    { kind: "SUSTAINED_RELAY", name: "持續維持裝置", primitive: "CUBE", interactionType: "SUSTAINED", stableRequired: 75, progressRequired: 220, maintenanceFocusPerSecond: 8, effect: "SUSTAINED_RELAY", clue: 1, tracking: 1, note: "先灌入穩定值，再持續消耗專注推進另一條進度；中斷後兩條進度都會保留。" }
  ];
  // 七區不共用「情境結果」：外觀可以共用方塊／圓柱，真正的危險、路徑與救援後果由這張資料表決定。
  const SCENE_FEATURE_RULES = Object.freeze({
    MOUNTAIN: { name: "斷層換氣主控", primitive: "CYLINDER", requiredFocus: 250, specialAction: "MOUNTAIN_SMOKE", clue: 1, tracking: 1, note: "重啟換氣會把地下煙塵排到外場；煙霧中藏著一段被截斷的座標。" },
    HOSPITAL: { name: "急救備援分流器", primitive: "CUBE", requiredFocus: 250, specialAction: "HOSPITAL_RESCUE", clue: 1, tracking: 0, note: "將備援電力導向傷患區，能立刻穩定附近的傷者。" },
    RESIDENTIAL: { name: "避難廣播中繼", primitive: "CUBE", requiredFocus: 125, specialAction: "SHELTER_EVAC", clue: 1, tracking: 0, note: "廣播重新接通後，健康人群會找到撤離方向；留下的傷患需要英雄照看。" },
    FACTORY: { name: "高壓氣體緊急閥", primitive: "CYLINDER", requiredFocus: 125, specialAction: "FACTORY_TOXIC", clue: 1, tracking: 2, note: "操作後會短暫釋放有毒蒸氣，卻能炸開原本封死的維修通道。" },
    CITY: { name: "秘密監控中繼台", primitive: "CUBE", requiredFocus: 350, specialAction: "CITY_BLACKOUT", clue: 2, tracking: 1, note: "切斷監控電力會讓整個都市區陷入黑暗，也會揭露隱藏入口。" },
    HARBOR: { name: "碼頭吊臂解鎖器", primitive: "LEVER", requiredFocus: 250, specialAction: "HARBOR_DROP", clue: 1, tracking: 1, note: "放下貨櫃會砸斷封鎖線；墜落貨物也會永久封住一部分地面。" },
    SIGNAL: { name: "高壓電波增幅器", primitive: "CYLINDER", requiredFocus: 350, specialAction: "SIGNAL_EXPLODE", clue: 2, tracking: 2, note: "把訊號推到極限會炸毀一座干擾器，並改變電波塔丘陵的通路。" }
  });
  const MONSTER_LEVEL_RULES = Object.freeze([
    { level: 1, experience: 0, attack: 1, speed: 1, cooldown: 1, abilities: 1, label: "追跡體" },
    { level: 2, experience: 4, attack: 1.15, speed: 1.08, cooldown: .92, abilities: 1, label: "強化體" },
    { level: 3, experience: 9, attack: 1.33, speed: 1.16, cooldown: .83, abilities: 2, label: "變異體" },
    { level: 4, experience: 16, attack: 1.56, speed: 1.27, cooldown: .75, abilities: 2, label: "幹部級" },
    { level: 5, experience: 26, attack: 1.86, speed: 1.4, cooldown: .66, abilities: 3, label: "高級幹部" },
    { level: 6, experience: 40, attack: 2.2, speed: 1.55, cooldown: .58, abilities: 3, label: "災害級" }
  ]);
  const MONSTER_ATTACK_MODES = Object.freeze({ PRESSURE: "追壓型", WARNING: "預警型", CONTROL: "場景控制型" });
  const WORLD_MAP_LAYOUT = Object.freeze({
    start: { x: 18, y: 72, label: "第一回\n避難開始" },
    main: { x: 52, y: 43, label: "第二回\n主線節點" },
    hidden: { x: 79, y: 72, label: "隱藏回\n？？？來襲" }
  });
  const HERO_LEVER_OUTCOME_TEXT = {
    UNBEATABLE_VILLAIN: "封印破裂：幾乎無法單獨對付的敵對反應被放出。",
    POWERFUL_ITEM_OR_TRANSFORM_KEY: "強化道具出現：這份力量可能把覺醒推向下一階段。",
    HERO_REVIVAL_ITEM: "回復媒介出現：英雄的體力與專注被重新點亮。",
    HIDDEN_BRANCH_ITEM: "隱藏分歧道具出現：主線之外的路徑被記錄下來。"
  };
  const NEXT_EPISODE_PREVIEWS = [
    ["あの人は、まだ自分の名を知らない。", "ただ、足はもう逃げるためだけに動いていない。", "第二回　黒い通行証"],
    ["救難信号は、地下から聞こえた。", "誰かが先に、その声を消そうとしている。", "第二回　白い部屋の呼び声"],
    ["拾ったものは、ただの荷物ではなかった。", "握った手から、知らない記憶が戻ってくる。", "第二回　失われた記録"],
    ["街の灯りが、ひとつずつ遠ざかる。", "最後に残るのは、誰のための光なのか。", "第二回　夜を渡る者"],
    ["海の向こうで、何かが目を覚ました。", "波はまだ、名前を呼んでいない。", "第二回　港に沈む影"],
    ["四つの足音が、別々の場所から近づく。", "手を組むのか、ぶつかるのか。", "第二回　交差する戦士たち"],
    ["空を見上げた人から、言葉を失った。", "あれは救いか、それとも予告か。", "第二回　空から来る使者"],
    ["あの子は、何を守るために走るのか。", "答えはまだ、変身の前にある。", "第二回　仮面のない英雄"],
    ["研究室の扉は、外からは開かない。", "中にいる誰かが、ずっと鍵を待っている。", "第二回　地下層の証人"],
    ["誰かを助けた数だけ、追跡者は増えていく。", "それでも、この手を離す理由にはならない。", "第二回　避難路の火花"],
    ["壊れた機械は、最後に一度だけ本当の声を出す。", "聞いてしまった者は、もう戻れない。", "第二回　機械が知る名前"],
    ["敵は遠くで待っている。", "近づくのは、こちらが鍵を手にした時だけだ。", "第二回　赤い円環の外側"],
    ["兄の影が、怪人の後ろに立っていた。", "追いかけた先で、何を呼べばいい。", "第二回　忘れられた兄弟"],
    ["誰もが正義の言葉を持っている。", "だからこそ、次の一撃が怖い。", "第二回　正義は誰の手に"],
    ["街は壊れても、逃げ道まで失ったわけじゃない。", "次の角で、世界はもう一度選ばれる。", "第二回　灰色の分岐点"],
    ["命令は、いつも優しい声をしている。", "それに逆らう人が、初めて英雄になる。", "第二回　命令を拒む者"],
    ["誰かの最後の言葉が、道具の中に残っていた。", "届ける相手は、まだ人混みのどこかにいる。", "第二回　届かない伝言"],
    ["逃げ遅れた人たちが、こちらを見ている。", "振り返るかどうかで、次の景色が変わる。", "第二回　燃える避難標識"],
    ["その力は、救うために生まれたのか。", "それとも、誰かを壊すために待っていたのか。", "第二回　目覚める反応炉"],
    ["静かな場所ほど、秘密はよく響く。", "扉の向こうで、次の事件が呼吸している。", "第二回　密室の警報"],
  ];
  const SCENES = [
    "山麓觀測區", "醫院外場", "住宅避難區", "工廠外場", "都市外場", "海港碼頭", "電波塔丘陵",
    "都市內場", "工廠內場", "醫院內場", "港區倉庫內場", "地下秘密研究室"
  ];
  const ITEM_ROUTES = [
    {
      id: "SECRET_LIAISON", identity: "秘密設施聯絡員", theme: "被抹去的都市實驗",
      candidate: { id: "H05", name: "伊藤 直樹", scene: "地下秘密研究室", x: -10, y: 9, power: "生體裝甲" },
      items: [
        { id: "CITY_PASS", scene: "都市外場", x: 14, y: -9, family: "CARD", category: "通行裝置", vagueName: "無標記的金屬牌狀物", trueName: "都市通行核心", reveal: "讀取後，內層刻字把你辨識為「秘密設施聯絡員」。", relation: "序號與失蹤者名冊相同；下一個對應物被送進都市內場。", clueGain: 0 },
        { id: "SAMPLE_CASE", scene: "都市內場", x: -16, y: 13, family: "CASE", category: "密封容器", vagueName: "帶封條的小型金屬匣", trueName: "研究室樣本匣", reveal: "封條解除：這是研究室樣本匣，不是普通醫療箱。", relation: "匣身序號與通行核心完全一致，資料指向地下秘密研究室。", clueGain: 1 },
        { id: "AWAKENING_CORE", scene: "地下秘密研究室", x: 18, y: -12, family: "CORE", category: "未知能源體", vagueName: "微弱脈動的發光核心", trueName: "覺醒核心", reveal: "光譜比對完成：它會放大特定人物的覺醒反應。", relation: "只有正確身分、樣本匣、研究室與指定候選人同時成立才會反應。", clueGain: 1 }
      ]
    },
    {
      id: "EMERGENCY_BROADCAST", identity: "緊急廣播志工", theme: "被截斷的求救頻道",
      candidate: { id: "H06", name: "渡辺 修", scene: "工廠內場", x: 11, y: 10, power: "共鳴衝擊" },
      items: [
        { id: "FIELD_MIC", scene: "都市外場", x: -18, y: -10, family: "MIC", category: "廣播器材", vagueName: "仍在發出雜音的手持物", trueName: "災害廣播麥克風", reveal: "頻道識別把你登記為「緊急廣播志工」。", relation: "雜音裡反覆出現同一段地下廣播帶的編號。", clueGain: 0 },
        { id: "BROADCAST_TAPE", scene: "都市內場", x: 19, y: 12, family: "DOCUMENT", category: "磁性紀錄", vagueName: "被燒焦一角的黑色卡匣", trueName: "封鎖頻道錄音帶", reveal: "錄音裡有人在工廠停電前呼叫一名尚未覺醒的人。", relation: "最後一段脈衝與工廠內場的共鳴設備一致。", clueGain: 1 },
        { id: "RESONANCE_CORE", scene: "工廠內場", x: -17, y: -14, family: "CORE", category: "聲波核心", vagueName: "會隨聲音顫動的圓形物", trueName: "共鳴驅動核心", reveal: "核心把麥克風裡的人聲轉成足以喚醒裝甲的頻率。", relation: "它等待廣播身分、錄音帶與渡辺修同時接近。", clueGain: 1 }
      ]
    },
    {
      id: "LIFE_SUPPORT", identity: "臨時急救員", theme: "病歷中不存在的傷患",
      candidate: { id: "H09", name: "小林 洋子", scene: "醫院內場", x: -11, y: 8, power: "生命光熱" },
      items: [
        { id: "FIRST_AID_BAG", scene: "都市外場", x: 12, y: 15, family: "CASE", category: "急救用品", vagueName: "沾著灰塵的白色提袋", trueName: "災害急救包", reveal: "名牌把你列為「臨時急救員」，但你不記得簽過名。", relation: "包內藥品批號只供應給醫院外場的臨時救護站。", clueGain: 0 },
        { id: "PATIENT_BAND", scene: "醫院外場", x: -18, y: -13, family: "CARD", category: "醫療識別", vagueName: "沒有姓名的塑膠腕帶", trueName: "零號病患腕帶", reveal: "腕帶生命訊號仍在跳動，病患卻不在資料庫裡。", relation: "訊號接收端位於醫院內場封閉病房。", clueGain: 1 },
        { id: "LIFE_CORE", scene: "醫院內場", x: 17, y: 13, family: "CORE", category: "生命維持裝置", vagueName: "像心臟一樣明滅的透明球", trueName: "生命脈動核心", reveal: "核心內保存的不是器官，而是某人的變身節律。", relation: "急救員、零號腕帶與小林洋子的生命訊號已互相鎖定。", clueGain: 1 }
      ]
    },
    {
      id: "SEALED_EVIDENCE", identity: "失聯巡查員", theme: "不該被移送的證物",
      candidate: { id: "H13", name: "佐々木 透", scene: "海港碼頭", x: -10, y: 9, power: "追跡光刃" },
      items: [
        { id: "POLICE_NOTEBOOK", scene: "都市外場", x: -14, y: 16, family: "DOCUMENT", category: "公務證件", vagueName: "泡過水的黑色小冊", trueName: "失聯警員手帳", reveal: "殘存晶片把你辨識為「失聯巡查員」。", relation: "最後一筆移送紀錄指向都市內場的無主證物櫃。", clueGain: 0 },
        { id: "EVIDENCE_CASE", scene: "都市內場", x: -18, y: -10, family: "CASE", category: "封存證物", vagueName: "貼滿重複封條的硬殼箱", trueName: "第七码頭證物箱", reveal: "每一張封條都由不存在的單位重新簽發。", relation: "箱內追蹤訊號正在海港碼頭移動。", clueGain: 1 },
        { id: "PURSUIT_CORE", scene: "海港碼頭", x: 18, y: -12, family: "CORE", category: "追蹤核心", vagueName: "持續轉向同一方向的金屬眼", trueName: "追跡核心", reveal: "核心記錄了佐々木透追捕怪人的全部路線。", relation: "只有原始手帳持有人能把追跡核心交還給他。", clueGain: 1 }
      ]
    },
    {
      id: "FACTORY_DRIVE", identity: "設備維修員", theme: "仍在運轉的無人工廠",
      candidate: { id: "H11", name: "吉田 英司", scene: "工廠內場", x: -12, y: 11, power: "機械增幅" },
      items: [
        { id: "TOOL_BOX", scene: "都市外場", x: 18, y: 10, family: "CASE", category: "維修工具", vagueName: "比外觀看起來沉重的工具箱", trueName: "第三維修班工具箱", reveal: "電子鎖接受你的掌紋，登記職務是「設備維修員」。", relation: "唯一缺少的熔斷迴路留在工廠外場。", clueGain: 0 },
        { id: "FUSE_CIRCUIT", scene: "工廠外場", x: -20, y: 11, family: "DOCUMENT", category: "工業迴路", vagueName: "纏著警告膠帶的焦黑板件", trueName: "超載熔斷迴路", reveal: "迴路曾替某套人形驅動裝置承受不可能的電流。", relation: "維修記錄要求把它送回工廠內場的主驅動爐。", clueGain: 1 },
        { id: "DRIVE_CORE", scene: "工廠內場", x: 19, y: -13, family: "CORE", category: "機械核心", vagueName: "自行旋轉的齒輪狀圓筒", trueName: "人形驅動核心", reveal: "核心內的啟動者姓名是吉田英司。", relation: "工具箱、熔斷迴路與啟動者的生體電流缺一不可。", clueGain: 1 }
      ]
    },
    {
      id: "HARBOR_ROUTE", identity: "港區理貨員", theme: "夜間航線的空白貨櫃",
      candidate: { id: "H16", name: "井上 凌", scene: "地下秘密研究室", x: -12, y: -10, power: "潮汐裝甲" },
      items: [
        { id: "HARBOR_PASS", scene: "都市外場", x: -20, y: 4, family: "CARD", category: "港區憑證", vagueName: "有鹽漬痕跡的黃色吊牌", trueName: "夜班港區通行證", reveal: "照片已被刮掉，晶片卻把你登記為「港區理貨員」。", relation: "通行證對應的貨櫃只出現在一份秘密軍火清單上。", clueGain: 0 },
        { id: "ARMS_MANIFEST", scene: "海港碼頭", x: -18, y: 13, family: "DOCUMENT", category: "運輸文件", vagueName: "被海水黏住的折疊紙卷", trueName: "零號貨櫃軍火清單", reveal: "清單上的貨物不是武器，而是拆解後的人形裝甲。", relation: "最後一只貨櫃已被運往地下秘密研究室。", clueGain: 1 },
        { id: "TIDAL_CORE", scene: "地下秘密研究室", x: 16, y: 14, family: "CORE", category: "液態核心", vagueName: "內部像潮水流動的透明筒", trueName: "潮汐相位核心", reveal: "液態金屬會依井上凌的呼吸改變裝甲形狀。", relation: "港區身分與軍火清單證明你能把核心交給正確的人。", clueGain: 1 }
      ]
    },
    {
      id: "LOST_EXPOSURE", identity: "災區攝影記者", theme: "照片裡多出來的人",
      candidate: { id: "H17", name: "木村 晶", scene: "醫院內場", x: 11, y: -10, power: "記憶投影" },
      items: [
        { id: "OLD_CAMERA", scene: "都市外場", x: 21, y: -3, family: "CAMERA", category: "攝影器材", vagueName: "快門仍會自行作動的舊相機", trueName: "災區採訪相機", reveal: "機背證件把你標記為「災區攝影記者」。", relation: "最後一張照片在醫院外場曝光，畫面裡有人正等待救援。", clueGain: 0 },
        { id: "EXPOSED_FILM", scene: "醫院外場", x: 18, y: -13, family: "DOCUMENT", category: "影像底片", vagueName: "透著不自然白光的底片筒", trueName: "過度曝光的第七码底片", reveal: "白光中浮出一名不在現場名單上的傷患。", relation: "影像殘留訊號穿過牆面，停在醫院內場。", clueGain: 1 },
        { id: "MEMORY_CORE", scene: "醫院內場", x: -17, y: 11, family: "CORE", category: "記憶媒介", vagueName: "會投出殘影的黑色鏡片", trueName: "記憶投影核心", reveal: "核心保存了木村晶尚未發生的變身畫面。", relation: "只有原始拍攝者在場，未來影像才能與本人重疊。", clueGain: 1 }
      ]
    },
    {
      id: "ALIEN_PHASE", identity: "研究助理", theme: "不屬於地球的操作紀錄",
      candidate: { id: "H20", name: "森 澪", scene: "地下秘密研究室", x: 10, y: 10, power: "相位轉換" },
      items: [
        { id: "STAFF_ID", scene: "都市外場", x: -10, y: -18, family: "CARD", category: "職員識別", vagueName: "沒有機構名稱的透明識別證", trueName: "異常現象研究員證", reveal: "資料層顯示你的職務是「研究助理」，任職日期卻是明天。", relation: "權限紀錄指向地下秘密研究室的一塊未知刻印板。", clueGain: 0 },
        { id: "ALIEN_TABLET", scene: "地下秘密研究室", x: -16, y: 12, family: "DOCUMENT", category: "異文明構件", vagueName: "會避開手指的薄片", trueName: "外星文明刻印板", reveal: "刻印不是文字，而是三個相位位置的操作順序。", relation: "最後一個相位核心就在同層，但只有森澪能承受啟動。", clueGain: 1 },
        { id: "PHASE_CORE", scene: "地下秘密研究室", x: 18, y: -12, family: "CORE", category: "相位核心", vagueName: "邊緣偶爾消失的多面體", trueName: "異文明相位核心", reveal: "核心每次閃爍，都短暫出現在不同位置。", relation: "研究助理、刻印板與森澪構成完整的三點校準。", clueGain: 1 }
      ]
    }
  ];
  // 50 組條件走同一個解譯器：身份、最後交付、主場景、英雄階段與分歧旗標會共同選出結果。
  const ROUTE_COMBINATION_TABLE = Object.freeze(Array.from({ length: 50 }, (_, index) => ({
    id: "R" + String(index + 1).padStart(2, "0"),
    identitySlot: index % 5,
    deliverySlot: Math.floor(index / 5),
    hint: ["英雄主線", "救助支線", "證物分歧", "敵方反應", "異文明暗示"][index % 5]
  })));
  const PLAYER_NAME_POOL = [
    { name: "佐藤 正志", gender: "男性" }, { name: "鈴木 和子", gender: "女性" }, { name: "高橋 昭夫", gender: "男性" },
    { name: "田中 洋子", gender: "女性" }, { name: "伊藤 修一", gender: "男性" }, { name: "渡辺 美代子", gender: "女性" },
    { name: "山本 隆", gender: "男性" }, { name: "中村 早苗", gender: "女性" }, { name: "小林 博", gender: "男性" },
    { name: "加藤 恵子", gender: "女性" }, { name: "吉田 勇", gender: "男性" }, { name: "山田 典子", gender: "女性" },
    { name: "佐々木 誠", gender: "男性" }, { name: "山口 玲子", gender: "女性" },
    { name: "松本 直人", gender: "男性" }, { name: "井上 美咲", gender: "女性" }, { name: "木村 拓也", gender: "男性" },
    { name: "林 由香", gender: "女性" }, { name: "清水 翔太", gender: "男性" }, { name: "森 凛", gender: "女性" }
  ];
  const SURVIVOR_MEMORY_LIBRARY = {
    SECRET_LIAISON: {
      before: "警報響起前，你正把一份沒有收件人的名冊送往中央資料館。",
      originalGoal: "穿過都市區，前往星見研究棟取回封存的聯絡裝備。",
      choice: "不能讓名冊與裝備一起落入那個抹除紀錄的組織手中。",
      witnessLines: ["別看封條……把匣子交給還記得自己名字的人。", "地下層沒有撤離命令。有人還在等這個。", "他們刪掉了整棟樓。這個序號能把它找回來。"]
    },
    EMERGENCY_BROADCAST: {
      before: "災難發生時，你正在替避難廣播補上最後一段失聯區域的訊息。",
      originalGoal: "前往廣播塔管理棟取回備用發射器，重新接通民眾的逃生頻道。",
      choice: "只要頻道還能發聲，你就不能把求救的人留在雜音裡。",
      witnessLines: ["不是雜音……有人從工廠底下回話。", "把錄音帶送去主驅動爐，他會聽懂那個頻率。", "別重播最後七秒。那不是人的聲音……但它在叫你的職稱。"]
    },
    LIFE_SUPPORT: {
      before: "第一波爆炸後，你正在臨時救護站替陌生傷患分類與止血。",
      originalGoal: "趕往東都醫療棟補充急救裝備，並把尚能移動的傷患帶回避難線。",
      choice: "你沒有戰鬥能力，但你知道再晚一分鐘就會少一個活人。",
      witnessLines: ["零號病房……那裡的人沒有名字，只有心跳。", "把腕帶交給小林醫師，她會知道誰被藏起來了。", "這不是醫療事故。有人在等病人自己變成答案。"]
    },
    SEALED_EVIDENCE: {
      before: "封鎖開始前，你正在追查一批被重複簽收、卻從未進過證物室的貨物。",
      originalGoal: "先回城南警備所取回勤務裝備，再趕往港灣區阻止證物被運走。",
      choice: "這份證物不能交給任何自稱來接管現場的人。",
      witnessLines: ["第七码頭……別信穿制服來領箱子的人。", "追蹤器還在動。真正的收件人也在追它。", "手帳裡最後一頁不是地址，是一個還沒出現的英雄名字。"]
    },
    FACTORY_DRIVE: {
      before: "停電前，你正在替第三動力廠遠端排除一個不可能同時出現在三處的故障。",
      originalGoal: "前往工業區取回絕緣工具，讓主電路不要把整個避難區拖進爆炸。",
      choice: "只要你還看得懂那套線路，就必須在它燒穿以前關掉機器。",
      witnessLines: ["別關主爐……裡面那個人會跟著停下來。", "這塊迴路不是給機器用的，是替一副身體承受電流。", "把核心交給吉田。他一直以為那只是維修紀錄。"]
    },
    HARBOR_ROUTE: {
      before: "海嘯警報響起時，你正在清點一只沒有報關編號的夜班貨櫃。",
      originalGoal: "穿過港灣區取回理貨終端，封住通往秘密泊位的貨運閘門。",
      choice: "不能讓那只空白貨櫃離港，也不能讓軍火清單被銷毀。",
      witnessLines: ["貨櫃是空的……因為裡面的裝甲自己走了。", "把清單送到地下層。那裡有人聽得見海水的聲音。", "別碰液態核心。它會照著你的呼吸找下一個主人。"]
    },
    LOST_EXPOSURE: {
      before: "混亂爆發時，你正在拍攝兩股逆向逃難的人潮，試圖留下失蹤者最後的位置。",
      originalGoal: "前往醫療區取回備用底片，拍下封鎖線內仍等待救援的人。",
      choice: "如果影像能證明他們存在，你就不能讓相機在這裡停下。",
      witnessLines: ["照片裡多了一個人……可他明天才會受傷。", "把底片拿給木村。他會認出那個還沒發生的畫面。", "白光不是曝光。那是有人從照片另一邊看你。"]
    },
    ALIEN_PHASE: {
      before: "研究設施失聯前，你正在核對一份日期寫著明天的夜班操作紀錄。",
      originalGoal: "前往山麓觀測區取回三段式校準器，停止地下儀器持續改寫座標。",
      choice: "這套儀器不能啟動第二次；第一次已經讓一整層樓消失。",
      witnessLines: ["刻印不是文字……它在等三個人站到正確的位置。", "把薄片交給森澪。只有她碰過另一側還能回來。", "別相信地圖。地下層剛才在你身後多長出一間房。"]
    }
  };
  // `?seed=任意文字或數字` 可重播同一局的身份、道具路線、建築與室內配置。
  // 沒有指定 seed 時，只在開局擷取一次熵值，整局其餘亂數仍可完整重現。
