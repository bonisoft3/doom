import { chromium } from 'npm:playwright@1.61.1'
import { journeys } from './verify.ts'

const origin = 'https://caddy:8443'
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await journeys[0].run(page, { baseUrl: origin })
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await browser.close()
}
