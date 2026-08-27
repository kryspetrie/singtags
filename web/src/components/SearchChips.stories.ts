import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SearchChips from './SearchChips.vue'
import { EMPTY_FILTERS } from '../search/filters'

const meta = {
  title: 'SingTags/SearchChips',
  component: SearchChips,
  tags: ['autodocs'],
  args: {
    open: true,
    filters: { ...EMPTY_FILTERS },
    keys: ['C', 'G', 'Bb'],
    arrangers: ['Paul Paddock', 'Other'],
    types: ['Barbershop'],
    collections: [],
  },
} satisfies Meta<typeof SearchChips>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ActiveFilters: Story = {
  args: {
    filters: {
      ...EMPTY_FILTERS,
      hasSheet: true,
      minRating: 4,
      keys: ['Bb'],
      arrangers: ['Paul Paddock'],
    },
  },
}
