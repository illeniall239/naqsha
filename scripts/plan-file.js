// Reading and writing plan.js, shared by the hook and the plan tool.
'use strict';

const fs = require('fs');

// plan.js is `window.NAQSHA = <JSON>;` so the page can load it from file://
// and scripts can parse it without executing it.
const PLAN_RE = /^\s*window\.NAQSHA\s*=\s*([\s\S]*?)\s*;?\s*$/;

function readPlan(file) {
  const m = PLAN_RE.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error('expected `window.NAQSHA = {...};`');
  const plan = JSON.parse(m[1]);
  if (!plan || typeof plan.meta !== 'object') throw new Error('missing "meta"');
  return plan;
}

function tryReadPlan(file) {
  try { return readPlan(file); } catch { return null; }
}

// Written to a temporary file and renamed, so the page never reads half a plan.
function writePlan(file, plan) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
  fs.renameSync(tmp, file);
}

module.exports = { readPlan, tryReadPlan, writePlan };
