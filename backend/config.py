"""Load local backend settings without overriding the process environment."""
import os
from pathlib import Path

from dotenv import load_dotenv


def load_environment(env_file=None):
    path = env_file if env_file is not None else os.environ.get(
        'COACH_ENV_FILE', Path(__file__).with_name('.env'))
    # Explicit path avoids searching frontend/parent directories for secrets.
    # Values are literal: do not interpolate credentials containing ${...}.
    load_dotenv(path, override=False, interpolate=False)
