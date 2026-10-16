// Serialized mutations keep a delayed startup response from
// undoing a subsequent click. Reads never launch DSH Pet.
export function createClientController(options) {
  // Native Window timers reject an options object as their receiver.
  const schedule = options.setInterval, cancel = options.clearInterval;
  let snapshot = { ok: false, busy: false, hidden: false, error: '' };
  let chain = Promise.resolve(), stopped = false, timer = null, revision = 0;
  const listeners = new Set();
  function publish(value) {
    if (stopped) return;
    snapshot = { ...snapshot, ...value };
    for (const listener of listeners) listener();
  }
  function action(data) {
    revision++;
    publish({ busy: true, error: '' });
    chain = chain.then(async () => {
      if (stopped) return;
      try {
        const result = await options.request('POST', data);
        if (!result.ok) throw Error(result.error || '桌宠连接失败');
        publish({ ...result, busy: false, error: '' });
      } catch (error) { publish({ ok: false, busy: false, error: error.message }); }
    });
    return chain;
  }
  async function refresh() {
    if (stopped || snapshot.busy) return;
    const current = revision;
    try {
      const result = await options.request('GET');
      if (current === revision) publish({ ...result, error: result.ok ? '' : (result.error || '桌宠尚未运行') });
    } catch (error) { if (current === revision) publish({ ok: false, error: error.message }); }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    toggle: () => action({ action: 'toggle' }),
    start: async () => {
      timer = schedule(refresh, 3000);
      return action({ action: 'attach' });
    },
    dispose: async () => {
      stopped = true;
      if (timer !== null) cancel(timer);
      await chain;
      try { await options.request('POST', { action: 'detach' }); } catch {}
      listeners.clear();
    },
  };
}

export function installClient(ctx, React, controllerFactory) {
  if (location.protocol !== 'dsh-app:' || !window.dshDesktop) return;
  const controller = controllerFactory({
    setInterval, clearInterval,
    request: async (method, data) => {
      const response = await fetch('/api/dsh-pet', {
        method, headers: { 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || `桌宠连接失败 (${response.status})`);
      return result;
    },
  });
  const style = document.createElement('style');
  // Outlets use display:contents; their parent owns the footer's flex layout.
  style.textContent = `
    div:has(> [data-slot="sidebar.footer.action"] .dsh-pet-toggle) { flex-direction:column }
    .dsh-pet-toggle { box-sizing:border-box; display:flex; align-items:center; gap:9px; width:100%; min-height:38px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l2,#d7e3f5); border-radius:10px; background:var(--dsw-alias-bg-layer-1,#f8faff); color:var(--dsw-alias-label-primary,inherit); font:inherit; font-size:12px; cursor:pointer; -webkit-app-region:no-drag }
    .dsh-pet-toggle:hover { background:var(--dsw-alias-interactive-bg-hover,#edf3ff); border-color:var(--dsw-alias-state-business-primary,#4d6bfe) }
    .dsh-pet-toggle:focus-visible {outline:2px solid #4d6bfe;outline-offset:3px}
    .dsh-pet-toggle:disabled {cursor:wait;opacity:.65}
    .dsh-pet-icon { flex:none; width:18px; height:18px; color:var(--dsw-alias-label-secondary,#607b9e) }
    .dsh-pet-label { flex:1; text-align:left; white-space:nowrap }
    .dsh-pet-switch { flex:none; position:relative; width:28px; height:16px; border-radius:10px; background:var(--dsw-alias-border-l2,#c9d5e8) }
    .dsh-pet-switch:after { content:''; position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%; background:var(--dsw-alias-bg-layer-1,#fff) }
    .dsh-pet-toggle[aria-pressed=true] .dsh-pet-switch { background:var(--dsw-alias-state-business-primary,#4d6bfe) }
    .dsh-pet-toggle[aria-pressed=true] .dsh-pet-switch:after { left:14px }
    .dsh-pet-rail { justify-content:center; width:36px; height:36px; min-height:36px; margin:5px auto; padding:8px; border-radius:10px }
    .dsh-pet-rail .dsh-pet-label,.dsh-pet-rail .dsh-pet-switch { display:none }
  `;
  document.head.append(style);
  function Toggle({ wide = true } = {}) {
    const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const text = state.busy ? '桌宠连接中…' : !state.ok ? '连接桌宠' : state.hidden ? '显示桌宠' : '隐藏桌宠';
    return React.createElement('button', { type: 'button', className: 'dsh-pet-toggle' + (wide ? '' : ' dsh-pet-rail'), 'data-state': state.state || 'idle',
      'aria-label': text, 'aria-pressed': state.ok && !state.hidden, title: state.error || '点击展示或隐藏桌宠', disabled: state.busy, onClick: controller.toggle },
    React.createElement('svg', { className: 'dsh-pet-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
      React.createElement('ellipse', { cx: 5, cy: 8, rx: 2, ry: 2.5, transform: 'rotate(-25 5 8)' }),
      React.createElement('ellipse', { cx: 10, cy: 5, rx: 2, ry: 2.5 }),
      React.createElement('ellipse', { cx: 15, cy: 5, rx: 2, ry: 2.5 }),
      React.createElement('ellipse', { cx: 20, cy: 8, rx: 2, ry: 2.5, transform: 'rotate(25 20 8)' }),
      React.createElement('path', { d: 'M6 18c0-2 2-3 3-5 1-2 5-2 6 0 1 2 3 3 3 5 0 3-4 2-6 2s-6 1-6-2Z' })),
    React.createElement('span', { className: 'dsh-pet-label' }, text),
    React.createElement('span', { className: 'dsh-pet-switch', 'aria-hidden': true }));
  }
  // Skin controls use -100; the companion sits immediately above that card.
  const disposeSlot = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-pet', order: -110 }, Toggle));
  controller.start();
  return () => { disposeSlot?.(); style.remove(); controller.dispose(); };
}
