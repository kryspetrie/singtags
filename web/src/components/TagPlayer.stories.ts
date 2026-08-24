import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TagPlayer from '../components/TagPlayer.vue'

const meta = {
  title: 'SingTags/TagPlayer',
  component: TagPlayer,
  tags: ['autodocs'],
  args: {
    parts: {
      lead: 'media/4011/lead.mp4',
      tenor: 'media/4011/tenor.mp4',
      bari: 'media/4011/bari.mp4',
      bass: 'media/4011/bass.mp4',
      mix: 'media/4011/mix.mp4',
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
