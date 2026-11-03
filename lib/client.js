/**
 * Night Shift —— DSH 客户端半侧。
 *
 * 在页面右下角放一个「夜班」悬浮按钮，点击打开全屏 iframe（/night-shift/）。
 * 同时在 DSH 的「设置」里注册一个「夜班办公室」设置分区，用来上传自定义猫咪图片。
 * 纯 DOM + React 插槽，不依赖宿主 side 的额外接口。
 */
const CUSTOM_FACE_KEY = 'night-shift-custom-face'

window.__ModuleLoader__.load({
  id: 'dsh-night-shift',
  factory: require => {
    const module = { exports: {} }
    const react = (() => {
      try { return require('react') } catch { return null }
    })()
    const jsx = (() => {
      try { return require('react/jsx-runtime').jsx } catch { return null }
    })()

    function resizeImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
          try {
            const size = 256
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            const ctx = canvas.getContext('2d')
            const scale = Math.min(size / image.width, size / image.height)
            const w = Math.max(1, Math.round(image.width * scale))
            const h = Math.max(1, Math.round(image.height * scale))
            ctx.clearRect(0, 0, size, size)
            ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
            resolve(canvas.toDataURL('image/png'))
          } catch (error) {
            reject(error)
          } finally {
            URL.revokeObjectURL(url)
          }
        }
        image.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('图片读取失败'))
        }
        image.src = url
      })
    }

    function makeSettingsSection(react, jsx) {
      const { useState } = react
      const readCustom = () => {
        try { return localStorage.getItem(CUSTOM_FACE_KEY) ?? '' } catch { return '' }
      }
      return function NightShiftSettings() {
        const [preview, setPreview] = useState(readCustom)
        const [message, setMessage] = useState('')
        const [busy, setBusy] = useState(false)

        const choose = async event => {
          const file = event.target.files?.[0]
          if (!file) return
          if (file.size > 6 * 1024 * 1024) {
            setMessage('图片太大，请选择 6MB 以内的图片')
            return
          }
          setBusy(true)
          setMessage('正在处理图片…')
          try {
            const data = await resizeImage(file)
            localStorage.setItem(CUSTOM_FACE_KEY, data)
            setPreview(data)
            setMessage('已应用，刷新页面或重新打开面板后生效')
          } catch (error) {
            setMessage('图片处理失败：' + String(error?.message ?? error))
          } finally {
            setBusy(false)
            event.target.value = ''
          }
        }

        const reset = () => {
          localStorage.removeItem(CUSTOM_FACE_KEY)
          setPreview('')
          setMessage('已恢复默认 Catora 猫咪')
        }

        const titleStyle = { fontSize: 15, fontWeight: 600, margin: '0 0 6px' }
        const textStyle = { fontSize: 13, lineHeight: 1.6, margin: '0 0 10px', opacity: 0.72 }
        const buttonStyle = { height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(127,127,127,.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13 }

        return jsx('div', {
          style: { padding: '4px 0', maxWidth: 520 },
          children: [
            jsx('h3', { style: titleStyle, children: '夜班办公室' }),
            jsx('p', { style: textStyle, children: '上传一张图片，替换 3D 面板里所有 Agent 的猫咪头像（本地保存，不会上传到服务器）。' }),
            preview ? jsx('img', {
              src: preview,
              alt: '自定义猫咪预览',
              style: { width: 96, height: 96, objectFit: 'contain', borderRadius: 12, border: '1px solid rgba(127,127,127,.3)', background: 'rgba(127,127,127,.08)', display: 'block', marginBottom: 12 },
            }) : null,
            jsx('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } }, [
              jsx('label', {
                style: { ...buttonStyle, display: 'inline-flex', alignItems: 'center', opacity: busy ? 0.6 : 1 },
                children: [
                  busy ? '处理中…' : '上传图片',
                  jsx('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: choose, disabled: busy }),
                ],
              }),
              jsx('button', { type: 'button', style: buttonStyle, onClick: reset, children: '恢复默认猫猫' }),
            ]),
            message ? jsx('p', { style: { ...textStyle, marginTop: 10, marginBottom: 0 }, children: message }) : null,
          ],
        })
      }
    }

    module.exports.inject = ['slots']
    module.exports.apply = ctx => {
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

      // 在 DSH 设置中注册「夜班办公室」分区：上传自定义猫咪图片
      if (react && jsx && ctx?.slots?.inject) {
        try {
          const SettingsSection = makeSettingsSection(react, jsx)
          ctx.slots.inject('settings.section', function* () {
            yield ctx.slots.register({
              name: 'settings.section',
              id: 'night-shift',
              order: 36,
              label: () => '夜班办公室',
              inject: () => ({}),
            }, SettingsSection)
          })
        } catch (error) {
          console.warn('[night-shift] 设置分区注册失败：' + String(error?.message ?? error))
        }
      }

      return module.exports
    }
    return module.exports
  },
})
