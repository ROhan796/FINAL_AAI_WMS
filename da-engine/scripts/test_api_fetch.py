import asyncio
import httpx
import os
from dotenv import load_dotenv
load_dotenv()

async def test():
    api_key = os.environ.get("NSCBI_API_KEY", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {"X-API-KEY": api_key}
        # Test list files
        resp = await client.get("https://api.nscbiairport.com/api/files", headers=headers, params={"device_id": "Intern-pico-01", "limit": 5})
        print(f"List files status: {resp.status_code}")
        data = resp.json()
        print(f"Success: {data.get('success')}")
        print(f"Files returned: {len(data.get('data', []))}")
        if data.get("data"):
            print(f"First file: {data['data'][0]['filename']}")

            # Test download
            fname = data["data"][0]["filename"]
            resp2 = await client.get(f"https://api.nscbiairport.com/api/files/{fname}", headers=headers)
            print(f"Download status: {resp2.status_code}")
            content = resp2.json()
            print(f"Downloaded keys: {list(content.keys())}")
            print(f"Content: {content}")

asyncio.run(test())
