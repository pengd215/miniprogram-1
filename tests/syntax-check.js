const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const roots = ['cloudfunctions', 'miniprogram']
const files = []

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(fullPath)
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath)
  }
}

roots.forEach(collect)
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`JavaScript syntax passed (${files.length} files)`)
