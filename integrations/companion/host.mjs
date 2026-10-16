import bridgeModule from '../../backend/bridge.js';
const { createBridge } = bridgeModule;
export const name = 'dsh-pet';
export const inject = ['webServer', 'connection', 'deepseekAccount'];

// Account grants stay inside the official Host service. Only bounded wallet
// projections cross to the pet, never getPlatformSession or getState objects.
export function createBalanceSync(options) {
  const now = options.now || Date.now;
  const schedule = options.setInterval || setInterval, cancel = options.clearInterval || clearInterval;
  const lifetime = new AbortController();
  let stopped = false, configured = false, generation = 0, flight = null, timer = null;
  let writes = Promise.resolve(), lastRefresh = 0, seenVersion = 0, bridgeAvailable = false;
  const push = (value, revision = generation) => {
    writes = writes.catch(() => {}).then(async () => {
      if (revision !== generation) return;
      try { bridgeAvailable = (await options.bridge.updateBalance(value))?.ok === true; }
      catch { bridgeAvailable = false; }
    });
    return writes;
  };
  function project(input) {
    if (!Array.isArray(input) || input.length > 2) throw Error('protocol');
    const seen = new Set();
    return input.map(wallet => {
      if (!wallet || !['CNY', 'USD'].includes(wallet.currency) || seen.has(wallet.currency)
        || typeof wallet.balance !== 'string' || wallet.balance.length > 120
        || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(wallet.balance)
        || !Number.isFinite(Number(wallet.balance))) throw Error('protocol');
      const [mantissa, exponent = '0'] = wallet.balance.split(/e/i);
      const [whole, fraction = ''] = mantissa.replace(/^-/, '').split('.');
      if (Math.abs(Number(exponent)) > 100 || (whole || '0').length + fraction.length > 100) throw Error('protocol');
      seen.add(wallet.currency);
      return { currency: wallet.currency, balance: wallet.balance };
    });
  }
  function refresh() {
    if (stopped || !configured) return Promise.resolve();
    if (flight) return flight.task;
    const revision = generation;
    const pending = { timeout: null, task: null };
    flight = pending;
    lastRefresh = now();
    const task = (async () => {
      await push({ status: 'loading' }, revision);
      if (stopped || revision !== generation) { if (flight === pending) flight = null; return; }
      const query = Promise.resolve().then(() => options.account.getBalance(options.client()));
      // A display timeout must not release the actual request single-flight.
      // The official service also bounds its HTTP request (30s by default).
      const settled = () => { if (flight === pending) flight = null; };
      query.then(settled, settled);
      try {
        const result = await Promise.race([
          query,
          new Promise((_, reject) => { pending.timeout = setTimeout(() => reject(Error('timeout')), options.requestTimeoutMs || 35000); }),
        ]);
        if (stopped || revision !== generation) return;
        if (result === null) { configured = false; await push({ status: 'unconfigured' }, revision); }
        else if (result?.status === 'ready') await push({ status: 'ready', normalWallets: project(result.value),
          bonusWallets: project(result.bonusWallets), updatedAt: now() }, revision);
        else await push({ status: 'error', errorCode: 'unavailable' }, revision);
      } catch (error) {
        if (!stopped && revision === generation) await push({ status: 'error',
          errorCode: error?.message === 'timeout' ? 'timeout' : error?.message === 'protocol' ? 'protocol' : 'unavailable' }, revision);
      } finally { clearTimeout(pending.timeout); pending.timeout = null; }
    })();
    pending.task = task;
    return task;
  }
  async function accountChanged(state) {
    if (stopped) return;
    generation++;
    if (flight?.timeout) clearTimeout(flight.timeout);
    flight = null;
    configured = state?.status === 'credential-stored';
    // Even credential-stored -> credential-stored can be an account change.
    await push({ status: 'unconfigured' });
    if (!stopped && configured) refresh();
  }
  async function poll() {
    if (stopped) return;
    try {
      const result = await options.bridge.balanceStatus();
      if (stopped) return;
      if (!result?.ok || !Number.isSafeInteger(result.refreshVersion)) { bridgeAvailable = false; return; }
      const reconnected = !bridgeAvailable;
      bridgeAvailable = true;
      const requested = seenVersion !== result.refreshVersion;
      seenVersion = result.refreshVersion;
      if (reconnected || requested || now() - lastRefresh >= 5 * 60 * 1000) await refresh();
    } catch { bridgeAvailable = false; }
  }
  return {
    refresh, accountChanged,
    start() {
      if (timer !== null || stopped) return;
      timer = schedule(poll, 10000); timer?.unref?.();
      if (typeof options.account.watch === 'function') (async () => {
        try { for await (const state of options.account.watch(lifetime.signal)) {
          if (stopped) break;
          await accountChanged(state);
        } } catch { if (!stopped) await push({ status: 'error', errorCode: 'unavailable' }); }
      })();
    },
    async stop() {
      if (stopped) return;
      stopped = true; configured = false; generation++;
      if (flight?.timeout) clearTimeout(flight.timeout);
      flight = null;
      lifetime.abort();
      if (timer !== null) { cancel(timer); timer = null; }
      await push({ status: 'unconfigured' });
    },
  };
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
export async function readCommand(req) {
  let size = 0, text = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) text += chunk;
  }
  if (size > 4096) throw new RangeError('payload too large');
  const data = JSON.parse(text);
  if (!data || Array.isArray(data) || !['attach', 'detach', 'show', 'hide', 'toggle'].includes(data.action)) {
    throw new TypeError('invalid companion command');
  }
  return { action: data.action };
}
export function apply(ctx) {
  const bridge = createBridge();
  const makeBalances = () => createBalanceSync({ account: ctx.deepseekAccount, bridge,
    client: () => ({ version: process.env.DSH_CLIENT_VERSION || '0.2.0-rc.2', locale: /^zh/i.test(process.env.LANG || '') ? 'zh' : 'en',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }) });
  let balances = makeBalances(), balanceSyncActive = true;
  balances.start();
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/dsh-pet', handler: async (req, res) => {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    if (req.method === 'GET') { json(res, 200, await bridge.status()); return; }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
    if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') {
      json(res, 415, { ok: false, error: 'application/json required' }); return;
    }
    try {
      const command = await readCommand(req);
      const result = await bridge.command(command, command.action !== 'detach');
      if (command.action === 'detach') { await balances.stop(); balanceSyncActive = false; }
      else if (result.ok) {
        if (!balanceSyncActive) { balances = makeBalances(); balances.start(); balanceSyncActive = true; }
        if (command.action === 'attach') balances.refresh();
      }
      json(res, result.ok ? 200 : 503, result);
    } catch (error) {
      json(res, error instanceof RangeError ? 413 : error instanceof TypeError || error instanceof SyntaxError ? 400 : 503,
        { ok: false, error: error.message });
    }
  } }));
  ctx.on('dispose', async () => { await balances.stop(); await bridge.command({ action: 'detach' }, false).catch(() => {}); });
}
