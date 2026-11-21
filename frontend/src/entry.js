import './styles.scss';
import './auth.scss';
import { isDemoLogin } from './access.js';

const route = window.location.pathname.replace(/\/$/, '') || '/';
if (route === '/workspace') {
  import('./main.js');
} else if (route.startsWith('/pack/')) {
  import('./film.scss');
  import('./pack-page.js').then(m => m.renderPack(document.querySelector('#app'), route.slice(6)));
} else {
  const signup = route === '/signup';
  document.title = `${signup ? 'Create your account' : 'Coach sign in'} | Falcon Follow-up`;
  document.querySelector('#app').innerHTML = `
    <div class="auth-layout ${signup ? 'auth-layout--signup' : ''}">
      <section class="auth-story" aria-label="Falcon Follow-up">
        <a class="brand auth-brand" href="/login" aria-label="Falcon Follow-up home"><span class="brand-mark">F<span>·</span></span><span>FALCON<small>FOLLOW-UP</small></span></a>
        <div class="auth-story-content">
          <p class="auth-kicker">THE FOOTBALL COACH’S NOTEBOOK</p>
          <h1>Every conversation.<br>A little more<br><em>follow-through.</em></h1>
          <p class="auth-story-intro">Keep the notes, the next steps, and the bigger picture together. From the film room to the next practice.</p>
          <div class="auth-notebook" aria-hidden="true">
            <div class="book-spine"><i></i><i></i><i></i><i></i></div>
            <div class="book-topline"><span>FALCON FOLLOW-UP</span><span>FOOTBALL NOTES</span></div>
            <h3>Every play.<br>Clear next steps.</h3>
            <svg class="book-diagram" viewBox="0 0 140 82" fill="none"><rect x="2" y="2" width="136" height="78" rx="4"/><path class="yard-lines" d="M25 2v78M55 2v78M85 2v78M115 2v78M2 41h136"/><circle cx="32" cy="62" r="5"/><circle cx="65" cy="62" r="5"/><path class="route-line" d="M32 56V28h61m-7-6 7 6-7 6M65 56V42"/><path d="m99 48 8 8m0-8-8 8m-55-40 8 8m0-8-8 8"/></svg>
            <div class="book-lines"><span class="book-tag">NEXT STEP</span><p>Review two defensive coverage clips.</p><span class="book-tag praise-tag">WORTH RECOGNIZING</span><p>Clear pre-snap communication.</p></div>
            <div class="book-bottom"><span>Keep the context.</span><span>✓ Follow up with purpose.</span></div>
          </div>
          <div class="auth-benefits"><span>Keep the context</span><span>Build a clear plan</span><span>Follow up with purpose</span></div>
        </div>
        <div class="auth-story-footer"><span>BUILT FOR FOOTBALL. CENTERED ON PLAYERS.</span><span>picInfiniti</span></div>
      </section>
      <main class="auth-main">
        <div class="auth-topline"><span>${signup ? 'Already have an account?' : 'New to Falcon Follow-up?'}</span><a href="${signup ? '/login' : '/signup'}">${signup ? 'Sign in' : 'Create an account'}</a></div>
        <div class="auth-form-wrap">
          <nav class="auth-tabs" aria-label="Coach access"><a href="/login" ${!signup ? 'aria-current="page"' : ''}>Sign in</a><a href="/signup" ${signup ? 'aria-current="page"' : ''}>Create an account</a></nav>
          <div class="auth-form-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z"/><path d="M9 3h6v4H9zM8 12h8m-8 4h5"/></svg></div>
          <p class="auth-kicker">YOUR COACHING WORKSPACE</p>
          <h2>${signup ? 'Start your next chapter.' : 'Welcome back, Coach.'}</h2>
          <p class="auth-description">${signup ? 'A little more clarity. A lot more follow-through.<br>Create a place for every coaching conversation.' : 'Your conversations, your players, your next steps.<br>Pick up where you left off.'}</p>
          <form id="auth-form">
            ${signup ? '<label for="coach-name">Full name</label><input id="coach-name" name="name" autocomplete="name" placeholder="Your name" required maxlength="100">' : ''}
            <label for="coach-email">${signup ? 'Email address' : 'Coach ID or email'}</label><input id="coach-email" name="${signup ? 'email' : 'username'}" type="${signup ? 'email' : 'text'}" autocomplete="${signup ? 'email' : 'username'}" placeholder="${signup ? 'coach@example.com' : 'demo'}" required maxlength="254">
            ${signup ? '<label for="coach-team">Team or program <span class="auth-optional">(optional)</span></label><input id="coach-team" name="team" autocomplete="organization" placeholder="Your team or program" maxlength="100">' : ''}
            <label for="coach-password">Password</label>
            <div class="auth-password"><input id="coach-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="12"' : ''} placeholder="${signup ? 'Create a password' : 'Enter your password'}" required aria-describedby="password-help"><button id="toggle-password" type="button" aria-controls="coach-password" aria-label="Show password" aria-pressed="false">Show</button></div>
            <p id="password-help" class="auth-input-help">${signup ? 'Use at least 12 sample characters for this preview.' : 'Demo access: use demo for both ID and password.'}</p>
            <button class="primary auth-submit" type="submit">${signup ? 'Create coach account' : 'Sign in'}</button>
            <div id="auth-feedback" class="auth-feedback" role="status" hidden></div>
          </form>
          <p class="auth-preview"><strong>Local prototype</strong> · Demo credentials open sample extraction. Account creation is a preview; credentials are never saved or sent. Both modes require the local backend.</p>
        </div>
        <footer class="auth-footer"><span>Falcon Follow-up</span><span>A clearer plan for every player.</span></footer>
      </main>
    </div>`;

  const password = document.querySelector('#coach-password');
  document.querySelector('#toggle-password').addEventListener('click', event => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    event.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  document.querySelector('#auth-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!signup && isDemoLogin(document.querySelector('#coach-email').value, password.value)) {
      password.value = '';
      window.location.assign('/workspace?mode=demo');
      return;
    }
    const feedback = document.querySelector('#auth-feedback');
    feedback.hidden = false;
    feedback.textContent = signup ? 'Your form is ready for review. Account creation is not available in this design preview. Sign in with demo / demo, then choose Live extraction in the workspace.' : 'For Demo, use demo as both the coach ID and password. Other accounts are not connected. After demo login, choose Live extraction in the workspace.';
    password.value = '';
  });
}
