window.YaGames = {
  init: function () {
    return Promise.resolve({
      features: {
        LoadingAPI: {
          ready: function () {},
          start: function () {}
        }
      },
      environment: { i18n: { lang: "ru" } },
      getPlayer: function () {
        return Promise.resolve({
          getData: function () {
            return Promise.resolve({});
          },
          setData: function (data) {
            try { localStorage.setItem("business_empire_sdk", JSON.stringify(data)); } catch (e) {}
            return Promise.resolve();
          }
        });
      },
      getLeaderboards: function () {
        return Promise.resolve({
          setLeaderboardScore: function () { return Promise.resolve(); },
          getLeaderboardEntries: function () { return Promise.resolve({ entries: [] }); }
        });
      },
      adv: {
        showFullscreenAdv: function () { return Promise.resolve(); },
        showRewardedVideo: function (opts) {
          if (opts && opts.callbacks) {
            if (opts.callbacks.onOpen) opts.callbacks.onOpen();
            if (opts.callbacks.onRewarded) opts.callbacks.onRewarded();
            if (opts.callbacks.onClose) opts.callbacks.onClose();
          }
          return Promise.resolve();
        }
      },
      getPurchases: function () { return Promise.reject(new Error("purchases unavailable")); }
    });
  }
};
