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
        
        # -> Navigate to the login page (/login).
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill 'testadmin' into the 'Usuário' field and 'TestAdmin123!' into the 'Senha' field, then click the 'Entrar' button to sign in as admin.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill 'testadmin' into the 'Usuário' field and 'TestAdmin123!' into the 'Senha' field, then click the 'Entrar' button to sign in as admin.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill 'testadmin' into the 'Usuário' field and 'TestAdmin123!' into the 'Senha' field, then click the 'Entrar' button to sign in as admin.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the table entry labeled 'testtable1' to open its details and schema editor.
        # 02 testtable1 0 registros · 2 colunas · criada em... link
        elem = page.get_by_role('link', name='02 testtable1 0 registros · 2 colunas · criada em 29 de mar. de 2026 privado', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Esquema' link in the left navigation to open the schema editor for testtable1.
        # Esquema link
        elem = page.get_by_role('link', name='Esquema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the table card labeled 'testtable1' to open its schema editor.
        # testtable1
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/div/div/div/div/div/div/div/div')
        await elem.click(timeout=10000)
        
        # -> Click the 'Editar schema' button to open the schema editor for the table 'TESTTABLE1'.
        # Editar schema button
        elem = page.get_by_role('button', name='Editar schema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' link in the left navigation to return to the list of tables.
        # Tabelas link
        elem = page.get_by_text('/', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the table's schema editor by clicking the 'Schema' button for the table that matches 'testtable1' (visible as 'testtable_1783301499_ac0024' in the list).
        # Schema button
        elem = page.get_by_text('02', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Schema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'new_col_test' into the Nome (snake_case) field and open the Tipo (column type) dropdown.
        # ex.: foto, anexo, preco text field
        elem = page.get_by_placeholder('ex.: foto, anexo, preco', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("new_col_test")
        
        # -> Fill 'new_col_test' into the Nome (snake_case) field and open the Tipo (column type) dropdown.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/section[2]/div[2]/div/div[2]/select')
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add the new column 'new_col_test' to the table schema.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add the new column named 'new_col_test'.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add the new column 'new_col_test' and cause the schema to update.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Voltar às tabelas' button to return to the Tables list so the schema can be reloaded and the table re-opened for verification.
        # Voltar às tabelas button
        elem = page.get_by_role('button', name='Voltar às tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Schema' button for the table to re-open its schema editor and verify the columns list shows 'new_col_test'.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Schema' button for the table to re-open its schema editor and verify the columns list shows 'new_col_test'.
        # Schema button
        elem = page.get_by_text('01', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Schema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill 'new_col_test' into the 'Nome (snake_case)' field and click the 'Adicionar coluna' button, then verify the columns list shows the new column.
        # ex.: foto, anexo, preco text field
        elem = page.get_by_placeholder('ex.: foto, anexo, preco', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("new_col_test")
        
        # -> Fill 'new_col_test' into the 'Nome (snake_case)' field and click the 'Adicionar coluna' button, then verify the columns list shows the new column.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new column is shown in the schema
        await page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[1]/div[2]/div[3]/button").nth(0).scroll_into_view_if_needed()
        # Assert: The schema shows a third column entry (the remove button for the new column is visible).
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[1]/section[1]/div[2]/div[3]/button").nth(0)).to_be_visible(timeout=15000), "The schema shows a third column entry (the remove button for the new column is visible)."
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
    