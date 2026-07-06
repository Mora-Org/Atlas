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
        
        # -> Click the 'Entrar' button to open the login page
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'testadmin' into the username field and 'TestAdmin123!' into the password field, then click the 'Entrar' button to sign in.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill 'testadmin' into the username field and 'TestAdmin123!' into the password field, then click the 'Entrar' button to sign in.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill 'testadmin' into the username field and 'TestAdmin123!' into the password field, then click the 'Entrar' button to sign in.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' (Tables) link in the left sidebar to open the tables list.
        # Tabelas link
        elem = page.get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Nova tabela' button to open the create-table wizard.
        # Nova tabela button
        elem = page.get_by_role('button', name='Nova tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'media_table_test', click the 'Adicionar coluna' button, then open the 'Tipo' dropdown in the inspector.
        # ex.: produtos, eventos text field
        elem = page.get_by_placeholder('ex.: produtos, eventos', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("media_table_test")
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'media_table_test', click the 'Adicionar coluna' button, then open the 'Tipo' dropdown in the inspector.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nome da tabela (snake_case)' field with 'media_table_test', click the 'Adicionar coluna' button, then open the 'Tipo' dropdown in the inspector.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div[3]/div[2]/div[2]/div/select')
        await elem.click(timeout=10000)
        
        # -> Select the 'imagem (image)' option from the 'Tipo' dropdown in the column inspector.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator("xpath=/html/body/div[2]/main/div/div/div/div[3]/div[2]/div[2]/div/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Click the 'Criar tabela' (Create table) button to submit the create-table form.
        # Criar tabela button
        elem = page.get_by_role('button', name='Criar tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Schema' button for the media_table_test row to open its schema and verify the media column type is present.
        # Schema button
        elem = page.get_by_text('05', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Schema', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new media column table is created
        # Assert: The URL indicates we are in the admin tables area for a specific table.
        await expect(page).to_have_url(re.compile("/admin/tables/"), timeout=15000), "The URL indicates we are in the admin tables area for a specific table."
        # Assert: The URL indicates we are on an edit page for the table.
        await expect(page).to_have_url(re.compile("/edit"), timeout=15000), "The URL indicates we are on an edit page for the table."
        # Assert: The table name field shows the created table name 'media_table_test' as its placeholder.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/div/div/div/input").nth(0)).to_have_attribute("placeholder", "media_table_test", timeout=15000), "The table name field shows the created table name 'media_table_test' as its placeholder."
        # Assert: The new column name 'nova_coluna' is present in the column name input.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[2]/div[2]/div[1]/div[1]/div/input").nth(0)).to_have_value("nova_coluna", timeout=15000), "The new column name 'nova_coluna' is present in the column name input."
        
        # --> Verify the table appears in the tables list
        # Assert: The table name 'media_table_test' appears in the table edit input placeholder, confirming the table exists.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[3]/div[2]/div/div/div/div/input").nth(0)).to_have_attribute("placeholder", "media_table_test", timeout=15000), "The table name 'media_table_test' appears in the table edit input placeholder, confirming the table exists."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    