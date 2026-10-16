'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const modulePath = path.join(__dirname, '../backend/deepseek-balance.js');
  assert(fs.existsSync(modulePath), 'DeepSeek granted balance store must exist');
  const { createDeepSeekBalance } = require(modulePath);
  let now = 1000000, changes = 0;
  const store = createDeepSeekBalance({ now: () => now, onChange: () => changes++, staleAfterMs: 600000 });
  assert.deepStrictEqual(store.snapshot(), { status: 'unconfigured', balances: [], updatedAt: 0, stale: false });
  store.update({ status: 'ready', normalWallets: [{ currency: 'CNY', balance: '0.1' }], bonusWallets: [
    { currency: 'CNY', balance: '0.2' }, { currency: 'USD', balance: '0E-16' },
  ], updatedAt: now });
  assert.deepStrictEqual(store.snapshot().balances, [
    { currency: 'CNY', grantedBalance: '0.2', toppedUpBalance: '0.1', totalBalance: '0.3' },
    { currency: 'USD', grantedBalance: '0', toppedUpBalance: '0', totalBalance: '0' },
  ], 'wallets remain separate and sums retain decimal precision');
  const ready = store.snapshot();
  ready.balances[0].grantedBalance = 'tampered';
  assert.strictEqual(store.snapshot().balances[0].grantedBalance, '0.2', 'snapshot must not leak mutable store state');
  const before = JSON.stringify(store.snapshot());
  for (const bad of [
    { status: 'ready', normalWallets: [], bonusWallets: [{ currency: 'EUR', balance: '1' }] },
    { status: 'ready', normalWallets: [], bonusWallets: [{ currency: 'USD', balance: 'NaN' }] },
    { status: 'ready', normalWallets: [], bonusWallets: [{ currency: 'USD', balance: '1e9999' }] },
    { status: 'ready', normalWallets: [], bonusWallets: [{ currency: 'USD', balance: '1' }, { currency: 'USD', balance: '2' }] },
    { status: 'ready', normalWallets: [{ currency: 'USD', balance: 5 }], bonusWallets: [] },
    { status: 'ready', normalWallets: [], bonusWallets: [], token: 'never-echo-this' },
    { status: 'ready', normalWallets: [], bonusWallets: [], updatedAt: now + 100000 },
    { status: 'nope' },
  ]) {
    assert.throws(() => store.update(bad), /invalid balance payload/);
    assert.strictEqual(JSON.stringify(store.snapshot()), before, 'bad input must not partially mutate state');
  }
  const refresh = store.refreshStatus().refreshVersion;
  assert.strictEqual(store.requestRefresh().status, 'ready');
  assert.strictEqual(store.refreshStatus().refreshVersion, refresh + 1);
  store.update({ status: 'error' });
  assert.strictEqual(store.snapshot().balances[0].grantedBalance, '0.2');
  assert.strictEqual(store.snapshot().stale, true, 'a failed query must not become zero');
  store.update({ status: 'ready', normalWallets: [], bonusWallets: [{ currency: 'CNY', balance: '-.5e1' }] });
  assert.strictEqual(store.snapshot().balances[0].grantedBalance, '-5');
  now += 600001;
  assert.strictEqual(store.snapshot().stale, true);
  store.update({ status: 'unconfigured' });
  assert.deepStrictEqual(store.snapshot().balances, [], 'signed-out account clears previous money');
  assert(changes > 0);

  const { createBalanceSync } = await import('../integrations/companion/host.mjs');
  assert.strictEqual(typeof createBalanceSync, 'function', 'Host must reuse the safe official account service');
  const writes = [], timers = new Set();
  let resolver, reads = 0, refreshVersion = 0;
  const account = { getBalance: () => { reads++; return new Promise(r => { resolver = r; }); } };
  const sync = createBalanceSync({ account, client: () => ({ version: '1.1.4', locale: 'zh', timezoneOffsetSeconds: 0 }),
    bridge: { balanceStatus: async () => ({ ok: true, refreshVersion }), updateBalance: async value => { writes.push(value); return { ok: true }; } },
    setInterval: (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; }, clearInterval: timer => timers.delete(timer),
    now: () => now, requestTimeoutMs: 100,
  });
  sync.start();
  await sync.accountChanged({ status: 'credential-stored' });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(reads, 1);
  sync.refresh(); sync.refresh();
  assert.strictEqual(reads, 1, 'same account concurrent refresh requests are single-flight');
  await sync.accountChanged({ status: 'signed-out' });
  resolver({ status: 'ready', value: [], bonusWallets: [{ currency: 'CNY', balance: '999' }] });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(writes.at(-1).status, 'unconfigured', 'old account response cannot restore its treasure');
  assert(!writes.some(value => value.bonusWallets?.some(wallet => wallet.balance === '999')));
  account.getBalance = async () => ({ status: 'ready', value: [{ currency: 'USD', balance: '4' }], bonusWallets: [{ currency: 'USD', balance: '5', secret: 'discard' }], token: 'discard' });
  await sync.accountChanged({ status: 'credential-stored' });
  await sync.refresh();
  assert.deepStrictEqual(writes.at(-1).bonusWallets, [{ currency: 'USD', balance: '5' }]);
  assert(!JSON.stringify(writes).includes('discard'), 'only projected wallet values cross the bridge');
  account.getBalance = async () => ({ status: 'ready', value: [], bonusWallets: [{ currency: 'USD', balance: '6' }] });
  refreshVersion++;
  for (const tick of timers) await tick.fn();
  assert.strictEqual(writes.at(-1).bonusWallets[0].balance, '6', 'the pet refresh request reaches the official account service');
  account.getBalance = async () => ({ status: 'ready', value: [], bonusWallets: [{ currency: 'USD', balance: '7' }] });
  for (const tick of timers) await tick.fn();
  assert.strictEqual(writes.at(-1).bonusWallets[0].balance, '6', 'unchanged polls do not query before the refresh interval');
  now += 5 * 60 * 1000;
  for (const tick of timers) await tick.fn();
  assert.strictEqual(writes.at(-1).bonusWallets[0].balance, '7', 'elapsed refresh interval updates the account projection');
  account.getBalance = () => { reads++; return new Promise(r => { resolver = r; }); };
  await sync.accountChanged({ status: 'credential-stored' });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(writes.at(-1).status, 'loading');
  assert(writes.slice(-2).some(value => value.status === 'unconfigured'), 'switching stored credentials clears the old account first');
  await new Promise(r => setTimeout(r, 115));
  assert.strictEqual(writes.at(-1).errorCode, 'timeout', 'a stalled official query reaches a bounded failure');
  const stalledReads = reads;
  await sync.refresh();
  assert.strictEqual(reads, stalledReads, 'timeout must not overlap another official account query');
  resolver({ status: 'ready', value: [], bonusWallets: [{ currency: 'USD', balance: '999' }] });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(writes.at(-1).status, 'error', 'a late response after timeout cannot revive the balance');
  account.getBalance = async () => ({ status: 'ready', value: [], bonusWallets: [{ currency: 'USD', balance: '1e101' }] });
  await sync.refresh();
  assert.strictEqual(writes.at(-1).errorCode, 'protocol', 'Host validation must match the local store bounds');
  account.getBalance = async () => ({ status: 'ready', value: [], bonusWallets: [{ currency: 'USD', balance: '.' + '1'.repeat(100) }] });
  await sync.refresh();
  assert.strictEqual(writes.at(-1).errorCode, 'protocol', 'omitted integer parts obey the same bounded decimal representation');
  account.getBalance = async () => { throw Error('private-token-must-not-escape'); };
  await sync.refresh();
  assert.strictEqual(writes.at(-1).status, 'error');
  assert(!JSON.stringify(writes).includes('private-token'));
  await sync.stop();
  assert.strictEqual(timers.size, 0, 'plugin disposal clears its timers');
  assert.strictEqual(writes.at(-1).status, 'unconfigured', 'plugin disposal clears the account projection');
  let healthy = false, reconnectReads = 0;
  const delivered = [], reconnectTimers = new Set();
  const reconnect = createBalanceSync({
    account: { getBalance: async () => { reconnectReads++; return { status: 'ready', value: [], bonusWallets: [] }; } },
    client: () => ({ version: '0.2.0-rc.2', locale: 'en', timezoneOffsetSeconds: 0 }), now: () => now,
    bridge: { balanceStatus: async () => ({ ok: healthy, refreshVersion: 0 }), updateBalance: async value => {
      if (healthy) delivered.push(value); return { ok: healthy };
    } },
    setInterval: fn => { reconnectTimers.add(fn); return fn; }, clearInterval: fn => reconnectTimers.delete(fn),
  });
  reconnect.start();
  await reconnect.accountChanged({ status: 'credential-stored' }); await reconnect.refresh();
  assert.strictEqual(reconnectReads, 1);
  healthy = true;
  for (const tick of reconnectTimers) await tick();
  assert.strictEqual(reconnectReads, 2, 'starting or reconnecting DSH Pet must refresh even when its request counter is zero');
  assert.strictEqual(delivered.at(-1).status, 'ready');
  healthy = false;
  for (const tick of reconnectTimers) await tick();
  healthy = true;
  for (const tick of reconnectTimers) await tick();
  assert.strictEqual(reconnectReads, 3, 'a subsequent DSH Pet restart also refreshes');
  await reconnect.stop();
  console.log('deepseek balance: decimal precision, validation, staleness, safe projection, account switching and timers passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
