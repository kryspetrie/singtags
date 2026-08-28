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
    years: [2024, 2020, 2015, 2010, 2000],
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
      yearMin: 2010,
      yearMax: 2020,
      arrangers: ['Paul Paddock'],
    },
  },
}
