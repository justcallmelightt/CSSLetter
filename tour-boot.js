(() => {
  try {
    const isReader = location.hash.startsWith('#letter=');
    const isAuthReturn = new URLSearchParams(location.search).has('code');
    const isFirstVisit = !localStorage.getItem('cssletter.welcome.v1');
    if (!isReader && !isAuthReturn && isFirstVisit) document.documentElement.classList.add('cssletter-tour-pending');
  } catch {
    document.documentElement.classList.add('cssletter-tour-pending');
  }
})();
