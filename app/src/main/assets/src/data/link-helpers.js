function buildSourceEndpoint(sourceKey, sourceLabel, sourceStart, sourceEnd, sourceText) {
  const parts = sourceKey.split(':');
  const excerpt = sourceStart != null ? { start: sourceStart, end: sourceEnd, text: sourceText } : {};
  if (parts[0] === 'bible') {
    return { type: 'bible', key: sourceKey, bookId: parts[1], chapter: parseInt(parts[2], 10), verse: parseInt(parts[3], 10), label: sourceLabel || sourceKey };
  }
  if (parts[0] === 'study') {
    const m = parts[1].match(/^(.+)-(\d+)$/);
    const bookId = m ? m[1] : 'matthew';
    const chapter = m ? parseInt(m[2], 10) : null;
    const verse = parts[2] && parts[2] !== '0' ? parseInt(parts[2], 10) : null;
    return { type: 'study', key: sourceKey, bookId, chapter, verse, screen: 'matthew-ch', label: sourceLabel || sourceKey };
  }
  if (parts[0] === 'letter' || parts[0] === 'wtlb' || parts[0] === 'blessed' || parts[0] === 'holy-days') {
    const id = parts[1];
    const ctx = findEntryContext(id, parts[0]);
    if (ctx && ctx.kind === 'study-letter') {
      return {
        type: 'study-letter', key: sourceKey,
        letterId: id, studyId: ctx.studyId, studyChapterId: ctx.studyChapterId,
        screen: ctx.screen, collection: ctx.collection,
        label: sourceLabel || ctx.title, ...excerpt
      };
    }
    if (ctx) {
      const base = {
        type: ctx.kind, key: sourceKey, screen: ctx.screen,
        collection: ctx.collection, label: sourceLabel || ctx.title, ...excerpt
      };
      if (ctx.kind === 'letter') base.letterId = id;
      else base.entryId = id;
      return base;
    }
    if (parts[0] === 'letter') return { type: 'letter', key: sourceKey, letterId: id, label: sourceLabel || sourceKey, ...excerpt };
    if (parts[0] === 'wtlb')   return { type: 'wtlb',   key: sourceKey, entryId: id,  label: sourceLabel || sourceKey, ...excerpt };
    return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
  }
  return { type: parts[0], key: sourceKey, label: sourceLabel || sourceKey, ...excerpt };
}

function persistLink(sourceEndpoint, targetEndpoint) {
  const existing = LinkStore.getForKey(sourceEndpoint.key);
  const dup = existing.find(l => l.a.key === targetEndpoint.key || l.b.key === targetEndpoint.key);
  if (dup) return dup;
  const link = { id: lnkId(), a: sourceEndpoint, b: targetEndpoint, created: Date.now() };
  LinkStore.add(link);
  return link;
}
