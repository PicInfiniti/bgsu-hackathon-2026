"""Open tags: any tag text is allowed. Code only tidies it (lower-case, trim,
collapse spaces) and merges exact synonyms. Starter suggestions are never a limit."""
import re

# Exact synonyms only. Add pairs here or merge them on the Terms page later.
SYNONYMS = {
    'wide outs': 'receivers', 'wideouts': 'receivers', 'wrs': 'receivers', 'wide receivers': 'receivers',
    'dbs': 'defensive backs', 'secondary': 'defensive backs', 'oline': 'offensive line', 'o-line': 'offensive line', 'ol': 'offensive line',
    'dline': 'defensive line', 'd-line': 'defensive line', 'rz': 'red zone', 'redzone': 'red zone', 'route-running': 'route running',
    'ball-security': 'ball security', 'fumbles': 'ball security', 'pass pro': 'pass protection', 'pass pro.': 'pass protection',
    'special teams': 'special teams', 'st': 'special teams', 'footwork & agility': 'footwork', 'film study': 'film',
}
SUGGESTED = ['route running', 'red zone', 'ball security', 'footwork', 'pass protection', 'coverage', 'tackling', 'blocking',
             'decision-making', 'film', 'travel', 'academics', 'conditioning', 'leadership', 'special teams', 'third down', 'two-minute']
SENSITIVE_TAGS = re.compile(r'\b(injur\w*|health|medical|concussion|insurance|rehab|surgery|illness|doctor|trainer)\b', re.I)
MAX_TAGS = 3
MAX_TAG_LENGTH = 40


def clean_tag(value):
    if not isinstance(value, str):
        return None
    tag = re.sub(r'<[^>]*>', '', value)
    tag = re.sub(r'\s+', ' ', tag).strip(' .,;:#').lower()
    if not tag:
        return None
    tag = SYNONYMS.get(tag, tag)
    return tag[:MAX_TAG_LENGTH]


def clean_tags(values, limit=MAX_TAGS):
    if not isinstance(values, list):
        return []
    out = []
    for value in values:
        tag = clean_tag(value)
        if tag and tag not in out:
            out.append(tag)
    return out[:limit]


def is_sensitive(*texts):
    return any(SENSITIVE_TAGS.search(t or '') for t in texts)
