(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  // Readers receive the letter directly, without onboarding or authentication requests.
  if (location.hash.startsWith('#letter=')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tour = byId('studioWelcome');
  const begin = byId('welcomeBegin');
  const STEP_DURATION = 2600;
  const steps = [
    ['.template-list', '마음에 맞는 종이를 골라요.', '편지지를 고르면 오른쪽 편지에 바로 반영됩니다. 직접 스타일링에서 색과 글자도 다듬을 수 있어요.'],
    ['#letterPaper', '이제, 당신의 말을 담아요.', '받는 사람과 제목, 본문을 채워보세요. 작성 중인 편지는 이 브라우저에 자동 저장됩니다.'],
    ['#togglePreview', '전하기 전에 한 번 더.', '미리보기에서 받는 사람이 읽을 편지를 확인하세요.'],
    ['#createLinkTop', '하나의 링크로 전하세요.', '읽기 링크 만들기로 완성한 편지를 공유하세요. 링크를 가진 사람은 누구나 읽을 수 있어요.']
  ];
  let index = 0, timer, frame, savedScroll = 0, previousFocus, paused = false, remaining = STEP_DURATION, started = 0;
  let finishing = false;
  const timers = new Set();
  const later = (fn, delay) => { const id = setTimeout(() => { timers.delete(id); fn(); }, delay); timers.add(id); return id; };
  function targetForStep() {
    const target = document.querySelector(steps[index][0]);
    return index === 3 && !target.getClientRects().length ? byId('createLinkMobile') : target;
  }
  function track() {
    if (!tour.open || tour.classList.contains('finale')) return;
    const target = targetForStep();
    const r = target.getBoundingClientRect();
    const bottomLimit = tour.querySelector('.welcome-caption').getBoundingClientRect().top - 24;
    const left = Math.max(8, r.left - 8), top = Math.max(12, r.top - 8);
    Object.assign(byId('welcomeSpot').style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, Math.min(innerWidth - left - 8, r.right + 8 - left))}px`, height: `${Math.max(0, Math.min(r.bottom + 8, bottomLimit) - top)}px` });
    frame = requestAnimationFrame(track);
  }
  function schedule() { clearTimeout(timer); if (!paused) { started = performance.now(); timer = setTimeout(next, remaining); } }
  function animateStepCopy() {
    const keyframes = reduced.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(7px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }];
    [byId('welcomeTitle'), byId('welcomeDescription')].forEach((element, order) => {
      element.getAnimations?.().forEach(animation => animation.cancel());
      element.animate?.(keyframes, { duration: reduced.matches ? 150 : 280, delay: reduced.matches ? 0 : order * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }
  function scene(i) {
    index = i; remaining = STEP_DURATION;
    tour.style.setProperty('--welcome-duration', `${STEP_DURATION}ms`);
    tour.classList.remove('is-playing');
    void tour.offsetWidth;
    tour.classList.add('is-playing');
    byId('welcomeStep').textContent = `${i + 1} / ${steps.length}`;
    byId('welcomeTitle').textContent = steps[i][1];
    byId('welcomeDescription').textContent = steps[i][2];
    animateStepCopy();
    byId('welcomePrevious').disabled = i === 0;
    const target = targetForStep();
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy({ top: -60, behavior: 'instant' });
    schedule();
  }
  function next() {
    if (index < steps.length - 1) scene(index + 1);
    else { clearTimeout(timer); cancelAnimationFrame(frame); tour.classList.add('finale'); begin.hidden = false; begin.focus(); }
  }
  function close() {
    clearTimeout(timer); cancelAnimationFrame(frame); timers.forEach(clearTimeout); timers.clear();
    tour.close(); document.body.classList.remove('tour-active');
    window.scrollTo({ top: savedScroll, behavior: 'instant' });
    previousFocus?.focus({ preventScroll: true });
  }
  function open() {
    if (tour.open || byId('studioAccount').open) return;
    try { localStorage.setItem('cssletter.welcome.v1', 'seen'); } catch {}
    previousFocus = document.activeElement; savedScroll = scrollY; paused = false; finishing = false;
    tour.className = 'studio-welcome'; begin.hidden = true;
    byId('welcomePause').textContent = '일시정지'; byId('welcomePause').setAttribute('aria-pressed', 'false');
    tour.showModal(); document.body.classList.add('tour-active'); scene(0); track();
    document.documentElement.classList.remove('cssletter-tour-pending');
    byId('welcomeNext').focus();
  }
  const toolsOpen = byId('toolsOpen');
  const toolsPanel = byId('toolsPanel');
  function closeTools({ restoreFocus = false } = {}) {
    if (toolsPanel.hidden) return;
    toolsPanel.hidden = true;
    toolsOpen.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toolsOpen.focus();
  }
  toolsOpen.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = toolsPanel.hidden;
    toolsPanel.hidden = !willOpen;
    toolsOpen.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) byId('welcomeReplay').focus();
  });
  byId('welcomeReplay').addEventListener('click', () => { closeTools(); open(); });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.tools-menu')) closeTools(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !toolsPanel.hidden) { event.preventDefault(); closeTools({ restoreFocus: true }); } });
  byId('welcomeNext').addEventListener('click', next);
  byId('welcomePrevious').addEventListener('click', () => { if (index > 0) scene(index - 1); });
  byId('welcomeSkip').addEventListener('click', close);
  tour.addEventListener('cancel', event => { event.preventDefault(); close(); });
  byId('welcomePause').addEventListener('click', () => {
    paused = !paused;
    tour.classList.toggle('is-paused', paused);
    if (paused) { remaining = Math.max(100, remaining - (performance.now() - started)); clearTimeout(timer); } else schedule();
    byId('welcomePause').textContent = paused ? '계속 재생' : '일시정지'; byId('welcomePause').setAttribute('aria-pressed', String(paused));
  });
  begin.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') tour.classList.add('light'); });
  begin.addEventListener('pointerleave', () => { if (!finishing) tour.classList.remove('light'); });
  begin.addEventListener('click', () => {
    if (finishing) return; finishing = true; tour.classList.add('light', 'leaving');
    const editor = byId('editorApp');
    const editorFrames = reduced.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(12px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }];
    Object.assign(editor.style, reduced.matches ? { opacity: '0' } : { opacity: '0', transform: 'translateY(12px)', filter: 'blur(6px)' });
    later(() => tour.classList.add('reveal'), reduced.matches ? 150 : 600);
    later(() => {
      editor.animate?.(editorFrames, { duration: reduced.matches ? 150 : 900, easing: 'cubic-bezier(.16,1,.3,1)' });
      editor.style.removeProperty('opacity'); editor.style.removeProperty('transform'); editor.style.removeProperty('filter');
      close(); window.scrollTo({ top: 0, behavior: 'instant' });
    }, reduced.matches ? 300 : 1500);
  });
  for (const dialog of [tour, byId('studioAccount')]) dialog.addEventListener('keydown', event => event.stopPropagation());
  let first = true;
  try { first = !localStorage.getItem('cssletter.welcome.v1'); } catch {}
  // OAuth returns go directly back to the editor, never through the tutorial.
  if (first && !new URLSearchParams(location.search).has('code')) later(open, 0);
  else document.documentElement.classList.remove('cssletter-tour-pending');

  const account = byId('studioAccount');
  const status = byId('accountStatus');
  const showError = error => {
    status.textContent = error?.status === 429 ? '요청이 많아요. 잠시 후 다시 시도해 주세요.' : '로그인하지 못했어요. 이메일·비밀번호 또는 네트워크 연결을 확인해 주세요.';
  };
  const client = window.supabase?.createClient('https://rfvgrpnchibvprabirjh.supabase.co', 'sb_publishable_QYn9-kCwNx1ojBuFvfO4gg_2IPmaQSh', {
    auth: { storageKey: 'cssletter.lightframe.session.v1', flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  function render(user) {
    byId('accountForm').hidden = Boolean(user); byId('accountProfile').hidden = !user;
    byId('accountOpen').querySelector('span').textContent = user ? '내 계정' : '로그인';
    byId('accountIdentity').textContent = user?.email || '';
  }
  byId('accountOpen').addEventListener('click', () => { account.showModal(); });
  byId('accountClose').addEventListener('click', () => account.close());
  account.addEventListener('close', () => byId('accountPassword').value = '');
  async function busy(action) {
    if (!client) { status.textContent = '계정 연결 모듈을 불러오지 못했어요. 새로고침해 주세요.'; return; }
    const controls = account.querySelectorAll('button:not(#accountClose)');
    controls.forEach(button => button.disabled = true); status.textContent = '연결 중…';
    try { await action(); } catch (error) { showError(error); }
    finally { controls.forEach(button => button.disabled = false); byId('accountPassword').value = ''; }
  }
  byId('accountForm').addEventListener('submit', event => {
    event.preventDefault();
    busy(async () => {
      const { data, error } = await client.auth.signInWithPassword({ email: byId('accountEmail').value.trim(), password: byId('accountPassword').value });
      if (error) throw error;
      render(data.user); status.textContent = 'Lightframe. 계정으로 로그인했어요.';
    });
  });
  byId('accountGoogle').addEventListener('click', () => busy(async () => {
    if (!/^https?:$/.test(location.protocol)) { status.textContent = 'Google 로그인은 웹 주소로 접속한 뒤 이용해 주세요.'; return; }
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }));
  byId('accountSignOut').addEventListener('click', () => busy(async () => {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    render(null); status.textContent = '이 기기에서 로그아웃했어요. 작성 중인 편지는 유지됩니다.';
  }));
  if (client) {
    client.auth.onAuthStateChange((_event, session) => render(session?.user));
    client.auth.getUser().then(({ data }) => render(data?.user)).catch(() => render(null));
  }
})();
