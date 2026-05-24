#!/usr/bin/env python3
"""Triage eslint-baseline.json: group violations by ruleId, count by
severity, list affected files. One-shot — produces a printable
categorization the Q3.1b commit message embeds verbatim.
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / 'eslint-baseline.json'

data = json.loads(BASELINE.read_text(encoding='utf-8'))

# Aggregate
rule_severity = defaultdict(lambda: [0, 0])  # ruleId -> [errors, warnings]
rule_files = defaultdict(set)
rule_fixable = Counter()
total_errors = 0
total_warnings = 0

for file_report in data:
    fpath = file_report.get('filePath', '?')
    for msg in file_report.get('messages', []):
        rule = msg.get('ruleId') or '(no-rule)'
        sev = msg.get('severity', 0)  # 1 = warn, 2 = error
        if sev == 2:
            rule_severity[rule][0] += 1
            total_errors += 1
        elif sev == 1:
            rule_severity[rule][1] += 1
            total_warnings += 1
        rule_files[rule].add(fpath)
        if msg.get('fix'):
            rule_fixable[rule] += 1

# Sort: errors desc, then warnings desc, then rule name
ranked = sorted(rule_severity.items(), key=lambda x: (-x[1][0], -x[1][1], x[0]))

print(f'TOTAL: {total_errors} errors, {total_warnings} warnings across {len(data)} files')
print()
print('BY RULE (errors / warnings / fixable / files affected):')
print('-' * 88)
for rule, (errs, warns) in ranked:
    fixable = rule_fixable.get(rule, 0)
    nfiles = len(rule_files[rule])
    fix_marker = f' [{fixable} auto-fixable]' if fixable else ''
    print(f'  {errs:>4} err  {warns:>4} warn   {rule}{fix_marker}')
    print(f'         (across {nfiles} files)')

print()
print('=' * 88)
print('Q3.2 (auto-fix) targets — rules with --fix support:')
for rule in sorted(rule_fixable.keys(), key=lambda r: -rule_fixable[r]):
    if rule_fixable[rule] > 0:
        print(f'  {rule_fixable[rule]:>4}   {rule}')
print()
print('Q3.3 (manual review) targets — non-auto-fixable + judgment-required:')
for rule, (errs, warns) in ranked:
    if rule_fixable.get(rule, 0) == 0 or 'exhaustive-deps' in (rule or ''):
        total = errs + warns
        if total > 0:
            print(f'  {total:>4}   {rule}  ({errs}e/{warns}w)')
