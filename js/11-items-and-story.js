/* 道具與故事：鑑定卡片、道具揭示、記憶序列與物件收集入口。 */
  function itemById(id) { return KEY_ITEM_CHAIN.find((item) => item.id === id) || null; }

  function inspectedItem() {
    return itemById(state.inspectionItemId) || (state.keyItemsFound > 0 ? KEY_ITEM_CHAIN[state.keyItemsFound - 1] : currentKeyItem());
  }

  function renderItemInspection() {
    const item = inspectedItem();
    if (!item) return;
    const acquired = state.collectedItems.includes(item.id);
    $("itemInspectionIcon").dataset.family = item.family || "CASE";
    $("itemInspectionCategory").textContent = acquired ? item.category : "尚未鑑定｜" + item.category;
    $("itemInspectionName").textContent = acquired ? item.trueName : "疑似關鍵物";
    $("itemInspectionVague").textContent = "外觀：" + item.vagueName;
    $("itemInspectionReveal").textContent = acquired ? item.reveal : "你目前只能辨認它的大致外型。靠近並取得後，才會顯示真正名稱與身分線索。";
    $("itemInspectionRelation").textContent = acquired ? "關聯判讀：" + item.relation : "關聯判讀：尚未取得，資料無法解鎖。";
    $("itemInspectionRoute").innerHTML = KEY_ITEM_CHAIN.map((routeItem, index) => {
      const done = index < state.keyItemsFound, next = index === state.keyItemsFound;
      const text = done ? routeItem.trueName : next ? "疑似：" + routeItem.vagueName : "尚未確認";
      return `<span class="${done ? "done" : next ? "next" : ""}">${index + 1}｜${text}</span>`;
    }).join("");
    $("itemInspection").classList.toggle("is-hidden", !state.itemInspectionOpen);
    $("itemInspection").setAttribute("aria-hidden", state.itemInspectionOpen ? "false" : "true");
    $("itemCounterButton").setAttribute("aria-expanded", state.itemInspectionOpen ? "true" : "false");
  }

  function setItemInspection(open, itemId = null) {
    if (itemId) state.inspectionItemId = itemId;
    state.itemInspectionOpen = Boolean(open);
    renderItemInspection();
  }

  function showStorySequence(kind, item) {
    const profile = state.playerProfile, nextItem = KEY_ITEM_CHAIN[Math.min(state.keyItemsFound, KEY_ITEM_CHAIN.length - 1)];
    const nextBuilding = WORLD_BUILDINGS.find((building) => building.id === nextItem?.buildingId);
    let title = "你想起自己是誰", chapter = "MEMORY RECOVERED", lines = [];
    if (kind === "IDENTITY") {
      profile.remembered = true;
      lines = [
        profile.before,
        "你原本的任務是：<strong>" + profile.originalGoal + "</strong>",
        profile.choice,
        "當你握住「<strong>" + item.trueName + "</strong>」時，遺失的身分與此刻的目的終於接回來。",
        "下一個明確地點是「<strong>" + (nextBuilding?.label || nextItem.scene) + "</strong>」。那裡原本只是你逃難路線上的工作目標。",
        "但某件不屬於你原定任務的東西，正在那條路上等你。"
      ];
    } else {
      profile.storyTurnTriggered = true; title = "意外闖進你的任務"; chapter = "INCITING INCIDENT";
      lines = [
        "你找到的「<strong>" + item.trueName + "</strong>」並不是原定要取回的普通裝備。",
        "一名倒在封鎖線旁的知情人攥住你的袖口，只來得及說：",
        "<strong>「" + profile.witnessLine + "」</strong>",
        item.relation,
        "你的逃難目的沒有消失，卻被插入了一條更危險的路：把這件東西帶往「<strong>" + (nextBuilding?.label || nextItem.scene) + "</strong>」。",
        "從這一刻起，你被捲入「<strong>" + profile.theme + "</strong>」。某個還不知道自己會成為英雄的人，也正在移動。"
      ];
    }
    $("storyChapter").textContent = chapter; $("storyTitle").textContent = title;
    $("storyIdentity").innerHTML = [profile.name, profile.age + "歲", profile.gender, profile.occupation].map((value) => "<span>" + escapeHtml(value) + "</span>").join("");
    $("storyLines").innerHTML = lines.map((line, index) => "<p class=\"story-line " + (index === lines.length - 1 ? "turn" : "") + "\" style=\"animation-delay:" + (index * .42) + "s\">" + line + "</p>").join("");
    state.storyPaused = true; state.storyChapter = kind; $("storyReveal").classList.remove("is-hidden");
  }

  function closeStorySequence() {
    state.storyPaused = false; state.storyChapter = null; $("storyReveal").classList.add("is-hidden");
  }
