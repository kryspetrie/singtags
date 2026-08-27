import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TagPlayer from '../components/TagPlayer.vue'

const meta = {
  title: 'SingTags/TagPlayer',
  component: TagPlayer,
  tags: ['autodocs'],
  args: {
    parts: {
      lead: 'media/4011/lead.m4a',
      tenor: 'media/4011/tenor.m4a',
      bari: 'media/4011/bari.m4a',
      bass: 'media/4011/bass.m4a',
      mix: 'media/4011/mix.m4a',
    },
    baseUrl: '/sample-data/',
    title: 'Beautiful I Know',
    tagId: 4011,
  },
} satisfies Meta<typeof TagPlayer>

export default meta
type Story = StoryObj<typeof meta>

export const FullParts: Story = {}

export const NoAudio: Story = {
  args: {
    parts: {},
  },
}
