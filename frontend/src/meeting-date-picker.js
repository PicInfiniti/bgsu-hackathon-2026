// Adapted from coach-dashboard-redesign's Schedule year → month → day picker.
import { MONTHS, monthGrid, pad } from './calendar-math.js';

export function openMeetingDatePicker(anchor, current, today, onPick) {
  const dialog = document.createElement('dialog');
  dialog.className = 'meeting-date-picker';
  dialog.setAttribute('aria-label', 'Jump to a date');
  let year = Number(current.slice(0, 4)), month = Number(current.slice(5, 7));
  const render = () => {
    dialog.innerHTML = `<div class="picker-year"><button type="button" data-year="-1" aria-label="Previous year">‹</button><strong>${year}</strong><button type="button" data-year="1" aria-label="Next year">›</button></div>
      <div class="picker-months">${MONTHS.map((name, index) => `<button type="button" data-month="${index + 1}" aria-pressed="${month === index + 1}" aria-label="${name} ${year}">${name.slice(0, 3)}</button>`).join('')}</div>
      <div class="picker-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(day => `<span>${day}</span>`).join('')}${monthGrid(`${year}-${pad(month)}-01`).map(cell => cell.inMonth ? `<button type="button" data-date="${cell.date}" aria-label="${cell.date}" ${cell.date === today ? 'aria-current="date"' : ''}>${Number(cell.date.slice(8))}</button>` : '<span></span>').join('')}</div>
      <div class="picker-foot"><button type="button" data-date="${today}">Today</button><button type="button" data-date="${year}-${pad(month)}-01">Whole month</button><button type="button" data-close>Close</button></div>`;
  };
  const close = () => { dialog.close(); dialog.remove(); anchor.focus({ preventScroll: true }); };
  render(); document.body.append(dialog); dialog.showModal();
  const rect = anchor.getBoundingClientRect();
  dialog.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 308))}px`;
  dialog.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - dialog.getBoundingClientRect().height - 8))}px`;
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) { if (event.target === dialog) close(); return; }
    if (button.dataset.year) {
      year = Math.max(1000, Math.min(9999, year + Number(button.dataset.year)));
      render(); dialog.querySelector(`[data-year="${button.dataset.year}"]`).focus();
    } else if (button.dataset.month) {
      month = Number(button.dataset.month); render(); dialog.querySelector(`[data-month="${month}"]`).focus();
    } else if (button.dataset.date) { close(); onPick(button.dataset.date); }
    else if (button.hasAttribute('data-close')) close();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector(`[data-month="${month}"]`).focus();
}
