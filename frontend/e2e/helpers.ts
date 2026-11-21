import { expect, type Page } from '@playwright/test'

export async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with demo account' }).click()
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
}

export async function openJob(page: Page, title = 'Senior Frontend Engineer') {
  await signIn(page)
  await page.getByRole('link', { name: title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}
