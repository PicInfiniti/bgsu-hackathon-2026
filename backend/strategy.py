"""Coach-authored strategy diagrams, isolated from approved meeting records and AI context."""
import json
import math
import uuid
from datetime import datetime, timezone

from .core import PLAYERS, valid_date, text

COLORS = {'#ff7a32', '#f5d56a', '#70d6e8', '#f4f3e8', '#cf9aff', '#ed7785'}
KINDS = {'route', 'pass', 'motion', 'block', 'zone', 'freehand', 'text'}


class StrategyConflict(ValueError):
    pass


def optional_text(value, name, limit):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f'{name} must be text with at most {limit} characters.')
    return value.strip()


def number(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}.')
    return value


def validate_board(raw):
    if not isinstance(raw, dict):
        raise ValueError('Strategy board must be an object.')
    result = {'title': text(raw.get('title'), 'Board title', 160), 'date': valid_date(raw.get('date'))}
    for key, values in [('mode', ('plan', 'review')), ('field_view', ('full', 'half'))]:
        if raw.get(key) not in values:
            raise ValueError(f'Choose a valid {key}.')
        result[key] = raw[key]
    for key, limit in [('opponent', 120), ('notes', 12000)]:
        result[key] = optional_text(raw.get(key, ''), key, limit)
    for key in ('show_los', 'snap'):
        if not isinstance(raw.get(key), bool):
            raise ValueError(f'{key} must be a boolean.')
        result[key] = raw[key]
    result['los'] = number(raw.get('los'), 'Line of scrimmage', 40, 1160)
    ball = raw.get('ball')
    if not isinstance(ball, dict):
        raise ValueError('Place a football on the board.')
    result['ball'] = {axis: number(ball.get(axis), 'Ball position', *bounds) for axis,bounds in [('x',(40,1160)),('y',(60,560))]}
    markers, drawings = raw.get('markers'), raw.get('drawings')
    if not isinstance(markers, list) or len(markers) > 22 or not isinstance(drawings, list) or len(drawings) > 100:
        raise ValueError('Use at most 22 players and 100 drawings per board.')
    seen, roster_seen, counts = set(), set(), {'home':0,'opponent':0}
    result['markers'], result['drawings'] = [], []
    def identifier(item):
        if not isinstance(item, dict):
            raise ValueError('Board objects must be objects.')
        value = text(item.get('id'), 'Object ID', 100)
        if value in seen:
            raise ValueError('Board object IDs must be unique.')
        seen.add(value)
        return value
    for marker in markers:
        item = {'id': identifier(marker)}
        side = marker.get('side')
        if side not in counts:
            raise ValueError('Choose our team or an imaginary opponent.')
        counts[side] += 1
        if counts[side] > 11:
            raise ValueError('Place at most 11 players per side.')
        pid = marker.get('player_id')
        if pid is not None and (not isinstance(pid,str) or pid not in PLAYERS or side != 'home' or pid in roster_seen):
            raise ValueError('Roster players must be unique and belong to our team.')
        if pid:
            roster_seen.add(pid)
        item.update(side=side, player_id=pid)
        for key, limit in [('label',12),('name',100),('role',30),('assignment',500)]:
            item[key] = optional_text(marker.get(key,''),key,limit)
        item['x'] = number(marker.get('x'), 'Player x', 40, 1160)
        item['y'] = number(marker.get('y'), 'Player y', 60, 560)
        item['angle'] = number(marker.get('angle',0), 'Player angle', -180,180)
        result['markers'].append(item)
    for drawing in drawings:
        item = {'id': identifier(drawing)}
        if drawing.get('kind') not in KINDS or drawing.get('color') not in COLORS:
            raise ValueError('Choose a valid drawing tool and color.')
        item.update(kind=drawing['kind'],color=drawing['color'],width=number(drawing.get('width'), 'Line width', 1,10),angle=number(drawing.get('angle',0),'Drawing angle',-180,180))
        item['text'] = optional_text(drawing.get('text',''),'Drawing label',300)
        points = drawing.get('points')
        minimum = 1 if item['kind'] == 'text' else 2
        if not isinstance(points,list) or not minimum <= len(points) <= 300:
            raise ValueError('Draw a valid line, zone or label with at most 300 points.')
        item['points'] = []
        for point in points:
            if not isinstance(point,list) or len(point) != 2:
                raise ValueError('Drawing points need x and y coordinates.')
            item['points'].append([number(point[0],'Drawing x',0,1200),number(point[1],'Drawing y',0,620)])
        if item['kind'] == 'text' and not item['text']:
            raise ValueError('Add text to the label.')
        result['drawings'].append(item)
    return result


def list_boards(store):
    with store.connect() as db:
        boards = [json.loads(row[0]) for row in db.execute('SELECT body FROM strategy_boards')]
    return [{k:b[k] for k in ('id','title','date','mode','opponent','updated_at','revision')} for b in sorted(boards,key=lambda b:b['updated_at'],reverse=True)]


def get_board(store, board_id):
    with store.connect() as db:
        row = db.execute('SELECT body FROM strategy_boards WHERE id=?',(board_id,)).fetchone()
    if row is None:
        raise KeyError(board_id)
    return json.loads(row[0])


def save_board(store, raw, board_id=None):
    board = validate_board(raw)
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        revision = 1
        if board_id:
            old = db.execute('SELECT revision FROM strategy_boards WHERE id=?',(board_id,)).fetchone()
            if old is None:
                raise KeyError(board_id)
            if type(raw.get('revision')) is not int or raw.get('revision') != old[0]:
                raise StrategyConflict('This board changed in another window. Save a copy or reload the saved board before updating it.')
            revision = old[0] + 1
        board.update(id=board_id or str(uuid.uuid4()),revision=revision,updated_at=datetime.now(timezone.utc).isoformat())
        if board_id:
            db.execute('UPDATE strategy_boards SET body=?, revision=? WHERE id=?',(json.dumps(board),revision,board_id))
        else:
            db.execute('INSERT INTO strategy_boards (id,body,revision) VALUES (?,?,?)',(board['id'],json.dumps(board),revision))
    return board
