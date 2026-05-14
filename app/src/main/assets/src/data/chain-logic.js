function getBoundaryConfig(volKey, entry) {
  const sourceCol = COL_BY_KEY.get(volKey);
  if (!sourceCol) return { prevBoundary: null, onPrevBoundary: null, nextBoundary: null, onNextBoundary: null };
  const hasPrev = !!(entry && (entry.prevLetter || entry.prevEntry));
  const hasNext = !!(entry && (entry.nextLetter || entry.nextEntry));
  const idx = READING_CHAIN.indexOf(volKey);
  let prevBoundary = null, onPrevBoundary = null, nextBoundary = null, onNextBoundary = null;

  if (!hasPrev) {
    if (volKey === 'one') {
      prevBoundary = { short: "Revelation", title: `Revelation \xB7 Chapter ${BOOKS.revelation.chapters[BOOKS.revelation.chapters.length - 1].num}` };
      onPrevBoundary = goToRevelationLast;
    } else if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        const pCol = COL_BY_KEY.get(READING_CHAIN[i]);
        const pArr = colLetterArr(pCol);
        if (pArr.length === 0) continue;
        prevBoundary = { short: _boundaryShort(sourceCol, pCol), title: pArr[pArr.length - 1].title || pCol.short };
        onPrevBoundary = _goLast[pCol.volKey];
        break;
      }
    }
  }

  if (!hasNext) {
    if (volKey === 'holydays') {
      nextBoundary = { short: "A Return to the Garden", title: "A Return to the Garden" };
      onNextBoundary = goToGardenFirst;
    } else if (idx >= 0 && idx < READING_CHAIN.length - 1) {
      for (let i = idx + 1; i < READING_CHAIN.length; i++) {
        const nCol = COL_BY_KEY.get(READING_CHAIN[i]);
        const nArr = colLetterArr(nCol);
        if (nArr.length === 0) continue;
        const pref = colPreface(nCol);
        nextBoundary = { short: _boundaryShort(sourceCol, nCol), title: (pref ? pref.title : nArr[0].title) || nCol.short };
        onNextBoundary = _goFirst[nCol.volKey];
        break;
      }
    }
  }
  return { prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary };
}
