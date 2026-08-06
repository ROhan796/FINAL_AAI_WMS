"""Debug the dashboard endpoint."""
import sys, os, traceback
sys.path.insert(0, '.')
os.chdir(r'C:\INTERNSHIP_TASK\TASK16\Fullstack_Unification\da-engine')

try:
    from app.api.dashboard import get_dashboard_summary
    import asyncio
    result = asyncio.run(get_dashboard_summary())
    print("SUCCESS!")
    print(f"Airport WHI: {result.get('airport_whi')}")
    print(f"Total washrooms: {result.get('total_washrooms')}")
    print(f"Critical: {result.get('critical_count')}")
except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()
