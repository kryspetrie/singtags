/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SingTogetherView from './SingTogetherView.vue'
import SingTogetherPasteTitlesModal from '../components/SingTogetherPasteTitlesModal.vue'
import { useSingTogetherStore } from '../stores/singTogether'
import { useSnackbarStore } from '../stores/snackbar'
import { DEFAULT_MATCH_CRITERIA } from '../lib/singTogether/match'

function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(SingTogetherView, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  })
}

async function openAddPanel(w: ReturnType<typeof mountView>) {
  const btn = w.findAll('button').find((b) => b.text() === 'Add to Repertoire')
  expect(btn).toBeTruthy()
  await btn!.trigger('click')
  await flushPromises()
}

async function openQuickAddGroup(w: ReturnType<typeof mountView>) {
  await openAddPanel(w)
  const group = w.find('[aria-label="Quick add song"]')
  expect(group.exists()).toBe(true)
  return group
}

describe('SingTogetherView usability phases', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows Add to Repertoire and an Import submenu (clipboard + CSV)', async () => {
    const w = mountView()
    expect(w.find('[aria-label="Quick add song"]').exists()).toBe(false)
    expect(w.findAll('button').some((b) => b.text() === 'Add to Repertoire')).toBe(true)
    expect(w.findAll('button').some((b) => b.text() === 'More')).toBe(false)
    expect(w.findAll('button').some((b) => b.text() === 'Paste songs')).toBe(false)
    expect(w.findAll('button').some((b) => b.text() === 'Import CSV')).toBe(false)
    expect(w.findAll('button').some((b) => b.text() === 'Import')).toBe(true)
    expect(w.findAll('button').some((b) => b.text() === 'Clear')).toBe(false)
    expect(w.find('.repertoire-more-menu').exists()).toBe(false)
    expect(w.find('#repertoire-import-menu').exists()).toBe(false)

    await w.findAll('button').find((b) => b.text() === 'Import')!.trigger('click')
    expect(w.find('#repertoire-import-menu').exists()).toBe(true)
    expect(w.findAll('#repertoire-import-menu [role="menuitem"]').map((b) => b.text())).toEqual([
      'from Clipboard',
      'from CSV',
    ])
    expect(w.find('.empty-start').exists()).toBe(false)
    w.unmount()
  })

  it('opens Add to Repertoire as an inline panel under the toolbar', async () => {
    const empty = mountView()
    expect(empty.find('.quick-add-panel').exists()).toBe(false)
    const addBtn = empty.findAll('button').find((b) => b.text() === 'Add to Repertoire')!
    expect(addBtn.classes()).not.toContain('on')
    await openAddPanel(empty)
    expect(empty.find('#quick-add-panel').exists()).toBe(true)
    expect(addBtn.classes()).toContain('on')
    expect(addBtn.attributes('aria-pressed')).toBe('true')
    expect(empty.find('[aria-label="Add to repertoire"]').exists()).toBe(true)
    expect(empty.find('[aria-label="Quick add song"]').exists()).toBe(true)
    empty.unmount()

    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Already here')
    const withSongs = mount(SingTogetherView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    })
    expect(withSongs.find('.quick-add-panel').exists()).toBe(false)
    await openAddPanel(withSongs)
    expect(withSongs.find('.quick-add-panel').exists()).toBe(true)
    withSongs.unmount()
  })

  it('shows the My QR nudge once, then hides it until the repertoire is cleared', async () => {
    localStorage.clear()
    const w = mountView()
    const store = useSingTogetherStore()
    expect(w.find('.qr-nudge').exists()).toBe(false)
    store.addTitleOnlySong('Hello')
    await flushPromises()
    expect(w.find('.qr-nudge').exists()).toBe(true)
    expect(localStorage.getItem('singtags.singTogether.qrNudgeSeen.v2')).toBe('1')
    await w.find('.nudge-dismiss').trigger('click')
    await flushPromises()
    expect(w.find('.qr-nudge').exists()).toBe(false)
    w.unmount()

    const again = mountView()
    await flushPromises()
    // Repertoire + seen flag restored from localStorage — no second nudge.
    expect(useSingTogetherStore().songCount).toBeGreaterThan(0)
    expect(localStorage.getItem('singtags.singTogether.qrNudgeSeen.v2')).toBe('1')
    expect(again.find('.qr-nudge').exists()).toBe(false)

    useSingTogetherStore().clearSongs()
    await flushPromises()
    expect(localStorage.getItem('singtags.singTogether.qrNudgeSeen.v2')).toBeNull()
    useSingTogetherStore().addTitleOnlySong('Again')
    await flushPromises()
    expect(again.find('.qr-nudge').exists()).toBe(true)
    again.unmount()
  })

  it('keeps seven ghost chip slots stable while advancing Quick Add', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    const chips = () => group.findAll('.quick-chip')
    expect(chips().length).toBe(7)
    expect(chips().filter((c) => c.classes().includes('ghost')).length).toBe(7)
    expect(chips()[0]!.classes()).toContain('active')
    expect(chips().slice(1).every((c) => c.attributes('disabled') !== undefined)).toBe(true)

    await group.find('input[maxlength="200"]').setValue('Ghost Song')
    await flushPromises()
    expect(chips().length).toBe(7)
    expect(chips()[0]!.classes()).toContain('filled')

    await group.find('[aria-label="Next field"]').trigger('click')
    await flushPromises()
    expect(chips().length).toBe(7)
    expect(chips()[1]!.classes()).toContain('active')
    expect((chips()[0]!.element as HTMLButtonElement).disabled).toBe(false)
    expect((chips()[1]!.element as HTMLButtonElement).disabled).toBe(false)
    expect((chips()[2]!.element as HTMLButtonElement).disabled).toBe(true)
    expect((chips()[3]!.element as HTMLButtonElement).disabled).toBe(true)
    w.unmount()
  })

  it('Enter advances Quick Add; Shift+Enter commits the row', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    const titleInput = group.find('input[maxlength="200"]')
    await titleInput.setValue('Quick Song')
    await titleInput.trigger('keydown', { key: 'Enter', shiftKey: false })
    await flushPromises()

    const store = useSingTogetherStore()
    expect(store.songCount).toBe(0)
    expect(group.find('input[maxlength="80"]').exists()).toBe(true)

    await group.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    expect(store.songCount).toBe(1)
    expect(store.profile.songs[0]!.title).toBe('Quick Song')
    expect(store.profile.songs[0]!.parts).toEqual({})
    expect(w.text()).toContain('Quick Song')
    expect(w.text()).toContain('Incomplete')
    expect(w.find('[aria-label^="Remove"]').exists()).toBe(true)
    expect((group.find('input[maxlength="200"]').element as HTMLInputElement).value).toBe('')
    w.unmount()
  })

  it('parses AKAs from title with ; and commits via ✓ Add', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    const titleInput = group.find('input[maxlength="200"]')
    await titleInput.setValue('The First Hello; First Hello; Hello')
    await flushPromises()

    const pills = group.findAll('.title-pill')
    expect(pills.length).toBe(2)
    expect(pills[0]!.text()).toContain('The First Hello')
    expect(pills[0]!.classes()).toContain('primary')
    expect(pills[1]!.text()).toContain('First Hello')
    expect((titleInput.element as HTMLInputElement).value).toBe('Hello')

    await group.find('[aria-label="Add song"]').trigger('click')
    await flushPromises()

    const store = useSingTogetherStore()
    expect(store.songCount).toBe(1)
    expect(store.profile.songs[0]!.title).toBe('The First Hello')
    expect(store.profile.songs[0]!.altTitles).toEqual(['First Hello', 'Hello'])
    w.unmount()
  })

  it('locks title pill on ; and unlocks last pill on Backspace', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    const titleInput = group.find('input[maxlength="200"]')
    await titleInput.setValue('Locked Title')
    await titleInput.trigger('keydown', { key: ';' })
    await flushPromises()

    expect(group.findAll('.title-pill').length).toBe(1)
    expect(group.find('.title-pill').text()).toContain('Locked Title')
    expect((titleInput.element as HTMLInputElement).value).toBe('')

    await titleInput.setValue('Aka One')
    await titleInput.trigger('keydown', { key: ';' })
    await flushPromises()
    expect(group.findAll('.title-pill').length).toBe(2)

    await titleInput.trigger('keydown', { key: 'Backspace' })
    await flushPromises()
    expect(group.findAll('.title-pill').length).toBe(1)
    expect((titleInput.element as HTMLInputElement).value).toBe('Aka One')

    await titleInput.trigger('keydown', { key: 'Backspace' })
    // draft still has text — normal backspace; clear then unlock
    await titleInput.setValue('')
    await titleInput.trigger('keydown', { key: 'Backspace' })
    await flushPromises()
    expect(group.findAll('.title-pill').length).toBe(0)
    expect((titleInput.element as HTMLInputElement).value).toBe('Locked Title')
    w.unmount()
  })

  it('Tabs title → arranger → Tag → Know tenor? → skip to lead → rate → key', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    const titleInput = group.find('input[maxlength="200"]')
    await titleInput.setValue('Tab Song; Short Name')
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()

    expect(group.find('input[maxlength="80"]').exists()).toBe(true)

    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Catalog tag/i)

    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Know Tenor/i)
    const knowBtn = group.find('.quick-know-btn')
    expect(knowBtn.exists()).toBe(true)
    expect(knowBtn.classes()).not.toContain('on')
    expect(knowBtn.text()).toBe('')
    expect(group.find('input[type="checkbox"]').exists()).toBe(false)
    expect(group.find('input[type="radio"]').exists()).toBe(false)

    // Skip tenor (unchecked) → Know Lead?
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Know Lead/i)

    await group.find('.quick-know-btn').trigger('click')
    await flushPromises()
    expect(group.find('.quick-know-btn').classes()).toContain('on')
    expect(group.find('.quick-know-btn').text()).toBe('✓')

    // Checked → Rate how well
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Rate how well/i)
    expect(group.find('[role="slider"]').exists()).toBe(true)
    await group.find('[aria-label="3 stars"]').trigger('click')
    await flushPromises()

    // Skip bari, bass
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Know Bari/i)
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Know Bass/i)
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()

    expect(group.find('select').exists()).toBe(true)
    expect(group.text().toLowerCase()).toMatch(/key/)

    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text().toLowerCase()).toMatch(/voicing/)

    await group.find('[aria-label="Add song"]').trigger('click')
    await flushPromises()
    const store = useSingTogetherStore()
    expect(store.songCount).toBe(1)
    expect(store.profile.songs[0]!.title).toBe('Tab Song')
    expect(store.profile.songs[0]!.altTitles).toEqual(['Short Name'])
    expect(store.profile.songs[0]!.parts).toEqual({ lead: 3 })
    w.unmount()
  })

  it('icon Prev / Next move Quick Add on the same row', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    expect(group.find('.quick-add-row').exists()).toBe(true)
    expect(group.find('[aria-label="Previous field"]').text()).toBe('‹')
    expect(group.find('[aria-label="Next field"]').text()).toBe('›')
    expect(group.find('[aria-label="Add song"]').text()).toBe('✓')

    await group.find('input[maxlength="200"]').setValue('Nav Song')
    await group.find('[aria-label="Next field"]').trigger('click')
    await flushPromises()
    expect(group.find('input[maxlength="80"]').exists()).toBe(true)

    await group.find('[aria-label="Previous field"]').trigger('click')
    await flushPromises()
    expect(group.find('input[maxlength="200"]').exists()).toBe(true)
    expect((group.find('input[maxlength="200"]').element as HTMLInputElement).value).toBe(
      'Nav Song',
    )
    w.unmount()
  })

  it('arrow keys adjust part confidence on rate step', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    await group.find('input[maxlength="200"]').setValue('Star Song')
    // title → arranger → tag → tenor know
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.find('.quick-know-btn').trigger('click')
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.find('[role="slider"]').exists()).toBe(true)

    await group.trigger('keydown', { key: 'ArrowRight' })
    await group.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(group.find('[role="slider"]').attributes('aria-valuenow')).toBe('2')

    await group.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(group.find('[role="slider"]').attributes('aria-valuenow')).toBe('1')

    await group.find('[aria-label="Add song"]').trigger('click')
    await flushPromises()
    const store = useSingTogetherStore()
    expect(store.profile.songs[0]!.parts).toEqual({ tenor: 1 })
    w.unmount()
  })

  it('digits 0-5 set part rating; hover fills preview stars', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    await group.find('input[maxlength="200"]').setValue('Digit Song')
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.find('.quick-know-btn').trigger('click')
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()

    const stars = group.findAll('.quick-star')
    expect(stars.length).toBe(5)
    expect(stars.filter((s) => s.classes().includes('on')).length).toBe(0)

    await stars[3]!.trigger('pointerenter')
    await flushPromises()
    expect(stars.filter((s) => s.classes().includes('on')).length).toBe(4)

    await group.find('.quick-rate').trigger('pointerleave')
    await flushPromises()
    expect(stars.filter((s) => s.classes().includes('on')).length).toBe(0)

    await group.trigger('keydown', { key: '4' })
    await flushPromises()
    expect(group.find('[role="slider"]').attributes('aria-valuenow')).toBe('4')
    expect(stars.filter((s) => s.classes().includes('on')).length).toBe(4)

    await group.trigger('keydown', { key: '0' })
    await flushPromises()
    expect(group.find('[role="slider"]').attributes('aria-valuenow')).toBe('0')

    await group.trigger('keydown', { key: '5' })
    await flushPromises()
    await group.find('[aria-label="Add song"]').trigger('click')
    await flushPromises()
    const store = useSingTogetherStore()
    expect(store.profile.songs[0]!.parts).toEqual({ tenor: 5 })
    w.unmount()
  })

  it('Space toggles Know check square; default unchecked', async () => {
    const w = mountView()
    const group = await openQuickAddGroup(w)
    await group.find('input[maxlength="200"]').setValue('Space Song')
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    await group.trigger('keydown', { key: 'Tab', shiftKey: false })
    await flushPromises()
    expect(group.text()).toMatch(/Know Tenor/i)
    const btn = group.find('.quick-know-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).not.toContain('on')
    expect(btn.attributes('aria-pressed')).toBe('false')
    expect(group.find('input[type="checkbox"]').exists()).toBe(false)
    expect(group.find('input[type="radio"]').exists()).toBe(false)

    await group.trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(btn.attributes('aria-pressed')).toBe('true')
    expect(btn.classes()).toContain('on')
    expect(btn.text()).toBe('✓')

    await group.trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(btn.attributes('aria-pressed')).toBe('false')
    expect(btn.classes()).not.toContain('on')
    expect(btn.text()).toBe('')
    w.unmount()
  })

  it('expands and collapses song rows; Open/× use flat list actions', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Expand Me')
    await flushPromises()

    expect(w.find('.song-edit').exists()).toBe(false)
    const item = w.find('.list-row')
    expect(item.exists()).toBe(true)
    expect(item.classes()).not.toContain('expanded')
    expect(w.find('.row-remove').exists()).toBe(true)
    expect(w.find('.row-remove').text()).toBe('×')
    expect(w.find('details.song-item').exists()).toBe(false)

    await w.find('.row-link').trigger('click')
    await flushPromises()
    expect(w.find('.song-edit').exists()).toBe(true)
    expect(w.find('.list-row').classes()).toContain('expanded')

    await w.find('.row-link').trigger('click')
    await flushPromises()
    expect(w.find('.song-edit').exists()).toBe(false)
    expect(w.find('.list-row').classes()).not.toContain('expanded')
    w.unmount()
  })

  it('asks Are you sure? before deleting a song', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Do Not Drop')
    await flushPromises()
    expect(store.songCount).toBe(1)

    await w.find('.row-remove').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('.confirm-root')
    expect(dialog).toBeTruthy()
    expect(dialog!.textContent).toContain('Are you sure?')
    expect(store.songCount).toBe(1)

    const confirmBtn = dialog!.querySelector('.btn-danger') as HTMLButtonElement | null
    expect(confirmBtn).toBeTruthy()
    confirmBtn!.click()
    await flushPromises()
    expect(store.songCount).toBe(0)
    expect(document.querySelector('.confirm-root')).toBeNull()
    w.unmount()
  })

  it('Incomplete badge only for bare titles, not songs with meta or parts', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Bare Title')
    store.upsertSong({
      id: 'song-with-arranger',
      title: 'Has Arranger',
      arranger: 'Someone',
      parts: {},
    })
    store.upsertSong({
      id: 'song-with-parts',
      title: 'Has Parts',
      arranger: '',
      parts: { lead: 3 },
    })
    await flushPromises()

    const rows = w.findAll('.list-row')
    expect(rows.length).toBe(3)
    const bare = rows.find((r) => r.text().includes('Bare Title'))!
    const withArr = rows.find((r) => r.text().includes('Has Arranger'))!
    const withParts = rows.find((r) => r.text().includes('Has Parts'))!
    expect(bare.find('.row-badge.muted').text()).toBe('Incomplete')
    expect(withArr.find('.row-badge.muted').exists()).toBe(false)
    expect(withParts.find('.row-badge.muted').exists()).toBe(false)

    await w.findAll('button').find((b) => b.text().startsWith('Incomplete'))!.trigger('click')
    await flushPromises()
    expect(w.findAll('.list-row').length).toBe(1)
    expect(w.text()).toContain('Bare Title')
    expect(w.text()).not.toContain('Has Arranger')
    w.unmount()
  })

  it('sorts repertoire by title and supports multi-select delete', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.upsertSong({ id: 'b', title: 'Bravo', arranger: '', parts: {} })
    store.upsertSong({ id: 'a', title: 'Alpha', arranger: '', parts: {} })
    store.upsertSong({ id: 'c', title: 'Charlie', arranger: '', parts: {} })
    await flushPromises()

    const titles = () => w.findAll('.list-row .title-text').map((n) => n.text())
    expect(titles()).toEqual(['Bravo', 'Alpha', 'Charlie'])

    await w.find('select[aria-label="Sort repertoire"]').setValue('title-asc')
    await flushPromises()
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(w.find('.drag-handle').exists()).toBe(false)

    await w.find('select[aria-label="Sort repertoire"]').setValue('custom')
    await flushPromises()
    expect(w.find('.drag-handle').exists()).toBe(true)

    const rows = w.findAll('.list-row')
    expect(rows[0]!.find('.sel-btn').exists()).toBe(true)
    await rows[0]!.find('.sel-btn').trigger('click')
    await rows[1]!.find('.sel-btn').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.selection-bar')?.textContent).toMatch(/2 selected/)

    await Array.from(document.body.querySelectorAll('.selection-bar button'))
      .find((b) => b.getAttribute('aria-label') === 'Delete selected')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const dialog = document.querySelector('.confirm-root')
    expect(dialog?.textContent).toMatch(/remove 2 songs/i)
    ;(dialog!.querySelector('.btn-danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(store.songCount).toBe(1)
    expect(store.profile.songs[0]!.title).toBe('Charlie')
    expect(document.body.querySelector('.selection-bar')).toBeNull()
    w.unmount()
  })

  it('supports repertoire collections and custom reorder', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.upsertSong({ id: '1', title: 'One', arranger: '', parts: {} })
    store.upsertSong({ id: '2', title: 'Two', arranger: '', parts: {} })
    store.upsertSong({ id: '3', title: 'Three', arranger: '', parts: {} })
    const col = store.createCollection('Contest', ['3', '1'])
    expect(col).toBeTruthy()
    await flushPromises()

    expect(w.find('.collection-bar').exists()).toBe(true)
    await w
      .findAll('button.chip')
      .find((b) => b.text().includes('Contest'))!
      .trigger('click')
    await flushPromises()
    expect(w.findAll('.list-row .title-text').map((n) => n.text())).toEqual(['Three', 'One'])

    store.reorderSong('1', 0, col!.id)
    await flushPromises()
    expect(w.findAll('.list-row .title-text').map((n) => n.text())).toEqual(['One', 'Three'])
    w.unmount()
  })

  it('opens paste modal from Import → clipboard and imports CSV-shaped rows', async () => {
    const w = mountView()
    await w.findAll('button').find((b) => b.text() === 'Import')!.trigger('click')
    await flushPromises()
    await w
      .findAll('#repertoire-import-menu [role="menuitem"]')
      .find((b) => b.text() === 'from Clipboard')!
      .trigger('click')
    await flushPromises()

    const title = document.body.querySelector('#st-paste-songs-title')
    expect(title?.textContent).toMatch(/Paste songs/i)
    expect(document.body.textContent).toMatch(/Column order/i)

    await Array.from(document.body.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === '+ arranger')!
      .click()
    await flushPromises()

    const textarea = document.body.querySelector('textarea.titles-input') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    textarea.value = 'Song One,Alice\nSong Two,Bob'
    textarea.dispatchEvent(new Event('input'))
    await flushPromises()
    Array.from(document.body.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Add')!
      .click()
    await flushPromises()

    const store = useSingTogetherStore()
    const snackbar = useSnackbarStore()
    expect(store.songCount).toBe(2)
    expect(store.profile.songs[0]!.title).toBe('Song One')
    expect(store.profile.songs[0]!.arranger).toBe('Alice')
    expect(store.profile.songs[1]!.arranger).toBe('Bob')
    expect(w.text()).toContain('Song One')
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('Next: open My QR')
    expect(snackbar.actionLabel).toBe('Show my QR')
    expect(snackbar.message ?? '').toMatch(/Added 2 songs/i)

    snackbar.runAction()
    await flushPromises()
    expect(w.find('[aria-label="My QR"]').isVisible()).toBe(true)
    expect(w.text()).not.toContain('Next: open My QR')
    w.unmount()
  })

  it('shows Host empty warning and hides sort until matches exist', async () => {
    const w = mountView()
    await w.findAll('button').find((b) => b.text() === 'Scan for matches')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Add your songs on Repertoire first')
    expect(w.text()).not.toContain('Sort')
    expect(w.find('#match-options-panel').exists()).toBe(false)
    const optsBtn = w.findAll('button').find((b) => b.text() === 'Match options')!
    expect(optsBtn.attributes('aria-expanded')).toBe('false')
    await optsBtn.trigger('click')
    await flushPromises()
    expect(w.find('#match-options-panel').exists()).toBe(true)
    expect(optsBtn.attributes('aria-expanded')).toBe('true')
    w.unmount()
  })

  it('uses title-only Host match defaults', () => {
    expect(DEFAULT_MATCH_CRITERIA.arranger).toBe(false)
    expect(DEFAULT_MATCH_CRITERIA.voicing).toBe(false)
    expect(DEFAULT_MATCH_CRITERIA.parts).toBe(false)
    const w = mountView()
    void w
    w.unmount()
  })

  it('shows My QR capacity used as a percent', async () => {
    const w = mountView()
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Hello')
    await w.findAll('button').find((b) => b.text() === 'My QR')!.trigger('click')
    await flushPromises()
    expect(w.find('details.qr-size').exists()).toBe(false)
    expect(w.text()).toMatch(/QR capacity used:\s*\d+%/)
    expect(
      (w.find('input[autocomplete="nickname"]').element as HTMLInputElement).placeholder,
    ).toMatch(/shown when scanned/i)
    w.unmount()
  })
})

describe('SingTogetherPasteTitlesModal', () => {
  it('exposes sticky Add actions and Paste songs title', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(SingTogetherPasteTitlesModal, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    expect(document.body.querySelector('.sticky-actions')).toBeTruthy()
    expect(document.body.querySelector('#st-paste-songs-title')?.textContent).toMatch(/Paste songs/i)
    w.unmount()
  })
})
