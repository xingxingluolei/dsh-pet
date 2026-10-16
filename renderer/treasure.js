/* DeepSeek's total-credit treasury. No network or credentials live here. */
(() => {
  'use strict';

  const COPY = {
    zh: { title: 'DeepSeek 小金库', available: '可用总额度', gifted: '赠送额度', purchased: '充值额度', hint: '宝箱随可用总额度变化（赠送 + 充值）',
      pouchTitle: 'DeepSeek 赔偿小荷包', pouchHint: '展示赠送账户余额（含平台补偿），已包含在小金库总余额中。',
      pouchEmpty: '还没有可用的赠送额度', pouchLoading: '正在读取赠送额度…', pouchClose: '关闭小荷包',
      pouchLevels: ['空荷包', '零星额度', '一袋额度', '满满额度', '鼓鼓荷包'],
      refresh: '刷新', refreshing: '正在刷新…', close: '关闭小金库', empty: '还没有可用额度',
      login: '请先在 DeepSeek 登录并启用新版 DSH Pet 桌宠插件，再刷新', failed: '暂时无法刷新余额，请稍后重试', stale: '余额已过期，请刷新；当前显示上次结果',
      loading: '正在读取可用额度…', updated: '更新时间', never: '尚未更新', unknown: '暂不可用',
      chestPending: '待同步', chestLoading: '读取中', chestError: '暂不可用',
      levels: ['空箱', '零星宝藏', '一堆宝藏', '满箱宝藏', '宝藏溢出'] },
    en: { title: 'DeepSeek Treasury', available: 'Total available credit', gifted: 'Gifted credit', purchased: 'Purchased credit', hint: 'Treasure follows total available credit (gifted + purchased)',
      pouchTitle: 'DeepSeek Compensation Pouch', pouchHint: 'Shows gifted account credit (including platform compensation), already included in the treasury total.',
      pouchEmpty: 'No gifted credit available yet', pouchLoading: 'Reading gifted credit…', pouchClose: 'Close pouch',
      pouchLevels: ['Empty pouch', 'A little credit', 'A pouch of credit', 'Full pouch', 'Brimming pouch'],
      refresh: 'Refresh', refreshing: 'Refreshing…', close: 'Close treasury', empty: 'No credit available yet',
      login: 'Sign in to DeepSeek and enable the updated DSH Pet pet plugin, then refresh', failed: 'Could not refresh your balance. Please try again', stale: 'Balance is out of date; refresh to update. Showing the last result',
      loading: 'Reading available credit…', updated: 'Updated', never: 'Not updated yet', unknown: 'Unavailable',
      chestPending: 'Awaiting sync', chestLoading: 'Reading balance', chestError: 'Temporarily unavailable',
      levels: ['Empty chest', 'A few treasures', 'A treasure pile', 'Full chest', 'Overflowing treasure'] },
    ja: { title: 'DeepSeek の宝箱', available: '利用可能な総残高', gifted: '付与残高', purchased: 'チャージ残高', hint: '総残高（付与 + チャージ）に合わせて宝物が変化します',
      pouchTitle: 'DeepSeek 補償の小袋', pouchHint: '付与残高（プラットフォームの補償を含む）を表示します。宝箱の総残高に含まれています。',
      pouchEmpty: '利用可能な付与残高はありません', pouchLoading: '付与残高を読み込み中…', pouchClose: '小袋を閉じる',
      pouchLevels: ['空の小袋', '少しの残高', '小袋の残高', 'いっぱいの小袋', 'ふくらんだ小袋'],
      refresh: '更新', refreshing: '更新中…', close: '宝箱を閉じる', empty: '利用可能な残高はありません',
      login: 'DeepSeek にログインし、最新版の DSH Pet ペットプラグインを有効にしてから更新してください', failed: '残高を更新できませんでした。もう一度お試しください', stale: '残高が古くなっています。更新してください（前回の結果を表示中）',
      loading: '利用可能な残高を読み込み中…', updated: '更新日時', never: '未更新', unknown: '利用不可',
      chestPending: '同期待ち', chestLoading: '読み込み中', chestError: '一時的に利用不可',
      levels: ['空の宝箱', '少しの宝物', '宝物の山', 'いっぱいの宝箱', 'あふれる宝物'] },
  };
  let state = { eligible: false, balance: { status: 'unconfigured', balances: [], updatedAt: 0 }, petRect: null, lang: 'zh' };
  let chest, pouch, panel, body, heading, closeButton, refreshButton, footer;
  let opened = false;
  let view = 'chest';
  let refreshing = false;
  let generation = 0;
  let activeRefresh = 0;
  let drawing = '';
  let pouchDrawing = '';

  const copy = () => COPY[state.lang] || COPY.zh;
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
  const availableRows = () => (Array.isArray(state.balance.balances) ? state.balance.balances : [])
    .filter(row => row && (row.currency === 'CNY' || row.currency === 'USD'));
  const validAmount = n => (typeof n === 'number' || (typeof n === 'string' && /^-?\d+(?:\.\d+)?$/.test(n))) && Number.isFinite(Number(n));

  // Native-currency visual bands; currencies are never summed or converted.
  // The backend sums gifted and purchased credit exactly within each currency.
  // Compare integer bands without floating-point rounding at their boundaries.
  function treasureLevel(field = 'totalBalance') {
    let level = 0;
    for (const row of availableRows()) {
      const match = /^(\d+)\.(\d+)$/.exec(formatAmount(row[field]));
      if (!match) continue; // Negative or unavailable total credit is an empty chest.
      const whole = BigInt(match[1]);
      const positive = whole > 0n || /[1-9]/.test(match[2]);
      level = Math.max(level, !positive ? 0 : whole < 10n ? 1 : whole < 50n ? 2 : whole < 200n ? 3 : 4);
    }
    return level;
  }

  function coin(x, y, r = 6, rotation = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${rotation})"><ellipse rx="${r}" ry="${r * .58}" fill="#b6751c" stroke="#75451f" stroke-width=".7"/><ellipse cy="-1.7" rx="${r}" ry="${r * .58}" fill="url(#treasure-gold)" stroke="#ffe9a0" stroke-width=".7"/><path d="M-2-2.8 0-4l2 1.2L0-1.6z" fill="#fff0ad" opacity=".8"/></g>`;
  }

  function gem(x, y, color, size = 1) {
    const tones = color === 'purple' ? ['#c4b0ff', '#7951ca', '#e7dfff'] : ['#9bd2ff', '#3b70d6', '#e4f4ff'];
    return `<g transform="translate(${x} ${y}) scale(${size})"><path d="m-8 0 4-6h8l4 6-8 9z" fill="${tones[1]}" stroke="#27417f" stroke-width=".7"/><path d="m-8 0 4-6 4 6zM0 0l4-6 4 6z" fill="${tones[0]}"/><path d="m-4-6 4 6 4-6z" fill="${tones[2]}"/><path d="M-8 0h16L0 9z" fill="${tones[1]}"/><path d="M-3 0 0 9 3 0z" fill="${tones[0]}"/></g>`;
  }

  function chestSvg(level) {
    const coins = [coin(43, 51), coin(68, 53, 5.5)];
    if (level >= 2) coins.push(coin(35, 48), coin(53, 48, 6, -12), coin(76, 46), coin(44, 43), coin(63, 44), gem(68, 39, 'blue', .85));
    if (level >= 3) coins.push(coin(29, 44, 6, -9), coin(83, 43), coin(39, 36), coin(54, 38), coin(73, 34, 6, 8), coin(49, 32), gem(56, 26, 'purple', .9), gem(86, 34, 'blue', .7));
    if (level >= 4) coins.push(coin(32, 32), coin(40, 26, 6, -10), coin(65, 26), coin(78, 25), coin(56, 20), gem(69, 15, 'blue'), coin(89, 37, 6, 24));
    const spill = level >= 4 ? `${coin(97, 77, 7, 12)}${coin(104, 81, 6, -18)}${coin(17, 82, 6, 8)}${gem(91, 77, 'purple', .8)}${coin(84, 84, 6)}` : '';
    const sparkle = level >= 3 ? '<path class="treasure-sparkle" d="m99 26 1.7 4.5 4.3 1.5-4.3 1.5L99 38l-1.7-4.5L93 32l4.3-1.5z" fill="#fff2bb"/><path class="treasure-sparkle treasure-sparkle-alt" d="m25 16 1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#d9e6ff"/>' : '';
    return `<svg viewBox="0 0 120 100" class="treasure-art" aria-hidden="true" focusable="false">
      <defs><linearGradient id="treasure-gold" x2=".4" y2="1"><stop stop-color="#fff3b1"/><stop offset=".45" stop-color="#efbd44"/><stop offset="1" stop-color="#ce8b23"/></linearGradient>
      <linearGradient id="treasure-wood" x2="0" y2="1"><stop stop-color="#b77b44"/><stop offset="1" stop-color="#784527"/></linearGradient>
      <linearGradient id="treasure-lid" x2=".5" y2="1"><stop stop-color="#a87542"/><stop offset="1" stop-color="#5e3925"/></linearGradient></defs>
      <ellipse cx="62" cy="86" rx="47" ry="7" fill="#251b36" opacity=".17"/>
      <path d="m23 52 1-25q3-9 14-10l49 3q10 2 11 10l-6 25z" fill="url(#treasure-lid)" stroke="#543523" stroke-width="2"/>
      <path d="m30 46 1-17q0-5 9-5l43 3q6 0 7 6l-3 15z" fill="#523125" stroke="#c49857" stroke-width="1.4"/>
      <path d="m38 20-2 30m45-28-4 29" fill="none" stroke="#d5aa61" stroke-width="5"/>
      <path d="m38 20-2 30m45-28-4 29" fill="none" stroke="#ffdda0" stroke-width=".7" opacity=".7"/>
      <path d="m21 50 17-8 58 3 6 10-19 10-55-3z" fill="#3f2922" stroke="#563625" stroke-width="1.5"/>
      <g class="treasure-coins">${level ? coins.join('') : ''}</g>
      <path d="m24 51 61 5-1 29-57-7z" fill="url(#treasure-wood)" stroke="#543523" stroke-width="1.7"/>
      <path d="m85 56 15-7-3 27-13 9z" fill="#694025" stroke="#503323" stroke-width="1.7"/>
      <path d="m25 61 60 5m-59 5 58 5m-57-19 1 18m13-20 1 20m16-18 1 21m15-19 1 19" fill="none" stroke="#633c26" stroke-width="1" opacity=".55"/>
      <path d="m29 53 4 .4 2 25-4-.5zm42 3.5 4 .4-.5 25.5-4-.5z" fill="url(#treasure-gold)" stroke="#785027" stroke-width=".7"/>
      <path d="m23 50 62 5 16-7v5l-16 7-62-5z" fill="url(#treasure-gold)" stroke="#80502a" stroke-width="1"/>
      <path d="m26 76 58 7 13-8v5l-13 8-58-7z" fill="#c18d3c" stroke="#785027" stroke-width=".8"/>
      <path d="m54 57 11 1v15l-11-1z" fill="url(#treasure-gold)" stroke="#71502d" stroke-width="1"/>
      <circle cx="59.5" cy="64.5" r="2" fill="#573a2a"/><path d="m59 65-.7 3.7 2.4.2-.7-3.8z" fill="#573a2a"/>
      <path d="m31 59 .2 2m42 3 .1 2M33 75l.2 2m39 3 .1 2" stroke="#fff0ae" stroke-linecap="round"/>
      ${spill}${sparkle}</svg>`;
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function pouchSvg(level) {
    const bulge = 15 + level * 3;
    return `<svg viewBox="0 0 80 86" class="treasure-pouch-art" aria-hidden="true" focusable="false">
      <defs><linearGradient id="pouch-silk" x1="0" x2="1" y2=".7"><stop stop-color="#9a9ce8"/><stop offset=".45" stop-color="#697bc7"/><stop offset="1" stop-color="#665099"/></linearGradient>
      <linearGradient id="pouch-rope" x2=".3" y2="1"><stop stop-color="#fff2bc"/><stop offset=".5" stop-color="#e5ba59"/><stop offset="1" stop-color="#b78335"/></linearGradient></defs>
      <ellipse cx="40" cy="78" rx="${bulge + 5}" ry="5" fill="#282040" opacity=".2"/>
      <path d="M25 14 34 19 40 13 47 19 56 14 51 29H29Z" fill="#aca6e9" stroke="#51447b" stroke-width="1.6"/>
      <path d="M29 29C${40 - bulge} 39 ${35 - bulge} 56 ${40 - bulge} 68Q40 84 ${40 + bulge} 68C${45 + bulge} 56 ${40 + bulge} 39 51 29Z" fill="url(#pouch-silk)" stroke="#4c426f" stroke-width="1.8"/>
      <path d="M31 37Q23 53 28 68M48 37Q55 52 52 69" fill="none" stroke="#c0b9f0" stroke-width="1.5" opacity=".6"/>
      <path d="M25 29Q40 36 56 29M25 33Q40 39 55 33" fill="none" stroke="url(#pouch-rope)" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M39 33Q27 24 26 34Q29 40 39 34Q53 24 55 34Q51 41 40 34M39 35 34 52M41 35 48 48" fill="none" stroke="url(#pouch-rope)" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="34" cy="53" r="2.2" fill="#e5b958"/><circle cx="49" cy="49" r="2.2" fill="#e5b958"/>
      ${level ? '<path d="m40 53 5 6-5 7-5-7z" fill="#d7c7ff" stroke="#eee3ff" stroke-width="1"/>' : ''}
      ${level >= 3 ? '<path d="m65 30 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#e8ddff"/>' : ''}
      </svg>`;
  }

  function ensureDom() {
    if (chest) return true;
    const stage = document.getElementById('stage');
    if (!stage) return false;
    chest = element('button', 'treasure-chest');
    chest.id = 'treasure-chest';
    chest.type = 'button';
    chest.hidden = true;
    chest.setAttribute('aria-controls', 'treasure-panel');
    chest.setAttribute('aria-expanded', 'false');
    chest.setAttribute('aria-haspopup', 'dialog');
    chest.addEventListener('pointerdown', event => event.stopPropagation());
    chest.addEventListener('click', event => { event.stopPropagation(); opened && view === 'chest' ? close() : open(); });

    pouch = element('button', 'treasure-pouch');
    pouch.id = 'treasure-pouch';
    pouch.type = 'button';
    pouch.hidden = true;
    pouch.setAttribute('aria-controls', 'treasure-panel');
    pouch.setAttribute('aria-expanded', 'false');
    pouch.setAttribute('aria-haspopup', 'dialog');
    pouch.addEventListener('pointerdown', event => event.stopPropagation());
    pouch.addEventListener('click', event => { event.stopPropagation(); opened && view === 'pouch' ? close() : open('pouch'); });

    panel = element('section', 'treasure-panel');
    panel.id = 'treasure-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'treasure-title');
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    panel.addEventListener('click', event => event.stopPropagation());
    const top = element('div', 'treasure-top');
    const emblem = element('span', 'treasure-emblem', '◆');
    emblem.setAttribute('aria-hidden', 'true');
    heading = element('h2', 'treasure-title');
    heading.id = 'treasure-title';
    closeButton = element('button', 'treasure-close', '×');
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => close(true));
    top.append(emblem, heading, closeButton);
    body = element('div', 'treasure-content');
    body.setAttribute('aria-live', 'polite');
    const actions = element('div', 'treasure-actions');
    footer = element('span', 'treasure-updated');
    refreshButton = element('button', 'treasure-refresh');
    refreshButton.id = 'treasure-refresh';
    refreshButton.type = 'button';
    refreshButton.addEventListener('click', refresh);
    actions.append(footer, refreshButton);
    panel.append(top, body, actions);
    stage.append(chest, pouch, panel);
    document.addEventListener('pointerdown', event => {
      if (opened && !panel.contains(event.target) && !chest.contains(event.target) && !pouch.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (opened && event.key === 'Escape') { event.preventDefault(); close(true); }
    });
    window.addEventListener('blur', () => close());
    window.addEventListener('resize', position);
    return true;
  }

  function formatAmount(n) {
    // No rounding of provider-supplied credit precision, including sub-cent gifts.
    if (!validAmount(n)) return copy().unknown;
    let value = String(n);
    if (/e/i.test(value)) {
      const [mantissa, exponent] = value.toLowerCase().split('e');
      const negative = mantissa.startsWith('-');
      const unsigned = negative ? mantissa.slice(1) : mantissa;
      const point = (unsigned.indexOf('.') < 0 ? unsigned.length : unsigned.indexOf('.')) + Number(exponent);
      const digits = unsigned.replace('.', '');
      value = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
      if (negative) value = `-${value}`;
    }
    const parts = value.split('.');
    return `${parts[0]}.${(parts[1] || '').padEnd(2, '0')}`;
  }

  function isLoginNeeded() {
    const code = String(state.balance.errorCode || '').toLowerCase();
    return state.balance.status === 'unconfigured' || /login|auth|unauthorized|session.expir|not.signed/.test(code);
  }

  function notice(message, kind) {
    const el = element('p', `treasure-notice${kind ? ` treasure-notice-${kind}` : ''}`, message);
    body.appendChild(el);
  }

  function render() {
    const t = copy();
    const level = treasureLevel();
    const giftLevel = treasureLevel('grantedBalance');
    const pouchView = view === 'pouch';
    const rows = availableRows();
    const loading = state.balance.status === 'loading' || refreshing;
    const balanceKnown = rows.length > 0 || state.balance.status === 'ready';
    const chestLabel = balanceKnown ? t.levels[level] : loading ? t.chestLoading : state.balance.status === 'error' ? t.chestError : t.chestPending;
    chest.hidden = !state.eligible;
    pouch.hidden = !state.eligible;
    chest.dataset.level = String(level);
    chest.dataset.status = state.balance.status;
    chest.dataset.balanceKnown = String(balanceKnown);
    const visualKey = String(level);
    if (drawing !== visualKey) { chest.innerHTML = chestSvg(level); drawing = visualKey; }
    chest.title = `${t.title} · ${chestLabel}`;
    chest.setAttribute('aria-label', chest.title);
    pouch.dataset.level = String(giftLevel);
    pouch.dataset.status = state.balance.status;
    pouch.dataset.balanceKnown = String(balanceKnown);
    if (pouchDrawing !== String(giftLevel)) { pouch.innerHTML = pouchSvg(giftLevel); pouchDrawing = String(giftLevel); }
    const pouchLabel = balanceKnown ? t.pouchLevels[giftLevel] : loading ? t.chestLoading : state.balance.status === 'error' ? t.chestError : t.chestPending;
    pouch.title = `${t.pouchTitle} · ${pouchLabel}`;
    pouch.setAttribute('aria-label', pouch.title);
    panel.dataset.view = view;
    heading.textContent = pouchView ? t.pouchTitle : t.title;
    closeButton.setAttribute('aria-label', pouchView ? t.pouchClose : t.close);
    const previousScroll = body.scrollTop;
    body.replaceChildren();
    const login = isLoginNeeded();
    if (login) notice(t.login, 'login');
    else if (state.balance.status === 'error') notice(t.failed, 'error');
    if (state.balance.stale && !login) notice(t.stale, 'stale');
    if (loading) notice(pouchView ? t.pouchLoading : t.loading, 'loading');
    for (const row of rows) {
      const card = element('div', 'treasure-currency');
      const cardTop = element('div', 'treasure-currency-head');
      cardTop.append(element('span', 'treasure-total-label', pouchView ? t.gifted : t.available), element('span', 'treasure-currency-code', row.currency));
      const amount = element('div', pouchView ? 'treasure-pouch-amount' : 'treasure-total-amount');
      const symbol = row.currency === 'CNY' ? '¥' : '$';
      amount.append(element('span', 'treasure-money-symbol', symbol), element('span', '', formatAmount(pouchView ? row.grantedBalance : row.totalBalance)));
      const gifted = element('div', 'treasure-detail treasure-gifted');
      gifted.append(element('span', '', t.gifted), element('span', 'treasure-detail-value', `${symbol}${formatAmount(row.grantedBalance)}`));
      const purchased = element('div', 'treasure-detail treasure-purchased');
      purchased.append(element('span', '', t.purchased), element('span', 'treasure-detail-value', `${symbol}${formatAmount(row.toppedUpBalance)}`));
      card.append(cardTop, amount);
      if (!pouchView) card.append(gifted, purchased);
      body.appendChild(card);
    }
    if (!rows.length && !login && !loading && state.balance.status !== 'error') notice(pouchView ? t.pouchEmpty : t.empty);
    body.appendChild(element('p', 'treasure-hint', pouchView ? t.pouchHint : t.hint));
    const ts = Number(state.balance.updatedAt);
    const date = new Date(ts);
    const when = ts > 0 && Number.isFinite(date.getTime())
      ? date.toLocaleString(state.lang === 'en' ? 'en-US' : state.lang === 'ja' ? 'ja-JP' : 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : t.never;
    footer.textContent = `${t.updated} ${when}`;
    footer.title = ts > 0 && Number.isFinite(date.getTime()) ? date.toLocaleString() : t.never;
    refreshButton.disabled = loading;
    refreshButton.textContent = loading ? t.refreshing : t.refresh;
    panel.setAttribute('aria-busy', String(loading));
    body.scrollTop = previousScroll;
    position();
  }

  function position() {
    if (!chest || !state.petRect) return;
    const rect = state.petRect;
    const stage = document.getElementById('stage');
    const sr = stage.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = chest.offsetWidth || 104;
    const ch = chest.offsetHeight || 88;
    const side = stage.classList.contains('edge-right') || rect.right + cw / 2 > vw - 6 ? 'left' : 'right';
    const left = clamp(side === 'right' ? rect.right - cw / 2 : rect.left - cw / 2, 6, vw - cw - 6);
    const top = clamp(rect.bottom - ch + 3, 6, vh - ch - 6);
    chest.dataset.side = side;
    chest.style.left = `${left - sr.left}px`;
    chest.style.top = `${top - sr.top}px`;
    const pw = pouch.offsetWidth || 56;
    const ph = pouch.offsetHeight || 60;
    // Occupy the pet-facing side of the chest, leaving its exposed outer edge
    // clickable. The foreground pouch stays visible even behind a work sprite.
    const pouchLeft = clamp(side === 'left' ? left + cw - pw / 2 : left - pw / 2, 6, vw - pw - 6);
    const pouchTop = clamp(top + ch - ph + 16, 6, vh - ph - 6);
    pouch.style.left = `${pouchLeft - sr.left}px`;
    pouch.style.top = `${pouchTop - sr.top}px`;
    if (opened) {
      // Keep both entrances exposed when a long/multi-currency panel scrolls.
      panel.style.maxHeight = `${Math.max(0, Math.min(vh - 16, pouchTop - 16))}px`;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const anchorLeft = view === 'pouch' ? pouchLeft + pw / 2 : left + cw / 2;
      const anchorTop = view === 'pouch' ? pouchTop : top;
      panel.style.left = `${clamp(anchorLeft - width / 2, 8, vw - width - 8)}px`;
      panel.style.top = `${clamp(anchorTop - height - 8, 8, vh - height - 8)}px`;
    }
  }

  function emitToggle() {
    window.dispatchEvent(new CustomEvent('treasure-toggle', { detail: { open: opened } }));
  }

  function open(nextView = 'chest') {
    nextView = nextView === 'pouch' ? 'pouch' : 'chest';
    if (!ensureDom() || !state.eligible || (opened && view === nextView)) return;
    view = nextView;
    opened = true;
    panel.hidden = false;
    chest.setAttribute('aria-expanded', String(view === 'chest'));
    pouch.setAttribute('aria-expanded', String(view === 'pouch'));
    body.scrollTop = 0;
    render();
    closeButton.focus({ preventScroll: true });
    emitToggle();
  }

  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false;
    panel.hidden = true;
    chest.setAttribute('aria-expanded', 'false');
    pouch.setAttribute('aria-expanded', 'false');
    if (restoreFocus && state.eligible) (view === 'pouch' ? pouch : chest).focus({ preventScroll: true });
    emitToggle();
  }

  async function refresh() {
    if (refreshing || !state.eligible) return;
    const request = ++activeRefresh;
    const version = generation;
    refreshing = true;
    render();
    try {
      if (typeof window.pet?.refreshDeepSeekBalance !== 'function') throw new Error('unavailable');
      const result = await window.pet.refreshDeepSeekBalance();
      if (request === activeRefresh && version === generation && result && typeof result === 'object') {
        state.balance = result;
      }
    } catch (_) {
      if (request === activeRefresh && version === generation) {
        state.balance = { ...state.balance, status: 'error', stale: availableRows().length > 0, errorCode: 'refresh-failed' };
      }
    } finally {
      if (request === activeRefresh) { refreshing = false; render(); }
    }
  }

  function update(next) {
    if (!next || typeof next !== 'object') return;
    // Routine geometry updates must not invalidate an in-flight refresh. A new
    // backend snapshot wins over the result of an older refresh request.
    // Explicit null means the account was cleared; omission only moves the pet.
    const cleared = next.balance === null;
    if (cleared || (next.balance && next.balance !== state.balance)) generation++;
    if (cleared) { activeRefresh++; refreshing = false; }
    const balance = cleared ? { status: 'unconfigured', balances: [], updatedAt: 0 } : next.balance || state.balance;
    state = { ...state, ...next, balance };
    if (!ensureDom()) return;
    if (!state.eligible) close();
    render();
  }

  window.DeepSeekTreasure = { update, open, openPouch: () => open('pouch'), close, isOpen: () => opened };
})();
