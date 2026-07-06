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
        
        # -> Open the login page (navigate to the site's Login page so the username and password fields are visible).
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button to submit the login form.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button to submit the login form.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button to submit the login form.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' link in the left sidebar to open the Tables page.
        # Tabelas link
        elem = page.get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ Nova tabela' (New table) button to open the create table wizard.
        # Nova tabela button
        elem = page.get_by_role('button', name='Nova tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'qa_table_20260706' into the 'Nome da tabela (snake_case)' field and click the 'Adicionar coluna' button to add a new column.
        # ex.: produtos, eventos text field
        elem = page.get_by_placeholder('ex.: produtos, eventos', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("qa_table_20260706")
        
        # -> Fill 'qa_table_20260706' into the 'Nome da tabela (snake_case)' field and click the 'Adicionar coluna' button to add a new column.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add a new column that will be changed to a media type.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Tipo' dropdown in the column inspector (the dropdown showing 'texto curto (string)') so media-type options become visible.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div[3]/div[2]/div[2]/div/select')
        await elem.click(timeout=10000)
        
        # -> Set the column 'Tipo' dropdown to 'imagem (image)' in the inspector.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator("xpath=/html/body/div[2]/main/div/div/div/div[3]/div[2]/div[2]/div/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Click the 'Criar tabela' button to create the table after confirming the SQL preview shows the new schema.
        # Criar tabela button
        elem = page.get_by_role('button', name='Criar tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Criar tabela' button to attempt to save the new table and observe whether the table is created or an error message appears.
        # Criar tabela button
        elem = page.get_by_role('button', name='Criar tabela', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' link in the left sidebar to open the Tables list and verify whether 'qa_table_20260706' appears.
        # Tabelas link
        elem = page.get_by_text('/', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Ver dados' button for qa_table_20260706 to open the table's data view and verify it loads.
        # Ver dados button
        elem = page.get_by_text('05', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Ver dados', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Esquema' link in the left sidebar to view the table schema and confirm one column is a media type (imagem/arquivo/anexo).
        # Esquema link
        elem = page.get_by_role('link', name='Esquema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'qa_table_20260706' schema card and confirm the card shows a 'nova_coluna' column with type 'image'.
        # qa_table_20260706
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/div/div/div/div/div[5]/div/div/div')
        await elem.click(timeout=10000)
        
        # -> Click the 'Ver dados' button on the qa_table_20260706 schema card to open the table's data view and verify it loads.
        # Ver dados button
        elem = page.get_by_role('button', name='Ver dados', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new table is listed
        # Assert: The page URL contains '/admin/data/qa_table_20260706', indicating the table's data view is open.
        await expect(page).to_have_url(re.compile("/admin/data/qa_table_20260706"), timeout=15000), "The page URL contains '/admin/data/qa_table_20260706', indicating the table's data view is open."
        # Assert: The table name 'qa_table_20260706' is visible on the page, confirming the new table is listed.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td").nth(0)).to_contain_text("qa_table_20260706", timeout=15000), "The table name 'qa_table_20260706' is visible on the page, confirming the new table is listed."
        
        # --> Verify the created table can be opened from the tables list
        # Assert: The browser is on the table data view URL for qa_table_20260706.
        await expect(page).to_have_url(re.compile("/admin/data/qa_table_20260706"), timeout=15000), "The browser is on the table data view URL for qa_table_20260706."
        # Assert: The page shows 'Nenhum registro em qa_table_20260706', confirming the table's data view is open.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td").nth(0)).to_have_text("Nenhum registro \nem qa_table_20260706\n.", timeout=15000), "The page shows 'Nenhum registro em qa_table_20260706', confirming the table's data view is open."
        await page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/thead/tr").nth(0).scroll_into_view_if_needed()
        # Assert: The table header row is visible, indicating the table's columns are displayed.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/thead/tr").nth(0)).to_be_visible(timeout=15000), "The table header row is visible, indicating the table's columns are displayed."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    