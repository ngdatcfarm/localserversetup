"""Download vendor libraries for offline use."""
import urllib.request
import os

VENDOR_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "vendor")
os.makedirs(VENDOR_DIR, exist_ok=True)

FILES = {
    "vue.global.prod.js": "https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js",
    "vue-router.global.prod.js": "https://unpkg.com/vue-router@4.5.0/dist/vue-router.global.prod.js",
    "tailwind.min.css": "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css",
}

print(f"Downloading to: {VENDOR_DIR}\n")
for fname, url in FILES.items():
    path = os.path.join(VENDOR_DIR, fname)
    try:
        print(f"  Downloading {fname}...", end=" ")
        urllib.request.urlretrieve(url, path)
        size = os.path.getsize(path)
        print(f"OK ({size:,} bytes)")
    except Exception as e:
        print(f"FAILED: {e}")

print("\nDone! Restart server to use local assets.")
