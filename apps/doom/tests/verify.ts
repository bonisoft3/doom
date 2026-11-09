/// <reference lib="dom" />

export const journeys = [{
  screen: 'arena',
  async run(page: any, ctx: { baseUrl: string }) {
    const response = await page.goto(`${ctx.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!response || response.status() !== 200) throw new Error('arena: navigation failed')
    await page.waitForFunction(() => {
      const shell = document.querySelector('#app .shell-screen:not([hidden])')
      const screen = shell?.querySelector('.screen[data-screen="arena"]')
      const weapon = document.getElementById('doom-weapon-img') as HTMLImageElement | null
      const face = document.getElementById('doom-face-img') as HTMLImageElement | null
      const titleCard = document.getElementById('doom-title-card') as HTMLElement | null
      const babylon = (globalThis as any).BABYLON
      return !!screen && !shell?.hasAttribute('data-entering') &&
        !screen.querySelector('[data-hydrating], [data-state="loading"]') &&
        document.querySelector('body > nav') === null &&
        !!titleCard && !titleCard.hidden &&
        !!weapon && weapon.complete && weapon.naturalWidth > 0 &&
        !!face && face.complete && face.naturalWidth > 0 &&
        (babylon?.Engine?.Instances?.[0]?.scenes?.[0]?.meshes?.length ?? 0) > 0
    }, null, { timeout: 45000 })

    await page.locator('#menu-newgame').click({ timeout: 15000 })
    await page.waitForFunction(() => {
      const skillCard = document.getElementById('doom-skill-card') as HTMLElement | null
      return !!skillCard && !skillCard.hidden
    }, null, { timeout: 15000 })

    await page.locator('#doom-skill-card [data-skill="2"]').click({ timeout: 15000 })
    await page.waitForFunction(() => {
      const babylon = (globalThis as any).BABYLON
      const overlay = document.getElementById('doom-menu-overlay') as HTMLElement | null
      return document.querySelector('[data-status]')?.getAttribute('data-status') === 'active' &&
        !!overlay && overlay.hidden &&
        (babylon?.Engine?.Instances?.[0]?.scenes?.[0]?.meshes?.length ?? 0) > 0
    }, null, { timeout: 45000 })
    const fatal = page.locator('#fatal-banner')
    if (await fatal.count()) throw new Error(await fatal.innerText())
  },
}]
