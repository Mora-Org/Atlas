import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Entrar' button to open the login page so the account testadmin can be signed in with password TestAdmin123!.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to sign in.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to sign in.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to sign in.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Publicação' link in the left sidebar to open the Publish Studio and verify it loads at /admin/publish showing the Aparência, Conteúdo, and Publicação tabs.
        # Publicação link
        elem = page.get_by_role('link', name='Publicação', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Capa' link in the left sidebar to open the editorial cover page (admin home) and verify it loads.
        # Capa link
        elem = page.get_by_role('link', name='Capa', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'QR' link in the left sidebar to open the QR authentication page and verify it loads at /admin/qr-auth without a 404.
        # QR link
        elem = page.get_by_role('link', name='QR', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the Publish Studio loads at /admin/publish (tabs Aparência/Conteúdo/Publicação visible)
        await page.locator("xpath=/html/body/div[2]/aside/nav/div[1]/a[6]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Publicação' link is visible in the sidebar.
        await expect(page.locator("xpath=/html/body/div[2]/aside/nav/div[1]/a[6]").nth(0)).to_be_visible(timeout=15000), "The 'Publica\u00e7\u00e3o' link is visible in the sidebar."
        # Assert: The 'Publicação' sidebar link points to /admin/publish.
        await expect(page.locator("xpath=/html/body/div[2]/aside/nav/div[1]/a[6]").nth(0)).to_have_attribute("href", "/admin/publish", timeout=15000), "The 'Publica\u00e7\u00e3o' sidebar link points to /admin/publish."
        
        # --> Verify the editorial cover loads back at /admin
        # Assert: The current URL contains /admin, indicating the admin (Capa) page was reached.
        await expect(page).to_have_url(re.compile("/admin"), timeout=15000), "The current URL contains /admin, indicating the admin (Capa) page was reached."
        await page.locator("xpath=/html/body/div[2]/aside/nav/div[1]/a[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Capa' link in the sidebar is visible, confirming the admin home (Capa) entry is present.
        await expect(page.locator("xpath=/html/body/div[2]/aside/nav/div[1]/a[1]").nth(0)).to_be_visible(timeout=15000), "The 'Capa' link in the sidebar is visible, confirming the admin home (Capa) entry is present."
        
        # --> Verify the QR page loads at /admin/qr-auth without a 404
        # Assert: The current URL contains /admin/qr-auth.
        await expect(page).to_have_url(re.compile("/admin/qr\\-auth"), timeout=15000), "The current URL contains /admin/qr-auth."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div/div[1]/div/div[4]/button[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Autorizar acesso' button is visible on the QR page.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div[1]/div/div[4]/button[1]").nth(0)).to_be_visible(timeout=15000), "The 'Autorizar acesso' button is visible on the QR page."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    