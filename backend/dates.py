"""Conservative, deterministic deadlines relative to the supplied meeting date."""
from datetime import date, timedelta
import re

WEEKDAYS = {name: i for i, name in enumerate(('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'))}


def _resolve_deadline(phrase, stated_date, meeting_date, source):
    base = date.fromisoformat(meeting_date)
    warning = None
    if phrase is not None and (not isinstance(phrase, str) or len(phrase) > 160):
        return None, 'Invalid deadline phrase; set the date manually.'
    value = (phrase or '').strip()
    if value and re.sub(r'\s+', ' ', value.casefold()) not in re.sub(r'\s+', ' ', source.casefold()):
        return None, 'Deadline phrase is not in the source quote; review it.'
    normalized = re.sub(r'\s+', ' ', value.casefold()).strip(' .,:;')
    normalized = re.sub(r'^(?:due|by|before|on)\s+', '', normalized)
    resolved = None
    exact = re.fullmatch(r'\d{4}-\d{2}-\d{2}', normalized)
    if exact:
        try:
            resolved = date.fromisoformat(normalized)
        except ValueError:
            warning = 'Invalid calendar deadline; set it manually.'
    elif normalized in ('today', 'tomorrow'):
        resolved = base + timedelta(days=normalized == 'tomorrow')
    elif re.fullmatch(r'in \d{1,3} days?', normalized):
        resolved = base + timedelta(days=int(normalized.split()[1]))
    elif re.fullmatch(r'(?:next |this )?(?:' + '|'.join(WEEKDAYS) + ')', normalized):
        weekday = WEEKDAYS[normalized.split()[-1]]
        resolved = base + timedelta(days=(weekday - base.weekday()) % 7 or 7)
    elif value:
        warning = 'Ambiguous deadline; choose a date or leave it unspecified.'
    # A model-supplied date is evidence only when those exact digits are in the quote.
    if stated_date:
        if not isinstance(stated_date, str) or stated_date not in source:
            warning = 'Ignored a calendar date not explicitly present in the source.'
        else:
            try:
                explicit = date.fromisoformat(stated_date)
                if len(stated_date) != 10:
                    raise ValueError()
                if resolved and explicit != resolved:
                    warning = 'Conflicting deadline values; set the date manually.'
                    resolved = None
                elif not value or exact:
                    resolved = explicit
            except ValueError:
                warning = 'Invalid calendar deadline; set it manually.'
    if resolved and resolved < base:
        return None, 'Deadline precedes the meeting date; set it manually.'
    return resolved.isoformat() if resolved else None, warning


def resolve_deadline(phrase, stated_date, meeting_date, source):
    try:
        return _resolve_deadline(phrase, stated_date, meeting_date, source)
    except (OverflowError, ValueError):
        return None, 'Deadline cannot be resolved within the supported calendar; set it manually.'
