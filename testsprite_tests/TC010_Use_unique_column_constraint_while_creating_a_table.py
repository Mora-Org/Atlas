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
        
        # -> Click the 'Entrar' button in the header to open the login page.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the username and password fields and click the 'Entrar' button on the login form to sign in as admin.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill the username and password fields and click the 'Entrar' button on the login form to sign in as admin.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill the username and password fields and click the 'Entrar' button on the login form to sign in as admin.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' link in the left sidebar to open the Tables list page.
        # Tabelas link
        elem = page.get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Nova tabela' button to open the create table form.
        # Nova tabela button
        elem = page.get_by_role('button', name='Nova tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'test_unique_table', rename the column to 'unique_title', enable the 'Único' toggle, and click the 'Criar tabela' button.
        # ex.: produtos, eventos text field
        elem = page.get_by_placeholder('ex.: produtos, eventos', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("test_unique_table")
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'test_unique_table', rename the column to 'unique_title', enable the 'Único' toggle, and click the 'Criar tabela' button.
        # text field
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div[3]/div[2]/div/div/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("unique_title")
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'test_unique_table', rename the column to 'unique_title', enable the 'Único' toggle, and click the 'Criar tabela' button.
        # Único sem duplicatas button
        elem = page.get_by_role('button', name='Único sem duplicatas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'test_unique_table', rename the column to 'unique_title', enable the 'Único' toggle, and click the 'Criar tabela' button.
        # Criar tabela button
        elem = page.get_by_role('button', name='Criar tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Schema' button for the 'test_unique_table' entry to open its schema and verify the 'unique_title' column shows the unique constraint.
        # Schema button
        elem = page.get_by_text('04', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Schema', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the table is created
        # Assert: The table name input value equals 'test_unique_table', confirming the created table is open.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/div/div/div/input").nth(0)).to_have_value("test_unique_table", timeout=15000), "The table name input value equals 'test_unique_table', confirming the created table is open."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/button").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Excluir tabela' (Delete table) button is visible, confirming the table exists and its edit page is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/button").nth(0)).to_be_visible(timeout=15000), "The 'Excluir tabela' (Delete table) button is visible, confirming the table exists and its edit page is displayed."
        
        # --> Verify the new table is available in the tables list
        # Assert: The table name 'test_unique_table' appears on the table edit page (placeholder), confirming the table exists.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/div/div/div/input").nth(0)).to_have_attribute("placeholder", "test_unique_table", timeout=15000), "The table name 'test_unique_table' appears on the table edit page (placeholder), confirming the table exists."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    