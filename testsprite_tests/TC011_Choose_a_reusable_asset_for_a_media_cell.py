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
        
        # -> Open the Login page (click the 'Entrar' / go to the Login page) so credentials can be entered.
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button.
        # seu.usuario text field
        elem = page.get_by_placeholder('seu.usuario', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testadmin")
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button.
        # •••••••• password field
        elem = page.get_by_placeholder('••••••••', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestAdmin123!")
        
        # -> Fill 'testadmin' into the Usuário field, fill 'TestAdmin123!' into the Senha field, and click the 'Entrar' button.
        # Entrar button
        elem = page.get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'testtable1' table link to open its Data Viewer.
        # 02 testtable1 0 registros · 2 colunas · criada em... link
        elem = page.get_by_role('link', name='02 testtable1 0 registros · 2 colunas · criada em 29 de mar. de 2026 privado', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Tabelas' link in the left sidebar to open the Tables list and inspect the schema for testtable1.
        # Tabelas link
        elem = page.get_by_text('Conteúdo', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Schema' (Editar schema) button for testtable1 to open the table schema editor and inspect its columns.
        # Schema button
        elem = page.get_by_text('01', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Schema', exact=True)
        await elem.click(timeout=10000)
        
        # -> Enter 'foto' into the new column Name field and open the 'Tipo' (Type) dropdown so the media type options appear.
        # ex.: foto, anexo, preco text field
        elem = page.get_by_placeholder('ex.: foto, anexo, preco', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("foto")
        
        # -> Enter 'foto' into the new column Name field and open the 'Tipo' (Type) dropdown so the media type options appear.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/section[2]/div[2]/div/div[2]/select')
        await elem.click(timeout=10000)
        
        # -> Select the Tipo dropdown option "imagem (image)" to make the new column a media (image) type.
        # inteiro ( integer ) decimal ( float ) texto curto... dropdown
        elem = page.locator("xpath=/html/body/div[2]/main/div/div/div/section[2]/div[2]/div/div[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("")
        
        # -> Click the 'Adicionar coluna' button to add the new media column named 'foto'.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add the new media column named 'foto' and verify the schema list updates.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Adicionar coluna' button to add the new media column 'foto' after ensuring the page scrolled so the control is visible.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Adicionar coluna' button to add the new media column 'foto' after ensuring the page scrolled so the control is visible.
        # Adicionar coluna button
        elem = page.get_by_role('button', name='Adicionar coluna', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Voltar às tabelas' link to return to the Tables list so the table entry and access can be re-checked.
        # Voltar às tabelas button
        elem = page.get_by_role('button', name='Voltar às tabelas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Ver dados' button for the 'media_table_test' table to open its Data Viewer.
        # Ver dados button
        elem = page.get_by_text('04', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Ver dados', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ Novo registro' button to create a new record in media_table_test.
        # Novo registro button
        elem = page.get_by_role('button', name='Novo registro', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Arquivo…' button in the new record row to open the media/library picker.
        # Arquivo… button
        elem = page.get_by_role('button', name='Arquivo…', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select the reusable asset named 'test.png' from the library picker.
        # test.png button
        elem = page.get_by_role('button', name='test.png', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Salvar' button to save the new record so the selected reusable asset is persisted in the media cell.
        # Salvar button
        elem = page.get_by_role('button', name='Salvar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Salvar' button to save the new record so the selected reusable asset is persisted.
        # Salvar button
        elem = page.get_by_role('button', name='Salvar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Salvar' button in the new-record row to persist the selected asset and verify the saved record shows a media thumbnail/preview.
        # Salvar button
        elem = page.get_by_role('button', name='Salvar', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the selected asset is shown as the cell value
        # Assert: The media cell displays the selected asset link with the expected href.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td[4]/span/a").nth(0)).to_have_attribute("href", "http://localhost:8000/api/assets/dev/10/361d8850412f4806b17edaa377d489ea.png", timeout=15000), "The media cell displays the selected asset link with the expected href."
        
        # --> Verify the media preview or thumbnail is displayed
        await page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td[4]/span/a").nth(0).scroll_into_view_if_needed()
        # Assert: The media thumbnail link is visible in the media cell.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td[4]/span/a").nth(0)).to_be_visible(timeout=15000), "The media thumbnail link is visible in the media cell."
        # Assert: The thumbnail link points to the expected asset URL.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div[2]/div/table/tbody/tr/td[4]/span/a").nth(0)).to_have_attribute("href", "http://localhost:8000/api/assets/dev/10/361d8850412f4806b17edaa377d489ea.png", timeout=15000), "The thumbnail link points to the expected asset URL."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    