import './styles/main.scss';
import { getHealth, previewTrip } from './services/api.js';

const form = document.querySelector('#trip-form');
const error = document.querySelector('#form-error');
const preview = document.querySelector('#preview');
const connection = document.querySelector('#connection');
const submit = form.querySelector('button[type="submit"]');
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

getHealth().then(() => {
  connection.textContent = 'Backend connected';
  connection.dataset.state = 'ready';
}).catch(() => {
  connection.textContent = 'Backend unavailable — start FastAPI to check a trip.';
  connection.dataset.state = 'error';
});

// Build text nodes so user input can never be interpreted as HTML.
function renderPreview(result) {
  const heading = document.createElement('h3');
  heading.className = 'trip-title';
  heading.textContent = `Away at ${result.trip.opponent}`;
  const list = document.createElement('dl');
  const rows = [
    ['Game date', result.trip.game_date],
    ['Travelers', result.total_travelers],
    ['Buses needed', result.buses_needed],
    ['Seats per bus', result.trip.seats_per_bus],
    ['Budget', currency.format(Number(result.trip.budget))],
    ['Departure', result.trip.departure_constraint],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    list.append(row);
  }
  const note = document.createElement('p');
  note.className = 'help';
  note.textContent = result.message;
  preview.replaceChildren(heading, list, note);
}

form.addEventListener('input', () => {
  preview.replaceChildren();
  const note = document.createElement('p');
  note.className = 'empty-state';
  note.textContent = 'Check your updated details to refresh the trip preview.';
  preview.append(note);
  error.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Checking…';
  form.setAttribute('aria-busy', 'true');
  const trip = Object.fromEntries(new FormData(form));
  for (const field of ['players', 'coaches', 'staff', 'seats_per_bus', 'room_occupancy']) {
    trip[field] = Number(trip[field]);
  }
  // Prevent edits during the request from making the returned preview stale.
  const inputs = [...form.querySelectorAll('input')];
  inputs.forEach((input) => { input.disabled = true; });
  try {
    renderPreview(await previewTrip(trip));
    connection.textContent = 'Backend connected';
    connection.dataset.state = 'ready';
  } catch (cause) {
    error.textContent = cause.message;
    error.hidden = false;
  } finally {
    inputs.forEach((input) => { input.disabled = false; });
    submit.disabled = false;
    submit.textContent = 'Check trip details';
    form.removeAttribute('aria-busy');
  }
});
