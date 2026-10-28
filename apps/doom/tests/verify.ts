/// <reference lib="dom" />

export const journeys = [{
  screen: 'arena',
  async run(page: any, ctx: { baseUrl: string }) {
    const response = await page.goto(`${ctx.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!response || response.status() !== 200) throw new Error('arena: navigation failed')
    await page.waitForFunction(() => {
      const shell = document.querySelector('#app .shell-screen:not([hidden])')
      const screen = shell?.querySelector('.screen[data-screen="arena"]')
      return !!screen && !shell?.hasAttribute('data-entering') &&
        !screen.querySelector('[data-hydrating], [data-state="loading"]')
    }, null, { timeout: 45000 })
    await page.locator('#btn-start').click({ timeout: 45000 })
    await page.waitForFunction(() => {
      const babylon = (globalThis as any).BABYLON
      return document.querySelector('[data-status]')?.getAttribute('data-status') === 'active' &&
        (babylon?.Engine?.Instances?.[0]?.scenes?.[0]?.meshes?.length ?? 0) > 0
    }, null, { timeout: 45000 })
    const fatal = page.locator('#fatal-banner')
    if (await fatal.count()) throw new Error(await fatal.innerText())
  },
}]
