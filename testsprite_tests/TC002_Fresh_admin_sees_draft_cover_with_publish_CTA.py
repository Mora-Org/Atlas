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
        
        # -> Click the 'Entrar no painel' button to open the login page and proceed to sign in as the master account.
        # Entrar no painel button
        elem = page.get_by_role('button', name='Entrar no painel', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the username field with 'puczaras', fill the password field with 'Zup Paras', and click the 'Entrar' button to sign in as the master account.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("puczaras")
        
        # -> Fill the username field with 'puczaras', fill the password field with 'Zup Paras', and click the 'Entrar' button to sign in as the master account.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Zup Paras")
        
        # -> Fill the username field with 'puczaras', fill the password field with 'Zup Paras', and click the 'Entrar' button to sign in as the master account.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Provisionar workspace' button to open the admin/workspace provisioning form so a new admin account can be created.
        # Provisionar workspace button
        elem = page.get_by_role('button', name='Provisionar workspace', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Username' field with a unique username (e.g. coverfresh_20260612_01), fill 'Senha inicial' with 'CoverFresh123!', and click the 'Provisionar' button to create the new admin account.
        # ex.: liana text field
        elem = page.get_by_placeholder('ex.: liana', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("coverfresh_20260612_01")
        
        # -> Fill the 'Username' field with a unique username (e.g. coverfresh_20260612_01), fill 'Senha inicial' with 'CoverFresh123!', and click the 'Provisionar' button to create the new admin account.
        # password field
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div[2]/div[2]/div[2]/div/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("CoverFresh123!")
        
        # -> Fill the 'Username' field with a unique username (e.g. coverfresh_20260612_01), fill 'Senha inicial' with 'CoverFresh123!', and click the 'Provisionar' button to create the new admin account.
        # Provisionar button
        elem = page.get_by_role('button', name='Provisionar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Sair' (logout) button in the top/right area to sign out so the login page appears for signing in as the new admin.
        # Sair button
        elem = page.get_by_role('button', name='Sair', exact=True)
        await elem.click(timeout=10000)
        
        # -> Sign in as the newly created admin 'coverfresh_20260612_01' by filling the username and password fields and clicking the 'Entrar' button on the login page.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("coverfresh_20260612_01")
        
        # -> Sign in as the newly created admin 'coverfresh_20260612_01' by filling the username and password fields and clicking the 'Entrar' button on the login page.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("CoverFresh123!")
        
        # -> Sign in as the newly created admin 'coverfresh_20260612_01' by filling the username and password fields and clicking the 'Entrar' button on the login page.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify section 'III · Edições publicadas' shows 'Nenhuma edição publicada ainda' with the link 'Publicar a primeira →'
        # Assert: The 'Publicar a primeira →' link is visible in the 'III · Edições publicadas' section.
        await expect(page.locator("xpath=/html/body/div[3]/main/div/div/div/div/div[3]/p/a").nth(0)).to_have_text("Publicar a primeira \u2192", timeout=15000), "The 'Publicar a primeira \u2192' link is visible in the 'III \u00b7 Edi\u00e7\u00f5es publicadas' section."
        
        # --> Verify the 'Pré-visualizar' and 'Copiar link' buttons are disabled
        # Assert: The 'Pré-visualizar' button is disabled (shows the 'Publique uma edição primeiro' tooltip).
        await expect(page.locator("xpath=/html/body/div[3]/main/div/div/div/header/div[2]/button[1]").nth(0)).to_have_attribute("title", "Publique uma edi\u00e7\u00e3o primeiro", timeout=15000), "The 'Pr\u00e9-visualizar' button is disabled (shows the 'Publique uma edi\u00e7\u00e3o primeiro' tooltip)."
        # Assert: The 'Copiar link' button is disabled (shows the 'Publique uma edição primeiro' tooltip).
        await expect(page.locator("xpath=/html/body/div[3]/main/div/div/div/header/div[2]/button[2]").nth(0)).to_have_attribute("title", "Publique uma edi\u00e7\u00e3o primeiro", timeout=15000), "The 'Copiar link' button is disabled (shows the 'Publique uma edi\u00e7\u00e3o primeiro' tooltip)."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    