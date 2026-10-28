import { chromium } from 'npm:playwright@1.61.1'

const origin = 'https://caddy:8443'
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.locator('#btn-start').click()
  await page.waitForFunction(() => {
    const b = (globalThis as any).BABYLON
    return document.querySelector('[data-status]')?.getAttribute('data-status') === 'active' &&
      (b?.Engine?.Instances?.[0]?.scenes?.[0]?.meshes?.length ?? 0) > 0
  }, null, { timeout: 30000 })
  if (await page.locator('#fatal-banner').count()) throw new Error(await page.locator('#fatal-banner').innerText())
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await browser.close()
}
