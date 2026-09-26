#!/bin/bash
# runqueue.sh QUEUE_FILE LANES : run jobs from the queue, LANES at a time (hub rule: at most 2).
cd "$(dirname "$0")"
Q="$1"; LANES="${2:-2}"
run_lane() {
  while true; do
    # atomically pop the next job name
    NAME=$(flock queue.lock bash -c "head -1 '$Q'; sed -i 1d '$Q'")
    [ -z "$NAME" ] && break
    python3 cxgen.py "jobs/$NAME.json"; RC=$?
    if [ $RC -eq 3 ]; then echo "STOP: quota guard hit at $NAME"; flock queue.lock bash -c "sed -i '1i $NAME' '$Q'"; break; fi
  done
}
for i in $(seq 1 "$LANES"); do run_lane & sleep 20; done
wait
echo "QUEUE DONE ($(wc -l < "$Q") left)"
