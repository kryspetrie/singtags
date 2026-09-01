/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CollectionsManageSheet from './CollectionsManageSheet.vue'
import { useUserCollectionsStore } from '../stores/userCollections'

function confirmActionButton(): HTMLButtonElement {
  return document.body.querySelector('.confirm-root .actions button:last-child') as HTMLButtonElement
}

describe('CollectionsManageSheet', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    wrapper = null
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('lists collections with reorder, rename, and new-collection controls', async () => {
    const store = useUserCollectionsStore()
    store.create('Alpha', [1])!
    store.create('Beta', [2, 3])!

    wrapper = mount(CollectionsManageSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const root = document.body
    expect(root.textContent).toMatch(/Manage collections/)
    expect(root.textContent).toMatch(/Alpha/)
    expect(root.textContent).toMatch(/Beta/)
    expect(root.querySelectorAll('.drag-handle')).toHaveLength(2)
    expect(root.querySelector('input[aria-label="New collection name"]')).toBeFalsy()
    expect(root.querySelector('input[aria-label="Collection name"]')).toBeFalsy()

    const newBtn = root.querySelector('.manage-footer button') as HTMLButtonElement
    expect(newBtn).toBeTruthy()
    newBtn.click()
    await flushPromises()
    expect(document.body.querySelector('input[aria-label="New collection name"]')).toBeTruthy()

    const renameBtn = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Rename')!
    renameBtn.click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/Rename “Alpha”/)
    expect(document.body.querySelector('input[aria-label="Collection name"]')).toBeTruthy()
  })

  it('creates a collection from the dialog and rejects duplicate names', async () => {
    const store = useUserCollectionsStore()
    store.create('Alpha', [1])!

    wrapper = mount(CollectionsManageSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const newBtn = document.body.querySelector('.manage-footer button') as HTMLButtonElement
    newBtn.click()
    await flushPromises()

    const input = document.body.querySelector(
      'input[aria-label="New collection name"]',
    ) as HTMLInputElement
    input.value = 'Alpha'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    confirmActionButton().click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/A collection with that name already exists/)
    expect(store.collections).toHaveLength(1)

    input.value = 'Contest set'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    confirmActionButton().click()
    await flushPromises()

    expect(store.collections).toHaveLength(2)
    expect(store.collections.some((c) => c.name === 'Contest set')).toBe(true)
  })

  it('rejects duplicate names when renaming', async () => {
    const store = useUserCollectionsStore()
    store.create('Alpha', [1])!
    store.create('Beta', [2])!

    wrapper = mount(CollectionsManageSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const renameBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Rename',
    ) as HTMLButtonElement
    renameBtn.click()
    await flushPromises()

    const input = document.body.querySelector('input[aria-label="Collection name"]') as HTMLInputElement
    input.value = 'Beta'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    confirmActionButton().click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/A collection with that name already exists/)
    expect(store.collections.some((c) => c.name === 'Alpha')).toBe(true)
  })

  it('deletes a collection after in-app confirmation', async () => {
    const store = useUserCollectionsStore()
    const col = store.create('To remove', [1])!

    wrapper = mount(CollectionsManageSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    const deleteBtn = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement
    deleteBtn.click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/Delete collection\?/)
    expect(store.byId(col.id)).toBeTruthy()

    confirmActionButton().click()
    await flushPromises()

    expect(store.byId(col.id)).toBeUndefined()
  })
})
