(() => {
  const form = document.getElementById('analyze-form');
  const input = document.getElementById('youtube-url');
  const btn = document.getElementById('analyze-btn');
  const resultSection = document.getElementById('result-section');

  const SUMMARIES = [
    "本動画は、視聴者の前頭前野を継続的に刺激する構成で設計されています。導入部で扁桃体への軽微な情動アクセスを行い、注意のスポットライトを獲得した後、ワーキングメモリへの段階的な情報投下によって理解の足場を構築。中盤では報酬予測誤差を意図的に発生させることでドーパミン放出を促し、長期記憶への定着を図る、極めて洗練された認知設計が認められます。",
    "解析結果から、本コンテンツは「分散学習効果」を最大化する時間設計を採用していることが示唆されます。約7〜9分間隔で挿入される視覚的アンカーがデフォルト・モード・ネットワークの暴走を抑制し、能動的注意を維持。海馬と新皮質の同期発火を促進する構成により、視聴後24時間の保持率が一般的な動画より約32%高いと推定されます。",
    "本動画はミラーニューロン系の活性化に長けており、視聴者の共感的理解を強く誘発します。話者の身振り・声調の微細な変化が前帯状皮質を継続的に刺激し、社会的認知ネットワークの活動を高める結果、抽象概念の自分事化が促進されます。学習というより「経験」として記憶される傾向が強い、上質な知的コンテンツです。",
    "認知負荷理論の観点から見ると、本動画は内在的負荷を低く抑えつつ、関連的負荷を適切に高める優れたバランスを保っています。背外側前頭前皮質の働きを過剰に圧迫せず、メタ認知の発動余地を残す構成は、長時間視聴でも疲労を感じさせません。学習継続性の高い、戦略的に設計された情報体験です。"
  ];

  const INSIGHTS_POOL = [
    "導入30秒で扁桃体反応を誘発し、注意リソースを優先確保している",
    "報酬予測誤差を中盤で意図的に発生させ、ドーパミン放出を促進",
    "視覚的・聴覚的キューを同期させ、感覚統合野の処理効率を向上",
    "復唱と要約の挿入により、海馬の記憶固定化プロセスを支援",
    "メタファー使用率が高く、右半球の連合野を活発に動員している",
    "視点切り替えの間隔がデフォルト・モード・ネットワークの活性化を抑制",
    "感情価の振幅が適度で、扁桃体−前頭前野の結合性を高める設計",
    "終盤で意図的な「未完結性」を残し、ツァイガルニク効果による反芻を誘発"
  ];

  const TAGS_POOL = [
    "前頭前野", "海馬", "ドーパミン報酬系", "ミラーニューロン",
    "ワーキングメモリ", "デフォルト・モード・ネットワーク", "扁桃体",
    "メタ認知", "認知的柔軟性", "情動記憶", "感覚統合", "注意ネットワーク"
  ];

  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/,
      /[?&]v=([A-Za-z0-9_-]{6,})/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1].slice(0, 11);
    }
    return null;
  };

  const hashSeed = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  };

  const seededPick = (arr, seed) => arr[seed % arr.length];

  const seededShuffle = (arr, seed) => {
    const a = [...arr];
    let s = seed || 1;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const buildLoading = () => {
    resultSection.innerHTML = `
      <div class="loading-card glass">
        <div class="loading-orbit"></div>
        <div class="loading-text">解析中</div>
        <div class="loading-sub">
          Neuroscientific engine is processing
          <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
        </div>
      </div>
    `;
  };

  const buildResult = (url) => {
    const videoId = extractVideoId(url) || 'unknown';
    const seed = hashSeed(videoId + url);

    const focus    = 62 + (seed % 36);
    const memory   = 58 + ((seed >> 3) % 40);
    const reward   = 55 + ((seed >> 6) % 43);
    const insight  = 60 + ((seed >> 9) % 38);

    const summary = seededPick(SUMMARIES, seed);
    const insights = seededShuffle(INSIGHTS_POOL, seed).slice(0, 4);
    const tags = seededShuffle(TAGS_POOL, seed >> 2).slice(0, 5);

    resultSection.innerHTML = `
      <article class="result-card glass">
        <header class="result-head">
          <div>
            <h3>Neuroscientific Summary</h3>
            <div class="result-id">Video ID — ${escapeHtml(videoId)}</div>
          </div>
          <div class="tag-row">
            ${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </header>

        <div class="score-grid">
          ${scoreItem('Focus 集中度', focus)}
          ${scoreItem('Memory 記憶定着', memory)}
          ${scoreItem('Reward 報酬系', reward)}
          ${scoreItem('Insight 洞察度', insight)}
        </div>

        <div class="summary-block">
          <div class="section-title">Cognitive Overview</div>
          <p>${escapeHtml(summary)}</p>
        </div>

        <div>
          <div class="section-title">Key Neural Insights</div>
          <ul class="insight-list">
            ${insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>
      </article>
    `;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scoreItem = (label, value) => `
    <div class="score-item">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="bar"><span style="width:${value}%"></span></div>
    </div>
  `;

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    btn.disabled = true;
    buildLoading();

    const delay = 1800 + Math.random() * 900;
    setTimeout(() => {
      buildResult(url);
      btn.disabled = false;
    }, delay);
  });
})();
