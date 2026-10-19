"""Capture README screenshots of DevFlow (headless)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path(__file__).resolve().parent.parent / "docs"
OUT.mkdir(exist_ok=True)

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    page = ctx.new_page()

    # 1. Landing
    page.goto(BASE, wait_until="networkidle")
    page.screenshot(path=str(OUT / "screenshot-landing.png"), full_page=True)
    print("landing ok:", page.title())

    # 2. Login as demo
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", "demo@devflow.app")
    page.fill("#password", "devflow123")
    page.click("button[type=submit]")
    page.wait_for_url("**/board", timeout=15000)
    # Client-side fetch must finish before we count/capture
    page.wait_for_selector(".column", timeout=15000)
    page.wait_for_selector(".task-card", timeout=15000)
    page.wait_for_timeout(300)

    # Ensure the demo board has enough cards to look alive
    cards = page.locator(".task-card").count()
    print("board loaded, cards:", cards)

    # 3. Board (kanban) — tight viewport so the README crop looks clean
    page.set_viewport_size({"width": 1600, "height": 470})
    page.screenshot(path=str(OUT / "screenshot-board.png"), full_page=False)
    print("board ok:", page.url)

    # 4. Task modal open — shows the editor UI
    if cards:
        page.set_viewport_size({"width": 1600, "height": 780})
        page.locator(".task-card").first.click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "screenshot-modal.png"), full_page=False)
        print("modal ok")

    browser.close()

for f in sorted(OUT.glob("*.png")):
    print(f.name, f.stat().st_size, "bytes")
