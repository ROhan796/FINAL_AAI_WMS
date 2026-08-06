import traceback
try:
    from app.api.router import router
    for r in router.routes:
        path = r.path
        methods = getattr(r, "methods", "N/A")
        print(f"{path} methods={methods}")
except Exception as e:
    traceback.print_exc()
