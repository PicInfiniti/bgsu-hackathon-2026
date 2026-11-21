"""Football extraction contract; enum values are shared with the vanilla UI."""
import json
from pathlib import Path

CATEGORIES = json.loads((Path(__file__).resolve().parents[1] / 'data/categories.json').read_text(encoding='utf-8'))
SENSITIVE_TOPICS = {'Health & Injury Follow-up', 'Insurance & Administration'}

SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['records', 'warnings'],
    'properties': {
        'records': {'type': 'array', 'maxItems': 80, 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['target', 'topic', 'skill', 'tags', 'details', 'feedback_type', 'feedback', 'action_item', 'source_text', 'confidence'],
            'properties': {
                'target': {'type': 'object', 'additionalProperties': False,
                           'required': ['scope', 'player_id', 'mention', 'match_method', 'group_label'],
                           'properties': {
                               'scope': {'type': 'string', 'enum': ['player', 'group', 'team']},
                               'player_id': {'type': ['string', 'null']},
                               'mention': {'type': 'string', 'maxLength': 160},
                               'match_method': {'type': 'string', 'enum': CATEGORIES['match_methods']},
                               'group_label': {'type': ['string', 'null']}}},
                # Open categories: topic and skill are optional free text, never a fixed list.
                'topic': {'type': ['string', 'null'], 'maxLength': 100},
                'skill': {'type': ['string', 'null'], 'maxLength': 100},
                'tags': {'type': 'array', 'maxItems': 3, 'items': {'type': 'string', 'maxLength': 40}},
                'details': {'type': ['string', 'null'], 'maxLength': 1000},
                'feedback_type': {'type': ['string', 'null'], 'enum': CATEGORIES['feedback_types'] + [None]},
                'feedback': {'type': ['string', 'null'], 'maxLength': 1000},
                # Aivana allows nullable scalar types, but not nullable objects.
                # No action is represented by an object containing null fields.
                'action_item': {'type': 'object', 'additionalProperties': False,
                                'required': ['task', 'deadline_text', 'deadline_date'], 'properties': {
                                    'task': {'type': ['string', 'null'], 'minLength': 1, 'maxLength': 1000},
                                    'deadline_text': {'type': ['string', 'null'], 'maxLength': 160},
                                    'deadline_date': {'type': ['string', 'null'],
                                                      'description': 'YYYY-MM-DD only when the source states an exact calendar date. Never calculate a relative date.'}}},
                'source_text': {'type': 'string', 'minLength': 1, 'maxLength': 2000},
                'confidence': {'type': 'string', 'enum': CATEGORIES['confidences']}}}},
        'warnings': {'type': 'array', 'items': {'type': 'string', 'maxLength': 500}}}}
