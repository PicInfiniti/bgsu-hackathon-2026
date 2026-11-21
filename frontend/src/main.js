import './styles.scss';
import './workspace.scss';
import demo from '../../data/demo.json';
import { workspaceMode } from './access.js';
import { loadSharedNotebook } from './shared-notebook.js';
import { formatBrief } from './brief-format.js';
import { summarizePlayers, filterPlayers } from './player-directory.js';
import { checkInRecency, checkInMarkup } from './check-in-recency.js';
import categories from '../../data/categories.json';
import { appliesTo, reviewIssues, reviewPriority, highlightSource } from './review-state.js';
import { meetingTypeForAttendees } from './meeting-input.js';
import { activityForDate, calendarGrid, calendarMeetings, playerCalendarMeetings } from './calendar-activity.js';
import { upcomingActions } from './upcoming.js';
import { filterActions } from './action-board.js';
import { assistantAnswerMarkup } from './assistant-view.js';
import { groupRecords, meetingTypeLabel, meetingReviewFrame, meetingDisplayTitle } from './shared-groups.js';
import { actionRows } from './action-board-view.js';
import { noteOnlyReview } from './note-only.js';
import { playerMeetingHistory } from './timeline-view.js';
import { filterMeetings, meetingListMarkup, meetingDetailMarkup, meetingCalendarSource } from './meeting-library.js';

const $ = (s) => document.querySelector(s);
const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (x) => structuredClone(x);
let meetings = [];
let selectedMeetingId = null, meetingLibrarySensitive = false;
let mode = workspaceMode(window.location.search), view = 'desk', draft = [], origin = 'demo', selectedPlayer = 'p01', busy = false, connected = false, prepSource = null;
let current = clone(demo.samples[0]);
let playerDetailOpen = false, playerUnitFilter = 'all';
let extractionId = null, extractionWarnings = [], highlightedDraft = 0, reviewingNoteOnly = false;
let statusTimer = null;
let assistantResult = null, assistantPending = false, assistantRevision = 0, assistantActionCategory = '', assistantScope = 'individual';
const player = (id) => demo.players.find(p => p.id === id);
const name = (id) => player(id)?.name ?? 'Unknown player';
const positionLabel = (p) => p.position_label ? `${p.position} · ${p.position_label}` : p.position;
const today = () => new Date().toLocaleDateString('en-CA');
let meetingCalendarMonth = today().slice(0,7), meetingCalendarDate = null;
let playerCalendarMonth = today().slice(0,7), playerCalendarDate = today();
const overdue = (x) => x.kind === 'action' && !x.completed && x.due_date && x.due_date < today();
const items = () => meetings.flatMap(m => m.items.map(i => ({...i, meeting:m})));


