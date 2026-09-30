'use strict';

const {spawnSync} = require('node:child_process');
const {existsSync} = require('node:fs');

if (process.env.CI || process.env.HUSKY === '0' || !existsSync('.git')) {
  process.exit(0);
}

const command = process.platform === 'win32' ? 'husky.cmd' : 'husky';
const result = spawnSync(command, ['install'], {stdio: 'inherit'});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
