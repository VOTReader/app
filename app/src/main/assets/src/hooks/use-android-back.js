function useAndroidBack(tabsOverviewOpenRef, setTabsOverviewOpen, cancelDwell, screenRef, fromLetterRef, setFromLetterStack, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId, setScreen, goNavOrigin, goHome, goSearchOrigin, goScripturesHome, goStudiesHome, fromSearchRef, fromStudiesRef, fromWtlbRef, bookIdRef, genreIdRef) {
  React.useEffect(() => {
    window.handleAndroidBack = () => {
      if (window.__closeSheet) {window.__closeSheet();window.__closeSheet = null;return "true";}
      if (tabsOverviewOpenRef.current) {
        setTabsOverviewOpen(false);
        return "true";
      }
      cancelDwell();
      const s = screenRef.current;
      const stack = fromLetterRef.current;
      if (LETTER_SCREEN_SET.has(s) && stack && stack.length > 0) {
        const fl = stack[stack.length - 1];
        setFromLetterStack((prev) => prev.slice(0, -1));
        window.__pendingHighlight = null;
        if (fl.sourceBookId !== undefined) setBookId(fl.sourceBookId);
        if (fl.sourceChapterNum !== undefined) setChapterNum(fl.sourceChapterNum);
        if (fl.sourceLetterId !== undefined) setLetterId(fl.sourceLetterId);
        if (fl.sourceStudyId !== undefined) setStudyId(fl.sourceStudyId);
        if (fl.sourceStudyChapterId !== undefined) setStudyChapterId(fl.sourceStudyChapterId);
        setScreen(fl.sourceScreen);
        return "true";
      }
      if (s === "settings") {goNavOrigin();return "true";} else
      if (s === "history") {goNavOrigin();return "true";} else
      if (s === "about") {try{localStorage.setItem('vot-about-seen','1');}catch(e){}goNavOrigin();return "true";} else
      if (s === "notes-index") {setScreen("library");return "true";} else
      if (s === "library") {goHome();return "true";} else
      if (s === "search") {goSearchOrigin();return "true";} else
      if (s === "scripture-genre") {goScripturesHome();return "true";} else
      if (s === "scriptures-home") {goHome();return "true";} else
      if (s === "volumes-home") {goHome();return "true";} else
      if (s === "matthew-ch") {if (fromSearchRef.current) {setFromSearch(false);setScreen("search");} else {setChapterNum(null);setScreen("matthew-idx");}return "true";} else
      if (s === "matthew-idx") {if (fromStudiesRef.current) {setFromStudies(false);goStudiesHome();} else {goHome();}return "true";} else
      if (s === "studies-home") {goHome();return "true";} else
      if (s === "bible-study-index") {goStudiesHome();return "true";} else
      if (s === "bible-study-chapter") {if (fromSearchRef.current) {setFromSearch(false);setScreen("search");return "true";}const cur = getStudyById(studyIdRef.current);if (cur && cur.chapters && cur.chapters.length > 1) {setStudyChapterId(null);setScreen("bible-study-index");} else {goStudiesHome();}return "true";} else
      if (s === "bible-ch") {if (fromWtlbRef.current) {const ret = fromWtlbRef.current;setFromWtlb(null);setScreen(ret);return "true";}if (fromSearchRef.current) {setFromSearch(false);setScreen("search");} else {const bid = bookIdRef.current;if (bid && BOOKS[bid]?.chapters.length === 1) {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}} else {setChapterNum(null);setScreen("bible-idx");}}return "true";} else
      if (s === "bible-idx") {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}return "true";} else
      { const col = COL_BY_LETTER_SC.get(s);
      if (col) {
        if (fromMatthewChRef.current) {setFromMatthewCh(null);setScreen("matthew-ch");} else
        if (fromSearchRef.current) {setFromSearch(false);setScreen("search");} else
        if (fromStudiesRef.current) {setFromStudies(false);goStudiesHome();} else
        if (fromWtlbRef.current) {const ret = fromWtlbRef.current;setFromWtlb(null);setScreen(ret);} else
        goColIdx(col.volKey);
        return "true";
      }
      const icol = COL_BY_INDEX_SC.get(s);
      if (icol) {goVolumesHome();return "true";}}
      return "false";
    };
    return () => {window.handleAndroidBack = null;};
  }, [cancelDwell, goNavOrigin, goHome, goSearchOrigin, goScripturesHome, goStudiesHome]);
}
