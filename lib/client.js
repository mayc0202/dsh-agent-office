/**
 * Night Shift —— DSH 客户端半侧。
 *
 * 在页面右下角放一个「夜班」悬浮按钮，点击打开全屏 iframe（/night-shift/）。
 * 同时在 DSH 的「设置」里注册一个「夜班办公室」设置分区，用来上传自定义猫咪图片。
 * 纯 DOM + React 插槽，不依赖宿主 side 的额外接口。
 */
const CUSTOM_FACE_KEY = 'night-shift-custom-face'
const CAT_BUTTON = 'data:image/png;base64,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'

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
        .dsh-ns-pill{display:grid;place-items:center;width:52px;height:52px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(10,13,18,.92);cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.42);backdrop-filter:blur(12px);transition:transform .15s ease,background .15s ease,box-shadow .15s ease}
        .dsh-ns-pill:hover{transform:translateY(-2px);background:#141a22;box-shadow:0 12px 32px rgba(0,0,0,.5)}
        .dsh-ns-pill img{width:38px;height:38px;object-fit:contain;display:block;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
        .dsh-ns-pill:focus-visible{outline:2px solid #3de1c6;outline-offset:3px}
        .dsh-ns-overlay{position:fixed;z-index:1300;inset:0;background:#060607}
        .dsh-ns-overlay[hidden]{display:none}
        .dsh-ns-overlay iframe{display:block;width:100%;height:100%;border:0;background:#060607}
        .dsh-ns-close{position:absolute;top:auto;bottom:18px;right:16px;z-index:2;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,20,23,.86);color:#f2f0ea;font-size:18px;line-height:1;cursor:pointer;backdrop-filter:blur(8px)}
        .dsh-ns-close:hover{background:rgba(40,40,45,.95)}
        .dsh-ns-open{position:absolute;top:auto;bottom:18px;right:58px;z-index:2;height:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(20,20,23,.86);color:#f2f0ea;font-size:12px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px)}
        .dsh-ns-open:hover{background:rgba(40,40,45,.95)}
        html[data-fullscreen] .dsh-ns-pill{bottom:12px}
      `
      document.head.append(style)

      const host = document.createElement('div')
      host.className = 'dsh-ns-host'
      host.innerHTML = `
        <button type="button" class="dsh-ns-pill" aria-label="打开夜班 3D 办公室" title="打开夜班 3D 办公室"><img alt="" /></button>
        <section class="dsh-ns-overlay" hidden>
          <button type="button" class="dsh-ns-open">在新标签打开</button>
          <button type="button" class="dsh-ns-close" aria-label="关闭">×</button>
          <iframe title="Night Shift 3D 办公室"></iframe>
        </section>
      `
      document.body.append(host)

      const pill = host.querySelector('.dsh-ns-pill')
      const pillCat = pill.querySelector('img')
      if (pillCat) pillCat.src = CAT_BUTTON
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
