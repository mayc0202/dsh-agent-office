/**
 * 智能体办公室 —— DSH 客户端半侧。
 *
 * 在页面右下角放一个猫头悬浮按钮，点击打开全屏 iframe（/agent-office/）。
 * 同时在 DSH 的「设置」里注册一个「智能体办公室」设置分区，用来上传自定义猫咪图片。
 * 纯 DOM + React 插槽，不依赖宿主 side 的额外接口。
 */
const CUSTOM_FACE_KEY = 'agent-office-custom-face'
const CAT_BUTTON = 'data:image/png;base64,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'

window.__ModuleLoader__.load({
  id: 'dsh-agent-office',
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
            jsx('h3', { style: titleStyle, children: '智能体办公室' }),
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
        .dsh-ns-pill{position:relative;display:grid;place-items:center;width:52px;height:52px;padding:0;border:0;background:transparent;box-shadow:none;cursor:pointer;transition:transform .15s ease}
        .dsh-ns-pill:hover{transform:translateY(-2px) scale(1.04)}
        .dsh-ns-pill img{width:46px;height:46px;object-fit:contain;display:block;pointer-events:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}
        .dsh-ns-eye{position:absolute;width:5px;height:11px;border-radius:50%;background:#0b0e13;pointer-events:none;left:35.8%;top:57.7%;transform:translate(calc(-50% + var(--ex,0px)), calc(-50% + var(--ey,0px)));transition:transform .08s linear}
        .dsh-ns-eye.right{left:63.5%}
        .dsh-ns-pill:focus-visible{outline:2px solid #3de1c6;outline-offset:4px;border-radius:50%}
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
        <button type="button" class="dsh-ns-pill" aria-label="打开智能体办公室" title="打开智能体办公室"><img alt="" /><span class="dsh-ns-eye left"></span><span class="dsh-ns-eye right"></span></button>
        <section class="dsh-ns-overlay" hidden>
          <button type="button" class="dsh-ns-open">在新标签打开</button>
          <button type="button" class="dsh-ns-close" aria-label="关闭">×</button>
          <iframe title="智能体办公室 3D 面板"></iframe>
        </section>
      `
      document.body.append(host)

      const pill = host.querySelector('.dsh-ns-pill')
      const pillCat = pill.querySelector('img')
      if (pillCat) pillCat.src = CAT_BUTTON
      const eyes = [...pill.querySelectorAll('.dsh-ns-eye')]
      const moveEyes = event => {
        const rect = pill.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = Math.max(-1, Math.min(1, (event.clientX - cx) / 140))
        const dy = Math.max(-1, Math.min(1, (event.clientY - cy) / 140))
        for (const eye of eyes) {
          eye.style.setProperty('--ex', (dx * 3.0).toFixed(2) + 'px')
          eye.style.setProperty('--ey', (dy * 2.2).toFixed(2) + 'px')
        }
      }
      window.__NS_CAT_EYES_CLEANUP__?.()
      window.__NS_CAT_EYES_CLEANUP__ = () => window.removeEventListener('pointermove', moveEyes)
      window.addEventListener('pointermove', moveEyes, { passive: true })
      const overlay = host.querySelector('.dsh-ns-overlay')
      const frame = host.querySelector('iframe')
      const closedByEscape = event => {
        if (event.key === 'Escape') close()
      }
      const open = () => {
        if (frame.getAttribute('src') !== '/agent-office/') frame.setAttribute('src', '/agent-office/')
        overlay.hidden = false
        document.addEventListener('keydown', closedByEscape, true)
      }
      const close = () => {
        overlay.hidden = true
        document.removeEventListener('keydown', closedByEscape, true)
      }
      pill.addEventListener('click', () => (overlay.hidden ? open() : close()))
      host.querySelector('.dsh-ns-close').addEventListener('click', close)
      host.querySelector('.dsh-ns-open').addEventListener('click', () => window.open('/agent-office/', '_blank', 'noopener'))

      // 在 DSH 设置中注册「智能体办公室」分区：上传自定义猫咪图片
      if (react && jsx && ctx?.slots?.inject) {
        try {
          const SettingsSection = makeSettingsSection(react, jsx)
          ctx.slots.inject('settings.section', function* () {
            yield ctx.slots.register({
              name: 'settings.section',
              id: 'agent-office',
              order: 36,
              label: () => '智能体办公室',
              inject: () => ({}),
            }, SettingsSection)
          })
        } catch (error) {
          console.warn('[agent-office] 设置分区注册失败：' + String(error?.message ?? error))
        }
      }

      // 注意：apply 不能返回 module.exports，cordis 会把返回值当作 effect，
      // 非函数/可迭代对象会抛 “Invalid effect”，导致设置分区注册失败。
      return undefined
    }
    return module.exports
  },
})
