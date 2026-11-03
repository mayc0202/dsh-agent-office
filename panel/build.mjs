#!/usr/bin/env node
/**
 * 把 panel-src/（Three.js 源码 + HTML 模板）打包成单文件 lib/panel.html。
 *
 * 依赖 three 与 esbuild。仓库根目录执行 `npm i` 后运行：
 *   node panel/build.mjs
 *
 * 也可以用环境变量指定依赖位置：
 *   THREE_NODE_PATH=/path/to/node_modules node panel/build.mjs
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const nodePaths = [
  process.env.THREE_NODE_PATH,
  join(root, 'node_modules'),
  join(root, '..', 'memory-3d-map', 'node_modules'),
].filter(Boolean)

const result = await build({
  entryPoints: [join(here, '..', 'panel-src', 'main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  nodePaths,
  loader: { '.png': 'dataurl' },
  logLevel: 'info',
})

const html = readFileSync(join(here, '..', 'panel-src', 'index.html'), 'utf8')
const out = html.replace('/*__BUNDLE__*/', () => result.outputFiles[0].text)
writeFileSync(join(here, '..', 'lib', 'panel.html'), out)
console.log(`built lib/panel.html (${(out.length / 1024).toFixed(0)} KiB)`)
