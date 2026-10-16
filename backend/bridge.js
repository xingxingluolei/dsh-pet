'use strict';
// Host-side bridge. The browser only calls dsh's authenticated route; the pet
// capability token stays on disk/in Node and is never sent to a renderer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

function findPetApp(candidates) {
  // Launch Services reads CFBundleExecutable from the bundle. Electron builds
  // retain the name "Electron", so do not assume it matches the app's name.
  return candidates.find(p => typeof p === 'string' && path.isAbsolute(p) && p.endsWith('.app')
    && fs.existsSync(path.join(p, 'Contents', 'Info.plist')));
}

function desktopLaunchEnv(env = process.env) {
  const result = { ...env };
  // dsh's Host is Electron running as Node. Launch Services propagates this
  // variable, which would prevent DSH Pet from starting its Electron main.
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}

function createBridge(options = {}) {
  const runtimePath = options.runtimePath || path.join(os.homedir(), '.dsh-pet', 'runtime.json');
  let starting = null;
  function runtime() {
    try {
      const r = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
      return r.app === 'dsh-pet' && Number.isInteger(r.port) && r.port >= 41430 && r.port <= 41434
        && typeof r.token === 'string' && /^[a-f0-9]{48,128}$/i.test(r.token) ? r : null;
    } catch { return null; }
  }
  function call(input, endpoint = '/companion') {
    const r = runtime();
    if (!r) return Promise.resolve({ ok: false, error: '桌宠尚未运行' });
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      const body = input ? JSON.stringify(input) : '';
      const req = http.request({ hostname: '127.0.0.1', port: r.port, path: endpoint, method: input ? 'POST' : 'GET', timeout: 1500,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-dsh-pet-token': r.token } }, res => {
        let text = '', size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 65536) { req.destroy(); finish({ ok: false, error: '桌宠响应过大' }); }
          else text += chunk;
        });
        res.on('error', () => finish({ ok: false, error: '桌宠连接已断开' }));
        res.on('end', () => {
          if (res.headers['x-dsh-pet-server'] !== 'dsh-pet') { finish({ ok: false, error: '请更新 DSH Pet 后重试' }); return; }
          try {
            const value = JSON.parse(text);
            finish(res.statusCode === 200 ? value : { ok: false, error: value.error || '桌宠控制失败' });
          } catch { finish({ ok: false, error: '请更新 DSH Pet 后重试' }); }
        });
      });
      req.on('error', () => finish({ ok: false, error: '桌宠尚未运行' }));
      req.on('timeout', () => { req.destroy(); finish({ ok: false, error: '桌宠响应超时' }); });
      req.end(body);
    });
  }
  async function launch() {
    if (options.launch) return options.launch();
    if (process.platform !== 'darwin') throw Error('当前桌宠插件支持 macOS');
    const candidates = [process.env.DSH_PET_APP, '/Applications/DSH Pet.app', path.join(os.homedir(), 'Applications', 'DSH Pet.app')];
    const app = findPetApp(candidates);
    if (!app) throw Error('请先安装 DSH Pet.app');
    await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-gj', '-a', app, '--args', '--from-dsh'],
      { timeout: 10000, env: desktopLaunchEnv() }, error => error ? reject(error) : resolve()));
  }
  async function ensure() {
    const current = await call();
    if (current.ok) return;
    if (!starting) {
      starting = (async () => {
        await launch();
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          if ((await call()).ok) return;
          await new Promise(r => setTimeout(r, 200));
        }
        throw Error('DSH Pet 未就绪，请更新并重新启动桌宠');
      })().finally(() => { starting = null; });
    }
    return starting;
  }
  async function command(input, allowLaunch = true) {
    if (allowLaunch) await ensure();
    return call(input);
  }
  return { status: () => call(), command,
    balanceStatus: () => call(undefined, '/companion/balance'),
    updateBalance: input => call(input, '/companion/balance') };
}
module.exports = { createBridge, findPetApp, desktopLaunchEnv };
