'use strict';

// Display-only account projection. No credentials, account identity or wallet
// values are persisted; currencies remain independent throughout the pipeline.
const CURRENCIES = ['CNY', 'USD'];
const DECIMAL = /^(-?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i;
const invalid = () => new TypeError('invalid balance payload');
function decimal(value) {
  if (typeof value !== 'string' || value.length > 120) throw invalid();
  const match = DECIMAL.exec(value);
  if (!match) throw invalid();
  const exponent = Number(match[3] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw invalid();
  const [whole, fraction = ''] = match[2].split('.');
  const digits = (whole || '0') + fraction;
  if (digits.length > 100) throw invalid();
  let coefficient = BigInt(digits) * (match[1] ? -1n : 1n);
  let scale = fraction.length - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient, scale };
}
function format({ coefficient, scale }) {
  if (coefficient === 0n) return '0';
  const sign = coefficient < 0n ? '-' : '';
  let digits = (coefficient < 0n ? -coefficient : coefficient).toString();
  if (scale) {
    digits = digits.padStart(scale + 1, '0');
    digits = (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/0+$/, '').replace(/\.$/, '');
  }
  return sign + digits;
}
function sum(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return format({ coefficient: a.coefficient * 10n ** BigInt(scale - a.scale)
    + b.coefficient * 10n ** BigInt(scale - b.scale), scale });
}
function wallets(input) {
  if (!Array.isArray(input) || input.length > CURRENCIES.length) throw invalid();
  const out = new Map();
  for (const wallet of input) {
    if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)
      || Object.keys(wallet).some(key => !['currency', 'balance'].includes(key))
      || !CURRENCIES.includes(wallet.currency) || out.has(wallet.currency)) throw invalid();
    out.set(wallet.currency, decimal(wallet.balance));
  }
  return out;
}
function createDeepSeekBalance(options = {}) {
  const now = options.now || Date.now;
  const staleAfterMs = options.staleAfterMs || 6 * 60 * 1000;
  let value = { status: 'unconfigured', balances: [], updatedAt: 0, stale: false };
  let refreshVersion = 0, stopped = false;
  function changed() { if (!stopped) options.onChange?.(); }
  function snapshot() {
    return { ...value, balances: value.balances.map(balance => ({ ...balance })),
      stale: value.stale || (value.updatedAt > 0 && now() - value.updatedAt > staleAfterMs) };
  }
  function update(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || !['unconfigured', 'loading', 'ready', 'error'].includes(input.status)) throw invalid();
    const keys = input.status === 'ready' ? ['status', 'normalWallets', 'bonusWallets', 'updatedAt']
      : input.status === 'error' ? ['status', 'errorCode'] : ['status'];
    if (Object.keys(input).some(key => !keys.includes(key))) throw invalid();
    let next;
    if (input.status === 'ready') {
      const normal = wallets(input.normalWallets), bonus = wallets(input.bonusWallets);
      const timestamp = input.updatedAt ?? now();
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now() + 30000) throw invalid();
      const zero = { coefficient: 0n, scale: 0 };
      const balances = CURRENCIES.filter(currency => normal.has(currency) || bonus.has(currency)).map(currency => {
        const toppedUp = normal.get(currency) || zero, granted = bonus.get(currency) || zero;
        return { currency, grantedBalance: format(granted), toppedUpBalance: format(toppedUp), totalBalance: sum(toppedUp, granted) };
      });
      next = { status: 'ready', balances, updatedAt: timestamp, stale: false };
    } else if (input.status === 'unconfigured') {
      next = { status: 'unconfigured', balances: [], updatedAt: 0, stale: false };
    } else if (input.status === 'loading') {
      next = { ...value, status: 'loading' }; delete next.errorCode;
    } else {
      if (input.errorCode !== undefined && !['unavailable', 'timeout', 'protocol'].includes(input.errorCode)) throw invalid();
      next = { ...value, status: 'error', stale: true, errorCode: input.errorCode || 'unavailable' };
    }
    value = next; changed(); return snapshot();
  }
  return { snapshot, update, requestRefresh: () => { refreshVersion++; changed(); return snapshot(); },
    refreshStatus: () => ({ refreshVersion }), stop: () => { stopped = true; } };
}
module.exports = { createDeepSeekBalance };
