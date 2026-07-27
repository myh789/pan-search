#!/usr/bin/env node
/**
 * Conservative MySQL dump → D1/SQLite insert converter.
 * Usage: node scripts/convert-mysql-dump.js dump.sql > converted.sql
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/convert-mysql-dump.js dump.sql');
  process.exit(1);
}

const map = {
  qf_source_category: 'source_category',
  qf_source_log: 'source_log',
  qf_api_list: 'api_list',
  qf_source: 'source',
  qf_group: 'groups',
  qf_admin: 'admin',
  qf_access: 'access',
  qf_attach: 'attach',
  qf_auth: 'auth',
  qf_conf: 'conf',
  qf_feedback: 'feedback',
  qf_node: 'node',
  qf_token: 'token',
  qf_user: 'user',
  qf_log: 'log',
  qf_days: 'days',
};

let sql = fs.readFileSync(file, 'utf8');
sql = sql.replace(/`/g, '');
sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
sql = sql.replace(/^SET .*$/gm, '');
sql = sql.replace(/^LOCK TABLES.*$/gm, '');
sql = sql.replace(/^UNLOCK TABLES;.*$/gm, '');
sql = sql.replace(/ENGINE=\w+/gi, '');
sql = sql.replace(/DEFAULT CHARSET=\w+/gi, '');
sql = sql.replace(/COLLATE=\w+/gi, '');
sql = sql.replace(/AUTO_INCREMENT=\d+/gi, '');
sql = sql.replace(/CHARACTER SET \w+/gi, '');
sql = sql.replace(/COLLATE \w+/gi, '');

for (const [from, to] of Object.entries(map)) {
  const re = new RegExp(`\\b${from}\\b`, 'g');
  sql = sql.replace(re, to);
}

// Keep INSERT lines mostly; drop CREATE/DROP/ALTER
const out = sql
  .split('\n')
  .filter((line) => {
    const t = line.trim().toUpperCase();
    if (!t) return false;
    if (t.startsWith('CREATE ') || t.startsWith('DROP ') || t.startsWith('ALTER ')) return false;
    return true;
  })
  .join('\n');

process.stdout.write(out + '\n');
