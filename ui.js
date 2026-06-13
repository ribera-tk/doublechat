(function () {
    'use strict';
    if (window.DoubleChatUI) return;

    const DC_VERSION = 'UI-4.1';
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    let isFull = false;
    let currentMode = 'normal';

    window.DoubleChatUI = {
        init: function () { createUI(); },
        appendLog: function (sender, text) { return log(sender, text); },
        playOutputSound: function (sender, text) { return playOutputSound(sender, text); },
        updateTokenCounter: function (detail) { return updateTokenCounter(detail); }
    };

    function getSoundProfile(sender) {
        if (sender === 'you') return { wave: 'square', notes: [1320, 1760], gain: 0.055, step: 34, duration: 0.045 };
        if (sender === 'gemini') return { wave: 'triangle', notes: [1046.5, 1318.51, 1567.98], gain: 0.05, step: 38, duration: 0.05 };
        return { wave: 'sine', notes: [880, 1174.66], gain: 0.06, step: 42, duration: 0.05 };
    }

    function playTone(sender, index) {
        try {
            const profile = getSoundProfile(sender);
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const now = ctx.currentTime;
            osc.type = profile.wave;
            osc.frequency.setValueAtTime(profile.notes[index % profile.notes.length], now);
            gain.gain.setValueAtTime(profile.gain, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + profile.duration);
        } catch (e) { }
    }

    function playOutputSound(sender, text) {
        const count = Math.min(String(text || '').length, 36);
        for (let i = 0; i < count; i++) {
            window.setTimeout(() => playTone(sender, i), i * 35);
        }
    }

    function updateEar(length) {
        const ear = document.getElementById('dc-ear');
        if (!ear) return;
        const ratio = Math.min(length / 50, 1);
        ear.style.transform = `scaleY(${1 + ratio})`;
    }

    function createUI() {
        const div = document.createElement('div');
        div.id = 'dc-ear';
        div.style = 'position:fixed; bottom:20px; right:20px; width:50px; height:50px; background:pink; border-radius:50%; transition:0.2s;';
        document.body.appendChild(div);
    }
})();
