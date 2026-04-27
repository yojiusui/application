(() => {
  'use strict';

  const STORAGE_KEY = 'kaiketsu_brain_dojo_v1';

  const screens = {
    home: document.getElementById('home'),
    game: document.getElementById('game'),
    result: document.getElementById('result'),
  };

  const els = {
    streakValue: document.getElementById('streakValue'),
    totalPlays: document.getElementById('totalPlays'),
    totalBest: document.getElementById('totalBest'),
    gameTitle: document.getElementById('gameTitle'),
    gameMeta1: document.getElementById('gameMeta1'),
    gameMeta2: document.getElementById('gameMeta2'),
    gameStage: document.getElementById('gameStage'),
    backBtn: document.getElementById('backBtn'),
    resultScore: document.getElementById('resultScore'),
    resultUnit: document.getElementById('resultUnit'),
    resultMessage: document.getElementById('resultMessage'),
    resultBest: document.getElementById('resultBest'),
    retryBtn: document.getElementById('retryBtn'),
    homeBtn: document.getElementById('homeBtn'),
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      bests: { math: 0, memory: 0, stroop: 0, chain: 0 },
      totalPlays: 0,
      streak: 0,
      lastPlayed: null,
    };
  }

  function saveState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function updateStreak(state) {
    const today = todayStr();
    if (state.lastPlayed === today) return;
    if (state.lastPlayed === yesterdayStr()) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }
    state.lastPlayed = today;
  }

  let state = loadState();

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function renderHome() {
    els.streakValue.textContent = state.streak;
    els.totalPlays.textContent = state.totalPlays;
    const total = Object.values(state.bests).reduce((a, b) => a + b, 0);
    els.totalBest.textContent = total;

    const units = { math: '点', memory: '桁', stroop: '点', chain: '段' };
    document.querySelectorAll('[data-best]').forEach(el => {
      const key = el.dataset.best;
      const val = state.bests[key] || 0;
      el.textContent = val > 0 ? `自己ベスト ${val}${units[key]}` : `— ${units[key]}`;
    });
  }

  function finish(gameKey, score, unit, messageFn) {
    state.totalPlays += 1;
    if (score > (state.bests[gameKey] || 0)) {
      state.bests[gameKey] = score;
    }
    updateStreak(state);
    saveState(state);

    els.resultScore.textContent = score;
    els.resultUnit.textContent = unit;
    els.resultMessage.textContent = messageFn(score);
    els.resultBest.textContent = `自己ベスト: ${state.bests[gameKey]}${unit}`;
    els.retryBtn.onclick = () => startGame(gameKey);
    showScreen('result');
    renderHome();
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ============================== Math Game ==============================
  function startMathGame() {
    els.gameTitle.textContent = '瞬間暗算';
    els.gameMeta1.textContent = '残り 60秒';
    els.gameMeta2.textContent = '0 点';

    let score = 0;
    let timeLeft = 60;
    const stage = els.gameStage;
    let timerId = null;
    let active = true;

    function tick() {
      timeLeft -= 1;
      els.gameMeta1.textContent = `残り ${timeLeft}秒`;
      if (timeLeft <= 0) {
        active = false;
        clearInterval(timerId);
        finish('math', score, '点', s => {
          if (s >= 25) return '驚異の暗算力！';
          if (s >= 15) return 'お見事です。';
          if (s >= 8) return 'いいペース！';
          return '練習あるのみ。';
        });
      }
    }

    function makeProblem() {
      const ops = ['+', '-', '×'];
      const op = ops[rand(0, 2)];
      let a, b, ans;
      if (op === '+') { a = rand(2, 49); b = rand(2, 49); ans = a + b; }
      else if (op === '-') { a = rand(10, 60); b = rand(2, a - 1); ans = a - b; }
      else { a = rand(2, 12); b = rand(2, 12); ans = a * b; }

      stage.innerHTML = '';
      const problem = document.createElement('div');
      problem.className = 'problem';
      problem.textContent = `${a} ${op} ${b} = ?`;
      stage.appendChild(problem);

      const choicesWrap = document.createElement('div');
      choicesWrap.className = 'choices';

      const wrongs = new Set();
      while (wrongs.size < 3) {
        const offset = rand(-9, 9);
        if (offset === 0) continue;
        const v = ans + offset;
        if (v < 0) continue;
        if (v === ans) continue;
        wrongs.add(v);
      }
      const opts = shuffle([ans, ...wrongs]);

      opts.forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = v;
        btn.onclick = () => {
          if (!active) return;
          if (v === ans) {
            btn.classList.add('correct');
            score += 1;
            els.gameMeta2.textContent = `${score} 点`;
            setTimeout(makeProblem, 120);
          } else {
            btn.classList.add('wrong');
            score = Math.max(0, score - 1);
            els.gameMeta2.textContent = `${score} 点`;
            setTimeout(makeProblem, 350);
          }
        };
        choicesWrap.appendChild(btn);
      });

      stage.appendChild(choicesWrap);
    }

    makeProblem();
    timerId = setInterval(tick, 1000);
    currentCleanup = () => { active = false; clearInterval(timerId); };
  }

  // ============================== Memory Game ==============================
  function startMemoryGame() {
    els.gameTitle.textContent = '数字記憶';
    els.gameMeta1.textContent = '桁数 3';
    els.gameMeta2.textContent = '—';

    let length = 3;
    let target = '';
    let typed = '';
    const stage = els.gameStage;

    function showStage(content) {
      stage.innerHTML = '';
      stage.appendChild(content);
    }

    function genNumber(n) {
      let s = '';
      for (let i = 0; i < n; i++) s += rand(0, 9);
      return s;
    }

    function showNumberPhase() {
      target = genNumber(length);
      els.gameMeta1.textContent = `桁数 ${length}`;
      els.gameMeta2.textContent = '記憶中…';

      const wrap = document.createElement('div');
      wrap.className = 'start-overlay';
      const big = document.createElement('div');
      big.className = 'big-show';
      big.textContent = target;
      wrap.appendChild(big);
      const hint = document.createElement('p');
      hint.textContent = 'この数字を覚えてください…';
      wrap.appendChild(hint);
      showStage(wrap);

      const showMs = 1500 + length * 350;
      setTimeout(inputPhase, showMs);
    }

    function inputPhase() {
      typed = '';
      els.gameMeta2.textContent = '入力してください';

      const wrap = document.createElement('div');
      wrap.className = 'start-overlay';

      const display = document.createElement('div');
      display.className = 'input-display';
      display.textContent = '';
      wrap.appendChild(display);

      const pad = document.createElement('div');
      pad.className = 'numpad';
      const layout = ['1','2','3','4','5','6','7','8','9','del','0','ok'];
      layout.forEach(label => {
        const btn = document.createElement('button');
        if (label === 'del') btn.textContent = '⌫';
        else if (label === 'ok') btn.textContent = '決定';
        else btn.textContent = label;
        btn.onclick = () => handleKey(label, display);
        pad.appendChild(btn);
      });
      wrap.appendChild(pad);
      showStage(wrap);
    }

    function handleKey(key, display) {
      if (key === 'del') {
        typed = typed.slice(0, -1);
      } else if (key === 'ok') {
        evaluate();
        return;
      } else {
        if (typed.length >= length) return;
        typed += key;
      }
      display.textContent = typed;
    }

    function evaluate() {
      if (typed === target) {
        length += 1;
        if (length > 14) {
          finish('memory', length - 1, '桁', () => 'マスタークラス。');
          return;
        }
        const wrap = document.createElement('div');
        wrap.className = 'start-overlay';
        const ok = document.createElement('div');
        ok.className = 'big-show';
        ok.textContent = '正解！';
        ok.style.color = 'var(--good)';
        wrap.appendChild(ok);
        const sub = document.createElement('p');
        sub.textContent = `次は ${length} 桁です`;
        wrap.appendChild(sub);
        showStage(wrap);
        setTimeout(showNumberPhase, 900);
      } else {
        finish('memory', length - 1, '桁', s => {
          if (s >= 9) return '見事な記憶力。';
          if (s >= 6) return 'よくできました。';
          if (s >= 4) return 'まずまずの記録。';
          return '集中して再挑戦を。';
        });
      }
    }

    showNumberPhase();
    currentCleanup = () => {};
  }

  // ============================== Stroop Game ==============================
  function startStroopGame() {
    els.gameTitle.textContent = '色判別';
    els.gameMeta1.textContent = '残り 45秒';
    els.gameMeta2.textContent = '0 点';

    const colors = [
      { name: '赤', code: '#f87171' },
      { name: '青', code: '#60a5fa' },
      { name: '緑', code: '#4ade80' },
      { name: '黄', code: '#facc15' },
      { name: '紫', code: '#c084fc' },
      { name: '橙', code: '#fb923c' },
    ];

    let score = 0;
    let timeLeft = 45;
    const stage = els.gameStage;
    let timerId = null;
    let active = true;

    function tick() {
      timeLeft -= 1;
      els.gameMeta1.textContent = `残り ${timeLeft}秒`;
      if (timeLeft <= 0) {
        active = false;
        clearInterval(timerId);
        finish('stroop', score, '点', s => {
          if (s >= 30) return '反射神経が冴えています。';
          if (s >= 18) return 'よくできました。';
          if (s >= 10) return 'まずまず。';
          return '焦らず確実に。';
        });
      }
    }

    function makeProblem() {
      const wordIdx = rand(0, colors.length - 1);
      let colorIdx = rand(0, colors.length - 1);
      while (colorIdx === wordIdx) colorIdx = rand(0, colors.length - 1);

      const word = colors[wordIdx];
      const color = colors[colorIdx];

      stage.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'start-overlay';

      const display = document.createElement('div');
      display.className = 'color-word';
      display.textContent = word.name;
      display.style.color = color.code;
      wrap.appendChild(display);

      const hint = document.createElement('p');
      hint.textContent = '文字の「色」を答えてください';
      wrap.appendChild(hint);

      const choices = document.createElement('div');
      choices.className = 'choices';
      const opts = shuffle([color, ...shuffle(colors.filter(c => c !== color)).slice(0, 3)]);
      opts.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'choice';
        btn.textContent = c.name;
        btn.onclick = () => {
          if (!active) return;
          if (c === color) {
            btn.classList.add('correct');
            score += 1;
            els.gameMeta2.textContent = `${score} 点`;
            setTimeout(makeProblem, 120);
          } else {
            btn.classList.add('wrong');
            score = Math.max(0, score - 1);
            els.gameMeta2.textContent = `${score} 点`;
            setTimeout(makeProblem, 350);
          }
        };
        choices.appendChild(btn);
      });
      wrap.appendChild(choices);
      stage.appendChild(wrap);
    }

    makeProblem();
    timerId = setInterval(tick, 1000);
    currentCleanup = () => { active = false; clearInterval(timerId); };
  }

  // ============================== Chain Game ==============================
  function startChainGame() {
    els.gameTitle.textContent = '暗算チェイン';
    els.gameMeta1.textContent = '段 1';
    els.gameMeta2.textContent = '—';

    let level = 1;
    const stage = els.gameStage;

    function makeChain(steps) {
      const value = rand(2, 9);
      const history = [String(value)];
      let cur = value;
      for (let i = 0; i < steps; i++) {
        const opType = rand(0, 2);
        if (opType === 0) {
          const x = rand(2, 12);
          history.push(`+ ${x}`);
          cur += x;
        } else if (opType === 1) {
          const x = rand(1, Math.min(12, cur));
          history.push(`- ${x}`);
          cur -= x;
        } else {
          const x = rand(2, 4);
          history.push(`× ${x}`);
          cur *= x;
        }
      }
      return { history, answer: cur };
    }

    function runLevel() {
      els.gameMeta1.textContent = `段 ${level}`;
      els.gameMeta2.textContent = '読み取り中…';
      const steps = 2 + level;
      const { history, answer } = makeChain(steps);

      const wrap = document.createElement('div');
      wrap.className = 'start-overlay';

      const big = document.createElement('div');
      big.className = 'problem';
      big.textContent = '';
      wrap.appendChild(big);

      const sub = document.createElement('p');
      sub.textContent = '式を順に表示します。最後の答えを入力してください。';
      wrap.appendChild(sub);

      stage.innerHTML = '';
      stage.appendChild(wrap);

      let i = 0;
      const stepMs = Math.max(550, 950 - level * 60);
      const showNext = () => {
        if (i >= history.length) {
          big.textContent = '?';
          setTimeout(() => askInput(answer), 500);
          return;
        }
        big.textContent = history[i];
        i += 1;
        setTimeout(showNext, stepMs);
      };
      showNext();
    }

    function askInput(answer) {
      els.gameMeta2.textContent = '入力してください';
      let typed = '';

      const wrap = document.createElement('div');
      wrap.className = 'start-overlay';

      const display = document.createElement('div');
      display.className = 'input-display';
      display.textContent = '';
      wrap.appendChild(display);

      const pad = document.createElement('div');
      pad.className = 'numpad';
      const layout = ['1','2','3','4','5','6','7','8','9','del','0','ok'];
      layout.forEach(label => {
        const btn = document.createElement('button');
        if (label === 'del') btn.textContent = '⌫';
        else if (label === 'ok') btn.textContent = '決定';
        else btn.textContent = label;
        btn.onclick = () => {
          if (label === 'del') typed = typed.slice(0, -1);
          else if (label === 'ok') {
            if (Number(typed) === answer) {
              level += 1;
              if (level > 12) {
                finish('chain', level - 1, '段', () => '神業です。');
                return;
              }
              const okWrap = document.createElement('div');
              okWrap.className = 'start-overlay';
              const ok = document.createElement('div');
              ok.className = 'big-show';
              ok.textContent = '正解！';
              ok.style.color = 'var(--good)';
              okWrap.appendChild(ok);
              const next = document.createElement('p');
              next.textContent = `次は ${level} 段`;
              okWrap.appendChild(next);
              stage.innerHTML = '';
              stage.appendChild(okWrap);
              setTimeout(runLevel, 800);
            } else {
              finish('chain', level - 1, '段', s => {
                if (s >= 8) return '集中力の達人。';
                if (s >= 5) return 'よくできました。';
                if (s >= 3) return 'いい線いってます。';
                return '一歩ずつ確実に。';
              });
            }
            return;
          } else {
            if (typed.length >= 6) return;
            typed += label;
          }
          display.textContent = typed;
        };
        pad.appendChild(btn);
      });
      wrap.appendChild(pad);

      stage.innerHTML = '';
      stage.appendChild(wrap);
    }

    runLevel();
    currentCleanup = () => {};
  }

  // ============================== Game Routing ==============================
  let currentCleanup = null;
  let currentGame = null;

  function startGame(key) {
    if (currentCleanup) currentCleanup();
    currentGame = key;
    showScreen('game');
    if (key === 'math') startMathGame();
    else if (key === 'memory') startMemoryGame();
    else if (key === 'stroop') startStroopGame();
    else if (key === 'chain') startChainGame();
  }

  function backHome() {
    if (currentCleanup) currentCleanup();
    currentCleanup = null;
    currentGame = null;
    showScreen('home');
    renderHome();
  }

  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => startGame(card.dataset.game));
  });
  els.backBtn.addEventListener('click', backHome);
  els.homeBtn.addEventListener('click', backHome);

  renderHome();
})();
