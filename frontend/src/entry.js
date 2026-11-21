import './styles.scss';
import './auth.scss';

const route = window.location.pathname.replace(/\/$/, '') || '/';
if (route === '/workspace') {
  import('./main.js');
} else {
  const signup = route === '/signup';
  document.title = `${signup ? 'Create your account' : 'Coach sign in'} | Falcon Follow-up`;
  document.querySelector('#app').innerHTML = `
    <div class="auth-layout">
      <section class="auth-story" aria-label="Falcon Follow-up">
        <a class="brand auth-brand" href="/login" aria-label="Falcon Follow-up home"><span class="brand-mark">F<span>·</span></span><span>FALCON<small>FOLLOW-UP</small></span></a>
        <div class="auth-story-content">
          <p class="auth-kicker">FOR THE COACH BEHIND THE TEAM</p>
          <h1>Great coaching.<br>Lasting <em>impact.</em></h1>
          <p class="auth-story-intro">Every conversation is a chance to move a player forward. Make sure the next step never gets lost.</p>
          <div class="playbook-art" aria-hidden="true">
            <svg class="court-lines" viewBox="0 0 500 250" fill="none"><rect x="35" y="20" width="430" height="210" rx="5"/><path d="M250 20v210M35 75h70v100H35m430-100h-70v100h70"/><circle cx="250" cy="125" r="44"/><path class="play-path" d="M122 183c50 0 38-101 95-101s59 86 109 61l39-28m-18-4 21 2-8 20"/><circle class="play-player" cx="122" cy="183" r="12"/><path class="play-cross" d="m315 54 15 15m0-15-15 15m-144 90 15 15m0-15-15 15"/></svg>
            <div class="auth-note"><span class="note-check">✓</span><div><span class="note-overline">THE NEXT CONVERSATION STARTS HERE</span><strong>Less lost in the notes.<br>More follow-through.</strong></div></div>
          </div>
          <div class="auth-benefits"><span>Keep the context</span><span>Build a clear plan</span><span>Follow up with purpose</span></div>
        </div>
        <div class="auth-story-footer"><span>BUILT FOR COACHES. CENTERED ON PLAYERS.</span><span>picInfiniti</span></div>
      </section>
      <main class="auth-main">
        <div class="auth-topline"><span>${signup ? 'Already have an account?' : 'New to Falcon Follow-up?'}</span><a href="${signup ? '/login' : '/signup'}">${signup ? 'Sign in' : 'Create an account'}</a></div>
        <div class="auth-form-wrap">
          <div class="auth-form-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z"/><path d="M9 3h6v4H9zM8 12h8m-8 4h5"/></svg></div>
          <p class="auth-kicker">YOUR COACHING WORKSPACE</p>
          <h2>${signup ? 'Start your next chapter.' : 'Welcome back, Coach.'}</h2>
          <p class="auth-description">${signup ? 'A little more clarity. A lot more follow-through.<br>Create a place for every coaching conversation.' : 'Your conversations, your players, your next steps.<br>Pick up where you left off.'}</p>
          <form id="auth-form">
            ${signup ? '<label for="coach-name">Full name</label><input id="coach-name" name="name" autocomplete="name" placeholder="Your name" required maxlength="100">' : ''}
            <label for="coach-email">Email address</label><input id="coach-email" name="email" type="email" autocomplete="email" placeholder="coach@example.com" required maxlength="254">
            ${signup ? '<label for="coach-team">Team or program <span class="auth-optional">(optional)</span></label><input id="coach-team" name="team" autocomplete="organization" placeholder="Your team or program" maxlength="100">' : ''}
            <label for="coach-password">Password</label>
            <div class="auth-password"><input id="coach-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="12"' : ''} placeholder="${signup ? 'Create a password' : 'Enter your password'}" required aria-describedby="password-help"><button id="toggle-password" type="button" aria-controls="coach-password" aria-label="Show password" aria-pressed="false">Show</button></div>
            <p id="password-help" class="auth-input-help">${signup ? 'Use at least 12 characters.' : 'Use your coach account password.'}</p>
            <button class="primary auth-submit" type="submit">${signup ? 'Create coach account' : 'Sign in'}</button>
            <div id="auth-feedback" class="auth-feedback" role="status" hidden></div>
          </form>
          <div class="auth-divider"><span>TAKE A LOOK FIRST</span></div>
          <a class="auth-demo" href="/workspace">Explore the demo workspace</a>
          <p class="auth-demo-caption">Fictional players. Sample meetings. No account needed.</p>
          <p class="auth-preview"><strong>Design preview</strong> · Sign in and signup are not connected yet. No account is created and no password is saved or sent.</p>
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
    const feedback = document.querySelector('#auth-feedback');
    feedback.hidden = false;
    feedback.textContent = signup ? 'Your form is ready for review. Account creation is not available in this design preview. Explore the demo below.' : 'Sign in is not available in this design preview. Explore the demo workspace below.';
    password.value = '';
  });
}
