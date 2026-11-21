import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.config import load_environment


class ConfigTests(unittest.TestCase):
    def test_file_loads_literal_values_without_overriding_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_text('AIVANA_API_KEY=local-placeholder\nCOACH_DB_PATH="${HOME}/literal.sqlite3"\n')
            with patch.dict(os.environ, {}, clear=True):
                load_environment(path)
                self.assertEqual(os.environ['AIVANA_API_KEY'], 'local-placeholder')
                self.assertEqual(os.environ['COACH_DB_PATH'], '${HOME}/literal.sqlite3')
            with patch.dict(os.environ, {'AIVANA_API_KEY': 'exported-placeholder'}, clear=True):
                load_environment(path)
                self.assertEqual(os.environ['AIVANA_API_KEY'], 'exported-placeholder')

    def test_isolated_env_path_prevents_loading_private_default(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'absent.env'
            with patch.dict(os.environ, {'COACH_ENV_FILE': str(path)}, clear=True):
                load_environment()
                self.assertNotIn('AIVANA_API_KEY', os.environ)