const icon = (name) => {
  const paths = {
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h6"/>',
    team: '<circle cx="12" cy="7" r="3"/><path d="M7 21v-3a5 5 0 0 1 10 0v3M4 6a3 3 0 0 0 0 6M20 6a3 3 0 0 1 0 6M2 20v-3a4 4 0 0 1 3-4M22 20v-3a4 4 0 0 0-3-4"/>',
    football: '<path d="M2 12C6.5 3 17.5 3 22 12c-4.5 9-15.5 9-20 0Z" fill="currentColor" fill-opacity=".08"/><path d="M6 6.9a11 11 0 0 1 0 10.2M18 6.9a11 11 0 0 0 0 10.2"/><path d="M9 12h6m-5-1.6v3.2m2-3.2v3.2m2-3.2v3.2" stroke-width="1.4"/>',
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    note: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h4M3 7h4M3 12h4M3 17h4"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    user: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.note}</svg>`;
};
document.querySelector('#app').classList.add('workspace-app');
document.querySelector('#app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="/workspace"><span class="brand-mark">F<span>·</span></span><span>Falcon<small>Follow-up</small></span></a>
    <div class="workspace-label">THE FOOTBALL NOTEBOOK</div>
    <nav aria-label="Main navigation">
      <button data-view="desk" class="active">${icon('home')} Overview</button>
      <button data-view="meeting-library">${icon('note')} Meetings</button>
      <button data-view="players">${icon('people')} Players</button>
      <button data-view="tasks">${icon('check')} Actions <b id="nav-count"></b></button>
      <button data-view="assistant">${icon('chat')} AI Assistant</button>
    </nav>
    <div class="sidebar-note">From the film room<br>to the next practice.<span>Make the follow-up count.</span></div>
    <div class="sidebar-bottom"><span class="team-avatar">pi</span><div>picInfiniti<small>Football Meeting Tracker</small></div></div>
  </aside>
  <div class="shell">
    <header class="topbar"><div><h1>Your football workspace</h1><p>A place for every conversation. A plan for what comes next.</p></div><div class="header-actions"><button class="primary" id="new-meeting">${icon('plus')} New meeting</button><a class="profile-link" href="/login" aria-label="Open coach sign-in preview">${icon('user')}</a></div></header>
    <div id="status-toast" class="status-toast" role="status" aria-live="polite" hidden><span id="status-toast-text"></span><button class="icon-button" id="close-status-toast" aria-label="Dismiss notification">×</button></div>
    <main>
      <div class="workspace-toolbar"><span class="workspace-date">${icon('football')} Football · Your coaching notebook</span><label class="mode-control">Mode <select id="mode"><option value="demo">Demo · prepared samples</option><option value="live">Live · Aivana</option></select></label></div>
      <div id="message" role="status" aria-live="polite" hidden></div>
      <section id="desk" class="view">
        <div class="overview-lead"><div><p class="eyebrow">THE COACH'S DASHBOARD</p><h2>A clear view of your team.</h2><p>Conversations captured. Next steps ready.</p></div><button class="secondary" data-view="meetings">${icon('note')} Open meeting notebook</button></div>
            <section class="stats" aria-label="Workspace summary"><a href="#meeting-library" data-stat="meetings"><strong id="meeting-count">0</strong><span>Saved meetings</span><small>Reviewed conversations</small></a><a href="#tasks" data-stat="open"><strong id="open-count">0</strong><span>Open actions</span><small>Ready to follow up</small></a><a href="#tasks" data-stat="overdue" class="urgent"><strong id="overdue-count">0</strong><span>Needs follow-up</span><small id="clock-note"></small></a><a href="#players" data-stat="players"><strong id="players-count">0</strong><span>Players reached</span><small>Of ${demo.players.length} fictional players</small></a></section>
        <div class="overview-grid"><div class="overview-main">
          <div class="panel overview-conversation-hub">
            <section class="upcoming-panel"><div class="section-heading"><h2>Upcoming</h2>${icon('calendar')}</div><p class="upcoming-caption">Open actions due today or later</p><div id="upcoming-list"></div><button class="rail-link" data-stat="open">View all open actions</button></section>
          <section class="overview-conversations"><div id="recent-heading" class="section-heading"><div><p class="eyebrow">THE RUNNING RECORD</p><h2>Recent conversations</h2><span id="overview-recent-count" class="recent-count"></span></div><button class="rail-link" data-view="meetings">Write a note</button></div><div id="recent" class="recent-list"></div></section>
          </div>
          <section class="panel overview-checkins"><div class="section-heading"><div><p class="eyebrow">KEEP THE CONNECTION</p><h2>Players to check in with</h2></div>${icon('people')}</div><div class="checkin-controls"><label>Look back<select id="checkin-window"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label><label>Count meetings<select id="checkin-type"><option value="individual">Individual</option><option value="">Any meeting type</option><option value="group">Group</option><option value="team">Team</option></select></label></div><div id="overview-checkins"></div><button class="rail-link" data-view="players">Browse the football roster</button></section>
          <section class="panel overview-types"><div class="section-heading"><h2>Your conversations</h2><span class="muted">All saved meetings</span></div><div id="overview-meeting-types"></div></section>
        </div><aside class="overview-aside">

            <section class="calendar-panel panel"><div class="calendar-heading"><h2 id="calendar-title"></h2><div><button class="icon-button" id="calendar-prev" aria-label="Previous month">${icon('chevron')}</button><button class="icon-button" id="calendar-next" aria-label="Next month">${icon('chevron')}</button></div></div><p class="calendar-caption">Saved conversations & action deadlines</p><div class="calendar-grid" id="calendar"></div><div class="calendar-key"><span class="meeting-individual">Individual</span><span class="meeting-group">Group</span><span class="meeting-team">Team</span><span class="action-due-key">Action due</span></div><div id="calendar-activities" class="calendar-activities" aria-live="polite" hidden></div></section>

            <section class="followup-panel panel"><div class="section-heading"><h2>Needs follow-up</h2>${icon('check')}</div><div id="radar-list"></div><button class="rail-link" data-stat="overdue">Review overdue actions</button></section>
        </aside></div>
      </section>
      <section id="meeting-library" class="view" hidden>
        <div id="meeting-library-list"><div class="section-heading library-heading"><div><p class="eyebrow">EVERY CONVERSATION, TOGETHER</p><h2 id="meetings-title" tabindex="-1">Meetings</h2><p>Individual check-ins, group conversations, and team meetings.</p></div><button class="secondary" type="button" data-new-meeting>${icon('plus')} Create meeting</button></div>
          <div class="library-layout"><div class="library-main"><div class="library-periods" role="group" aria-label="Meeting dates"><button type="button" data-meeting-period="all" aria-pressed="true">All meetings <span id="library-all-count"></span></button><button type="button" data-meeting-period="upcoming" aria-pressed="false">Today & future <span id="library-upcoming-count"></span></button><button type="button" data-meeting-period="past" aria-pressed="false">Past <span id="library-past-count"></span></button></div>
          <input id="meeting-period" type="hidden" value="all"><div class="panel library-filters"><label class="library-search">Search meetings<input id="meeting-search" type="search" placeholder="Title, attendee, or words from a note…"></label><label>Meeting type<select id="meeting-type-filter"><option value="">All types</option><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label><label>Attendee<select id="meeting-player-filter"><option value="">All players</option>${demo.players.map(p => `<option value="${p.id}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label><label>From<input id="meeting-start" type="date"></label><label>Through<input id="meeting-end" type="date"></label><label>Sort<select id="meeting-sort"><option value="recent">Newest date</option><option value="oldest">Oldest date</option><option value="title">Meeting title</option></select></label></div>
          <div class="library-selected-day" id="meeting-selected-day" hidden><span id="meeting-selected-date"></span><button class="rail-link" id="meeting-clear-date" type="button">Clear date</button></div><div class="library-results"><p id="meeting-results" role="status"></p><button id="meeting-reset" class="rail-link" type="button">Reset filters</button></div><p class="library-date-note">Dates belong to saved meetings. Future dates appear here and on the calendar; no invitations or reminders are sent.</p><div id="meeting-list" class="library-meeting-list"></div></div>
          <aside class="library-calendar-rail"><section class="calendar-panel panel"><div class="calendar-heading"><h3 id="meeting-calendar-title"></h3><div><button class="icon-button" id="meeting-calendar-prev" aria-label="Previous meetings calendar month">${icon('chevron')}</button><button class="icon-button" id="meeting-calendar-next" aria-label="Next meetings calendar month">${icon('chevron')}</button></div></div><p class="calendar-caption">Meeting dates & action deadlines</p><div class="calendar-grid" id="meeting-calendar"></div><div class="calendar-key"><span class="meeting-individual">Individual</span><span class="meeting-group">Group</span><span class="meeting-team">Team</span><span class="action-due-key">Action due</span></div><div id="meeting-calendar-activities" class="calendar-activities" aria-live="polite"></div></section></aside>
          </div>
        </div>
        <div id="meeting-library-detail" hidden><div class="library-detail-toolbar"><button id="meeting-back" class="secondary" type="button">← Back to meetings</button><label class="sensitive-toggle"><input id="meeting-show-sensitive" type="checkbox"> Show sensitive records</label></div><div id="meeting-detail"></div></div>
      </section>
      <section id="meetings" class="view" hidden><div class="section-heading meeting-page-heading"><div><p class="eyebrow">CAPTURE & CLARIFY</p><h2>Create meeting</h2><p>Choose a date and attendees. Save the agenda or notes, and optionally extract feedback and tasks.</p></div><button class="secondary" data-view="meeting-library" type="button">← All meetings</button></div><div class="meeting-workspace"><div class="meeting-notebook"><div class="meeting-sheet-heading">${icon('note')} The conversation</div><div class="notebook-caption">${icon('people')} Original notes stay attached to every approved record.</div>
            <form id="meeting-form" class="panel note-panel">
              <label class="title-label"><span>Meeting title</span><input id="title" maxlength="160" placeholder="Give this conversation a title" required></label>
              <div class="form-row meeting-meta"><label>Date<input id="date" type="date" required></label><label>Meeting type<select id="meeting-type"><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label></div>
              <label class="sample-control">Start with a sample<select id="sample">${demo.samples.map(s => `<option value="${s.id}">${escape(meetingDisplayTitle(s.label))}</option>`).join('')}</select></label>
              <details class="attendee-picker"><summary id="attendee-summary">Meeting attendees</summary><fieldset><legend class="sr-only">Attendees</legend><div id="attendees" class="attendees"></div></fieldset></details>
              <label class="note-label">The conversation<textarea id="note" rows="8" maxlength="12000" placeholder="What will you discuss, or what did you discuss? Add an agenda or meeting notes. Include specific feedback and deadlines if you want to extract records…" required></textarea></label>
              <details class="writing-help"><summary>Tips for a useful meeting note</summary><p>Synthetic notes only. Record what the coach said; avoid assumptions about character or attitude. For long team notes, extract short sections with a few assignments each. Keep the date, attendees, and attribution context; review and save each section separately. Shorten truncated extractions before retrying.</p></details>
              <div class="editor-footer"><span>${icon('note')} Save your meeting with or without extracted records.</span><div class="editor-submit-actions"><button class="secondary" id="extract" type="button">Extract sample records</button><button class="primary" id="review-meeting" type="submit">Review meeting</button></div></div>
            </form>
        </div>
            <section id="review-panel" class="panel review-panel"><div class="panel-heading">${icon('check')}<div><h3>A second look, before you save.</h3><p>Check the player, the meaning, and the next step.</p></div></div><div id="review"></div></section>
        </div></section>
      <section id="players" class="view" hidden>
        <div id="player-directory">
          <div class="section-heading directory-heading"><div><p class="eyebrow">THE FOOTBALL ROSTER</p><h2 id="players-title" tabindex="-1">Players</h2><p>${demo.players.length} players · Synthetic football roster</p></div></div>
          <div class="player-filters"><label class="player-search">${icon('people')}<span class="sr-only">Search players or jersey numbers</span><input id="player-search" type="search" placeholder="Search players or jersey numbers" autocomplete="off"></label><label><span class="sr-only">Position group</span><select id="player-group"><option value="all">All position groups</option>${[...new Set(demo.players.map(p => p.position_group))].sort().map(g => `<option value="${escape(g)}">${escape(g)}</option>`).join('')}</select></label><label><span class="sr-only">Position</span><select id="player-position"><option value="all">All positions</option>${[...new Map(demo.players.map(p => [p.position, p.position_label || p.position]))].sort((a,b) => a[1].localeCompare(b[1])).map(([code,label]) => `<option value="${escape(code)}">${escape(code)} · ${escape(label)}</option>`).join('')}</select></label></div>
          <div class="directory-layout"><div class="roster-table-area"><div class="unit-tabs" aria-label="Filter roster by team unit" id="player-unit-tabs"></div><div class="roster-table-wrap"><table class="roster-table"><caption class="sr-only">Football players, meetings attended, and open actions. Select a player for a snapshot or open their timeline.</caption><thead><tr><th scope="col">Player</th><th scope="col">#</th><th scope="col">Position</th><th scope="col">Unit</th><th scope="col">Meetings</th><th scope="col">Open actions</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody id="roster"></tbody></table></div><p id="player-results" class="directory-results" role="status"></p></div>
            <aside class="player-summary-rail"><section class="player-snapshot panel"><h3>Player snapshot</h3><div id="player-snapshot"></div></section><section class="unit-summary panel"><h3>Team units</h3><dl id="player-unit-summary"></dl></section></aside>
          </div>
        </div>
        <div id="player-detail" hidden><button class="secondary back-to-roster" id="back-to-roster">← Back to players</button><div id="player-heading" class="player-history-profile"></div><div class="player-history-layout"><div class="player-history-main"><div id="player-history-stats" class="player-history-stats"></div><div class="player-history-toolbar"><h3>Conversation history</h3><label class="sensitive-toggle"><input id="show-sensitive" type="checkbox"> Show sensitive records</label></div><div id="timeline"></div><section class="prep-box panel"><p class="eyebrow">BEFORE THE NEXT CHECK-IN</p><h3>Prepare for your next conversation</h3><p>A brief from this player's approved, non-sensitive records.</p><button id="prep" class="secondary">Build preparation brief</button><div id="prep-text" class="prep-content" aria-live="polite"></div></section></div><aside class="player-calendar-rail"><section class="calendar-panel panel"><p class="eyebrow">THIS PLAYER'S NOTEBOOK</p><div class="calendar-heading"><h3 id="player-calendar-title"></h3><div><button class="icon-button" id="player-calendar-prev" aria-label="Previous player calendar month">${icon('chevron')}</button><button class="icon-button" id="player-calendar-next" aria-label="Next player calendar month">${icon('chevron')}</button></div></div><label class="action-calendar-filter"><span class="sr-only">Player calendar meeting type</span><select id="player-calendar-type"><option value="">All meeting types</option><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label><div id="player-calendar" class="calendar-grid"></div><div class="calendar-key"><span class="meeting-individual">Individual</span><span class="meeting-group">Group</span><span class="meeting-team">Team</span><span class="action-due-key">Action due</span></div><div id="player-calendar-activities" class="calendar-activities" aria-live="polite"></div></section></aside></div></div>

      </section>
      <section id="tasks" class="view" hidden>
        <div class="section-heading action-heading"><div><p class="eyebrow">KEEP THE NEXT STEP IN SIGHT</p><h2>Follow-ups</h2><p class="action-caption">Find the meeting. Check the task. Keep the conversation moving.</p></div><button class="secondary assistant-action-entry" id="ask-actions" type="button">${icon('chat')} Ask assistant</button></div>
        <div class="action-followup-layout"><div class="action-followup-main">
        <select id="task-filter" hidden aria-label="Action status"><option value="open">Open actions</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All actions</option></select>
        <div class="action-status-tabs" aria-label="Filter assignment status"><button type="button" data-action-status="open">Open</button><button type="button" data-action-status="overdue">Overdue</button><button type="button" data-action-status="done">Completed</button><button type="button" data-action-status="all">All</button></div>
        <div class="action-tools"><label class="action-quick-search"><span class="sr-only">Search assignments</span><input id="task-search" type="search" placeholder="Search assignments or players…"></label><label><span class="sr-only">Filter by player</span><select id="task-player"><option value="">All players</option>${demo.players.map(p => `<option value="${escape(p.id)}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label><details class="action-more-filters"><summary>More filters</summary><div><label>Category<select id="task-category"><option value="">All categories</option></select></label><label>Sort meetings by<select id="task-sort"><option value="due">Next deadline</option><option value="player">Player name</option><option value="recent">Newest meeting</option></select></label></div></details></div>
        <div class="action-results-bar"><p id="task-results" role="status"></p><button id="reset-task-filters" class="rail-link" type="button">Reset filters</button></div><div id="task-list" class="action-meeting-grid"></div>
        <label class="sensitive-toggle"><input id="show-sensitive-actions" type="checkbox" aria-describedby="task-hidden-note"> Show sensitive actions only <span id="sensitive-action-count"></span></label><p id="task-hidden-note" class="sensitive-notice" role="status" hidden></p>
        </div><aside class="action-calendar-rail"><section class="calendar-panel panel"><div class="calendar-heading"><h3 id="action-calendar-title"></h3><div><button class="icon-button" id="action-calendar-prev" aria-label="Previous action calendar month">${icon('chevron')}</button><button class="icon-button" id="action-calendar-next" aria-label="Next action calendar month">${icon('chevron')}</button></div></div><p class="calendar-caption">Meetings & action deadlines</p><label class="action-calendar-filter"><span class="sr-only">Calendar meeting type</span><select id="action-calendar-type"><option value="">All meeting types</option><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label><div id="action-calendar" class="calendar-grid"></div><div class="calendar-key"><span class="meeting-individual">Individual</span><span class="meeting-group">Group</span><span class="meeting-team">Team</span><span class="action-due-key">Action due</span></div><div id="action-calendar-activities" class="calendar-activities" aria-live="polite"></div></section></aside></div>
      </section>
      <section id="assistant" class="view" hidden>
        <div class="section-heading assistant-heading"><div><p class="eyebrow">BEFORE THE NEXT CONVERSATION</p><h2 id="assistant-title" tabindex="-1">AI Assistant</h2><p>Bring the right records into your next conversation. Ask about one player, a group, or your team.</p></div><span class="assistant-scope">${icon('chat')} Your approved notebook</span></div>
        <div class="assistant-scope-picker" role="group" aria-label="Who is this conversation about?">
          <button type="button" data-assistant-scope="individual" aria-pressed="true">${icon('user')}<span><strong>Individual</strong><small>One player’s history</small></span></button>
          <button type="button" data-assistant-scope="group" aria-pressed="false">${icon('people')}<span><strong>Group</strong><small>Select players together</small></span></button>
          <button type="button" data-assistant-scope="team" aria-pressed="false">${icon('team')}<span><strong>Team</strong><small>The whole roster</small></span></button>
        </div>
        <p id="assistant-selection-summary" class="assistant-selection-summary" role="status">Choose a player to begin.</p>
        <div class="assistant-layout">
          <aside class="panel assistant-context"><h3>Conversation context</h3><label id="assistant-individual-context">Player<select id="assistant-player"><option value="">Choose a player…</option>${demo.players.map(p => `<option value="${p.id}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label>
            <div id="assistant-group-context" hidden><label>Start with a position group<select id="assistant-position-group"><option value="">Choose a group…</option>${[...new Set(demo.players.map(p => p.position_group))].map(g => `<option value="${escape(g)}">${escape(g)}</option>`).join('')}</select></label><fieldset class="assistant-roster"><legend>Select at least two players</legend>${demo.players.map(p => `<label><input type="checkbox" name="assistant-member" value="${p.id}"><span>#${p.number} ${escape(p.name)}<small>${escape(p.position_group)}</small></span></label>`).join('')}</fieldset><button id="assistant-clear-group" class="rail-link" type="button">Clear players</button></div>
            <p id="assistant-team-context" class="assistant-team-context" hidden>${demo.players.length} players · All approved individual, group and team conversations are eligible.</p>
            <label>Meeting type<select id="assistant-meeting-type"><option value="">All meeting types</option><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label>
            <label>Skill<select id="assistant-skill"><option value="">All skills</option>${optionList(categories.skills,'')}</select></label>
            <label>Topic<select id="assistant-topic"><option value="">All topics</option>${optionList(categories.topics,'')}</select></label>
            <div class="form-row"><label>From<input id="assistant-start" type="date"></label><label>Through<input id="assistant-end" type="date"></label></div>
            <label>Action status<select id="assistant-status"><option value="all">All statuses</option><option value="open">Open actions</option><option value="overdue">Overdue actions</option><option value="done">Completed actions</option></select></label>
            <label class="assistant-check"><input id="assistant-actions" type="checkbox"> Actions only</label>
            <label>Record search<input id="assistant-search" type="search" maxlength="300" placeholder="Optional words from a record"></label>
            <p id="assistant-inherited-category" class="assistant-privacy" hidden></p><button id="assistant-reset" class="rail-link" type="button">Reset filters</button><p class="assistant-privacy">Uses approved, non-sensitive records for your selection. Choose a meeting type to narrow the source conversations. Answers may use only part of the matching history.</p>
          </aside>
          <div class="panel assistant-chat"><div class="assistant-chat-top"><span>${icon('chat')} A little context. A better conversation.</span><button id="assistant-clear" class="rail-link" type="button">Clear answer</button></div>
            <div id="assistant-answer" class="assistant-answer" aria-live="polite" aria-busy="false"><div class="assistant-welcome"><span class="assistant-emblem">${icon('chat')}</span><h3>What would you like to revisit?</h3><p>Choose Individual, Group, or Team, then ask about documented feedback, actions, or your next meeting. Answers link back to saved records.</p></div></div>
            <div class="assistant-prompts"><button type="button" data-assistant-prompt="Prepare my next meeting.">Prepare my next meeting</button><button type="button" data-assistant-prompt="Summarize past feedback.">Summarize past feedback</button><button type="button" data-assistant-prompt="Which actions need follow-up?" data-assistant-actions>Review open actions</button></div>
            <form id="assistant-form"><label for="assistant-question">Your question</label><div class="assistant-composer"><textarea id="assistant-question" rows="2" maxlength="800" required placeholder="What feedback and follow-ups should we revisit?"></textarea><button id="assistant-send" class="primary" type="submit">Ask assistant</button></div><p id="assistant-mode-note">Demo shows matching saved excerpts. Switch to Live for an Aivana answer.</p><p id="assistant-error" class="assistant-error" role="alert" hidden></p></form>
          </div>
        </div>
      </section>
      <footer><span>FALCON FOLLOW-UP <b> / </b> picInfiniti</span><span>Every conversation deserves a next step. · Synthetic data only</span></footer>
    </main>
  </div>`;

function notify(text, error = false) {
  clearTimeout(statusTimer); $('#status-toast').hidden = true;
  $('#message').hidden = !text || !error;
  if (!text) return;
  if (!error) { showModeAlert(text); return; }
  $('#message').textContent = text; $('#message').className = 'error';
}
function showModeAlert(text) {
  clearTimeout(statusTimer); $('#message').hidden = true;
  $('#status-toast-text').textContent = text;
  $('#status-toast').hidden = false;
  statusTimer = setTimeout(() => { $('#status-toast').hidden = true; }, 3000);
}
$('#close-status-toast').addEventListener('click', () => { clearTimeout(statusTimer); $('#status-toast').hidden = true; });

async function api(path, body, method = 'POST') {
  let res;
  try { res = await fetch(`/api${path}`, {method, headers:{'Content-Type':'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}); }
  catch { throw Error('Shared notebook unavailable. Start FastAPI on port 8001; both Demo and Live use SQLite.'); }
  let data; try { data = await res.json(); } catch { throw Error('Backend unavailable or returned an invalid response. Start FastAPI on port 8001.'); }
  if (!res.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Request could not be completed. Check the meeting fields.');
  return data;
}
function capture() {
  current = {title:$('#title').value.trim(), date:$('#date').value, meeting_type:$('#meeting-type').value, attendees:[...document.querySelectorAll('[name="attendee"]:checked')].map(x => x.value), note:$('#note').value.trim()};
  updateAttendeeSummary();
  return clone(current);
}
function validMeeting(m) {
  if (!m.title || !m.note || !m.date || !m.attendees.length) throw Error('Add a title, date, note, and at least one attendee.');
  if (m.meeting_type === 'individual' && m.attendees.length !== 1) throw Error('An individual meeting needs exactly one attendee.');
  if (m.meeting_type === 'group' && m.attendees.length < 2) throw Error('A group meeting needs at least two attendees.');
  if (m.meeting_type === 'team' && m.attendees.length !== demo.players.length) throw Error('Select the full fictional roster for a team meeting.');
}
function updateAttendeeSummary() {
  const selected = [...document.querySelectorAll('[name="attendee"]:checked')].map(el => name(el.value));
  $('#attendee-summary').textContent = `Attendees · ${selected.length ? selected.length <= 2 ? selected.join(', ') : `${selected.length} players selected` : 'Choose players'}`;
}
function loadSample(id) {
  reviewingNoteOnly = false;
  current = clone(demo.samples.find(x => x.id === id)); draft = []; extractionId = null; extractionWarnings = [];
  $('#title').value = meetingDisplayTitle(current.title); $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note;
  $('#attendees').innerHTML = demo.players.map(p => `<label class="attendee"><input name="attendee" type="checkbox" value="${p.id}" ${current.attendees.includes(p.id) ? 'checked' : ''}><span>${escape(p.name.split(' ')[0])}</span></label>`).join('');
  updateAttendeeSummary();
  renderReview();
}
function invalidate() { reviewingNoteOnly = false; draft = []; extractionId = null; extractionWarnings = []; renderReview(); }
function optionList(values, selected) { return values.map(v => `<option value="${escape(v)}" ${v === selected ? 'selected' : ''}>${escape(v)}</option>`).join(''); }
function renderReview() {
  const review = $('#review');
  if (reviewingNoteOnly) { review.innerHTML = meetingReviewFrame(noteOnlyReview(current, demo.players), current, demo.players); return; }
  const warnings = extractionWarnings.length ? `<div class="extraction-warnings" role="status"><strong>Extraction notes</strong><ul>${extractionWarnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></div>` : '';
  if (!draft.length) {
    review.innerHTML = `${warnings}<div class="empty-review"><h3>A little clarity goes a long way.</h3><p>Keep a team speech, encouragement, or any conversation as an original note. Extract records only when you want feedback or tasks to track.</p></div><button class="primary full" data-review-note-only type="button">Review & save original note</button><button class="secondary full" data-add-record type="button">Add record manually</button>`;
    return;
  }
  const blocked = draft.some(i => reviewIssues(i, current).length);
  highlightedDraft = Math.min(highlightedDraft, draft.length-1);
  const expanded = new Set([...review.querySelectorAll('[data-review-group][open]')].map(el => el.dataset.reviewGroup));
  const cards = draft.map((i,n) => {
    const issues = reviewIssues(i,current);
    const shared = i.scope === 'team' && i.player_ids?.length && i.kind !== 'action';
    return `<article class="draft-item confidence-${i.confidence || 'medium'}"><p class="record-origin">${escape(meetingTypeLabel(current.meeting_type))} · ${escape(meetingDisplayTitle(current.title))}</p><div class="draft-flags"><span class="confidence-badge ${i.confidence || 'medium'}">${escape(i.confidence || 'medium')} confidence</span>${!i.player_id && !shared ? '<span class="badge overdue">Unmatched player</span>' : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive topic</span>' : ''}${i.group_record_id ? '<span class="badge">Shared instruction</span>' : ''}</div><div class="form-row"><label>Player<select data-index="${n}" data-field="player_id"><option value="" ${!i.player_id && !shared ? 'selected' : ''}>Choose attendee…</option>${current.meeting_type === 'team' && i.kind !== 'action' ? `<option value="__team__" ${shared ? 'selected' : ''}>Whole team feedback</option>` : ''}${current.attendees.map(id => `<option value="${id}" ${id === i.player_id ? 'selected' : ''}>${escape(name(id))}</option>`).join('')}</select></label><label>Record type<select data-index="${n}" data-field="kind">${optionList(['action','praise','improvement','observation'], i.kind)}</select></label></div><label>Meeting topic<select data-index="${n}" data-field="topic">${optionList(categories.topics,i.topic)}</select></label><label>Coach's record<textarea rows="2" data-index="${n}" data-field="text" maxlength="1000">${escape(i.text)}</textarea></label><div class="form-row"><label>Football skill<select data-index="${n}" data-field="skill">${optionList(categories.skills,i.skill)}</select></label><label>Due date <small>(actions only)</small><input type="date" data-index="${n}" data-field="due_date" value="${escape(i.due_date || '')}" ${i.kind !== 'action' ? 'disabled' : ''}></label></div>${i.deadline_text ? `<p class="deadline-evidence">Original deadline: “${escape(i.deadline_text)}” · ${i.due_date ? `Resolved: ${escape(i.due_date)}` : 'No definite date — coach review needed'}</p>` : ''}<label>Verbatim source quote<textarea rows="2" data-index="${n}" data-field="quote" maxlength="2000">${escape(i.quote)}</textarea></label><button class="text-button" data-highlight="${n}" type="button">Highlight in original note</button>${i.mention ? `<p class="match-evidence">${i.match_method === 'individual_context' ? 'Individual meeting context' : 'Mention'}: ${escape(i.mention)} · ${escape((i.match_method || 'unmatched').replaceAll('_',' '))}</p>` : ''}${i.warnings?.length ? `<details class="draft-extraction-notes"><summary>Extraction notes</summary><ul>${i.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>` : ''}<div class="record-issues" data-issues="${n}">${issues.map(issue => `<p>${escape(issue)}</p>`).join('')}</div><button class="text-button remove" data-remove="${n}" type="button">Remove record</button></article>`;
  });
  const groups = groupRecords(draft);
  const reviewCards = groups.map(group => {
    if (!group.shared) return group.indexes.map(n => cards[n]).join('');
    const i = group.item, key = `${i.display_group.id}-${i.player_id}`;
    const issues = group.members.some(item => reviewIssues(item,current).length);
    const warnings = group.members.filter(item => item.confidence === 'low' || item.warnings?.length).length;
    return `<article class="shared-review-card"><div class="shared-card-heading"><div><span class="record-origin">${escape(meetingTypeLabel(current.meeting_type))}</span><h3>Shared ${escape(i.kind)} · ${escape(meetingDisplayTitle(group.label))}</h3></div><span class="badge">${group.members.length} players</span></div><div class="draft-flags">${warnings ? `<span class="badge overdue">${warnings} player record${warnings === 1 ? '' : 's'} need warning review</span>` : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive topic</span>' : ''}</div><p class="shared-player-names">${group.members.map(item => escape(name(item.player_id))).join(' · ')}</p><p class="shared-record-text">${escape(i.text)}</p><p class="shared-record-meta">${i.match_method === 'selected_attendees' ? `Interpreted “${escape(i.mention)}” as the selected attendees above. Confirm these players before approval.<br>` : ''}${escape(i.skill)}${i.topic ? ` · ${escape(i.topic)}` : ''}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><blockquote>${escape(i.quote)}</blockquote><button class="text-button" type="button" data-highlight="${group.indexes[0]}">Highlight in original note</button><p class="shared-review-hint">One shared statement, ${group.members.length} player records. Expand to review confidence, warnings, or change an individual player's version.</p><details data-review-group="${escape(key)}" ${issues || warnings || expanded.has(key) ? 'open' : ''}><summary>Review / edit each player${issues ? ' · Corrections required' : ''}</summary>${group.indexes.map(n => cards[n]).join('')}<button class="secondary compact" type="button" data-regroup-review>Update shared cards</button></details></article>`;
  }).join('');
  review.innerHTML = `${warnings}<div class="review-summary"><strong>${current.meeting_type === 'individual' ? `${groups.length} review card${groups.length === 1 ? '' : 's'}` : escape(meetingTypeLabel(current.meeting_type))} · ${draft.length} records to review</strong><span>${origin === 'demo' ? 'Prepared samples · not AI' : origin === 'manual' ? 'Manual records' : 'Aivana drafts · verify all fields'}</span></div><div class="review-source-preview"><strong>Original note · highlighted evidence</strong><div id="highlighted-source">${highlightSource(current.note, draft[highlightedDraft]?.quote)}</div></div><div class="draft-list">${meetingReviewFrame(reviewCards,current,demo.players)}</div><button class="secondary full" data-add-record type="button">Add another record</button><div class="review-footer"><label class="approval"><input id="approved" type="checkbox" ${blocked ? 'disabled' : ''}>I reviewed the player, meaning, source, deadline, and warnings for every record.</label><button id="save" class="primary full" disabled>Approve & save meeting</button></div>`;
}
function updateReviewReadiness() {
  draft.forEach((item,n) => { const el = $(`[data-issues="${n}"]`); if (el) el.innerHTML = reviewIssues(item,current).map(issue => `<p>${escape(issue)}</p>`).join(''); });
  if ($('#approved')) { $('#approved').checked = false; $('#approved').disabled = draft.some(i => reviewIssues(i,current).length); $('#save').disabled = true; }
}
function statusBadge(i) { return i.completed ? '<span class="badge completed">Complete</span>' : overdue(i) ? '<span class="badge overdue">Overdue</span>' : `<span class="badge ${i.kind}">${i.kind === 'action' ? 'Open action' : i.kind}</span>`; }
function recordMarkup(i, m, showSensitive = false, idPrefix = 'record') {
  const sourceNote = m.items.some(item => item.sensitive) && !showSensitive ? 'Full note contains sensitive content. Enable sensitive records to view it; the supporting excerpt is shown above.' : m.note;
  return `<article class="record" id="${idPrefix}-${escape(m.id)}-${escape(i.id)}" tabindex="-1"><div class="record-top">${statusBadge(i)}<span>${escape(i.skill)}</span>${i.topic ? `<span class="record-topic">${escape(i.topic)}</span>` : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}${m.id.startsWith('m-seed-') ? '<span class="badge">Earlier practice pack</span>' : ''}</div><h4>${escape(i.text)}</h4><p class="record-origin">${escape(meetingTypeLabel(m.meeting_type))} · ${escape(meetingDisplayTitle(m.title))}</p><p class="record-meta">${i.player_ids?.length ? 'Whole team' : escape(name(i.player_id))} · ${escape(m.date)}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><details><summary>Source meeting note</summary><blockquote>${escape(i.quote)}</blockquote><p>${escape(sourceNote)}</p></details>${i.kind === 'action' ? `<button class="secondary compact" data-meeting="${escape(m.id)}" data-item="${escape(i.id)}">${i.completed?'Reopen action':'Mark complete'}</button>` : ''}</article>`;
}
const initials = (p) => p.name.split(' ').map(part => part[0]).slice(0,2).join('');
function renderPlayerDirectory() {
  const summaries = summarizePlayers(demo.players, meetings, today());
  const visible = filterPlayers(summaries, {search: $('#player-search').value, unit: playerUnitFilter, group: $('#player-group').value, position: $('#player-position').value});
  if (!playerDetailOpen && visible.length && !visible.some(p => p.id === selectedPlayer)) selectedPlayer = visible[0].id;
  const count = (unit) => unit === 'all' ? summaries.length : summaries.filter(p => p.unit === unit).length;
  $('#player-unit-tabs').innerHTML = ['all','Offense','Defense','Special Teams'].map(unit => `<button type="button" data-player-unit="${unit}" aria-pressed="${unit === playerUnitFilter}">${unit === 'all' ? 'All' : unit}<span>${count(unit)}</span></button>`).join('');
  $('#roster').innerHTML = visible.map(p => `<tr data-select-player="${p.id}" class="${p.id === selectedPlayer ? 'selected' : ''}"><th scope="row"><button class="table-player" data-select-player="${p.id}" aria-pressed="${p.id === selectedPlayer}"><span class="initial-avatar">${escape(initials(p))}</span><span>${escape(p.name)}</span></button></th><td>${p.number}</td><td><abbr title="${escape(p.position_label || p.position)}">${escape(p.position)}</abbr></td><td><span class="unit-badge ${p.unit === 'Offense' ? 'offense' : p.unit === 'Defense' ? 'defense' : 'special'}">${escape(p.unit)}</span></td><td>${p.meetingCount} <span class="cell-detail">meeting${p.meetingCount === 1 ? '' : 's'}</span></td><td><span class="action-count ${p.openCount ? 'has-actions' : ''}">${p.openCount} open</span></td><td><button class="row-details" data-player="${p.id}" aria-label="View ${escape(p.name)}'s timeline">View</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No matching players. Try another name, jersey number, or filter.</td></tr>';
  $('#player-results').textContent = `Showing ${visible.length} of ${summaries.length} players. Select a row for a snapshot; View opens the full timeline.`;
  const selected = visible.length ? summaries.find(p => p.id === selectedPlayer) : null;
  $('#player-snapshot').innerHTML = selected ? `<div class="snapshot-profile"><span class="initial-avatar large">${escape(initials(selected))}</span><div><h4>${escape(selected.name)}</h4><p>#${selected.number} · ${escape(selected.position_label || selected.position)}</p></div></div><dl class="snapshot-stats"><div><dt>Meetings attended</dt><dd>${selected.meetingCount}</dd></div><div><dt>Open actions</dt><dd>${selected.openCount}</dd></div><div><dt>Overdue</dt><dd class="${selected.overdueCount ? 'overdue-number' : ''}">${selected.overdueCount}</dd></div></dl><div class="snapshot-followup"><h4>Latest reviewed record</h4>${selected.latest ? `<p><time>${escape(selected.latest.meeting.date)}</time> · ${escape(selected.latest.text)}</p>` : '<p>No non-sensitive reviewed record to preview. Open the timeline to review available records.</p>'}</div><button class="snapshot-link" data-player="${selected.id}">View timeline</button>` : '<p class="empty">No player matches these filters.</p>';
  $('#player-unit-summary').innerHTML = ['Offense','Defense','Special Teams'].map(unit => `<div><dt>${unit}</dt><dd>${count(unit)}</dd></div>`).join('') + `<div class="total"><dt>Total</dt><dd>${summaries.length}</dd></div>`;
  $('#player-directory').hidden = playerDetailOpen;
  $('#player-detail').hidden = !playerDetailOpen;
}
function openPlayerTimeline(id) {
  playerCalendarMonth = today().slice(0,7); playerCalendarDate = today(); $('#player-calendar-type').value = '';
  if (id !== selectedPlayer) $('#show-sensitive').checked = false;
  selectedPlayer = id; playerDetailOpen = true; cancelPrep(); render(); switchView('players');
  $('#player-heading').tabIndex = -1; $('#player-heading').focus({preventScroll:true});
  $('#player-heading').scrollIntoView({block:'start', behavior:'instant'});
}
$('#back-to-roster').addEventListener('click', () => {
  playerDetailOpen = false; cancelPrep(); render(); $('#players-title').focus({preventScroll:true});
  $('#players-title').scrollIntoView({block:'start', behavior:'instant'});
});
$('#player-search').addEventListener('input', renderPlayerDirectory);
$('#player-group').addEventListener('change', renderPlayerDirectory);
$('#player-position').addEventListener('change', renderPlayerDirectory);
$('#player-unit-tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-player-unit]');
  if (tab) { playerUnitFilter = tab.dataset.playerUnit; renderPlayerDirectory(); if (e.detail === 0) $(`[data-player-unit="${playerUnitFilter}"]`).focus({preventScroll:true}); }
});

function render() {
  $('#assistant-mode-note').textContent = mode === 'demo' ? 'Demo shows matching saved excerpts. Switch to Live for an Aivana answer.' : 'Live · Aivana answers from matching records. Questions are not saved or sent with later questions.';
  $('#assistant-send').disabled = assistantPending || !connected;
  const all = items(), actions = all.filter(i => i.kind === 'action'), open = actions.filter(i => !i.completed);
  $('#meeting-count').textContent = meetings.length; $('#open-count').textContent = open.length; $('#overdue-count').textContent = open.filter(overdue).length;
  $('#players-count').textContent = new Set(meetings.flatMap(m => m.attendees)).size; $('#nav-count').textContent = open.length;
  $('#clock-note').textContent = `As of ${today()}`;
  $('#extract').textContent = mode === 'demo' ? 'Extract sample records' : 'Extract with Aivana';
  $('#extract').disabled = busy || !connected;
  $('#review-meeting').disabled = busy || !connected;
  $('#recent').innerHTML = [...meetings].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5).map(m => `<button class="meeting-row" data-open-meeting="${escape(m.id)}"><span class="meeting-date">${icon('note')}</span><span class="meeting-title"><strong>${escape(meetingDisplayTitle(m.title))}</strong><small>${escape(m.date)} · ${m.note_only ? 'Original note' : `${m.items.length} records`}</small></span><span class="badge">${m.origin === 'demo' ? 'Demo fixture' : 'Reviewed'}</span></button>`).join('') || '<div class="panel empty">No meetings yet. Save your first reviewed extraction.</div>';
  renderMeetingLibrary();
  renderPlayerDirectory();
  renderPlanning();
  renderOverview();
  const p = player(selectedPlayer);
  const playerMeetings = meetings.filter(m => m.attendees.includes(selectedPlayer));
  const playerActions = all.filter(i => appliesTo(i,selectedPlayer) && i.kind === 'action');
  $('#player-heading').innerHTML = `<div class="player-profile"><span class="avatar large">${p.number}</span><div><p class="eyebrow">${escape(positionLabel(p))}</p><h2>${escape(p.name)}</h2><p>Every conversation. Every next step.</p></div><button class="secondary" type="button" data-ask-player="${p.id}">${icon('chat')} Ask about this player</button></div>`;
  $('#player-history-stats').innerHTML = `<div><strong>${playerMeetings.length}</strong><span>Saved meetings</span></div><div><strong>${playerActions.filter(i => !i.completed).length}</strong><span>Open actions</span></div><div class="${playerActions.some(overdue)?'is-overdue':''}"><strong>${playerActions.filter(overdue).length}</strong><span>Overdue</span></div>`;
  $('#timeline').innerHTML = playerMeetingHistory(meetings,selectedPlayer,demo.players,$('#show-sensitive').checked,recordMarkup);
  renderPlayerCalendar();
  renderActionBoard(actions);

}
function renderMeetingLibrary() {
  $('#meeting-library-list').hidden = Boolean(selectedMeetingId);
  $('#meeting-library-detail').hidden = !selectedMeetingId;
  $('#meeting-show-sensitive').checked = meetingLibrarySensitive;
  $('#library-all-count').textContent = meetings.length;
  $('#library-upcoming-count').textContent = meetings.filter(m => m.date >= today()).length;
  $('#library-past-count').textContent = meetings.filter(m => m.date < today()).length;
  const start = $('#meeting-start').value, end = $('#meeting-end').value;
  const filtered = filterMeetings(meetings, demo.players, {search:$('#meeting-search').value, type:$('#meeting-type-filter').value, player:$('#meeting-player-filter').value, start, end, period:$('#meeting-period').value, sort:$('#meeting-sort').value, today:today()});
  $('#meeting-results').textContent = start && end && start > end ? 'From must be on or before Through.' : `${filtered.length} of ${meetings.length} saved meetings`;
  renderMeetingCalendar(filtered);
  const dated = meetingCalendarDate ? activityForDate(filtered,meetingCalendarDate).meetings : filtered;
  if (!(start && end && start > end)) $('#meeting-results').textContent = `${dated.length} of ${meetings.length} saved meetings`;
  $('#meeting-selected-day').hidden = !meetingCalendarDate;
  $('#meeting-selected-date').textContent = meetingCalendarDate ? `Meeting date · ${new Date(`${meetingCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : '';
  $('#meeting-list').innerHTML = meetingListMarkup(dated,demo.players,today());
  document.querySelectorAll('[data-meeting-period]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.meetingPeriod === $('#meeting-period').value)));
  const meeting = meetings.find(m => m.id === selectedMeetingId);
  const expanded = [...$('#meeting-detail').querySelectorAll('details')].map(el => el.open);
  $('#meeting-detail').innerHTML = meeting ? meetingDetailMarkup(meeting,demo.players,meetingLibrarySensitive,(i,m,sensitive) => recordMarkup(i,m,sensitive,'meeting-detail-record')) : '';
  $('#meeting-detail').querySelectorAll('details').forEach((el,n) => el.open = expanded[n] || false);
}
function renderMeetingCalendar(filtered) {
  const source = meetingCalendarSource(filtered);
  const [year,month] = meetingCalendarMonth.split('-').map(Number);
  $('#meeting-calendar-title').textContent = new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  $('#meeting-calendar').innerHTML = calendarGrid(source,meetingCalendarMonth,today(),meetingCalendarDate,true);
  if (!meetingCalendarDate) { $('#meeting-calendar-activities').innerHTML = '<p class="date-empty">Choose a date to see its meetings and action deadlines. Calendar matches your meeting filters.</p>'; return; }
  const activity = activityForDate(source,meetingCalendarDate);
  const label = new Date(`${meetingCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const rows = activity.meetings.map(m => `<button class="player-calendar-meeting" type="button" data-open-meeting="${escape(m.id)}"><strong>${escape(meetingDisplayTitle(m.title))}</strong><small>${escape(meetingTypeLabel(m.meeting_type))} · ${m.attendees.length} attendees</small></button>`).join('');
  const actions = activity.actions.map(i => `<button class="player-calendar-meeting" type="button" data-open-meeting="${escape(i.meeting.id)}"><strong>${escape(i.text)}</strong><small>${i.completed ? 'Completed' : overdue(i) ? 'Overdue' : 'Open'} · ${escape(meetingDisplayTitle(i.meeting.title))}</small></button>`).join('');
  $('#meeting-calendar-activities').innerHTML = `<h3>${label}</h3><h4>Meetings · ${activity.meetings.length}</h4>${rows || '<p class="date-empty">No meetings match on this date.</p>'}<h4>Actions due · ${activity.actions.length}</h4>${actions || '<p class="date-empty">No visible actions due on this date.</p>'}`;
}
for (const [id,offset] of [['meeting-calendar-prev',-1],['meeting-calendar-next',1]]) {
  $(`#${id}`).addEventListener('click', () => {
    const [year,month] = meetingCalendarMonth.split('-').map(Number), next = new Date(year,month-1+offset,1);
    meetingCalendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
    meetingCalendarDate = null; renderMeetingLibrary();
  });
}
$('#meeting-calendar').addEventListener('click', e => {
  const day = e.target.closest('[data-calendar-date]'); if (!day) return;
  meetingCalendarDate = day.dataset.calendarDate; renderMeetingLibrary();
  if (e.detail === 0) $('#meeting-calendar').querySelector(`[data-calendar-date="${meetingCalendarDate}"]`)?.focus({preventScroll:true});
});
$('#meeting-clear-date').addEventListener('click', () => { meetingCalendarDate = null; renderMeetingLibrary(); $('#meetings-title').focus({preventScroll:true}); });
function openMeeting(id) {
  if (!meetings.some(m => m.id === id)) return;
  selectedMeetingId = id; meetingLibrarySensitive = false; $('#meeting-detail').innerHTML = '';
  renderMeetingLibrary(); switchView('meeting-library');
  $('#meeting-detail-title').focus({preventScroll:true}); $('#meeting-detail-title').scrollIntoView({block:'start'});
}
$('#meeting-back').addEventListener('click', () => {
  const id = selectedMeetingId; selectedMeetingId = null; meetingLibrarySensitive = false; renderMeetingLibrary();
  const button = [...$('#meeting-list').querySelectorAll('[data-open-meeting]')].find(el => el.dataset.openMeeting === id);
  (button || $('#meetings-title')).focus();
});
$('#meeting-show-sensitive').addEventListener('change', e => { meetingLibrarySensitive = e.target.checked; renderMeetingLibrary(); });
$('.library-periods').addEventListener('click', e => { const button = e.target.closest('[data-meeting-period]'); if (button) { $('#meeting-period').value = button.dataset.meetingPeriod; renderMeetingLibrary(); } });
$('#meeting-search').addEventListener('input', renderMeetingLibrary);
for (const id of ['meeting-type-filter','meeting-player-filter','meeting-start','meeting-end','meeting-sort']) $(`#${id}`).addEventListener('change', renderMeetingLibrary);
function resetMeetingFilters() {
  meetingCalendarDate = null;
  for (const id of ['meeting-search','meeting-type-filter','meeting-player-filter','meeting-start','meeting-end']) $(`#${id}`).value = '';
  $('#meeting-sort').value = 'recent'; $('#meeting-period').value = 'all';
}
$('#meeting-reset').addEventListener('click', () => { resetMeetingFilters(); renderMeetingLibrary(); });
function renderActionBoard(actions = items().filter(i => i.kind === 'action')) {
  renderActionCalendar();
  const categorySelect = $('#task-category'), selectedCategory = categorySelect.value;
  const sensitiveOnly = $('#show-sensitive-actions').checked;
  const available = actions.filter(i => sensitiveOnly ? Boolean(i.sensitive) : !i.sensitive);
  const categoryNames = [...new Set(available.flatMap(i => [i.skill, i.topic]).filter(Boolean))].sort();
  categorySelect.innerHTML = '<option value="">All categories</option>' + categoryNames.map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
  categorySelect.value = categoryNames.includes(selectedCategory) ? selectedCategory : '';
  const options = {status: $('#task-filter').value, search: $('#task-search').value, player: $('#task-player').value, category: categorySelect.value, sort: $('#task-sort').value, showSensitive: sensitiveOnly, sensitiveOnly, today: today()};
  const filtered = filterActions(actions, demo.players, options);
  const sensitiveTotal = actions.filter(i => i.sensitive).length;
  const matchingSensitive = filterActions(actions, demo.players, {...options, showSensitive:true, sensitiveOnly:true}).length;
  $('#sensitive-action-count').textContent = `(${sensitiveTotal} saved)`;
  $('#task-hidden-note').hidden = !options.showSensitive && !matchingSensitive;
  $('#task-hidden-note').textContent = options.showSensitive
    ? !sensitiveTotal ? 'There are no sensitive actions in your saved meetings.'
      : matchingSensitive ? `Showing only ${matchingSensitive} sensitive action${matchingSensitive === 1 ? '' : 's'} matching your filters.`
      : `${sensitiveTotal} sensitive action${sensitiveTotal === 1 ? ' is' : 's are'} saved, but none match your current filters.`
    : `${matchingSensitive} sensitive action${matchingSensitive === 1 ? '' : 's'} hidden in this view.`;
  const expandedMeetings = new Set([...$('#task-list').querySelectorAll('[data-meeting-card]')].filter(card => card.querySelector('[data-meeting-expansion]')?.open).map(card => card.dataset.meetingCard));
  const expandedTasks = new Map([...$('#task-list').querySelectorAll('[data-action-key]')].map(task => [task.dataset.actionKey,[...task.querySelectorAll('details')].map(d => d.open)]));
  const {rows, count, meetingCount} = actionRows(filtered, available, demo.players, {today:today(), busy, showSensitive:options.showSensitive});
  $('#task-results').textContent = `${sensitiveOnly ? 'Sensitive only · ' : ''}${meetingCount} meeting${meetingCount === 1 ? '' : 's'} · ${count} assignment${count === 1 ? '' : 's'}`;
  $('#task-list').innerHTML = rows;
  $('#task-list').querySelectorAll('[data-meeting-card]').forEach(card => { if (expandedMeetings.has(card.dataset.meetingCard)) card.querySelector('[data-meeting-expansion]').open = true; });
  $('#task-list').querySelectorAll('[data-action-key]').forEach(task => { const states = expandedTasks.get(task.dataset.actionKey); if (states) task.querySelectorAll('details').forEach((detail,n) => detail.open = states[n] || false); });
  document.querySelectorAll('[data-action-status]').forEach(button => { const active = button.dataset.actionStatus === options.status; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
}
function switchView(next) {
  view = next;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view);
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === view || el.closest('nav') && view === 'meetings' && el.dataset.view === 'meeting-library'; el.classList.toggle('active', Boolean(active)); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
}
function cancelPrep() { prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').textContent = ''; }

let calendarMonth = today().slice(0, 7), selectedCalendarDate = null;
let actionCalendarMonth = today().slice(0,7), actionCalendarDate = today();
function renderOverview() {
  $('#overview-recent-count').textContent = meetings.length ? `Latest ${Math.min(meetings.length,5)} of ${meetings.length} saved` : 'Your approved notes appear here';
  renderCheckIns();
  $('#overview-meeting-types').innerHTML = [['individual','One-on-one'],['group','Group'],['team','Team']].map(([type,label]) => `<button data-library-type="${type}"><span>${icon(type === 'individual' ? 'user' : 'people')}${label}</span><strong>${meetings.filter(m => m.meeting_type === type).length}</strong></button>`).join('');
}
function renderCheckIns() {
  if (!connected) { $('#overview-checkins').innerHTML = '<p class="checkin-date-note">Connect to the shared notebook to check recent meetings.</p>'; return; }
  $('#overview-checkins').innerHTML = checkInMarkup(checkInRecency(demo.players,meetings,today(),{
    days:Number($('#checkin-window').value), type:$('#checkin-type').value,
  }));
}
$('#checkin-window').addEventListener('change', renderCheckIns);
$('#checkin-type').addEventListener('change', renderCheckIns);
function renderPlayerCalendar() {
  const source = calendarMeetings(playerCalendarMeetings(meetings,selectedPlayer),$('#player-calendar-type').value);
  const [year,month] = playerCalendarMonth.split('-').map(Number);
  $('#player-calendar-title').textContent = new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  $('#player-calendar').innerHTML = calendarGrid(source,playerCalendarMonth,today(),playerCalendarDate,true);
  const activity = activityForDate(source,playerCalendarDate);
  const label = new Date(`${playerCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  $('#player-calendar-activities').innerHTML = `<h3>${label}</h3><h4>Meetings · ${activity.meetings.length}</h4>${activity.meetings.map(m => `<button class="player-calendar-meeting" type="button" data-player-meeting="${escape(m.id)}"><strong>${escape(meetingDisplayTitle(m.title))}</strong><small>${escape(meetingTypeLabel(m.meeting_type))}</small></button>`).join('') || '<p class="date-empty">No meetings on this date.</p>'}<h4>Actions due · ${activity.actions.length}</h4>${activity.actions.map(i => `<p class="player-calendar-due"><strong>${escape(i.text)}</strong><small>${i.completed?'Completed':overdue(i)?'Overdue':'Open'} · ${escape(meetingDisplayTitle(i.meeting.title))}</small></p>`).join('') || '<p class="date-empty">No visible actions due on this date.</p>'}${activity.hiddenActionCount ? `<p class="date-empty">${activity.hiddenActionCount} sensitive actions hidden.</p>` : ''}`;
}
for (const [id,offset] of [['player-calendar-prev',-1],['player-calendar-next',1]]) {
  $(`#${id}`).addEventListener('click', () => { const [year,month] = playerCalendarMonth.split('-').map(Number); const next = new Date(year,month-1+offset,1); playerCalendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`; playerCalendarDate = `${playerCalendarMonth}-01`; renderPlayerCalendar(); });
}
$('#player-calendar-type').addEventListener('change',renderPlayerCalendar);
$('#player-calendar').addEventListener('click',e => { const day = e.target.closest('[data-calendar-date]'); if (!day) return; playerCalendarDate = day.dataset.calendarDate; renderPlayerCalendar(); if (e.detail===0) $('#player-calendar').querySelector(`[data-calendar-date="${playerCalendarDate}"]`)?.focus({preventScroll:true}); });
$('#player-calendar-activities').addEventListener('click',e => { const target = e.target.closest('[data-player-meeting]'); if (!target) return; const meeting = document.getElementById(`timeline-meeting-${target.dataset.playerMeeting}`); if (meeting) { meeting.focus({preventScroll:true}); meeting.scrollIntoView({block:'start',behavior:'smooth'}); } });
function renderActionCalendar() {
  const sensitiveOnly = $('#show-sensitive-actions').checked;
  const calendarSource = sensitiveOnly ? meetings.filter(m => m.items.some(i => i.kind === 'action' && i.sensitive)).map(m => ({...m,items:m.items.filter(i => i.kind === 'action' && i.sensitive)})) : meetings;
  const source = calendarMeetings(calendarSource,$('#action-calendar-type').value);
  const [year,month] = actionCalendarMonth.split('-').map(Number);
  $('#action-calendar-title').textContent = new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  $('#action-calendar').innerHTML = calendarGrid(source,actionCalendarMonth,today(),actionCalendarDate,true);
  const activity = activityForDate(source,actionCalendarDate,{showSensitive:sensitiveOnly});
  const label = new Date(`${actionCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const meetingRows = activity.meetings.map(m => `<details class="date-meeting"><summary><strong>${escape(meetingDisplayTitle(m.title))}</strong><small>${escape(meetingTypeLabel(m.meeting_type))} · ${m.attendees.length} attendees</small></summary>${m.items.some(i => i.sensitive) ? '<p>Full note contains sensitive content. Review it in the player timeline with sensitive records enabled.</p>' : `<p>${escape(m.note)}</p>`}</details>`).join('');
  const actions = groupRecords(activity.actions).map(group => { const i = group.item; return `<button type="button" class="date-action" data-player="${escape(i.player_id)}"><span><strong>${group.shared ? `${escape(meetingDisplayTitle(group.label))} · ${group.allMembers.length} players` : escape(name(i.player_id))}</strong><small>${escape(i.text)}</small></span><em class="${i.completed?'done':overdue(i)?'late':''}">${i.completed?'Complete':overdue(i)?'Overdue':'Open'}</em></button>`; }).join('');
  $('#action-calendar-activities').innerHTML = `<h3>${label}</h3><h4>Meetings · ${activity.meetings.length}</h4>${meetingRows || '<p class="date-empty">No meetings of this type on this date.</p>'}<h4>Assignments due</h4>${actions || '<p class="date-empty">No visible assignments due on this date.</p>'}${activity.hiddenActionCount ? `<p class="date-empty">${activity.hiddenActionCount} sensitive actions hidden.</p>` : ''}`;
}
for (const [id,offset] of [['action-calendar-prev',-1],['action-calendar-next',1]]) {
  $(`#${id}`).addEventListener('click', () => { const [year,month] = actionCalendarMonth.split('-').map(Number); const next = new Date(year,month-1+offset,1); actionCalendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`; actionCalendarDate = `${actionCalendarMonth}-01`; renderActionCalendar(); });
}
$('#action-calendar-type').addEventListener('change',renderActionCalendar);
$('#action-calendar').addEventListener('click', e => { const day = e.target.closest('[data-calendar-date]'); if (!day) return; actionCalendarDate = day.dataset.calendarDate; renderActionCalendar(); if (e.detail===0) $('#action-calendar').querySelector(`[data-calendar-date="${actionCalendarDate}"]`)?.focus({preventScroll:true}); });
function renderPlanning() {
  const [year, month] = calendarMonth.split('-').map(Number);
  $('#calendar-title').textContent = new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  $('#calendar').innerHTML = calendarGrid(meetings,calendarMonth,today(),selectedCalendarDate,true);
  const agenda = $('#calendar-activities');
  agenda.hidden = !selectedCalendarDate;
  if (selectedCalendarDate) {
    const activity = activityForDate(meetings,selectedCalendarDate);
    const label = new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const meetingRows = activity.meetings.map(m => `<details class="date-meeting"><summary><strong>${escape(meetingDisplayTitle(m.title))}</strong><small>${escape(meetingTypeLabel(m.meeting_type))} · ${m.attendees.length} attendees · ${m.note_only ? 'Original note' : `${m.items.length} records`}</small></summary>${m.items.some(i => i.sensitive) ? '<p>Full note contains sensitive content. Open the player timeline and enable sensitive records to review it.</p>' : `<p>${escape(m.note)}</p>`}</details>`).join('');
    const actionRows = activity.actions.map(i => `<button class="date-action" data-player="${escape(i.player_id)}"><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small></span><em class="${i.completed ? 'done' : overdue(i) ? 'late' : ''}">${i.completed ? 'Complete' : overdue(i) ? 'Overdue' : 'Open'}</em></button>`).join('');
    agenda.innerHTML = `<div class="date-agenda-heading"><h3>${label}</h3><button class="icon-button" data-clear-calendar aria-label="Close date activities">×</button></div>${meetingRows ? `<h4>Meetings · ${activity.meetings.length}</h4>${meetingRows}` : '<p class="date-empty">No meetings saved on this date.</p>'}${actionRows ? `<h4>Actions due · ${activity.actions.length}</h4>${actionRows}` : '<p class="date-empty">No visible actions due on this date.</p>'}${activity.hiddenActionCount ? `<p class="date-empty">${activity.hiddenActionCount} sensitive action${activity.hiddenActionCount === 1 ? '' : 's'} hidden. Review them in the action board.</p>` : ''}`;
  }
  const pending = items().filter(i => i.kind === 'action' && !i.completed && !i.sensitive && overdue(i)).sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0,3);
  const upcoming = upcomingActions(meetings,today());
  $('#upcoming-list').innerHTML = upcoming.map(i => `<button class="upcoming-item" data-player="${escape(i.player_id)}"><span class="upcoming-date">${i.due_date === today() ? 'Today' : new Date(`${i.due_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small></span></button>`).join('') || '<p class="radar-empty">No upcoming dated actions. Approved tasks with future deadlines will appear here.</p>';
  $('#radar-list').innerHTML = pending.map(i => `<button class="radar-item" data-player="${escape(i.player_id)}">${icon(overdue(i) ? 'check' : 'people')}<span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small><em>${i.due_date ? `Due ${escape(i.due_date)}${overdue(i) ? ' · Overdue' : ''}` : 'No deadline set'}</em></span>${icon('chevron')}</button>`).join('') || (items().some(i => i.kind === 'action' && !i.completed && i.sensitive && overdue(i)) ? '<p class="radar-empty">Sensitive overdue actions are hidden here. Open the action board to review them.</p>' : '<p class="radar-empty">No overdue actions. Future deadlines appear in Upcoming.</p>');
}
function newMeeting() {
  if (busy) return;
  reviewingNoteOnly = false;
  current = {title:'', date:today(), meeting_type:'individual', attendees:[], note:''};
  draft = []; extractionId = null; extractionWarnings = []; $('#title').value = ''; $('#date').value = current.date; $('#meeting-type').value = 'individual'; $('#note').value = '';
  $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = false);
  updateAttendeeSummary(); $('.attendee-picker').open = true;
  renderReview(); switchView('meetings'); $('#title').focus();
  notify('New meeting ready. Choose attendees and add your synthetic notes. Use live mode to extract custom notes.');
}
$('#new-meeting').addEventListener('click', newMeeting);
$('#meeting-form').addEventListener('submit', e => {
  e.preventDefault();
  if (busy || !connected) return;
  try { capture(); validMeeting(current); } catch (error) { notify(error.message,true); return; }
  if (!draft.length) { if (!extractionId) origin = 'manual'; reviewingNoteOnly = true; }
  renderReview(); $('#review').scrollIntoView({block:'start', behavior:'smooth'});
  const heading = $('#review h3'); if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
});
for (const [id, offset] of [['calendar-prev', -1], ['calendar-next', 1]]) {
  $(`#${id}`).addEventListener('click', () => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    calendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
    selectedCalendarDate = null; renderPlanning();
  });
}
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('[data-calendar-date]');
  if (!day) return;
  selectedCalendarDate = day.dataset.calendarDate;
  renderPlanning();
  if (e.detail === 0) $(`[data-calendar-date="${selectedCalendarDate}"]`)?.focus({preventScroll:true});
});
$('#calendar-activities').addEventListener('click', e => {
  if (e.target.closest('[data-clear-calendar]')) { selectedCalendarDate = null; renderPlanning(); }
});

$('#sample').addEventListener('change', e => { loadSample(e.target.value); notify('Sample loaded. Extract it to review the records.'); });
$('#meeting-form').addEventListener('input', e => {
  if (busy) return;
  if (e.target.matches('[name="attendee"]')) {
    const count = document.querySelectorAll('[name="attendee"]:checked').length;
    $('#meeting-type').value = meetingTypeForAttendees($('#meeting-type').value, count, demo.players.length);
  }
  capture(); invalidate();
});
$('#meeting-type').addEventListener('change', () => {
  if ($('#meeting-type').value === 'team') document.querySelectorAll('[name="attendee"]').forEach(x => x.checked = true);
  capture(); invalidate();
});
$('#extract').addEventListener('click', async e => {
  e.preventDefault(); if (busy) return;
  try {
    const meeting = capture(); validMeeting(meeting); busy = true; $('#extract').disabled = true; $('#review-meeting').disabled = true; $('#extract').textContent = 'Extracting…'; notify('');
    $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = true); $('#sample').disabled = true; $('#mode').disabled = true;
    const result = await api('/extract', {...meeting,mode});
    reviewingNoteOnly = false;
    draft = result.items.sort((a,b) => reviewPriority(a)-reviewPriority(b)); origin = result.origin;
    extractionId = result.extraction_id; extractionWarnings = result.warnings || []; highlightedDraft = 0;
    renderReview(); notify(draft.length ? 'Review every extracted record before saving.' : 'No feedback or tasks were found. You can review and save the original meeting note.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = false); $('#sample').disabled = false; $('#mode').disabled = false; $('#extract').disabled = false; render(); }
});
$('#review').addEventListener('input', e => {
  if (e.target.id === 'approved') { $('#save').disabled = !e.target.checked; return; }
  if (e.target.dataset.field) {
    const field = e.target.dataset.field, i = draft[Number(e.target.dataset.index)];
    if (field === 'player_id' && e.target.value === '__team__') { i.player_id = null; i.scope = 'team'; i.player_ids = [...current.attendees]; }
    else { i[field] = e.target.value || null; if (field === 'player_id') { i.scope = 'player'; delete i.player_ids; } }
    if (field === 'topic') i.sensitive = ['Health & Injury Follow-up','Insurance & Administration'].includes(i.topic);
    if (field === 'kind' && i.kind !== 'action') i.due_date = null;
    if (field === 'kind' && i.kind === 'action' && i.player_ids) { i.player_id = null; delete i.player_ids; i.scope = 'player'; }
    if (['kind','player_id','topic'].includes(field)) renderReview();
    if (field === 'quote') $('#highlighted-source').innerHTML = highlightSource(current.note,i.quote);
    const sharedCard = e.target.closest('.shared-review-card');
    if (sharedCard) sharedCard.querySelector('.shared-review-hint').textContent = 'Individual edits below are the values that will be saved. Use Update shared cards to separate changed versions.';
    updateReviewReadiness();
  }
});
$('#review').addEventListener('click', async e => {
  if (e.target.closest('[data-review-note-only]') && !busy) {
    try { capture(); validMeeting(current); } catch (error) { notify(error.message,true); return; }
    if (!extractionId) origin = 'manual';
    reviewingNoteOnly = true; renderReview(); return;
  }
  if (e.target.closest('[data-cancel-note-only]')) { reviewingNoteOnly = false; renderReview(); return; }
  if (e.target.closest('[data-regroup-review]')) { renderReview(); return; }
  const add = e.target.closest('[data-add-record]');
  if (add && !busy) {
    try { capture(); validMeeting(current); } catch (error) { notify(error.message,true); return; }
    if (!draft.length && !extractionId) origin = 'manual';
    draft.unshift({id:crypto.randomUUID(), schema_version:2, player_id:null, scope:'player', kind:'action', text:'', topic:'Other', skill:'Not Specified', quote:'', due_date:null, deadline_text:null, confidence:'low', mention:'', match_method:'unmatched', sensitive:false, warnings:[]});
    highlightedDraft = 0; renderReview(); return;
  }
  const highlight = e.target.closest('[data-highlight]');
  if (highlight) { highlightedDraft = Number(highlight.dataset.highlight); $('#highlighted-source').innerHTML = highlightSource(current.note,draft[highlightedDraft].quote); return; }
  const remove = e.target.closest('[data-remove]');
  if (remove) { draft.splice(Number(remove.dataset.remove),1); renderReview(); return; }
  if (e.target.id !== 'save' || !$('#approved')?.checked || busy) return;
  try {
    validMeeting(current);
    if (draft.some(i => reviewIssues(i,current).length)) throw Error('Correct the highlighted record issues before approval.');
    const body = {...clone(current), approved:true, origin, extraction_id:extractionId, items:clone(draft), ...(reviewingNoteOnly ? {note_only:true} : {})};
    busy = true; e.target.disabled = true;
    const meeting = await api('/meetings',body);
    meetings.unshift(meeting); clearAssistant();
    reviewingNoteOnly = false; draft = []; extractionId = null; extractionWarnings = []; renderReview(); cancelPrep(); render(); openMeeting(meeting.id); notify(meeting.note_only ? 'Meeting note saved. The original conversation is now in each attendee’s timeline.' : 'Meeting approved and saved. Its records are now in player timelines and the action board.');
  } catch (error) { notify(error.message,true); if ($('#save')) $('#save').disabled = false; }
  finally { busy = false; $('#extract').disabled = !connected; $('#review-meeting').disabled = !connected; renderActionBoard(); }
});
document.addEventListener('click', async e => {
  const summary = e.target.closest('[data-stat]');
  if (summary && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const destination = summary.dataset.stat;
    let target;
    if (destination === 'meetings') {
      selectedMeetingId = null; meetingLibrarySensitive = false; resetMeetingFilters(); renderMeetingLibrary(); switchView('meeting-library'); target = $('#meetings-title');
    } else if (destination === 'players') {
      playerDetailOpen = false; render(); switchView('players'); target = $('#players-title');
    } else {
      $('#task-search').value = ''; $('#task-player').value = ''; $('#task-category').value = ''; $('#task-filter').value = destination; render(); switchView('tasks'); target = $('#tasks h2');
    }
    target.tabIndex = -1;
    target.focus({preventScroll: true});
    target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
  }
  if (e.target.closest('[data-new-meeting]')) newMeeting();
  const meetingTypeLink = e.target.closest('[data-library-type]');
  if (meetingTypeLink) { selectedMeetingId = null; meetingLibrarySensitive = false; resetMeetingFilters(); $('#meeting-type-filter').value = meetingTypeLink.dataset.libraryType; renderMeetingLibrary(); switchView('meeting-library'); $('#meetings-title').focus(); }
  const meetingLink = e.target.closest('[data-open-meeting]'); if (meetingLink) openMeeting(meetingLink.dataset.openMeeting);
  const tab = e.target.closest('[data-view]'); if (tab) { if (tab.dataset.view === 'meeting-library') { selectedMeetingId = null; meetingLibrarySensitive = false; renderMeetingLibrary(); } if (tab.dataset.view === 'players') { playerDetailOpen = false; cancelPrep(); render(); } switchView(tab.dataset.view); }
  const targetPlayer = e.target.closest('[data-player],[data-open-player]');
  if (targetPlayer) openPlayerTimeline(targetPlayer.dataset.player || targetPlayer.dataset.openPlayer);
  const selectedRow = e.target.closest('[data-select-player]');
  if (selectedRow && !targetPlayer) { selectedPlayer = selectedRow.dataset.selectPlayer; cancelPrep(); render(); if (e.detail === 0) $(`.table-player[data-select-player="${selectedPlayer}"]`)?.focus({preventScroll:true}); }
  const action = e.target.closest('[data-item]');
  if (action && !busy) {
    try {
      action.disabled = true; busy = true;
      const meeting = meetings.find(m => m.id === action.dataset.meeting), item = meeting.items.find(i => i.id === action.dataset.item);
      const updated = await api(`/meetings/${encodeURIComponent(meeting.id)}/items/${encodeURIComponent(item.id)}`,{completed:!item.completed},'PATCH');
      meetings = meetings.map(m => m.id === updated.id ? updated : m); clearAssistant();
      cancelPrep(); render(); notify('Action status updated.');
    } catch (error) { action.disabled = false; notify(error.message,true); }
    finally { busy = false; $('#extract').disabled = !connected; $('#review-meeting').disabled = !connected; renderActionBoard(); }
  }
});
document.addEventListener('click', e => {
  const filters = $('.action-more-filters');
  if (filters.open && !filters.contains(e.target)) filters.open = false;
});
document.addEventListener('keydown', e => {
  const filters = $('.action-more-filters');
  if (e.key === 'Escape' && filters.open) {
    const focusWasInside = filters.contains(document.activeElement);
    filters.open = false;
    if (focusWasInside) filters.querySelector('summary').focus();
  }
});
$('.action-status-tabs').addEventListener('click', e => { const button = e.target.closest('[data-action-status]'); if (button) { $('#task-filter').value = button.dataset.actionStatus; renderActionBoard(); } });
$('#task-filter').addEventListener('change', () => renderActionBoard());
$('#task-search').addEventListener('input', () => renderActionBoard());
['#task-player','#task-category','#task-sort'].forEach(id => $(id).addEventListener('change', () => renderActionBoard()));
$('#reset-task-filters').addEventListener('click', () => { $('#show-sensitive-actions').checked = false; $('#task-filter').value = 'open'; $('#task-search').value = ''; $('#task-player').value = ''; $('#task-category').value = ''; $('#task-sort').value = 'due'; renderActionBoard(); });
$('#show-sensitive').addEventListener('change',render);
$('#show-sensitive-actions').addEventListener('change',render);
$('#mode').addEventListener('change', e => {
  if (busy) { e.target.value = mode; return; }
  mode = e.target.value; reviewingNoteOnly = false;
  clearAssistant();
  const url = new URL(window.location.href); url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', url);
  draft = []; extractionId = null; extractionWarnings = []; cancelPrep(); renderReview(); render();
  if (!connected) { initializeNotebook(); return; }
  showModeAlert(`${mode === 'demo' ? 'Demo' : 'Live'} extraction enabled. Saved records unchanged.`);
});
$('#prep').addEventListener('click', () => {
  cancelPrep();
  const records = items().filter(i => appliesTo(i,selectedPlayer) && !i.sensitive);
  if (!records.length) { notify('No non-sensitive approved records are available for this player.',true); return; }
  if (mode === 'demo') {
    $('#prep-text').innerHTML = formatBrief(`## Preparation checklist\n\nDemo · Application-generated checklist, not Aivana output.\n\n${records.map(i => `- **${i.kind[0].toUpperCase()+i.kind.slice(1)}** · ${i.meeting.date}: ${i.text}${i.kind === 'action' ? ` (${i.completed ? 'complete' : 'open'}${i.due_date ? `; due ${i.due_date}`:''})`:''}`).join('\n')}\n\n### Suggested discussion\n\nAsk the player for an update on open actions.`);
    return;
  }
  $('#prep').disabled = true; $('#prep-text').textContent = 'Connecting to Aivana…'; let content = '';
  prepSource = new EventSource(`/api/players/${encodeURIComponent(selectedPlayer)}/prep`);
  prepSource.addEventListener('delta', e => { try { content += JSON.parse(e.data).text || ''; $('#prep-text').innerHTML = formatBrief(content); } catch { notify('Unreadable preparation event.',true); prepSource?.close(); $('#prep').disabled = false; } });
  prepSource.addEventListener('done', e => { const data = JSON.parse(e.data); prepSource?.close(); prepSource = null; $('#prep').disabled = false; if (data.finish_reason === 'length') notify('The brief was cut short. Treat this as an incomplete draft.',true); });
  prepSource.addEventListener('error', e => { let message = 'Preparation stream failed. Check your backend, key, balance, and connection.'; try { message = JSON.parse(e.data).message || message; } catch {} notify(message,true); prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').innerHTML = formatBrief(content || 'No brief was generated.'); });
});
function assistantPlayerIds() {
  return assistantScope === 'team' ? demo.players.map(p => p.id) : assistantScope === 'group'
    ? [...document.querySelectorAll('[name="assistant-member"]:checked')].map(el => el.value)
    : [$('#assistant-player').value].filter(Boolean);
}
function updateAssistantScope() {
  document.querySelectorAll('[data-assistant-scope]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.assistantScope === assistantScope)));
  $('#assistant-individual-context').hidden = assistantScope !== 'individual';
  $('#assistant-group-context').hidden = assistantScope !== 'group';
  $('#assistant-team-context').hidden = assistantScope !== 'team';
  const ids = assistantPlayerIds();
  $('#assistant-selection-summary').textContent = assistantScope === 'individual'
    ? ids.length ? `Individual · ${name(ids[0])}` : 'Choose a player to begin.'
    : `${assistantScope === 'team' ? 'Team' : 'Group'} · ${ids.length} players${assistantScope === 'group' && ids.length < 2 ? ' · Select at least two' : ''}`;
}
document.querySelector('.assistant-scope-picker').addEventListener('click', e => {
  const button = e.target.closest('[data-assistant-scope]');
  if (!button || assistantPending) return;
  assistantScope = button.dataset.assistantScope; updateAssistantScope(); clearAssistant();
});
$('#assistant-position-group').addEventListener('change', e => {
  if (!e.target.value) return;
  document.querySelectorAll('[name="assistant-member"]').forEach(el => el.checked = player(el.value).position_group === e.target.value);
  updateAssistantScope(); clearAssistant();
});
$('#assistant-clear-group').addEventListener('click', () => {
  document.querySelectorAll('[name="assistant-member"]').forEach(el => el.checked = false);
  $('#assistant-position-group').value = ''; updateAssistantScope(); clearAssistant();
});
function clearAssistant() {
  assistantRevision++; assistantResult = null;
  $('#assistant-answer').innerHTML = '<div class="assistant-welcome"><span class="assistant-emblem">' + icon('chat') + '</span><h3>What would you like to revisit?</h3><p>Choose Individual, Group, or Team, then ask about documented feedback, actions, or your next meeting. Answers link back to saved records.</p></div>';
  $('#assistant-error').hidden = true;
}
function resetAssistantFilters() {
  assistantActionCategory = ''; $('#assistant-inherited-category').hidden = true;
  for (const key of ['skill','topic','start','end','search','meeting-type']) $(`#assistant-${key}`).value = '';
  $('#assistant-status').value = 'all'; $('#assistant-actions').checked = false;
}
function openAssistant(playerId, fromActions = false) {
  if (assistantPending) { notify('Wait for the current assistant answer before changing its context.'); return; }
  resetAssistantFilters(); clearAssistant();
  assistantScope = fromActions && !playerId ? 'team' : 'individual';
  $('#assistant-player').value = playerId || (fromActions ? '' : selectedPlayer);
  updateAssistantScope();
  if (fromActions) {
    assistantActionCategory = $('#task-category').value;
    $('#assistant-inherited-category').textContent = `Action-board category: ${assistantActionCategory}`;
    $('#assistant-inherited-category').hidden = !assistantActionCategory;
    $('#assistant-status').value = $('#task-filter').value;
    $('#assistant-actions').checked = true; $('#assistant-search').value = $('#task-search').value;
  }
  $('#assistant-question').value = fromActions ? 'Which actions need follow-up?' : '';
  switchView('assistant'); $('#assistant-title').focus({preventScroll:true});
  $('#assistant-title').scrollIntoView({block:'start', behavior:'instant'});
  $('#assistant-question').focus({preventScroll:true});
}
document.addEventListener('click', e => {
  const entry = e.target.closest('[data-ask-player]');
  if (entry) openAssistant(entry.dataset.askPlayer);
});
$('#ask-actions').addEventListener('click', () => openAssistant($('#task-player').value, true));
$('#assistant-reset').addEventListener('click', () => { resetAssistantFilters(); clearAssistant(); });
$('#assistant-clear').addEventListener('click', clearAssistant);
$('.assistant-context').addEventListener('input', e => {
  if (e.target.name === 'assistant-member') $('#assistant-position-group').value = '';
  updateAssistantScope(); clearAssistant();
});
$('.assistant-prompts').addEventListener('click', e => {
  const prompt = e.target.closest('[data-assistant-prompt]');
  if (!prompt || assistantPending) return;
  $('#assistant-question').value = prompt.dataset.assistantPrompt;
  if (prompt.hasAttribute('data-assistant-actions')) { $('#assistant-actions').checked = true; $('#assistant-status').value = 'open'; }
  else { $('#assistant-actions').checked = false; $('#assistant-status').value = 'all'; }
  clearAssistant(); $('#assistant-question').focus();
});
$('#assistant-answer').addEventListener('click', e => {
  const citation = e.target.closest('[data-assistant-source]');
  if (citation) {
    const source = document.getElementById(`assistant-source-${citation.dataset.assistantSource}`);
    if (source) { source.closest('details').open = true; source.focus({preventScroll:true}); source.scrollIntoView({block:'nearest',behavior:'smooth'}); }
  }
  const recordLink = e.target.closest('[data-assistant-record]');
  if (recordLink && assistantResult) {
    const source = assistantResult.sources.find(s => s.source_id === recordLink.dataset.assistantRecord);
    if (!source) return;
    openPlayerTimeline(source.player_ids?.[0] || assistantResult.player_id);
    const record = document.getElementById(`record-${source.meeting_id}-${source.record_id}`);
    if (record) { record.querySelector('details').open = true; record.focus({preventScroll:true}); record.scrollIntoView({block:'center',behavior:'smooth'}); }
    else notify('This record is no longer visible. Reload the notebook to check its latest state.',true);
  }
});
$('#assistant-form').addEventListener('submit', async e => {
  e.preventDefault(); if (assistantPending || !connected) return;
  const question = $('#assistant-question').value.trim(); if (!question) return;
  const selectedIds = assistantPlayerIds();
  if (selectedIds.length < (assistantScope === 'group' ? 2 : 1)) { $('#assistant-error').textContent = assistantScope === 'group' ? 'Select at least two players for this group.' : 'Choose a player for this question.'; $('#assistant-error').hidden = false; return; }
  const start = $('#assistant-start').value, end = $('#assistant-end').value;
  if (start && end && start > end) { $('#assistant-error').textContent = 'From must be on or before Through.'; $('#assistant-error').hidden = false; return; }
  const selectionLabel = $('#assistant-selection-summary').textContent;
  const body = {scope:assistantScope, player_id:$('#assistant-player').value, player_ids:selectedIds, question, mode, filters: {
    meeting_type:$('#assistant-meeting-type').value,
    skill:$('#assistant-skill').value, topic:$('#assistant-topic').value, start, end,
    status:$('#assistant-status').value, actions_only:$('#assistant-actions').checked, search:$('#assistant-search').value, category:assistantActionCategory,
  }};
  clearAssistant(); const revision = assistantRevision; assistantPending = true;
  $('#assistant-answer').innerHTML = '<p class="assistant-loading" role="status">' + (mode === 'demo' ? 'Finding approved records…' : 'Finding relevant records and asking Aivana…') + '</p>';
  $('#assistant-answer').setAttribute('aria-busy','true');
  document.querySelectorAll('#assistant input, #assistant select, #assistant textarea, #assistant button').forEach(el => el.disabled = true);
  $('#mode').disabled = true;
  try {
    const result = await api('/assistant', body);
    if (revision !== assistantRevision) return;
    assistantResult = result;
    $('#assistant-answer').innerHTML = `<div class="assistant-question-bubble"><strong>${escape(selectionLabel)}</strong><p>${escape(question)}</p></div>` + assistantAnswerMarkup(result);
  } catch (error) {
    if (revision !== assistantRevision) return;
    $('#assistant-answer').innerHTML = '<p>No answer was generated. Your question is ready to retry.</p>';
    $('#assistant-error').textContent = error.message; $('#assistant-error').hidden = false;
  } finally {
    assistantPending = false; $('#assistant-answer').setAttribute('aria-busy','false');
    document.querySelectorAll('#assistant input, #assistant select, #assistant textarea, #assistant button').forEach(el => el.disabled = false);
    $('#mode').disabled = busy; $('#assistant-send').disabled = !connected;
  }
});
loadSample('individual'); $('#mode').value = mode; render(); switchView('desk');
async function initializeNotebook() {
  busy = true; $('#mode').disabled = true; render();
  notify('Loading the shared SQLite notebook…');
  try {
    let storage;
    try { storage = window.localStorage; } catch { /* SQLite works without browser storage. */ }
    const result = await loadSharedNotebook(api, storage);
    meetings = result.meetings; connected = true;
    const missingKey = mode === 'live' && !result.status.aivana_configured;
    notify(result.migrationError || (missingKey ? 'Notebook loaded. Configure backend/.env before live extraction; Demo needs no Aivana key.' : 'Notebook connected. Demo and Live share the same saved records.'), Boolean(result.migrationError || missingKey));
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#mode').disabled = false; render(); }
}
initializeNotebook();
