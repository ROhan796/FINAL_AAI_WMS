import sys
sys.path.insert(0, '.')
from app.main import app
for route in app.routes:
    if hasattr(route, 'path'):
        methods = getattr(route, 'methods', 'N/A')
        print(f'{route.path} [{methods}]')
