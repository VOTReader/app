#!/usr/bin/env python3
"""Run one Codex image job: N image_gen calls in one `codex exec` session.

usage: cxgen.py JOB.json
JOB: {"name": "...", "refs": ["path.png", ...], "images": [{"file": "a-home.png", "prompt": "..."}],
      "max_primary": 75, "max_weekly": 30}
Checks the ChatGPT-plan Codex rate limits (via `codex app-server`) before and
after, appends a line to usage.log, and refuses to start past the thresholds.
"""
import json, os, subprocess, sys, time, select, shutil, glob

HERE = os.path.dirname(os.path.abspath(__file__))
# Hub rule (Corbin, 09-25): Luna only, one or two Codex runs at a time. No Sol, no Astra.
MODEL = 'gpt-6-luna'

def limits():
    p = subprocess.Popen(['codex', 'app-server'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL, text=True, bufsize=1)
    def send(o): p.stdin.write(json.dumps(o) + '\n'); p.stdin.flush()
    def recv(i, t=25):
        end = time.time() + t
        while time.time() < end:
            r, _, _ = select.select([p.stdout], [], [], 0.5)
            if not r: continue
            line = p.stdout.readline()
            if not line: break
            try: m = json.loads(line)
            except Exception: continue
            if m.get('id') == i: return m
    send({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {'name': 'vot-mockups', 'title': 'vot-mockups', 'version': '0.1'}}})
    recv(1); send({'method': 'initialized'}); send({'id': 2, 'method': 'account/rateLimits/read'})
    m = recv(2); p.terminate()
    rl = ((m or {}).get('result') or {}).get('rateLimits') or {}
    return (rl.get('primary') or {}).get('usedPercent'), (rl.get('secondary') or {}).get('usedPercent')

def main():
    job = json.load(open(sys.argv[1]))
    name = job['name']
    out = os.path.join(HERE, 'out', name); os.makedirs(out, exist_ok=True)
    p0, w0 = limits()
    maxp, maxw = job.get('max_primary', 75), job.get('max_weekly', 30)
    print(f'[{name}] limits before: 5h={p0}% weekly={w0}%', flush=True)
    if p0 is None or p0 >= maxp or (w0 or 0) >= maxw:
        print(f'[{name}] REFUSING: over threshold (5h>={maxp} or weekly>={maxw})'); sys.exit(3)
    refs = [os.path.abspath(r) for r in job.get('refs', [])]
    lines = []
    lines.append('You are producing UI design mockup images for VOTReader, a personal scripture-reading app (Android + PWA).')
    lines.append('Do NOT read, search or edit any files. Do not explore the filesystem. Go straight to the built-in image_gen tool.')
    if refs and job.get('preamble'):
        lines.append(job['preamble'])
    elif refs:
        lines.append(f'{len(refs)} reference image(s) are attached: they are screenshots of the CURRENT app, given ONLY as a reference for content, information architecture and real wording. Do not copy their visual style unless a prompt says so.')
    lines.append(f'Make exactly {len(job["images"])} separate image_gen call(s), one per spec below, using each spec as the image prompt (you may reformat it but must not add new content, logos or text).')
    lines.append('Generate the images strictly in the order of the specs. Do NOT copy, move or rename any files yourself and do not run shell commands; the images are collected automatically.')
    lines.append('When all images are generated, reply with just the word DONE.')
    for i, im in enumerate(job['images'], 1):
        lines.append(f'\n=== Spec {i} -> save as {im["file"]} ===\n{im["prompt"].strip()}')
    prompt = '\n'.join(lines)
    open(os.path.join(out, '_prompt.txt'), 'w').write(prompt)
    cmd = ['codex', 'exec', '-m', MODEL, '--skip-git-repo-check', '--json', '-s', 'workspace-write', '-c', 'model_reasoning_effort="low"']
    for r in refs: cmd += ['-i', r]
    cmd += ['--', prompt]
    t0 = time.time()
    with open(os.path.join(out, '_run.jsonl'), 'w') as fo, open(os.path.join(out, '_run.err'), 'w') as fe:
        rc = subprocess.call(cmd, cwd=out, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe, timeout=job.get('timeout', 1800))
    dt = time.time() - t0
    p1, w1 = limits()
    # Collect this session's images from $CODEX_HOME/generated_images/<thread_id>/ in creation order
    # (never "newest file": two lanes run at once and would steal each other's images).
    tid = None
    try:
        for line in open(os.path.join(out, '_run.jsonl')):
            e = json.loads(line)
            if e.get('type') == 'thread.started': tid = e.get('thread_id'); break
    except Exception: pass
    gen = sorted(glob.glob(os.path.expanduser(f'~/.codex/generated_images/{tid}/*.png')), key=os.path.getmtime) if tid else []
    names = [im['file'] for im in job['images']]
    if len(gen) == len(names):
        for src, dst in zip(gen, names): shutil.copy(src, os.path.join(out, dst))
    else:
        print(f'   WARN: {len(gen)} images for {len(names)} specs; saving as extra-N for review')
        for i, src in enumerate(gen, 1): shutil.copy(src, os.path.join(out, f'extra-{i}.png'))
    made = [n for n in names if os.path.exists(os.path.join(out, n))]
    msg = f'{time.strftime("%H:%M:%S")} [{name}] rc={rc} {dt:.0f}s images={len(made)}/{len(job["images"])} 5h {p0}->{p1} weekly {w0}->{w1}'
    print(msg, flush=True)
    open(os.path.join(HERE, 'usage.log'), 'a').write(msg + '\n')
    # usage summary from the run
    try:
        for line in open(os.path.join(out, '_run.jsonl')):
            e = json.loads(line)
            if e.get('type') == 'turn.completed': print('   usage', e.get('usage'))
            if e.get('type') in ('turn.failed', 'error'): print('   ERR', json.dumps(e)[:400])
    except Exception as ex: print('   (no jsonl)', ex)
    sys.exit(0 if len(made) == len(job['images']) else 2)

main()
