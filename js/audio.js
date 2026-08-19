(function () {
  "use strict";

  var ac = null;
  var master = null;
  var muted = false;
  var musicTimer = null;
  var musicOn = false;

  var MUSIC_NOTES = [261.63, 293.66, 329.63, 293.66, 261.63, 220, 196, 220];

  function ctx() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function tone(opts) {
    var c = ctx();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  var sounds = {
    click: function () {
      tone({ type: "triangle", from: 300, to: 150, dur: 0.06, vol: 0.22 });
    },
    coin: function () {
      tone({ type: "sine", from: 1000, to: 900, dur: 0.12, vol: 0.18 });
      tone({ type: "sine", from: 1500, to: 1300, dur: 0.15, vol: 0.12, delay: 0.05 });
    },
    buy: function () {
      tone({ type: "square", from: 523.25, dur: 0.12, vol: 0.1 });
      tone({ type: "square", from: 659.25, dur: 0.12, vol: 0.1, delay: 0.09 });
      tone({ type: "square", from: 783.99, dur: 0.18, vol: 0.1, delay: 0.18 });
    },
    upgrade: function () {
      var notes = [261.63, 329.63, 392, 523.25];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: "triangle", from: notes[i], dur: 0.1, vol: 0.16, delay: i * 0.06 });
      }
    },
    reward: function () {
      var n = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      for (var i = 0; i < n.length; i++) {
        tone({ type: "sine", from: n[i], dur: i === n.length - 1 ? 0.4 : 0.16, vol: 0.18, delay: i * 0.1 });
      }
    },
    boost: function () {
      tone({ type: "sawtooth", from: 200, to: 2000, dur: 0.4, vol: 0.1 });
    },
    error: function () {
      tone({ type: "sine", from: 110, to: 90, dur: 0.3, vol: 0.22 });
    }
  };

  function playMusic() {
    var c = ctx();
    if (!c || musicOn) return;
    musicOn = true;
    var step = 0;
    musicTimer = setInterval(function () {
      if (!musicOn || muted) return;
      tone({ type: "triangle", from: MUSIC_NOTES[step % MUSIC_NOTES.length], dur: 0.5, vol: 0.045 });
      step++;
    }, 550);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function unlock() {
    if (ac && ac.state === "suspended") ac.resume();
    playMusic();
  }

  function play(name) {
    if (muted) return;
    if (sounds[name]) sounds[name]();
  }

  function setMuted(m) {
    muted = !!m;
    if (ac) master.gain.value = muted ? 0 : 0.9;
    if (muted) stopMusic(); else playMusic();
  }

  window.AudioManager = {
    play: play,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    unlock: unlock
  };

  document.addEventListener("touchstart", unlock, { passive: true });
  document.addEventListener("click", unlock, { passive: true });
})();