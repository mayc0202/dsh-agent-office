/**
 * Night Shift —— DSH 客户端半侧。
 *
 * 在页面右下角放一个「夜班」悬浮按钮，点击打开全屏 iframe（/night-shift/）。
 * 纯 DOM 注入，不依赖客户端服务。
 */
window.__ModuleLoader__.load({
  id: 'dsh-night-shift',
  factory: () => {
    const module = { exports: {} }
    module.exports.inject = []
    module.exports.apply = () => {
      for (const stale of document.querySelectorAll('.dsh-ns-host')) stale.remove()

      const style = document.createElement('style')
      style.textContent = `
        .dsh-ns-host{position:fixed;z-index:1200;right:20px;bottom:20px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:Inter,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-app-region:no-drag}
        .dsh-ns-pill{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:999px;border:1px solid #d1d5db;background:rgba(255,255,255,.95);color:#111827;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(17,24,39,.12);backdrop-filter:blur(10px)}
        .dsh-ns-pill:hover{background:#f3f4f6}
        .dsh-ns-pill i{width:9px;height:9px;border-radius:50%;background:#f0604e;box-shadow:0 0 8px rgba(240,96,78,.7)}
        .dsh-ns-pill:focus-visible{outline:2px solid #111827;outline-offset:2px}
        .dsh-ns-overlay{position:fixed;z-index:1300;inset:0;background:#060607}
        .dsh-ns-overlay[hidden]{display:none}
        .dsh-ns-overlay iframe{display:block;width:100%;height:100%;border:0;background:#060607}
        .dsh-ns-close{position:absolute;top:14px;right:16px;z-index:2;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,20,23,.86);color:#f2f0ea;font-size:18px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
        .dsh-ns-close:hover{background:rgba(40,40,45,.95)}
        .dsh-ns-open{position:absolute;top:14px;right:58px;z-index:2;height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(20,20,23,.86);color:#f2f0ea;font-size:12px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px)}
        .dsh-ns-open:hover{background:rgba(40,40,45,.95)}
        html[data-fullscreen] .dsh-ns-pill{bottom:12px}
      `
      document.head.append(style)

      const host = document.createElement('div')
      host.className = 'dsh-ns-host'
      host.innerHTML = `
        <button type="button" class="dsh-ns-pill" aria-label="打开夜班 3D 办公室"><i></i>夜班</button>
        <section class="dsh-ns-overlay" hidden>
          <button type="button" class="dsh-ns-open">在新标签打开</button>
          <button type="button" class="dsh-ns-close" aria-label="关闭">×</button>
          <iframe title="Night Shift 3D 办公室"></iframe>
        </section>
      `
      document.body.append(host)

      const pill = host.querySelector('.dsh-ns-pill')
      const overlay = host.querySelector('.dsh-ns-overlay')
      const frame = host.querySelector('iframe')
      const closedByEscape = event => {
        if (event.key === 'Escape') close()
      }
      const open = () => {
        if (frame.getAttribute('src') !== '/night-shift/') frame.setAttribute('src', '/night-shift/')
        overlay.hidden = false
        document.addEventListener('keydown', closedByEscape, true)
      }
      const close = () => {
        overlay.hidden = true
        document.removeEventListener('keydown', closedByEscape, true)
      }
      pill.addEventListener('click', () => (overlay.hidden ? open() : close()))
      host.querySelector('.dsh-ns-close').addEventListener('click', close)
      host.querySelector('.dsh-ns-open').addEventListener('click', () => window.open('/night-shift/', '_blank', 'noopener'))
      return module.exports
    }
    return module.exports
  },
})
