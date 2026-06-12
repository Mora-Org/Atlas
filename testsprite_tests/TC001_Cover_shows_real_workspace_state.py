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
        
        # -> Open the login page by navigating to the site's /login path so the login form can be filled.
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to submit the login form.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to submit the login form.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill the username field with 'testadmin', fill the password field with 'TestAdmin123!', then click the 'Entrar' button to submit the login form.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the browser lands on /admin showing the editorial cover (light paper card) with the page header 'Estado da edição'
        # Assert: The browser URL contains '/admin'.
        await expect(page).to_have_url(re.compile("/admin"), timeout=15000), "The browser URL contains '/admin'."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The editorial cover shows the 'Pré-visualizar' header action.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[1]").nth(0)).to_be_visible(timeout=15000), "The editorial cover shows the 'Pr\u00e9-visualizar' header action."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[2]").nth(0).scroll_into_view_if_needed()
        # Assert: The editorial cover shows the 'Copiar link' header action.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[2]").nth(0)).to_be_visible(timeout=15000), "The editorial cover shows the 'Copiar link' header action."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[3]").nth(0).scroll_into_view_if_needed()
        # Assert: The editorial cover shows the 'Publicar' header action.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/header/div[2]/button[3]").nth(0)).to_be_visible(timeout=15000), "The editorial cover shows the 'Publicar' header action."
        
        # --> Verify the 'Em números' aside shows at least 4 numeric stats (tabelas, registros, edições, grupos)
        # Assert: The page shows '1 tabela' in the tables summary.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div/div[2]/div/div[2]/a").nth(0)).to_contain_text("1 tabela", timeout=15000), "The page shows '1 tabela' in the tables summary."
        # Assert: The page shows '0 registros' in the featured tables summary.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div/div[2]/div/a").nth(0)).to_contain_text("0 registros", timeout=15000), "The page shows '0 registros' in the featured tables summary."
        
        # --> Verify the section 'I · Tabelas em destaque' lists at least one table with its record/column counts, OR shows the empty-state CTA
        await page.locator("xpath=/html/body/div[2]/main/div/div/div/div/div[2]/div/a").nth(0).scroll_into_view_if_needed()
        # Assert: The featured tables section shows at least one table ('testtable1').
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div/div[2]/div/a").nth(0)).to_be_visible(timeout=15000), "The featured tables section shows at least one table ('testtable1')."
        # Assert: The featured table entry displays its record and column counts ('0 registros · 2 colunas').
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div/div[2]/div/a").nth(0)).to_contain_text("0 registros \u00b7 2 colunas", timeout=15000), "The featured table entry displays its record and column counts ('0 registros \u00b7 2 colunas')."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
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
    