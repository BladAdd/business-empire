(function () {
  "use strict";

  var SAVE_KEY_SDK = "business_empire_save";
  var LEADERBOARD = "total_money";
  var OFFLINE_MAX_SEC = 2 * 3600;
  var OFFLINE_RATE = 0.5;
  var BOOST_SEC = 30 * 60;
  var AD_THROTTLE = 3 * 60 * 1000;

  var SUFFIX = ["", "тыс", "млн", "млрд", "трлн", "квадр", "квинт", "секст", "септ"];

  var BUSINESSES = [
    { id: "stall",  name: "Ларёк",       emoji: "🥤", base: 1,      cost: 10 },
    { id: "tent",   name: "Палатка",     emoji: "⛺", base: 10,     cost: 120 },
    { id: "shop",   name: "Магазин",     emoji: "🏪", base: 80,     cost: 1200 },
    { id: "cafe",   name: "Кафе",        emoji: "☕", base: 600,    cost: 9000 },
    { id: "gas",    name: "АЗС",         emoji: "⛽", base: 5000,   cost: 72000 },
    { id: "office", name: "Офис",        emoji: "🏢", base: 40000,  cost: 600000 },
    { id: "hotel",  name: "Отель",       emoji: "🏨", base: 300000, cost: 4.5e6 },
    { id: "factory", name: "Завод",      emoji: "🏭", base: 2.5e6,  cost: 36e6 },
    { id: "airport", name: "Аэропорт",   emoji: "✈️", base: 2e7,    cost: 300e6 },
    { id: "corp",   name: "Корпорация",  emoji: "🏦", base: 1.5e8,  cost: 2.5e9 }
  ];

  var state = {
    money: 0,
    totalEarned: 0,
    clickLvl: 1,
    biz: {},
    lastSeen: Date.now(),
    dailyStreak: 0,
    lastDaily: "",
    boostUntil: 0,
    muted: false
  };

  var imgState = {};
  function afterAssets() {
    var src = assetSrc("assets/bg");
    if (src) {
      document.body.style.backgroundImage = "url(" + src + ")";
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
    }
    if (typeof render === "function") render();
  }
  function preloadAsset(base) {
    if (base in imgState) return;
    if (typeof Image === "undefined") { imgState[base] = null; return; }
    var cands = [base + ".png", base + ".svg"];
    var i = 0;
    var im = new Image();
    im.onload = function () { imgState[base] = cands[i]; afterAssets(); };
    im.onerror = function () {
      i++;
      if (i < cands.length) { im.src = cands[i]; } else { imgState[base] = null; afterAssets(); }
    };
    im.src = cands[i];
  }
  function assetSrc(base) { return imgState[base] || null; }
  function iconHTML(base, emoji, cls) {
    var src = assetSrc(base);
    if (src) {
      return '<img class="' + (cls || "asset-ico") + '" src="' + src + '" alt="">';
    }
    return '<span class="' + (cls || "asset-emoji") + '">' + emoji + "</span>";
  }
  function preloadAssets() {
    for (var i = 0; i < BUSINESSES.length; i++) {
      preloadAsset("assets/img/business-" + BUSINESSES[i].id);
    }
    preloadAsset("assets/img/coin");
    preloadAsset("assets/bg");
    preloadAsset("assets/sprites/click-burst");
    preloadAsset("assets/sprites/coin-fly");
    preloadAsset("assets/sprites/confetti");
  }

  function sfx(name) {
    if (window.AudioManager) window.AudioManager.play(name);
  }

  function playSpriteFx(base, w, h, ms, left, top) {
    preloadAsset(base);
    var src = assetSrc(base);
    if (!src) return;
    var fxLayer = $("fxLayer");
    if (!fxLayer) return;
    var fx = document.createElement("div");
    fx.className = "fx fx-pop";
    fx.style.width = w + "px";
    fx.style.height = h + "px";
    fx.style.left = left + "px";
    fx.style.top = top + "px";
    fx.style.backgroundImage = "url(" + src + ")";
    fx.style.backgroundSize = "cover";
    fx.style.animationDuration = (ms || 500) + "ms";
    fx.addEventListener("animationend", function () { fx.remove(); });
    fxLayer.appendChild(fx);
  }

  function tapFx() {
    if (typeof tapBtn.getBoundingClientRect !== "function") return;
    var r = tapBtn.getBoundingClientRect();
    playSpriteFx("assets/sprites/click-burst", 110, 110, 450,
      r.left + r.width / 2 - 55, r.top + r.height / 2 - 55);
  }
  function coinFx() {
    if (typeof tapBtn.getBoundingClientRect !== "function") return;
    var r = tapBtn.getBoundingClientRect();
    playSpriteFx("assets/sprites/coin-fly", 70, 70, 550,
      r.left + r.width / 2 - 35, r.top - 45);
  }
  function confettiFx() {
    playSpriteFx("assets/sprites/confetti", 170, 170, 650,
      (window.innerWidth || 480) / 2 - 85, (window.innerHeight || 800) * 0.15);
  }

  var ysdk = null;
  var isStub = false;
  var lastTick = Date.now();
  var lastFullscreen = 0;
  var pendingOffline = 0;
  var toastTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  var moneyEl = $("money"), totalEl = $("total"), boostPill = $("boostPill"),
      offlinePill = $("offlinePill"), tapBtn = $("tapBtn"), tapIcon = $("tapIcon"),
      tapLabel = $("tapLabel"), tapWrap = $("tapWrap"), dailyBtn = $("dailyBtn"),
      dailyInfo = $("dailyInfo"), clickLvlEl = $("clickLvl"),
      clickUpgradeBtn = $("clickUpgradeBtn"), bizList = $("bizList"),
      offlineBox = $("offlineBox"), offlineAmt = $("offlineAmt"),
      offlineClaim = $("offlineClaim"), offlineTriple = $("offlineTriple"),
      toastEl = $("toast"), adBtn = $("adBtn"), boardBtn = $("boardBtn"),
      saveBtn = $("saveBtn"), boardPop = $("boardPop"), boardRows = $("boardRows"),
      boardClose = $("boardClose"), muteBtn = $("muteBtn");

  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) return String(Math.floor(n));
    var tier = 0;
    while (n >= 1000 && tier < SUFFIX.length - 1) { n /= 1000; tier++; }
    var s = parseFloat(n.toFixed(2)).toString();
    return s + " " + SUFFIX[tier];
  }

  function boosted() { return Date.now() < state.boostUntil; }

  function incomePerSec() {
    var sum = 0;
    for (var i = 0; i < BUSINESSES.length; i++) {
      var lvl = state.biz[BUSINESSES[i].id] || 0;
      if (lvl > 0) sum += BUSINESSES[i].base * Math.pow(2, lvl - 1);
    }
    if (boosted()) sum *= 2;
    return sum;
  }

  function clickPower() {
    return Math.pow(2, state.clickLvl - 1) * (boosted() ? 2 : 1);
  }

  function bizLevel(id) { return state.biz[id] || 0; }
  function bizIncome(b) { return b.base * Math.pow(2, Math.max(bizLevel(b.id), 1) - 1); }

  function bizUpgradeCost(b) {
    var lvl = bizLevel(b.id);
    if (lvl === 0) return b.cost;
    return Math.ceil(b.cost * 0.7 * Math.pow(2.6, lvl - 1));
  }

  function clickUpgradeCost() {
    return Math.ceil(50 * Math.pow(2.6, state.clickLvl - 1));
  }

  function dailyReward() {
    var mult = [1, 1.5, 2, 2.5, 3, 4, 5][state.dailyStreak] || 1;
    return Math.floor((incomePerSec() * 60 + 50) * mult);
  }

  function today() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function gainMoney(amount) {
    if (amount <= 0) return;
    state.money += amount;
    state.totalEarned += amount;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  function persist() {
    state.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY_SDK, JSON.stringify(state)); } catch (e) {}
    if (!ysdk) return;
    ysdk.getPlayer().then(function (player) {
      return player.setData({ game: JSON.stringify(state) });
    }).catch(function () {});
  }

  var saveTimer = null;
  function persistDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 3000);
  }

  function submitLeaderboard() {
    if (!ysdk) return Promise.resolve();
    return ysdk.getLeaderboards().then(function (boards) {
      return boards.setLeaderboardScore(LEADERBOARD, Math.floor(state.totalEarned));
    });
  }

  function render() {
    moneyEl.innerHTML = fmt(state.money);
    totalEl.textContent = "Всего заработано: " + fmt(state.totalEarned);

    boostPill.classList.toggle("show", boosted());
    if (boosted()) {
      var left = Math.max(0, Math.ceil((state.boostUntil - Date.now()) / 1000));
      boostPill.textContent = "🚀 Доход ×2: " + Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2);
    }

    tapBtn.classList.add("pulse");
    tapBtn.classList.toggle("boost-glow", boosted());
    updateMuteBtn();

    tapLabel.textContent = "Заработать (+" + fmt(clickPower()) + ")";
    var topBiz = null;
    for (var i = 0; i < BUSINESSES.length; i++) {
      if (bizLevel(BUSINESSES[i].id) > 0) topBiz = BUSINESSES[i];
    }
    if (topBiz) {
      tapIcon.innerHTML = iconHTML("assets/img/business-" + topBiz.id, topBiz.emoji, "tap-ico");
    }

    clickLvlEl.textContent = "×" + fmt(Math.pow(2, state.clickLvl - 1));
    clickUpgradeBtn.textContent = fmt(clickUpgradeCost());
    clickUpgradeBtn.disabled = state.money < clickUpgradeCost();

    renderBizList();
    renderDaily();
    updateOfflinePill();
  }

  function renderBizList() {
    var html = "";
    for (var i = 0; i < BUSINESSES.length; i++) {
      var b = BUSINESSES[i];
      var lvl = bizLevel(b.id);
      var owned = lvl > 0;
      var cost = bizUpgradeCost(b);
      var can = state.money >= cost;
      var btnClass = owned ? "buy-btn biz-btn own" : "buy-btn biz-btn";
      var btnText = owned ? "Улучшить ×2\n" + fmt(cost) : "Купить: " + fmt(cost);
      html +=
        '<div class="biz-row">' +
        '<div class="e">' + iconHTML("assets/img/business-" + b.id, b.emoji, "biz-ico") + "</div>" +
        '<div class="biz-info">' +
        '<div class="n">' + b.name + (owned ? ' <span class="lvl">Ур. ' + lvl + "</span>" : "") + "</div>" +
        '<div class="ps">' + fmt(bizIncome(b)) + "/сек</div>" +
        "</div>" +
        '<button class="' + btnClass + '" data-buy="' + b.id + '"' + (can ? "" : " disabled") + ">" +
        btnText.replace(/\n/g, "<br>") + "</button>" +
        "</div>";
    }
    bizList.innerHTML = html;
  }

  function renderDaily() {
    var d = today();
    var done = state.lastDaily === d;
    var day = Math.min(state.dailyStreak, 7);
    dailyBtn.disabled = done;
    dailyInfo.textContent = done ? "Забрано ✔" : (state.dailyStreak === 0 ? "1-й день" : day + "-й день подряд");
  }

  function updateMuteBtn() {
    if (!muteBtn) return;
    muteBtn.innerHTML = state.muted
      ? '<span class="e">🔇</span>Звук'
      : '<span class="e">🔊</span>Звук';
  }

  function updateOfflinePill() {
    offlinePill.classList.toggle("show", pendingOffline > 0);
    if (pendingOffline > 0) offlinePill.textContent = "💤 Готово: " + fmt(pendingOffline);
  }

  function tryInterstitial() {
    if (!ysdk) return;
    var now = Date.now();
    if (now - lastFullscreen < AD_THROTTLE) return;
    if (Math.random() > 0.25) return;
    lastFullscreen = now;
    ysdk.adv.showFullscreenAdv().catch(function () {});
  }

  function showRewarded(onReward, label) {
    if (!ysdk) {
      onReward();
      return;
    }
    ysdk.adv.showRewardedVideo({
      callbacks: {
        onRewarded: function () { onReward(); toast("Награда получена! 🎉"); },
        onError: function () { toast("Реклама недоступна"); }
      }
    }).catch(function () { toast("Реклама недоступна"); });
  }

  function buyBusiness(id) {
    var b = null;
    for (var i = 0; i < BUSINESSES.length; i++) {
      if (BUSINESSES[i].id === id) { b = BUSINESSES[i]; break; }
    }
    if (!b) return;
    var cost = bizUpgradeCost(b);
    if (state.money < cost) { sfx("error"); toast("Не хватает денег!"); return; }
    state.money -= cost;
    state.biz[id] = bizLevel(id) + 1;
    sfx("buy");
    confettiFx();
    coinFx();
    if (bizLevel(id) === 1) toast("🎉 " + b.name + " открыт!");
    persistDebounced();
    tryInterstitial();
    render();
  }

  function claimOffline(multiplier) {
    if (pendingOffline <= 0) return;
    var amount = pendingOffline * (multiplier || 1);
    pendingOffline = 0;
    offlineBox.classList.add("hidden");
    gainMoney(amount);
    sfx("coin");
    confettiFx();
    toast("Заработано офлайн: " + fmt(amount));
    persistDebounced();
    render();
  }

  function computeOffline() {
    var elapsed = (Date.now() - state.lastSeen) / 1000;
    if (elapsed < 30 || incomePerSec() <= 0) return;
    var capped = Math.min(elapsed, OFFLINE_MAX_SEC);
    pendingOffline = Math.floor(incomePerSec() * capped * OFFLINE_RATE);
    if (pendingOffline <= 0) return;
    offlineAmt.textContent = fmt(pendingOffline);
    offlineBox.classList.remove("hidden");
    var mins = Math.floor(capped / 60);
    document.querySelector("#offlineBox h3").textContent =
      "💤 Вы отсутствовали " + (mins >= 60 ? Math.floor(mins / 60) + " ч " + (mins % 60) + " мин" : mins + " мин");
    updateOfflinePill();
  }

  function openBoard() {
    if (!ysdk) {
      toast("Лидерборд доступен только на платформе");
      return;
    }
    submitLeaderboard().then(function () {
      return ysdk.getLeaderboards().then(function (boards) {
        return boards.getLeaderboardEntries(LEADERBOARD, { includeUser: true, quantityAround: 5 });
      });
    }).then(function (res) {
      var rows = "";
      var entries = res.entries || [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var name = e.player.publicName || "Игрок";
        var me = e.player.rank === "player" || (e.player.scopeData && e.player.scopeData.isMe);
        rows += '<div class="row' + (me ? " me" : "") + '">' +
          "<span>" + (me ? "⭐ " : "") + name + "</span>" +
          "<span>" + fmt(e.score) + "</span></div>";
      }
      boardRows.innerHTML = rows || '<div class="row">Пока пусто — стань первым!</div>';
      boardPop.classList.remove("hidden");
    }).catch(function () {
      toast("Лидерборд недоступен");
    });
  }

  tapBtn.addEventListener("click", function () {
    var p = clickPower();
    gainMoney(p);
    sfx("click");
    tapFx();
    var f = document.createElement("div");
    f.className = "float-num";
    f.innerHTML = (assetSrc("assets/img/coin")
      ? '<img src="' + assetSrc("assets/img/coin") + '" style="width:20px;height:20px;vertical-align:-3px;border-radius:50%;"> '
      : "") + "+" + fmt(p);
    f.style.left = (35 + Math.random() * 30) + "%";
    tapWrap.appendChild(f);
    setTimeout(function () { f.remove(); }, 850);
    render();
  });

  clickUpgradeBtn.addEventListener("click", function () {
    var cost = clickUpgradeCost();
    if (state.money < cost) { sfx("error"); toast("Не хватает денег!"); return; }
    state.money -= cost;
    state.clickLvl++;
    sfx("upgrade");
    persistDebounced();
    render();
  });

  bizList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-buy]");
    if (btn) buyBusiness(btn.getAttribute("data-buy"));
  });

  dailyBtn.addEventListener("click", function () {
    var d = today();
    if (state.lastDaily === d) return;
    var reward = dailyReward();
    state.lastDaily = d;
    if (state.dailyStreak === 0 || !wasYesterday()) {
      state.dailyStreak = 1;
    } else {
      state.dailyStreak = Math.min(state.dailyStreak + 1, 7);
    }
    var claim = function () {
      gainMoney(reward);
      sfx("reward");
      confettiFx();
      toast("🎁 Награда: " + fmt(reward) + " (" + state.dailyStreak + "-й день)");
      persistDebounced();
      render();
    };
    showRewarded(claim, "daily");
  });

  function wasYesterday() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day === state.lastDaily;
  }

  offlineClaim.addEventListener("click", function () { claimOffline(1); });
  offlineTriple.addEventListener("click", function () {
    showRewarded(function () { claimOffline(3); }, "offline");
  });

  adBtn.addEventListener("click", function () {
    showRewarded(function () {
      state.boostUntil = Date.now() + BOOST_SEC * 1000;
      sfx("boost");
      toast("🚀 Доход ×2 на 30 минут!");
      persistDebounced();
      render();
    }, "boost");
  });

  muteBtn.addEventListener("click", function () {
    state.muted = !state.muted;
    if (window.AudioManager) window.AudioManager.setMuted(state.muted);
    updateMuteBtn();
    persistDebounced();
  });

  boardBtn.addEventListener("click", openBoard);
  boardClose.addEventListener("click", function () { boardPop.classList.add("hidden"); });
  boardPop.addEventListener("click", function (e) {
    if (e.target === boardPop) boardPop.classList.add("hidden");
  });

  saveBtn.addEventListener("click", function () {
    persist();
    submitLeaderboard().then(function () { toast("Сохранено ✔"); });
  });

  setInterval(function () {
    var now = Date.now();
    var dt = Math.min((now - lastTick) / 1000, 2);
    lastTick = now;
    var inc = incomePerSec();
    if (inc > 0) {
      gainMoney(inc * dt);
      moneyEl.innerHTML = fmt(state.money);
    }
  }, 250);

  setInterval(function () { if (boosted()) render(); }, 1000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) persist();
  });

  window.addEventListener("beforeunload", persist);

  function loadLocal() {
    try {
      var raw = localStorage.getItem(SAVE_KEY_SDK);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  window.YaGames.init().then(function (sdk) {
    ysdk = sdk;
    if (sdk.features && sdk.features.LoadingAPI) sdk.features.LoadingAPI.ready();
    isStub = true;
    return ysdk.getPlayer().then(function (player) {
      return player.getData();
    });
  }).then(function (data) {
    var parsed = null;
    if (data && data.game) {
      try { parsed = JSON.parse(data.game); } catch (e) {}
    }
    var src = parsed || loadLocal();
    if (src) {
      state.money = src.money || 0;
      state.totalEarned = src.totalEarned || 0;
      state.clickLvl = src.clickLvl || 1;
      state.biz = src.biz || {};
      state.dailyStreak = src.dailyStreak || 0;
      state.lastDaily = src.lastDaily || "";
      state.boostUntil = src.boostUntil || 0;
      state.muted = !!src.muted;
      if (src.lastSeen) state.lastSeen = src.lastSeen;
    }
    if (window.AudioManager) window.AudioManager.setMuted(state.muted);
    render();
    computeOffline();
    preloadAssets();
  }).catch(function () {
    var src = loadLocal();
    if (src) {
      state.money = src.money || 0;
      state.totalEarned = src.totalEarned || 0;
      state.clickLvl = src.clickLvl || 1;
      state.biz = src.biz || {};
      state.dailyStreak = src.dailyStreak || 0;
      state.lastDaily = src.lastDaily || "";
      state.boostUntil = src.boostUntil || 0;
      state.muted = !!src.muted;
      if (src.lastSeen) state.lastSeen = src.lastSeen;
    }
    if (window.AudioManager) window.AudioManager.setMuted(state.muted);
    render();
    computeOffline();
    preloadAssets();
  });
})();
