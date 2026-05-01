#!/usr/bin/env node
/**
 * Replaces inline `fontSize: NUMBER` with `fontSize: 'var(--fs-xxx)'`
 * across all .tsx/.ts files in src/.
 *
 * Usage:
 *   node scripts/tokenize-fontsize.mjs           # dry-run (preview only)
 *   node scripts/tokenize-fontsize.mjs --write   # apply changes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const WRITE = process.argv.includes('--write')

const TOKEN_MAP = {
  6:  '--fs-3xs',
  7:  '--fs-2xs',
  8:  '--fs-xs',
  9:  '--fs-sm',
  10: '--fs-base',
  11: '--fs-md',
  12: '--fs-lg',
  13: '--fs-xl',
  14: '--fs-2xl',
  16: '--fs-3xl',
  18: '--fs-4xl',
  20: '--fs-5xl',
  24: '--fs-6xl',
  30: '--fs-7xl',
  36: '--fs-8xl',
  48: '--fs-9xl',
}

// Matches: fontSize: 12  or  fontSize:12  (no quotes)
// Captures the number so we can map it to a token.
// Negative lookahead prevents matching values already wrapped in quotes.
const PATTERN = /fontSize:\s*(?!['"`])(\d+(?:\.\d+)?)/g

function* walkSrc(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // skip vintage-imports — Figma-generated, do not touch
      if (entry === 'vintage-imports') continue
      yield* walkSrc(full)
    } else if (['.tsx', '.ts'].includes(extname(entry))) {
      yield full
    }
  }
}

const srcDir = new URL('../src', import.meta.url).pathname
  .replace(/^\/([A-Z]:)/, '$1')   // strip leading slash on Windows
  .replace(/%20/g, ' ')            // decode spaces in path

let totalFiles = 0
let totalReplacements = 0
const unmapped = new Map() // value → [file, ...]

for (const file of walkSrc(srcDir)) {
  const original = readFileSync(file, 'utf8')
  let changed = false
  const fileUnmapped = []

  const result = original.replace(PATTERN, (match, rawVal) => {
    const num = parseFloat(rawVal)
    const token = TOKEN_MAP[num]
    if (token) {
      changed = true
      totalReplacements++
      return `fontSize: 'var(${token})'`
    }
    // Not in map — collect for report, leave unchanged
    fileUnmapped.push(num)
    return match
  })

  for (const v of fileUnmapped) {
    if (!unmapped.has(v)) unmapped.set(v, [])
    unmapped.get(v).push(file.replace(srcDir, 'src'))
  }

  if (changed) {
    totalFiles++
    const relPath = file.replace(srcDir, 'src')
    if (WRITE) {
      writeFileSync(file, result, 'utf8')
      console.log(`  ✔  ${relPath}`)
    } else {
      // Dry-run: show a diff-like preview
      const lines = original.split('\n')
      const next  = result.split('\n')
      console.log(`\n── ${relPath}`)
      lines.forEach((line, i) => {
        if (line !== next[i]) {
          console.log(`  - ${line.trim()}`)
          console.log(`  + ${next[i].trim()}`)
        }
      })
    }
  }
}

console.log('\n' + '─'.repeat(60))
if (WRITE) {
  console.log(`Tokenized ${totalReplacements} occurrences across ${totalFiles} files.`)
} else {
  console.log(`Dry-run: ${totalReplacements} replacements in ${totalFiles} files.`)
  console.log('Run with --write to apply.\n')
}

if (unmapped.size > 0) {
  console.log('⚠  Values NOT in token map (left unchanged):')
  for (const [val, files] of [...unmapped.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`   fontSize: ${val}  →  ${[...new Set(files)].join(', ')}`)
  }
}
